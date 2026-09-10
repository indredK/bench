//! 托管浏览器 profile 的生命周期（互通 I1/I2）。
//!
//! 每个账号对应一个独立浏览器 user-data-dir：
//! `<app_local_data>/browser-sessions/<accountId>/profile`，与「每账号独立
//! data directory」红线（design.md §3）同构，并把隔离语义从 Bench 内部 WebView
//! 延伸到系统浏览器。
//!
//! 关键行为：
//!
//! - 启动参数固定为「独立 user-data-dir + `--remote-debugging-port=0`（随机端口）
//!   + `about:blank`」，不修改用户日常浏览器档案。
//! - 实例句柄（`std::process::Child`）保存在进程内静态表，用于跨命令关闭与回收；
//!   Bench 重启后仍可凭 `DevToolsActivePort` 重新附着（此时只能经 CDP 关闭）。
//! - 端口从 `<user-data-dir>/DevToolsActivePort` 读取，并做 TCP 探活。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, Runtime};

use super::browser::BrowserInstallation;

/// DevToolsActivePort 出现的最长等待时间（冷启动可能较慢）。
const DEVTOOLS_PORT_TIMEOUT: Duration = Duration::from_secs(20);
const DEVTOOLS_PORT_POLL: Duration = Duration::from_millis(120);
/// 单次 TCP 探活超时。
const PORT_PROBE_TIMEOUT: Duration = Duration::from_millis(600);

/// 进程内实例表：accountId → Child。用于跨命令关闭与僵尸回收。
fn children() -> &'static Mutex<HashMap<String, Child>> {
    static CHILDREN: OnceLock<Mutex<HashMap<String, Child>>> = OnceLock::new();
    CHILDREN.get_or_init(|| Mutex::new(HashMap::new()))
}

/// `<app_local_data>/browser-sessions`（所有账号 profile 的父目录）。
pub fn sessions_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir: {e}"))?;
    Ok(base.join("browser-sessions"))
}

/// `<sessions_root>/<accountId>`（该账号的会话根）。
pub fn session_root<R: Runtime>(app: &AppHandle<R>, account_id: &str) -> Result<PathBuf, String> {
    Ok(sessions_root(app)?.join(sanitize_account_id(account_id)))
}

/// 该账号的浏览器 user-data-dir。
pub fn user_data_dir<R: Runtime>(app: &AppHandle<R>, account_id: &str) -> Result<PathBuf, String> {
    Ok(session_root(app, account_id)?.join("profile"))
}

/// accountId 会被当作路径片段使用，必须先做白名单化，禁止路径穿越。
fn sanitize_account_id(account_id: &str) -> String {
    account_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

/// 解析 `DevToolsActivePort` 文件（首行 = 端口，次行 = WS 路径）。
pub fn read_devtools_port(user_data_dir: &Path) -> Option<u16> {
    let content = std::fs::read_to_string(user_data_dir.join("DevToolsActivePort")).ok()?;
    content.lines().next()?.trim().parse::<u16>().ok()
}

/// 等待 `DevToolsActivePort` 出现并返回端口。
pub async fn wait_for_devtools_port(user_data_dir: &Path) -> Result<u16, String> {
    let deadline = Instant::now() + DEVTOOLS_PORT_TIMEOUT;
    while Instant::now() < deadline {
        if let Some(port) = read_devtools_port(user_data_dir) {
            return Ok(port);
        }
        tokio::time::sleep(DEVTOOLS_PORT_POLL).await;
    }
    Err("BROWSER_DEVTOOLS_PORT_TIMEOUT".to_string())
}

/// 以账号专属 profile 启动一个独立浏览器实例，返回操作系统进程号。
pub fn spawn_browser(
    account_id: &str,
    installation: &BrowserInstallation,
    user_data_dir: &Path,
    initial_url: &str,
) -> Result<u32, String> {
    std::fs::create_dir_all(user_data_dir)
        .map_err(|e| format!("create browser profile dir: {e}"))?;

    let mut command = Command::new(&installation.path);
    command
        .arg(format!("--user-data-dir={}", user_data_dir.display()))
        // 端口 0 = 由浏览器选择空闲端口，避免固定端口被其它进程占用/嗅探。
        .arg("--remote-debugging-port=0")
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-background-mode")
        .arg("--window-size=1280,900")
        .arg(initial_url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let child = command
        .spawn()
        .map_err(|e| format!("BROWSER_SPAWN_FAILED: {e}"))?;
    let pid = child.id();
    if let Ok(mut guard) = children().lock() {
        // 同一账号重复启动时旧句柄被替换，Drop 不会杀进程，仅释放句柄。
        guard.insert(sanitize_account_id(account_id), child);
    }
    Ok(pid)
}

/// 回收已自行退出的实例句柄（避免 Unix 僵尸进程堆积）。
pub fn reap_finished(account_id: &str) -> bool {
    let key = sanitize_account_id(account_id);
    let mut guard = match children().lock() {
        Ok(guard) => guard,
        Err(_) => return false,
    };
    let finished = guard
        .get_mut(&key)
        .and_then(|child| child.try_wait().ok())
        .flatten()
        .is_some();
    if finished {
        guard.remove(&key);
    }
    finished
}

/// 强制终止本进程启动的实例（跨平台 `Child::kill`）。
/// 返回是否真的终止了一个实例；Bench 重启后启动的实例不在表内，返回 false。
pub fn kill_tracked(account_id: &str) -> bool {
    let key = sanitize_account_id(account_id);
    let child = children()
        .lock()
        .ok()
        .and_then(|mut guard| guard.remove(&key));
    let Some(mut child) = child else {
        return false;
    };
    let _ = child.kill();
    let _ = child.wait();
    true
}

/// TCP 探活：确认调试端口仍可连接。
pub async fn is_port_alive(port: u16) -> bool {
    matches!(
        tokio::time::timeout(
            PORT_PROBE_TIMEOUT,
            tokio::net::TcpStream::connect(("127.0.0.1", port)),
        )
        .await,
        Ok(Ok(_))
    )
}

/// 解析该账号当前运行实例的调试端口（`DevToolsActivePort` + TCP 探活双重确认）。
pub async fn resolve_running_port<R: Runtime>(app: &AppHandle<R>, account_id: &str) -> Option<u16> {
    let dir = user_data_dir(app, account_id).ok()?;
    let port = read_devtools_port(&dir)?;
    if is_port_alive(port).await {
        Some(port)
    } else {
        None
    }
}

/// 删除该账号的 profile 目录（调用方负责先关闭实例）。
pub fn remove_profile_dir<R: Runtime>(app: &AppHandle<R>, account_id: &str) -> Result<(), String> {
    let root = session_root(app, account_id)?;
    if !root.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&root).map_err(|e| format!("remove browser profile: {e}"))
}

/// 删除某个 profile 目录下的调试端口文件（重新启动前清理陈旧端口）。
pub fn clear_devtools_port(user_data_dir: &Path) {
    let path = user_data_dir.join("DevToolsActivePort");
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}

/// 会话元信息（仅记录浏览器 id / pid / 打开时间，**不含任何凭据**）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub browser_id: String,
    pub pid: u32,
    pub opened_at_ts: i64,
}

/// 写入会话元信息（状态查询与 UI 展示用）。
pub fn write_meta<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    meta: &SessionMeta,
) -> Result<(), String> {
    let root = session_root(app, account_id)?;
    std::fs::create_dir_all(&root).map_err(|e| format!("create session root: {e}"))?;
    let payload = serde_json::to_string(meta).map_err(|e| format!("encode session meta: {e}"))?;
    std::fs::write(root.join("bench-browser.json"), payload)
        .map_err(|e| format!("write session meta: {e}"))
}

/// 读取会话元信息；不存在或损坏时返回 `None`（元信息缺失不影响功能）。
pub fn read_meta<R: Runtime>(app: &AppHandle<R>, account_id: &str) -> Option<SessionMeta> {
    let root = session_root(app, account_id).ok()?;
    let payload = std::fs::read_to_string(root.join("bench-browser.json")).ok()?;
    serde_json::from_str(&payload).ok()
}

/// 删除会话元信息。
pub fn clear_meta<R: Runtime>(app: &AppHandle<R>, account_id: &str) {
    if let Ok(root) = session_root(app, account_id) {
        let path = root.join("bench-browser.json");
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_id_is_sanitized_against_path_traversal() {
        assert_eq!(sanitize_account_id("acct-1234"), "acct-1234");
        assert_eq!(sanitize_account_id("../../etc/passwd"), "______etc_passwd");
        assert_eq!(sanitize_account_id("a/b\\c"), "a_b_c");
        assert!(!sanitize_account_id("../x").contains('/'));
    }

    #[test]
    fn devtools_port_parsing_reads_first_line() {
        let dir = std::env::temp_dir().join(format!("bench-cdp-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let file = dir.join("DevToolsActivePort");
        std::fs::write(&file, "54321\n/devtools/browser/deadbeef\n").expect("write port file");
        assert_eq!(read_devtools_port(&dir), Some(54321));

        std::fs::write(&file, "not-a-port\n").expect("write bad port file");
        assert_eq!(read_devtools_port(&dir), None);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn devtools_port_missing_file_is_none() {
        let dir = std::env::temp_dir().join("bench-cdp-missing-dir");
        assert_eq!(read_devtools_port(&dir), None);
    }
}
