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

#[tauri::command]
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
