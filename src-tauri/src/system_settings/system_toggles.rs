use super::helpers::*;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn set_autohide_dock_state(enabled: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if enabled { "true" } else { "false" };
        defaults_write("com.apple.dock", "autohide", val)?;
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
            other => return Err(AppError::invalid_input(format!("Invalid menu bar autohide mode: {other}"))),
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
            return Err(AppError::internal(format!("System Events failed: {stderr}")));
        }

        defaults_write("com.apple.controlcenter", "AutoHideMenuBarOption", ui_option)?;

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
        restart_finder();
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_hide_desktop_icons_state: {e}")))?
}

#[tauri::command]
pub async fn set_low_power_mode_state(mode: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        match mode.as_str() {
            "never" => {
                sudo_cmd("pmset -a lowpowermode 0")?;
            }
            "always" => {
                sudo_cmd("pmset -a lowpowermode 1")?;
            }
            "on_battery_only" => {
                sudo_cmd("pmset -b lowpowermode 1")?;
                sudo_cmd("pmset -c lowpowermode 0")?;
            }
            "on_ac_only" => {
                sudo_cmd("pmset -b lowpowermode 0")?;
                sudo_cmd("pmset -c lowpowermode 1")?;
            }
            other => return Err(AppError::invalid_input(format!("Invalid low power mode: {other}"))),
        }
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
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_screen_saver_state: {e}")))?
}
