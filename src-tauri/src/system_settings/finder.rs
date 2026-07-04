use super::helpers::*;

#[tauri::command]
pub async fn set_finder_show_hidden_files(show: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if show { "true" } else { "false" };
        defaults_write("com.apple.finder", "AppleShowAllFiles", val)?;
        restart_finder();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_finder_show_pathbar(show: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if show { "true" } else { "false" };
        defaults_write("com.apple.finder", "ShowPathbar", val)?;
        restart_finder();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_finder_show_statusbar(show: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if show { "true" } else { "false" };
        defaults_write("com.apple.finder", "ShowStatusBar", val)?;
        restart_finder();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_finder_show_library_dir(show: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let home = std::env::var("HOME").unwrap_or_default();
        let lib_path = std::path::PathBuf::from(&home).join("Library");
        let flag = if show { "nohidden" } else { "hidden" };
        run_cmd_err("chflags", &[flag, &lib_path.to_string_lossy()])?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_finder_show_file_extensions(show: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if show { "true" } else { "false" };
        defaults_write("NSGlobalDomain", "AppleShowAllExtensions", val)?;
        // AppleShowAllExtensions 影响 Finder 显示,需要重启 Finder 才能立即生效
        // (与 OnlySwitch 的 ShowExtensionNameCMD 实现保持一致: killall Finder)
        restart_finder();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_finder_no_ds_store(no_ds: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if no_ds { "true" } else { "false" };
        defaults_write("com.apple.desktopservices", "DSDontWriteNetworkStores", val)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
