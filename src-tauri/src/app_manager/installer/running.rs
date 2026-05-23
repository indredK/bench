use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread::sleep;
use std::time::{Duration, Instant};

/// Read a single key from a `.app`'s Info.plist via `plutil`. Returns `None`
/// when the file is missing or the key is absent.
fn read_info_plist_key(app_path: &Path, key: &str) -> Option<String> {
    let plist = app_path.join("Contents/Info.plist");
    if !plist.exists() {
        return None;
    }
    let out = Command::new("/usr/bin/plutil")
        .arg("-extract")
        .arg(key)
        .arg("raw")
        .arg("-o")
        .arg("-")
        .arg(&plist)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

/// `CFBundleIdentifier` from the bundle's Info.plist — used by AppleScript
/// to address the app for `tell application id "..." to quit`.
pub fn read_bundle_id(app_path: &Path) -> Option<String> {
    read_info_plist_key(app_path, "CFBundleIdentifier")
}

/// Resolve `<bundle>/Contents/MacOS/<CFBundleExecutable>`. Returns `None`
/// when the executable name can't be read from the plist.
pub fn read_executable_path(app_path: &Path) -> Option<PathBuf> {
    let name = read_info_plist_key(app_path, "CFBundleExecutable")?;
    Some(app_path.join("Contents/MacOS").join(name))
}

/// True when any process currently has the bundle's executable open. Uses
/// `lsof -t <executable>` which avoids the regex escaping pitfalls of
/// `pgrep -f`.
pub fn is_running(app_path: &Path) -> bool {
    let Some(exec) = read_executable_path(app_path) else {
        return false;
    };
    let out = match Command::new("/usr/sbin/lsof").arg("-t").arg(&exec).output() {
        Ok(o) => o,
        Err(_) => return false,
    };
    // lsof exits non-zero when there are no matches — both cases mean "not
    // running" for our purposes.
    out.status.success() && !output_is_blank(&out.stdout)
}

fn output_is_blank(b: &[u8]) -> bool {
    b.iter().all(|c| c.is_ascii_whitespace())
}

/// Send an AppleScript `quit` to the app by its bundle id. Returns true when
/// `osascript` exited cleanly — the app may still be in the middle of
/// shutting down; pair with `wait_for_quit`.
pub fn request_quit(bundle_id: &str) -> bool {
    let script = format!(r#"tell application id "{bundle_id}" to quit"#);
    Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(&script)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Poll `is_running` until it returns false or the timeout elapses.
/// Returns true when the app is no longer running.
pub fn wait_for_quit(app_path: &Path, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if !is_running(app_path) {
            return true;
        }
        sleep(Duration::from_millis(250));
    }
    !is_running(app_path)
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
    fn read_bundle_id_returns_none_for_nonexistent_path() {
        let fake = std::env::temp_dir().join("bench-running-missing.app");
        assert!(read_bundle_id(&fake).is_none());
    }

    #[test]
    fn read_executable_path_returns_none_without_info_plist() {
        let root = temp_subdir("bench-running-no-plist");
        let app = root.join("Demo.app");
        std::fs::create_dir_all(app.join("Contents")).unwrap();
        assert!(read_executable_path(&app).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn is_running_returns_false_when_executable_cannot_be_resolved() {
        let fake = std::env::temp_dir().join("bench-running-missing.app");
        assert!(!is_running(&fake));
    }

    #[test]
    fn output_is_blank_recognises_whitespace_only() {
        assert!(output_is_blank(b""));
        assert!(output_is_blank(b"\n  \t\n"));
        assert!(!output_is_blank(b"12345\n"));
    }
}
