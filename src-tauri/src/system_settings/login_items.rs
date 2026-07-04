use super::helpers::*;

#[tauri::command]
pub async fn get_login_items() -> Result<Vec<super::types::LoginItem>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let script = r#"tell application "System Events"
            set itemNames to name of every login item
            return itemNames
        end tell"#;
        let output = std::process::Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| format!("osascript: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() { return Ok(vec![]); }
        Ok(stdout.split(", ").map(|name| super::types::LoginItem {
            name: name.trim().to_string(), enabled: true,
        }).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn add_login_item(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let safe_path = escape_applescript(&path);
        let script = format!(
            r#"tell application "System Events"
                make login item at end with properties {{path:"{}", hidden:false}}
            end tell"#,
            safe_path
        );
        run_cmd_err("osascript", &["-e", &script])?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn remove_login_item(name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let safe_name = escape_applescript(&name);
        let script = format!(
            r#"tell application "System Events"
                delete login item "{}"
            end tell"#,
            safe_name
        );
        run_cmd_err("osascript", &["-e", &script])?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_launch_agents() -> Result<Vec<super::types::LaunchService>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let dir = std::path::PathBuf::from(&home).join("Library/LaunchAgents");
        read_launch_services(&dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_launch_daemons() -> Result<Vec<super::types::LaunchService>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = std::path::PathBuf::from("/Library/LaunchDaemons");
        read_launch_services(&dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Resolve the running app's `.app` bundle path from the executable path.
/// Returns Err in dev mode (no `.app` bundle) or non-macOS.
#[cfg(target_os = "macos")]
fn resolve_app_bundle_path() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| format!("current_exe: {}", e))?;
    let mut path = exe.as_path();
    while path.extension().and_then(|e| e.to_str()) != Some("app") {
        path = path.parent().ok_or("Could not locate .app bundle (running in dev mode?)")?;
    }
    Ok(path.to_string_lossy().to_string())
}

/// Extract the bundle display name from a `.app` path (e.g. "Bench" from "/Applications/Bench.app").
#[cfg(target_os = "macos")]
fn bundle_name_from_path(path: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Bench")
        .to_string()
}

#[cfg(target_os = "windows")]
const WIN_RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";

#[cfg(target_os = "windows")]
const WIN_APP_NAME: &str = "Bench";

#[cfg(target_os = "macos")]
async fn get_autostart_status_impl() -> Result<bool, String> {
    let bundle_path = match resolve_app_bundle_path() {
        Ok(p) => p,
        Err(_) => return Ok(false),
    };
    let bundle_name = bundle_name_from_path(&bundle_path);
    let items = get_login_items().await?;
    Ok(items.iter().any(|item| item.name == bundle_name))
}

#[cfg(target_os = "windows")]
async fn get_autostart_status_impl() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = std::process::Command::new("reg")
            .args(["query", WIN_RUN_KEY, "/v", WIN_APP_NAME])
            .output()
            .map_err(|e| format!("reg query: {}", e))?;
        Ok(output.status.success())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
async fn get_autostart_status_impl() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub async fn get_autostart_status() -> Result<bool, String> {
    get_autostart_status_impl().await
}

#[cfg(target_os = "macos")]
async fn set_autostart_impl(enabled: bool) -> Result<(), String> {
    if enabled {
        let already = get_autostart_status_impl().await?;
        if already {
            return Ok(());
        }
        let bundle_path = resolve_app_bundle_path()?;
        add_login_item(bundle_path).await?;
    } else {
        let bundle_path = resolve_app_bundle_path()?;
        let bundle_name = bundle_name_from_path(&bundle_path);
        remove_login_item(bundle_name).await?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
async fn set_autostart_impl(enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if enabled {
            let exe = std::env::current_exe().map_err(|e| format!("current_exe: {}", e))?;
            let exe_path = exe.to_string_lossy().to_string();
            let output = std::process::Command::new("reg")
                .args([
                    "add", WIN_RUN_KEY, "/v", WIN_APP_NAME, "/t", "REG_SZ", "/d",
                    &exe_path, "/f",
                ])
                .output()
                .map_err(|e| format!("reg add: {}", e))?;
            if !output.status.success() {
                return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
            }
        } else {
            let _ = std::process::Command::new("reg")
                .args(["delete", WIN_RUN_KEY, "/v", WIN_APP_NAME, "/f"])
                .output()
                .map_err(|e| format!("reg delete: {}", e))?;
            // 值不存在时 reg delete 返回非零退出码,但目标(关闭开机启动)已达成,忽略错误。
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
async fn set_autostart_impl(enabled: bool) -> Result<(), String> {
    let _ = enabled;
    Err("Autostart is not supported on this platform".to_string())
}

#[tauri::command]
pub async fn set_autostart(enabled: bool) -> Result<(), String> {
    set_autostart_impl(enabled).await
}

fn read_launch_services(dir: &std::path::PathBuf) -> Result<Vec<super::types::LaunchService>, String> {
    let mut services = Vec::new();
    if !dir.exists() { return Ok(services); }
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("plist") {
            let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();
            let output = std::process::Command::new("defaults")
                .args(["read", &path.to_string_lossy(), "Label"])
                .output();
            let label = output.ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.trim().to_string())
                .unwrap_or_else(|| name.clone());
            services.push(super::types::LaunchService { name: label, path: path.to_string_lossy().to_string(), enabled: true });
        }
    }
    Ok(services)
}
