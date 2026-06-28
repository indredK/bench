use super::helpers::*;

#[tauri::command]
pub async fn get_dock_orientation() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        defaults_read("com.apple.dock", "orientation").or_else(|_| Ok("bottom".to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_dock_orientation(pos: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        defaults_write("com.apple.dock", "orientation", &pos)?;
        restart_dock();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
