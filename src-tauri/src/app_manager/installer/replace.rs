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
    let home = dirs_next::home_dir().ok_or_else(|| "SU_REPLACE_FAIL: no home dir".to_string())?;
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
    std::fs::create_dir_all(trash_dir)
        .map_err(|e| ReplaceError::RolledBack(format!("ensure trash: {e}")))?;

    let trash_path = unique_trash_path(trash_dir, old);

    // Move old → trash. If this fails the original is untouched.
    move_path(old, &trash_path).map_err(|e| ReplaceError::RolledBack(format!("trash old: {e}")))?;

    // Move new → old's location. Rollback if it fails.
    if let Err(e) = move_path(new, old) {
        match move_path(&trash_path, old) {
            Ok(()) => {
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

    // Best-effort dequarantine so the user doesn't see a Gatekeeper prompt
    // on first launch. Failure here is non-fatal.
    let _ = remove_quarantine(old);

    Ok(ReplaceOutcome {
        trashed_old: trash_path,
        installed_at: old.to_path_buf(),
    })
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

/// Best-effort `xattr -rd com.apple.quarantine <path>` so the freshly
/// installed bundle launches without a Gatekeeper prompt.
fn remove_quarantine(path: &Path) -> io::Result<()> {
    let _ = Command::new("/usr/bin/xattr")
        .arg("-rd")
        .arg("com.apple.quarantine")
        .arg(path)
        .output()?;
    Ok(())
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
