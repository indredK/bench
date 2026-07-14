//! Session 持久化引擎 — 登录捕获、启动恢复、退出持久化
//!
//! 核心原则: 不依赖 WebView 自身的 cookie 持久化。
//! 登录完成后立即通过 cookies_for_url() 提取并加密存储；
//! 退出前通过 ExitRequested hook 做最后一次提取 + flush；
//! 启动时从加密存储恢复并注入到 WebView。

use std::sync::{Arc, Mutex};
use std::time::Duration;

use cookie::SameSite;
use tauri::webview::Cookie as WebviewCookie;
use tauri::{AppHandle, Manager, Runtime, Url, WebviewWindow};
use tokio::sync::oneshot;

use super::browser_storage::{self, IndexedDbCaptureStatus};
use super::crypto;
use super::state::AccountManagerState;
use super::storage;
use super::types::*;
use super::webview;

const EVAL_TIMEOUT_MS: u64 = 2_000;

/// eval_with_callback + oneshot 桥接 —— 安全的 JS 执行
pub(crate) async fn evaluate_js<R: Runtime>(
    window: &WebviewWindow<R>,
    script: &str,
) -> AccountManagerResult<String> {
    let (tx, rx) = oneshot::channel::<String>();
    let slot: Arc<Mutex<Option<oneshot::Sender<String>>>> = Arc::new(Mutex::new(Some(tx)));

    window
        .eval_with_callback(script, move |result| {
            let Ok(mut guard) = slot.lock() else { return };
            if let Some(sender) = guard.take() {
                let _ = sender.send(result);
            }
        })
        .map_err(|e| AccountManagerError::store_fail(format!("eval failed: {e}")))?;

    let payload = tokio::time::timeout(Duration::from_millis(EVAL_TIMEOUT_MS), rx)
        .await
        .map_err(|_| AccountManagerError::store_fail("eval timeout"))?
        .map_err(|_| AccountManagerError::store_fail("eval channel closed"))?;

    let value: serde_json::Value = serde_json::from_str(&payload)
        .map_err(|e| AccountManagerError::store_fail(format!("decode eval result: {e}")))?;

    match value {
        serde_json::Value::String(s) => Ok(s),
        serde_json::Value::Null => Err(AccountManagerError::store_fail("eval returned null")),
        other => Ok(other.to_string()),
    }
}

/// 通过 Tauri v2 cookies_for_url() 获取指定 URL 的全部 cookie
async fn extract_cookies<R: Runtime>(
    window: &WebviewWindow<R>,
    url: &str,
) -> AccountManagerResult<Vec<CookieEntry>> {
    let parsed: Url = url
        .parse()
        .map_err(|e| AccountManagerError::invalid_input(format!("parse url: {e}")))?;

    let capture_host = parsed.host_str().unwrap_or_default().to_string();
    let cookies = window
        .cookies_for_url(parsed)
        .map_err(|e| AccountManagerError::store_fail(format!("cookies_for_url failed: {e}")))?;

    Ok(cookies
        .into_iter()
        .map(|c| {
            let host_only = c.domain().is_none();
            CookieEntry {
                name: c.name().to_string(),
                value: c.value().to_string(),
                domain: c.domain().unwrap_or(&capture_host).to_string(),
                host_only,
                path: c.path().unwrap_or("/").to_string(),
                http_only: c.http_only().unwrap_or(false),
                secure: c.secure().unwrap_or(false),
                same_site: c.same_site().map(|s| format!("{:?}", s).to_lowercase()),
                partitioned: c.partitioned().unwrap_or(false),
                expires: c.expires_datetime().map(|d| d.to_string()),
                expires_at_ts: c.expires_datetime().map(|d| d.unix_timestamp()),
            }
        })
        .collect())
}

async fn extract_user_agent<R: Runtime>(window: &WebviewWindow<R>) -> AccountManagerResult<String> {
    evaluate_js(window, "JSON.stringify(navigator.userAgent)").await
}

/// 外部代理登录完成后（命中 loopback / 自定义 scheme 回调）针对**目标站点**
/// 捕获 cookie 并持久化 session，并把账号标记为 Ready + 记录登录时间。
///
/// 注意：此刻 WebView 当前页面可能已是 loopback 回调页，因此我们显式针对
/// `target_url`（如 https://www.trae.cn/...）抓取 cookie，而不是当前页 URL。
/// 即便 session 捕获失败，账号的独立 WebView data dir 也已在磁盘上保留登录态，
/// 下次仍是已登录状态。
pub async fn finalize_proxy_session<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    target_url: &str,
) -> AccountManagerResult<()> {
    let state = app.state::<AccountManagerState>();

    let snapshot = state.read_snapshot_checked()?;
    let account = snapshot
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .cloned()
        .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
    let requires_indexed_db = snapshot
        .stations
        .iter()
        .find(|station| station.id == account.station_id)
        .and_then(|station| station.auth_profile.as_ref())
        .is_some_and(|profile| profile.token_storage == TokenStorage::IndexedDB);

    let login_label = webview::login_window_label(account_id);
    let window = app
        .get_webview_window(&login_label)
        .ok_or_else(|| AccountManagerError::not_found(format!("login window {login_label}")))?;
    let cookies = extract_cookies(&window, target_url).await?;
    let captured_origin =
        browser_storage::capture_current_origin(&window, &state, target_url).await?;
    if requires_indexed_db
        && captured_origin
            .as_ref()
            .is_none_or(|capture| capture.indexed_db_status != IndexedDbCaptureStatus::Complete)
    {
        return Err(AccountManagerError::store_fail(
            "IndexedDB is required by this station but could not be captured completely",
        ));
    }
    if cookies.is_empty()
        && captured_origin
            .as_ref()
            .is_none_or(|capture| !capture.has_data)
    {
        return Err(AccountManagerError::store_fail(
            "login completed without capturable session data",
        ));
    }
    let user_agent = extract_user_agent(&window).await.unwrap_or_default();
    let mut session = restore_session(&state, account_id)?.unwrap_or_default();
    session.cookies = cookies;
    session.user_agent = user_agent;
    session.captured_at = super::commands::now_label();
    session.captured_at_ts = Some(chrono::Utc::now().timestamp());
    if let Some(capture) = captured_origin {
        browser_storage::merge_origin(&mut session, capture.storage);
    }
    let encrypted = if account.account_type == AccountType::Persistent {
        Some(encrypt_session(&state, &session)?)
    } else {
        None
    };

    storage::with_state_mut(app, &state, |snapshot| {
        let a = snapshot
            .accounts
            .iter_mut()
            .find(|a| a.id == account_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
        // Captured is not equivalent to verified. The WebView completion path
        // runs a probe before this account may transition to Ready.
        a.status = AccountSessionStatus::Inactive;
        let now = super::commands::now_label();
        a.last_login_at = Some(now.clone());
        a.last_refreshed_at = Some(now);
        if let Some(blob) = encrypted.clone() {
            snapshot.sessions.insert(account_id.to_string(), blob);
        }
        Ok(())
    })
}

fn encrypt_session(
    state: &AccountManagerState,
    session: &AccountSession,
) -> AccountManagerResult<super::crypto::EncryptedBlob> {
    let key = state.master_key()?;
    let json = serde_json::to_string(session)
        .map_err(|e| AccountManagerError::store_fail(format!("serialize session: {e}")))?;
    crypto::encrypt(&key, &json)
}

/// 解密并恢复 session。
pub fn restore_session(
    state: &AccountManagerState,
    account_id: &str,
) -> AccountManagerResult<Option<AccountSession>> {
    let key = state.master_key()?;
    let blob = match state.get_session(account_id) {
        Some(b) => b,
        None => return Ok(None),
    };
    let plaintext = crypto::decrypt(&key, &blob)?;
    let session: AccountSession = serde_json::from_str(&plaintext)
        .map_err(|e| AccountManagerError::store_fail(format!("deserialize session: {e}")))?;
    Ok(Some(session))
}

/// Inject the encrypted session snapshot into a newly-created isolated WebView.
/// Tauri documents cookie access as safe from async paths on Windows; callers
/// create or probe the WebView outside synchronous IPC event handlers.
pub fn inject_session<R: Runtime>(
    window: &WebviewWindow<R>,
    session: &AccountSession,
) -> AccountManagerResult<usize> {
    let mut injected = 0;
    for entry in &session.cookies {
        let mut builder = WebviewCookie::build((entry.name.clone(), entry.value.clone()))
            .path(if entry.path.is_empty() {
                "/".to_string()
            } else {
                entry.path.clone()
            })
            .secure(entry.secure)
            .http_only(entry.http_only)
            .partitioned(entry.partitioned);
        if !entry.domain.trim().is_empty() {
            builder = builder.domain(entry.domain.clone());
        }
        if let Some(same_site) = entry.same_site.as_deref().and_then(|value| match value {
            "strict" => Some(SameSite::Strict),
            "lax" => Some(SameSite::Lax),
            "none" => Some(SameSite::None),
            _ => None,
        }) {
            builder = builder.same_site(same_site);
        }
        if let Some(expires_at) = entry
            .expires_at_ts
            .and_then(|timestamp| cookie::time::OffsetDateTime::from_unix_timestamp(timestamp).ok())
        {
            builder = builder.expires(expires_at);
        }
        window
            .set_cookie(builder.build())
            .map_err(|e| AccountManagerError::store_fail(format!("set cookie: {e}")))?;
        injected += 1;
    }
    Ok(injected)
}

// ═══════════════════════════════════════════════
// 2.2 启动恢复
// ═══════════════════════════════════════════════

/// 启动时恢复所有持久账户的 session
pub async fn restore_sessions_on_startup<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
) -> AccountManagerResult<usize> {
    let snapshot = state.read_snapshot();
    let account_ids = snapshot
        .accounts
        .iter()
        .filter(|account| account.account_type == AccountType::Persistent)
        .filter(|account| account.status == AccountSessionStatus::Ready)
        .filter(|account| snapshot.sessions.contains_key(&account.id))
        .map(|account| account.id.clone())
        .collect::<Vec<_>>();
    let mut restored = 0;

    for account_id in account_ids {
        match restore_session(state, &account_id) {
            Ok(Some(_)) => match super::commands::refresh_one_impl(app.clone(), account_id.clone())
                .await
            {
                Ok(account) if account.status == AccountSessionStatus::Ready => restored += 1,
                Ok(_) => {}
                Err(error) => {
                    eprintln!("[account_manager] restore probe failed for {account_id}: {error}");
                    set_status(
                        app,
                        state,
                        &account_id,
                        AccountSessionStatus::FetchFailed,
                        false,
                    )?;
                }
            },
            Ok(None) => {
                set_status(
                    app,
                    state,
                    &account_id,
                    AccountSessionStatus::LoginRequired,
                    false,
                )?;
            }
            Err(error) => {
                eprintln!("[account_manager] restore decrypt failed for {account_id}: {error}");
                set_status(
                    app,
                    state,
                    &account_id,
                    AccountSessionStatus::LoginRequired,
                    true,
                )?;
            }
        }
    }
    Ok(restored)
}

// ═══════════════════════════════════════════════
// 2.3 退出持久化
// ═══════════════════════════════════════════════

/// App 退出前持久化所有活跃 session
pub async fn persist_all_sessions_on_exit<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
) -> AccountManagerResult<usize> {
    let snapshot = state.read_snapshot();
    let mut captured = Vec::new();

    for account in &snapshot.accounts {
        if account.account_type != AccountType::Persistent {
            continue;
        }
        if account.status != AccountSessionStatus::Ready {
            continue;
        }

        let login_label = webview::login_window_label(&account.id);
        if let Some(window) = app.get_webview_window(&login_label) {
            let website = account.website.as_deref().or_else(|| {
                snapshot
                    .stations
                    .iter()
                    .find(|station| station.id == account.station_id)
                    .map(|station| station.website.as_str())
            });
            let Some(website) = website else { continue };
            let mut session = restore_session(state, &account.id)?.unwrap_or_default();
            let mut changed = false;
            match extract_cookies(&window, website).await {
                Ok(cookies) if !cookies.is_empty() => {
                    session.cookies = cookies;
                    changed = true;
                }
                Ok(_) => {}
                Err(error) => eprintln!(
                    "[account_manager] exit cookie capture failed for {}: {error}",
                    account.id
                ),
            }
            match browser_storage::capture_current_origin(&window, state, website).await {
                Ok(Some(origin)) => {
                    browser_storage::merge_origin(&mut session, origin.storage);
                    changed = true;
                }
                Ok(None) => {}
                Err(error) => eprintln!(
                    "[account_manager] exit origin capture failed for {}: {error}",
                    account.id
                ),
            }
            if changed {
                session.captured_at = super::commands::now_label();
                session.captured_at_ts = Some(chrono::Utc::now().timestamp());
                session.user_agent = extract_user_agent(&window).await.unwrap_or_default();
                captured.push((account.id.clone(), encrypt_session(state, &session)?));
            }
        }
    }

    let persisted = captured.len();
    storage::with_state_mut(app, state, |next| {
        for (account_id, blob) in &captured {
            next.sessions.insert(account_id.clone(), blob.clone());
        }

        let ephemeral_ids = next
            .accounts
            .iter()
            .filter(|account| account.account_type == AccountType::Ephemeral)
            .map(|account| account.id.clone())
            .collect::<std::collections::HashSet<_>>();
        next.accounts
            .retain(|account| !ephemeral_ids.contains(&account.id));
        next.secrets.retain(|id, _| !ephemeral_ids.contains(id));
        next.sessions.retain(|id, _| !ephemeral_ids.contains(id));
        next.external_app_bindings
            .retain(|binding| !ephemeral_ids.contains(&binding.account_id));
        Ok(())
    })?;
    Ok(persisted)
}

// ═══════════════════════════════════════════════
// F.6.2/F.6.3 Session TTL & 自动清理
// ═══════════════════════════════════════════════

/// 把 captured_at 字符串解析为 chrono::DateTime(本地时区近似 UTC)。
/// 现存格式由 commands::now_label() 生成: "%Y-%m-%d %H:%M"。失败则返回 None。
fn parse_captured_at(value: &str) -> Option<chrono::NaiveDateTime> {
    use chrono::NaiveDateTime;
    NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M").ok()
}

/// 判断 session 是否超过 ttl_hours 时长。ttl_hours == 0 视为永不过期。
///
/// 优先用 `captured_at_ts`（UTC Unix 秒，无歧义）；旧 session 无此字段时回退到
/// `captured_at` 字符串解析。注意 `now_label()` 生成的是本地时间字符串，回退路径
/// 把它当作 UTC 解析（`.and_utc()`），在非 UTC 机器上会有偏差 —— 这是旧数据的
/// 既有行为，新捕获的 session 已通过 `captured_at_ts` 修复。
pub fn is_session_expired(
    session: &AccountSession,
    ttl_hours: u32,
    now: chrono::DateTime<chrono::Utc>,
) -> bool {
    if ttl_hours == 0 {
        return false;
    }
    let captured_utc = session
        .captured_at_ts
        .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
        .or_else(|| parse_captured_at(&session.captured_at).map(|d| d.and_utc()));
    let Some(captured) = captured_utc else {
        // 没有时间戳 → 视为过期,避免用老数据误判为有效
        return true;
    };
    let age = now.signed_duration_since(captured);
    let ttl = chrono::Duration::hours(ttl_hours as i64);
    age > ttl
}

/// 启动时遍历清理 TTL 超时的 session(F.6.3)。
/// 返回被清理的 (account_id, old_status) 列表,供上层做埋点。
pub fn cleanup_expired_sessions<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    now: chrono::DateTime<chrono::Utc>,
) -> AccountManagerResult<Vec<(String, AccountSessionStatus)>> {
    use std::collections::HashMap;
    let snapshot = state.read_snapshot();

    // 按 station 预取 ttl 减少重复查找
    let ttl_by_station: HashMap<&str, u32> = snapshot
        .stations
        .iter()
        .map(|s| (s.id.as_str(), s.session_ttl_hours))
        .collect();

    // 找出需要清理的账号
    struct ToClear {
        account_id: String,
        old_status: AccountSessionStatus,
    }
    let to_clear: Vec<ToClear> = snapshot
        .accounts
        .iter()
        .filter(|a| a.account_type == AccountType::Persistent)
        .filter(|a| snapshot.sessions.contains_key(&a.id))
        .filter_map(|a| {
            let ttl = ttl_by_station
                .get(a.station_id.as_str())
                .copied()
                .unwrap_or(720);
            // 先尝试从内存里的 session 解密做时间检查;无法解密的视为过期
            let expired = match restore_session(state, &a.id) {
                Ok(Some(s)) => is_session_expired(&s, ttl, now),
                Ok(None) => false, // 内存没有 → 留待快照迁移逻辑
                Err(_) => true,    // 解密失败 → 过期处理
            };
            if expired {
                Some(ToClear {
                    account_id: a.id.clone(),
                    old_status: a.status,
                })
            } else {
                None
            }
        })
        .collect();

    if to_clear.is_empty() {
        return Ok(Vec::new());
    }

    let cleared = to_clear
        .iter()
        .map(|t| (t.account_id.clone(), t.old_status))
        .collect::<Vec<_>>();

    storage::with_state_mut(app, state, |snapshot| {
        for t in &to_clear {
            if let Some(a) = snapshot.accounts.iter_mut().find(|a| a.id == t.account_id) {
                a.session = None;
                a.status = AccountSessionStatus::LoginRequired;
            }
            snapshot.sessions.remove(&t.account_id);
        }
        Ok(())
    })?;

    Ok(cleared)
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

fn set_status<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    account_id: &str,
    status: AccountSessionStatus,
    clear_session: bool,
) -> AccountManagerResult<()> {
    storage::with_state_mut(app, state, |snapshot| {
        let account = snapshot
            .accounts
            .iter_mut()
            .find(|account| account.id == account_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
        account.status = status;
        account.session = None;
        if clear_session {
            snapshot.sessions.remove(account_id);
        }
        Ok(())
    })
}
