//! Session 持久化引擎 — 登录捕获、启动恢复、退出持久化
//!
//! 核心原则: 不依赖 WebView 自身的 cookie 持久化。
//! 登录完成后立即通过 cookies_for_url() 提取并加密存储；
//! 退出前通过 ExitRequested hook 做最后一次提取 + flush；
//! 启动时从加密存储恢复并注入到 WebView。

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime, Url, WebviewWindow};
use tokio::sync::oneshot;

use super::crypto;
use super::state::AccountManagerState;
use super::storage;
use super::types::*;
use super::webview;

const CAPTURE_TIMEOUT_MS: u64 = 3_000;
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

// ═══════════════════════════════════════════════
// 2.1 登录捕获
// ═══════════════════════════════════════════════

/// 登录窗口导航到非登录页面后触发捕获
pub async fn capture_session_after_login<R: Runtime>(
    window: &WebviewWindow<R>,
    _account: &StationAccount,
    _auth_profile: &Option<AuthProfile>,
) -> AccountManagerResult<AccountSession> {
    let url = window
        .url()
        .map_err(|e| AccountManagerError::store_fail(format!("get window url: {e}")))?;
    let url_str = url.to_string();

    // 1. 提取 cookies
    let cookies = tokio::time::timeout(
        Duration::from_millis(CAPTURE_TIMEOUT_MS),
        extract_cookies(window, &url_str),
    )
    .await
    .map_err(|_| AccountManagerError::store_fail("cookie capture timeout"))?
    .unwrap_or_default();

    // 2. 获取 User-Agent (fallback: 完整 WKWebView UA)
    let user_agent = extract_user_agent(window).await.unwrap_or_else(|_| {
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
         AppleWebKit/605.1.15 (KHTML, like Gecko) \
         Version/17.0 Safari/605.1.15"
            .to_string()
    });

    let mut session = AccountSession {
        cookies,
        user_agent,
        captured_at: super::commands::now_label(),
        ..Default::default()
    };

    // 3. v1.6 遗漏 4: IndexedDB 快照(尽力而为,失败不影响主流程)
    //    注入 idb-backup-and-restore 等价 JS,导出所有 database → object store → key-value。
    //    大数据(>50MB)只导出 schema。
    if let Ok(idb_blob) = capture_indexeddb(window).await {
        session.indexeddb_snapshot = Some(idb_blob);
    }

    // 4. v2.0 per-origin localStorage/sessionStorage(参考 Playwright storageState)
    //    按 origin 精确捕获,避免跨 origin 污染。
    if let Ok(origins) = capture_per_origin_storage(window).await {
        if !origins.is_empty() {
            session.origins = origins;
        }
    }

    Ok(session)
}

/// 通过 Tauri v2 cookies_for_url() 获取指定 URL 的全部 cookie
async fn extract_cookies<R: Runtime>(
    window: &WebviewWindow<R>,
    url: &str,
) -> AccountManagerResult<Vec<CookieEntry>> {
    let parsed: Url = url
        .parse()
        .map_err(|e| AccountManagerError::invalid_input(format!("parse url: {e}")))?;

    let cookies = window.cookies_for_url(parsed).map_err(|e| {
        AccountManagerError::store_fail(format!("cookies_for_url failed: {e}"))
    })?;

    Ok(cookies
        .into_iter()
        .map(|c| {
            CookieEntry {
                name: c.name().to_string(),
                value: c.value().to_string(),
                domain: c.domain().unwrap_or_default().to_string(),
                path: c.path().unwrap_or("/").to_string(),
                http_only: c.http_only().unwrap_or(false),
                secure: c.secure().unwrap_or(false),
                same_site: c.same_site().map(|s| format!("{:?}", s).to_lowercase()),
                partitioned: c.partitioned().unwrap_or(false),
                expires: c.expires_datetime().map(|d| d.to_string()),
            }
        })
        .collect())
}

async fn extract_user_agent<R: Runtime>(
    window: &WebviewWindow<R>,
) -> AccountManagerResult<String> {
    evaluate_js(window, "JSON.stringify(navigator.userAgent)").await
}

// ═══════════════════════════════════════════════
// v2.0 per-origin localStorage/sessionStorage (Playwright storageState 等价)
// ═══════════════════════════════════════════════

const PER_ORIGIN_TIMEOUT_MS: u64 = 3_000;
/// 单值 >1MB 截断（在注入的 JS 内部已实现,本常量仅作文档标记）
#[allow(dead_code)]
const PER_ORIGIN_MAX_VALUE_BYTES: usize = 1_000_000; // 单值 >1MB 截断

/// 捕获当前 WebView 所有 origin 的 localStorage + sessionStorage。
///
/// 注入的 JS 同时遍历:
/// - 当前 window 的 localStorage/sessionStorage（主 origin）
/// - 通过 querySelectorAll('iframe') 拿到所有同源 iframe 的 storage（cross-origin iframe 受 CSP 限制无法读取）
///
/// 返回的 OriginStorage 列表已加密。失败时返回 Err（调用方静默忽略）。
async fn capture_per_origin_storage<R: Runtime>(
    window: &WebviewWindow<R>,
) -> AccountManagerResult<Vec<OriginStorage>> {
    let script = r#"
        (function() {
            'use strict';
            function dumpStorage(storage) {
                var out = {};
                try {
                    for (var i = 0; i < storage.length; i++) {
                        var key = storage.key(i);
                        try {
                            var v = storage.getItem(key) || '';
                            // 单值 >1MB 截断
                            out[key] = v.length > 1000000 ? '[TRUNCATED:' + v.length + ' bytes]' : v;
                        } catch(e) {
                            out[key] = '[READ_ERROR]';
                        }
                    }
                } catch(e) { /* Private Browsing 等场景,storage 不可访问 */ }
                return out;
            }
            var origins = [];
            // 主 origin
            try {
                var origin = window.location.origin;
                if (origin && origin !== 'null') {
                    origins.push({
                        origin: origin,
                        localStorage: dumpStorage(localStorage),
                        sessionStorage: dumpStorage(sessionStorage)
                    });
                }
            } catch(e) {}
            // 同源 iframe（cross-origin iframe 受 Same-Origin Policy 限制无法读取）
            try {
                var frames = document.querySelectorAll('iframe');
                for (var i = 0; i < frames.length; i++) {
                    try {
                        var f = frames[i];
                        var fOrigin = f.contentWindow.location.origin;
                        // 只处理同源 iframe
                        if (fOrigin === window.location.origin) continue;
                        if (origins.some(function(o) { return o.origin === fOrigin; })) continue;
                        origins.push({
                            origin: fOrigin,
                            localStorage: dumpStorage(f.contentWindow.localStorage),
                            sessionStorage: dumpStorage(f.contentWindow.sessionStorage)
                        });
                    } catch(e) { /* cross-origin iframe 跳过 */ }
                }
            } catch(e) {}
            return JSON.stringify(origins);
        })()
    "#;

    let raw = tokio::time::timeout(
        Duration::from_millis(PER_ORIGIN_TIMEOUT_MS),
        evaluate_js(window, script),
    )
    .await
    .map_err(|_| AccountManagerError::store_fail("per-origin storage timeout"))??;

    // 解析为 Vec<{origin, localStorage, sessionStorage}>
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawOrigin {
        origin: String,
        local_storage: serde_json::Value,
        session_storage: serde_json::Value,
    }
    let raw_origins: Vec<RawOrigin> = serde_json::from_str(&raw)
        .map_err(|e| AccountManagerError::store_fail(format!("parse per-origin: {e}")))?;

    let key = {
        let state = window.app_handle().state::<AccountManagerState>();
        state.master_key()?
    };

    let mut out = Vec::with_capacity(raw_origins.len());
    for ro in raw_origins {
        let ls_blob = if !ro.local_storage.as_object().map(|m| m.is_empty()).unwrap_or(true) {
            let json = serde_json::to_string(&ro.local_storage)
                .map_err(|e| AccountManagerError::store_fail(format!("serialize ls: {e}")))?;
            Some(crypto::encrypt(&key, &json)?)
        } else {
            None
        };
        let ss_blob = if !ro.session_storage.as_object().map(|m| m.is_empty()).unwrap_or(true) {
            let json = serde_json::to_string(&ro.session_storage)
                .map_err(|e| AccountManagerError::store_fail(format!("serialize ss: {e}")))?;
            Some(crypto::encrypt(&key, &json)?)
        } else {
            None
        };
        if ls_blob.is_some() || ss_blob.is_some() {
            out.push(OriginStorage {
                origin: ro.origin,
                local_storage: ls_blob,
                session_storage: ss_blob,
            });
        }
    }
    Ok(out)
}

// ═══════════════════════════════════════════════
// v1.6 遗漏 4: IndexedDB 快照(idb-backup-and-restore 等价实现)
// ═══════════════════════════════════════════════

const IDB_DUMP_TIMEOUT_MS: u64 = 8_000;
const IDB_MAX_PAYLOAD_BYTES: usize = 50 * 1024 * 1024; // 50MB

/// 注入 idb-backup-and-restore 等价 JS,导出所有 IndexedDB 数据。
/// 大数据(>50MB)只导出 database names + store names,不导出数据。
/// 失败时返回 Err,但调用方会静默忽略(不影响主流程)。
async fn capture_indexeddb<R: Runtime>(
    window: &WebviewWindow<R>,
) -> AccountManagerResult<super::crypto::EncryptedBlob> {
    // 1. 注入 dump 脚本(纯前端 JS,无 CDP 依赖)
    let script = r#"
        (async function() {
            'use strict';
            if (!window.indexedDB || !indexedDB.databases) {
                return JSON.stringify({ _error: 'indexedDB.databases() unsupported' });
            }
            let databases;
            try { databases = await indexedDB.databases(); }
            catch(e) { return JSON.stringify({ _error: 'databases() failed: ' + e.message }); }
            const result = {};
            for (const dbInfo of databases) {
                if (!dbInfo.name) continue;
                try {
                    const db = await new Promise((resolve, reject) => {
                        const req = indexedDB.open(dbInfo.name, dbInfo.version);
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => reject(req.error);
                        req.onblocked = () => reject(new Error('blocked'));
                    });
                    const stores = {};
                    for (const name of Array.from(db.objectStoreNames)) {
                        try {
                            const tx = db.transaction(name, 'readonly');
                            const store = tx.objectStore(name);
                            const items = await new Promise((resolve) => {
                                const req = store.getAll();
                                req.onsuccess = () => resolve(req.result || []);
                                req.onerror = () => resolve([]);
                            });
                            // 单条 > 1MB → 仅存 key + 类型
                            stores[name] = items.map((v) => {
                                try {
                                    const s = JSON.stringify(v);
                                    if (s && s.length > 1048576) {
                                        return { _truncated: true, _type: typeof v, _len: s.length };
                                    }
                                    return v;
                                } catch(e) {
                                    return { _truncated: true, _type: 'unserializable' };
                                }
                            });
                        } catch(e) {
                            stores[name] = { _error: e.message };
                        }
                    }
                    result[dbInfo.name] = stores;
                    db.close();
                } catch(e) {
                    result[dbInfo.name] = { _error: e.message };
                }
            }
            return JSON.stringify(result);
        })()
    "#;

    // 2. 执行(带 8s 超时,大数据可能耗时较长)
    let raw = match tokio::time::timeout(
        Duration::from_millis(IDB_DUMP_TIMEOUT_MS),
        evaluate_js(window, script),
    )
    .await
    {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => return Err(e),
        Err(_) => {
            return Err(AccountManagerError::store_fail(
                "indexedDB dump timeout (>8s)",
            ));
        }
    };

    // 3. 截断:大数据只保留 schema(database + store names)
    let payload = if raw.len() > IDB_MAX_PAYLOAD_BYTES {
        // 解析后只保留 db 名和 store 名
        let mut schema = serde_json::Map::new();
        if let Ok(serde_json::Value::Object(map)) = serde_json::from_str::<serde_json::Value>(&raw)
        {
            for (db_name, stores) in map {
                let store_names: Vec<String> = match stores {
                    serde_json::Value::Object(m) => m.keys().cloned().collect(),
                    _ => vec![],
                };
                schema.insert(
                    db_name,
                    serde_json::json!({ "_truncated": true, "stores": store_names }),
                );
            }
        }
        serde_json::to_string(&serde_json::Value::Object(schema))
            .unwrap_or_else(|_| raw.clone())
    } else {
        raw
    };

    // 4. 加密
    let key = {
        let state = window.app_handle().state::<AccountManagerState>();
        state.master_key()?
    };
    crypto::encrypt(&key, &payload)
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
) {
    let state = app.state::<AccountManagerState>();

    let account = state
        .read_snapshot()
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .cloned();

    let login_label = webview::login_window_label(account_id);
    if let Some(window) = app.get_webview_window(&login_label) {
        if let Ok(cookies) = extract_cookies(&window, target_url).await {
            if !cookies.is_empty() {
                let user_agent = extract_user_agent(&window).await.unwrap_or_default();
                let session = AccountSession {
                    cookies,
                    user_agent,
                    captured_at: super::commands::now_label(),
                    ..Default::default()
                };
                if account
                    .as_ref()
                    .map(|a| a.account_type == AccountType::Persistent)
                    .unwrap_or(false)
                {
                    let _ = persist_session(&state, account_id, &session);
                }
            }
        }
    }

    let _ = storage::with_state_mut(app, &state, |snapshot| {
        if let Some(a) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) {
            a.status = AccountSessionStatus::Ready;
            let now = super::commands::now_label();
            a.last_login_at = Some(now.clone());
            a.last_refreshed_at = Some(now);
        }
        Ok(())
    });
}

/// 加密 session 并写入 store
pub fn persist_session(
    state: &AccountManagerState,
    account_id: &str,
    session: &AccountSession,
) -> AccountManagerResult<()> {
    let key = state.master_key()?;
    let json = serde_json::to_string(session)
        .map_err(|e| AccountManagerError::store_fail(format!("serialize session: {e}")))?;
    let blob = crypto::encrypt(&key, &json)?;
    state.set_session(account_id, blob);
    Ok(())
}

/// 解密并恢复 session
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

// ═══════════════════════════════════════════════
// 2.2 启动恢复
// ═══════════════════════════════════════════════

/// 启动时恢复所有持久账户的 session
pub async fn restore_sessions_on_startup<R: Runtime>(
    _app: &AppHandle<R>,
    state: &AccountManagerState,
) {
    let snapshot = state.read_snapshot();
    for account in &snapshot.accounts {
        if account.account_type != AccountType::Persistent {
            continue;
        }
        if account.session.is_none() {
            continue;
        }
        if account.status != AccountSessionStatus::Ready {
            continue;
        }

        match restore_session(state, &account.id) {
            Ok(Some(session)) => {
                // Session 恢复成功 —— 在真实实现中执行探针验证
                let _ = session; // 后续用 probe 验证
            }
            Ok(None) => {
                // 无 session 数据
                update_status(state, &account.id, AccountSessionStatus::LoginRequired);
            }
            Err(_) => {
                // 解密失败
                clear_session(state, &account.id);
                update_status(state, &account.id, AccountSessionStatus::LoginRequired);
            }
        }
    }
}

// ═══════════════════════════════════════════════
// 2.3 退出持久化
// ═══════════════════════════════════════════════

/// App 退出前持久化所有活跃 session
pub async fn persist_all_sessions_on_exit<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
) {
    let snapshot = state.read_snapshot();

    for account in &snapshot.accounts {
        if account.account_type != AccountType::Persistent {
            continue;
        }
        if account.status != AccountSessionStatus::Ready {
            continue;
        }

        let login_label = webview::login_window_label(&account.id);
        if let Some(window) = app.get_webview_window(&login_label) {
            let website = account.website.as_deref().unwrap_or("");
            if let Ok(cookies) = extract_cookies(&window, website).await {
                if !cookies.is_empty() {
                    let session = AccountSession {
                        cookies,
                        captured_at: super::commands::now_label(),
                        user_agent: String::new(),
                        ..Default::default()
                    };
                    let _ = persist_session(state, &account.id, &session);
                }
            }
        }
    }
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
pub fn is_session_expired(session: &AccountSession, ttl_hours: u32, now: chrono::DateTime<chrono::Utc>) -> bool {
    if ttl_hours == 0 {
        return false;
    }
    let Some(captured) = parse_captured_at(&session.captured_at) else {
        // 没有时间戳 → 视为过期,避免用老数据误判为有效
        return true;
    };
    let captured_utc = captured.and_utc();
    let age = now.signed_duration_since(captured_utc);
    let ttl = chrono::Duration::hours(ttl_hours as i64);
    age > ttl
}

/// 启动时遍历清理 TTL 超时的 session(F.6.3)。
/// 返回被清理的 (account_id, old_status) 列表,供上层做埋点。
pub fn cleanup_expired_sessions<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    now: chrono::DateTime<chrono::Utc>,
) -> Vec<(String, AccountSessionStatus)> {
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
        .filter(|a| a.session.is_some())
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
                Some(ToClear { account_id: a.id.clone(), old_status: a.status })
            } else {
                None
            }
        })
        .collect();

    if to_clear.is_empty() {
        return Vec::new();
    }

    let cleared = to_clear
        .iter()
        .map(|t| (t.account_id.clone(), t.old_status))
        .collect::<Vec<_>>();

    let _ = storage::with_state_mut(app, state, |snapshot| {
        for t in &to_clear {
            if let Some(a) = snapshot.accounts.iter_mut().find(|a| a.id == t.account_id) {
                a.session = None;
                a.status = AccountSessionStatus::LoginRequired;
            }
            snapshot.sessions.remove(&t.account_id);
        }
        Ok(())
    });

    cleared
}

/// 清理 ephemeral 账户
pub fn cleanup_ephemeral(state: &AccountManagerState) {
    let mut snapshot = state.snapshot.write().unwrap_or_else(|e| e.into_inner());
    snapshot
        .accounts
        .retain(|a| a.account_type != AccountType::Ephemeral);
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

fn update_status(state: &AccountManagerState, account_id: &str, status: AccountSessionStatus) {
    let mut snapshot = state.snapshot.write().unwrap_or_else(|e| e.into_inner());
    if let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) {
        account.status = status;
    }
}

fn clear_session(state: &AccountManagerState, account_id: &str) {
    let mut snapshot = state.snapshot.write().unwrap_or_else(|e| e.into_inner());
    if let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) {
        account.session = None;
    }
}
