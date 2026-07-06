use super::helpers::*;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn get_display_battery_percent() -> AppResult<bool> {
    tauri::async_runtime::spawn_blocking(|| {
        let ver = macos_major_version();

        if ver >= 26 {
            if let Ok(val) = defaults_read_current_host("com.apple.controlcenter", "Battery") {
                return Ok(val.trim() == "2");
            }
            return Ok(false);
        }

        if let Ok(val) = defaults_read("com.apple.menuextra.battery", "ShowPercent") {
            let v = val.trim().to_lowercase();
            if v == "yes" || v == "true" || v == "1" {
                return Ok(true);
            }
            if v == "no" || v == "false" || v == "0" {
                return Ok(false);
            }
        }
        if let Ok(val) = defaults_read("NSGlobalDomain", "BatteryShowPercent") {
            let v = val.trim().to_lowercase();
            if v == "yes" || v == "true" || v == "1" {
                return Ok(true);
            }
            if v == "no" || v == "false" || v == "0" {
                return Ok(false);
            }
        }
        Ok(false)
    })
    .await
    .map_err(|e| AppError::internal(format!("get_display_battery_percent: {e}")))?
}

#[tauri::command]
pub async fn set_display_battery_percent(show: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let ver = macos_major_version();

        if ver >= 26 {
            let val = if show { "2" } else { "8" };
            defaults_write_current_host("com.apple.controlcenter", "Battery", val)?;
            restart_controlcenter();
            return Ok(());
        }

        let val = if show { "true" } else { "false" };

        defaults_write("com.apple.controlcenter", "BatteryShowPercentage", val)?;
        defaults_write("com.apple.menuextra.battery", "ShowPercent", val)?;
        restart_system_ui_server();
        restart_controlcenter();

        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_display_battery_percent: {e}")))?
}
