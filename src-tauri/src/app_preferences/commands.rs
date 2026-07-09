use crate::app_preferences::storage;
use crate::app_preferences::types::{
    BEHAVIOR_ALWAYS_ASK, BEHAVIOR_MINIMIZE_TO_TRAY, BEHAVIOR_QUIT,
};
use crate::error::{AppError, AppResult};
use tauri::Manager;

#[tauri::command]
pub fn get_close_behavior(app: tauri::AppHandle) -> AppResult<String> {
    storage::get_close_behavior(&app)
}

#[tauri::command]
pub fn set_close_behavior(app: tauri::AppHandle, behavior: String) -> AppResult<()> {
    if behavior != BEHAVIOR_MINIMIZE_TO_TRAY
        && behavior != BEHAVIOR_QUIT
        && behavior != BEHAVIOR_ALWAYS_ASK
    {
        return Err(AppError::invalid_input(format!(
            "Invalid close behavior: {}. Expected {}, {}, or {}",
            behavior, BEHAVIOR_MINIMIZE_TO_TRAY, BEHAVIOR_QUIT, BEHAVIOR_ALWAYS_ASK
        )));
    }
    storage::set_close_behavior(&app, &behavior)
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) -> AppResult<()> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn hide_main_window(app: tauri::AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    Ok(())
}
