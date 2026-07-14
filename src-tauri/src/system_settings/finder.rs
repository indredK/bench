use super::helpers::*;
use crate::error::{AppError, AppResult};

pub(crate) fn read_finder_show_hidden_files() -> Result<bool, String> {
    defaults_read_bool_or("com.apple.finder", "AppleShowAllFiles", false)
}

pub(crate) fn read_finder_show_pathbar() -> Result<bool, String> {
    defaults_read_bool_or("com.apple.finder", "ShowPathbar", false)
}

pub(crate) fn read_finder_show_statusbar() -> Result<bool, String> {
    defaults_read_bool_or("com.apple.finder", "ShowStatusBar", false)
}

pub(crate) fn read_finder_show_library_dir() -> Result<bool, String> {
    let home = dirs::home_dir().ok_or_else(|| "home directory is unavailable".to_string())?;
    let library = home.join("Library");
    let output = run_cmd_err("ls", &["-ldO", &library.to_string_lossy()])?;
    Ok(!output.split_whitespace().any(|value| value == "hidden"))
}

pub(crate) fn read_finder_show_file_extensions() -> Result<bool, String> {
    defaults_read_bool_or("NSGlobalDomain", "AppleShowAllExtensions", false)
}

pub(crate) fn read_finder_no_ds_store() -> Result<bool, String> {
    defaults_read_bool_or(
        "com.apple.desktopservices",
        "DSDontWriteNetworkStores",
        false,
    )
}

#[tauri::command]
pub async fn set_finder_show_hidden_files(show: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if show { "true" } else { "false" };
        defaults_write("com.apple.finder", "AppleShowAllFiles", val)?;
        verify_setting(&show, read_finder_show_hidden_files)
            .map_err(|error| setting_verification_error("finder.show_hidden_files", error))?;
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
        verify_setting(&show, read_finder_show_pathbar)
            .map_err(|error| setting_verification_error("finder.show_pathbar", error))?;
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
        verify_setting(&show, read_finder_show_statusbar)
            .map_err(|error| setting_verification_error("finder.show_statusbar", error))?;
        restart_finder();
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_finder_show_statusbar: {e}")))?
}

#[tauri::command]
pub async fn set_finder_show_library_dir(show: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let home =
            dirs::home_dir().ok_or_else(|| AppError::internal("home directory is unavailable"))?;
        let lib_path = home.join("Library");
        let flag = if show { "nohidden" } else { "hidden" };
        run_cmd_err("chflags", &[flag, &lib_path.to_string_lossy()])?;
        verify_setting(&show, read_finder_show_library_dir)
            .map_err(|error| setting_verification_error("finder.show_library_dir", error))?;
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
        verify_setting(&show, read_finder_show_file_extensions)
            .map_err(|error| setting_verification_error("finder.show_file_extensions", error))?;
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
        verify_setting(&no_ds, read_finder_no_ds_store)
            .map_err(|error| setting_verification_error("finder.no_ds_store", error))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_finder_no_ds_store: {e}")))?
}
