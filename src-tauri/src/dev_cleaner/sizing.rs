use super::rules::is_skip_dir_name;
#[cfg(unix)]
use std::collections::HashSet;
use std::fs;
use std::path::Path;
#[cfg(any(all(unix, not(target_os = "macos")), windows))]
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
#[cfg(any(all(unix, not(target_os = "macos")), windows))]
use std::time::Duration;
use walkdir::WalkDir;

const ABORT_CHECK_MASK: usize = 31;

// `du` / PowerShell child processes can hang on broken disks or unresponsive
// network mounts. The original `.output()` call had no upper bound, so a single
// stuck child froze the whole scan. We cap each child at a generous ceiling
// (well above any healthy run on typical local SSDs) and fall through to the
// in-process WalkDir on timeout (#048).
#[cfg(all(unix, not(target_os = "macos")))]
const DU_TIMEOUT: Duration = Duration::from_secs(60);
#[cfg(windows)]
const POWERSHELL_TIMEOUT: Duration = Duration::from_secs(120);
#[cfg(any(all(unix, not(target_os = "macos")), windows))]
const SUBPROCESS_POLL_INTERVAL: Duration = Duration::from_millis(50);

/// Spawn a sizing child process and either return its stdout, or kill it on
/// timeout / abort. Returns `None` for any non-success outcome — callers fall
/// back to the WalkDir loop in that case (#048).
#[cfg(any(all(unix, not(target_os = "macos")), windows))]
fn run_sizing_subprocess(
    mut cmd: Command,
    timeout: Duration,
    abort_flag: Option<&Arc<AtomicBool>>,
) -> Option<String> {
    use std::process::Stdio;
    use std::time::Instant;

    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    let _ = child.wait_with_output();
                    return None;
                }
                let output = child.wait_with_output().ok()?;
                return Some(String::from_utf8_lossy(&output.stdout).into_owned());
            }
            Ok(None) if start.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => {
                if let Some(flag) = abort_flag {
                    if flag.load(Ordering::Relaxed) {
                        let _ = child.kill();
                        let _ = child.wait();
                        return None;
                    }
                }
                std::thread::sleep(SUBPROCESS_POLL_INTERVAL);
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

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
    // Hardlink dedup by (dev, ino): a pnpm node_modules tree is full of files
    // hardlinked into a single content-addressable store, so counting every
    // path's `metadata.len()` would massively overstate the size. Unix only —
    // Windows would need GetFileInformationByHandle (#046).
    #[cfg(unix)]
    let mut seen_inodes: HashSet<(u64, u64)> = HashSet::new();

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
                #[cfg(unix)]
                {
                    use std::os::unix::fs::MetadataExt;
                    if metadata.nlink() > 1 {
                        let key = (metadata.dev(), metadata.ino());
                        if !seen_inodes.insert(key) {
                            continue;
                        }
                    }
                }
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
    // metadata.len() accounting used by calculate_dir_size, and dedupes
    // hardlinks by default (handles pnpm stores, #046). macOS BSD `du`
    // lacks --apparent-size, so we fall through to WalkDir there to keep
    // size accounting consistent between skip-dir and non-skip-dir paths.
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut cmd = Command::new("du");
        cmd.args(["-sk", "--apparent-size", path.to_string_lossy().as_ref()]);
        if let Some(stdout) = run_sizing_subprocess(cmd, DU_TIMEOUT, abort_flag) {
            if let Some(size_str) = stdout.split_whitespace().next() {
                if let Ok(kb) = size_str.parse::<u64>() {
                    return Ok(kb * 1024);
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
        if let Some(stdout) = run_sizing_subprocess(cmd, POWERSHELL_TIMEOUT, abort_flag) {
            let trimmed = stdout.trim();
            if !trimmed.is_empty() {
                if let Ok(bytes) = trimmed.parse::<u64>() {
                    return Ok(bytes);
                }
            }
        }
    }

    let mut size = 0u64;
    let mut counter: usize = 0;
    #[cfg(unix)]
    let mut seen_inodes: HashSet<(u64, u64)> = HashSet::new();
    for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
        if let Some(flag) = abort_flag {
            if (counter & ABORT_CHECK_MASK) == 0 && flag.load(Ordering::Relaxed) {
                return Ok(0);
            }
        }
        counter = counter.wrapping_add(1);
        if let Ok(metadata) = entry.metadata() {
            if metadata.is_file() {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::MetadataExt;
                    if metadata.nlink() > 1 {
                        let key = (metadata.dev(), metadata.ino());
                        if !seen_inodes.insert(key) {
                            continue;
                        }
                    }
                }
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

    #[test]
    #[cfg(unix)]
    fn test_calculate_dir_size_dedupes_hardlinks() {
        // pnpm stores files content-addressably and hardlinks them into each
        // node_modules tree. Without (dev, ino) dedup, sizing one tree would
        // count the same inode dozens of times and grossly overstate freed
        // bytes (#046).
        let tmp = std::env::temp_dir().join("tauri_test_hardlinks_calc");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let payload = vec![0u8; 4096];
        let original = tmp.join("original.bin");
        let link = tmp.join("link.bin");
        fs::write(&original, &payload).unwrap();
        fs::hard_link(&original, &link).unwrap();

        let size = calculate_dir_size(&tmp, None).unwrap();
        assert_eq!(
            size,
            payload.len() as u64,
            "hardlinked files should count once, got {}",
            size
        );

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    #[cfg(any(target_os = "macos", windows))]
    fn test_get_dir_size_fast_dedupes_hardlinks() {
        // The WalkDir fallback inside `get_dir_size_fast` is the only sizing
        // path on macOS, and also Windows' fallback when PowerShell fails. It
        // must dedup hardlinks too (#046).
        let tmp = std::env::temp_dir().join("tauri_test_hardlinks_fast");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let payload = vec![0u8; 4096];
        let original = tmp.join("a.bin");
        let link = tmp.join("a_link.bin");
        fs::write(&original, &payload).unwrap();
        if fs::hard_link(&original, &link).is_err() {
            let _ = fs::remove_dir_all(&tmp);
            return;
        }

        let size = get_dir_size_fast(&tmp, None).unwrap();
        #[cfg(unix)]
        assert_eq!(
            size,
            payload.len() as u64,
            "hardlinked files should count once on macOS WalkDir path"
        );
        // Windows: dedup isn't implemented in the WalkDir fallback (would need
        // GetFileInformationByHandle); just verify the call doesn't panic.
        #[cfg(windows)]
        let _ = size;

        let _ = fs::remove_dir_all(&tmp);
    }
}
