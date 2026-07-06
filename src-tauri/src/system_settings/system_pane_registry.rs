use std::process::Command;
use crate::error::{AppError, AppResult};

fn get_macos_major_version() -> Option<u32> {
    let output = Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()?;
    let version_str = String::from_utf8_lossy(&output.stdout);
    let major = version_str.split('.').next()?;
    major.parse().ok()
}

fn get_pane_id(pane: &str) -> AppResult<String> {
    let major_version = get_macos_major_version().unwrap_or(14);

    match pane {
        "battery" => Ok("com.apple.Battery-Settings.extension".to_string()),
        "control-center" => Ok("com.apple.ControlCenter-Settings.extension".to_string()),
        "desktop" => Ok("com.apple.Desktop-Settings.extension".to_string()),
        "keyboard" => Ok("com.apple.Keyboard-Settings.extension".to_string()),
        "localization" => Ok("com.apple.Localization-Settings.extension".to_string()),
        "lock-screen" => Ok("com.apple.Lock-Screen-Settings.extension".to_string()),
        "login-items" => Ok("com.apple.LoginItems-Settings.extension".to_string()),
        "network" => Ok("com.apple.Network-Settings.extension".to_string()),
        "privacy-security" => {
            if major_version >= 13 {
                Ok("com.apple.Privacy-Security.extension".to_string())
            } else {
                Ok("com.apple.preference.security".to_string())
            }
        }
        _ => Err(AppError::invalid_input(format!("Unknown pane: {pane}"))),
    }
}

pub fn open_settings_pane(pane: String) -> AppResult<()> {
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
        .map_err(|e| AppError::internal(format!("Failed to open settings pane: {e}")))?;

    Ok(())
}

#[tauri::command]
pub fn open_battery_settings() -> AppResult<()> {
    open_settings_pane("battery".to_string())
}

#[tauri::command]
pub fn open_control_center_settings() -> AppResult<()> {
    open_settings_pane("control-center".to_string())
}

#[tauri::command]
pub fn open_desktop_settings() -> AppResult<()> {
    open_settings_pane("desktop".to_string())
}

#[tauri::command]
pub fn open_keyboard_settings() -> AppResult<()> {
    open_settings_pane("keyboard".to_string())
}

#[tauri::command]
pub fn open_localization_settings() -> AppResult<()> {
    open_settings_pane("localization".to_string())
}

#[tauri::command]
pub fn open_lock_screen_settings() -> AppResult<()> {
    open_settings_pane("lock-screen".to_string())
}

#[tauri::command]
pub fn open_login_items_settings() -> AppResult<()> {
    open_settings_pane("login-items".to_string())
}

#[tauri::command]
pub fn open_network_settings() -> AppResult<()> {
    open_settings_pane("network".to_string())
}

#[tauri::command]
pub fn open_privacy_security_settings() -> AppResult<()> {
    open_settings_pane("privacy-security".to_string())
}
