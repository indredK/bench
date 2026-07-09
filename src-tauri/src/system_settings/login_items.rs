use super::helpers::*;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn get_login_items() -> AppResult<Vec<super::types::LoginItem>> {
    tauri::async_runtime::spawn_blocking(|| {
        let script = r#"tell application "System Events"
            set items to {}
            repeat with li in (every login item)
                set end of items to {name:name of li, path:path of li}
            end repeat
            return items
        end tell"#;
        let output = std::process::Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| AppError::internal(format!("osascript: {e}")))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return Ok(vec![]);
        }
        let mut items = Vec::new();
        for entry in stdout.split("}, {") {
            let entry = entry.trim().trim_start_matches('{').trim_end_matches('}');
            let name = entry
                .split(',')
                .find_map(|kv| {
                    let kv = kv.trim();
                    kv.strip_prefix("name:")
                        .map(|v| v.trim().trim_matches('"').to_string())
                })
                .unwrap_or_default();
            let path = entry
                .split(',')
                .find_map(|kv| {
                    let kv = kv.trim();
                    kv.strip_prefix("path:")
                        .map(|v| v.trim().trim_matches('"').to_string())
                })
                .unwrap_or_default();
            items.push(super::types::LoginItem {
                name,
                path,
                enabled: true,
            });
        }
        Ok(items)
    })
    .await
    .map_err(|e| AppError::internal(format!("get_login_items: {e}")))?
}

#[cfg(target_os = "macos")]
pub async fn add_login_item(path: String) -> AppResult<()> {
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
    .map_err(|e| AppError::internal(format!("add_login_item: {e}")))?
}

#[tauri::command]
pub async fn remove_login_item(name: String) -> AppResult<()> {
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
    .map_err(|e| AppError::internal(format!("remove_login_item: {e}")))?
}

#[cfg(target_os = "macos")]
async fn remove_login_item_by_path(path: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let safe_path = escape_applescript(&path);
        let script = format!(
            r#"tell application "System Events"
                set targetItems to (every login item whose path is "{}")
                repeat with li in targetItems
                    delete li
                end repeat
            end tell"#,
            safe_path
        );
        run_cmd_err("osascript", &["-e", &script])?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("remove_login_item_by_path: {e}")))?
}

#[tauri::command]
pub async fn get_launch_agents() -> AppResult<Vec<super::types::LaunchService>> {
    tauri::async_runtime::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let dir = std::path::PathBuf::from(&home).join("Library/LaunchAgents");
        read_launch_services(&dir)
    })
    .await
    .map_err(|e| AppError::internal(format!("get_launch_agents: {e}")))?
}

#[tauri::command]
pub async fn get_launch_daemons() -> AppResult<Vec<super::types::LaunchService>> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = std::path::PathBuf::from("/Library/LaunchDaemons");
        read_launch_services(&dir)
    })
    .await
    .map_err(|e| AppError::internal(format!("get_launch_daemons: {e}")))?
}

const APP_BUNDLE_ID: &str = "com.bench.bench";
const APP_DISPLAY_NAME: &str = "Bench";

#[cfg(target_os = "macos")]
fn resolve_app_bundle_path() -> AppResult<String> {
    let exe =
        std::env::current_exe().map_err(|e| AppError::internal(format!("current_exe: {e}")))?;
    let mut path = exe.as_path();
    while path.extension().and_then(|e| e.to_str()) != Some("app") {
        match path.parent() {
            Some(p) => path = p,
            None => {
                let bundle_dir = exe.parent().unwrap_or(std::path::Path::new("/tmp"));
                let bundle_path = bundle_dir.join(format!("{}.app", APP_DISPLAY_NAME));
                ensure_dev_app_bundle(&exe, &bundle_path)?;
                return Ok(bundle_path.to_string_lossy().to_string());
            }
        }
    }
    Ok(path.to_string_lossy().to_string())
}

#[cfg(target_os = "macos")]
fn ensure_dev_app_bundle(exe: &std::path::Path, bundle: &std::path::Path) -> AppResult<()> {
    use std::fs;

    let macos_dir = bundle.join("Contents").join("MacOS");
    if macos_dir.exists() {
        let symlink = macos_dir.join(exe.file_name().unwrap_or(std::ffi::OsStr::new("bench")));
        if symlink.exists() && fs::read_link(&symlink).is_ok_and(|t| t == exe) {
            return Ok(());
        }
    }

    fs::create_dir_all(&macos_dir)
        .map_err(|e| AppError::internal(format!("create MacOS dir: {e}")))?;

    let symlink = macos_dir.join(exe.file_name().unwrap_or(std::ffi::OsStr::new("bench")));
    let _ = fs::remove_file(&symlink);
    std::os::unix::fs::symlink(exe, &symlink)
        .map_err(|e| AppError::internal(format!("symlink binary: {e}")))?;

    let plist_path = bundle.join("Contents").join("Info.plist");
    let plist_content = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>{executable}</string>
    <key>CFBundleIdentifier</key>
    <string>{bundle_id}</string>
    <key>CFBundleName</key>
    <string>{display_name}</string>
    <key>CFBundleDisplayName</key>
    <string>{display_name}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
</dict>
</plist>
"#,
        executable = exe
            .file_name()
            .unwrap_or(std::ffi::OsStr::new("bench"))
            .to_string_lossy(),
        bundle_id = APP_BUNDLE_ID,
        display_name = APP_DISPLAY_NAME,
    );
    fs::write(&plist_path, plist_content.as_bytes())
        .map_err(|e| AppError::internal(format!("write Info.plist: {e}")))?;

    Ok(())
}

#[cfg(target_os = "windows")]
const WIN_RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(target_os = "windows")]
const WIN_APP_NAME: &str = "Bench";

#[cfg(target_os = "macos")]
async fn get_autostart_status_impl() -> AppResult<bool> {
    let bundle_path = match resolve_app_bundle_path() {
        Ok(p) => p,
        Err(_) => return Ok(false),
    };
    let items = get_login_items().await?;
    Ok(items.iter().any(|item| item.path == bundle_path))
}

#[cfg(target_os = "windows")]
async fn get_autostart_status_impl() -> AppResult<bool> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = std::process::Command::new("reg")
            .args(["query", WIN_RUN_KEY, "/v", WIN_APP_NAME])
            .output()
            .map_err(|e| AppError::internal(format!("reg query: {e}")))?;
        Ok(output.status.success())
    })
    .await
    .map_err(|e| AppError::internal(format!("get_autostart_status_impl: {e}")))?
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
async fn get_autostart_status_impl() -> AppResult<bool> {
    Ok(false)
}

#[tauri::command]
pub async fn get_autostart_status() -> AppResult<bool> {
    get_autostart_status_impl().await
}

#[cfg(target_os = "macos")]
async fn set_autostart_impl(enabled: bool) -> AppResult<()> {
    if enabled {
        let already = get_autostart_status_impl().await?;
        if already {
            return Ok(());
        }
        let bundle_path = resolve_app_bundle_path()?;
        add_login_item(bundle_path).await?;
    } else {
        let bundle_path = resolve_app_bundle_path()?;
        remove_login_item_by_path(bundle_path).await?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
async fn set_autostart_impl(enabled: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        if enabled {
            let exe = std::env::current_exe()
                .map_err(|e| AppError::internal(format!("current_exe: {e}")))?;
            let exe_path = exe.to_string_lossy().to_string();
            let output = std::process::Command::new("reg")
                .args([
                    "add",
                    WIN_RUN_KEY,
                    "/v",
                    WIN_APP_NAME,
                    "/t",
                    "REG_SZ",
                    "/d",
                    &exe_path,
                    "/f",
                ])
                .output()
                .map_err(|e| AppError::internal(format!("reg add: {e}")))?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(AppError::internal(format!("reg add failed: {stderr}")));
            }
        } else {
            let _ = std::process::Command::new("reg")
                .args(["delete", WIN_RUN_KEY, "/v", WIN_APP_NAME, "/f"])
                .output();
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_autostart_impl: {e}")))?
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
async fn set_autostart_impl(enabled: bool) -> AppResult<()> {
    let _ = enabled;
    Err(AppError::unsupported(
        "Autostart is not supported on this platform",
    ))
}

#[tauri::command]
pub async fn set_autostart(enabled: bool) -> AppResult<()> {
    set_autostart_impl(enabled).await
}

fn read_launch_services(dir: &std::path::PathBuf) -> AppResult<Vec<super::types::LaunchService>> {
    let mut services = Vec::new();
    if !dir.exists() {
        return Ok(services);
    }
    let entries =
        std::fs::read_dir(dir).map_err(|e| AppError::io(format!("read_dir {dir:?}: {e}")))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("plist") {
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string();
            let output = std::process::Command::new("defaults")
                .args(["read", &path.to_string_lossy(), "Label"])
                .output();
            let label = output
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.trim().to_string())
                .unwrap_or_else(|| name.clone());
            services.push(super::types::LaunchService {
                name: label,
                path: path.to_string_lossy().to_string(),
                enabled: true,
            });
        }
    }
    Ok(services)
}
