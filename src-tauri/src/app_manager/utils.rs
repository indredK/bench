use super::types::AppInfo;
use std::collections::HashSet;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, UNIX_EPOCH};

pub fn run_command_with_timeout(
    cmd: &mut Command,
    timeout: Duration,
) -> Result<std::process::Output, String> {
    let child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let child_arc = Arc::new(Mutex::new(Some(child)));
    let child_clone = child_arc.clone();

    let (tx, rx) = std::sync::mpsc::channel();

    thread::spawn(move || {
        let output = child_clone
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .wait_with_output();
        let _ = tx.send(output);
    });

    match rx.recv_timeout(timeout) {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(e)) => Err(format!("Command failed: {}", e)),
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
            if let Ok(mut guard) = child_arc.lock() {
                if let Some(ref mut c) = *guard {
                    let _ = c.kill();
                }
            }
            thread::sleep(Duration::from_millis(200));
            Err("Command timed out".to_string())
        }
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            Err("Command channel disconnected".to_string())
        }
    }
}

/// Compute a stable app_id from identifiers.
pub fn make_app_id(bundle_id: &str, install_path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    bundle_id.hash(&mut hasher);
    install_path.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

/// Get last modification time in seconds since UNIX epoch.
pub fn get_last_modified(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

/// Deduplicate apps by app_id.
pub fn deduplicate(apps: Vec<AppInfo>) -> Vec<AppInfo> {
    let mut seen = HashSet::new();
    apps.into_iter()
        .filter(|app| seen.insert(app.app_id.clone()))
        .collect()
}

/// Generic name-match confidence for package manager tokens.
///
/// A package manager token (e.g. brew cask `microsoft-edge`, apt package
/// `firefox`) is compared against an installed app's display name and bundle
/// id. Returns a confidence score in `[0.0, 1.0]`; the caller decides the
/// threshold for "managed by this source" (currently 0.5 in domain.rs).
///
/// Short tokens (≤ 3 chars, e.g. `go`, `r`, `vim`, `gh`) accept ONLY exact /
/// normalized-exact / bundle-segment-equals matches. Without this guard, the
/// generic substring branches matched far too liberally — e.g. token `go`
/// would match "Google Chrome" with confidence 0.85, incorrectly attributing
/// the cask to an unrelated app (#016). Even a plain `contains` on the
/// lowercased bundle id was too loose because `com.google.Chrome` contains
/// "go", so we now require a dot-separated segment to equal the token.
pub fn name_match_confidence(app_name: &str, bundle_id: &str, token: &str) -> f64 {
    let app_lower = app_name.to_lowercase();
    let token_lower = token.to_lowercase();
    let bundle_lower = bundle_id.to_lowercase();

    if app_lower == token_lower {
        return 1.0;
    }

    let normalize = |s: &str| -> String {
        s.chars()
            .filter(|c| c.is_alphanumeric())
            .map(|c| c.to_ascii_lowercase())
            .collect()
    };
    let app_norm = normalize(&app_lower);
    let token_norm = normalize(&token_lower);
    if app_norm == token_norm {
        return 0.9;
    }

    // Short tokens are too ambiguous for fuzzy substring matching — `go` is
    // a substring of "Google Chrome", `r` is in nearly everything. For tokens
    // ≤ 3 chars require either an exact-name hit (handled above) or a bundle
    // id whose dot-separated segment equals the token. Plain `contains` on
    // the bundle id was too liberal: `com.google.Chrome` contains "go" yet
    // Chrome is unrelated to the brew formula `go` (#016).
    let token_norm_len = token_norm.chars().count();
    if token_norm_len <= 3 {
        let any_segment_equals = bundle_lower
            .split(|c: char| !c.is_alphanumeric())
            .any(|seg| seg == token_lower);
        if any_segment_equals {
            return 0.75;
        }
        return 0.0;
    }

    if app_lower.contains(&token_lower) || token_lower.contains(&app_lower) {
        return 0.85;
    }
    if app_norm.contains(&token_norm) || token_norm.contains(&app_norm) {
        return 0.7;
    }
    if bundle_lower.contains(&token_lower) {
        return 0.75;
    }
    0.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_manager::types::{AllowedActions, SourceType};

    #[test]
    fn test_make_app_id_stable() {
        let id1 = make_app_id("com.example.app", "/Applications/Test.app");
        let id2 = make_app_id("com.example.app", "/Applications/Test.app");
        assert_eq!(id1, id2);
        let id3 = make_app_id("com.example.other", "/Applications/Test.app");
        assert_ne!(id1, id3);
    }

    #[test]
    fn test_name_match_confidence_exact() {
        let conf = name_match_confidence("Firefox", "org.mozilla.firefox", "firefox");
        assert_eq!(conf, 1.0);
    }

    #[test]
    fn test_name_match_confidence_contains() {
        let conf = name_match_confidence("Google Chrome", "com.google.Chrome", "google-chrome");
        assert!(conf >= 0.7);
    }

    #[test]
    fn test_name_match_confidence_no_match() {
        let conf = name_match_confidence("Safari", "com.apple.Safari", "firefox");
        assert_eq!(conf, 0.0);
    }

    #[test]
    fn test_name_match_short_token_does_not_substring_match() {
        // Regression #016: token "go" (cask `go` formula) used to match
        // "Google Chrome" with confidence 0.85 because contains() succeeded,
        // making Chrome appear brew-managed when it wasn't. Even via the
        // bundle-id fallback (com.google.Chrome contains "go"), the loose
        // contains() still produced a false positive. The guard now requires
        // a dot-separated segment to equal the token.
        assert_eq!(
            name_match_confidence("Google Chrome", "com.google.Chrome", "go"),
            0.0
        );
        assert_eq!(
            name_match_confidence("RStudio", "com.rstudio.desktop", "r"),
            0.0
        );
        assert_eq!(
            name_match_confidence("Visual Studio Code", "com.microsoft.VSCode", "vi"),
            0.0
        );
    }

    #[test]
    fn test_name_match_short_token_matches_bundle_id() {
        // Short tokens are still allowed to match when a bundle-id segment
        // equals the token — generally more specific than a substring hit.
        assert!(name_match_confidence("Go Lang", "io.golang.go", "go") > 0.0);
        assert!(name_match_confidence("R Lang", "org.r-project.r", "r") > 0.0);
    }

    #[test]
    fn test_name_match_short_token_still_matches_exactly() {
        // Exact short-token matches must still be accepted; the guard only
        // disables fuzzy substring matching for tokens ≤ 3 chars.
        assert_eq!(name_match_confidence("Go", "io.golang.go", "go"), 1.0);
        assert_eq!(name_match_confidence("R", "org.r-project.R", "r"), 1.0);
    }

    #[test]
    fn test_deduplicate() {
        let app = AppInfo {
            app_id: "abc123".into(),
            name: "Test".into(),
            version: "1.0".into(),
            bundle_id: "com.test".into(),
            install_path: "/Apps/Test".into(),
            source: "Bundle".into(),
            source_type: SourceType::Unknown.to_string(),
            source_id: String::new(),
            source_confidence: 1.0,
            can_upgrade: false,
            can_uninstall: false,
            upgrade_available: false,
            last_operation_result: None,
            last_modified: 0,
            is_system_app: false,
            allowed_actions: AllowedActions {
                launch: true,
                reveal: true,
                upgrade: false,
                uninstall: false,
            },
            icon_base64: None,
        };
        let dupe = app.clone();
        let result = deduplicate(vec![app, dupe]);
        assert_eq!(result.len(), 1);
    }
}
