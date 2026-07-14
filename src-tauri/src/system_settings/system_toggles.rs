use super::helpers::*;
use crate::error::{AppError, AppResult};

pub(crate) fn read_autohide_dock_state() -> Result<bool, String> {
    defaults_read_bool_or("com.apple.dock", "autohide", false)
}

pub(crate) fn read_autohide_menu_bar_state() -> Result<String, String> {
    let value = defaults_read_string_or("com.apple.controlcenter", "AutoHideMenuBarOption", "2")?;
    match value.trim() {
        "0" => Ok(MENU_BAR_MODE_ALWAYS.to_string()),
        "1" => Ok(MENU_BAR_MODE_ON_DESKTOP_ONLY.to_string()),
        "2" => Ok(MENU_BAR_MODE_IN_FULL_SCREEN_ONLY.to_string()),
        "3" => Ok(MENU_BAR_MODE_NEVER.to_string()),
        _ => Err(format!("unrecognized menu bar mode: {value}")),
    }
}

pub(crate) fn read_dock_show_recents_state() -> Result<bool, String> {
    defaults_read_bool_or("com.apple.dock", "show-recents", true)
}

pub(crate) fn read_hide_desktop_icons_state() -> Result<bool, String> {
    defaults_read_bool_or("com.apple.finder", "CreateDesktop", true).map(|create| !create)
}

fn parse_low_power_mode(output: &str) -> Result<String, String> {
    let mut section = "";
    let mut battery = None;
    let mut ac = None;

    for line in output.lines() {
        let line = line.trim();
        if line.ends_with(':') {
            section = line.trim_end_matches(':');
            continue;
        }
        let mut parts = line.split_whitespace();
        if parts.next() != Some("lowpowermode") {
            continue;
        }
        let enabled = match parts.next() {
            Some("1") => true,
            Some("0") => false,
            _ => return Err("unrecognized low power mode value".to_string()),
        };
        if section.eq_ignore_ascii_case("Battery Power") {
            battery = Some(enabled);
        } else if section.eq_ignore_ascii_case("AC Power") {
            ac = Some(enabled);
        }
    }

    match (battery, ac) {
        (Some(false), Some(false)) | (None, Some(false)) => Ok("never".to_string()),
        (Some(true), Some(true)) | (None, Some(true)) => Ok("always".to_string()),
        (Some(true), Some(false)) => Ok("on_battery_only".to_string()),
        (Some(false), Some(true)) => Ok("on_ac_only".to_string()),
        _ => Err("low power mode is unavailable".to_string()),
    }
}

pub(crate) fn read_low_power_mode_state() -> Result<String, String> {
    run_cmd_err("pmset", &["-g", "custom"]).and_then(|output| parse_low_power_mode(&output))
}

pub(crate) fn read_screen_saver_state() -> Result<bool, String> {
    let script =
        r#"tell application "System Events" to get delay interval of screen saver preferences"#;
    let output = run_cmd_err("osascript", &["-e", script])?;
    output
        .trim()
        .parse::<u64>()
        .map(|seconds| seconds > 0)
        .map_err(|_| "unrecognized screen saver delay".to_string())
}

#[tauri::command]
pub async fn set_autohide_dock_state(enabled: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if enabled { "true" } else { "false" };
        defaults_write("com.apple.dock", "autohide", val)?;
        verify_setting(&enabled, read_autohide_dock_state)
            .map_err(|error| setting_verification_error("toggles.autohide_dock", error))?;
        restart_dock();
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_autohide_dock_state: {e}")))?
}

const MENU_BAR_MODE_NEVER: &str = "never";
const MENU_BAR_MODE_IN_FULL_SCREEN_ONLY: &str = "in_full_screen_only";
const MENU_BAR_MODE_ON_DESKTOP_ONLY: &str = "on_desktop_only";
const MENU_BAR_MODE_ALWAYS: &str = "always";

#[tauri::command]
pub async fn set_autohide_menu_bar_state(mode: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_in_full, hide, ui_option) = match mode.as_str() {
            MENU_BAR_MODE_ALWAYS => ("false", "true", "0"),
            MENU_BAR_MODE_NEVER => ("true", "false", "3"),
            MENU_BAR_MODE_ON_DESKTOP_ONLY => ("true", "true", "1"),
            MENU_BAR_MODE_IN_FULL_SCREEN_ONLY => ("false", "false", "2"),
            other => {
                return Err(AppError::invalid_input(format!(
                    "Invalid menu bar autohide mode: {other}"
                )))
            }
        };

        let autohide = if hide == "true" { "true" } else { "false" };
        let script = format!(
            "tell application \"System Events\"\n\
             \ttell dock preferences to set autohide menu bar to {}\n\
             end tell",
            autohide
        );
        let output = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| AppError::internal(format!("osascript: {e}")))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::internal(format!(
                "System Events failed: {stderr}"
            )));
        }

        defaults_write(
            "com.apple.controlcenter",
            "AutoHideMenuBarOption",
            ui_option,
        )?;

        verify_setting(&mode, read_autohide_menu_bar_state)
            .map_err(|error| setting_verification_error("toggles.autohide_menu_bar", error))?;

        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_autohide_menu_bar_state: {e}")))?
}

#[tauri::command]
pub async fn set_dock_show_recents_state(enabled: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if enabled { "true" } else { "false" };
        defaults_write("com.apple.dock", "show-recents", val)?;
        verify_setting(&enabled, read_dock_show_recents_state)
            .map_err(|error| setting_verification_error("toggles.dock_show_recents", error))?;
        restart_dock();
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_dock_show_recents_state: {e}")))?
}

#[tauri::command]
pub async fn set_hide_desktop_icons_state(hide: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if hide { "false" } else { "true" };
        defaults_write("com.apple.finder", "CreateDesktop", val)?;
        verify_setting(&hide, read_hide_desktop_icons_state)
            .map_err(|error| setting_verification_error("toggles.hide_desktop_icons", error))?;
        restart_finder();
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_hide_desktop_icons_state: {e}")))?
}

#[tauri::command]
pub async fn set_low_power_mode_state(mode: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let command = match mode.as_str() {
            "never" => "pmset -a lowpowermode 0",
            "always" => "pmset -a lowpowermode 1",
            "on_battery_only" => "pmset -b lowpowermode 1 && pmset -c lowpowermode 0",
            "on_ac_only" => "pmset -b lowpowermode 0 && pmset -c lowpowermode 1",
            other => {
                return Err(AppError::invalid_input(format!(
                    "Invalid low power mode: {other}"
                )))
            }
        };
        sudo_cmd(command)?;
        verify_setting(&mode, read_low_power_mode_state)
            .map_err(|error| setting_verification_error("toggles.low_power_mode", error))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_low_power_mode_state: {e}")))?
}

#[tauri::command]
pub async fn set_screen_saver_state(enabled: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        if enabled {
            let script = r#"tell application "System Events" to tell screen saver preferences to set delay interval to 300"#;
            run_cmd_err("osascript", &["-e", script])?;
        } else {
            let script = r#"tell application "System Events" to tell screen saver preferences to set delay interval to 0"#;
            run_cmd_err("osascript", &["-e", script])?;
        }
        verify_setting(&enabled, read_screen_saver_state)
            .map_err(|error| setting_verification_error("toggles.screen_saver", error))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_screen_saver_state: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_portable_and_desktop_low_power_modes() {
        let laptop = "Battery Power:\n lowpowermode 1\nAC Power:\n lowpowermode 0";
        assert_eq!(parse_low_power_mode(laptop).unwrap(), "on_battery_only");

        let desktop = "AC Power:\n lowpowermode 0";
        assert_eq!(parse_low_power_mode(desktop).unwrap(), "never");
    }

    #[test]
    fn rejects_missing_low_power_values() {
        assert!(parse_low_power_mode("AC Power:\n sleep 10").is_err());
    }
}
