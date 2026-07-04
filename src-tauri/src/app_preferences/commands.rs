use tauri::Manager;
use crate::app_preferences::storage;

#[tauri::command]
pub fn get_close_behavior(app: tauri::AppHandle) -> Result<String, String> {
    storage::get_close_behavior(&app)
}

#[tauri::command]
pub fn set_close_behavior(app: tauri::AppHandle, behavior: String) -> Result<(), String> {
    if behavior != storage::BEHAVIOR_MINIMIZE_TO_TRAY
        && behavior != storage::BEHAVIOR_QUIT
        && behavior != storage::BEHAVIOR_ALWAYS_ASK
    {
        return Err(format!(
            "Invalid close behavior: {}. Expected {}, {}, or {}",
            behavior,
            storage::BEHAVIOR_MINIMIZE_TO_TRAY,
            storage::BEHAVIOR_QUIT,
            storage::BEHAVIOR_ALWAYS_ASK
        ));
    }
    storage::set_close_behavior(&app, &behavior)
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    Ok(())
}
