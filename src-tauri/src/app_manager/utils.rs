use super::types::AppInfo;
use std::collections::HashSet;
use std::path::Path;
use std::time::UNIX_EPOCH;

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
pub fn name_match_confidence(app_name: &str, bundle_id: &str, token: &str) -> f64 {
    let app_lower = app_name.to_lowercase();
    let token_lower = token.to_lowercase();
    let bundle_lower = bundle_id.to_lowercase();

    if app_lower == token_lower {
        return 1.0;
    }
    if app_lower.contains(&token_lower) || token_lower.contains(&app_lower) {
        return 0.85;
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
