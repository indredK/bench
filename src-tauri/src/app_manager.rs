use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;

/// Represents a discovered macOS application.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    /// Stable identifier: bundle_id + install_path hash
    pub app_id: String,
    /// Display name from Info.plist (CFBundleDisplayName) or fallback to file stem
    pub name: String,
    /// Short or full version string from Info.plist
    pub version: String,
    /// Bundle identifier (e.g. com.apple.Safari)
    pub bundle_id: String,
    /// Absolute path to the .app bundle
    pub install_path: String,
    /// Source label – "Bundle" if Info.plist was readable, "Unknown" otherwise
    pub source: String,
    /// Last modification timestamp in seconds since UNIX epoch
    pub last_modified: u64,
    /// Whether the app lives under /System/Applications
    pub is_system_app: bool,
    /// Actions that are currently allowed for this app
    pub allowed_actions: AllowedActions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllowedActions {
    pub launch: bool,
    pub reveal: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub apps: Vec<AppInfo>,
    pub total_count: usize,
    pub user_count: usize,
    pub system_count: usize,
    pub scan_time_ms: u64,
}

/// Directories to scan for .app bundles on macOS.
const SCAN_DIRECTORIES: &[&str] = &["/Applications", "/System/Applications"];

/// Name of the user's home Applications directory (resolved at runtime).
fn user_applications_dir() -> Option<PathBuf> {
    dirs_next::home_dir().map(|home| home.join("Applications"))
}

/// Compute a stable app_id from bundle_id and install_path.
fn make_app_id(bundle_id: &str, install_path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    bundle_id.hash(&mut hasher);
    install_path.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

/// Read a string value from an Info.plist plist dictionary.
/// Uses a minimal XML plist parser to avoid pulling in heavy dependencies.
fn read_plist_string(plist_xml: &str, key: &str) -> Option<String> {
    // Simple XML-based extraction – robust enough for well-formed Info.plist files.
    let pattern = format!("<key>{}</key>", key);
    let start = plist_xml.find(&pattern)?;
    let after_key = &plist_xml[start + pattern.len()..];

    // Find the next <string>...</string> after this key
    let tag_start = after_key.find("<string>")?;
    let tag_end = after_key[tag_start..].find("</string>")?;
    let value = &after_key[tag_start + 8..tag_start + tag_end];
    Some(value.trim().to_string())
}

/// Extract metadata from a .app bundle's Contents/Info.plist.
fn extract_app_metadata(app_path: &Path) -> Option<(String, String, String)> {
    let plist_path = app_path.join("Contents").join("Info.plist");
    let plist_content = fs::read_to_string(&plist_path).ok()?;

    let display_name = read_plist_string(&plist_content, "CFBundleDisplayName")
        .or_else(|| read_plist_string(&plist_content, "CFBundleName"));

    let bundle_id = read_plist_string(&plist_content, "CFBundleIdentifier");
    let version = read_plist_string(&plist_content, "CFBundleShortVersionString")
        .or_else(|| read_plist_string(&plist_content, "CFBundleVersion"));

    let name = display_name
        .or_else(|| {
            app_path
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "Unknown".to_string());

    let bundle_id = bundle_id.unwrap_or_else(|| "unknown".to_string());
    let version = version.unwrap_or_else(|| "—".to_string());

    Some((name, bundle_id, version))
}

/// Get last modification time of a path in seconds since UNIX epoch.
fn get_last_modified(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

/// Scan a single directory for .app bundles.
fn scan_directory(dir: &Path, is_system: bool) -> Vec<AppInfo> {
    let mut apps = Vec::new();

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return apps,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(true, |ext| ext != "app") {
            continue;
        }

        // Skip symlinks that point to already-scanned locations
        let real_path = match fs::canonicalize(&path) {
            Ok(p) => p,
            Err(_) => continue,
        };

        let install_path = real_path.to_string_lossy().to_string();

        let (name, bundle_id, version, source) =
            if let Some((name, bid, ver)) = extract_app_metadata(&real_path) {
                (name, bid, ver, "Bundle".to_string())
            } else {
                let name = real_path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string();
                (name, "unknown".to_string(), "—".to_string(), "Unknown".to_string())
            };

        let last_modified = get_last_modified(&real_path);

        let app_id = make_app_id(&bundle_id, &install_path);

        // Determine if this is a system app
        let is_system_app = is_system;

        // All macOS .app bundles can be revealed and launched
        let allowed_actions = AllowedActions {
            launch: true,
            reveal: true,
        };

        apps.push(AppInfo {
            app_id,
            name,
            version,
            bundle_id,
            install_path,
            source,
            last_modified,
            is_system_app,
            allowed_actions,
        });
    }

    apps
}

/// Deduplicate apps by app_id.
fn deduplicate_apps(apps: Vec<AppInfo>) -> Vec<AppInfo> {
    use std::collections::HashSet;
    let mut seen = HashSet::new();
    apps.into_iter()
        .filter(|app| seen.insert(app.app_id.clone()))
        .collect()
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub fn scan_installed_apps() -> ScanResult {
    let start = std::time::Instant::now();
    let mut all_apps: Vec<AppInfo> = Vec::new();

    // Scan system directories
    for dir in SCAN_DIRECTORIES {
        let path = Path::new(dir);
        if path.exists() {
            let is_system = dir.starts_with("/System");
            all_apps.extend(scan_directory(path, is_system));
        }
    }

    // Scan user Applications directory
    if let Some(user_dir) = user_applications_dir() {
        if user_dir.exists() {
            all_apps.extend(scan_directory(&user_dir, false));
        }
    }

    // Deduplicate
    all_apps = deduplicate_apps(all_apps);

    // Sort by name (case-insensitive)
    all_apps.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
    });

    let total_count = all_apps.len();
    let system_count = all_apps.iter().filter(|a| a.is_system_app).count();
    let user_count = total_count - system_count;
    let scan_time_ms = start.elapsed().as_millis() as u64;

    ScanResult {
        apps: all_apps,
        total_count,
        user_count,
        system_count,
        scan_time_ms,
    }
}

#[tauri::command]
pub fn launch_app(app_path: String) -> Result<(), String> {
    let path = Path::new(&app_path);
    if !path.exists() {
        return Err(format!("Application not found: {}", app_path));
    }

    let status = Command::new("open")
        .arg(&app_path)
        .status()
        .map_err(|e| format!("Failed to launch: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Launch command exited with status: {}", status))
    }
}

#[tauri::command]
pub fn reveal_app_in_finder(app_path: String) -> Result<(), String> {
    let path = Path::new(&app_path);
    if !path.exists() {
        return Err(format!("Application not found: {}", app_path));
    }

    let status = Command::new("open")
        .arg("-R")
        .arg(&app_path)
        .status()
        .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Reveal command exited with status: {}", status))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_app_id_stable() {
        let id1 = make_app_id("com.example.app", "/Applications/Test.app");
        let id2 = make_app_id("com.example.app", "/Applications/Test.app");
        assert_eq!(id1, id2);

        let id3 = make_app_id("com.example.other", "/Applications/Test.app");
        assert_ne!(id1, id3);
    }

    #[test]
    fn test_read_plist_string() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>CFBundleDisplayName</key>
    <string>Safari</string>
    <key>CFBundleIdentifier</key>
    <string>com.apple.Safari</string>
</dict>
</plist>"#;
        assert_eq!(
            read_plist_string(xml, "CFBundleDisplayName"),
            Some("Safari".to_string())
        );
        assert_eq!(
            read_plist_string(xml, "CFBundleIdentifier"),
            Some("com.apple.Safari".to_string())
        );
        assert_eq!(read_plist_string(xml, "NonExistent"), None);
    }

    #[test]
    fn test_deduplicate_apps() {
        let app = AppInfo {
            app_id: "abc123".into(),
            name: "Test".into(),
            version: "1.0".into(),
            bundle_id: "com.test".into(),
            install_path: "/Applications/Test.app".into(),
            source: "Bundle".into(),
            last_modified: 0,
            is_system_app: false,
            allowed_actions: AllowedActions {
                launch: true,
                reveal: true,
            },
        };
        let dupe = app.clone();
        let result = deduplicate_apps(vec![app, dupe]);
        assert_eq!(result.len(), 1);
    }
}
