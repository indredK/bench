use std::process::Command;

#[tauri::command]
pub fn open_system_pane(pane_id: String) -> Result<(), String> {
    let script = format!(
        r#"tell application "System Settings"
    activate
    delay 0.3
    reveal pane id "{}"
end tell"#,
        pane_id
    );
    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn()
        .map_err(|e| format!("Failed to open system pane: {}", e))?;
    Ok(())
}
