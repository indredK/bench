pub mod macos;
pub mod windows;
pub mod linux;

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::Manager;

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
    pub error_code: Option<String>,
    pub permission_issue: bool,
}

impl OperationRecord {
    pub fn new(action: &str, app_id: &str, app_name: &str, success: bool, output: &str, exit_code: Option<i32>) -> Self {
        let permission_issue = !success && (
            output.contains("permission denied") ||
            output.contains("Permission denied") ||
            output.contains("not permitted") ||
            output.contains("root") ||
            output.contains("sudo") ||
            output.contains("administrator") ||
            output.contains("Access is denied") ||
            exit_code == Some(5) // EACCES on macOS
        );
        let error_code = if !success {
            if permission_issue { Some("PERMISSION_DENIED".into()) }
            else if output.contains("not found") || output.contains("Not found") { Some("NOT_FOUND".into()) }
            else if output.contains("locked") || output.contains("Lock") { Some("LOCKED".into()) }
            else { Some("GENERIC_ERROR".into()) }
        } else { None };

        OperationRecord {
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64,
            action: action.into(), app_id: app_id.into(), app_name: app_name.into(),
            success, output: output.into(), exit_code, error_code, permission_issue,
        }
    }
}

/// Result of a single upgrade/uninstall operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    pub success: bool,
    pub message: String,
    pub exit_code: Option<i32>,
    pub error_code: Option<String>,
    pub permission_issue: bool,
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
    pub icon_base64: Option<String>,
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
    /// Unix timestamp in ms of when this scan completed
    pub last_scan_time: u64,
    /// Unix timestamp in ms of the last update check (0 if never)
    pub last_update_check: u64,
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
    /// Set of app_ids currently undergoing an operation (upgrade/uninstall)
    pub in_progress: Mutex<HashSet<String>>,
    /// Cache of the last scan result
    pub cached_result: Mutex<Option<ScanResult>>,
    /// Timestamp in ms of last scan
    pub last_scan_time: Mutex<u64>,
    /// Timestamp in ms of last update check
    pub last_update_check_time: Mutex<u64>,
}

impl AppManagerState {
    pub fn new() -> Self {
        Self {
            apps: Mutex::new(Vec::new()),
            in_progress: Mutex::new(HashSet::new()),
            cached_result: Mutex::new(None),
            last_scan_time: Mutex::new(0),
            last_update_check_time: Mutex::new(0),
        }
    }

    #[allow(dead_code)]
    pub fn refresh_apps(&self, apps: Vec<AppInfo>) {
        if let Ok(mut guard) = self.apps.lock() {
            *guard = apps;
        }
    }

    /// Try to acquire a lock on an app_id for an operation. Returns false if already locked.
    pub fn acquire_op_lock(&self, app_id: &str) -> bool {
        if let Ok(mut guard) = self.in_progress.lock() {
            guard.insert(app_id.to_string())
        } else {
            false
        }
    }

    /// Release the operation lock on an app_id.
    pub fn release_op_lock(&self, app_id: &str) {
        if let Ok(mut guard) = self.in_progress.lock() {
            guard.remove(app_id);
        }
    }

    /// Cache scan result and update timestamp.
    pub fn cache_scan_result(&self, result: ScanResult) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64;
        if let Ok(mut c) = self.cached_result.lock() { *c = Some(result); }
        if let Ok(mut t) = self.last_scan_time.lock() { *t = now; }
    }

    /// Update last update check timestamp.
    pub fn mark_update_check(&self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64;
        if let Ok(mut t) = self.last_update_check_time.lock() { *t = now; }
    }

    /// Get cached scan if available.
    #[allow(dead_code)]
    pub fn get_cached_scan(&self) -> Option<ScanResult> {
        if let Ok(c) = self.cached_result.lock() { c.clone() } else { None }
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

fn empty_scan_result() -> ScanResult {
    ScanResult {
        apps: vec![], total_count: 0, user_count: 0, system_count: 0,
        scan_time_ms: 0, managed_count: 0,
        platform_capabilities: PlatformCapabilities {
            brew_available: false, winget_available: false,
            flatpak_available: false, snap_available: false, apt_available: false,
        },
        last_scan_time: 0, last_update_check: 0,
    }
}

#[tauri::command]
pub async fn scan_installed_apps(app: tauri::AppHandle) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppManagerState> = app.state();
        let result = if is_macos() {
            macos::scan_installed_apps(state.clone())
        } else if is_windows() {
            windows::scan_installed_apps()
        } else if is_linux() {
            linux::scan_installed_apps()
        } else {
            empty_scan_result()
        };

        // Cache the result
        if !result.apps.is_empty() {
            state.cache_scan_result(result.clone());
        }
        result
    })
    .await
    .map_err(|e| e.to_string())
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
    state.mark_update_check();
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
    // Operation locking – prevent duplicate concurrent operations
    if !state.acquire_op_lock(&app_id) {
        return Ok(OperationResult {
            success: false,
            message: "This application is currently being modified. Please wait.".into(),
            exit_code: None,
            error_code: Some("LOCKED".into()),
            permission_issue: false,
        });
    }

    let result = if is_macos() {
        macos::upgrade_app(app_id.clone(), state.clone())
    } else if is_windows() {
        windows::upgrade_app(app_id.clone(), state.clone())
    } else if is_linux() {
        linux::upgrade_app(app_id.clone(), state.clone())
    } else {
        Err("Unsupported platform".into())
    };

    state.release_op_lock(&app_id);
    result
}

#[tauri::command]
pub fn uninstall_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    if !state.acquire_op_lock(&app_id) {
        return Ok(OperationResult {
            success: false,
            message: "This application is currently being modified. Please wait.".into(),
            exit_code: None,
            error_code: Some("LOCKED".into()),
            permission_issue: false,
        });
    }

    let result = if is_macos() {
        macos::uninstall_app(app_id.clone(), state.clone())
    } else if is_windows() {
        windows::uninstall_app(app_id.clone(), state.clone())
    } else if is_linux() {
        linux::uninstall_app(app_id.clone(), state.clone())
    } else {
        Err("Unsupported platform".into())
    };

    state.release_op_lock(&app_id);
    result
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
            icon_base64: None,
        };
        let dupe = app.clone();
        let result = deduplicate(vec![app, dupe]);
        assert_eq!(result.len(), 1);
    }
}
