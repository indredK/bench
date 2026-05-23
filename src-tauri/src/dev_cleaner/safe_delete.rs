// Safe deletion helpers for the dev_cleaner module.
//
// Goals:
//   - Never follow symbolic links / Windows reparse points (junction, mount point)
//     across project / volume boundaries. The classic `fs::remove_dir_all` is
//     mostly safe on modern Rust, but it does not stop at reparse points on
//     Windows in all situations, and even on Unix it will happily descend into
//     a directory symlink and delete files outside the project tree. We
//     implement a manual recursion that calls `remove_file` for any symlink /
//     reparse-point and only descends into real directories.
//   - Default to "send to system trash / recycle bin" so an erroneous rule
//     match remains recoverable. When the platform trash service is
//     unavailable we fall back to safe-recursive direct delete and surface the
//     error so the caller can decide whether to retry.
//   - Stay on the same filesystem as the project root: a manifest may
//     accidentally point at a directory on an external volume; refusing to
//     cross `st_dev` (Unix) / volume serial (Windows) protects user data.
//
// This module deliberately avoids external crates so it can be vendored in
// constrained build environments. The platform trash backends are implemented
// via OS-provided shell tooling (osascript / PowerShell / freedesktop spec).

use std::fs;
use std::io;
use std::path::Path;
#[cfg(any(test, all(unix, not(target_os = "macos"))))]
use std::path::PathBuf;

/// Outcome of attempting to safely delete a single target.
#[derive(Debug)]
pub(super) enum DeleteOutcome {
    /// Moved to the system trash / recycle bin.
    Trashed,
    /// Trash failed; permanently deleted via the safe recursive routine.
    PermanentlyDeleted { trash_error: String },
    /// Skipped because it crossed a filesystem boundary or symlink target was
    /// outside the project root.
    SkippedUnsafe { reason: String },
}

/// Identifier for the filesystem a path lives on. Used to refuse deletions
/// that would cross a mount-point even when the path appears to be inside the
/// project after `canonicalize`.
#[cfg(unix)]
pub(super) fn filesystem_id(path: &Path) -> io::Result<u64> {
    use std::os::unix::fs::MetadataExt;
    Ok(fs::symlink_metadata(path)?.dev())
}

#[cfg(windows)]
pub(super) fn filesystem_id(path: &Path) -> io::Result<u64> {
    use std::os::windows::fs::MetadataExt;
    // `volume_serial_number` is not on the public MetadataExt; on Windows we
    // approximate by hashing the canonical prefix (`\\?\C:\` etc.). Different
    // drive letters → different ids; SUBST and reparse mounts on the same
    // letter share an id which is acceptable because such mounts also share
    // the underlying volume in the most common case.
    let _ = path;
    let canonical = fs::canonicalize(path)?;
    let s = canonical.to_string_lossy();
    let bytes = s.as_bytes();
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in bytes.iter().take(8) {
        // FNV-1a on the first volume-prefix bytes (e.g. `\\?\C:\`).
        hash ^= u64::from(*b);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    let _ = fs::symlink_metadata(path)?.file_attributes();
    Ok(hash)
}

#[cfg(not(any(unix, windows)))]
pub(super) fn filesystem_id(_path: &Path) -> io::Result<u64> {
    Ok(0)
}

/// Returns true when `metadata` corresponds to a symlink or any other kind of
/// reparse point on Windows. The directory-recursion routine must NEVER
/// descend into such an entry — it must only remove the entry itself.
fn is_symlink_or_reparse(md: &fs::Metadata) -> bool {
    if md.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        if md.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return true;
        }
    }
    false
}

/// Recursively delete `path` without ever following symlinks or reparse
/// points. Refuses to descend across filesystem boundaries (`root_fs_id`).
/// Symlinks and junctions encountered along the way are unlinked as files —
/// their targets are left untouched.
pub(super) fn safe_recursive_delete(path: &Path, root_fs_id: u64) -> io::Result<()> {
    let md = match fs::symlink_metadata(path) {
        Ok(m) => m,
        // Already gone — that's success for our purposes.
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };

    if is_symlink_or_reparse(&md) {
        // Symlinks and Windows reparse points (junctions, mount points) are
        // unlinked as a single file entry. `remove_file` is correct on both
        // platforms even when the reparse points to a directory.
        return fs::remove_file(path);
    }

    if md.is_dir() {
        // Verify the directory itself is on the same filesystem before
        // descending. Without this check a mount-point-style directory could
        // sneak its way past `is_symlink_or_reparse` on platforms where the
        // attribute is not set.
        if let Ok(child_fs) = filesystem_id(path) {
            if child_fs != root_fs_id {
                return Err(io::Error::other(format!(
                    "refusing to descend into '{}': different filesystem",
                    path.display()
                )));
            }
        }

        for entry in fs::read_dir(path)? {
            let entry = entry?;
            safe_recursive_delete(&entry.path(), root_fs_id)?;
        }
        return fs::remove_dir(path);
    }

    fs::remove_file(path)
}

/// Compute the canonical form of both `path` and `root` and confirm that
/// the canonicalised `path` stays inside `root` AND is on the same
/// filesystem. Returns the filesystem id of `root` for the caller to thread
/// through `safe_recursive_delete`.
pub(super) fn validate_path_within_root(
    path: &Path,
    root: &Path,
) -> Result<u64, String> {
    let canonical_target = fs::canonicalize(path)
        .map_err(|e| format!("canonicalize target '{}': {}", path.display(), e))?;
    let canonical_root = fs::canonicalize(root)
        .map_err(|e| format!("canonicalize root '{}': {}", root.display(), e))?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err(format!(
            "path '{}' escapes project root '{}' after canonicalisation",
            canonical_target.display(),
            canonical_root.display()
        ));
    }

    let root_fs = filesystem_id(&canonical_root)
        .map_err(|e| format!("filesystem id of root '{}': {}", canonical_root.display(), e))?;
    let target_fs = filesystem_id(&canonical_target)
        .map_err(|e| format!("filesystem id of target '{}': {}", canonical_target.display(), e))?;
    if root_fs != target_fs {
        return Err(format!(
            "target '{}' is on a different filesystem than project root '{}'",
            canonical_target.display(),
            canonical_root.display()
        ));
    }

    Ok(root_fs)
}

// ---- Platform trash backends -----------------------------------------------

#[cfg(target_os = "macos")]
fn move_to_trash(path: &Path) -> Result<(), String> {
    use std::process::Command;
    // POSIX-file paths must escape any double quote inside the path. We do
    // not allow back-slashes or `\n` in the path because osascript treats
    // those as string escapes.
    let raw = path.to_string_lossy().to_string();
    if raw.contains('"') || raw.contains('\\') || raw.contains('\n') {
        return Err(format!(
            "refusing to trash path containing unsafe characters: {}",
            raw
        ));
    }
    let script = format!(
        "tell application \"Finder\" to delete (POSIX file \"{}\" as alias)",
        raw
    );
    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("osascript spawn failed: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "osascript trash failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn move_to_trash(path: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let raw = path.to_string_lossy().to_string();
    if raw.contains('\'') || raw.contains('\n') {
        return Err(format!(
            "refusing to trash path containing unsafe quoting characters: {}",
            raw
        ));
    }
    // Microsoft.VisualBasic.FileIO supports SendToRecycleBin for both files
    // and directories.
    let script = format!(
        "Add-Type -AssemblyName Microsoft.VisualBasic; \
         $item = Get-Item -LiteralPath '{path}' -ErrorAction Stop; \
         if ($item.PSIsContainer) {{ \
             [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('{path}', 'OnlyErrorDialogs', 'SendToRecycleBin') \
         }} else {{ \
             [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('{path}', 'OnlyErrorDialogs', 'SendToRecycleBin') \
         }}",
        path = raw
    );
    // CREATE_NO_WINDOW (0x08000000) prevents the brief console window flash
    // every time we move a path to the recycle bin (#032).
    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|e| format!("powershell spawn failed: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "powershell trash failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn move_to_trash(path: &Path) -> Result<(), String> {
    // freedesktop.org Trash spec implementation, "home trash" variant only.
    use std::env;
    use std::time::{SystemTime, UNIX_EPOCH};
    let xdg_data_home = env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .ok()
        .or_else(|| env::var("HOME").ok().map(|h| PathBuf::from(h).join(".local/share")))
        .ok_or_else(|| "neither XDG_DATA_HOME nor HOME is set".to_string())?;
    let trash_root = xdg_data_home.join("Trash");
    let files_dir = trash_root.join("files");
    let info_dir = trash_root.join("info");
    fs::create_dir_all(&files_dir)
        .map_err(|e| format!("cannot create trash files dir: {}", e))?;
    fs::create_dir_all(&info_dir)
        .map_err(|e| format!("cannot create trash info dir: {}", e))?;

    let abs = fs::canonicalize(path)
        .map_err(|e| format!("canonicalize: {}", e))?;
    let original_name = abs
        .file_name()
        .ok_or_else(|| "target has no filename".to_string())?
        .to_string_lossy()
        .to_string();

    // Collision-avoidance: append timestamp + counter.
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut target_name = format!("{}-{}", original_name, ts);
    let mut idx = 1u64;
    while files_dir.join(&target_name).exists() {
        target_name = format!("{}-{}-{}", original_name, ts, idx);
        idx += 1;
    }
    let dest = files_dir.join(&target_name);
    let info_dest = info_dir.join(format!("{}.trashinfo", target_name));

    fs::rename(&abs, &dest)
        .map_err(|e| format!("rename to trash failed (cross-fs not handled): {}", e))?;

    let now = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let info_content = format!(
        "[Trash Info]\nPath={}\nDeletionDate={}\n",
        abs.display(),
        now
    );
    fs::write(&info_dest, info_content)
        .map_err(|e| format!("write .trashinfo: {}", e))?;
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows", unix)))]
fn move_to_trash(_path: &Path) -> Result<(), String> {
    Err("trash is not supported on this platform".to_string())
}

/// Public entry point: validate `path` is safely inside `project_root`, then
/// try the platform trash backend. On trash failure, fall back to a safe
/// recursive direct delete. Returns the outcome so callers can log it.
pub(super) fn safe_delete_within_root(
    path: &Path,
    project_root: &Path,
) -> DeleteOutcome {
    let root_fs_id = match validate_path_within_root(path, project_root) {
        Ok(id) => id,
        Err(reason) => return DeleteOutcome::SkippedUnsafe { reason },
    };

    match move_to_trash(path) {
        Ok(()) => DeleteOutcome::Trashed,
        Err(trash_error) => match safe_recursive_delete(path, root_fs_id) {
            Ok(()) => DeleteOutcome::PermanentlyDeleted { trash_error },
            Err(direct_err) => DeleteOutcome::SkippedUnsafe {
                reason: format!(
                    "trash failed ({}) and direct delete also failed: {}",
                    trash_error, direct_err
                ),
            },
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    fn tmp_dir(label: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        p.push(format!("safe_delete_{}_{}", label, ts));
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn write_file(p: &Path, content: &str) {
        let mut f = fs::File::create(p).unwrap();
        f.write_all(content.as_bytes()).unwrap();
    }

    /// Regression for #024: a symlink under the project root that points
    /// outside the root must NOT cause the target outside to be deleted.
    #[cfg(unix)]
    #[test]
    fn safe_recursive_delete_does_not_follow_symlink_outside_root() {
        use std::os::unix::fs::symlink;
        let outside = tmp_dir("outside_for_024");
        let outside_file = outside.join("precious.txt");
        write_file(&outside_file, "do not delete me");

        let project = tmp_dir("project_for_024");
        let target = project.join("node_modules");
        fs::create_dir_all(&target).unwrap();
        // Place a symlink inside the deletion target that points OUTSIDE.
        let link = target.join("evil_link");
        symlink(&outside_file, &link).unwrap();

        let root_fs = filesystem_id(&project).unwrap();
        safe_recursive_delete(&target, root_fs).expect("recursive delete failed");

        assert!(!target.exists(), "node_modules should be gone");
        assert!(outside_file.exists(), "outside_file MUST still exist");

        // Cleanup
        let _ = fs::remove_dir_all(&outside);
        let _ = fs::remove_dir_all(&project);
    }

    /// Regression for #029: validation must refuse a path that resolves to a
    /// directory outside the project root.
    #[cfg(unix)]
    #[test]
    fn validate_rejects_path_escaping_via_symlink() {
        use std::os::unix::fs::symlink;
        let outside = tmp_dir("outside_for_029");
        let project = tmp_dir("project_for_029");
        let link = project.join("link_to_outside");
        symlink(&outside, &link).unwrap();
        let err = validate_path_within_root(&link, &project).unwrap_err();
        assert!(err.contains("escapes project root"), "unexpected: {}", err);
        let _ = fs::remove_dir_all(&outside);
        let _ = fs::remove_dir_all(&project);
    }

    /// Plain happy path: safe_recursive_delete removes a real nested tree
    /// without symlinks.
    #[test]
    fn safe_recursive_delete_removes_normal_tree() {
        let project = tmp_dir("normal_tree");
        let nested = project.join("a/b/c");
        fs::create_dir_all(&nested).unwrap();
        write_file(&nested.join("file.txt"), "hi");
        let root_fs = filesystem_id(&project).unwrap();
        safe_recursive_delete(&project.join("a"), root_fs).expect("ok");
        assert!(!project.join("a").exists());
        let _ = fs::remove_dir_all(&project);
    }

    /// Regression: a path that does not exist is a no-op success.
    #[test]
    fn safe_recursive_delete_missing_path_is_ok() {
        let project = tmp_dir("missing");
        let root_fs = filesystem_id(&project).unwrap();
        safe_recursive_delete(&project.join("does/not/exist"), root_fs).expect("no-op");
        let _ = fs::remove_dir_all(&project);
    }
}
