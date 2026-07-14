use super::helpers::*;
use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};

const ALLOWED_SCREENSHOT_FORMATS: &[&str] = &["png", "jpg", "bmp", "pdf", "tiff"];

pub(crate) fn read_screenshot_format() -> Result<String, String> {
    let format =
        defaults_read_string_or("com.apple.screencapture", "type", "png")?.to_ascii_lowercase();
    if ALLOWED_SCREENSHOT_FORMATS.contains(&format.as_str()) {
        Ok(format)
    } else {
        Err(format!("unsupported screenshot format: {format}"))
    }
}

pub(crate) fn read_screenshot_disable_shadow() -> Result<bool, String> {
    defaults_read_bool_or("com.apple.screencapture", "disable-shadow", false)
}

pub(crate) fn read_screenshot_show_thumbnail() -> Result<bool, String> {
    defaults_read_bool_or("com.apple.screencapture", "show-thumbnail", true)
}

pub(crate) fn read_screenshot_save_location() -> Result<String, String> {
    let home = dirs::home_dir().ok_or_else(|| "home directory is unavailable".to_string())?;
    let default = home.join("Desktop");
    defaults_read_string_or(
        "com.apple.screencapture",
        "location",
        &default.to_string_lossy(),
    )
}

#[tauri::command]
pub async fn set_screenshot_format(format: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let fmt = format.to_lowercase();
        if !ALLOWED_SCREENSHOT_FORMATS.contains(&fmt.as_str()) {
            return Err(AppError::invalid_input(format!(
                "Invalid screenshot format: {}",
                format
            )));
        }
        defaults_write("com.apple.screencapture", "type", &fmt)?;
        verify_setting(&fmt, read_screenshot_format)
            .map_err(|error| setting_verification_error("screenshot.format", error))?;
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
        verify_setting(&disable, read_screenshot_disable_shadow)
            .map_err(|error| setting_verification_error("screenshot.disable_shadow", error))?;
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
        verify_setting(&show, read_screenshot_show_thumbnail)
            .map_err(|error| setting_verification_error("screenshot.show_thumbnail", error))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_screenshot_show_thumbnail: {e}")))?
}

#[tauri::command]
pub async fn set_screenshot_save_location(path: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = validate_screenshot_path(&path)?;
        let canonical = path.to_string_lossy().to_string();
        defaults_write("com.apple.screencapture", "location", &canonical)?;
        verify_setting(&canonical, read_screenshot_save_location)
            .map_err(|error| setting_verification_error("screenshot.save_location", error))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_screenshot_save_location: {e}")))?
}

fn validate_screenshot_path(path: &str) -> AppResult<PathBuf> {
    if path.trim().is_empty() || path.len() > 4096 {
        return Err(AppError::invalid_input("Path cannot be empty"));
    }
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err(AppError::invalid_input("Screenshot path must be absolute"));
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| AppError::invalid_input("Screenshot directory does not exist"))?;
    if !canonical.is_dir() {
        return Err(AppError::invalid_input(
            "Screenshot location must be a directory",
        ));
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn screenshot_path_requires_an_existing_absolute_directory() {
        assert!(validate_screenshot_path("").is_err());
        assert!(validate_screenshot_path("relative/path").is_err());
        assert!(validate_screenshot_path("/definitely/missing/bench-directory").is_err());
        assert!(validate_screenshot_path(&std::env::temp_dir().to_string_lossy()).is_ok());
    }
}
