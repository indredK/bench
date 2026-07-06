use super::helpers::*;
use crate::error::{AppError, AppResult};

const ALLOWED_SCREENSHOT_FORMATS: &[&str] = &["png", "jpg", "bmp", "pdf", "tiff"];

#[tauri::command]
pub async fn set_screenshot_format(format: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let fmt = format.to_lowercase();
        if !ALLOWED_SCREENSHOT_FORMATS.contains(&fmt.as_str()) {
            return Err(AppError::invalid_input(format!("Invalid screenshot format: {}", format)));
        }
        defaults_write("com.apple.screencapture", "type", &fmt)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_screenshot_format: {e}")))?
}

#[tauri::command]
pub async fn set_screenshot_disable_shadow(disable: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if disable { "true" } else { "false" };
        defaults_write("com.apple.screencapture", "disable-shadow", val)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_screenshot_disable_shadow: {e}")))?
}

#[tauri::command]
pub async fn set_screenshot_show_thumbnail(show: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if show { "true" } else { "false" };
        defaults_write("com.apple.screencapture", "show-thumbnail", val)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_screenshot_show_thumbnail: {e}")))?
}

#[tauri::command]
pub async fn set_screenshot_save_location(path: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_screenshot_path(&path)?;
        defaults_write("com.apple.screencapture", "location", &path)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_screenshot_save_location: {e}")))?
}

fn validate_screenshot_path(path: &str) -> AppResult<()> {
    if path.is_empty() {
        return Err(AppError::invalid_input("Path cannot be empty"));
    }
    let forbidden = [';', '|', '&', '$', '`', '(', ')', '<', '>', '\n', '\r'];
    if path.chars().any(|c| forbidden.contains(&c)) {
        return Err(AppError::invalid_input("Invalid path: contains forbidden characters"));
    }
    Ok(())
}
