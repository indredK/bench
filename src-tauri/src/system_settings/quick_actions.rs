use super::helpers::*;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn get_lock_screen_password_enabled() -> AppResult<bool> {
    tauri::async_runtime::spawn_blocking(|| {
        // 读取失败（cfprefsd 异常/超时/值损坏）必须作为错误上抛，交前端呈现可重试错误态，
        // 不能像旧的 `unwrap_or_default()` 那样把 `""` 判成「未开启」——那是 design §2 禁止的
        // 「失败伪装成 off」，且这是安全相关开关。仅当键确实不存在才回退 false。
        defaults_read_bool_or("com.apple.screensaver", "askForPassword", false)
            .map_err(AppError::internal)
    })
    .await
    .map_err(|e| AppError::internal(format!("get_lock_screen_password_enabled: {e}")))?
}

#[tauri::command]
pub async fn set_lock_screen_password_enabled(enabled: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if enabled { "true" } else { "false" };
        defaults_write("com.apple.screensaver", "askForPassword", val)?;
        if enabled {
            defaults_write("com.apple.screensaver", "askForPasswordDelay", "0")?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_lock_screen_password_enabled: {e}")))?
}

#[tauri::command]
pub async fn get_lock_screen_password_delay() -> AppResult<i32> {
    tauri::async_runtime::spawn_blocking(|| {
        // 同上：真实读取失败要上抛，不能伪装成默认 5 秒；仅键缺失才回退 "5"。
        let val = defaults_read_string_or("com.apple.screensaver", "askForPasswordDelay", "5")
            .map_err(AppError::internal)?;
        val.parse::<i32>()
            .map_err(|e| AppError::internal(format!("askForPasswordDelay: {e}")))
    })
    .await
    .map_err(|e| AppError::internal(format!("get_lock_screen_password_delay: {e}")))?
}

#[tauri::command]
pub async fn set_lock_screen_password_delay(seconds: i32) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        defaults_write(
            "com.apple.screensaver",
            "askForPasswordDelay",
            &seconds.to_string(),
        )?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_lock_screen_password_delay: {e}")))?
}

#[tauri::command]
pub async fn lock_screen() -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(|| {
        run_cmd_err("pmset", &["displaysleepnow"])?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("lock_screen: {e}")))?
}

#[tauri::command]
pub async fn empty_trash() -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let trash_path = format!("{}/.Trash", home);
        let is_empty = std::fs::read_dir(&trash_path)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(true);
        if is_empty {
            return Ok("Trash is already empty".to_string());
        }
        run_cmd_err(
            "osascript",
            &["-e", "tell application \"Finder\" to empty the trash"],
        )?;
        Ok("Trash emptied".to_string())
    })
    .await
    .map_err(|e| AppError::internal(format!("empty_trash: {e}")))?
}

#[tauri::command]
pub async fn sleep_now() -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(|| {
        run_cmd_err("pmset", &["sleepnow"])?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("sleep_now: {e}")))?
}

#[tauri::command]
pub async fn reboot_now() -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(|| {
        sudo_cmd("shutdown -r now")?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("reboot_now: {e}")))?
}

#[tauri::command]
pub async fn shutdown_now() -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(|| {
        sudo_cmd("shutdown -h now")?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("shutdown_now: {e}")))?
}
