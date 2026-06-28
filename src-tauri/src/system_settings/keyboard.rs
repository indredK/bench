use super::helpers::*;

#[tauri::command]
pub async fn get_keyboard_fn_key_state() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(defaults_read_bool("com.apple.keyboard", "fnState")))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_keyboard_fn_key_state(use_fn: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if use_fn { "true" } else { "false" };
        defaults_write("com.apple.keyboard", "fnState", val)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
