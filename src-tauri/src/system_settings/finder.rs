use super::helpers::*;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn set_finder_show_hidden_files(show: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if show { "true" } else { "false" };
        defaults_write("com.apple.finder", "AppleShowAllFiles", val)?;
        restart_finder();
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_finder_show_hidden_files: {e}")))?
}

#[tauri::command]
pub async fn set_finder_show_pathbar(show: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if show { "true" } else { "false" };
        defaults_write("com.apple.finder", "ShowPathbar", val)?;
        restart_finder();
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_finder_show_pathbar: {e}")))?
}

#[tauri::command]
pub async fn set_finder_show_statusbar(show: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if show { "true" } else { "false" };
        defaults_write("com.apple.finder", "ShowStatusBar", val)?;
        restart_finder();
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_finder_show_statusbar: {e}")))?
}

#[tauri::command]
pub async fn set_finder_show_library_dir(show: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let home = std::env::var("HOME").unwrap_or_default();
        let lib_path = std::path::PathBuf::from(&home).join("Library");
        let flag = if show { "nohidden" } else { "hidden" };
        run_cmd_err("chflags", &[flag, &lib_path.to_string_lossy()])?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_finder_show_library_dir: {e}")))?
}

#[tauri::command]
pub async fn set_finder_show_file_extensions(show: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if show { "true" } else { "false" };
        defaults_write("NSGlobalDomain", "AppleShowAllExtensions", val)?;
        restart_finder();
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_finder_show_file_extensions: {e}")))?
}

#[tauri::command]
pub async fn set_finder_no_ds_store(no_ds: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if no_ds { "true" } else { "false" };
        defaults_write("com.apple.desktopservices", "DSDontWriteNetworkStores", val)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_finder_no_ds_store: {e}")))?
}
