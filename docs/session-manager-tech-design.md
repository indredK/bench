# Session Manager 技术设计文档

> 版本: v1.8 | 日期: 2026-06-30 | 关联 PRD: session-manager-design-spec.md (v1.8)

## 目录

1. [数据模型](#1-数据模型)
2. [Session 持久化引擎](#2-session-持久化引擎)
3. [AuthProfile 检测引擎](#3-authprofile-检测引擎)
4. [分层探针引擎](#4-分层探针引擎)
5. [多账号互斥引擎](#5-多账号互斥引擎)
6. [API 契约](#6-api-契约)
7. [存储与加密](#7-存储与加密)
8. [生命周期集成](#8-生命周期集成)

---

## 1. 数据模型

### 1.1 类型定义

```rust
// ─── src-tauri/src/api_billing/types.rs ───

// === 账户类型 ===
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum AccountType {
    #[default]
    Persistent,
    Ephemeral,
}

// === Session 状态（保留现有枚举） ===
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AccountSessionStatus {
    Ready,
    LoginRequired,
    Expired,
    FetchFailed,
    Inactive,  // 新增: rotating 模式下非活跃账号
}

// === Cookie 条目 ===
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CookieEntry {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub http_only: bool,
    pub secure: bool,
    pub same_site: Option<String>,
    pub partitioned: bool,     // CHIPS: Cookies Having Independent Partitioned State
    pub expires: Option<String>,
}

// === 完整 Session 快照 ===
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccountSession {
    pub cookies: Vec<CookieEntry>,
    pub local_storage: Option<EncryptedBlob>,
    pub session_storage: Option<EncryptedBlob>,
    pub indexeddb_snapshot: Option<EncryptedBlob>,
    pub csrf_token: Option<CsrfTokenEntry>,
    pub captured_at: String,
    pub expires_hint: Option<String>,
    pub user_agent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsrfTokenEntry {
    pub extraction_method: String,  // "meta" | "cookie" | "input" | "js_var"
    pub token_name: String,
    pub token_value: String,
}

// === AuthProfile ===
#[derive(Debug, Clone, Serialize, Deserialize, Default)]  // v1.3 修正 R06: 新增 Default
#[serde(rename_all = "camelCase")]
pub struct AuthProfile {
    pub cookie_based: bool,
    pub token_storage: TokenStorage,
    pub csrf_protection: bool,
    pub csrf_extraction: Option<CsrfExtraction>,
    pub auth_type: AuthType,
    pub fingerprinting: FingerprintingLevel,
    pub anti_bot: bool,
    pub anti_bot_provider: Option<AntiBotProvider>,
    pub sso_provider: Option<SsoProvider>,
    pub probe_strategy: ProbeStrategy,
    pub detected_at: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum TokenStorage {
    Cookie,
    LocalStorage,
    SessionStorage,
    IndexedDB,
    Multiple,
    #[default]
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsrfExtraction {
    pub source: String,        // "meta" | "cookie" | "input"
    pub name: String,           // meta name / input name / cookie name
    pub header_name: String,    // 请求中使用的 header 名
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum AuthType {
    #[default]
    SessionCookie,
    BearerOAuth,
    Saml,
    OpenIdConnect,
    WebSocket,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum FingerprintingLevel {
    #[default]
    None,
    Basic,
    Strict,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AntiBotProvider {
    Cloudflare,
    CloudflareTurnstile,
    Recaptcha,
    HCaptcha,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SsoProvider {
    AzureAd,
    Okta,
    Auth0,
    Custom(String),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ProbeStrategy {
    #[default]
    HttpFirst,
    HttpOnly,
    WebviewOnly,
    Hybrid,
}

// === 互斥模式 ===
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ExclusivityMode {
    #[default]
    Coexisting,
    Exclusive,
    Rotating,
}

// === 探针结果 ===
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ProbeResult {
    Ready,
    LoginRequired,
    Expired,
    Uncertain,
    AntiBotBlocked,
    SsoChallenge,
    NetworkError(String),
}

// === 现有类型扩展 ===
// StationAccount 新增字段（v1.3 修正 R05: 全部加 #[serde(default)]）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationAccount {
    // ... 现有字段 ...
    #[serde(default)]
    pub account_type: AccountType,           // 默认 Persistent
    #[serde(default)]
    pub website: Option<String>,             // ephemeral 账号自带 URL
    #[serde(default)]
    pub session: Option<EncryptedBlob>,      // 加密的 AccountSession
    #[serde(default)]
    pub exclusivity_group: Option<String>,   // 互斥组标识
}

// RelayStation 新增字段（v1.3 修正 R05: 全部加 #[serde(default)]）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayStation {
    // ... 现有字段 ...
    #[serde(default)]
    pub exclusivity_mode: ExclusivityMode,   // 默认 Coexisting
    #[serde(default)]
    pub auth_profile: Option<AuthProfile>,   // 首次登录后自动填充
    #[serde(default)]
    pub probe_failure_count: u32,            // HTTP probe 连续失败次数
}
```

### 1.2 检测结果中间类型

```rust
// src-tauri/src/api_billing/detection.rs 新增

/// JS 注入脚本返回的原始检测数据
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectionResult {
    pub session_cookie_names: Vec<String>,
    pub total_cookies: usize,
    pub token_keys: Vec<String>,
    pub local_storage_tokens: HashMap<String, LocalStorageTokenInfo>,
    pub session_token_keys: Vec<String>,
    pub csrf: CsrfDetection,
    pub logout_elements: Vec<LogoutElement>,
    pub sso_provider: Option<String>,
    pub cloudflare: CloudflareDetection,
    pub websocket_detected: bool,
    pub url: String,
    pub title: String,
    pub has_service_worker: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalStorageTokenInfo {
    #[serde(rename = "type")]
    pub token_type: String,
    pub has_access_token: Option<bool>,
    pub has_refresh_token: Option<bool>,
    pub has_id_token: Option<bool>,
    pub preview: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsrfDetection {
    pub meta_name: Option<String>,
    pub meta_content: Option<String>,
    pub input_name: Option<String>,
    pub input_value: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoutElement {
    pub selector: String,
    pub text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudflareDetection {
    pub challenge: bool,
    pub turnstile: bool,
    pub recaptcha: bool,
}
```

---

## 2. Session 持久化引擎

### 2.1 登录捕获

```rust
// src-tauri/src/api_billing/session.rs (新文件)

use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use tokio::time::timeout;

use super::crypto;
use super::types::*;
use super::state::ApiBillingState;
use super::storage;

const CAPTURE_TIMEOUT_MS: u64 = 3_000;

/// 登录窗口导航到非登录页面后触发捕获
pub async fn capture_session_after_login<R: Runtime>(
    window: &WebviewWindow<R>,
    account: &StationAccount,
    auth_profile: &Option<AuthProfile>,
) -> ApiBillingResult<AccountSession> {
    let url = window.url().map_err(|e|
        ApiBillingError::store_fail(format!("get window url: {e}"))
    )?;
    let url_str = url.to_string();

    // 1. 提取 cookies（始终执行）
    let cookies = timeout(
        Duration::from_millis(CAPTURE_TIMEOUT_MS),
        extract_cookies(window, &url_str),
    ).await
        .map_err(|_| ApiBillingError::store_fail("cookie capture timeout"))?
        .unwrap_or_default();

    // 2. 获取 User-Agent
    let user_agent = extract_user_agent(window).await
        .unwrap_or_else(|_| "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)".to_string());

    // 3. 根据 AuthProfile 决定额外提取什么
    let mut session = AccountSession {
        cookies,
        user_agent,
        captured_at: crate::api_billing::commands::now_label(),
        ..Default::default()
    };

    if let Some(profile) = auth_profile {
        match profile.token_storage {
            TokenStorage::LocalStorage => {
                session.local_storage = Some(capture_local_storage(window).await?);
            }
            TokenStorage::SessionStorage => {
                session.session_storage = Some(capture_session_storage(window).await?);
            }
            TokenStorage::Multiple => {
                session.local_storage = Some(capture_local_storage(window).await?);
                session.session_storage = Some(capture_session_storage(window).await?);
            }
            _ => {}
        }

        if profile.csrf_protection {
            session.csrf_token = Some(extract_csrf_token(window).await?);
        }

        // 4. 估算过期时间
        session.expires_hint = estimate_session_expiry(&session.cookies);
    }

    Ok(session)
}

/// 通过 Tauri v2 cookies_for_url() API 获取指定 URL 的全部 cookie
///
/// WARNING (v1.3 修正 R02+R03):
/// - `cookies()` 不接受参数；按 URL 过滤必须用 `cookies_for_url(parsed_url)`
/// - `Cookie` 结构体字段全部私有，必须用访问器方法
/// - `expiration_date` 不存在 → `expires_datetime()`
/// - `same_site` 返回 `Option<SameSite>` 枚举非 String
async fn extract_cookies<R: Runtime>(
    window: &WebviewWindow<R>,
    url: &str,
) -> ApiBillingResult<Vec<CookieEntry>> {
    use tauri::Url;
    let parsed: Url = url.parse()
        .map_err(|e| ApiBillingError::invalid_input(format!("parse url: {e}")))?;

    let cookies = window.cookies_for_url(parsed).map_err(|e|
        ApiBillingError::store_fail(format!("cookies_for_url failed: {e}"))
    )?;

    Ok(cookies.into_iter().map(|c| CookieEntry {
        name: c.name().to_string(),
        value: c.value().to_string(),
        domain: c.domain().unwrap_or_default().to_string(),
        path: c.path().unwrap_or("/").to_string(),
        http_only: c.http_only().unwrap_or(false),
        secure: c.secure().unwrap_or(false),
        same_site: c.same_site().map(|s| format!("{:?}", s)),
        partitioned: c.partitioned().unwrap_or(false),
        expires: c.expires_datetime().map(|d| d.to_rfc3339()),
    }).collect())
}

/// 提取 localStorage 并加密
async fn capture_local_storage<R: Runtime>(
    window: &WebviewWindow<R>,
) -> ApiBillingResult<EncryptedBlob> {
    let script = r#"
        (function() {
            const data = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                data[key] = localStorage.getItem(key);
            }
            return JSON.stringify(data);
        })()
    "#;

    let raw: String = evaluate_and_decode(window, script).await?;
    let key = get_master_key()?;
    crypto::encrypt(&key, &raw)
}

/// 提取 sessionStorage 并加密
async fn capture_session_storage<R: Runtime>(
    window: &WebviewWindow<R>,
) -> ApiBillingResult<EncryptedBlob> {
    let script = r#"
        (function() {
            const data = {};
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                data[key] = sessionStorage.getItem(key);
            }
            return JSON.stringify(data);
        })()
    "#;

    let raw: String = evaluate_and_decode(window, script).await?;
    let key = get_master_key()?;
    crypto::encrypt(&key, &raw)
}

/// 提取 CSRF token
async fn extract_csrf_token<R: Runtime>(
    window: &WebviewWindow<R>,
) -> ApiBillingResult<CsrfTokenEntry> {
    let script = r#"
        (function() {
            // 优先检查 meta tag
            const metaNames = ['csrf-token', '_csrf', 'csrf', 'csrf-param'];
            for (const name of metaNames) {
                const meta = document.querySelector(`meta[name="${name}"]`);
                if (meta?.content) {
                    return JSON.stringify({
                        extraction_method: 'meta',
                        token_name: name,
                        token_value: meta.content
                    });
                }
            }

            // 检查 input
            const inputNames = ['_csrf', 'csrf_token', 'csrfmiddlewaretoken'];
            for (const name of inputNames) {
                const input = document.querySelector(`input[name="${name}"]`);
                if (input?.value) {
                    return JSON.stringify({
                        extraction_method: 'input',
                        token_name: name,
                        token_value: input.value
                    });
                }
            }

            // 检查 cookie (double-submit 模式)
            if (document.cookie) {
                const match = document.cookie.match(
                    /(?:^|;\s*)(XSRF-TOKEN|csrf_token|csrftoken)=([^;]*)/
                );
                if (match) {
                    return JSON.stringify({
                        extraction_method: 'cookie',
                        token_name: match[1],
                        token_value: match[2]
                    });
                }
            }

            return JSON.stringify(null);
        })()
    "#;

    let result: String = evaluate_and_decode(window, script).await?;
    let entry: Option<CsrfTokenEntry> = serde_json::from_str(&result).ok().flatten();

    entry.ok_or_else(|| ApiBillingError::store_fail("no CSRF token found"))
}

/// 提取 User-Agent
/// WARNING (v1.3 修正 R18): WKWebView UA 已冻结版本号。
/// macOS 26+ 的 WKWebView UA 不再包含具体 OS 版本。
/// fallback 必须使用完整 WKWebView 格式以匹配 HTTP probe。
async fn extract_user_agent<R: Runtime>(
    window: &WebviewWindow<R>,
) -> ApiBillingResult<String> {
    let script = "JSON.stringify(navigator.userAgent)";
    evaluate_and_decode(window, script).await
        .or_else(|_| {
            // v1.3 修正 R18: 完整 WKWebView UA 格式
            Ok("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
                AppleWebKit/605.1.15 (KHTML, like Gecko) \
                Version/17.0 Safari/605.1.15".to_string())
        })
}

/// 估算 session 过期时间
fn estimate_session_expiry(cookies: &[CookieEntry]) -> Option<String> {
    cookies.iter()
        .filter(|c| c.expires.is_some())
        .filter_map(|c| c.expires.clone())
        .max()
}

/// WARNING (v1.3 修正 R01): Tauri v2 的 `window.eval()` 是同步方法返回 `Result<()>`,
/// 不返回 JS 表达式的值,也不是 async。获取 JS 返回值必须用 `eval_with_callback` + oneshot。
///
/// 通用 eval + decode 辅助
///
/// 注意事项（macOS WKWebView）：
/// - evaluateJavaScript 必须在主线程调用（Apple 要求）
/// - Tauri v2 的 `eval_with_callback` 内部已处理线程调度
/// - 返回的 JS 值经过 JSON 编码，需要 serde_json 解码
/// - 复杂对象的 return 需要用 JSON.stringify() 包裹
pub(crate) async fn evaluate_and_decode<R: Runtime>(
    window: &WebviewWindow<R>,
    script: &str,
) -> ApiBillingResult<String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();

    // eval_with_callback: 执行 JS 后回调
    // JS 侧必须用 JSON.stringify() 包裹返回值
    window
        .eval_with_callback(script, move |result| {
            let _ = tx.send(result);
        })
        .map_err(|e| ApiBillingError::store_fail(format!("eval failed: {e}")))?;

    let payload = rx.await.map_err(|_|
        ApiBillingError::store_fail("eval callback channel closed")
    )?;

    // eval_with_callback 返回 JSON-encoded JS 值
    let value: serde_json::Value = serde_json::from_str(&payload)
        .map_err(|e| ApiBillingError::store_fail(format!("decode eval result: {e}")))?;

    match value {
        serde_json::Value::String(s) => Ok(s),
        serde_json::Value::Null => Err(ApiBillingError::store_fail("eval returned null")),
        other => Ok(other.to_string()),
    }
}

/// 带超时的 eval（防止 JS 执行卡死）
#[allow(dead_code)]
async fn evaluate_with_timeout<R: Runtime>(
    window: &WebviewWindow<R>,
    script: &str,
    timeout_ms: u64,
) -> ApiBillingResult<String> {
    tokio::time::timeout(
        Duration::from_millis(timeout_ms),
        evaluate_and_decode(window, script),
    ).await
        .map_err(|_| ApiBillingError::store_fail("eval timeout"))?
}
```

### 2.2 启动恢复

```rust
// src-tauri/src/api_billing/session.rs (续)

/// 启动时恢复所有持久账户的 session
pub async fn restore_sessions_on_startup<R: Runtime>(
    app: &AppHandle<R>,
    state: &ApiBillingState,
) {
    let snapshot = state.read_snapshot();
    let persistent_accounts: Vec<&StationAccount> = snapshot.accounts.iter()
        .filter(|a| a.account_type == AccountType::Persistent
                 && a.session.is_some()
                 && a.status == AccountSessionStatus::Ready)
        .collect();

    let key = match state.master_key() {
        Ok(k) => k,
        Err(e) => {
            eprintln!("[session] master_key unavailable: {e}");
            return;
        }
    };

    for account in persistent_accounts {
        let blob = match &account.session {
            Some(b) => b,
            None => continue,
        };

        let session: AccountSession = match crypto::decrypt(&key, blob) {
            Ok(raw) => match serde_json::from_str(&raw) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[session] deserialize failed for {}: {e}", account.id);
                    continue;
                }
            },
            Err(e) => {
                eprintln!("[session] decrypt failed for {}: {e}", account.id);
                continue;
            }
        };

        // 检查 cookie 是否全部过期
        if all_cookies_expired(&session.cookies) {
            update_account_status(state, &account.id, AccountSessionStatus::LoginRequired);
            continue;
        }

        // 注入 cookies 到 WebView
        let website = account.website.as_deref()
            .or_else(|| snapshot.stations.iter()
                .find(|s| s.id == account.station_id)
                .map(|s| s.website.as_str()))
            .unwrap_or("");

        if let Err(e) = inject_cookies_to_webview(app, &account.id, &session.cookies, website).await {
            eprintln!("[session] cookie injection failed for {}: {e}", account.id);
            continue;
        }

        // 根据 AuthProfile 选择探针策略
        let station = snapshot.stations.iter()
            .find(|s| s.id == account.station_id);

        let profile = station.and_then(|s| s.auth_profile.as_ref());
        let strategy = profile
            .map(|p| p.probe_strategy)
            .unwrap_or(ProbeStrategy::HttpFirst);

        let result = probe_session(app, &account.id, website, &session, strategy).await;

        match result {
            ProbeResult::Ready => {
                // session 仍然有效
            }
            ProbeResult::LoginRequired | ProbeResult::Expired => {
                update_account_status(state, &account.id, AccountSessionStatus::LoginRequired);
                clear_session_for_account(state, &account.id);
            }
            _ => {
                // 网络错误等，保持当前状态
                eprintln!("[session] probe uncertain for {}", account.id);
            }
        }
    }
}

/// 将 cookies 注入到 WebView cookie store
async fn inject_cookies_to_webview<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    cookies: &[CookieEntry],
    website: &str,
) -> ApiBillingResult<()> {
    use crate::api_billing::webview;

    let label = webview::probe_window_label(account_id);
    let parsed: url::Url = website.parse()
        .map_err(|e| ApiBillingError::invalid_input(format!("website url: {e}")))?;

    // 创建临时 WebView
    let window = {
        let data_dir = webview::account_data_dir(app, account_id)?;
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| ApiBillingError::store_fail(format!("create dir: {e}")))?;

        let mut builder = tauri::WebviewWindowBuilder::new(
            app,
            &label,
            tauri::WebviewUrl::External(parsed.clone()),
        )
        .visible(false)
        .data_directory(data_dir);

        #[cfg(any(target_os = "macos", target_os = "ios"))]
        {
            builder = builder
                .data_store_identifier(webview::account_data_store_identifier(account_id));
        }

        builder.build()
            .map_err(|e| ApiBillingError::store_fail(format!("build webview: {e}")))?
    };

    // 逐个注入 cookie
    for cookie in cookies {
        // Tauri v2 的 cookie API 操作
        // 注意: 实际 API 取决于 Tauri v2 的具体实现
    }

    Ok(())
}

fn all_cookies_expired(cookies: &[CookieEntry]) -> bool {
    if cookies.is_empty() {
        return true;
    }
    let now = chrono::Utc::now();
    cookies.iter().all(|c| {
        c.expires.as_ref().and_then(|e| {
            chrono::NaiveDateTime::parse_from_str(e, "%Y-%m-%dT%H:%M:%S%.fZ").ok()
        }).map(|exp| exp.and_utc() < now).unwrap_or(false)
    })
}
```

### 2.3 退出持久化

```rust
// src-tauri/src/api_billing/session.rs (续)

/// App 退出前持久化所有活跃 session
pub async fn persist_all_sessions_on_exit<R: Runtime>(
    app: &AppHandle<R>,
    state: &ApiBillingState,
) {
    let snapshot = state.read_snapshot();
    let key = match state.master_key() {
        Ok(k) => k,
        Err(e) => {
            eprintln!("[session] cannot persist: master_key unavailable: {e}");
            return;
        }
    };

    for account in &snapshot.accounts {
        if account.account_type != AccountType::Persistent {
            continue;
        }
        if account.status != AccountSessionStatus::Ready {
            continue;
        }

        // 尝试从仍存在的登录窗口捕获最新 cookie
        let login_label = crate::api_billing::webview::login_window_label(&account.id);
        if let Some(window) = app.get_webview_window(&login_label) {
            let website = account.website.as_deref().unwrap_or("");
            match extract_cookies(&window, website).await {
                Ok(cookies) if !cookies.is_empty() => {
                    let session = AccountSession {
                        cookies,
                        captured_at: commands::now_label(),
                        user_agent: "".into(),
                        ..Default::default()
                    };
                    if let Ok(blob) = encrypt_session(&key, &session) {
                        update_session_for_account(state, &account.id, blob);
                    }
                }
                _ => {}
            }
        }
    }

    // 强制 flush store 到磁盘
    if let Err(e) = storage::flush_to_disk(app) {
        eprintln!("[session] flush failed: {e}");
    }

    // 清理 ephemeral 账户
    cleanup_ephemeral_accounts(state);
}

fn encrypt_session(key: &[u8; 32], session: &AccountSession) -> ApiBillingResult<EncryptedBlob> {
    let json = serde_json::to_string(session)
        .map_err(|e| ApiBillingError::store_fail(format!("serialize session: {e}")))?;
    crypto::encrypt(key, &json)
}
```

### 2.4 lib.rs 集成点

```rust
// src-tauri/src/lib.rs 修改

pub fn run() {
    // ... 现有 setup 代码 ...

    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
        match event {
            tauri::RunEvent::Exit => {
                sleep_inhibitor::commands::cleanup_on_exit();
            }
            tauri::RunEvent::ExitRequested { .. } => {
                // 新增: 退出前持久化所有 session
                let state = app_handle.state::<ApiBillingState>();
                let handle = app_handle.clone();
                tauri::async_runtime::block_on(async move {
                    api_billing::session::persist_all_sessions_on_exit(
                        &handle, &state
                    ).await;
                });
                sleep_inhibitor::commands::cleanup_on_exit();
            }
            _ => {}
        }
    });
}
```

---

## 3. AuthProfile 检测引擎

### 3.1 JS 注入脚本

```javascript
// src-tauri/src/api_billing/auth_profile.js (内联为 Rust 字符串)

(function() { 'use strict';

    // ── 1. Cookie 检测 ──
    const cookies = document.cookie.split('; ').filter(Boolean);
    const sessionCookieNames = cookies
        .map(c => c.split('=')[0])
        .filter(name =>
            /session|auth|sid|token|connect\.sid|JSESSIONID|PHPSESSID/i.test(name)
        );

    // ── 2. localStorage token 检测 ──
    const lsKeys = Object.keys(localStorage);
    const tokenKeys = lsKeys.filter(k =>
        /token|auth|session|jwt|access|id_token|refresh/i.test(k)
    );
    const localStorageTokens = {};
    tokenKeys.forEach(k => {
        const raw = localStorage.getItem(k);
        try {
            const parsed = JSON.parse(raw);
            localStorageTokens[k] = {
                type: typeof parsed,
                hasAccessToken: !!parsed.access_token,
                hasRefreshToken: !!parsed.refresh_token,
                hasIdToken: !!parsed.id_token,
                preview: raw.substring(0, 30) + '...'
            };
        } catch {
            localStorageTokens[k] = {
                type: 'string',
                preview: raw.substring(0, 30) + '...'
            };
        }
    });

    // ── 3. sessionStorage 检测 ──
    const ssKeys = Object.keys(sessionStorage);
    const sessionTokenKeys = ssKeys.filter(k =>
        /token|auth|session/i.test(k)
    );

    // ── 4. CSRF token 检测 ──
    const csrfMeta = document.querySelector(
        'meta[name="csrf-token"], meta[name="_csrf"], ' +
        'meta[name="csrf"], meta[name="csrf-param"]'
    );
    const csrfInput = document.querySelector(
        'input[name="_csrf"], input[name="csrf_token"], ' +
        'input[name="csrfmiddlewaretoken"]'
    );

    // ── 5. 登录状态 UI 检测 ──
    const logoutSelectors = [
        'a[href*="logout"]', 'a[href*="signout"]', 'a[href*="sign-out"]',
        'a[href*="log-out"]', 'button[data-testid="logout"]',
        '[aria-label*="logout"]', '[aria-label*="sign out"]',
        '[data-action="logout"]', '[ng-click*="logout"]',
    ];
    const logoutElements = logoutSelectors
        .map(sel => {
            const el = document.querySelector(sel);
            return el ? {
                selector: sel,
                text: el.textContent?.trim()?.substring(0, 50) || ''
            } : null;
        })
        .filter(Boolean);

    // ── 6. SSO 重定向检测 ──
    const url = window.location.href;
    const isSSOLogin =
        /login\.(microsoft|microsoftonline|okta|auth0)\.com/i.test(url) ||
        /\/saml\/|\/oauth2\/|\/openid\//i.test(url);
    const ssoProvider = isSSOLogin ? (
        /microsoft/i.test(url) ? 'azure_ad' :
        /okta/i.test(url) ? 'okta' :
        /auth0/i.test(url) ? 'auth0' : 'unknown'
    ) : null;

    // ── 7. 反机器人检测 ──
    const cloudflareChallenge = !!document.querySelector(
        '#challenge-form, #cf-challenge, [id*="cf-chl"]'
    );
    const hasTurnstile = !!document.querySelector('.cf-turnstile');
    const hasRecaptcha = !!document.querySelector('.g-recaptcha');

    // ── 8. WebSocket 检测 ──
    let wsDetected = false;
    try {
        const OrigWebSocket = window.WebSocket;
        const wsProxy = new Proxy(OrigWebSocket, {
            construct(target, args) {
                wsDetected = true;
                return new target(...args);
            }
        });
    } catch(e) { /* ignore */ }

    // ── 9. Service Worker 检测 ──
    const hasServiceWorker = !!(navigator.serviceWorker && navigator.serviceWorker.controller);

    return JSON.stringify({
        sessionCookieNames,
        totalCookies: cookies.length,
        tokenKeys,
        localStorageTokens,
        sessionTokenKeys,
        csrf: {
            metaName: csrfMeta?.getAttribute('name') || null,
            metaContent: csrfMeta?.getAttribute('content')?.substring(0, 20) || null,
            inputName: csrfInput?.getAttribute('name') || null,
            inputValue: csrfInput?.getAttribute('value')?.substring(0, 20) || null,
        },
        logoutElements,
        ssoProvider,
        cloudflare: {
            challenge: cloudflareChallenge,
            turnstile: hasTurnstile,
            recaptcha: hasRecaptcha,
        },
        websocketDetected: wsDetected,
        url: window.location.href,
        title: document.title,
        hasServiceWorker,
    });
})()
```

### 3.2 分类引擎

```rust
// src-tauri/src/api_billing/detection.rs 新增

use super::types::*;

const DETECTION_SCRIPT: &str = include_str!("auth_profile.js");

/// 执行检测脚本并分类生成 AuthProfile
pub async fn detect_auth_profile<R: Runtime>(
    window: &WebviewWindow<R>,
) -> ApiBillingResult<AuthProfile> {
    let raw: String = super::session::evaluate_and_decode(window, DETECTION_SCRIPT).await?;

    let detection: DetectionResult = serde_json::from_str(&raw)
        .map_err(|e| ApiBillingError::store_fail(format!("parse detection result: {e}")))?;

    Ok(classify(detection))
}

pub fn classify(d: DetectionResult) -> AuthProfile {
    let mut profile = AuthProfile::default();

    // 1. cookie_based
    profile.cookie_based = !d.session_cookie_names.is_empty() || d.total_cookies > 0;

    // 2. token_storage
    let has_ls_tokens = !d.token_keys.is_empty();
    let has_ss_tokens = !d.session_token_keys.is_empty();
    if has_ls_tokens && has_ss_tokens {
        profile.token_storage = TokenStorage::Multiple;
    } else if has_ls_tokens {
        profile.token_storage = TokenStorage::LocalStorage;
    } else if has_ss_tokens {
        profile.token_storage = TokenStorage::SessionStorage;
    } else if profile.cookie_based {
        profile.token_storage = TokenStorage::Cookie;
    }

    // 3. csrf
    profile.csrf_protection = d.csrf.meta_name.is_some() || d.csrf.input_name.is_some();
    if profile.csrf_protection {
        profile.csrf_extraction = if let Some(ref name) = d.csrf.meta_name {
            Some(CsrfExtraction {
                source: "meta".into(),
                name: name.clone(),
                header_name: csrf_header_name_from_meta(name),
            })
        } else if let Some(ref name) = d.csrf.input_name {
            Some(CsrfExtraction {
                source: "input".into(),
                name: name.clone(),
                header_name: csrf_header_name_from_input(name),
            })
        } else {
            None
        };
    }

    // 4. auth_type
    profile.auth_type = if d.sso_provider.is_some() {
        match d.sso_provider.as_deref() {
            Some("azure_ad") => AuthType::Saml,
            Some("okta") | Some("auth0") => AuthType::OpenIdConnect,
            _ => AuthType::Unknown,
        }
    } else if d.websocket_detected {
        AuthType::WebSocket
    } else if has_ls_tokens {
        AuthType::BearerOAuth
    } else {
        AuthType::SessionCookie
    };

    // 5. fingerprinting
    profile.fingerprinting = if d.cloudflare.challenge || d.cloudflare.turnstile {
        FingerprintingLevel::Strict
    } else if has_service_worker_active(&d) {
        FingerprintingLevel::Basic
    } else {
        FingerprintingLevel::None
    };

    // 6. anti_bot
    profile.anti_bot = d.cloudflare.challenge || d.cloudflare.turnstile;
    profile.anti_bot_provider = if d.cloudflare.challenge {
        Some(AntiBotProvider::Cloudflare)
    } else if d.cloudflare.turnstile {
        Some(AntiBotProvider::CloudflareTurnstile)
    } else if d.cloudflare.recaptcha {
        Some(AntiBotProvider::Recaptcha)
    } else {
        None
    };

    // 7. sso_provider
    profile.sso_provider = d.sso_provider.map(|s| match s.as_str() {
        "azure_ad" => SsoProvider::AzureAd,
        "okta" => SsoProvider::Okta,
        "auth0" => SsoProvider::Auth0,
        other => SsoProvider::Custom(other.to_string()),
    });

    // 8. probe_strategy
    profile.probe_strategy = if profile.anti_bot
        || profile.fingerprinting == FingerprintingLevel::Strict
        || profile.auth_type == AuthType::Saml
        || d.has_service_worker
    {
        ProbeStrategy::WebviewOnly
    } else if profile.auth_type == AuthType::OpenIdConnect {
        ProbeStrategy::Hybrid
    } else {
        ProbeStrategy::HttpFirst
    };

    // 9. confidence
    profile.confidence = calculate_confidence(&d, &profile);
    profile.detected_at = super::commands::now_label();

    profile
}

fn csrf_header_name_from_meta(name: &str) -> String {
    match name {
        "csrf-token" | "csrf" => "X-CSRF-Token".into(),
        "_csrf" => "X-CSRF-Token".into(),  // Spring Security
        other => format!("X-{}", other.to_uppercase()),
    }
}

fn csrf_header_name_from_input(name: &str) -> String {
    csrf_header_name_from_meta(name)
}

fn has_service_worker_active(d: &DetectionResult) -> bool {
    d.has_service_worker
}

fn calculate_confidence(d: &DetectionResult, p: &AuthProfile) -> f32 {
    let mut score = 0.5f32;

    // cookie 检测置信度高
    if !d.session_cookie_names.is_empty() { score += 0.15; }

    // localStorage token 明确
    if !d.token_keys.is_empty() { score += 0.15; }

    // logout UI 明确 → 登录状态确定
    if !d.logout_elements.is_empty() { score += 0.1; }

    // SSO 识别
    if d.sso_provider.is_some() { score += 0.1; }

    // 反机器人检测明确
    if d.cloudflare.challenge || d.cloudflare.turnstile { score += 0.05; }

    score.min(1.0)
}
```

### 3.3 登录后触发

```rust
// src-tauri/src/api_billing/commands.rs 修改

// 在 open_login_window 或相关命令中，登录完成后:
async fn on_login_completed<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
    account: &StationAccount,
) -> ApiBillingResult<()> {
    // 1. 检测 AuthProfile
    let profile = detect_auth_profile(window).await?;

    // 2. 更新 Station 的 AuthProfile
    update_station_auth_profile(app, &account.station_id, &profile).await?;

    // 3. 捕获 session
    let session = capture_session_after_login(window, account, &Some(profile.clone())).await?;

    // 4. 加密存储 session
    let state = app.state::<ApiBillingState>();
    let key = state.master_key()?;
    let json = serde_json::to_string(&session).map_err(|e|
        ApiBillingError::store_fail(format!("serialize session: {e}"))
    )?;
    let blob = crypto::encrypt(&key, &json)?;

    // 5. 更新账号状态
    storage::with_state_mut(app, &state, |snapshot| {
        if let Some(acc) = snapshot.accounts.iter_mut().find(|a| a.id == account.id) {
            acc.status = AccountSessionStatus::Ready;
            acc.last_login_at = Some(now_label());
            acc.session = Some(blob);
        }
        Ok(())
    })?;

    Ok(())
}
```

---

## 4. 分层探针引擎

### 4.1 策略路由

```rust
// src-tauri/src/api_billing/probe.rs 修改

use super::types::*;

/// 统一探针入口 — 根据 AuthProfile 路由到不同策略
pub async fn probe_session<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    website: &str,
    session: &AccountSession,
    strategy: ProbeStrategy,
) -> ProbeResult {
    match strategy {
        ProbeStrategy::HttpOnly => {
            http_probe(website, &session.cookies, &session.user_agent,
                        session.csrf_token.as_ref()).await
        }
        ProbeStrategy::HttpFirst => {
            let result = http_probe(website, &session.cookies, &session.user_agent,
                                     session.csrf_token.as_ref()).await;
            match result {
                ProbeResult::Ready | ProbeResult::LoginRequired
                | ProbeResult::Expired => result,
                _ => {
                    // 降级到 WebView probe
                    webview_probe(app, account_id, website, session).await
                }
            }
        }
        ProbeStrategy::WebviewOnly => {
            webview_probe(app, account_id, website, session).await
        }
        ProbeStrategy::Hybrid => {
            hybrid_probe(app, account_id, website, session).await
        }
    }
}
```

### 4.2 L1: HTTP Probe

```rust
// src-tauri/src/api_billing/probe.rs 新增

use reqwest::{Client, redirect, header};

/// HTTP 级别的探针：发送 HEAD 请求，根据响应判断登录态
///
/// 设计要点：
/// - 使用 `redirect::Policy::none()` 阻止自动跟随重定向（需要手动检查 Location header）
/// - User-Agent 使用从 WKWebView 捕获的真实 UA
/// - CSRF token 从 AuthProfile 中获取
/// - 超时 2s，避免阻塞启动流程
///
/// 局限性（已知）：
/// - reqwest 使用 rustls/OpenSSL 的 TLS 栈，其 JA4 指纹与 WKWebView 完全不同
/// - 对于 TLS 指纹严格的网站（如 Cloudflare），HTTP probe 会被拦截
/// - 解决方案：见 4.6 TLS 指纹对抗
pub async fn http_probe(
    website: &str,
    cookies: &[CookieEntry],
    user_agent: &str,
    csrf_token: Option<&CsrfTokenEntry>,
) -> ProbeResult {
    let client = match Client::builder()
        .redirect(redirect::Policy::none())
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(e) => return ProbeResult::NetworkError(format!("build client: {e}")),
    };

    let mut req = client.head(website);

    // Cookie header
    if !cookies.is_empty() {
        let cookie_str = cookies.iter()
            .map(|c| format!("{}={}", c.name, c.value))
            .collect::<Vec<_>>()
            .join("; ");
        req = req.header("Cookie", cookie_str);
    }

    // User-Agent: 使用与 WebView 相同的 UA
    req = req.header("User-Agent", user_agent);

    // CSRF token (如果检测到)
    if let Some(csrf) = csrf_token {
        req = req.header(&csrf.header_name, &csrf.token_value);
    }

    // 额外 headers 用于检测 anti-bot
    req = req
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7");

    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            // 网络错误
            if e.is_timeout() {
                return ProbeResult::NetworkError("timeout".into());
            }
            return ProbeResult::NetworkError(format!("{e}"));
        }
    };

    let status = resp.status();
    let headers = resp.headers().clone();

    // Anti-bot 检测
    if status == 403 || status == 503 {
        // 检查是否触发了 Cloudflare
        if let Some(server) = headers.get("server") {
            if server.to_str().unwrap_or("").contains("cloudflare") {
                return ProbeResult::AntiBotBlocked;
            }
        }
        // 读取少量 body 检查 challenge
        if let Ok(body) = resp.text().await {
            if body.len() < 2000 && (body.contains("cf-challenge")
                || body.contains("_cf_chl_opt")
                || body.contains("g-recaptcha"))
            {
                return ProbeResult::AntiBotBlocked;
            }
        }
    }

    // 判断登录态
    if status.is_success() {
        ProbeResult::Ready
    } else if status.is_redirection() {
        if let Some(location) = headers.get("location") {
            let loc = location.to_str().unwrap_or("");
            if is_login_page(loc) {
                ProbeResult::LoginRequired
            } else if is_sso_page(loc) {
                ProbeResult::SsoChallenge
            } else {
                ProbeResult::Uncertain
            }
        } else {
            ProbeResult::Uncertain
        }
    } else if status == 401 {
        ProbeResult::LoginRequired
    } else {
        ProbeResult::Uncertain
    }
}

fn is_login_page(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("/login")
        || lower.contains("/signin")
        || lower.contains("/sign-in")
        || lower.contains("/auth")
        || lower.contains("?returnurl=")
        || lower.contains("?redirect=")
}

fn is_sso_page(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("login.microsoft")
        || lower.contains("okta.com")
        || lower.contains("auth0.com")
        || lower.contains("/saml")
        || lower.contains("/oauth2/authorize")
}

// ═══════════════════════════════════════════════
// 4.6 TLS 指纹对抗（对抗 L3 Fingerprinting）
// ═══════════════════════════════════════════════

/// TLS 指纹问题的本质
///
/// reqwest（底层 rustls/OpenSSL）的 TLS 握手特征与 WKWebView 完全不同：
/// - JA3 指纹：ClientHello 中密码套件顺序、扩展列表、elliptic_curves、
///   ec_point_formats 的组合哈希
/// - JA4 指纹：JA3 的升级版，加入了 ALPN、SNI、HTTP/2 SETTINGS 帧特征
/// - HTTP/2 帧特征：浏览器和 HTTP 客户端的 SETTINGS 帧参数（initial_window_size、
///   max_concurrent_streams 等）顺序和值不同
///
/// 服务端（Cloudflare、Akamai、F5、AWS WAF 等）可以通过 JA4 指纹区分
/// "真正的 WKWebView" 和 "HTTP 客户端伪装成 WKWebView"。
/// Cookie header 正确但 TLS 指纹不匹配 → 服务端判定 session hijacking → 强制重新认证。
///
/// 对抗方案（按推荐优先级排序）：

/// 方案 A：rquest（推荐）
/// rquest 是 reqwest 的 fork，内置浏览器 TLS 指纹模拟：
/// https://github.com/penumbra-x/rquest
///
/// ```toml
/// [dependencies]
/// rquest = { version = "2", features = ["impersonate"] }
/// ```
///
/// 使用方式：
/// ```rust,ignore
/// use rquest::Client;
/// use rquest::impersonate::Impersonate;
///
/// let client = Client::builder()
///     .impersonate(Impersonate::Safari18_0)  // 模拟 Safari 18 (WKWebView)
///     .redirect(rquest::redirect::Policy::none())
///     .timeout(Duration::from_secs(2))
///     .build()?;
/// ```
///
/// rquest 支持的 Safari 指纹版本：
/// - Safari15_3 (macOS 12)
/// - Safari15_5 (macOS 12.4)
/// - Safari16_5 (macOS 13)
/// - Safari17_0 (macOS 14)
/// - Safari18_0 (macOS 15, 推荐)
///
/// 注意：rquest 使用 curl 的 TLS 后端（而非 rustls），需要系统安装 libcurl。
/// 打包时需处理动态链接依赖。

/// 方案 B：curl_cffi（fallback，需要 C FFI）
/// Rust 绑定 libcurl-impersonate，能精确模拟 Chrome/Safari/Firefox 的 TLS 指纹：
/// https://github.com/lwthiker/curl-impersonate
///
/// 优点：TLS 指纹最精确（直接用 curl 引擎）
/// 缺点：依赖 libcurl .dylib/.so/.dll 文件，打包复杂度高

/// 方案 C：降级策略（当前默认，零依赖）
/// 不使用 TLS 指纹对抗，HTTP probe 检测到 403/AntiBotBlocked 时自动降级为 WebView probe。
/// 适合大多数不需要 TLS 指纹对抗的网站（约 70%）。
/// 对需要对抗的网站，用户可手动将 Station 的探针策略设为 WebviewOnly。

/// 方案选择指南
///
/// 阶段 1（MVP）：使用方案 C（零依赖，自动降级）
/// 阶段 2（增强）：引入方案 A（rquest），作为可选 feature flag
/// 阶段 3（精调）：为每个 Station 记录 TLS 指纹对抗需求，自动选择方案
///
/// 检测逻辑：
/// 如果 HTTP probe 连续被 Cloudflare/Akamai/WAF 拦截 > 3 次：
///   → 如果启用了 rquest feature → 切换到 rquest impersonate 模式重试
///   → 如果未启用 → 自动降级为 WebviewOnly

/// HTTP probe 的 TLS 增强版本（feature-gated）
#[cfg(feature = "rquest")]
pub async fn http_probe_impersonated(
    website: &str,
    cookies: &[CookieEntry],
    user_agent: &str,
    csrf_token: Option<&CsrfTokenEntry>,
    impersonate_target: rquest::impersonate::Impersonate,
) -> ProbeResult {
    let client = match rquest::Client::builder()
        .impersonate(impersonate_target)
        .redirect(rquest::redirect::Policy::none())
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(e) => return ProbeResult::NetworkError(format!("rquest build: {e}")),
    };

    let mut req = client.head(website);
    // ... 其余逻辑同 http_probe
    // (省略以节省篇幅)
    ProbeResult::Ready
}
```

### 4.3 L2: WebView Probe（多源证据）

```rust
// src-tauri/src/api_billing/probe.rs 新增

const PROBE_LOAD_BUDGET_MS: u64 = 5_000;
const PROBE_POLL_BUDGET_MS: u64 = 8_000;
const PROBE_POLL_INTERVAL_MS: u64 = 500;

/// 多源证据的 WebView 探针
async fn webview_probe<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    website: &str,
    session: &AccountSession,
) -> ProbeResult {
    // 1. 创建隐藏 WebView
    let window = create_probe_webview(app, account_id, website).await;
    let window = match window {
        Ok(w) => w,
        Err(e) => return ProbeResult::NetworkError(format!("create webview: {e}")),
    };

    // 2. 等待首屏加载
    let load_deadline = Instant::now() + Duration::from_millis(PROBE_LOAD_BUDGET_MS);
    // ... (现有 probe 逻辑) ...

    // 3. 多源证据收集
    let evidence = collect_multi_source_evidence(&window).await;

    // 4. 加权判定
    judge_from_evidence(&evidence)
}

struct SessionEvidence {
    final_url: String,
    has_session_cookie: bool,
    title_contains_login: bool,
    has_logout_ui: bool,
    has_auth_ui: bool,
    url_contains_login: bool,
    localStorage_has_token: bool,
    fetch_401_detected: bool,
}

async fn collect_multi_source_evidence<R: Runtime>(
    window: &WebviewWindow<R>,
) -> SessionEvidence {
    let script = r#"
    (function() {
        const logoutSelectors = [
            'a[href*="logout"]', 'a[href*="signout"]',
            'button[data-testid="logout"]', '[aria-label*="logout"]'
        ];
        const authSelectors = [
            'input[type="password"]', 'button[type="submit"]',
            'form[action*="login"]', 'form[action*="signin"]'
        ];

        return JSON.stringify({
            url: window.location.href,
            hasSessionCookie: document.cookie.length > 0,
            titleContainsLogin: /login|sign ?in|log ?in|登录|登入/i.test(document.title),
            hasLogoutUI: logoutSelectors.some(s => !!document.querySelector(s)),
            hasAuthUI: authSelectors.some(s => !!document.querySelector(s)),
            urlContainsLogin: /login|signin|auth/i.test(window.location.href),
            localStorageHasToken: Object.keys(localStorage).some(
                k => /token|auth|session/i.test(k)
            ),
        });
    })()
    "#;

    let raw = evaluate_and_decode(window, script).await.unwrap_or_default();
    serde_json::from_str(&raw).unwrap_or_default()
}

fn judge_from_evidence(e: &SessionEvidence) -> ProbeResult {
    let mut score = 0i32;

    // 正向证据（表明已登录）
    if e.has_logout_ui { score += 3; }
    if e.has_session_cookie { score += 2; }
    if !e.url_contains_login { score += 2; }
    if e.localStorage_has_token { score += 1; }
    if !e.title_contains_login { score += 1; }

    // 负向证据（表明未登录）
    if e.has_auth_ui && !e.has_logout_ui { score -= 3; }
    if e.url_contains_login { score -= 2; }
    if e.title_contains_login { score -= 2; }
    if !e.has_session_cookie { score -= 1; }

    if score >= 4 {
        ProbeResult::Ready
    } else if score <= -2 {
        ProbeResult::LoginRequired
    } else if !e.has_session_cookie && e.url_contains_login {
        ProbeResult::LoginRequired
    } else {
        ProbeResult::Expired
    }
}
```

### 4.4 L3: Hybrid Probe（SSO 场景）

```rust
// src-tauri/src/api_billing/probe.rs 新增

/// SSO 场景的混合探针：跟踪重定向链后检查着陆页
async fn hybrid_probe<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    website: &str,
    session: &AccountSession,
) -> ProbeResult {
    // Phase 1: 创建 WebView 并导航
    let window = match create_probe_webview(app, account_id, website).await {
        Ok(w) => w,
        Err(e) => return ProbeResult::NetworkError(format!("create webview: {e}")),
    };

    // Phase 2: 跟踪重定向链
    let redirect_chain = track_redirect_chain(&window).await;

    // Phase 3: 检查着陆页
    if let Some(final_url) = redirect_chain.last() {
        if is_login_page(final_url) {
            return ProbeResult::LoginRequired;
        }
        if is_sso_page(final_url) {
            // 仍在 SSO 流程中
            return ProbeResult::SsoChallenge;
        }
    }

    // Phase 4: 着陆页 DOM 检查
    let evidence = collect_multi_source_evidence(&window).await;
    judge_from_evidence(&evidence)
}

async fn track_redirect_chain<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Vec<String> {
    let script = r#"
    (function() { return window.location.href; })()
    "#;
    let url = evaluate_and_decode(window, script).await.unwrap_or_default();
    vec![url]
}
```

### 4.5 自适应降级

```rust
// src-tauri/src/api_billing/probe.rs 新增

const DEGRADE_THRESHOLD: u32 = 3;

/// HTTP probe 连续失败后的自动降级
pub async fn adaptive_degrade<R: Runtime>(
    app: &AppHandle<R>,
    station_id: &str,
) -> ApiBillingResult<()> {
    let state = app.state::<ApiBillingState>();

    storage::with_state_mut(app, &state, |snapshot| {
        let station = snapshot.stations.iter_mut()
            .find(|s| s.id == station_id)
            .ok_or_else(|| ApiBillingError::not_found(format!("station {station_id}")))?;

        station.probe_failure_count += 1;

        if station.probe_failure_count >= DEGRADE_THRESHOLD {
            if let Some(ref mut profile) = station.auth_profile {
                profile.probe_strategy = ProbeStrategy::WebviewOnly;
            }
            // 可以 emit 事件通知前端
        }

        Ok(())
    })?;

    Ok(())
}
```

---

## 5. 多账号互斥引擎

```rust
// src-tauri/src/api_billing/exclusivity.rs (新文件)

use tauri::{AppHandle, Runtime, WebviewWindow};

use super::types::*;
use super::state::ApiBillingState;
use super::storage;

/// 在执行新登录前处理互斥逻辑
pub async fn enforce_exclusivity_before_login<R: Runtime>(
    app: &AppHandle<R>,
    station: &RelayStation,
    new_account_id: &str,
) -> ApiBillingResult<()> {
    match station.exclusivity_mode {
        ExclusivityMode::Coexisting => {
            // 无限制
            Ok(())
        }
        ExclusivityMode::Exclusive => {
            logout_conflicting_accounts(app, station, new_account_id).await
        }
        ExclusivityMode::Rotating => {
            deactivate_active_account(app, station, new_account_id).await
        }
    }
}

/// Exclusive 模式：登出当前活跃的其它账号
async fn logout_conflicting_accounts<R: Runtime>(
    app: &AppHandle<R>,
    station: &RelayStation,
    exclude_account_id: &str,
) -> ApiBillingResult<()> {
    let state = app.state::<ApiBillingState>();
    let snapshot = state.read_snapshot();

    let conflicting: Vec<StationAccount> = snapshot.accounts.iter()
        .filter(|a| a.station_id == station.id
                 && a.id != exclude_account_id
                 && a.status == AccountSessionStatus::Ready)
        .cloned()
        .collect();

    for account in conflicting {
        // 1. 创建隐藏 WebView 并注入 session
        if let Some(ref session_blob) = account.session {
            let key = state.master_key()?;
            let raw = crypto::decrypt(&key, session_blob)?;
            let session: AccountSession = serde_json::from_str(&raw)
                .map_err(|e| ApiBillingError::store_fail(format!("deserialize: {e}")))?;

            // 2. 导航到登出 URL
            if let Ok(window) = create_probe_webview(app, &account.id, &station.website).await {
                // 3. 执行登出
                if logout_via_webview(&window, &station.website).await.is_ok() {
                    // 4. 清除 session
                    storage::with_state_mut(app, &state, |snapshot| {
                        if let Some(acc) = snapshot.accounts.iter_mut()
                            .find(|a| a.id == account.id)
                        {
                            acc.status = AccountSessionStatus::LoginRequired;
                            acc.session = None;
                        }
                        Ok(())
                    })?;
                }
            }
        }
    }

    Ok(())
}

/// 尝试通过 WebView 执行登出
async fn logout_via_webview<R: Runtime>(
    window: &WebviewWindow<R>,
    website: &str,
) -> ApiBillingResult<()> {
    // 策略 1: 导航到 /logout
    let logout_url = format!("{}/logout", website.trim_end_matches('/'));
    window.navigate(logout_url.parse().map_err(|_|
        ApiBillingError::invalid_input("logout url")
    )?)?;

    // 等待页面加载
    tokio::time::sleep(Duration::from_secs(2)).await;

    // 策略 2: 尝试通过 JS 点击登出按钮
    let script = r#"
        (function() {
            const btn = document.querySelector(
                'a[href*="logout"], button[data-testid="logout"], ' +
                '[aria-label*="logout"], [aria-label*="sign out"]'
            );
            if (btn) { btn.click(); return 'clicked'; }
            return 'no_button';
        })()
    "#;
    let _ = evaluate_and_decode(window, script).await;

    tokio::time::sleep(Duration::from_secs(1)).await;
    Ok(())
}

/// Rotating 模式：取消当前活跃账号的激活状态
async fn deactivate_active_account<R: Runtime>(
    app: &AppHandle<R>,
    station: &RelayStation,
    new_account_id: &str,
) -> ApiBillingResult<()> {
    let state = app.state::<ApiBillingState>();

    storage::with_state_mut(app, &state, |snapshot| {
        for account in snapshot.accounts.iter_mut() {
            if account.station_id == station.id
                && account.id != new_account_id
                && account.status == AccountSessionStatus::Ready
            {
                account.status = AccountSessionStatus::Inactive;
            }
        }
        Ok(())
    })?;

    Ok(())
}
```

---

## 6. API 契约

### 6.1 新增 Tauri Command

```rust
// src-tauri/src/api_billing/commands.rs 新增

// === Session 相关 ===
#[tauri::command]
pub async fn capture_account_session<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    account_id: String,
) -> ApiBillingResult<AccountSessionStatus> {
    // 从登录窗口捕获 session 并存储
}

#[tauri::command]
pub async fn restore_account_session<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    account_id: String,
) -> ApiBillingResult<AccountSessionStatus> {
    // 从存储恢复 session 并做 probe
}

#[tauri::command]
pub async fn clear_account_session<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    account_id: String,
) -> ApiBillingResult<()> {
    // 清除账号的 session 存储
}

// === AuthProfile 相关 ===
#[tauri::command]
pub async fn detect_station_auth_profile<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    station_id: String,
) -> ApiBillingResult<AuthProfile> {
    // 对指定的 Station 执行 AuthProfile 检测
}

#[tauri::command]
pub fn get_station_auth_profile(
    state: State<'_, ApiBillingState>,
    station_id: String,
) -> ApiBillingResult<Option<AuthProfile>> {
    // 返回已存储的 AuthProfile
}

// === 互斥相关 ===
#[tauri::command]
pub async fn set_exclusivity_mode<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    station_id: String,
    mode: ExclusivityMode,
) -> ApiBillingResult<RelayStation> {
    // 设置互斥模式
}

#[tauri::command]
pub async fn switch_active_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    station_id: String,
    account_id: String,
) -> ApiBillingResult<StationAccount> {
    // Rotating 模式下切换活跃账号
}

// === 探针策略 ===
#[tauri::command]
pub async fn set_probe_strategy<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    station_id: String,
    strategy: ProbeStrategy,
) -> ApiBillingResult<RelayStation> {
    // 手动设置探针策略(覆盖自动检测)
}

#[tauri::command]
pub async fn reset_probe_strategy<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    station_id: String,
) -> ApiBillingResult<RelayStation> {
    // 重置为自动检测
}
```

### 6.2 前端 API 适配

```typescript
// src/features/api-billing/api.ts 新增

// === Session ===
export function captureAccountSession(accountId: string): Promise<AccountSessionStatus> {
  return invokeTauriCommand("capture_account_session", { accountId });
}

export function restoreAccountSession(accountId: string): Promise<AccountSessionStatus> {
  return invokeTauriCommand("restore_account_session", { accountId });
}

export function clearAccountSession(accountId: string): Promise<void> {
  return invokeTauriCommand("clear_account_session", { accountId });
}

// === AuthProfile ===
export function detectStationAuthProfile(stationId: string): Promise<AuthProfile> {
  return invokeTauriCommand("detect_station_auth_profile", { stationId });
}

export function getStationAuthProfile(stationId: string): Promise<AuthProfile | null> {
  return invokeTauriCommand("get_station_auth_profile", { stationId });
}

// === Exclusivity ===
export function setExclusivityMode(
  stationId: string, mode: ExclusivityMode
): Promise<RelayStation> {
  return invokeTauriCommand("set_exclusivity_mode", { stationId, mode });
}

export function switchActiveAccount(
  stationId: string, accountId: string
): Promise<StationAccount> {
  return invokeTauriCommand("switch_active_account", { stationId, accountId });
}

// === Probe Strategy ===
export function setProbeStrategy(
  stationId: string, strategy: ProbeStrategy
): Promise<RelayStation> {
  return invokeTauriCommand("set_probe_strategy", { stationId, strategy });
}

export function resetProbeStrategy(stationId: string): Promise<RelayStation> {
  return invokeTauriCommand("reset_probe_strategy", { stationId });
}
```

---

## 7. 存储与加密

### 7.1 Schema 升级 (v2 → v3)

```rust
// src-tauri/src/api_billing/storage.rs 修改

const KEY_SCHEMA: &str = "schema_version";
const CURRENT_SCHEMA: u32 = 3;  // 升级到 v3
const KEY_SESSIONS: &str = "sessions";

// 新增: 独立的 session 存储键
// relay-store.json 结构:
// {
//   "schema_version": 3,
//   "stations": [...],
//   "accounts": [...],
//   "secrets": { "account_id": EncryptedBlob },
//   "sessions": { "account_id": EncryptedBlob },  // 新增
//   "auth_profiles": { "station_id": AuthProfile } // 新增
// }

pub fn save_session(
    app: &AppHandle<impl Runtime>,
    account_id: &str,
    blob: &EncryptedBlob,
) -> ApiBillingResult<()> {
    let store = app.store(STORE_FILE)
        .map_err(|e| ApiBillingError::store_fail(format!("open store: {e}")))?;

    let mut sessions: HashMap<String, EncryptedBlob> = store
        .get(KEY_SESSIONS)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    sessions.insert(account_id.to_string(), blob.clone());
    store.set(KEY_SESSIONS, serde_json::json!(sessions));
    store.save()
        .map_err(|e| ApiBillingError::store_fail(format!("save sessions: {e}")))?;
    Ok(())
}

pub fn flush_to_disk(app: &AppHandle<impl Runtime>) -> ApiBillingResult<()> {
    let store = app.store(STORE_FILE)
        .map_err(|e| ApiBillingError::store_fail(format!("open store: {e}")))?;
    store.save()
        .map_err(|e| ApiBillingError::store_fail(format!("flush store: {e}")))?;
    Ok(())
}

// 迁移: schema v2 → v3
fn migrate_v2_to_v3(app: &AppHandle<impl Runtime>, store: &Store) -> ApiBillingResult<()> {
    // v3 仅新增 sessions 和 auth_profiles 键
    // 无需数据转换，只需更新 schema_version
    store.set(KEY_SCHEMA, serde_json::json!(CURRENT_SCHEMA));
    store.save()
        .map_err(|e| ApiBillingError::store_fail(format!("migrate v2→v3: {e}")))?;
    Ok(())
}
```

### 7.2 加密体系定义 (v1.3 新增)

```rust
// WARNING (v1.3 修正 R04): EncryptedBlob 结构体必须明确定义。
// AES-256-GCM 要求:
// - 12-byte nonce（每次加密由 OsRng 生成，必须存储）
// - 认证 tag 自动由 aes-gcm crate 追加到 ciphertext
// - version 字段支持未来算法迁移

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedBlob {
    pub version: u8,          // 1 = AES-256-GCM
    pub nonce: Vec<u8>,       // 12 bytes
    pub ciphertext: Vec<u8>,  // plaintext + 16-byte GCM tag
}

/// master_key 生成
/// WARNING (v1.3 修正 R10): 必须使用 CSPRNG (OsRng)，禁止 rand::random()
pub fn get_or_create_master_key() -> ApiBillingResult<[u8; 32]> {
    use ring::rand::{SecureRandom, SystemRandom};
    let rng = SystemRandom::new();
    let mut key = [0u8; 32];
    rng.fill(&mut key)
        .map_err(|_| ApiBillingError::store_fail("key generation failed"))?;
    // WARNING (v1.3 修正 R09): macOS keychain 集成待实现
    // 应使用 security-framework crate + kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    Ok(key)
}

/// 加密流程:
/// 1. OsRng 生成 12-byte nonce
/// 2. AccountSession -> serde_json::to_string
/// 3. AES-256-GCM encrypt (nonce, plaintext) -> ciphertext+tag
/// 4. 封包为 EncryptedBlob { version: 1, nonce, ciphertext }
pub fn encrypt(key: &[u8; 32], plaintext: &str) -> ApiBillingResult<EncryptedBlob> {
    // 使用 ring::aead 或 aes-gcm crate
    // nonce 由 OsRng::fill() 生成
    // tag 由 AES-256-GCM 自动追加到 ciphertext
    todo!("v1.3: EncryptedBlob 定义完成,加密实现留作 Phase 1")
}

pub fn decrypt(key: &[u8; 32], blob: &EncryptedBlob) -> ApiBillingResult<String> {
    // GCM 解密自动验证认证 tag（tag 在 ciphertext 末尾 16 bytes）
    // 失败 = tampered ciphertext -> ApiBillingError::crypto_fail
    todo!("v1.3: EncryptedBlob 定义完成,解密实现留作 Phase 1")
}
```

### 7.3 加密不变性

Session 加密使用与密码加密相同的框架：

```rust
// 加密流程:
// AccountSession -> serde_json::to_string -> AES-256-GCM encrypt -> EncryptedBlob
//
// 解密流程:
// EncryptedBlob -> AES-256-GCM decrypt -> serde_json::from_str -> AccountSession
//
// master_key 存储在系统 keychain（与现有密码加密共用）
//
// WARNING (v1.3 修正 R11): 当前使用静态 key，无前向安全性。
// Phase 2 计划引入 per-session key (HKDF-SHA256 从 master_key + account_id 派生)
```

---

## 8. 生命周期集成

### 8.1 完整事件流

```
App 启动
  ├── setup → storage::init_state → 加载所有数据
  ├── setup → api_billing::init_state 完成
  └── 后台任务 → restore_sessions_on_startup → 恢复所有 Persistent session

用户创建 Station
  └── create_station command → 存入 relay-store.json

用户创建 Persistent Account  
  └── create_account command → 存入 relay-store.json

用户登录 (WebView)
  ├── open_login_window → 创建 WebView
  ├── 用户输入凭据 → 登录完成
  ├── on_navigation 回调 → 检测是否到达目标页面
  ├── detect_auth_profile → 分析认证机制 → 更新 Station AuthProfile
  ├── capture_session_after_login → 提取 cookies + localStorage + CSRF
  ├── 加密 session → 存入 relay-store.json sessions 键
  └── 更新 account.status = Ready

用户快速登录 (Ephemeral)
  ├── 粘贴 URL + 用户名 → 创建 Ephemeral Account (仅内存)
  ├── open_login_window → 创建 WebView
  └── 关闭窗口 → 清理 Ephemeral Account

用户手动刷新
  ├── 前端调用 refresh_account
  ├── 读取 AuthProfile → 选择 probe_strategy
  ├── HTTP probe / WebView probe
  └── 更新 account.status

App 退出
  ├── RunEvent::ExitRequested
  ├── persist_all_sessions_on_exit → 遍历所有 Ready 的 Persistent Account
  ├── 从仍存在的登录窗口提取最新 cookies
  ├── 加密并写入 relay-store.json
  ├── cleanup_ephemeral_accounts → 清理所有 Ephemeral
  └── flush_to_disk → 强制持久化
```

### 8.2 错误恢复

```rust
// 异常场景处理

/// Session 解密失败：旧版本加密算法不兼容
fn handle_decrypt_failure(account_id: &str) {
    // 清除无效 session，下次需要重新登录
    clear_session_for_account(state, account_id);
    update_account_status(state, account_id, AccountSessionStatus::LoginRequired);
}

/// HTTP probe 超时：网络问题
fn handle_http_timeout(account_id: &str) {
    // 保留当前状态，下次 heartbeat 重试
    // 不标记为 LoginRequired（避免误判）
}

/// WebView probe 失败：窗口创建失败
fn handle_webview_creation_failure(account_id: &str) {
    // 标记 FetchFailed，通知用户
    update_account_status(state, account_id, AccountSessionStatus::FetchFailed);
}
```

---

## 附录 A: 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src-tauri/src/api_billing/types.rs` | 修改 | 新增 AuthProfile、CookieEntry、AccountSession 等类型；StationAccount/RelayStation 新增字段 |
| `src-tauri/src/api_billing/session.rs` | 新建 | Session 捕获、恢复、持久化引擎 |
| `src-tauri/src/api_billing/detection.rs` | 修改 | JS 注入检测脚本、AuthProfile 分类逻辑 |
| `src-tauri/src/api_billing/probe.rs` | 修改 | HTTP/WebView/Hybrid 三层探针、自适应降级、TLS 指纹对抗 |
| `src-tauri/src/api_billing/exclusivity.rs` | 新建 | 多账号互斥引擎 |
| `src-tauri/src/api_billing/commands.rs` | 修改 | 新增 10+ Tauri command |
| `src-tauri/src/api_billing/storage.rs` | 修改 | Schema v3、session/auth_profile 存储、flush |
| `src-tauri/src/api_billing/mod.rs` | 修改 | 注册新模块和 command |
| `src-tauri/src/lib.rs` | 修改 | RunEvent::ExitRequested 中集成 session 持久化 |
| `src/features/api-billing/api.ts` | 修改 | 新增前端 API 适配函数 |
| `src/features/api-billing/page.tsx` | 修改 | 快速登录 UI、表单简化、AuthProfile 详情面板 |
| `Cargo.toml` | 修改 | 新增 reqwest(/rquest) 依赖 |

## 附录 B: 关键依赖

| 依赖 | 版本 | 用途 | 备注 |
|------|------|------|------|
| `rquest` | `2.x` | HTTP 客户端 + TLS 指纹模拟（推荐） | fork of reqwest + impersonate；需 libcurl |
| `reqwest` | `0.12` | HTTP 客户端（fallback） | 如果不用 rquest；TLS 指纹兼容性差 |
| `serde_json` | 存在 | session 序列化/反序列化 | 现有依赖 |
| `chrono` | 存在 | 时间戳比较、cookie 过期判断 | 现有依赖 |
| `tokio` | 存在 | 异步探针和并发控制 | 现有依赖 |
| `ring / aes-gcm` | 存在 | session 加密（crypto.rs） | 现有依赖 |
| `tauri-plugin-store` | 存在 | relay-store.json 持久化 | 现有依赖 |

## 附录 C: 参考实现与最新技术

### C.1 Playwright storageState — Session 捕获的黄金标准

Playwright 是事实上的浏览器自动化标准。其 `storageState` API 是目前 session 捕获的黄金标准实现，作为我们设计的参照基准：

```javascript
// Playwright: 一行代码获取完整 session 状态
const storageState = await context.storageState();
// 返回: { cookies: [...], origins: [{ origin, localStorage }] }

// 恢复 session 到新 context
const context = await browser.newContext({ storageState: 'state.json' });
```

Playwright 的 `storageState` 捕获内容与我们设计对照：

| Playwright | 我们的设计 | 覆盖？ |
|------------|-----------|--------|
| `cookies` (含 httpOnly) | `WebviewWindow::cookies()` → `CookieEntry[]` | ✅ |
| `origins[].localStorage` | `capture_local_storage()` → `EncryptedBlob` | ✅ |
| sessionStorage | `capture_session_storage()` → `EncryptedBlob` | ✅ |
| IndexedDB | 未实现（Playwright 也未默认支持） | ⚠ Phase 2 |
| Service Worker cache | 未实现 | ❌ 未来探索 |

**结论**：我们的设计在 cookie + localStorage + sessionStorage 维度与 Playwright 对齐。
IndexedDB 快照需要在 Phase 2 补充（注入 IndexedDB exporter JS 库）。

### C.2 Device Bound Session Credentials (DBSC) — 重大更新

> **2026 年 4 月**: Chrome 146 在 Windows 上正式 GA 了 DBSC。<br>
> **影响**：已启用 DBSC 的网站，其 session cookie 与设备 TPM 硬件密钥绑定。
> 被窃取的 cookie 几分钟后即失效（因为缺少设备私钥签名）。

**DBSC 工作机制**：
1. 服务端在 `Set-Cookie` 响应头中添加 `Sec-Session-Challenge` header
2. 浏览器用 TPM 私钥签名 challenge → 返回 `Sec-Session-Response`
3. 后续请求携带签名 proof，服务端用注册时存储的公钥验证
4. 如果 proof 缺失或无效，即使 cookie 正确也拒绝请求

**对 Session Manager 的影响**：

| DBSC 状态 | 网站比例 | Session 提取 | Session 迁移 | HTTP Probe | 建议策略 |
|-----------|---------|-------------|-------------|------------|----------|
| 未启用 DBSC | ~95%+ | ✅ cookies() | ✅ 跨 WebView | ✅ reqwest | HttpFirst |
| 已启用 DBSC (Chrome on Windows) | ~1-3% | ❌ 私钥不可导出 | ❌ 同一 data store | ❌ 无 TPM 访问 | WebviewOnly |
| 计划启用 DBSC | 增长中 | — | — | — | 检测并通知用户 |

**AuthProfile 检测增强**：
```rust
// 检测网站是否启用了 DBSC
fn detect_dbsc(headers: &HeaderMap) -> bool {
    // 检查 Set-Cookie 响应头中是否包含 Sec-Session-Challenge
    headers.get_all("set-cookie").iter().any(|v| {
        v.to_str().unwrap_or("")
            .to_lowercase()
            .contains("sec-session-challenge")
    })
}
```

如果首次登录时检测到 DBSC，AuthProfile 自动标记为 `WebviewOnly` 并通知用户：
"此网站使用了设备绑定会话凭据 (DBSC)，session 无法跨 WebView 迁移。"

参考：
- W3C 规范: <https://w3c.github.io/webappsec-dbsc>
- Chrome 146 发布说明: <https://developer.chrome.com/blog/dbsc>

### C.3 TLS 指纹对抗工具链

| 工具 | 语言 | 模拟能力 | 适合我们？ |
|------|------|----------|-----------|
| `curl-impersonate` | C | Chrome/Safari/Firefox 完整 TLS 指纹 | ⚠ 需 C FFI 绑定，打包复杂 |
| `rquest` | Rust | Chrome/Safari/OkHttp TLS + HTTP/2 | ✅ 首选，原生 Rust |
| `python-reqwest-impersonate` | Python | 同上（Python bindings） | ❌ 跨语言 |
| `curl_cffi` | Python/Rust | 同上 | ⚠ Rust binding 不成熟 |
| `reqwest` (default) | Rust | OpenSSL/rustls TLS（无模拟） | ✅ 零依赖 fallback |

**推荐路线**：
- MVP: 使用 `reqwest` + 自动降级（零额外依赖）
- v1.1: 引入 `rquest` 作为 optional feature，开启后 Safari 指纹模拟
- 需要 TLS 指纹对抗的 Station，自动切换到 rquest impersonate 模式

### C.4 WKWebView Cookie 持久化最佳实践

基于 Apple Developer Forums 和 WebKit Bug Tracker 的最新信息：

1. **`WKWebsiteDataStore.default()` 是持久化的** — Apple 文档确认
2. **但 flush 时机不确定** — `setCookie` 的 completionHandler 回调 ≠ cookie 已写入磁盘（Bug #213636）
3. **`dataStoreIdentifier` 是必需的** — 用于确保多个 WebView 实例共享同一个 cookie store
4. **进程终止时可能丢失未 flush 的数据** — 需要在 `ExitRequested` 中显式提取

我们的应对（已在设计中实现）：
- 不依赖 WebView 自身的 cookie 持久化
- 登录完成后立即通过 `cookies()` API 提取并加密存储
- 退出前通过 `ExitRequested` hook 做最后一次提取 + flush
- 启动时从加密存储恢复并注入到 WebView

这比 Playwright 的 `storageState` 方案更可靠（因为不依赖 WebView 自身的持久化保证）。

### C.5 遗漏点补全（v1.2 复盘）

以下是在 v1.0-v1.1 基础上通过联网深度复盘发现的遗漏，已在该版本中全部补充。

#### 遗漏 1: CSP (Content Security Policy) 对 evaluateJavaScript 的影响

**问题**：我们的 AuthProfile 检测脚本和 session 捕获脚本依赖 `window.eval()` 等价 API
（Tauri 的 `WebviewWindow::eval()`）。但网站设置的 CSP 策略可能阻止 JS 执行。

**具体场景**：
- `script-src 'self'` — 阻止内联 eval（除非有 `'unsafe-eval'` 或 nonce/hash）
- `default-src 'none'` — 极端情况下所有资源都受限

**但是**：Tauri 的 `eval()` 走的是原生 WebView API 的 `evaluateJavaScript(_:completionHandler:)`
路径，它**绕过 CSP**——CSP 只约束网页内运行的脚本，不约束宿主应用注入的脚本。
这是 WKWebView 的已知行为。

**结论**：CSP 不影响我们的 `evaluateJavaScript` 注入。但需要注意：
- 如果通过注入的脚本再创建 `<script>` 元素 
  → 该 script 元素受 CSP 约束
- 直接通过 Tauri 原生 API exec JS → 不受 CSP 约束 ✅

#### 遗漏 2: CHIPS (Partitioned Cookies / Cookies Having Independent Partitioned State)

**问题**：Chrome 从 2024 年开始逐步淘汰第三方 cookie，引入 `Partitioned` 属性。
带有 `Partitioned` 的 cookie 被隔离在设置它的站点分区中，跨站时不发送。

**影响**：
- `Set-Cookie: __Host-session=xxx; Secure; Path=/; SameSite=None; Partitioned`
- 这种 cookie 在跨站 HTTP probe 中不会被 `reqwest` 发送
- 必须在相同 origin 的上下文中才能使用

**应对**：
```rust
// CookieEntry 新增字段
pub struct CookieEntry {
    // ... 现有字段
    pub partitioned: bool,  // 新增：是否为 Partitioned cookie
    pub same_site: Option<String>,  // 已有
}

// 在 HTTP probe 中：
// Partitioned cookie 只在 same-origin 请求中附加
fn filter_probe_cookies(cookies: &[CookieEntry], target_url: &str) -> Vec<&CookieEntry> {
    cookies.iter().filter(|c| {
        if c.partitioned {
            // 检查 origin 是否匹配
            let domain = url::Url::parse(target_url)
                .map(|u| u.host_str().unwrap_or("").to_string())
                .unwrap_or_default();
            c.domain == domain
        } else {
            true
        }
    }).collect()
}
```

#### 遗漏 3: iCloud Private Relay 导致的 IP 变化

**问题**：macOS 用户启用 iCloud Private Relay 后，Safari/WKWebView 的出站流量
经过 Apple 中继服务器，IP 地址不同于系统的真实 IP。

**影响**：
- HTTP probe（reqwest）使用系统真实 IP
- WebView 登录时使用中继 IP
- 服务端可能将这视为 "session hijacking"（IP 突然变化）

**检测**：
```rust
// Rust 侧检测 Private Relay 是否启用
#[cfg(target_os = "macos")]
fn detect_private_relay() -> bool {
    // 检查 /Library/Preferences/com.apple.networkextension.plist
    // 中的 PrivateRelay 状态
    // 或者检查 Safari 的 WKWebView 是否使用了中继 IP
    false // 平台相关实现
}
```

**应对**：如果检测到 Private Relay 启用，降低 HTTP probe 的优先级，更倾向 WebView probe。

#### 遗漏 4: IndexedDB 导出方案

**问题**：原技术文档提到需要"IndexedDB exporter JS 库"但未指定。

**方案**：使用开源 `idb-backup-and-restore.js`（GitHub Gist by loilo），
这是一个轻量级纯 JS 方案，无需额外依赖：

```javascript
// 注入到 WebView 中导出所有 IndexedDB 数据
async function exportIndexedDB() {
    const databases = await indexedDB.databases();
    const result = {};
    for (const dbInfo of databases) {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(dbInfo.name, dbInfo.version);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const stores = {};
        for (const storeName of Array.from(db.objectStoreNames)) {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const items = await new Promise((resolve) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
            });
            stores[storeName] = items;
        }
        result[dbInfo.name] = stores;
        db.close();
    }
    return JSON.stringify(result);
}
```

**注意**：IndexedDB 可能非常大（数百 MB）。截断策略：
- 单条记录 > 1MB → 仅存储 key + 类型标记，不存储 value
- 总数据 > 50MB → 仅导出 database names + store names，不导出数据

#### 遗漏 5: HTTP/3 (QUIC) 0-RTT 重放攻击与 Session 安全

**问题**：HTTP/3 支持 0-RTT 握手，可以在 TLS 握手完成前发送 HTTP 请求。
但这带来了重放攻击风险——如果 cookie 被窃取，攻击者可以在 0-RTT 中重放请求。

**影响**：
- HTTP probe 可能意外触发 0-RTT 请求
- 某些服务端对 0-RTT 请求有特殊处理（如拒绝非幂等操作）

**应对**：
```rust
// reqwest 默认不支持 HTTP/3（需要 quiche/h3 feature）
// 如果未来支持，在 HEAD probe 中使用 0-RTT 是安全的（HEAD 是幂等的）
// POST/PUT 请求绝不使用 0-RTT
```

HTTP probe 只用 HEAD 方法 → 天然安全（幂等）。不需要额外处理。

#### 遗漏 6: localStorage Quota 和 Private Browsing Mode

**问题**：
- Safari Private Browsing 中 `localStorage.setItem()` 抛出 `QuotaExceededError`
- 普通模式下也有 5-10MB 的 quota 限制
- 我们的 `capture_local_storage()` 假设 localStorage 始终可用

**应对**：
```javascript
// 安全的 localStorage 读取
function safeGetLocalStorage() {
    try {
        const data = {};
        const len = localStorage.length;
        if (len === 0 && typeof localStorage.getItem !== 'function') {
            return { _error: 'localStorage_disabled' };
        }
        for (let i = 0; i < len; i++) {
            const key = localStorage.key(i);
            try {
                const value = localStorage.getItem(key);
                if (value && value.length > 1_000_000) {
                    data[key] = `[TRUNCATED: ${value.length} bytes]`;
                } else {
                    data[key] = value;
                }
            } catch {
                data[key] = '[READ_ERROR]';
            }
        }
        return data;
    } catch (e) {
        return { _error: `localStorage_unavailable: ${e.message}` };
    }
}
```

#### 遗漏 7: 网络变化检测与 Session 失效

**问题**：用户从 WiFi 切换到蜂窝数据/VPN/代理时，IP 地址变化可能导致
session 被服务端判定为劫持并失效。当前的启动恢复流程在切换网络后仍然
标记 session 为 Ready。

**应对**：
```rust
/// 在启动恢复中：比较上次捕获时的网络环境和当前网络环境
fn network_changed_since_capture(
    session: &AccountSession,
    current_network: &NetworkInfo,
) -> bool {
    // 如果 IP 地址的 ASN/BGP prefix 改变，session 可能已失效
    // 触发一次 probe 确认（而不是直接标记 LoginRequired）
    session.last_network_info != Some(current_network.clone())
}
```

恢复时如果检测到网络环境变化，强制触发一次 WebView probe（不依赖缓存的 session 状态）。

---

## 附录 D: 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-06-30 | 初版：数据模型、Session 引擎、AuthProfile、分层探针、互斥引擎、API 契约 |
| v1.1 | 2026-06-30 | 新增：DBSC GA 状态更新、TLS 指纹对抗（rquest/curl-impersonate）、Playwright storageState 参考、evaluateJavaScript 线程安全、WKWebView 持久化最佳实践 |
| v1.2 | 2026-06-30 | 深度复盘：补全 7 个遗漏点（CSP/eval 影响、CHIPS partitioned cookie、Private Relay、IndexedDB 导出方案、HTTP/3 0-RTT、localStorage quota、网络变化检测） |
| v1.3 | 2026-06-30 | 六路 Agent 攻防评审：修正 8 个 CRITICAL 编译阻断 + 10 个 HIGH 运行时风险 + 11 MEDIUM + 9 LOW。详见附录 E 勘误与修正清单 |

## 附录 E: 攻防评审勘误与修正 (v1.3)

以下修正基于六路独立 Agent 从 Tauri v2 API、WKWebView 行为、Rust 实现、安全加密、边界遗漏、数据模型六个攻击面对 v1.2 的交叉审查。

### E.1 CRITICAL 修正（已应用到文档主体）

| ID | 问题 | 修正 |
|----|------|------|
| R01 | `window.eval()` 是同步方法返回 `Result<()>`，非 async，不返回值 | §2.1 `evaluate_and_decode` 改为 `eval_with_callback` + oneshot 桥接 |
| R02 | `window.cookies(url)` 签名不存在 | §2.1 `extract_cookies` 改为 `window.cookies_for_url(parsed_url)` |
| R03 | `Cookie` 结构体字段全部私有，`expiration_date`/`same_site` 方法名错误 | 全部改为访问器方法：`c.name()`、`c.value()`、`c.domain()`、`c.path()`、`c.http_only()`、`c.secure()`、`c.same_site()`、`c.partitioned()`、`c.expires_datetime()` |
| R04 | `EncryptedBlob` 结构体完全未定义（nonce/tag/version 缺失） | §7 新增：`EncryptedBlob { version: u8, nonce: Vec<u8>, ciphertext: Vec<u8> }` |
| R05 | StationAccount/RelayStation 新增字段缺 `#[serde(default)]`，旧版 JSON 反序列化 crash | §1.1 所有新增字段加 `#[serde(default)]` |
| R06 | `AuthProfile` derive 缺少 `Default` | §1.1 derive 列表追加 `Default` |
| R07 | `CookieEntry` 构造遗漏 `partitioned` 字段 | §2.1 追加 `partitioned: c.partitioned().unwrap_or(false)` |
| R08 | `evaluate_and_decode` 私有函数被跨模块调用 | 改为 `pub(crate) async fn` |

### E.2 HIGH 修正（运行时风险）

| ID | 问题 | 状态 |
|----|------|------|
| R09 | macOS Keychain 集成未定义（crate 选型、API、entitlements） | ⚠ 留作 Todo：选用 `security-framework` crate；需补 keychain 读写实现 |
| R10 | master_key 生成随机源未知 | §7 新增：明确 `OsRng::fill_bytes()` + `OnceLock` 缓存 |
| R11 | 无前向安全性（静态 key 永不轮换） | ⚠ 留作 Phase 2：引入 per-session key (HKDF 派生) |
| R12 | 并发竞争（同一 account 双线程 refresh 无去重） | ⚠ 留作 Phase 2：per-account `refresh_in_progress` CAS 标记 |
| R13 | WebView 资源泄漏（无 RAII guard） | ⚠ 留作 Phase 1：`ProbeWebViewGuard` RAII + `Drop` close |
| R14 | 多 Station 并发恢复无限制（10+ WebView 同时创建） | ⚠ 留作 Phase 2：`Semaphore` 限流 + 渐进恢复 |
| R15 | 跨平台完全未定义（Linux/Windows WebView API） | ⚠ 留作 Phase 2：平台兼容性矩阵 + `#[cfg]` 骨架 |
| R16 | relay-store.json 损坏无容错 | ⚠ 留作 Phase 1：JSON 容错 + atomic write + .bak 恢复 |
| R17 | WKProcessPool 行为未覆盖 | ⚠ 留作 Phase 2：验证 Tauri v2 暴露方式 |
| R18 | UA 冻结未处理（fallback UA 残缺） | §2.1：修正 fallback UA 为完整 WKWebView 格式 |

### E.3 MEDIUM 修正（设计缺陷）

| ID | 问题 | 状态 |
|----|------|------|
| R19 | `data_store_identifier` 参数类型 `[u8; 16]`；cookie 注入循环为空 | §2.2 修正参数类型 |
| R20 | `window.navigate()` 依赖隐式 `From` 转换 | 显式 `.map_err()` |
| R21 | localStorage 超大值无截断 | 采用 safeGetLocalStorage（v1.2 已补充） |
| R22-R24 | 网络重试、TOCTOU、降级死循环 | 留作 Phase 2 |
| R25 | `ProbeResult` 缺 `rename_all = "camelCase"` | 已补 |
| R26 | Schema 迁移未检查版本号 | 留作 Phase 1 |
| R27 | Private Relay 检测方案不可靠 | 留作 Phase 2：改用 `nw_path_monitor` |
| R28 | Cookie value 内存不安全（可 swap to disk） | 留作 Phase 2：`Zeroizing<String>` |
| R29 | JS token preview 日志泄露 | 已标注 |

### E.4 跨 Agent 交叉验证统计

- 6 个 Agent 独立审查，产出 38 项发现
- **9 项**被 ≥2 个 Agent 独立确认 → 高置信度
- 总评：架构设计扎实，Tauri v2 API 正确性和加密实现细节是系统性短板
- 修复估时：Phase 0 (编译修复) 1-2 天 → Phase 1 (加密体系) 2-3 天 → Phase 2 (运行时健全性) 3-5 天 → Phase 3 (增强) 2-3 天 = **8-13 人天**


## 附录 F: 开源参考项目深度分析与技术借鉴 (v1.5)

> 分析日期: 2026-06-30 | 覆盖 7 个项目 | 联网搜索验证

### F.1 项目概览

| 项目 | Stars | 许可证 | 语言 | 形态 | 与 bench 相关度 |
|------|-------|--------|------|------|----------------|
| [Playwright](https://github.com/microsoft/playwright) | 70k+ | Apache 2.0 | TypeScript | 自动化框架 | ⭐⭐⭐⭐⭐ Session 捕获/恢复的黄金标准 |
| [Browserless](https://github.com/browserless/browserless) | 9k+ | Fair Source | Node.js | Docker 服务 | ⭐⭐⭐⭐ Persistent Session API 设计 |
| [Browser Use](https://github.com/browser-use/browser-use) | 40k+ | MIT | Python | Agent 框架 | ⭐⭐⭐⭐ Profile 生命周期管理 |
| [MultiZen Browser](https://github.com/multizenteam/multizen-browser) | ~500 | — | Electron | 桌面应用 | ⭐⭐⭐ 多 Profile 隔离 + 指纹管理 |
| [puppeteer-extra](https://github.com/berstend/puppeteer-extra) | 8k+ | MIT | TypeScript | Puppeteer 插件 | ⭐⭐⭐ Session 持久化插件 |
| [Tab Session Manager](https://github.com/sienori/Tab-Session-Manager) | 3k+ | — | JS | 浏览器扩展 | ⭐⭐ IndexedDB 存储方案 |
| [ArchiveBox](https://github.com/ArchiveBox/ArchiveBox) | 23k+ | MIT | Python | 归档工具 | ⭐⭐ Cookie 注入方案 |

### F.2 核心技术对比

```
                    bench          Playwright      Browserless     MultiZen        Browser Use
                    ─────          ──────────      ───────────     ────────        ───────────
WebView 引擎        WKWebView      Chromium/FF/WK  Chromium        Chromium        Chromium
Session 导出        cookies_for_   storageState()  REST API +      Chrome          storageState()
                    url + eval JS  (CDP API)       CDP WebSocket   profile 目录    (CDP)
localStorage 恢复   eval JS 注入   CDP DOMStorage  user-data-dir   Chrome profile  Playwright CDP
IndexedDB           计划中          CDP 遍历        Chrome profile  Chrome profile  无
多账号隔离          data_store_    browserContext  profiles(REST)  独立 Electron   profiles
                    identifier                                     实例
认证检测            AuthProfile    无              无              无              无
开发语言            Rust + TS      TypeScript      Node.js         Electron/JS     Python
```

**关键限制**: bench 使用 WKWebView，**无法使用 Chrome DevTools Protocol (CDP)**。Playwright/Browserless/puppeteer-extra 的核心实现依赖 CDP，因此这些库的**代码不能直接复用**，但**架构设计和数据模型可以借鉴**。

### F.3 可直接复用的库/工具

#### F.3.1 idb-backup-and-restore.js — IndexedDB 导出（✅ 可直接使用）

来源: GitHub Gist (MIT)  
https://gist.github.com/loilo/ed43739361ec718129a15ae5d531095b

纯前端 JS，不依赖任何 CDP API。直接注入到 WKWebView 的 `evaluateJavaScript`:

```javascript
async function dumpAllIndexedDB() {
  const databases = await indexedDB.databases();
  const result = {};
  for (const dbInfo of databases) {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbInfo.name, dbInfo.version);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const stores = {};
    for (const name of db.objectStoreNames) {
      const tx = db.transaction(name, 'readonly');
      const req = tx.objectStore(name).getAll();
      stores[name] = await new Promise(r => { req.onsuccess = () => r(req.result); });
    }
    result[dbInfo.name] = stores;
    db.close();
  }
  return JSON.stringify(result);
}
```

**集成方案**: 在 `capture_session_after_login()` 中增加:
```rust
// session.rs
let idb_raw = evaluate_js(window, "(" + IDB_DUMP_SCRIPT + ")()").await?;
session.indexeddb_snapshot = Some(crypto::encrypt(&key, &idb_raw)?);
```

**限制**: 大数据库（>50MB）需要截断策略。

#### F.3.2 Playwright storageState — 数据模型（📐 设计借鉴）

Playwright 的 `storageState()` 返回:
```typescript
{
  cookies: Cookie[],
  origins: [{ origin: string, localStorage: { name: string, value: string }[] }]
}
```

关键区别: localStorage 是 **per-origin** 结构，而非扁平的 JSON。

**当前 bench 模型**:
```rust
pub struct AccountSession {
    pub cookies: Vec<CookieEntry>,
    pub local_storage: Option<EncryptedBlob>,  // 扁平的整个 localStorage JSON
}
```

**建议改进 (v2.0)**:
```rust
pub struct AccountSession {
    pub cookies: Vec<CookieEntry>,
    pub origins: Vec<OriginStorage>,   // ← 改为 per-origin 结构
}

pub struct OriginStorage {
    pub origin: String,
    pub local_storage: Vec<StorageItem>,
    pub session_storage: Vec<StorageItem>,
}
```

**收益**: 恢复时能精确地 per-origin 注入，避免跨 origin 污染。当多个 iframe 或 OAuth 重定向涉及不同 origin 时更可靠。

#### F.3.3 Browserless Profile API — 命令设计（📐 API 设计借鉴）

Browserless 的会话生命周期 REST API:

```
POST   /profiles              → 创建持久化 profile
POST   /profiles/:id/session  → 启动会话（返回 CDP WebSocket endpoint）
GET    /profiles/:id          → 查询 profile 状态
DELETE /profiles/:id          → 删除 profile + 清理数据
```

**对应 bench 的 Tauri Command**:
```rust
// 已有（v1.3）
capture_account_session(account_id)  // ≈ POST /profiles/:id/session
restore_account_session(account_id)  // ≈ GET  /profiles/:id
clear_account_session(account_id)    // ≈ DELETE /profiles/:id

// 建议新增（v1.4）
get_session_status(account_id)       // ≈ 查询 session 健康状态
set_session_ttl(station_id, hours)   // ≈ 配置数据保留策略
cleanup_expired_sessions()           // ≈ 自动清理过期 profile
```

### F.4 技术借鉴清单

#### F.4.1 从 Playwright 借鉴: Session 数据模型

| Playwright | bench 现有 | bench 建议 |
|------------|-----------|-----------|
| `storageState()` 返回结构化对象 | `AccountSession` 结构体 | ✅ 已对齐 |
| `cookies[]` 含 httpOnly/secure/sameSite | `CookieEntry` 含 partitioned | ✅ 已对齐 |
| `origins[].localStorage[]` per-origin | 扁平 `EncryptedBlob` | ❌ **建议改为 per-origin** |
| `launchPersistentContext(userDataDir)` | `data_directory` + `data_store_identifier` | ✅ 已对齐 |
| `browserContext.storageState()` 手动调用 | `capture_account_session` 主动调用 | ✅ 已对齐 |

#### F.4.2 从 Browserless 借鉴: Session 生命周期

| Browserless | bench 现有 | bench 建议 |
|------------|-----------|-----------|
| 每次操作后自动保存 cookies/storage | 仅退出时保存 | ❌ **建议每次探针后增量保存** |
| Configurable data retention (最长 90 天) | 无 TTL | ❌ **建议加入 session_ttl_hours** |
| Profile 数据隔离 (user-data-dir) | data_directory 隔离 | ✅ 已对齐 |
| REST API 管理 profile 生命周期 | Tauri Command | ✅ 已对齐 |

#### F.4.3 从 Browser Use 借鉴: Profile 管理

| Browser Use | bench 现有 | bench 建议 |
|------------|-----------|-----------|
| `session.stop()` 显式保存 | `ExitRequested` hook | ✅ 已对齐 |
| `browser_profile="name"` 命名和复用 | `account_id` 标识 | ✅ 已对齐 |
| Profile TTL 过期自动清理 | 手动 delete | ❌ **建议加入自动清理** |

#### F.4.4 从 MultiZen 借鉴: 高级隔离

| MultiZen | bench 现状 | 优先级 |
|----------|-----------|--------|
| Per-profile 代理 (HTTP/SOCKS5) | 无 | 🔮 Phase 3 |
| Canvas/WebGL 指纹隔离 | 无 | 🔮 Phase 3 |
| Profile 跨设备导入/导出 | export/import relay data | ✅ 已实现 |

### F.5 不可直接复用的（但可借鉴思路）

| 特性 | 项目 | 不可复用的原因 | 替代方案 |
|------|------|---------------|---------|
| `launchPersistentContext` | Playwright | 依赖 Chromium，bench 用 WKWebView | bench: `data_directory` + `data_store_identifier` |
| CDP WebSocket 连接 | Browserless | 依赖 Chrome DevTools Protocol | bench: 原生 `evaluateJavaScript` |
| Stealth 反检测 | puppeteer-extra | Chrome 特化 JS 注入 | bench: AuthProfile 检测 + WebView probe fallback |
| Electron IPFS | MultiZen | Electron 特化 | bench: Tauri 原生方案 |

### F.6 即时改进建议（低成本高收益）

以下 3 项基于参考项目分析，改动成本低，可靠性提升显著：

#### 1. 增量保存（参考 Browserless 自动保存）

**当前**: session 仅在 `ExitRequested` 时保存，进程崩溃数据丢失。  
**改为**: 每次 `capture_account_session` 成功后立即 `persist_session` + `flush_to_disk`。

```rust
// commands.rs: capture_account_session 末尾
crate::api_billing::session::persist_session(&state, &account_id, &session)?;
crate::api_billing::storage::flush_to_disk(&app)?;  // ← 新增: 强制落盘
```

#### 2. Session TTL（参考 Browserless retention policy）

```rust
// types.rs: RelayStation 新增字段
#[serde(default = "default_session_ttl")]
pub session_ttl_hours: u32,

fn default_session_ttl() -> u32 { 720 } // 30 天
```

```rust
// session.rs: 启动恢复时检查过期
fn is_expired(session: &AccountSession, ttl_hours: u32) -> bool {
    // 解析 captured_at → 计算 age → 比较 ttl
}
```

#### 3. 自动清理（参考 Browser Use TTL）

启动恢复时，遍历所有 session，TTL 超时的自动标记 `LoginRequired` 并清理加密数据。

### F.7 架构评价

bench Session Manager 的核心设计（data_directory 隔离、cookie+localStorage 提取、AuthProfile 自适应检测、ExclusivityMode 互斥）**在行业中没有直接竞品**。

最接近的 MultiZen 偏隐私多开，Browserless/Playwright 偏自动化/测试，Browser Use 偏 AI agent。三者都不面向"个人日常使用多个网站的登录态管理"。

bench 的独特优势：
- **AuthProfile 自动检测** — 其他项目完全不支持
- **多账号互斥** — Exclusive/Rotating 模式独有
- **临时会话** — Ephemeral Account 模式独有
- **原生桌面 UI** — Station/Account 面板 + 彩色状态灯

当前主要差距在**可靠性（增量保存、TTL、自动清理）**，而非功能深度。上述 3 项改进采用后，bench 的 session 管理可靠性将达到行业标准水平。

## 附录 G: 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-06-30 | 初版 |
| v1.1 | 2026-06-30 | DBSC GA、TLS 指纹对抗、Playwright 参考、eval 增强 |
| v1.2 | 2026-06-30 | 深度复盘 7 遗漏点 |
| v1.3 | 2026-06-30 | 六路 Agent 攻防评审 38 项修正 |
| v1.4 | 2026-06-30 | 开源参考项目 Brief 分析 |
| v1.5 | 2026-06-30 | 开源参考项目深度对比 + 可直接复用方案 + 即时改进建议 |
| v1.6 | 2026-06-30 | 附录 H 实施状态标注；F.6.1/F.6.2/F.6.3 落地；Ephemeral + 串联 + TTL 全部完成；遗漏 2/4/5/7 收尾 |
| v1.7 | 2026-06-30 | StationDialog 高级设置新建/编辑均可用；Rotating 切换账号 UI；`inactive` i18n 补齐；historyDatalist label 渲染；`switchAccount` toast |
| v1.8 | 2026-06-30 | 移除 exclusivityMode/旋转切换/互斥引擎；持久账户表单精简(3字段)；AuthProfile 面板增强(独立组件+彩色灯+手动策略切换)；LoginDetectionField 移除；"中转站"→"站点" |

## 附录 H: 实施状态总览 (v1.8)

> 标注规则: ✅ 已实现 / ⏳ Phase 2 计划 / 🔮 v2.0 / ❌ 已放弃

### H.1 设计章节实施状态

| 章节 | 项目 | 状态 | 实现位置 / 备注 |
|------|------|------|----------------|
| §1.1 数据模型 | AccountType / AccountSessionStatus(+Inactive) / CookieEntry(+partitioned) / AccountSession / AuthProfile / ProbeStrategy / ProbeResult | ✅ | `types.rs` |
| §1.2 检测中间类型 | DetectionResult / LocalStorageTokenInfo / CsrfDetection / LogoutElement / CloudflareDetection | ✅ | `detection.rs` |
| §2.1 登录捕获 | capture_session_after_login / extract_cookies(cookies_for_url) / capture_local_storage / capture_session_storage / extract_csrf_token / extract_user_agent / evaluate_and_decode(eval_with_callback+oneshot) | ✅ | `session.rs` |
| §2.2 启动恢复 | restore_sessions_on_startup + cleanup_expired_sessions (F.6.3) | ✅ | `session.rs` + `lib.rs` |
| §2.3 退出持久化 | persist_all_sessions_on_exit + cleanup_ephemeral | ✅ | `session.rs` + `lib.rs` ExitRequested |
| §2.4 lib.rs 集成 | spawn 任务移入 AppHandle; ExitRequested block_on | ✅ | `lib.rs` |
| §3 AuthProfile 检测 | DETECTION_SCRIPT JS + classify + detect_auth_profile | ✅ | `detection.rs` |
| §3.3 登录后触发 | on_login_completed → mark_account_logged_in 串联 capture + detect | ✅ | `commands.rs::mark_account_logged_in` |
| §4.1 策略路由 | probe_session (HttpFirst 降级 WebView) | ✅ | `probe.rs` |
| §4.2 L1 HTTP Probe | http_probe (reqwest + 403/503 anti-bot + 重定向) | ✅ | `probe.rs` |
| §4.3 L2 WebView Probe | webview_probe + collect_multi_source_evidence + judge_from_evidence | ✅ | `probe.rs` |
| §4.4 L3 Hybrid Probe | hybrid_probe (MVP 复用 webview_probe) | ✅ | `probe.rs` (probe_session 的 Hybrid 分支) |
| §4.5 自适应降级 | adaptive_degrade (连续 3 次 → WebviewOnly) + set_probe_strategy + reset_probe_strategy | ✅ | `probe.rs` |
| §4.6 TLS 指纹对抗 | rquest feature-gated | ⏳ Phase 2 | MVP 用方案 C (自动降级) |
| §5 互斥引擎 | 账号隔离模式 (exclusive/rotating 已移除，仅 coexisting) | ✅ (简化) | 前端 exclusivityMode/switchAccount/rotating 全部删除；后端 `exclusivity.rs` 保留但不再配置互斥策略 |
| §6.1 API 契约 | capture/restore/clear_account_session + detect/get_station_auth_profile + set_exclusivity_mode + switch_active_account + set/reset_probe_strategy + create_ephemeral_account + set_session_ttl + mark_account_logged_in(串联) | ✅ | `commands.rs` |
| §6.2 前端 API 适配 | api.ts 全部命令绑定 | ✅ | `api.ts` |
| §7.1 Schema v3 | sessions + auth_profiles + schema_version 迁移 | ✅ | `storage.rs` (CURRENT_SCHEMA=3) |
| §7.2 加密体系 | EncryptedBlob { v, nonce, ct } + AES-256-GCM + keyring + master_key | ✅ | `crypto.rs` |
| §7.3 加密不变性 | 每次加密 OsRng 生成 nonce; 解密自动验证 GCM tag | ✅ | `crypto.rs` |
| §8 生命周期 | setup → init_state → 后台 cleanup_expired + restore; ExitRequested → persist + cleanup_ephemeral + flush | ✅ | `lib.rs` |

### H.2 即时改进建议 (F.6) 实施状态

| 建议 | 状态 | 实现 |
|------|------|------|
| F.6.1 增量保存 + flush_to_disk | ✅ | `with_state_mut` 每次 save; `capture_account_session` 写入后自动落盘 |
| F.6.2 Session TTL (session_ttl_hours) | ✅ | `RelayStation.session_ttl_hours` + `is_session_expired` |
| F.6.3 自动清理过期 session | ✅ | `cleanup_expired_sessions` 在启动时执行 |

### H.3 遗漏点 (v1.2 复盘) 收尾状态

| 遗漏 | 状态 | 实现位置 |
|------|------|---------|
| 遗漏 1: CSP 对 evaluateJavaScript 影响 | ✅ (设计确认无需处理) | Tauri eval 走原生 API,绕过 CSP |
| 遗漏 2: CHIPS partitioned cookie 过滤 | ✅ | `probe.rs::filter_probe_cookies` (http_probe 调用) |
| 遗漏 3: iCloud Private Relay 检测 | ✅ (简化实现) | `probe.rs::detect_private_relay_enabled` (NSUserDefaults 读取) |
| 遗漏 4: IndexedDB 导出方案 | ✅ | `session.rs::capture_indexeddb` (idb-backup-and-restore JS 注入) |
| 遗漏 5: HTTP/3 0-RTT 重放 | ✅ (设计确认无需处理) | HTTP probe 仅用 HEAD 方法,天然幂等 |
| 遗漏 6: localStorage Quota / Private Browsing | ✅ | `session.rs::capture_per_origin_storage` 内置 try/catch + 大值截断 |
| 遗漏 7: 网络变化检测 | ⏳ Phase 2 | 留待 nw_path_monitor 集成 |

### H.4 前端实施状态

| 项目 | 状态 | 实现位置 |
|------|------|---------|
| AuthProfile 详情面板 (§7.4) | ✅ | `page.tsx::AuthProfilePanel` 独立组件 + 彩色状态灯 + 置信度进度条 + 手动探针策略切换 |
| 重新检测按钮 | ✅ | `page.tsx::handleRedetectProfile` |
| 手动切换探针策略下拉 | ✅ | `page.tsx::AuthProfilePanel` 策略选择器 + setProbeStrategy/resetProbeStrategy |
| 互斥模式配置 (§4.5.1) | ❌ (已移除) | exclusive/rotating 全部删除，仅保留 coexisting；`ExclusivityMode` 类型引用已清理 |
| Session TTL 配置 (F.6.2) | ✅ | `page.tsx::StationDialog` 高级 Section（新建/编辑均可配置） |
| 快速登录 Ephemeral (§4.1) | ✅ | `page.tsx::handleQuickLogin` + `create_ephemeral_account` |
| 关闭后销毁 checkbox (§4.1) | ✅ | `page.tsx::QuickLoginDialog` `destroyOnClose` state + `WebviewWindow.onCloseRequested` 监听 |
| 最近 5 个临时 URL 历史 (§7.2) | ✅ | `page.tsx` localStorage `api-billing.quick-login.history.v1` |
| 历史 URL datalist 标签 | ✅ | `page.tsx::QuickLoginDialog` 修复 i18n label 渲染 |
| Rotating 切换账号按钮 | ❌ (已移除) | `switchAccount` + `isRotating` + `onSwitch` 全部删除；`AccountCardContent` 操作按钮简化 |
| `inactive` 状态 i18n | ✅ | `en/zh.json::apiBilling.status.inactive` |
| 持久账户表单精简 (§4.2) | ✅ | 0.5d 实现：删除 phone/tgAccount/linkedAccount/inviteLink/loginMethods；3 字段（username/password/notes） |

### H.5 留作 Phase 2 / v2.0 的项目

| 项目 | 计划版本 | 原因 |
|------|---------|------|
| per-origin localStorage (F.3.2) | ✅ v2.0 已实现 | `OriginStorage` + `AccountSession.origins` (向后兼容保留扁平字段) |
| rquest TLS 指纹对抗 (§4.6 方案 A) | ⏳ Phase 2 | 需 libcurl 依赖 + 打包调整 |
| 网络变化检测 (遗漏 7) | ⏳ Phase 2 | 需 nw_path_monitor |
| per-session key HKDF 派生 (R11) | ⏳ Phase 2 | 前向安全性增强 |
| refresh 并发去重 (R12) | ⏳ Phase 2 | per-account CAS |
| ProbeWebViewGuard RAII (R13) | ⏳ Phase 2 | 资源泄漏防护 |
| Semaphore 限流恢复 (R14) | ⏳ Phase 2 | 多 Station 并发控制 |
| Linux/Windows WebView (R15) | ⏳ Phase 2 | 跨平台矩阵 |
| WKProcessPool 验证 (R17) | ⏳ Phase 2 | Tauri v2 暴露方式待确认 |

