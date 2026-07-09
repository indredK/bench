use super::helpers::*;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn get_dock_orientation() -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(|| {
        defaults_read("com.apple.dock", "orientation").or_else(|_| Ok("bottom".to_string()))
    })
    .await
    .map_err(|e| AppError::internal(format!("get_dock_orientation: {e}")))?
}

#[tauri::command]
pub async fn set_dock_orientation(pos: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        defaults_write("com.apple.dock", "orientation", &pos)?;
        restart_dock();
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_dock_orientation: {e}")))?
}

#[tauri::command]
pub async fn get_minimize_scale_enabled() -> AppResult<bool> {
    tauri::async_runtime::spawn_blocking(|| {
        Ok(defaults_read("com.apple.dock", "mineffect").unwrap_or_default() == "scale")
    })
    .await
    .map_err(|e| AppError::internal(format!("get_minimize_scale_enabled: {e}")))?
}

#[tauri::command]
pub async fn set_minimize_scale_enabled(enabled: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        defaults_write(
            "com.apple.dock",
            "mineffect",
            if enabled { "scale" } else { "genie" },
        )?;
        restart_dock();
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_minimize_scale_enabled: {e}")))?
}
