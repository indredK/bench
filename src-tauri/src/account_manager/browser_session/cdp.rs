//! 极简 CDP（Chrome DevTools Protocol）客户端。
//!
//! 只实现互通需要的子集：`Target.*`（定位/附加页面）、`Network.setCookie` /
//! `Network.getAllCookies`、`Page.navigate`、`Runtime.evaluate`、
//! `Emulation.setUserAgentOverride`、`Browser.close`。
//!
//! 设计约束（对齐 design.md §5 与本文档 §5.2）：
//!
//! - **只连 loopback**：WebSocket URL 必须由 [`validate_ws_url`] 校验为
//!   `ws://127.0.0.1|localhost|[::1]`，拒绝任何远程主机 —— 调试端口可完全控制
//!   该浏览器实例，连错地址等于把账号会话交出去。
//! - **不落盘、不进前端**：cookie 值只在 Rust 内存中流转，DTO 只出计数。
//! - **可超时**：每个命令都有独立超时，避免浏览器无响应时命令永久挂起。
//!
//! 该模块不负责启动/关闭浏览器进程（见 `super::profile`）与业务编排（见 `super::mod`）。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

/// 单条 CDP 命令的超时。
const CALL_TIMEOUT: Duration = Duration::from_secs(15);
/// WebSocket 握手超时。
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// 出站队列容量（命令为短突发，64 足够）。
const OUTBOUND_BUFFER: usize = 64;

type PendingMap = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>;

/// 校验并规范化 CDP WebSocket 地址 —— **必须**是 loopback。
///
/// 返回错误时调用方必须终止，不得回退到「信任文件内容」（调试端口可完全控制实例）。
pub fn validate_ws_url(raw: &str) -> Result<String, String> {
    let parsed = url::Url::parse(raw.trim()).map_err(|e| format!("CDP_WS_URL_INVALID: {e}"))?;
    if parsed.scheme() != "ws" {
        return Err("CDP_WS_URL_NOT_WS".to_string());
    }
    let host = parsed.host_str().unwrap_or_default();
    let is_loopback = match parsed.host() {
        Some(url::Host::Ipv4(address)) => address.is_loopback(),
        Some(url::Host::Ipv6(address)) => address.is_loopback(),
        Some(url::Host::Domain(name)) => name.eq_ignore_ascii_case("localhost"),
        None => false,
    };
    if !is_loopback || host.is_empty() {
        return Err("CDP_WS_URL_NOT_LOOPBACK".to_string());
    }
    Ok(parsed.to_string())
}

/// 解析一条 CDP 响应：`error` 字段优先于 `result`。
fn parse_response(value: &Value) -> Result<Value, String> {
    if let Some(error) = value.get("error") {
        let message = error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("unknown error");
        return Err(format!("CDP_ERROR: {message}"));
    }
    Ok(value.get("result").cloned().unwrap_or(Value::Null))
}

/// 按优先级从现有页面中挑选复用目标；返回 `None` 表示必须新建一个页面。
///
/// 优先级：**已在 `prefer_origin` 上** → **`about:` 空白页** → **任意页面**。
/// 顺序不可调换：第一项保证「只读采集不会把用户页面导航走」，第三项是防 Tab
/// 风暴的兜底 —— 只要还存在任何页面就绝不新建（2026-09-10 实测旧实现每次轮询
/// 新建一个标签页，堆积 46 个）。
pub fn pick_page_target(pages: &[(String, String)], prefer_origin: Option<&str>) -> Option<String> {
    let on_origin = prefer_origin.and_then(|origin| {
        pages
            .iter()
            .find(|(_, url)| super::origin_of(url).as_deref() == Some(origin))
            .map(|(id, _)| id.clone())
    });
    let blank = pages
        .iter()
        .find(|(_, url)| url.starts_with("about:"))
        .map(|(id, _)| id.clone());
    let any = pages.first().map(|(id, _)| id.clone());
    on_origin.or(blank).or(any)
}

/// 一个 CDP 连接（浏览器级），可附带一个页面 session。
pub struct CdpClient {
    outbound: mpsc::Sender<Value>,
    pending: PendingMap,
    next_id: AtomicU64,
    session_id: Option<String>,
}

impl CdpClient {
    /// 连接一个 CDP WebSocket 端点。地址先经 loopback 校验。
    pub async fn connect(ws_url: &str) -> Result<Self, String> {
        let target = validate_ws_url(ws_url)?;
        let (stream, _response) = tokio::time::timeout(
            CONNECT_TIMEOUT,
            tokio_tungstenite::connect_async(target.as_str()),
        )
        .await
        .map_err(|_| "CDP_CONNECT_TIMEOUT".to_string())?
        .map_err(|e| format!("CDP_CONNECT_FAILED: {e}"))?;

        let (mut sink, mut source) = stream.split();
        let (outbound, mut inbound) = mpsc::channel::<Value>(OUTBOUND_BUFFER);
        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));

        tokio::spawn(async move {
            while let Some(message) = inbound.recv().await {
                let payload = message.to_string();
                if sink.send(Message::Text(payload.into())).await.is_err() {
                    break;
                }
            }
            let _ = sink.close().await;
        });

        let reader_pending = pending.clone();
        tokio::spawn(async move {
            while let Some(Ok(message)) = source.next().await {
                let Message::Text(text) = message else {
                    continue;
                };
                let Ok(value) = serde_json::from_str::<Value>(text.as_str()) else {
                    continue;
                };
                let Some(id) = value.get("id").and_then(Value::as_u64) else {
                    // 事件（无 id），本模块不消费。
                    continue;
                };
                let sender = reader_pending
                    .lock()
                    .ok()
                    .and_then(|mut guard| guard.remove(&id));
                if let Some(sender) = sender {
                    let _ = sender.send(parse_response(&value));
                }
            }
            // 连接断开：唤醒所有等待者，避免命令悬挂到超时。
            if let Ok(mut guard) = reader_pending.lock() {
                for (_, sender) in guard.drain() {
                    let _ = sender.send(Err("CDP_DISCONNECTED".to_string()));
                }
            }
        });

        Ok(Self {
            outbound,
            pending,
            next_id: AtomicU64::new(0),
            session_id: None,
        })
    }

    async fn send(
        &self,
        method: &str,
        params: Value,
        session: Option<&str>,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst) + 1;
        let (sender, receiver) = oneshot::channel();
        self.pending
            .lock()
            .map_err(|_| "CDP_STATE_POISONED".to_string())?
            .insert(id, sender);

        let mut message = json!({ "id": id, "method": method, "params": params });
        if let Some(session_id) = session {
            message["sessionId"] = Value::String(session_id.to_string());
        }
        if self.outbound.send(message).await.is_err() {
            if let Ok(mut guard) = self.pending.lock() {
                guard.remove(&id);
            }
            return Err("CDP_SEND_FAILED".to_string());
        }

        match tokio::time::timeout(CALL_TIMEOUT, receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("CDP_RESPONSE_DROPPED".to_string()),
            Err(_) => {
                if let Ok(mut guard) = self.pending.lock() {
                    guard.remove(&id);
                }
                Err(format!("CDP_TIMEOUT: {method}"))
            }
        }
    }

    /// 浏览器级命令（不带 sessionId）。
    pub async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        self.send(method, params, None).await
    }

    /// 页面级命令（带当前 sessionId）。未附加页面时返回结构化错误。
    pub async fn page_call(&self, method: &str, params: Value) -> Result<Value, String> {
        let session = self
            .session_id
            .as_deref()
            .ok_or_else(|| "CDP_NO_PAGE_SESSION".to_string())?;
        self.send(method, params, Some(session)).await
    }

    /// 列出全部 `page` 类型目标，返回 `(targetId, url)`。
    ///
    /// 顺序即 CDP 返回顺序（最近使用的排在前面），调用方据此做稳定选择。
    async fn page_targets(&self) -> Result<Vec<(String, String)>, String> {
        let targets = self.call("Target.getTargets", json!({})).await?;
        Ok(targets
            .get("targetInfos")
            .and_then(Value::as_array)
            .map(|infos| {
                infos
                    .iter()
                    .filter_map(|info| {
                        if info.get("type").and_then(Value::as_str)? != "page" {
                            return None;
                        }
                        let id = info.get("targetId").and_then(Value::as_str)?.to_string();
                        let url = info
                            .get("url")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string();
                        Some((id, url))
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    /// 定位并附加一个页面作为 flatten session，同时启用所需域。
    ///
    /// **选择顺序（顺序即优先级，任何一步命中都不得再新建标签页）**：
    /// 1. 已在 `prefer_origin` 上的页面 —— 复用它可以避免「为了采集把用户页面导航走」；
    /// 2. 启动时的空白页（`about:`）；
    /// 3. 任意已存在的页面 —— 兜底复用，**这是防 Tab 风暴的关键一步**：只要还有页面
    ///    就绝不新建；
    /// 4. 一个页面都没有时才 `Target.createTarget`。
    ///
    /// 历史缺陷：旧实现只认 `about:` 页面，于是「轮询实时预览」在首次导航后每轮都
    /// 新建一个标签页并被导航到站点，实测堆积 46 个（2026-09-10 取证）。
    /// **只读调用方请勿依赖本函数创建页面**：先自己判断有没有可用页面。
    pub async fn attach_page(&mut self, prefer_origin: Option<&str>) -> Result<(), String> {
        let pages = self.page_targets().await?;
        let target_id = match pick_page_target(&pages, prefer_origin) {
            Some(id) => id,
            None => {
                let created = self
                    .call("Target.createTarget", json!({ "url": "about:blank" }))
                    .await?;
                created
                    .get("targetId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "CDP_NO_PAGE_TARGET".to_string())?
                    .to_string()
            }
        };

        let attached = self
            .call(
                "Target.attachToTarget",
                json!({ "targetId": target_id, "flatten": true }),
            )
            .await?;
        let session = attached
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or_else(|| "CDP_ATTACH_FAILED".to_string())?
            .to_string();
        self.session_id = Some(session);

        self.page_call("Page.enable", json!({})).await?;
        self.page_call("Network.enable", json!({})).await?;
        Ok(())
    }

    /// 导航当前页面到指定 URL。
    pub async fn navigate(&self, url: &str) -> Result<(), String> {
        self.page_call("Page.navigate", json!({ "url": url }))
            .await
            .map(|_| ())
    }

    /// 注册「文档创建时执行」脚本，返回其 identifier 供 {@link remove_init_script} 注销。
    ///
    /// 语义等价于 Tauri WebView 的 `initialization_script`：在页面脚本之前运行，
    /// 因此可用于在 SPA 首次读取 localStorage / IndexedDB **之前**完成恢复。
    pub async fn add_init_script(&self, source: &str) -> Result<Option<String>, String> {
        let result = self
            .page_call(
                "Page.addScriptToEvaluateOnNewDocument",
                json!({ "source": source }),
            )
            .await?;
        Ok(result
            .get("identifier")
            .and_then(Value::as_str)
            .map(str::to_string))
    }

    /// 注销一个「文档创建时执行」脚本（对已创建的文档无影响）。
    pub async fn remove_init_script(&self, identifier: &str) -> Result<(), String> {
        self.page_call(
            "Page.removeScriptToEvaluateOnNewDocument",
            json!({ "identifier": identifier }),
        )
        .await
        .map(|_| ())
    }

    /// 注入一条 cookie。返回 `false` 表示浏览器拒绝了该 cookie（属性不合法等）。
    pub async fn set_cookie(&self, params: Value) -> Result<bool, String> {
        let result = self.page_call("Network.setCookie", params).await?;
        Ok(result
            .get("success")
            .and_then(Value::as_bool)
            .unwrap_or(true))
    }

    /// 读取该浏览器实例的全部 cookie（**含 HttpOnly**）。
    pub async fn all_cookies(&self) -> Result<Vec<Value>, String> {
        let result = self.page_call("Network.getAllCookies", json!({})).await?;
        Ok(result
            .get("cookies")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default())
    }

    /// 在页面中求值（`returnByValue` + `awaitPromise`），返回 JS 值。
    pub async fn evaluate(&self, expression: &str) -> Result<Value, String> {
        let result = self
            .page_call(
                "Runtime.evaluate",
                json!({
                    "expression": expression,
                    "returnByValue": true,
                    "awaitPromise": true,
                }),
            )
            .await?;
        if let Some(exception) = result.get("exceptionDetails") {
            let text = exception
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or("evaluation failed");
            return Err(format!("CDP_EVALUATE_FAILED: {text}"));
        }
        Ok(result
            .get("result")
            .and_then(|inner| inner.get("value"))
            .cloned()
            .unwrap_or(Value::Null))
    }

    /// 覆盖 UA，避免注入后 UA 突变触发站点风控。空串视为「不覆盖」。
    pub async fn set_user_agent(&self, user_agent: &str) -> Result<(), String> {
        if user_agent.trim().is_empty() {
            return Ok(());
        }
        self.page_call(
            "Emulation.setUserAgentOverride",
            json!({ "userAgent": user_agent }),
        )
        .await
        .map(|_| ())
    }

    /// 优雅关闭整个浏览器实例。
    pub async fn close_browser(&self) -> Result<(), String> {
        self.call("Browser.close", json!({})).await.map(|_| ())
    }
}

/// 从 `http://127.0.0.1:<port>/json/version` 取浏览器级 WebSocket 调试地址。
pub async fn browser_ws_url(port: u16) -> Result<String, String> {
    let endpoint = format!("http://127.0.0.1:{port}/json/version");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "CDP_HTTP_CLIENT_FAILED".to_string())?;
    let response = client
        .get(&endpoint)
        .send()
        .await
        .map_err(|_| "CDP_VERSION_ENDPOINT_UNREACHABLE".to_string())?;
    if !response.status().is_success() {
        return Err("CDP_VERSION_ENDPOINT_HTTP_ERROR".to_string());
    }
    let payload: Value = response
        .json()
        .await
        .map_err(|_| "CDP_VERSION_ENDPOINT_BAD_JSON".to_string())?;
    let ws_url = payload
        .get("webSocketDebuggerUrl")
        .and_then(Value::as_str)
        .ok_or_else(|| "CDP_VERSION_ENDPOINT_NO_WS_URL".to_string())?;
    validate_ws_url(ws_url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_ws_urls_are_accepted() {
        assert!(validate_ws_url("ws://127.0.0.1:9222/devtools/browser/abc").is_ok());
        assert!(validate_ws_url("ws://localhost:9222/devtools/browser/abc").is_ok());
    }

    #[test]
    fn remote_ws_urls_are_rejected() {
        // 调试端口可完全控制实例：连接非 loopback 地址等于交出账号会话。
        assert_eq!(
            validate_ws_url("ws://example.com:9222/devtools/browser/abc").unwrap_err(),
            "CDP_WS_URL_NOT_LOOPBACK"
        );
        assert_eq!(
            validate_ws_url("ws://192.168.1.5:9222/devtools/browser/abc").unwrap_err(),
            "CDP_WS_URL_NOT_LOOPBACK"
        );
    }

    #[test]
    fn non_ws_schemes_are_rejected() {
        assert_eq!(
            validate_ws_url("http://127.0.0.1:9222/devtools/browser/abc").unwrap_err(),
            "CDP_WS_URL_NOT_WS"
        );
        // wss（TLS）同样拒绝：本机调试端口不提供 TLS，接受它意味着容忍中间人。
        assert_eq!(
            validate_ws_url("wss://127.0.0.1:9222/devtools/browser/abc").unwrap_err(),
            "CDP_WS_URL_NOT_WS"
        );
    }

    #[test]
    fn garbage_is_rejected() {
        assert!(validate_ws_url("not a url").is_err());
        assert!(validate_ws_url("").is_err());
    }

    #[test]
    fn response_error_takes_precedence_over_result() {
        let value = json!({
            "id": 1,
            "error": { "code": -32601, "message": "method not found" },
            "result": { "ignored": true },
        });
        let error = parse_response(&value).unwrap_err();
        assert!(error.contains("method not found"), "got {error}");
    }

    #[test]
    fn response_without_result_is_null_value() {
        let value = json!({ "id": 7 });
        assert_eq!(parse_response(&value).unwrap(), Value::Null);
    }

    #[test]
    fn response_result_payload_is_returned() {
        let value = json!({ "id": 7, "result": { "success": false } });
        assert_eq!(parse_response(&value).unwrap()["success"], json!(false));
    }

    fn page(id: &str, url: &str) -> (String, String) {
        (id.to_string(), url.to_string())
    }

    #[test]
    fn empty_page_list_requires_creating_a_target() {
        // 只有「一个页面都没有」时才允许新建，这是防 Tab 风暴的兜底条件。
        assert_eq!(
            pick_page_target(&[], Some("https://www.workbuddy.cn")),
            None
        );
        assert_eq!(pick_page_target(&[], None), None);
    }

    #[test]
    fn page_already_on_target_origin_wins_over_blank_page() {
        // 首选已在站点 origin 的页面：避免为采集把用户页面导航走。
        let pages = vec![
            page("blank", "about:blank"),
            page("site", "https://www.workbuddy.cn/console"),
        ];
        assert_eq!(
            pick_page_target(&pages, Some("https://www.workbuddy.cn")),
            Some("site".to_string())
        );
    }

    #[test]
    fn any_existing_page_is_reused_instead_of_creating_a_new_one() {
        // 复现历史缺陷场景：首次导航后只剩站点页，下一轮必须复用它而不是新建。
        let pages = vec![page("site", "https://www.workbuddy.cn/")];
        assert_eq!(
            pick_page_target(&pages, Some("https://www.workbuddy.cn")),
            Some("site".to_string())
        );
        // 连 origin 都不匹配时也必须复用，绝不新建。
        assert_eq!(
            pick_page_target(&pages, Some("https://www.trae.cn")),
            Some("site".to_string())
        );
    }

    #[test]
    fn blank_page_is_preferred_over_unrelated_page() {
        // 启动页优先于用户已打开的无关页面。
        let pages = vec![
            page("other", "https://example.com/"),
            page("blank", "about:blank"),
        ];
        assert_eq!(pick_page_target(&pages, None), Some("blank".to_string()));
    }

    #[test]
    fn opaque_schemes_never_match_a_preferred_origin() {
        // opaque 源（about:/data:/file:）序列化为字符串 "null"。
        // 把这类页面排在空白页之前：若它被误当成 origin 命中，就会选中 "data"
        // 而不是应该走的空白页分支。
        let pages = vec![
            page("data", "data:text/html,<p>x"),
            page("blank", "about:blank"),
        ];
        assert_eq!(
            pick_page_target(&pages, Some("null")),
            Some("blank".to_string())
        );
    }
}
