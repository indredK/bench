use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn ensure_file_size(path: &Path, max_bytes: u64) -> io::Result<()> {
    if path.exists() && fs::metadata(path)?.len() > max_bytes {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "persisted file exceeds the configured size limit",
        ));
    }
    Ok(())
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no parent"))?;
    let suffix = unique_suffix();
    let temp_path = parent.join(format!(
        ".{}.tmp-{suffix}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("data")
    ));

    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;

        #[cfg(unix)]
        fs::rename(&temp_path, path)?;

        #[cfg(windows)]
        replace_file_windows(path, &temp_path)?;

        sync_parent(parent);
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

pub fn backup_file(path: &Path, label: &str, max_backups: usize) -> io::Result<Option<PathBuf>> {
    let mut last_err: Option<io::Error> = None;
    for attempt in 0..3 {
        match backup_file_inner(path, label, max_backups) {
            Ok(result) => return Ok(result),
            Err(e) if e.kind() == io::ErrorKind::PermissionDenied && attempt < 2 => {
                last_err = Some(e);
                std::thread::sleep(std::time::Duration::from_millis(50 << attempt));
            }
            Err(e) => return Err(e),
        }
    }
    Err(last_err.unwrap())
}

fn backup_file_inner(path: &Path, label: &str, max_backups: usize) -> io::Result<Option<PathBuf>> {
    if !path.exists() {
        return Ok(None);
    }
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no parent"))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("data");
    let prefix = format!("{file_name}.{label}-");
    let backup = parent.join(format!("{prefix}{}", unique_suffix()));
    copy_with_retry(path, &backup)?;
    File::open(&backup)?.sync_all()?;

    let mut backups = fs::read_dir(parent)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|candidate| {
            candidate
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(&prefix))
        })
        .collect::<Vec<_>>();
    backups.sort();
    let remove_count = backups.len().saturating_sub(max_backups);
    for stale in backups.into_iter().take(remove_count) {
        let _ = fs::remove_file(stale);
    }
    Ok(Some(backup))
}

fn unique_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{}-{nanos}", std::process::id())
}

/// Retry-aware `fs::copy` for Windows CI where transient permission errors
/// (antivirus / ACL) can cause a one-shot `fs::copy` to fail.
fn copy_with_retry(src: &Path, dst: &Path) -> io::Result<u64> {
    let mut last_err: Option<io::Error> = None;
    for attempt in 0..3 {
        match fs::copy(src, dst) {
            Ok(n) => return Ok(n),
            Err(e) if e.kind() == io::ErrorKind::PermissionDenied && attempt < 2 => {
                last_err = Some(e);
                std::thread::sleep(std::time::Duration::from_millis(10 << attempt));
            }
            Err(e) => return Err(e),
        }
    }
    Err(last_err.unwrap())
}

#[cfg(unix)]
fn sync_parent(parent: &Path) {
    if let Ok(directory) = File::open(parent) {
        let _ = directory.sync_all();
    }
}

#[cfg(not(unix))]
fn sync_parent(_parent: &Path) {}

#[cfg(windows)]
fn replace_file_windows(path: &Path, temp_path: &Path) -> io::Result<()> {
    let previous = path.with_extension(format!("previous-{}", unique_suffix()));
    if path.exists() {
        fs::rename(path, &previous)?;
    }
    if let Err(error) = fs::rename(temp_path, path) {
        if previous.exists() {
            let _ = fs::rename(&previous, path);
        }
        return Err(error);
    }
    if previous.exists() {
        let _ = fs::remove_file(previous);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("bench-persistence-{label}-{}", unique_suffix()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn atomic_write_replaces_complete_content() {
        let dir = temp_dir("atomic");
        let path = dir.join("data.json");
        fs::write(&path, b"old").unwrap();
        atomic_write(&path, b"new-complete-value").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new-complete-value");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn backups_are_bounded() {
        let dir = temp_dir("backup");
        let path = dir.join("data.json");
        fs::write(&path, b"data").unwrap();
        for _ in 0..5 {
            backup_file(&path, "migration", 2).unwrap();
        }
        let backups = fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains(".migration-"))
            .count();
        assert_eq!(backups, 2);
        fs::remove_dir_all(dir).unwrap();
    }
}
