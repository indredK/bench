use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "app-preferences.json";
const CLOSE_BEHAVIOR_KEY: &str = "closeButtonBehavior";

pub const BEHAVIOR_MINIMIZE_TO_TRAY: &str = "minimize_to_tray";
pub const BEHAVIOR_QUIT: &str = "quit";
pub const BEHAVIOR_ALWAYS_ASK: &str = "always_ask";

pub fn has_close_behavior<R: Runtime>(app: &AppHandle<R>) -> Result<bool, String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;
    Ok(store.get(CLOSE_BEHAVIOR_KEY).is_some())
}

pub fn get_close_behavior<R: Runtime>(app: &AppHandle<R>) -> Result<String, String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let value = store
        .get(CLOSE_BEHAVIOR_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string()));

    Ok(value.unwrap_or_else(|| BEHAVIOR_MINIMIZE_TO_TRAY.to_string()))
}

pub fn set_close_behavior<R: Runtime>(app: &AppHandle<R>, behavior: &str) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    store.set(CLOSE_BEHAVIOR_KEY, serde_json::Value::String(behavior.to_string()));
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))
}
