use crate::error::{AppError, AppResult};
use std::process::Command;

fn get_macos_major_version() -> Option<u32> {
    let output = Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()?;
    let version_str = String::from_utf8_lossy(&output.stdout);
    let major = version_str.split('.').next()?;
    major.parse().ok()
}

fn installed_privacy_security_pane_id() -> Option<String> {
    plist::Value::from_file(
        "/System/Library/ExtensionKit/Extensions/SecurityPrivacyExtension.appex/Contents/Info.plist",
    )
    .ok()?
    .into_dictionary()?
    .remove("CFBundleIdentifier")?
    .into_string()
}

fn validate_osascript_result(success: bool, stderr: &str, pane_id: &str) -> AppResult<()> {
    if success {
        return Ok(());
    }

    let details = stderr.trim();
    let message = if details.is_empty() {
        format!("osascript could not reveal settings pane '{pane_id}'")
    } else {
        format!("Failed to reveal settings pane '{pane_id}': {details}")
    };
    Err(AppError::internal(message))
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
            let fallback = if major_version >= 13 {
                "com.apple.Privacy-Security.extension"
            } else {
                "com.apple.preference.security"
            };
            Ok(installed_privacy_security_pane_id().unwrap_or_else(|| fallback.to_string()))
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

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|error| AppError::internal(format!("Failed to open settings pane: {error}")))?;

    validate_osascript_result(
        output.status.success(),
        &String::from_utf8_lossy(&output.stderr),
        &pane_id,
    )
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

#[cfg(test)]
mod tests {
    use super::{get_pane_id, validate_osascript_result};

    #[test]
    fn privacy_security_pane_uses_the_installed_system_extension_identifier() {
        const EXTENSION_INFO_PLIST: &str = "/System/Library/ExtensionKit/Extensions/SecurityPrivacyExtension.appex/Contents/Info.plist";
        let installed_identifier = plist::Value::from_file(EXTENSION_INFO_PLIST)
            .ok()
            .and_then(|value| value.into_dictionary())
            .and_then(|dictionary| dictionary.get("CFBundleIdentifier").cloned())
            .and_then(|value| value.into_string())
            .unwrap_or_else(|| "com.apple.Privacy-Security.extension".to_string());

        assert_eq!(
            get_pane_id("privacy-security").unwrap(),
            installed_identifier
        );
    }

    #[test]
    fn osascript_reveal_failure_is_returned_to_the_caller() {
        let error = validate_osascript_result(false, "pane not found", "privacy-security")
            .expect_err("failed pane reveal must not be reported as success");

        assert!(error.to_string().contains("pane not found"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "opens macOS System Settings; run on an interactive Mac"]
    fn privacy_security_command_reveals_the_system_pane() {
        super::open_privacy_security_settings()
            .expect("System Settings should show Privacy & Security");
    }
}
