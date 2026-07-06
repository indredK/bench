use tauri::Manager;
use crate::app_preferences::storage;
use crate::app_preferences::types::{
    BEHAVIOR_ALWAYS_ASK, BEHAVIOR_MINIMIZE_TO_TRAY, BEHAVIOR_QUIT,
};

#[tauri::command]
pub fn get_close_behavior(app: tauri::AppHandle) -> Result<String, String> {
    storage::get_close_behavior(&app)
}

#[tauri::command]
pub fn set_close_behavior(app: tauri::AppHandle, behavior: String) -> Result<(), String> {
    if behavior != BEHAVIOR_MINIMIZE_TO_TRAY
        && behavior != BEHAVIOR_QUIT
        && behavior != BEHAVIOR_ALWAYS_ASK
    {
        return Err(format!(
            "Invalid close behavior: {}. Expected {}, {}, or {}",
            behavior,
            BEHAVIOR_MINIMIZE_TO_TRAY,
            BEHAVIOR_QUIT,
            BEHAVIOR_ALWAYS_ASK
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
