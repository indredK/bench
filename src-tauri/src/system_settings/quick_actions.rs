use super::helpers::*;

// ---------------------------------------------------------------------------
// Lock screen password settings
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_lock_screen_password_enabled() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let val = defaults_read("com.apple.screensaver", "askForPassword").unwrap_or_default();
        Ok(val == "1" || val.to_lowercase() == "true")
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_lock_screen_password_enabled(enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        // askForPassword 是布尔键 (规范 C-6:用 "true"/"false" 走 -bool)
        let val = if enabled { "true" } else { "false" };
        defaults_write("com.apple.screensaver", "askForPassword", val)?;
        if enabled {
            // askForPasswordDelay 是整数键,由 defaults_write 自动走 -int
            defaults_write("com.apple.screensaver", "askForPasswordDelay", "0")?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_lock_screen_password_delay() -> Result<i32, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let val = defaults_read("com.apple.screensaver", "askForPasswordDelay").unwrap_or_default();
        Ok(val.parse::<i32>().unwrap_or(5))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_lock_screen_password_delay(seconds: i32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        defaults_write("com.apple.screensaver", "askForPasswordDelay", &seconds.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn lock_screen() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        run_cmd_err("pmset", &["displaysleepnow"])?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn empty_trash() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let trash_path = format!("{}/.Trash", home);
        let is_empty = std::fs::read_dir(&trash_path)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(true);
        if is_empty {
            return Ok("Trash is already empty".to_string());
        }
        run_cmd_err("osascript", &["-e", "tell application \"Finder\" to empty the trash"])?;
        Ok("Trash emptied".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sleep_now() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        run_cmd_err("pmset", &["sleepnow"])?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn reboot_now() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        sudo_cmd("shutdown -r now")?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn shutdown_now() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        sudo_cmd("shutdown -h now")?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
