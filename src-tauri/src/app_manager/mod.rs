pub mod macos;
pub mod windows;
pub mod linux;

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
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
    Winget,
    WindowsStore,
    MsiInstaller,
    Flatpak,
    Snap,
    Apt,
    Unknown,
}

impl std::fmt::Display for SourceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SourceType::MacBundle => write!(f, "MacBundle"),
            SourceType::HomebrewCask => write!(f, "Homebrew Cask"),
            SourceType::AppStore => write!(f, "App Store"),
            SourceType::Winget => write!(f, "winget"),
            SourceType::WindowsStore => write!(f, "Windows Store"),
            SourceType::MsiInstaller => write!(f, "MSI Installer"),
            SourceType::Flatpak => write!(f, "Flatpak"),
            SourceType::Snap => write!(f, "Snap"),
            SourceType::Apt => write!(f, "APT"),
            SourceType::Unknown => write!(f, "Unknown"),
        }
    }
}

/// Record of a management operation performed on an app.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationRecord {
    pub timestamp: u64,
    pub action: String,
    pub app_id: String,
    pub app_name: String,
    pub success: bool,
    pub output: String,
    pub exit_code: Option<i32>,
}

/// Result of a single upgrade/uninstall operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    pub success: bool,
    pub message: String,
    pub exit_code: Option<i32>,
}

/// Per-app result within a batch operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchItemResult {
    pub app_id: String,
    pub app_name: String,
    pub success: bool,
    pub message: String,
    pub exit_code: Option<i32>,
}

/// Aggregate result of a batch operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchOperationResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub results: Vec<BatchItemResult>,
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

/// Represents a discovered application (cross-platform).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub app_id: String,
    pub name: String,
    pub version: String,
    pub bundle_id: String,
    pub install_path: String,
    pub source: String,
    pub source_type: String,
    pub source_id: String,
    pub source_confidence: f64,
    pub can_upgrade: bool,
    pub can_uninstall: bool,
    pub upgrade_available: bool,
    pub last_operation_result: Option<String>,
    pub last_modified: u64,
    pub is_system_app: bool,
    pub allowed_actions: AllowedActions,
}

/// Capabilities available on the current platform.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    pub brew_available: bool,
    pub winget_available: bool,
    pub flatpak_available: bool,
    pub snap_available: bool,
    pub apt_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub apps: Vec<AppInfo>,
    pub total_count: usize,
    pub user_count: usize,
    pub system_count: usize,
    pub scan_time_ms: u64,
    pub managed_count: usize,
    pub platform_capabilities: PlatformCapabilities,
}

// ============================================================================
// Operation History – in-memory, thread-safe (shared across platforms)
// ============================================================================

static OPERATION_HISTORY: std::sync::LazyLock<Mutex<Vec<OperationRecord>>> =
    std::sync::LazyLock::new(|| Mutex::new(Vec::new()));

pub fn record_operation(record: OperationRecord) {
    if let Ok(mut history) = OPERATION_HISTORY.lock() {
        history.push(record);
        if history.len() > 100 {
            history.remove(0);
        }
    }
}

// ============================================================================
// Shared Utility Functions
// ============================================================================

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

// ============================================================================
// Shared App State
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
// Platform Detection
// ============================================================================

fn is_macos() -> bool {
    std::env::consts::OS == "macos"
}

fn is_windows() -> bool {
    std::env::consts::OS == "windows"
}

fn is_linux() -> bool {
    std::env::consts::OS == "linux"
}

// ============================================================================
// Tauri Commands – Cross-platform Dispatchers
// ============================================================================

#[tauri::command]
pub fn scan_installed_apps() -> ScanResult {
    if is_macos() {
        macos::scan_installed_apps()
    } else if is_windows() {
        windows::scan_installed_apps()
    } else if is_linux() {
        linux::scan_installed_apps()
    } else {
        ScanResult {
            apps: vec![],
            total_count: 0,
            user_count: 0,
            system_count: 0,
            scan_time_ms: 0,
            managed_count: 0,
            platform_capabilities: PlatformCapabilities {
                brew_available: false,
                winget_available: false,
                flatpak_available: false,
                snap_available: false,
                apt_available: false,
            },
        }
    }
}

#[tauri::command]
pub fn launch_app(app_path: String) -> Result<(), String> {
    if is_macos() {
        macos::launch_app(app_path)
    } else if is_windows() {
        windows::launch_app(app_path)
    } else if is_linux() {
        linux::launch_app(app_path)
    } else {
        Err("Unsupported platform".into())
    }
}

#[tauri::command]
pub fn reveal_app_in_finder(app_path: String) -> Result<(), String> {
    if is_macos() {
        macos::reveal_app_in_finder(app_path)
    } else if is_windows() {
        windows::reveal_in_explorer(app_path)
    } else if is_linux() {
        linux::reveal_in_file_manager(app_path)
    } else {
        Err("Unsupported platform".into())
    }
}

#[tauri::command]
pub fn check_managed_app_updates(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> Vec<String> {
    if is_macos() {
        macos::check_updates(app_ids, state)
    } else if is_windows() {
        windows::check_updates(app_ids, state)
    } else if is_linux() {
        linux::check_updates(app_ids, state)
    } else {
        vec![]
    }
}

#[tauri::command]
pub fn upgrade_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    if is_macos() {
        macos::upgrade_app(app_id, state)
    } else if is_windows() {
        windows::upgrade_app(app_id, state)
    } else if is_linux() {
        linux::upgrade_app(app_id, state)
    } else {
        Err("Unsupported platform".into())
    }
}

#[tauri::command]
pub fn uninstall_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    if is_macos() {
        macos::uninstall_app(app_id, state)
    } else if is_windows() {
        windows::uninstall_app(app_id, state)
    } else if is_linux() {
        linux::uninstall_app(app_id, state)
    } else {
        Err("Unsupported platform".into())
    }
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

// ============================================================================
// Batch Commands
// ============================================================================

#[tauri::command]
pub fn batch_upgrade_apps(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> BatchOperationResult {
    let mut results = Vec::new();
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    for app_id in &app_ids {
        let result = upgrade_app(app_id.clone(), state.clone());
        match result {
            Ok(r) => {
                let item = BatchItemResult {
                    app_id: app_id.clone(),
                    app_name: String::new(),
                    success: r.success,
                    message: r.message,
                    exit_code: r.exit_code,
                };
                if r.success {
                    succeeded += 1;
                } else {
                    failed += 1;
                }
                results.push(item);
            }
            Err(e) => {
                failed += 1;
                results.push(BatchItemResult {
                    app_id: app_id.clone(),
                    app_name: String::new(),
                    success: false,
                    message: e,
                    exit_code: None,
                });
            }
        }
    }

    BatchOperationResult {
        total: app_ids.len(),
        succeeded,
        failed,
        results,
    }
}

#[tauri::command]
pub fn batch_uninstall_apps(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> BatchOperationResult {
    let mut results = Vec::new();
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    for app_id in &app_ids {
        let result = uninstall_app(app_id.clone(), state.clone());
        match result {
            Ok(r) => {
                let item = BatchItemResult {
                    app_id: app_id.clone(),
                    app_name: String::new(),
                    success: r.success,
                    message: r.message,
                    exit_code: r.exit_code,
                };
                if r.success {
                    succeeded += 1;
                } else {
                    failed += 1;
                }
                results.push(item);
            }
            Err(e) => {
                failed += 1;
                results.push(BatchItemResult {
                    app_id: app_id.clone(),
                    app_name: String::new(),
                    success: false,
                    message: e,
                    exit_code: None,
                });
            }
        }
    }

    BatchOperationResult {
        total: app_ids.len(),
        succeeded,
        failed,
        results,
    }
}

#[tauri::command]
pub fn refresh_app_updates(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> Vec<String> {
    check_managed_app_updates(app_ids, state)
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
        };
        let dupe = app.clone();
        let result = deduplicate(vec![app, dupe]);
        assert_eq!(result.len(), 1);
    }
}
