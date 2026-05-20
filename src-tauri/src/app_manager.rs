use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

// ============================================================================
// Data Models
// ============================================================================

/// Identifies the installation source / package manager of an application.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceType {
    MacBundle,
    HomebrewCask,
    AppStore,
    Unknown,
}

impl std::fmt::Display for SourceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SourceType::MacBundle => write!(f, "MacBundle"),
            SourceType::HomebrewCask => write!(f, "Homebrew Cask"),
            SourceType::AppStore => write!(f, "App Store"),
            SourceType::Unknown => write!(f, "Unknown"),
        }
    }
}

/// Record of a management operation performed on an app.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationRecord {
    /// Unix timestamp in ms
    pub timestamp: u64,
    /// "upgrade" | "uninstall" | "launch" | "reveal"
    pub action: String,
    pub app_id: String,
    pub app_name: String,
    pub success: bool,
    /// Combined stdout + stderr
    pub output: String,
    pub exit_code: Option<i32>,
}

/// Result of an upgrade/uninstall operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    pub success: bool,
    pub message: String,
    pub exit_code: Option<i32>,
}

/// Per-app allowed actions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllowedActions {
    pub launch: bool,
    pub reveal: bool,
    pub upgrade: bool,
    pub uninstall: bool,
}

/// Represents a discovered macOS application.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub app_id: String,
    pub name: String,
    pub version: String,
    pub bundle_id: String,
    pub install_path: String,
    /// Legacy display label
    pub source: String,
    /// Canonical source type
    pub source_type: String,
    /// Identifier within the source (e.g. cask token)
    pub source_id: String,
    /// Confidence 0.0–1.0 for the source mapping
    pub source_confidence: f64,
    pub can_upgrade: bool,
    pub can_uninstall: bool,
    pub upgrade_available: bool,
    pub last_operation_result: Option<String>,
    pub last_modified: u64,
    pub is_system_app: bool,
    pub allowed_actions: AllowedActions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub apps: Vec<AppInfo>,
    pub total_count: usize,
    pub user_count: usize,
    pub system_count: usize,
    pub scan_time_ms: u64,
    pub brew_available: bool,
    pub managed_count: usize,
}

// ============================================================================
// Operation History – in-memory, thread-safe
// ============================================================================

static OPERATION_HISTORY: std::sync::LazyLock<Mutex<Vec<OperationRecord>>> =
    std::sync::LazyLock::new(|| Mutex::new(Vec::new()));

fn record_operation(record: OperationRecord) {
    if let Ok(mut history) = OPERATION_HISTORY.lock() {
        history.push(record);
        // Keep at most 100 entries
        if history.len() > 100 {
            history.remove(0);
        }
    }
}

// ============================================================================
// Homebrew Integration
// ============================================================================

const BREW_PATHS: &[&str] = &[
    "/opt/homebrew/bin/brew",
    "/usr/local/bin/brew",
    "/usr/bin/brew",
];

/// Locate the brew binary, trying known paths then PATH.
fn find_brew() -> Option<PathBuf> {
    for path in BREW_PATHS {
        let p = Path::new(path);
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }
    // Fall back to PATH lookup
    if let Ok(output) = Command::new("which").arg("brew").output() {
        let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path_str.is_empty() {
            return Some(PathBuf::from(path_str));
        }
    }
    None
}

/// Check if Homebrew is installed and usable.
pub fn is_brew_available() -> bool {
    find_brew().is_some()
}

/// Get the brew binary path string.
fn brew_path() -> Option<String> {
    find_brew().map(|p| p.to_string_lossy().to_string())
}

/// Run `brew list --cask` and return a set of installed cask tokens.
fn list_installed_casks(brew: &str) -> Result<HashSet<String>, String> {
    let output = Command::new(brew)
        .args(["list", "--cask"])
        .output()
        .map_err(|e| format!("Failed to run brew list --cask: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("brew list --cask failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let casks: HashSet<String> = stdout
        .lines()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();
    Ok(casks)
}

/// Run `brew outdated --cask` and return a set of casks with updates available.
fn list_outdated_casks(brew: &str) -> Result<HashSet<String>, String> {
    let output = Command::new(brew)
        .args(["outdated", "--cask"])
        .output()
        .map_err(|e| format!("Failed to run brew outdated --cask: {}", e))?;

    // brew outdated returns exit code 0 for no updates, non-zero if updates exist
    let stdout = String::from_utf8_lossy(&output.stdout);
    let outdated: HashSet<String> = stdout
        .lines()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();
    Ok(outdated)
}

/// Compute a confidence score (0.0–1.0) for matching an app name to a cask token.
fn cask_match_confidence(app_name: &str, bundle_id: &str, cask_token: &str) -> f64 {
    let app_lower = app_name.to_lowercase();
    let cask_lower = cask_token.to_lowercase();
    let bundle_lower = bundle_id.to_lowercase();

    // Exact match
    if app_lower == cask_lower {
        return 1.0;
    }

    // Cask token is substring of app name or vice versa
    if app_lower.contains(&cask_lower) || cask_lower.contains(&app_lower) {
        return 0.85;
    }

    // Normalize: strip spaces, hyphens, underscores
    let normalize = |s: &str| -> String {
        s.chars()
            .filter(|c| c.is_alphanumeric())
            .map(|c| c.to_ascii_lowercase())
            .collect()
    };
    let app_norm = normalize(&app_lower);
    let cask_norm = normalize(&cask_lower);
    if app_norm == cask_norm {
        return 0.9;
    }
    if app_norm.contains(&cask_norm) || cask_norm.contains(&app_norm) {
        return 0.7;
    }

    // Check bundle_id contains the cask token
    if bundle_lower.contains(&cask_lower) {
        return 0.75;
    }

    0.0
}

/// Map scanned apps to Homebrew cask entries.
fn map_apps_to_casks(
    _apps: &[AppInfo],
    brew: &str,
) -> Result<(HashSet<String>, HashSet<String>), String> {
    let installed = list_installed_casks(brew)?;
    let outdated = list_outdated_casks(brew)?;
    Ok((installed, outdated))
}

// ============================================================================
// Scanning helpers
// ============================================================================

const SCAN_DIRECTORIES: &[&str] = &["/Applications", "/System/Applications"];

fn user_applications_dir() -> Option<PathBuf> {
    dirs_next::home_dir().map(|home| home.join("Applications"))
}

fn make_app_id(bundle_id: &str, install_path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    bundle_id.hash(&mut hasher);
    install_path.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn read_plist_string(plist_xml: &str, key: &str) -> Option<String> {
    let pattern = format!("<key>{}</key>", key);
    let start = plist_xml.find(&pattern)?;
    let after_key = &plist_xml[start + pattern.len()..];
    let tag_start = after_key.find("<string>")?;
    let tag_end = after_key[tag_start..].find("</string>")?;
    let value = &after_key[tag_start + 8..tag_start + tag_end];
    Some(value.trim().to_string())
}

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

/// Scan a single directory for .app bundles (raw, no source mapping yet).
fn scan_directory_raw(dir: &Path, is_system: bool) -> Vec<(String, String, String, String, String, String, bool, u64)> {
    let mut results = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return results,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(true, |ext| ext != "app") {
            continue;
        }
        let real_path = match fs::canonicalize(&path) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let install_path = real_path.to_string_lossy().to_string();

        let (name, bundle_id, version, source_label) =
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

        results.push((app_id, name, bundle_id, version, install_path, source_label, is_system, last_modified));
    }
    results
}

fn deduplicate(apps: Vec<AppInfo>) -> Vec<AppInfo> {
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
    let mut raw_apps: Vec<(String, String, String, String, String, String, bool, u64)> = Vec::new();

    // Scan directories
    for dir in SCAN_DIRECTORIES {
        let path = Path::new(dir);
        if path.exists() {
            let is_system = dir.starts_with("/System");
            raw_apps.extend(scan_directory_raw(path, is_system));
        }
    }
    if let Some(user_dir) = user_applications_dir() {
        if user_dir.exists() {
            raw_apps.extend(scan_directory_raw(&user_dir, false));
        }
    }

    // --- Homebrew integration ---
    let brew = brew_path();
    let brew_available = brew.is_some();
    let mut installed_casks: HashSet<String> = HashSet::new();
    let mut outdated_casks: HashSet<String> = HashSet::new();

    if let Some(ref brew_bin) = brew {
        if let Ok((casks, outdated)) = map_apps_to_casks(&[], brew_bin) {
            installed_casks = casks;
            outdated_casks = outdated;
        }
    }

    // Build final AppInfo list with source mapping
    let mut apps: Vec<AppInfo> = Vec::new();

    for (app_id, name, bundle_id, version, install_path, source_label, is_system, last_modified) in raw_apps {
        // Source identification
        let (source_type, source_id, source_confidence, can_upgrade, can_uninstall, upgrade_available) =
            if is_system {
                // System apps: never manageable
                (SourceType::MacBundle.to_string(), String::new(), 1.0, false, false, false)
            } else {
                // Try to match against Homebrew casks
                let mut best_cask: Option<String> = None;
                let mut best_confidence = 0.0;

                for cask in &installed_casks {
                    let conf = cask_match_confidence(&name, &bundle_id, cask);
                    if conf > best_confidence {
                        best_confidence = conf;
                        best_cask = Some(cask.clone());
                    }
                }

                if best_confidence >= 0.5 {
                    let cask_token = best_cask.unwrap();
                    let is_outdated = outdated_casks.contains(&cask_token);
                    (
                        SourceType::HomebrewCask.to_string(),
                        cask_token.clone(),
                        best_confidence,
                        true,
                        true,
                        is_outdated,
                    )
                } else {
                    (
                        SourceType::MacBundle.to_string(),
                        String::new(),
                        1.0,
                        false,
                        false,
                        false,
                    )
                }
            };

        let allowed_actions = AllowedActions {
            launch: true,
            reveal: true,
            upgrade: can_upgrade,
            uninstall: can_uninstall && !is_system,
        };

        apps.push(AppInfo {
            app_id,
            name,
            version,
            bundle_id,
            install_path,
            source: source_label,
            source_type,
            source_id,
            source_confidence,
            can_upgrade,
            can_uninstall,
            upgrade_available,
            last_operation_result: None,
            last_modified,
            is_system_app: is_system,
            allowed_actions,
        });
    }

    apps = deduplicate(apps);
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let total_count = apps.len();
    let system_count = apps.iter().filter(|a| a.is_system_app).count();
    let user_count = total_count - system_count;
    let managed_count = apps.iter().filter(|a| a.can_upgrade || a.can_uninstall).count();
    let scan_time_ms = start.elapsed().as_millis() as u64;

    ScanResult {
        apps,
        total_count,
        user_count,
        system_count,
        scan_time_ms,
        brew_available,
        managed_count,
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

/// Check which managed apps have updates available.
/// Only meaningful for HomebrewCask source apps.
#[tauri::command]
pub fn check_managed_app_updates(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> Vec<String> {
    // Re-read outdated casks
    let outdated = get_outdated_casks();
    let apps = state.apps.lock().unwrap();
    app_ids
        .into_iter()
        .filter(|id| {
            if let Some(app) = apps.iter().find(|a| &a.app_id == id) {
                app.source_type == SourceType::HomebrewCask.to_string()
                    && outdated.contains(&app.source_id.to_lowercase())
            } else {
                false
            }
        })
        .collect()
}

#[tauri::command]
pub fn upgrade_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    // Safety: only allow upgrade for manageable apps
    let app = {
        let apps = state.apps.lock().unwrap();
        let app = apps
            .iter()
            .find(|a| a.app_id == app_id)
            .cloned()
            .ok_or_else(|| "Application not found".to_string())?;

        if !app.can_upgrade {
            return Err("This application cannot be upgraded".to_string());
        }
        app
    };

    let brew = brew_path().ok_or("Homebrew is not available")?;
    let cask_token = &app.source_id;

    let output = Command::new(&brew)
        .args(["upgrade", "--cask", cask_token])
        .output()
        .map_err(|e| format!("Failed to run brew upgrade: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined_output = format!("{}\n{}", stdout, stderr).trim().to_string();
    let success = output.status.success();
    let exit_code = output.status.code();

    let message = if success {
        format!("Successfully upgraded {}", app.name)
    } else {
        format!("Upgrade failed for {}: {}", app.name, stderr.trim())
    };

    record_operation(OperationRecord {
        timestamp: std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        action: "upgrade".into(),
        app_id: app.app_id.clone(),
        app_name: app.name.clone(),
        success,
        output: combined_output,
        exit_code,
    });

    Ok(OperationResult {
        success,
        message,
        exit_code,
    })
}

#[tauri::command]
pub fn uninstall_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    // Safety: only allow uninstall for manageable, non-system apps
    let app = {
        let apps = state.apps.lock().unwrap();
        let app = apps
            .iter()
            .find(|a| a.app_id == app_id)
            .cloned()
            .ok_or_else(|| "Application not found".to_string())?;

        if app.is_system_app {
            return Err("System applications cannot be uninstalled".to_string());
        }
        if !app.can_uninstall {
            return Err("This application cannot be uninstalled".to_string());
        }
        app
    };

    let brew = brew_path().ok_or("Homebrew is not available")?;
    let cask_token = &app.source_id;

    let output = Command::new(&brew)
        .args(["uninstall", "--cask", cask_token])
        .output()
        .map_err(|e| format!("Failed to run brew uninstall: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined_output = format!("{}\n{}", stdout, stderr).trim().to_string();
    let success = output.status.success();
    let exit_code = output.status.code();

    let message = if success {
        format!("Successfully uninstalled {}", app.name)
    } else {
        format!("Uninstall failed for {}: {}", app.name, stderr.trim())
    };

    record_operation(OperationRecord {
        timestamp: std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        action: "uninstall".into(),
        app_id: app.app_id.clone(),
        app_name: app.name.clone(),
        success,
        output: combined_output,
        exit_code,
    });

    Ok(OperationResult {
        success,
        message,
        exit_code,
    })
}

#[tauri::command]
pub fn get_app_operation_history(
    app_id: Option<String>,
) -> Vec<OperationRecord> {
    if let Ok(history) = OPERATION_HISTORY.lock() {
        let all: Vec<OperationRecord> = history.clone();
        if let Some(ref id) = app_id {
            all.into_iter().filter(|r| &r.app_id == id).collect()
        } else {
            all
        }
    } else {
        Vec::new()
    }
}

/// Helper: re-read outdated casks for update checks.
fn get_outdated_casks() -> HashSet<String> {
    if let Some(brew) = brew_path() {
        list_outdated_casks(&brew).unwrap_or_default()
    } else {
        HashSet::new()
    }
}

// ============================================================================
// Shared App State (managed by Tauri)
// ============================================================================

pub struct AppManagerState {
    pub apps: Mutex<Vec<AppInfo>>,
}

impl AppManagerState {
    pub fn new() -> Self {
        Self {
            apps: Mutex::new(Vec::new()),
        }
    }

    pub fn refresh_apps(&self, apps: Vec<AppInfo>) {
        if let Ok(mut guard) = self.apps.lock() {
            *guard = apps;
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

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
        assert_eq!(read_plist_string(xml, "NonExistent"), None);
    }

    #[test]
    fn test_cask_match_confidence_exact() {
        let conf = cask_match_confidence("Firefox", "org.mozilla.firefox", "firefox");
        assert_eq!(conf, 1.0);
    }

    #[test]
    fn test_cask_match_confidence_contains() {
        let conf = cask_match_confidence("Google Chrome", "com.google.Chrome", "google-chrome");
        assert!(conf >= 0.7);
    }

    #[test]
    fn test_cask_match_confidence_no_match() {
        let conf = cask_match_confidence("Safari", "com.apple.Safari", "firefox");
        assert_eq!(conf, 0.0);
    }

    #[test]
    fn test_deduplicate() {
        let app = AppInfo {
            app_id: "abc123".into(),
            name: "Test".into(),
            version: "1.0".into(),
            bundle_id: "com.test".into(),
            install_path: "/Applications/Test.app".into(),
            source: "Bundle".into(),
            source_type: SourceType::MacBundle.to_string(),
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
        };
        let dupe = app.clone();
        let result = deduplicate(vec![app, dupe]);
        assert_eq!(result.len(), 1);
    }
}
