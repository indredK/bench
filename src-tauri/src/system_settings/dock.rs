use super::helpers::*;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn get_dock_orientation() -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(|| {
        // 真实读取失败要上抛，不能被 `or_else(|_| Ok("bottom"))` 伪装成默认方向；
        // 仅键不存在才回退 macOS 默认 "bottom"。对齐 design §2 与 E8/锁屏同类修复。
        defaults_read_string_or("com.apple.dock", "orientation", "bottom")
            .map_err(AppError::internal)
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
        // 读取失败不能 `unwrap_or_default()==\"scale\"` 静默判成 false；仅键缺失回退 \"\"。
        defaults_read_string_or("com.apple.dock", "mineffect", "")
            .map(|value| value == "scale")
            .map_err(AppError::internal)
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
