/**
 * System Pane Registry / 系统面板注册表:
 *   Semantic pane commands with macOS version compatibility.
 *   语义化面板命令，处理 macOS 版本兼容。
 */
use std::process::Command;

/// Get macOS major version number
fn get_macos_major_version() -> Option<u32> {
    let output = Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()?;
    let version_str = String::from_utf8_lossy(&output.stdout);
    let major = version_str.split('.').next()?;
    major.parse().ok()
}

/// Get the correct pane ID for a given semantic pane name
fn get_pane_id(pane: &str) -> Result<String, String> {
    let major_version = get_macos_major_version().unwrap_or(14); // Default to macOS 14+

    match pane {
        // Battery / 低电量模式
        "battery" => Ok("com.apple.Battery-Settings.extension".to_string()),

        // Control Center / 控制中心
        "control-center" => Ok("com.apple.ControlCenter-Settings.extension".to_string()),

        // Desktop & Dock / 桌面与 Dock
        "desktop" => Ok("com.apple.Desktop-Settings.extension".to_string()),

        // Keyboard / 键盘
        "keyboard" => Ok("com.apple.Keyboard-Settings.extension".to_string()),

        // Language & Region / 语言与地区
        "localization" => Ok("com.apple.Localization-Settings.extension".to_string()),

        // Lock Screen / 锁屏
        "lock-screen" => Ok("com.apple.Lock-Screen-Settings.extension".to_string()),

        // Login Items / 登录项
        "login-items" => Ok("com.apple.LoginItems-Settings.extension".to_string()),

        // Network / 网络
        "network" => Ok("com.apple.Network-Settings.extension".to_string()),

        // Privacy & Security / 隐私与安全
        "privacy-security" => {
            if major_version >= 13 {
                // macOS Ventura+: com.apple.Privacy-Security.extension
                Ok("com.apple.Privacy-Security.extension".to_string())
            } else {
                // macOS Monterey and earlier
                Ok("com.apple.preference.security".to_string())
            }
        }

        _ => Err(format!("Unknown pane: {}", pane)),
    }
}

/// Open a semantic system settings pane
#[tauri::command]
pub fn open_settings_pane(pane: String) -> Result<(), String> {
    let pane_id = get_pane_id(&pane)?;

    let script = format!(
        r#"tell application "System Settings"
    activate
    delay 0.3
    reveal pane id "{}"
end tell"#,
        pane_id
    );

    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn()
        .map_err(|e| format!("Failed to open settings pane: {}", e))?;

    Ok(())
}

// ── Semantic commands for each settings pane ──

#[tauri::command]
pub fn open_battery_settings() -> Result<(), String> {
    open_settings_pane("battery".to_string())
}

#[tauri::command]
pub fn open_control_center_settings() -> Result<(), String> {
    open_settings_pane("control-center".to_string())
}

#[tauri::command]
pub fn open_desktop_settings() -> Result<(), String> {
    open_settings_pane("desktop".to_string())
}

#[tauri::command]
pub fn open_keyboard_settings() -> Result<(), String> {
    open_settings_pane("keyboard".to_string())
}

#[tauri::command]
pub fn open_localization_settings() -> Result<(), String> {
    open_settings_pane("localization".to_string())
}

#[tauri::command]
pub fn open_lock_screen_settings() -> Result<(), String> {
    open_settings_pane("lock-screen".to_string())
}

#[tauri::command]
pub fn open_login_items_settings() -> Result<(), String> {
    open_settings_pane("login-items".to_string())
}

#[tauri::command]
pub fn open_network_settings() -> Result<(), String> {
    open_settings_pane("network".to_string())
}

#[tauri::command]
pub fn open_privacy_security_settings() -> Result<(), String> {
    open_settings_pane("privacy-security".to_string())
}
