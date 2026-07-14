use std::fs::{self, OpenOptions};
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
    retry_permission_denied(|| backup_file_inner(path, label, max_backups))
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

    let result = (|| {
        let bytes = read_with_retry(path)?;
        atomic_write(&backup, &bytes)?;
        prune_labeled_backups(parent, &prefix, max_backups)?;
        Ok(Some(backup.clone()))
    })();

    if result.is_err() {
        let _ = remove_with_retry(&backup);
    }
    result
}

fn prune_labeled_backups(parent: &Path, prefix: &str, max_backups: usize) -> io::Result<()> {
    let mut backups = fs::read_dir(parent)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|candidate| {
            candidate
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(prefix))
        })
        .collect::<Vec<_>>();
    backups.sort();
    let remove_count = backups.len().saturating_sub(max_backups);
    for stale in backups.into_iter().take(remove_count) {
        remove_with_retry(&stale)?;
    }
    Ok(())
}

fn unique_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{}-{nanos}", std::process::id())
}

fn retry_permission_denied<T, F>(mut action: F) -> io::Result<T>
where
    F: FnMut() -> io::Result<T>,
{
    let max_attempts = if cfg!(windows) { 5 } else { 3 };
    let base_delay_ms = if cfg!(windows) { 50 } else { 10 };
    let mut last_err: Option<io::Error> = None;
    for attempt in 0..max_attempts {
        match action() {
            Ok(value) => return Ok(value),
            Err(error)
                if error.kind() == io::ErrorKind::PermissionDenied
                    && attempt + 1 < max_attempts =>
            {
                last_err = Some(error);
                std::thread::sleep(std::time::Duration::from_millis(base_delay_ms << attempt));
            }
            Err(error) => return Err(error),
        }
    }
    Err(last_err.unwrap())
}

fn read_with_retry(path: &Path) -> io::Result<Vec<u8>> {
    retry_permission_denied(|| fs::read(path))
}

fn remove_with_retry(path: &Path) -> io::Result<()> {
    if !path.exists() {
        return Ok(());
    }
    retry_permission_denied(|| fs::remove_file(path))
}

#[cfg(unix)]
fn sync_parent(parent: &Path) {
    if let Ok(directory) = fs::File::open(parent) {
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
        let backup_prefix = format!(
            "{}.migration-",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("data")
        );
        let backups = fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(backup_prefix.as_str())
            })
            .count();
        assert_eq!(backups, 2);
        fs::remove_dir_all(dir).unwrap();
    }
}
