use super::helpers::*;
use crate::error::{AppError, AppResult};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

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

#[cfg(target_os = "macos")]
const APP_BUNDLE_ID: &str = "com.bench.app";
#[cfg(target_os = "macos")]
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
    let plist_path = bundle.join("Contents").join("Info.plist");
    if macos_dir.exists() {
        let symlink = macos_dir.join(exe.file_name().unwrap_or(std::ffi::OsStr::new("bench")));
        // Regenerate when the symlink is stale OR the cached plist has a
        // mismatched bundle id (older builds wrote a wrong identifier).
        let plist_ok = fs::read_to_string(&plist_path)
            .map(|s| s.contains(APP_BUNDLE_ID))
            .unwrap_or(false);
        if symlink.exists() && fs::read_link(&symlink).is_ok_and(|t| t == exe) && plist_ok {
            return Ok(());
        }
    }

    fs::create_dir_all(&macos_dir)
        .map_err(|e| AppError::internal(format!("create MacOS dir: {e}")))?;

    let symlink = macos_dir.join(exe.file_name().unwrap_or(std::ffi::OsStr::new("bench")));
    let _ = fs::remove_file(&symlink);
    std::os::unix::fs::symlink(exe, &symlink)
        .map_err(|e| AppError::internal(format!("symlink binary: {e}")))?;

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

/// 开机静默启动参数: 自启动一律附带该参数, 后端与前端据此区分「登录项启动」与「手动启动」,
/// 登录项启动保持窗口隐藏、应用驻留程序坞(Regular)而非转入托盘(Accessory)。
pub const HIDDEN_LAUNCH_ARG: &str = "--hidden";

/// 登录项启动探测: 自启动条目统一附带 `--hidden` 参数
/// (macOS 为 LaunchAgent plist 的 ProgramArguments, Windows 为注册表 Run 值)。
/// 不再使用 osascript 探测进程可见性 —— 那会在每次启动触发
/// Automation 权限弹窗并阻塞启动主线程(见 DECISIONS.md D-019)。
pub fn detect_launched_at_login() -> bool {
    std::env::args().any(|arg| arg == HIDDEN_LAUNCH_ARG)
}

#[cfg(target_os = "macos")]
fn launch_agent_plist_path() -> AppResult<std::path::PathBuf> {
    let home = std::env::var("HOME").map_err(|e| AppError::internal(format!("HOME env: {e}")))?;
    Ok(std::path::PathBuf::from(home)
        .join("Library")
        .join("LaunchAgents")
        .join(format!("{APP_BUNDLE_ID}.plist")))
}

#[cfg(target_os = "macos")]
fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(target_os = "macos")]
fn launch_agent_plist_content(executable: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{executable}</string>
        <string>{hidden_arg}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
"#,
        label = APP_BUNDLE_ID,
        executable = xml_escape(executable),
        hidden_arg = HIDDEN_LAUNCH_ARG,
    )
}

#[cfg(target_os = "macos")]
async fn get_autostart_status_impl() -> AppResult<bool> {
    tauri::async_runtime::spawn_blocking(|| {
        let path = match launch_agent_plist_path() {
            Ok(p) => p,
            Err(_) => return Ok(false),
        };
        if !path.is_file() {
            return Ok(false);
        }
        // 校验 plist 仍指向当前可执行文件: 应用移动/重建后残留的旧路径视为未开启,
        // 下次开启时会整体重写自愈。
        match (std::env::current_exe(), std::fs::read_to_string(&path)) {
            (Ok(exe), Ok(content)) => Ok(content.contains(&exe.to_string_lossy().to_string())),
            _ => Ok(true),
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("get_autostart_status_impl: {e}")))?
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
    tauri::async_runtime::spawn_blocking(move || {
        let path = launch_agent_plist_path()?;
        if enabled {
            let exe = std::env::current_exe()
                .map_err(|e| AppError::internal(format!("current_exe: {e}")))?;
            let content = launch_agent_plist_content(&exe.to_string_lossy());
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| AppError::io(format!("create LaunchAgents dir: {e}")))?;
            }
            crate::persistence::atomic_write(&path, content.as_bytes())
                .map_err(|e| AppError::io(format!("write launch agent plist: {e}")))?;
        } else {
            // 幂等: 文件不存在视为已关闭。
            match std::fs::remove_file(&path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(AppError::io(format!("remove launch agent plist: {e}"))),
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_autostart_impl: {e}")))??;

    // 尽力清理旧版本经 System Events 创建的登录项, 避免新旧机制并存导致开机双实例。
    // Automation 未授权时 osascript 静默失败, 不影响新机制(仅可能在用户显式
    // 切换开关时触发一次系统授权弹窗, 启动路径不经过此处)。
    if let Ok(bundle_path) = resolve_app_bundle_path() {
        let _ = remove_login_item_by_path(bundle_path).await;
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
            // 附带 --hidden 参数, 使登录项启动时在后台运行(不弹窗)
            let reg_value = format!("\"{exe_path}\" --hidden");
            let output = std::process::Command::new("reg")
                .args([
                    "add",
                    WIN_RUN_KEY,
                    "/v",
                    WIN_APP_NAME,
                    "/t",
                    "REG_SZ",
                    "/d",
                    &reg_value,
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

/// 登录项(隐藏)启动状态: 在 setup 阶段探测一次并缓存, 供前端判断是否后台启动。
pub struct LaunchedAtLoginState(pub Arc<AtomicBool>);

#[tauri::command]
pub fn was_launched_at_login(state: tauri::State<LaunchedAtLoginState>) -> AppResult<bool> {
    Ok(state.0.load(Ordering::SeqCst))
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

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn detect_launched_at_login_only_matches_hidden_arg() {
        // 无法在进程内伪造 argv, 这里直接验证判定与常量一致。
        assert_eq!(HIDDEN_LAUNCH_ARG, "--hidden");
        // 当前测试进程必然不带 --hidden。
        assert!(!detect_launched_at_login());
    }

    #[test]
    fn launch_agent_plist_carries_label_hidden_arg_and_run_at_load() {
        let content = launch_agent_plist_content("/Applications/Bench.app/Contents/MacOS/bench");
        assert!(content.contains(&format!("<string>{APP_BUNDLE_ID}</string>")));
        assert!(content.contains(&format!("<string>{HIDDEN_LAUNCH_ARG}</string>")));
        assert!(content.contains("<key>RunAtLoad</key>"));
        assert!(content.contains("<string>/Applications/Bench.app/Contents/MacOS/bench</string>"));
    }

    #[test]
    fn xml_escape_neutralizes_markup_in_paths() {
        assert_eq!(xml_escape("a&b<c>d"), "a&amp;b&lt;c&gt;d");
    }
}
