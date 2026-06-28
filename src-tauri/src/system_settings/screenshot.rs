use super::helpers::*;

/// 截图格式白名单 (规范 A-1:输入校验,与前端 UI 选项保持一致)
const ALLOWED_SCREENSHOT_FORMATS: &[&str] = &["png", "jpg", "bmp", "pdf", "tiff"];

#[tauri::command]
pub async fn get_screenshot_format() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        defaults_read("com.apple.screencapture", "type").or_else(|_| Ok("png".to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_screenshot_format(format: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let fmt = format.to_lowercase();
        if !ALLOWED_SCREENSHOT_FORMATS.contains(&fmt.as_str()) {
            return Err(format!("Invalid screenshot format: {}", format));
        }
        defaults_write("com.apple.screencapture", "type", &fmt)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_screenshot_disable_shadow() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(defaults_read_bool("com.apple.screencapture", "disable-shadow")))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_screenshot_disable_shadow(disable: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if disable { "true" } else { "false" };
        defaults_write("com.apple.screencapture", "disable-shadow", val)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_screenshot_show_thumbnail() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let val = defaults_read("com.apple.screencapture", "show-thumbnail").unwrap_or_default();
        Ok(val != "false" && val != "0")
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_screenshot_show_thumbnail(show: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if show { "true" } else { "false" };
        defaults_write("com.apple.screencapture", "show-thumbnail", val)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_screenshot_save_location() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        defaults_read("com.apple.screencapture", "location")
            .map(|p| expand_home(&p))
            .or_else(|_| {
                let home = std::env::var("HOME").unwrap_or_default();
                Ok(format!("{}/Desktop", home))
            })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_screenshot_save_location(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 规范 A-4:路径校验,过滤 shell 元字符
        validate_screenshot_path(&path)?;
        defaults_write("com.apple.screencapture", "location", &path)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 校验截图保存路径:非空且不含 shell 元字符
fn validate_screenshot_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    let forbidden = [';', '|', '&', '$', '`', '(', ')', '<', '>', '\n', '\r'];
    if path.chars().any(|c| forbidden.contains(&c)) {
        return Err("Invalid path: contains forbidden characters".to_string());
    }
    Ok(())
}
