use super::helpers::*;

#[tauri::command]
pub async fn get_finder_show_hidden_files() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(defaults_read_bool("com.apple.finder", "AppleShowAllFiles")))
        .await
        .map_err(|e| e.to_string())?
}

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
pub async fn get_finder_show_pathbar() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(defaults_read_bool("com.apple.finder", "ShowPathbar")))
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
pub async fn get_finder_show_statusbar() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(defaults_read_bool("com.apple.finder", "ShowStatusBar")))
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
pub async fn get_finder_show_library_dir() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let lib_path = std::path::PathBuf::from(&home).join("Library");
        let output = std::process::Command::new("ls")
            .args(["-ldO", &lib_path.to_string_lossy()])
            .output()
            .map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(!stdout.contains("hidden"))
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
pub async fn get_finder_show_file_extensions() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(defaults_read_bool("NSGlobalDomain", "AppleShowAllExtensions")))
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
pub async fn get_finder_spotlight_external_disk() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        // Check all mounted volumes for Spotlight indexing status
        let volumes_dir = std::path::Path::new("/Volumes");
        if !volumes_dir.exists() {
            return Ok(false);
        }
        let entries = std::fs::read_dir(volumes_dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let vol = path.to_string_lossy();
                // Skip the boot volume (already managed separately)
                if vol == "/Volumes/Macintosh HD" || vol == "/" {
                    continue;
                }
                let output = run_cmd("mdutil", &["-s", &vol])?;
                if output.contains("Indexing enabled") {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_finder_spotlight_external_disk(disk: String, enable: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_path(&disk)?;
        let flag = if enable { "on" } else { "off" };
        let safe_disk = shell_escape(&disk);
        sudo_cmd(&format!("mdutil -i {} \"{}\"", flag, safe_disk))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_finder_no_ds_store() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(defaults_read_bool("com.apple.desktopservices", "DSDontWriteNetworkStores")))
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

fn validate_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    let forbidden = [';', '|', '&', '$', '`', '(', ')', '<', '>', '\n', '\r'];
    if path.chars().any(|c| forbidden.contains(&c)) {
        return Err("Invalid path: contains forbidden characters".to_string());
    }
    Ok(())
}

fn shell_escape(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '$' | '`' | '"' | '\\' | '!' => format!("\\{}", c),
            _ => c.to_string(),
        })
        .collect()
}
