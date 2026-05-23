use super::downloader::cache_root;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Create a unique work directory under our cache root for one install run.
/// Lifetime is bounded by the caller — the orchestrator removes it after the
/// .app has been moved into /Applications.
pub fn make_work_dir(app_id: &str) -> Result<PathBuf, String> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let safe: String = app_id
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let dir = cache_root().join("work").join(format!("{safe}-{ts}"));
    std::fs::create_dir_all(&dir).map_err(|e| format!("SU_EXTRACT_FAIL: mkdir {e}"))?;
    Ok(dir)
}

/// Best-effort cleanup of a work directory created by `make_work_dir`.
pub fn cleanup_work_dir(dir: &Path) {
    let _ = std::fs::remove_dir_all(dir);
}

/// Find the first `*.app` directory under `root` (depth-limited search).
pub fn find_app_bundle(root: &Path) -> Result<PathBuf, String> {
    // Shallow pass first — typical layouts have the .app at the top level.
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && p.extension().map(|s| s == "app").unwrap_or(false) {
                return Ok(p);
            }
        }
    }
    // Recursive fallback (max depth 4 — covers the rare layouts where the
    // .app sits inside a versioned folder).
    for entry in walkdir::WalkDir::new(root)
        .max_depth(4)
        .into_iter()
        .flatten()
    {
        let p = entry.path();
        if p.is_dir() && p.extension().map(|s| s == "app").unwrap_or(false) {
            return Ok(p.to_path_buf());
        }
    }
    Err("SU_EXTRACT_FAIL: no .app bundle found in archive".into())
}

/// Extract a `.zip` archive to `work_dir` and return the path of the contained
/// `.app` bundle. Restores Unix permissions so executable bits survive.
pub fn extract_zip(zip_path: &Path, work_dir: &Path) -> Result<PathBuf, String> {
    let file =
        std::fs::File::open(zip_path).map_err(|e| format!("SU_EXTRACT_FAIL: open zip {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("SU_EXTRACT_FAIL: read zip {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("SU_EXTRACT_FAIL: zip entry {i}: {e}"))?;
        let rel = match entry.enclosed_name() {
            Some(p) => p.to_path_buf(),
            // Reject zip-slip and absolute paths.
            None => continue,
        };
        let outpath = work_dir.join(&rel);

        if entry.is_dir() {
            std::fs::create_dir_all(&outpath).map_err(|e| format!("SU_EXTRACT_FAIL: mkdir {e}"))?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("SU_EXTRACT_FAIL: mkdir {e}"))?;
            }
            let mut out = std::fs::File::create(&outpath)
                .map_err(|e| format!("SU_EXTRACT_FAIL: create {e}"))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|e| format!("SU_EXTRACT_FAIL: write {e}"))?;
        }

        // Preserve unix permissions so executables stay executable.
        #[cfg(unix)]
        if let Some(mode) = entry.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&outpath, std::fs::Permissions::from_mode(mode));
        }
    }

    find_app_bundle(work_dir)
}

/// Mount a `.dmg`, copy the inner `.app` to `work_dir`, then detach.
/// Returns the path of the local copy of the `.app`.
pub fn extract_dmg(dmg_path: &Path, work_dir: &Path) -> Result<PathBuf, String> {
    let mount_dir = work_dir.join("mnt");
    std::fs::create_dir_all(&mount_dir).map_err(|e| format!("SU_HDIUTIL_FAIL: mkdir mount {e}"))?;

    let attach = std::process::Command::new("hdiutil")
        .arg("attach")
        .arg("-nobrowse")
        .arg("-readonly")
        .arg("-mountpoint")
        .arg(&mount_dir)
        .arg(dmg_path)
        .output()
        .map_err(|e| format!("SU_HDIUTIL_FAIL: spawn {e}"))?;
    if !attach.status.success() {
        return Err(format!(
            "SU_HDIUTIL_FAIL: attach exit {} {}",
            attach.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&attach.stderr).trim()
        ));
    }

    // Locate the .app inside the mounted volume.
    let app_in_mount = match find_app_bundle(&mount_dir) {
        Ok(p) => p,
        Err(e) => {
            let _ = std::process::Command::new("hdiutil")
                .arg("detach")
                .arg("-force")
                .arg(&mount_dir)
                .output();
            return Err(e);
        }
    };

    // Copy out so we can detach the disk image.
    let app_name = app_in_mount
        .file_name()
        .ok_or_else(|| "SU_EXTRACT_FAIL: app has no file name".to_string())?;
    let dest = work_dir.join(app_name);

    let cp = std::process::Command::new("/bin/cp")
        .arg("-R")
        .arg(&app_in_mount)
        .arg(&dest)
        .output()
        .map_err(|e| format!("SU_EXTRACT_FAIL: cp spawn {e}"))?;

    // Detach unconditionally before reporting cp success/failure so we don't
    // leak the mount.
    let _ = std::process::Command::new("hdiutil")
        .arg("detach")
        .arg("-force")
        .arg(&mount_dir)
        .output();

    if !cp.status.success() {
        return Err(format!(
            "SU_EXTRACT_FAIL: cp exit {} {}",
            cp.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&cp.stderr).trim()
        ));
    }

    Ok(dest)
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

    #[test]
    fn find_app_bundle_at_top_level() {
        let root = temp_subdir("bench-find-app-top");
        let app = root.join("Demo.app");
        std::fs::create_dir_all(app.join("Contents")).unwrap();
        let pick = find_app_bundle(&root).unwrap();
        assert_eq!(pick, app);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn find_app_bundle_recursive() {
        let root = temp_subdir("bench-find-app-nested");
        let app = root.join("inner/v1.0/Demo.app");
        std::fs::create_dir_all(app.join("Contents")).unwrap();
        let pick = find_app_bundle(&root).unwrap();
        assert_eq!(pick, app);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn find_app_bundle_errors_when_absent() {
        let root = temp_subdir("bench-find-app-none");
        std::fs::create_dir_all(root.join("inner")).unwrap();
        let err = find_app_bundle(&root).unwrap_err();
        assert!(err.starts_with("SU_EXTRACT_FAIL"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn extract_zip_round_trip() {
        use std::io::Write;
        use zip::write::SimpleFileOptions;

        let root = temp_subdir("bench-zip-extract");
        let zip_path = root.join("demo.zip");

        // Build a tiny in-memory zip containing Demo.app/Contents/Info.plist.
        {
            let file = std::fs::File::create(&zip_path).unwrap();
            let mut writer = zip::ZipWriter::new(file);
            let opts = SimpleFileOptions::default();
            writer
                .start_file("Demo.app/Contents/Info.plist", opts)
                .unwrap();
            writer.write_all(b"<plist/>").unwrap();
            writer
                .start_file("Demo.app/Contents/MacOS/Demo", opts.unix_permissions(0o755))
                .unwrap();
            writer.write_all(b"#!/bin/sh\n").unwrap();
            writer.finish().unwrap();
        }

        let work = root.join("work");
        std::fs::create_dir_all(&work).unwrap();
        let app = extract_zip(&zip_path, &work).unwrap();
        assert!(app.ends_with("Demo.app"));
        assert!(app.join("Contents/Info.plist").exists());
        assert!(app.join("Contents/MacOS/Demo").exists());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn cleanup_work_dir_removes_directory_tree() {
        let root = temp_subdir("bench-cleanup-tree");
        let nested = root.join("inner/deep");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("file.txt"), b"data").unwrap();
        assert!(root.exists());

        cleanup_work_dir(&root);
        assert!(!root.exists());
    }
}
