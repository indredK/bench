use std::process::Command;

#[tauri::command]
pub fn open_system_pane(pane_id: String) -> Result<(), String> {
    let url = format!("x-apple.systempreferences:{}", pane_id);
    Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("Failed to open system pane: {}", e))?;
    Ok(())
}
