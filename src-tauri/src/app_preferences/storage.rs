use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use super::types::BEHAVIOR_MINIMIZE_TO_TRAY;
use crate::error::{AppError, AppResult};

const STORE_FILE: &str = "app-preferences.json";
const CLOSE_BEHAVIOR_KEY: &str = "closeButtonBehavior";

pub fn has_close_behavior<R: Runtime>(app: &AppHandle<R>) -> AppResult<bool> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::internal(format!("Failed to open store: {e}")))?;
    Ok(store.get(CLOSE_BEHAVIOR_KEY).is_some())
}

pub fn get_close_behavior<R: Runtime>(app: &AppHandle<R>) -> AppResult<String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::internal(format!("Failed to open store: {e}")))?;

    let value = store
        .get(CLOSE_BEHAVIOR_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string()));

    Ok(value.unwrap_or_else(|| BEHAVIOR_MINIMIZE_TO_TRAY.to_string()))
}

pub fn set_close_behavior<R: Runtime>(app: &AppHandle<R>, behavior: &str) -> AppResult<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::internal(format!("Failed to open store: {e}")))?;

    store.set(
        CLOSE_BEHAVIOR_KEY,
        serde_json::Value::String(behavior.to_string()),
    );
    store
        .save()
        .map_err(|e| AppError::internal(format!("Failed to save store: {e}")))
}
