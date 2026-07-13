use serde::{Deserialize, Serialize};
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug)]
#[allow(dead_code)]
pub struct ReplaceOutcome {
    /// The bundle that was previously installed, now living under `trash_dir`.
    pub trashed_old: PathBuf,
    /// Final path of the installed bundle (same as the `old` argument).
    pub installed_at: PathBuf,
}

#[derive(Debug)]
pub enum ReplaceError {
    /// Install failed, but the original bundle was restored from trash. The
    /// disk state matches what it looked like before we touched anything.
    RolledBack(String),
    /// Install failed AND rollback failed. The original bundle is somewhere
    /// in trash and the install location is empty or partial. The caller
    /// should surface this as a hard failure and tell the user where the old
    /// bundle ended up so they can move it back manually.
    Stranded {
        reason: String,
        trashed_old: PathBuf,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplaceJournal {
    install_path: PathBuf,
    staged_new: PathBuf,
    trashed_old: PathBuf,
}

impl ReplaceError {
    pub fn code(&self) -> &'static str {
        match self {
            ReplaceError::RolledBack(_) => "SU_REPLACE_ROLLED_BACK",
            ReplaceError::Stranded { .. } => "SU_REPLACE_FAIL",
        }
    }

    pub fn message(&self) -> String {
        match self {
            ReplaceError::RolledBack(m) => m.clone(),
            ReplaceError::Stranded {
                reason,
                trashed_old,
            } => format!("{reason}; old bundle at {}", trashed_old.display()),
        }
    }
}

/// Default trash directory (`~/.Trash`). Returns an error if `$HOME` cannot
/// be determined.
pub fn default_trash_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "SU_REPLACE_FAIL: no home dir".to_string())?;
    Ok(home.join(".Trash"))
}

/// Replace `old` with `new`, putting the previous version in `trash_dir`.
/// Rolls back if the second move fails so callers don't get a half-installed
/// state.
pub fn replace_bundle(
    old: &Path,
    new: &Path,
    trash_dir: &Path,
) -> Result<ReplaceOutcome, ReplaceError> {
    recover_pending_replacements().map_err(ReplaceError::RolledBack)?;
    preflight_replace(old, new)
        .map_err(|error| ReplaceError::RolledBack(format!("install new preflight: {error}")))?;
    std::fs::create_dir_all(trash_dir)
        .map_err(|e| ReplaceError::RolledBack(format!("ensure trash: {e}")))?;

    let trash_path = unique_trash_path(trash_dir, old);
    let staged_new = sibling_staging_path(old);
    move_path(new, &staged_new)
        .map_err(|e| ReplaceError::RolledBack(format!("stage new bundle: {e}")))?;
    let journal = ReplaceJournal {
        install_path: old.to_path_buf(),
        staged_new: staged_new.clone(),
        trashed_old: trash_path.clone(),
    };
    let journal_path = write_journal(&journal).map_err(|error| {
        let _ = move_path(&staged_new, new);
        ReplaceError::RolledBack(error)
    })?;

    // Move old → trash. If this fails the original is untouched.
    if let Err(error) = move_path(old, &trash_path) {
        let _ = std::fs::remove_file(&journal_path);
        let _ = move_path(&staged_new, new);
        return Err(ReplaceError::RolledBack(format!("trash old: {error}")));
    }

    // Move new → old's location. Rollback if it fails.
    if let Err(e) = move_path(&staged_new, old) {
        match move_path(&trash_path, old) {
            Ok(()) => {
                let _ = std::fs::remove_file(&journal_path);
                return Err(ReplaceError::RolledBack(format!(
                    "install new: {e}; original restored"
                )));
            }
            Err(restore_err) => {
                return Err(ReplaceError::Stranded {
                    reason: format!("install new: {e}; rollback failed: {restore_err}"),
                    trashed_old: trash_path,
                });
            }
        }
    }
    let _ = std::fs::remove_file(&journal_path);

    // Best-effort dequarantine so the user doesn't see a Gatekeeper prompt
    // on first launch. Failure here is non-fatal.
    let _ = crate::app_manager::gatekeeper::remove_quarantine(old);

    Ok(ReplaceOutcome {
        trashed_old: trash_path,
        installed_at: old.to_path_buf(),
    })
}

fn preflight_replace(old: &Path, new: &Path) -> Result<(), String> {
    if !old.is_dir() || !new.is_dir() {
        return Err("SU_PREFLIGHT_PATH_INVALID".to_string());
    }
    let parent = old
        .parent()
        .ok_or_else(|| "SU_PREFLIGHT_PARENT_MISSING".to_string())?;
    let probe = parent.join(format!(".bench-write-probe-{}", std::process::id()));
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .map_err(|error| format!("SU_PREFLIGHT_PERMISSION_DENIED: {error}"))?;
    let _ = std::fs::remove_file(&probe);

    let required = directory_size(new).saturating_add(64 * 1024 * 1024);
    if let Some(available) = available_bytes(parent) {
        if available < required {
            return Err(format!(
                "SU_PREFLIGHT_DISK_SPACE: required {required}, available {available}"
            ));
        }
    }
    Ok(())
}

fn directory_size(root: &Path) -> u64 {
    walkdir::WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
        .filter_map(|entry| entry.metadata().ok())
        .filter(|metadata| metadata.is_file())
        .map(|metadata| metadata.len())
        .fold(0_u64, u64::saturating_add)
}

fn available_bytes(path: &Path) -> Option<u64> {
    let output = Command::new("df").args(["-Pk"]).arg(path).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let line = String::from_utf8_lossy(&output.stdout)
        .lines()
        .last()?
        .to_string();
    let available_kib = line.split_whitespace().nth(3)?.parse::<u64>().ok()?;
    Some(available_kib.saturating_mul(1024))
}

fn sibling_staging_path(old: &Path) -> PathBuf {
    let parent = old.parent().unwrap_or_else(|| Path::new("."));
    let name = old
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("App.app");
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    parent.join(format!(".{name}.bench-staging-{timestamp}"))
}

fn journal_dirs() -> Vec<PathBuf> {
    let primary = super::downloader::cache_root().join("recovery");
    let fallback = std::env::temp_dir()
        .join("bench-app-update-cache")
        .join("recovery");
    if primary == fallback {
        vec![primary]
    } else {
        vec![primary, fallback]
    }
}

fn write_journal(journal: &ReplaceJournal) -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let payload =
        serde_json::to_vec(journal).map_err(|error| format!("SU_JOURNAL_SERIALIZE: {error}"))?;
    let mut last_error = None;
    for dir in journal_dirs() {
        if let Err(error) = std::fs::create_dir_all(&dir) {
            last_error = Some(error.to_string());
            continue;
        }
        let path = dir.join(format!("replace-{timestamp}.json"));
        match std::fs::write(&path, &payload) {
            Ok(()) => return Ok(path),
            Err(error) => last_error = Some(error.to_string()),
        }
    }
    Err(format!(
        "SU_JOURNAL_WRITE: {}",
        last_error.unwrap_or_else(|| "no writable journal directory".to_string())
    ))
}

pub fn recover_pending_replacements() -> Result<usize, String> {
    let mut recovered = 0;
    for dir in journal_dirs().into_iter().filter(|dir| dir.exists()) {
        let entries =
            std::fs::read_dir(&dir).map_err(|error| format!("SU_JOURNAL_READ: {error}"))?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let journal: ReplaceJournal = match std::fs::read(&path)
                .ok()
                .and_then(|payload| serde_json::from_slice(&payload).ok())
            {
                Some(journal) => journal,
                None => continue,
            };
            if !journal.install_path.exists() && journal.trashed_old.exists() {
                move_path(&journal.trashed_old, &journal.install_path)
                    .map_err(|error| format!("SU_RECOVERY_RESTORE_FAILED: {error}"))?;
                recovered += 1;
            }
            if journal.install_path.exists() && journal.staged_new.exists() {
                let _ = std::fs::remove_dir_all(&journal.staged_new);
            }
            if journal.install_path.exists() {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
    Ok(recovered)
}

fn unique_trash_path(trash_dir: &Path, old: &Path) -> PathBuf {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let stem = old.file_stem().and_then(|s| s.to_str()).unwrap_or("Bundle");
    let ext = old.extension().and_then(|s| s.to_str()).unwrap_or("app");
    trash_dir.join(format!("{stem}-{ts}.{ext}"))
}

/// Move `src` → `dst`. Uses rename when both are on the same filesystem,
/// falls back to `/bin/cp -R` + remove for cross-volume cases.
fn move_path(src: &Path, dst: &Path) -> io::Result<()> {
    match std::fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(_) => {
            let out = Command::new("/bin/cp")
                .arg("-R")
                .arg(src)
                .arg(dst)
                .output()?;
            if !out.status.success() {
                return Err(io::Error::other(format!(
                    "cp -R exit {} {}",
                    out.status.code().unwrap_or(-1),
                    String::from_utf8_lossy(&out.stderr).trim()
                )));
            }
            std::fs::remove_dir_all(src)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_subdir(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    fn write_app(parent: &Path, name: &str, marker: &str) -> PathBuf {
        let app = parent.join(name);
        std::fs::create_dir_all(app.join("Contents/MacOS")).unwrap();
        std::fs::write(app.join("Contents/Info.plist"), marker.as_bytes()).unwrap();
        app
    }

    #[test]
    fn replace_bundle_swaps_old_for_new_and_returns_trash_path() {
        let root = temp_subdir("bench-replace-ok");
        let install_root = root.join("apps");
        std::fs::create_dir_all(&install_root).unwrap();
        let trash = root.join("trash");

        let old = write_app(&install_root, "Demo.app", "OLD");
        let new = write_app(&root.join("work"), "Demo.app", "NEW");

        let outcome = replace_bundle(&old, &new, &trash).unwrap();
        assert_eq!(outcome.installed_at, old);
        assert!(outcome.trashed_old.starts_with(&trash));

        // Old location now has new content.
        let installed = std::fs::read(old.join("Contents/Info.plist")).unwrap();
        assert_eq!(installed, b"NEW");

        // Trashed copy preserves the old content.
        let saved = std::fs::read(outcome.trashed_old.join("Contents/Info.plist")).unwrap();
        assert_eq!(saved, b"OLD");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn replace_bundle_rolls_back_when_new_source_is_missing() {
        let root = temp_subdir("bench-replace-rollback");
        let install_root = root.join("apps");
        std::fs::create_dir_all(&install_root).unwrap();
        let trash = root.join("trash");

        let old = write_app(&install_root, "Demo.app", "OLD");
        let new = root.join("work/MissingDemo.app"); // never created

        let err = replace_bundle(&old, &new, &trash).unwrap_err();
        match err {
            ReplaceError::RolledBack(msg) => {
                assert!(msg.contains("install new"));
            }
            other => panic!("expected RolledBack, got {other:?}"),
        }

        // Original bundle restored at the install location.
        assert!(old.exists());
        let restored = std::fs::read(old.join("Contents/Info.plist")).unwrap();
        assert_eq!(restored, b"OLD");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn unique_trash_path_uses_app_stem_and_extension() {
        let trash = PathBuf::from("/x/trash");
        let bundle = PathBuf::from("/Applications/Demo Pro.app");
        let p = unique_trash_path(&trash, &bundle);
        let name = p.file_name().and_then(|s| s.to_str()).unwrap();
        assert!(name.starts_with("Demo Pro-"));
        assert!(name.ends_with(".app"));
    }

    #[test]
    fn replace_error_codes_and_messages() {
        let rb = ReplaceError::RolledBack("reason here".into());
        assert_eq!(rb.code(), "SU_REPLACE_ROLLED_BACK");
        assert_eq!(rb.message(), "reason here");

        let trashed_old = PathBuf::from("t").join("Demo.app");
        let st = ReplaceError::Stranded {
            reason: "x".into(),
            trashed_old: trashed_old.clone(),
        };
        assert_eq!(st.code(), "SU_REPLACE_FAIL");
        assert!(st.message().contains(&trashed_old.display().to_string()));
    }
}
