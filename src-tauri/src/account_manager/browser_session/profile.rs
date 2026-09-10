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

/// 互通实例的隔离维度。
///
/// - **出向注入**固定按**账号**隔离：会话本来就属于某个账号。
/// - **站点回采流程**按**站点**隔离：用户是「在某个站点上登录」，此时还不知道
///   这份登录态该归哪个账号（可能归已有账号，也可能要新建），因此以站点为单位
///   开一个实例，回采时再决定归属。
///
/// 两者共用同一套 profile 生命周期实现，只是目录前缀不同 —— 前缀**不可省略**，
/// 否则 account id 与 station id 可能映射到同一个目录而互相串号。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Scope {
    Account(String),
    Station(String),
}

impl Scope {
    /// 进程表与磁盘目录共用的键。
    pub fn key(&self) -> String {
        match self {
            Scope::Account(id) => format!("account-{}", sanitize_id(id)),
            Scope::Station(id) => format!("station-{}", sanitize_id(id)),
        }
    }
}

/// `<sessions_root>/<scope key>`（该 scope 的会话根）。
pub fn session_root<R: Runtime>(app: &AppHandle<R>, scope: &Scope) -> Result<PathBuf, String> {
    Ok(sessions_root(app)?.join(scope.key()))
}

/// 该 scope 的浏览器 user-data-dir。
pub fn user_data_dir<R: Runtime>(app: &AppHandle<R>, scope: &Scope) -> Result<PathBuf, String> {
    Ok(session_root(app, scope)?.join("profile"))
}

/// scope 中的原始 id 会被当作路径片段使用，必须先做白名单化，禁止路径穿越。
fn sanitize_id(raw: &str) -> String {
    raw.chars()
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

/// 以该 scope 专属 profile 启动一个独立浏览器实例，返回操作系统进程号。
pub fn spawn_browser(
    scope: &Scope,
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
        // 同一 scope 重复启动时旧句柄被替换，Drop 不会杀进程，仅释放句柄。
        guard.insert(scope.key(), child);
    }
    Ok(pid)
}

/// 回收已自行退出的实例句柄（避免 Unix 僵尸进程堆积）。
pub fn reap_finished(scope: &Scope) -> bool {
    let key = scope.key();
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
pub fn kill_tracked(scope: &Scope) -> bool {
    let key = scope.key();
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

/// 解析该 scope 当前运行实例的调试端口（`DevToolsActivePort` + TCP 探活双重确认）。
pub async fn resolve_running_port<R: Runtime>(app: &AppHandle<R>, scope: &Scope) -> Option<u16> {
    let dir = user_data_dir(app, scope).ok()?;
    let port = read_devtools_port(&dir)?;
    if is_port_alive(port).await {
        Some(port)
    } else {
        None
    }
}

/// 删除该 scope 的 profile 目录（调用方负责先关闭实例）。
pub fn remove_profile_dir<R: Runtime>(app: &AppHandle<R>, scope: &Scope) -> Result<(), String> {
    let root = session_root(app, scope)?;
    if !root.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&root).map_err(|e| format!("remove browser profile: {e}"))
}

/// 把历史上**无前缀**的旧命名目录迁移为现行命名（幂等，可重复调用）。
///
/// 背景：`Scope::key()` 早期版本直接以裸 id 作为目录名（实测残留 `acct-xxx`），
/// 后来才引入 `account-` / `station-` 前缀以避免两个维度串号。旧目录不被现行
/// 代码引用，其中的登录态会变成**孤儿**——用户表现为「之前登录过的账号又要重新
/// 登录」，且磁盘上永远留着删不掉的副本。
///
/// 迁移规则（保守，宁可少迁不可错迁）：
/// 1. 只处理 `browser-sessions` 下「不带 `account-` / `station-` 前缀」的目录；
/// 2. 且该目录必须带有 Bench 的痕迹（`profile/` 或 `bench-browser.json`），
///    避免误动同目录下其它来源的文件夹；
/// 3. 目标已存在时**跳过并保留两者**，绝不删除任何用户数据（交由后续清理决策）。
///
/// 返回被迁移的旧目录名列表，供调用方写日志。
pub fn migrate_legacy_profile_dirs<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    let Ok(root) = sessions_root(app) else {
        return Vec::new();
    };
    migrate_legacy_dirs_in(&root)
}

/// [`migrate_legacy_profile_dirs`] 的实现主体（脱离 `AppHandle`，便于单测）。
pub(crate) fn migrate_legacy_dirs_in(root: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    let mut migrated = Vec::new();
    for entry in entries.flatten() {
        if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("account-") || name.starts_with("station-") {
            continue;
        }
        let path = entry.path();
        let looks_like_ours =
            path.join("profile").is_dir() || path.join("bench-browser.json").is_file();
        if !looks_like_ours {
            continue;
        }
        let target = root.join(format!("account-{}", sanitize_id(&name)));
        if target.exists() {
            continue;
        }
        if std::fs::rename(&path, &target).is_ok() {
            migrated.push(name);
        }
    }
    migrated
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
    scope: &Scope,
    meta: &SessionMeta,
) -> Result<(), String> {
    let root = session_root(app, scope)?;
    std::fs::create_dir_all(&root).map_err(|e| format!("create session root: {e}"))?;
    let payload = serde_json::to_string(meta).map_err(|e| format!("encode session meta: {e}"))?;
    std::fs::write(root.join("bench-browser.json"), payload)
        .map_err(|e| format!("write session meta: {e}"))
}

/// 读取会话元信息；不存在或损坏时返回 `None`（元信息缺失不影响功能）。
pub fn read_meta<R: Runtime>(app: &AppHandle<R>, scope: &Scope) -> Option<SessionMeta> {
    let root = session_root(app, scope).ok()?;
    let payload = std::fs::read_to_string(root.join("bench-browser.json")).ok()?;
    serde_json::from_str(&payload).ok()
}

/// 删除会话元信息。
pub fn clear_meta<R: Runtime>(app: &AppHandle<R>, scope: &Scope) {
    if let Ok(root) = session_root(app, scope) {
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
        assert_eq!(sanitize_id("acct-1234"), "acct-1234");
        assert_eq!(sanitize_id("../../etc/passwd"), "______etc_passwd");
        assert_eq!(sanitize_id("a/b\\c"), "a_b_c");
        assert!(!sanitize_id("../x").contains('/'));
    }

    #[test]
    fn scope_keys_never_collide_between_account_and_station() {
        // 同一原始 id 在两个维度下必须落到不同目录，否则会话会串号。
        let account = Scope::Account("abc-1".into());
        let station = Scope::Station("abc-1".into());
        assert_eq!(account.key(), "account-abc-1");
        assert_eq!(station.key(), "station-abc-1");
        assert_ne!(account.key(), station.key());
        // 穿越片段在两个维度下都被白名单化。
        assert_eq!(
            Scope::Station("../../etc/passwd".into()).key(),
            "station-______etc_passwd"
        );
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

    fn temp_root(tag: &str) -> PathBuf {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static SEQ: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "bench-migrate-{tag}-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::SeqCst)
        ));
        std::fs::create_dir_all(&dir).expect("create temp root");
        dir
    }

    #[test]
    fn legacy_account_dirs_are_migrated_to_prefixed_names() {
        let root = temp_root("happy");
        let legacy = root.join("acct-9d07f4ce");
        std::fs::create_dir_all(legacy.join("profile")).expect("create legacy profile");

        let migrated = migrate_legacy_dirs_in(&root);

        assert_eq!(migrated, vec!["acct-9d07f4ce".to_string()]);
        assert!(root.join("account-acct-9d07f4ce/profile").is_dir());
        assert!(!legacy.exists(), "旧目录应已被重命名而非复制");
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn migration_is_idempotent_and_never_touches_current_naming() {
        let root = temp_root("idempotent");
        std::fs::create_dir_all(root.join("account-acct-1/profile")).expect("current account");
        std::fs::create_dir_all(root.join("station-stn-1/profile")).expect("current station");

        assert!(migrate_legacy_dirs_in(&root).is_empty());
        assert!(root.join("account-acct-1").is_dir());
        assert!(root.join("station-stn-1").is_dir());
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn migration_keeps_both_when_target_already_exists() {
        // 冲突时不得删除任何一侧：宁可留下副本让人工处置。
        let root = temp_root("conflict");
        std::fs::create_dir_all(root.join("acct-1/profile")).expect("legacy");
        std::fs::create_dir_all(root.join("account-acct-1/profile")).expect("target");
        std::fs::write(root.join("account-acct-1/bench-browser.json"), "{}").expect("marker");

        assert!(migrate_legacy_dirs_in(&root).is_empty());
        assert!(root.join("acct-1/profile").is_dir(), "旧目录必须保留");
        assert!(
            root.join("account-acct-1/profile").is_dir(),
            "新目录必须保留"
        );
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn migration_ignores_dirs_without_bench_markers() {
        // 没有 Bench 痕迹的目录不属于我们，不得重命名。
        let root = temp_root("foreign");
        std::fs::create_dir_all(root.join("someone-elses-folder")).expect("foreign dir");

        assert!(migrate_legacy_dirs_in(&root).is_empty());
        assert!(root.join("someone-elses-folder").is_dir());
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn migration_of_missing_root_is_a_noop() {
        let dir = std::env::temp_dir().join("bench-migrate-absent-root");
        assert!(migrate_legacy_dirs_in(&dir).is_empty());
    }
}
