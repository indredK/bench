use super::rules::{is_skip_dir_entry, is_skip_dir_name};
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use walkdir::WalkDir;

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

    if let Ok(entries) = fs::read_dir(path) {
        for (i, entry) in entries.flatten().enumerate() {
            if let Some(flag) = abort_flag {
                if i % 100 == 0 && flag.load(Ordering::SeqCst) {
                    return Ok(0);
                }
            }
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if is_skip_dir_name(&name_str) {
                if let Ok(skip_size) = get_dir_size_fast(&entry.path(), abort_flag) {
                    size += skip_size;
                }
            }
        }
    }

    for (i, entry) in WalkDir::new(path)
        .into_iter()
        .filter_entry(|e| !is_skip_dir_entry(e))
        .filter_map(|e| e.ok())
        .enumerate()
    {
        if let Some(flag) = abort_flag {
            if i % 100 == 0 && flag.load(Ordering::SeqCst) {
                return Ok(0);
            }
        }

        if let Ok(metadata) = fs::metadata(entry.path()) {
            if metadata.is_file() {
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
        if flag.load(Ordering::SeqCst) {
            return Ok(0);
        }
    }

    #[cfg(unix)]
    {
        if let Ok(output) = Command::new("du")
            .args(["-sk", path.to_string_lossy().as_ref()])
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
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!(
                    "((Get-ChildItem -Recurse -Force -ErrorAction SilentlyContinue '{}' | Where-Object {{ -not $_.PSIsContainer }} | Measure-Object -Sum Length).Sum)",
                    path.to_string_lossy().replace('\'', "''")
                ),
            ])
            .output()
        {
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
    for (i, entry) in WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .enumerate()
    {
        if let Some(flag) = abort_flag {
            if i % 100 == 0 && flag.load(Ordering::SeqCst) {
                return Ok(0);
            }
        }
        if let Ok(metadata) = fs::metadata(entry.path()) {
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
}
