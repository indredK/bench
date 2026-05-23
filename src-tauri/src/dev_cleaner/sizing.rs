use super::rules::is_skip_dir_name;
use std::fs;
use std::path::Path;
#[cfg(any(all(unix, not(target_os = "macos")), windows))]
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use walkdir::WalkDir;

const ABORT_CHECK_MASK: usize = 31;

pub(super) fn get_last_modified(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(SystemTime::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

pub(super) fn calculate_dir_size(
    path: &Path,
    abort_flag: Option<&Arc<AtomicBool>>,
) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }

    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if is_skip_dir_name(name) {
            return get_dir_size_fast(path, abort_flag);
        }
    }

    let mut size = 0u64;
    let mut iter = WalkDir::new(path).into_iter();
    let mut counter: usize = 0;

    while let Some(entry_result) = iter.next() {
        if let Some(flag) = abort_flag {
            if (counter & ABORT_CHECK_MASK) == 0 && flag.load(Ordering::Relaxed) {
                return Ok(0);
            }
        }
        counter = counter.wrapping_add(1);

        let entry = match entry_result {
            Ok(e) => e,
            Err(_) => continue,
        };

        let name_str = entry.file_name().to_string_lossy();
        if entry.file_type().is_dir() && is_skip_dir_name(&name_str) {
            if let Ok(skip_size) = get_dir_size_fast(entry.path(), abort_flag) {
                size += skip_size;
            }
            iter.skip_current_dir();
            continue;
        }

        if entry.file_type().is_file() {
            if let Ok(metadata) = entry.metadata() {
                size += metadata.len();
            }
        }
    }

    Ok(size)
}

pub(super) fn get_dir_size_fast(
    path: &Path,
    abort_flag: Option<&Arc<AtomicBool>>,
) -> Result<u64, String> {
    if let Some(flag) = abort_flag {
        if flag.load(Ordering::Relaxed) {
            return Ok(0);
        }
    }

    // Linux: `du -sk --apparent-size` returns logical bytes, matching the
    // metadata.len() accounting used by calculate_dir_size. macOS BSD `du`
    // lacks --apparent-size, so we fall through to WalkDir there to keep
    // size accounting consistent between skip-dir and non-skip-dir paths.
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Ok(output) = Command::new("du")
            .args(["-sk", "--apparent-size", path.to_string_lossy().as_ref()])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(size_str) = stdout.split_whitespace().next() {
                    if let Ok(kb) = size_str.parse::<u64>() {
                        return Ok(kb * 1024);
                    }
                }
            }
        }
    }

    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW (0x08000000) keeps the PowerShell child from
        // briefly flashing a console window on the desktop every time we
        // size a directory (#032).
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = Command::new("powershell");
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            // -LiteralPath stops PowerShell from treating wildcards
            // (`?`, `*`, `[`) inside a project path as globs (#033).
            &format!(
                "((Get-ChildItem -Recurse -Force -ErrorAction SilentlyContinue -LiteralPath '{}' | Where-Object {{ -not $_.PSIsContainer }} | Measure-Object -Sum Length).Sum)",
                path.to_string_lossy().replace('\'', "''")
            ),
        ]);
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !stdout.is_empty() {
                    if let Ok(bytes) = stdout.parse::<u64>() {
                        return Ok(bytes);
                    }
                }
            }
        }
    }

    let mut size = 0u64;
    let mut counter: usize = 0;
    for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
        if let Some(flag) = abort_flag {
            if (counter & ABORT_CHECK_MASK) == 0 && flag.load(Ordering::Relaxed) {
                return Ok(0);
            }
        }
        counter = counter.wrapping_add(1);
        if let Ok(metadata) = entry.metadata() {
            if metadata.is_file() {
                size += metadata.len();
            }
        }
    }
    Ok(size)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_get_last_modified_existing_file() {
        let tmp = std::env::temp_dir().join("tauri_test_last_modified");
        fs::create_dir_all(&tmp).unwrap();
        let file_path = tmp.join("test.txt");
        fs::write(&file_path, "hello").unwrap();

        let ts = get_last_modified(&file_path);
        assert!(ts > 0);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_get_last_modified_missing_file() {
        let ts = get_last_modified(&PathBuf::from("/nonexistent/path/foobar"));
        assert_eq!(ts, 0);
    }

    #[test]
    fn test_calculate_dir_size_empty() {
        let tmp = std::env::temp_dir().join("tauri_test_empty_dir");
        fs::create_dir_all(&tmp).unwrap();

        let size = calculate_dir_size(&tmp, None).unwrap();
        assert_eq!(size, 0);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_calculate_dir_size_with_files() {
        let tmp = std::env::temp_dir().join("tauri_test_size_files");
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("a.txt"), "hello world").unwrap();
        fs::write(tmp.join("b.txt"), "foo bar baz").unwrap();

        let size = calculate_dir_size(&tmp, None).unwrap();
        assert!(size > 0);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_calculate_dir_size_nonexistent() {
        let size = calculate_dir_size(&PathBuf::from("/nonexistent/path/xyz"), None).unwrap();
        assert_eq!(size, 0);
    }

    #[test]
    fn test_calculate_dir_size_counts_nested_skip_dirs() {
        let tmp = std::env::temp_dir().join("tauri_test_nested_skip_dir");
        let _ = fs::remove_dir_all(&tmp);
        let nested = tmp
            .join("packages")
            .join("app")
            .join("node_modules")
            .join("some_pkg");
        fs::create_dir_all(&nested).unwrap();
        let payload = vec![0u8; 4096];
        fs::write(nested.join("big.bin"), &payload).unwrap();
        fs::write(tmp.join("packages").join("app").join("src.js"), "x").unwrap();

        let size = calculate_dir_size(&tmp, None).unwrap();
        assert!(
            size >= payload.len() as u64,
            "nested node_modules ({} bytes) was not counted in total size {}",
            payload.len(),
            size
        );

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_calculate_dir_size_aborts_promptly() {
        let tmp = std::env::temp_dir().join("tauri_test_abort_flag");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("a.txt"), "x").unwrap();

        let flag = Arc::new(AtomicBool::new(true));
        let size = calculate_dir_size(&tmp, Some(&flag)).unwrap();
        assert_eq!(size, 0, "aborted scan must return 0, got {}", size);

        let _ = fs::remove_dir_all(&tmp);
    }
}
