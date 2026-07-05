use std::io;
use std::path::Path;
use std::process::Command;

/// Best-effort `xattr -rd com.apple.quarantine <path>` used after in-place installs.
pub fn remove_quarantine(path: &Path) -> io::Result<()> {
    let _ = Command::new("/usr/bin/xattr")
        .arg("-rd")
        .arg("com.apple.quarantine")
        .arg(path)
        .output()?;
    Ok(())
}

/// Clears extended attributes recursively (`xattr -cr`) so Gatekeeper no longer
/// blocks a downloaded `.app` bundle with "damaged" / quarantine errors.
pub fn authorize_app_bundle(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Application not found: {}", path.display()));
    }
    if path.extension().and_then(|ext| ext.to_str()) != Some("app") {
        return Err("Path is not an application bundle (.app)".into());
    }

    let output = Command::new("/usr/bin/xattr")
        .arg("-cr")
        .arg(path)
        .output()
        .map_err(|e| format!("Failed to run xattr: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "xattr exited with status {}: {}",
            output.status, stderr.trim()
        ))
    }
}
