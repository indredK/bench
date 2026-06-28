use super::helpers::*;

#[tauri::command]
pub async fn rebuild_icon_cache() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let _ = sudo_cmd("rm -rf /Library/Caches/com.apple.iconservices.store");
        let user_cache = format!("{}/Library/Caches/com.apple.iconservices", home);
        let _ = std::fs::remove_dir_all(&user_cache);
        restart_dock();
        Ok("Icon cache rebuilt. Dock restarted.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn flush_dns_cache() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        sudo_cmd("dscacheutil -flushcache && killall -HUP mDNSResponder")?;
        Ok("DNS cache flushed.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn rebuild_spotlight_index() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        sudo_cmd("mdutil -E /")?;
        Ok("Spotlight index rebuild started.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn reset_launch_services() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let ls_register = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
        run_cmd_err(ls_register, &["-kill", "-r", "-domain", "local", "-domain", "system", "-domain", "user"])?;
        Ok("Launch Services reset.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn flush_font_cache() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        sudo_cmd("atsutil databases -remove")?;
        Ok("Font cache flushed.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
