//! Bench 内置登录态 → canonical store 的补采通道（**账号档案回采**）。
//!
//! ## 为什么需要这条通道
//!
//! canonical store（`snapshot.sessions`）历史上只有四条写入路径：代理登录回调、
//! Session Keeper 保活、CDP 回采、扩展回采。**唯独「用户在 Bench 内置登录窗口里
//! 手动登录」这条最常见的路径不落盘** —— 登录态只留在账号专属的 WebView 档案
//! （`relay-accounts/<accountId>`）里。
//!
//! 后果是一个长期存在的错位：账号状态可以是 `Ready`（probe / keeper 读的就是
//! 那个 WebView 档案，因此判定为已登录），但 `snapshot.sessions` 是空的 —— 于是
//! 「浏览器互通 → 以该账号身份打开」只能报「该账号在 Bench 中还没有已保存的登录态，
//! 本次没有可注入的内容」，并让用户去浏览器里重新登录再回采。2026-09-10 实测
//! 18 个账号中 16 个处于这种「状态 Ready 但无会话」的错位。
//!
//! 本模块补上缺失的那条路径：**加载该账号的 WebView 档案 → 判定登录态 → 捕获 →
//! 加密写入 canonical store**。判定与捕获全部复用 probe / keeper 的实现，保证
//! 同一账号在三条路径下得到一致结论。
//!
//! ## 纪律
//!
//! 1. 写入 canonical store 前一律过 [`super::session_arbitration::arbitrate`]，
//!    不存在绕过仲裁的静默覆盖。
//! 2. 只有判定为 `Ready` 才捕获落盘；判定不通过时**不写入**任何数据，避免把
//!    匿名 cookie 固化成会话。
//! 3. 明文会话只在「WebView 进程 → Rust 内存 → 加密 store」之间流转，不进
//!    renderer、不进日志。

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::oneshot;
use tokio::time::Instant;

use super::probe;
use super::session;
use super::state::{push_account_log, AccountManagerState};
use super::storage;
use super::types::{
    AccountLogKind, AccountLogLevel, AccountManagerError, AccountManagerResult, AccountSession,
    AccountSessionStatus, AccountType, LoginDetectionConfig, LoginFingerprint, SessionOrigin,
    TokenStorage,
};
use super::webview;

/// 页面加载预算（与 probe / keeper 的 15s 对齐）。
const LOAD_BUDGET: Duration = Duration::from_secs(15);
/// 指纹轮询参数（与 keeper 一致：6 次 × 500ms）。
const FINGERPRINT_ATTEMPTS: usize = 6;
const FINGERPRINT_INTERVAL_MS: u64 = 500;

/// 补采窗口的 label（与 login / probe / keeper 三个 label 互斥）。
pub fn sync_window_label(account_id: &str) -> String {
    format!("relay-sync-{account_id}")
}

/// 补采结果（给前端的部分：只含计数与枚举，绝不含凭据）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewSyncOutcome {
    /// 是否成功从该账号的 Bench 档案里采到登录态并写入 canonical store。
    pub recovered: bool,
    pub cookie_count: usize,
    pub storage_origins: usize,
    /// 本次在 Bench 内置 WebView 中判定出的登录状态。
    pub status: AccountSessionStatus,
    /// 未采到时的原因：`notLoggedIn` / `noSessionData` / `conflict`。
    pub reason: Option<String>,
}

/// 补采产物。
pub struct RecoveredSession {
    /// 给前端的计数与原因（不含任何凭据）。
    pub outcome: WebviewSyncOutcome,
    /// 捕获到的会话，供本次注入直接消费。**仅 Rust 内部流转**，绝不序列化到前端。
    pub session: Option<AccountSession>,
}

/// 一次补采所需的站点上下文（从快照取值后立即释放快照锁）。
struct SyncContext {
    website: String,
    login_detection: LoginDetectionConfig,
    proxy_url: Option<String>,
    requires_indexed_db: bool,
    fingerprint: Option<LoginFingerprint>,
    persistent: bool,
}

/// 从该账号的 Bench WebView 档案补采登录态并写入 canonical store。
///
/// - 用户正开着该账号的登录窗口 → 直接在那个窗口采集（零额外加载，最贴近用户所见）；
/// - 否则建一个**隐藏**的一次性窗口加载站点，采集后立即关闭。
///
/// 只有判定为 `Ready` 才落盘；其余情况返回 `recovered = false` 与具体原因，
/// 由调用方向用户交代「为什么没有可注入的内容」。
pub async fn sync_from_account_profile<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    account_id: &str,
) -> AccountManagerResult<RecoveredSession> {
    let context = {
        let snapshot = state.read_snapshot_checked()?;
        let account = snapshot
            .accounts
            .iter()
            .find(|item| item.id == account_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
        let station = snapshot
            .stations
            .iter()
            .find(|item| item.id == account.station_id)
            .ok_or_else(|| {
                AccountManagerError::not_found(format!("station {}", account.station_id))
            })?;
        let proxy_url = super::commands::build_proxy_url_for_station(app, station)?;
        SyncContext {
            website: station.website.clone(),
            login_detection: station.login_detection.clone(),
            proxy_url,
            requires_indexed_db: station
                .auth_profile
                .as_ref()
                .is_some_and(|profile| profile.token_storage == TokenStorage::IndexedDB),
            fingerprint: snapshot.fingerprints.get(&station.id).cloned(),
            persistent: account.account_type == AccountType::Persistent,
        }
    };

    // 登录窗口开着 → 直接采它，不另开窗口（避免两个上下文争抢同一份档案）。
    if let Some(window) = app.get_webview_window(&webview::login_window_label(account_id)) {
        return recover_from_window(app, state, account_id, &context, &window).await;
    }

    let window = build_sync_window(app, account_id, &context).await?;
    let result = recover_from_window(app, state, account_id, &context, &window).await;
    let _ = window.close();
    result
}

/// 建一个隐藏的一次性 WebView，加载站点首页并等待加载完成。
///
/// 结构与 `session_keeper` 的 keeper 窗口一致（同 data_directory + 同
/// `data_store_identifier`），因此读到的就是「Bench 里这个账号的登录态」。
async fn build_sync_window<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    context: &SyncContext,
) -> AccountManagerResult<WebviewWindow<R>> {
    if context.proxy_url.is_some() && !super::capabilities::network_proxy_available() {
        return Err(AccountManagerError::invalid_input(
            "proxyUnsupported: station proxy is not available on this platform",
        ));
    }

    let label = sync_window_label(account_id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.close();
    }

    let target: tauri::Url = context
        .website
        .parse()
        .map_err(|e| AccountManagerError::invalid_input(format!("website url: {e}")))?;
    let blank: tauri::Url = "about:blank"
        .parse()
        .map_err(|e| AccountManagerError::invalid_input(format!("blank url: {e}")))?;
    let data_dir = webview::account_data_dir(app, account_id)?;
    if let Some(parent) = data_dir.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AccountManagerError::store_fail(format!("create relay-accounts: {e}")))?;
    }

    let (tx, rx) = oneshot::channel::<()>();
    let slot: Arc<Mutex<Option<oneshot::Sender<()>>>> = Arc::new(Mutex::new(Some(tx)));
    let window = {
        #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(unused_mut))]
        let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(blank))
            .visible(false)
            .data_directory(data_dir)
            .initialization_script(probe::init_script())
            .on_page_load(move |_, payload| {
                if !matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                    return;
                }
                if payload.url().scheme() == "about" {
                    return;
                }
                if let Ok(mut guard) = slot.lock() {
                    if let Some(sender) = guard.take() {
                        let _ = sender.send(());
                    }
                }
            });
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        {
            builder =
                builder.data_store_identifier(webview::account_data_store_identifier(account_id));
        }
        if let Some(url) = context.proxy_url.as_deref() {
            #[cfg(target_os = "macos")]
            {
                let parsed_url = url.parse::<tauri::Url>().map_err(|e| {
                    AccountManagerError::invalid_input(format!("invalid network proxy URL: {e}"))
                })?;
                builder = builder.proxy_url(parsed_url);
            }
        }
        builder
            .build()
            .map_err(|e| AccountManagerError::store_fail(format!("build sync window: {e}")))?
    };

    window
        .navigate(target)
        .map_err(|e| AccountManagerError::store_fail(format!("navigate sync window: {e}")))?;
    // 加载超时不视为致命：SPA 可能长时间不触发 Finished，仍继续判定。
    let _ = tokio::time::timeout_at(Instant::now() + LOAD_BUDGET, rx).await;
    Ok(window)
}

/// 判定窗口中的登录态，并在 `Ready` 时捕获、仲裁、加密落盘。
async fn recover_from_window<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    account_id: &str,
    context: &SyncContext,
    window: &WebviewWindow<R>,
) -> AccountManagerResult<RecoveredSession> {
    let existing = session::restore_session(state, account_id)?;
    let status = classify_login_state(app, context, window).await?;

    if status != AccountSessionStatus::Ready {
        return Ok(RecoveredSession {
            outcome: WebviewSyncOutcome {
                recovered: false,
                cookie_count: 0,
                storage_origins: 0,
                status,
                reason: Some(failure_reason(status).to_string()),
            },
            session: existing,
        });
    }

    let captured = match session::capture_session_from_window(
        window,
        state,
        account_id,
        &context.website,
        context.requires_indexed_db,
    )
    .await
    {
        Ok(session) => session,
        Err(error) => {
            eprintln!("[account_manager] webview sync capture failed for {account_id}: {error}");
            return Ok(RecoveredSession {
                outcome: WebviewSyncOutcome {
                    recovered: false,
                    cookie_count: 0,
                    storage_origins: 0,
                    status,
                    reason: Some("noSessionData".to_string()),
                },
                session: existing,
            });
        }
    };

    let captured_ts = captured
        .captured_at_ts
        .unwrap_or_else(|| chrono::Utc::now().timestamp());
    if let super::session_arbitration::Arbitration::Conflict { .. } =
        super::session_arbitration::arbitrate(existing.as_ref(), captured_ts, false)
    {
        return Ok(RecoveredSession {
            outcome: WebviewSyncOutcome {
                recovered: false,
                cookie_count: captured.cookies.len(),
                storage_origins: captured.origins.len(),
                status,
                reason: Some("conflict".to_string()),
            },
            session: existing,
        });
    }

    let mut session = captured;
    session.session_origin = Some(SessionOrigin::WebviewLogin);
    session.origin_detail = Some("bench-webview".to_string());
    let cookie_count = session.cookies.len();
    let storage_origins = session.origins.len();
    let encrypted = if context.persistent {
        Some(session::encrypt_session(state, &session)?)
    } else {
        None
    };

    storage::with_state_mut(app, state, |snapshot| {
        let Some(account) = snapshot
            .accounts
            .iter_mut()
            .find(|item| item.id == account_id)
        else {
            return Err(AccountManagerError::not_found(format!(
                "account {account_id}"
            )));
        };
        // 捕获与判定都在 Bench 内置 WebView 里完成（等价于一次 webview 层探测），
        // 因此这里直接采信判定结果，无需再开 probe 窗口二次验证。
        account.status = status;
        account.status_reason = None;
        let now = super::commands::now_label();
        account.last_login_at = Some(now.clone());
        account.last_refreshed_at = Some(now.clone());
        if account.first_login_at.is_none() {
            account.first_login_at = Some(now);
        }
        if let Some(blob) = encrypted {
            snapshot.sessions.insert(account_id.to_string(), blob);
        }
        push_account_log(
            snapshot,
            account_id,
            AccountLogKind::Login,
            AccountLogLevel::Info,
            Some(json!({
                "source": "benchWebviewSync",
                "probeLayer": "webview",
                "captureStatus": "captured",
                "cookieCount": cookie_count,
                "storageOrigins": storage_origins,
            })),
        );
        Ok(())
    })?;

    super::proxy::protocol::audit_log(
        "bench_webview_session_synced",
        &[
            ("account", account_id),
            ("cookies", &cookie_count.to_string()),
            ("storage_origins", &storage_origins.to_string()),
        ],
    );

    Ok(RecoveredSession {
        outcome: WebviewSyncOutcome {
            recovered: true,
            cookie_count,
            storage_origins,
            status,
            reason: None,
        },
        session: Some(session),
    })
}

/// 判定窗口中的登录态（与 keeper 同一套证据链）。
///
/// - 站点已采样指纹 → 全部特征缺失是**确定性未登录**，直接短路；
/// - 否则走文本/规则包分类（超时回退 `classify_effective` 的确定值）；
/// - 分类无结论（页面无响应）→ `FetchFailed`，**不**退化为「cookie 非空」——
///   那会把匿名 cookie 固化成会话。
async fn classify_login_state<R: Runtime>(
    app: &AppHandle<R>,
    context: &SyncContext,
    window: &WebviewWindow<R>,
) -> AccountManagerResult<AccountSessionStatus> {
    if let Some(fingerprint) = context.fingerprint.as_ref().filter(|fp| !fp.is_empty()) {
        if !super::fingerprint::wait_for_any_feature_present(
            window,
            &context.website,
            fingerprint,
            FINGERPRINT_ATTEMPTS,
            FINGERPRINT_INTERVAL_MS,
        )
        .await?
        {
            return Ok(AccountSessionStatus::LoginRequired);
        }
    }

    let rule = crate::account_manager::login_rules::resolve(app, &context.website).await;
    Ok(probe::poll_effective_classification(
        &context.login_detection,
        rule.as_ref().map(|resolved| &resolved.doc),
        window,
    )
    .await
    .unwrap_or(AccountSessionStatus::FetchFailed))
}

/// 判定失败时给前端的原因枚举。
fn failure_reason(status: AccountSessionStatus) -> &'static str {
    match status {
        AccountSessionStatus::Ready => "notLoggedIn",
        AccountSessionStatus::FetchFailed => "noSessionData",
        _ => "notLoggedIn",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_window_label_is_namespaced() {
        assert_eq!(sync_window_label("acct-1"), "relay-sync-acct-1");
        // 必须与 login / probe / keeper 三个 label 区分，否则会抢同一份档案。
        assert_ne!(
            sync_window_label("acct-1"),
            webview::login_window_label("acct-1")
        );
        assert_ne!(
            sync_window_label("acct-1"),
            super::super::session_keeper::keeper_window_label("acct-1")
        );
    }

    #[test]
    fn failure_reason_maps_status_to_stable_code() {
        assert_eq!(
            failure_reason(AccountSessionStatus::LoginRequired),
            "notLoggedIn"
        );
        assert_eq!(failure_reason(AccountSessionStatus::Expired), "notLoggedIn");
        assert_eq!(
            failure_reason(AccountSessionStatus::Inactive),
            "notLoggedIn"
        );
        // 页面无响应 ≠ 未登录：区分开，便于前端给不同提示。
        assert_eq!(
            failure_reason(AccountSessionStatus::FetchFailed),
            "noSessionData"
        );
    }
}
