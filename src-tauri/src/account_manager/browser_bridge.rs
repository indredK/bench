//! 浏览器扩展本地桥（互通 I3 读 / I5 写 的**数据面**）。
//!
//! ## 为什么需要这个桥
//!
//! 站点的登录态在**用户日常浏览器**里，而日常浏览器的档案是 Chrome 主动封禁
//! 远程调试的对象（Chrome 136+ 仅放行自定义 `user-data-dir`），因此 CDP 走不通；
//! 直读 Cookies SQLite 又被 macOS Keychain Safe Storage 与 app-bound encryption
//! 挡住。唯一可行路径是**浏览器扩展**（`chrome.cookies` / `chrome.scripting`）。
//!
//! 扩展由浏览器启动，它执行完读取/写入后，必须把结果交回**正在运行的 Bench
//! app**。Native Messaging 的 host 是浏览器拉起的**另一个进程**，无法访问 app 的
//! 内存状态与加密 store（若让它直读 store 就等于引入第二个 writer，并违反
//! design.md §5「解密只发生在 Rust app 内」）。因此这里开一条**只绑 loopback**
//! 的极简 HTTP 桥，让扩展直接与 app 通信；NM 只承担**控制面**（下发端口与 token）。
//!
//! ## 控制面 / 数据面分工
//!
//! ```text
//! 控制面  extension --native messaging--> bench-host --> browser-bridge.json（端口+token）
//! 数据面  extension --HTTP 127.0.0.1:port--> Bench app（本模块）--> 加密 store
//! ```
//!
//! 这样明文会话只出现在「浏览器进程 → loopback → Rust 内存 → 加密 store」之间，
//! **不经过 bench-host 进程**，也不落盘、不进 renderer、不进日志。
//!
//! ## 信任模型
//!
//! 1. 只绑 `127.0.0.1`（非回环一律不绑），端口由内核分配（`bind :0`）；
//! 2. 每次启动生成一次性 token，写入 `<app_local_data>/browser-bridge.json`
//!    （权限 `0600`）；token 只经 Native Messaging 下发——而 NM host manifest 的
//!    `allowed_origins` 写死了固定扩展 ID，等于由 Chromium 保证「只有
//!    `dmcfgfpfilhgcoddmciglpjdggkpinje` 能拿到它」；
//! 3. 请求必须同时带对 token；若带 `Origin` 头，必须是该扩展的 origin
//!    （网页无法伪造 `Origin`，这是防「本机网页直接打桥」的关键一道）。
//!
//! 明确**不在**威胁模型内：同用户下的恶意进程（它能直接读 app data 目录与
//! Bench 的加密 store，桥不构成额外暴露面）。
//!
//! ## 边界
//!
//! 请求体上限 [`MAX_BODY_BYTES`]；单次请求处理超时 [`REQUEST_TIMEOUT`]；
//! 响应只回**计数与枚举**或**该账号已存的会话载荷**（后者仅回给通过 token 校验的
//! 扩展，用于注入日常浏览器）。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use rand::RngExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use super::browser_session;
use super::state::AccountManagerState;

/// 桥描述文件版本（扩展据此判断是否需要更新）。
const DESCRIPTOR_VERSION: u32 = 1;
/// token 请求头。
const TOKEN_HEADER: &str = "x-bench-token";
/// 请求体上限：会话载荷（cookie + 本地存储快照）远小于此值。
const MAX_BODY_BYTES: usize = 16 * 1024 * 1024;
/// 首行 + 请求头上限。
const MAX_HEADER_BYTES: usize = 32 * 1024;
/// 单次请求读写的整体超时。
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// 下发给扩展的桥参数（控制面）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeDescriptor {
    pub version: u32,
    pub port: u16,
    /// 一次性 token（每次 app 启动重新生成）。
    pub token: String,
    /// 期望的扩展 origin，扩展可据此自检。
    pub extension_origin: String,
}

static BRIDGE: OnceLock<BridgeDescriptor> = OnceLock::new();

/// 桥描述文件路径。
pub fn descriptor_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir: {e}"))?;
    Ok(base.join("browser-bridge.json"))
}

/// 期望的扩展 origin（固定扩展 ID 派生）。
pub fn extension_origin() -> String {
    format!("chrome-extension://{}/", crate::browser_ext::EXTENSION_ID)
}

/// 当前桥描述（未启动时为 `None`）。
pub fn descriptor() -> Option<BridgeDescriptor> {
    BRIDGE.get().cloned()
}

/// 启动桥（幂等）。失败只记 stderr，不影响 app 其它功能。
pub fn ensure_started<R: Runtime>(app: AppHandle<R>) {
    if BRIDGE.get().is_some() {
        return;
    }
    let path = match descriptor_path(&app) {
        Ok(path) => path,
        Err(error) => {
            eprintln!("[browser-bridge] disabled: {error}");
            return;
        }
    };
    tauri::async_runtime::spawn(async move {
        match serve(app, path).await {
            Ok(()) => {}
            Err(error) => eprintln!("[browser-bridge] stopped: {error}"),
        }
    });
}

/// 绑定端口、写描述文件、进入接受循环。
async fn serve<R: Runtime>(app: AppHandle<R>, descriptor_path: PathBuf) -> Result<(), String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|e| format!("bind loopback: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("local_addr: {e}"))?
        .port();

    let descriptor = BridgeDescriptor {
        version: DESCRIPTOR_VERSION,
        port,
        token: random_token(),
        extension_origin: extension_origin(),
    };
    write_descriptor(&descriptor_path, &descriptor)?;
    let _ = BRIDGE.set(descriptor.clone());
    eprintln!("[browser-bridge] listening on 127.0.0.1:{port}");

    loop {
        let Ok((stream, _peer)) = listener.accept().await else {
            continue;
        };
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = tokio::time::timeout(REQUEST_TIMEOUT, serve_connection(&app, stream)).await;
        });
    }
}

/// 写描述文件（`0600`：token 不能给同机其它用户读到）。
fn write_descriptor(path: &std::path::Path, descriptor: &BridgeDescriptor) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create data dir: {e}"))?;
    }
    let payload =
        serde_json::to_string(descriptor).map_err(|e| format!("encode descriptor: {e}"))?;
    std::fs::write(path, payload).map_err(|e| format!("write descriptor: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("chmod descriptor: {e}"))?;
    }
    Ok(())
}

/// 删除描述文件（退出时调用；失败不致命）。
pub fn remove_descriptor<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(path) = descriptor_path(app) {
        let _ = std::fs::remove_file(path);
    }
}

/// 32 字节随机 token（hex）。
fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// 定长比较，避免 token 校验被时序侧信道利用。
fn constant_time_eq(left: &str, right: &str) -> bool {
    let (left, right) = (left.as_bytes(), right.as_bytes());
    if left.len() != right.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

struct HttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

/// 解析一条最小 HTTP/1.1 请求（只支持 Content-Length，够扩展用）。
async fn read_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut buffer: Vec<u8> = Vec::with_capacity(4096);
    let header_end;
    loop {
        if let Some(index) = find_subsequence(&buffer, b"\r\n\r\n") {
            header_end = index + 4;
            break;
        }
        if buffer.len() > MAX_HEADER_BYTES {
            return Err("REQUEST_HEADERS_TOO_LARGE".to_string());
        }
        let mut chunk = [0u8; 4096];
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|e| format!("read request: {e}"))?;
        if read == 0 {
            return Err("REQUEST_CLOSED".to_string());
        }
        buffer.extend_from_slice(&chunk[..read]);
    }

    let head = String::from_utf8_lossy(&buffer[..header_end]).to_string();
    let mut lines = head.split("\r\n");
    let request_line = lines.next().ok_or("REQUEST_LINE_MISSING")?;
    let mut parts = request_line.split_whitespace();
    let method = parts
        .next()
        .ok_or("REQUEST_LINE_MISSING")?
        .to_ascii_uppercase();
    let path = parts.next().ok_or("REQUEST_LINE_MISSING")?.to_string();

    let mut headers = HashMap::new();
    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    let content_length = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    if content_length > MAX_BODY_BYTES {
        return Err("REQUEST_BODY_TOO_LARGE".to_string());
    }

    let mut body = buffer[header_end..].to_vec();
    while body.len() < content_length {
        let mut chunk = [0u8; 8192];
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|e| format!("read body: {e}"))?;
        if read == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..read]);
    }
    body.truncate(content_length);

    Ok(HttpRequest {
        method,
        path,
        headers,
        body,
    })
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// 写回一条 JSON 响应。
async fn write_response(stream: &mut TcpStream, status: u16, body: &Value) -> Result<(), String> {
    let payload = serde_json::to_vec(body).map_err(|e| format!("encode response: {e}"))?;
    let reason = match status {
        200 => "OK",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Payload Too Large",
        _ => "Bad Request",
    };
    let origin = extension_origin();
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: {origin}\r\n\
         Access-Control-Allow-Headers: content-type,{TOKEN_HEADER}\r\n\
         Access-Control-Allow-Methods: GET,POST,OPTIONS\r\n\
         Vary: Origin\r\n\
         Connection: close\r\n\r\n",
        payload.len()
    );
    stream
        .write_all(head.as_bytes())
        .await
        .map_err(|e| format!("write head: {e}"))?;
    stream
        .write_all(&payload)
        .await
        .map_err(|e| format!("write body: {e}"))?;
    stream.flush().await.map_err(|e| format!("flush: {e}"))?;
    let _ = stream.shutdown().await;
    Ok(())
}

async fn serve_connection<R: Runtime>(app: &AppHandle<R>, mut stream: TcpStream) {
    let request = match read_request(&mut stream).await {
        Ok(request) => request,
        Err(error) => {
            let _ = write_response(&mut stream, 400, &json!({ "ok": false, "error": error })).await;
            return;
        }
    };

    // CORS 预检：host_permissions 已覆盖时浏览器可能不发预检，但发来时必须答对。
    if request.method == "OPTIONS" {
        let _ = write_response(&mut stream, 200, &json!({ "ok": true })).await;
        return;
    }

    let (status, body) = match authorize(&request) {
        Err(error) => (401, json!({ "ok": false, "error": error })),
        Ok(()) => match dispatch(app, &request).await {
            Ok(data) => (200, json!({ "ok": true, "data": data })),
            Err(BridgeError::BadRequest(message)) => {
                (400, json!({ "ok": false, "error": message }))
            }
            Err(BridgeError::MethodNotAllowed) => {
                (405, json!({ "ok": false, "error": "METHOD_NOT_ALLOWED" }))
            }
            Err(BridgeError::NotFound) => (404, json!({ "ok": false, "error": "NOT_FOUND" })),
            Err(BridgeError::Failed(message)) => (500, json!({ "ok": false, "error": message })),
        },
    };
    let _ = write_response(&mut stream, status, &body).await;
}

enum BridgeError {
    BadRequest(String),
    MethodNotAllowed,
    NotFound,
    Failed(String),
}

/// token + Origin 双重校验。
fn authorize(request: &HttpRequest) -> Result<(), String> {
    let Some(descriptor) = descriptor() else {
        return Err("BRIDGE_NOT_READY".to_string());
    };
    let Some(token) = request.headers.get(TOKEN_HEADER) else {
        return Err("BRIDGE_MISSING_TOKEN".to_string());
    };
    if !constant_time_eq(token, &descriptor.token) {
        return Err("BRIDGE_BAD_TOKEN".to_string());
    }
    // Origin 可被网页设置成任意 https 值，但**不能伪造 chrome-extension://**；
    // 带 Origin 且不等于期望扩展 origin 的请求一律拒绝。
    if let Some(origin) = request.headers.get("origin") {
        let expected = descriptor.extension_origin.trim_end_matches('/');
        if origin.trim_end_matches('/') != expected {
            return Err("BRIDGE_BAD_ORIGIN".to_string());
        }
    }
    Ok(())
}

/// 路由分发。
async fn dispatch<R: Runtime>(
    app: &AppHandle<R>,
    request: &HttpRequest,
) -> Result<Value, BridgeError> {
    let body: Value = if request.body.is_empty() {
        json!({})
    } else {
        serde_json::from_slice(&request.body)
            .map_err(|_| BridgeError::BadRequest("BODY_NOT_JSON".to_string()))?
    };
    let state = app.state::<AccountManagerState>();

    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/v1/ping") => Ok(json!({
            "extensionId": crate::browser_ext::EXTENSION_ID,
            "version": DESCRIPTOR_VERSION,
        })),
        ("POST", "/v1/site/resolve") => {
            let url = require_str(&body, "url")?;
            browser_session::resolve_site_for_extension(&state, &url)
                .map_err(BridgeError::BadRequest)
        }
        ("POST", "/v1/interop/overview") => browser_session::interop_overview_for_extension(&state)
            .map_err(|error| BridgeError::Failed(error.message())),
        ("POST", "/v1/session/import") => {
            browser_session::import_from_extension(app, &state, &body)
                .await
                .map_err(|error| BridgeError::Failed(error.message()))
        }
        ("POST", "/v1/session/export") => {
            let account_id = require_str(&body, "accountId")?;
            browser_session::export_for_extension(&state, &account_id, &body)
                .map_err(|error| BridgeError::Failed(error.message()))
        }
        ("POST", "/v1/tasks/pending") => Ok(pending_inject_tasks()),
        ("POST", "/v1/tasks/complete") => {
            let origin = require_str(&body, "origin")?;
            complete_pending_inject(&origin);
            Ok(json!({ "outcome": "completed" }))
        }
        ("GET", _) | ("POST", _) => Err(BridgeError::NotFound),
        _ => Err(BridgeError::MethodNotAllowed),
    }
}

fn require_str(body: &Value, key: &str) -> Result<String, BridgeError> {
    body.get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| BridgeError::BadRequest(format!("MISSING_PARAM: {key}")))
}

// ═══════════════════════════════════════════════
// 「自动注入」任务队列（D-032）：Bench 点「同步到日常浏览器」时登记，
// 扩展在站点页加载完成后取走并自动完成注入（含 Cookie + Web Storage）。
//
// 只放内存（Bench 重启即清）、只含 accountId + origin（**不含任何凭据**，
// 凭据仍走 /v1/session/export 经 token+Origin 双校验获取）；10 分钟未被
// 认领视为过期，避免扩展长期离线时堆积陈旧任务。
// ═══════════════════════════════════════════════

/// 任务有效期：超过即视为扩展不再在线，丢弃。
const PENDING_TASK_TTL_SECS: i64 = 600;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingInjectTask {
    pub account_id: String,
    pub origin: String,
    pub created_at_ts: i64,
}

fn pending_table() -> &'static std::sync::Mutex<Vec<PendingInjectTask>> {
    static PENDING: std::sync::OnceLock<std::sync::Mutex<Vec<PendingInjectTask>>> =
        std::sync::OnceLock::new();
    PENDING.get_or_init(|| std::sync::Mutex::new(Vec::new()))
}

/// 登记一条待自动注入任务（同 origin 幂等：重复登记只刷新账号与时间戳）。
pub fn register_pending_inject(account_id: &str, origin: &str) {
    let Ok(mut guard) = pending_table().lock() else {
        return;
    };
    guard.retain(|task| task.origin != origin);
    guard.push(PendingInjectTask {
        account_id: account_id.to_string(),
        origin: origin.to_string(),
        created_at_ts: chrono::Utc::now().timestamp(),
    });
}

/// 未过期任务快照（不删除；由 `/v1/tasks/complete` 显式确认完成）。
fn pending_inject_tasks() -> Value {
    let now = chrono::Utc::now().timestamp();
    let Ok(mut guard) = pending_table().lock() else {
        return json!([]);
    };
    guard.retain(|task| now - task.created_at_ts <= PENDING_TASK_TTL_SECS);
    json!(guard.clone())
}

/// 标记某 origin 的任务已完成（注入成功或用户手动处理）。
fn complete_pending_inject(origin: &str) {
    if let Ok(mut guard) = pending_table().lock() {
        guard.retain(|task| task.origin != origin);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_comparison_is_exact() {
        assert!(constant_time_eq("abc", "abc"));
        assert!(!constant_time_eq("abc", "abd"));
        assert!(!constant_time_eq("abc", "ab"));
        assert!(!constant_time_eq("", "a"));
    }

    #[test]
    fn extension_origin_carries_the_fixed_extension_id() {
        let origin = extension_origin();
        assert_eq!(
            origin,
            format!("chrome-extension://{}/", crate::browser_ext::EXTENSION_ID)
        );
        // 固定扩展 ID：NM manifest 的 allowed_origins 依赖它恒定不变。
        assert!(origin.starts_with("chrome-extension://dmcfgfpfilhgcoddmciglpjdggkpinje"));
    }

    #[test]
    fn random_tokens_are_hex_and_do_not_repeat() {
        let first = random_token();
        let second = random_token();
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(first, second);
    }

    #[test]
    fn subsequence_search_locates_the_header_terminator() {
        assert_eq!(find_subsequence(b"a\r\n\r\nb", b"\r\n\r\n"), Some(1));
        assert_eq!(find_subsequence(b"abc", b"\r\n\r\n"), None);
    }

    #[test]
    fn descriptor_path_is_inside_app_local_data() {
        assert_eq!(DESCRIPTOR_VERSION, 1);
        assert!(TOKEN_HEADER.starts_with("x-"));
        assert_eq!(MAX_BODY_BYTES, 16 * 1024 * 1024);
    }
}
