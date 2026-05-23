use serde::{Deserialize, Serialize};

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
    pub fn new(
        action: &str,
        app_id: &str,
        app_name: &str,
        success: bool,
        output: &str,
        exit_code: Option<i32>,
    ) -> Self {
        let permission_issue = !success
            && (output.contains("permission denied")
                || output.contains("Permission denied")
                || output.contains("not permitted")
                || output.contains("root")
                || output.contains("sudo")
                || output.contains("administrator")
                || output.contains("Access is denied")
                || exit_code == Some(5));
        let error_code = if !success {
            if permission_issue {
                Some("PERMISSION_DENIED".into())
            } else if output.contains("not found") || output.contains("Not found") {
                Some("NOT_FOUND".into())
            } else if output.contains("locked") || output.contains("Lock") {
                Some("LOCKED".into())
            } else {
                Some("GENERIC_ERROR".into())
            }
        } else {
            None
        };

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        OperationRecord {
            timestamp: now,
            action: action.into(),
            app_id: app_id.into(),
            app_name: app_name.into(),
            success,
            output: output.into(),
            exit_code,
            error_code,
            permission_issue,
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

/// Installation source parameters for installing a recommended app.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSource {
    pub brew: Option<String>,
    pub winget: Option<String>,
    pub apt: Option<String>,
    pub flatpak: Option<String>,
    pub snap: Option<String>,
    pub url: Option<String>,
}

/// Item for batch install.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchInstallItem {
    pub app_id: String,
    pub install_source: InstallSource,
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

/// Identifies the update channel a discovered update came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdateSource {
    Homebrew,
    MacAppStore,
    Sparkle,
    Electron,
    Squirrel,
    GitHub,
}

impl std::fmt::Display for UpdateSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UpdateSource::Homebrew => write!(f, "Homebrew"),
            UpdateSource::MacAppStore => write!(f, "MacAppStore"),
            UpdateSource::Sparkle => write!(f, "Sparkle"),
            UpdateSource::Electron => write!(f, "Electron"),
            UpdateSource::Squirrel => write!(f, "Squirrel"),
            UpdateSource::GitHub => write!(f, "GitHub"),
        }
    }
}

/// Describes a single available update for an app, regardless of its source.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub app_id: String,
    pub app_name: String,
    pub source: UpdateSource,
    pub current_version: String,
    pub latest_version: String,
    pub download_url: Option<String>,
    pub adam_id: Option<String>,
    pub release_notes_url: Option<String>,
    pub release_notes_inline: Option<String>,
    pub size: Option<u64>,
    pub source_meta: Option<serde_json::Value>,
    pub feed_url: Option<String>,
    #[serde(default)]
    pub ignored: bool,
}

/// Phase of an in-progress app update install (v1.2). Tagged enum so the
/// frontend can pattern-match `{ phase: "downloading", percent: 42, ... }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "phase")]
pub enum InstallPhase {
    Queued,
    Downloading {
        percent: u8,
        bytes_total: Option<u64>,
    },
    Verifying,
    DeveloperIdChanged {
        old: String,
        new: String,
    },
    Extracting,
    Replacing,
    Finalizing,
    Done,
    Failed {
        code: String,
        message: String,
    },
    RolledBack {
        reason: String,
    },
}

/// Event payload for `app-update-install:progress` (v1.2).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgressEvent {
    pub app_id: String,
    #[serde(flatten)]
    pub phase: InstallPhase,
    pub elapsed_ms: u64,
}

/// Event payload for `app-update-install:finished` (v1.2).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallFinishedEvent {
    pub app_id: String,
    pub success: bool,
    pub message: String,
    pub error_code: Option<String>,
}
