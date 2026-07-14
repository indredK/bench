use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct SleepConfig {
    pub prevent_sleep: bool,
    pub prevent_display: bool,
    pub auto_disable_on_exit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct SleepState {
    pub enabled: bool,
    pub since: Option<i64>,
    pub config: SleepConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginItem {
    pub name: String,
    pub path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchService {
    pub name: String,
    pub path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PingResult {
    pub host: String,
    pub packets_sent: u32,
    pub packets_received: u32,
    pub min_rtt: f64,
    pub avg_rtt: f64,
    pub max_rtt: f64,
    pub loss_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortCheckResult {
    pub host: String,
    pub port: u16,
    pub open: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpInfo {
    pub local_ip: String,
    pub external_ip: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiInfo {
    pub ssid: String,
    pub signal_strength: Option<i32>,
    pub channel: Option<String>,
    pub frequency: Option<String>,
    pub security: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinderSettingsSnapshot {
    pub show_hidden_files: Option<bool>,
    pub show_pathbar: Option<bool>,
    pub show_statusbar: Option<bool>,
    pub show_library_dir: Option<bool>,
    pub show_file_extensions: Option<bool>,
    pub no_ds_store: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotSettingsSnapshot {
    pub format: Option<String>,
    pub disable_shadow: Option<bool>,
    pub show_thumbnail: Option<bool>,
    pub save_location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkSettingsSnapshot {
    pub firewall: Option<bool>,
    pub ssh: Option<bool>,
    pub screen_sharing: Option<bool>,
    pub airdrop_disabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemToggleSnapshot {
    pub autohide_dock: Option<bool>,
    pub autohide_menu_bar: Option<String>,
    pub dock_show_recents: Option<bool>,
    pub hide_desktop_icons: Option<bool>,
    pub low_power_mode: Option<String>,
    pub screen_saver: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemSettingsSnapshot {
    pub finder: FinderSettingsSnapshot,
    pub screenshot: ScreenshotSettingsSnapshot,
    pub network: NetworkSettingsSnapshot,
    pub toggles: SystemToggleSnapshot,
}
