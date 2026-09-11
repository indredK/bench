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
//! 本模块补上缺失的那条路径：**加载该账号的 WebView 档案 → 捕获 → 加密写入
//! canonical store**。捕获复用 probe / keeper 的同一套实现。
//!
//! ## 语义（D-032 修订：无条件全量同步）
//!
//! 出向同步是用户的显式动作，且登录判定依赖规则包判据的完备性——对「登录态
//! 存于域级 cookie + localStorage」的站点（trae），cookie-only / 文本判据会把
//! 真实登录误判成未登录（实测：探针判 loginRequired 而登录窗口里明明是登录态）。
//! 因此本通道收敛为 **「S1 忠实镜像 S2 当前状态」**：捕获到什么就写什么，
//! 不做登录判定闸门；是否真的已登录由用户确认，probe / keeper 稍后用完整 S1
//! 走 loginCheck 自然得出正确状态。
//!
//! ## 纪律
//!
//! 1. 写入 canonical store 前一律过 [`super::session_arbitration::arbitrate`]，
//!    不存在绕过仲裁的静默覆盖。
//! 2. 捕获为空（cookie 与存储皆无，即档案里从没登录过）→ 不写入，
//!    返回 `noSessionData`。
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
    AccountSessionStatus, AccountType, SessionOrigin, TokenStorage,
};
use super::webview;

/// 页面加载预算（与 probe / keeper 的 15s 对齐）。
const LOAD_BUDGET: Duration = Duration::from_secs(15);

/// 首次 `Finished` 后再等重定向链 + SPA/登录页引导稳定的时长。
///
/// 站点会把登录页 www → apex 重新定向（trae.cn 实测，2026-09-11）：`Finished`
/// 在**重定向前的中间页**（www）上就触发，此时立刻采集会读到错误 origin 的
/// storage（`Cloud-IDE-Token` 等登录态 localStorage 落在 apex），请求的直接
/// 后果就是「cookie 在、token 不在 → 互通后仍未登录」。等一个稳定窗口让
/// 302/JS 重定向落定后再采，采集端才会站在最终 origin 上。
const SYNC_SETTLE: Duration = Duration::from_millis(1500);

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
    /// 无判定语义（同步不做登录判定，见模块文档），恒为 `Inactive`；
    /// 保留字段以稳定 DTO 形状。
    pub status: AccountSessionStatus,
    /// 未采到时的原因：`noSessionData` / `conflict`。
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
    proxy_url: Option<String>,
    requires_indexed_db: bool,
    persistent: bool,
}

/// 从该账号的 Bench WebView 档案补采登录态并写入 canonical store。
///
/// - 用户正开着该账号的登录窗口 → 直接在那个窗口采集（零额外加载，最贴近用户所见）；
/// - 否则建一个**隐藏**的一次性窗口加载站点，采集后立即关闭。
///
/// **无条件全量同步**（D-032）：不做登录判定闸门，捕获到什么就写什么；
/// 只有捕获为空（档案里从没登录过）才返回 `recovered = false`。
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
            proxy_url,
            requires_indexed_db: station
                .auth_profile
                .as_ref()
                .is_some_and(|profile| profile.token_storage == TokenStorage::IndexedDB),
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
    // 重定向前后的 origin 稳定窗口：见 [`SYNC_SETTLE`] 注释。只有 hidden 补采
    // 窗口需要（登录窗口是用户自己停靠的既定位置，采集直接以当前 origin 为准）。
    tokio::time::sleep(SYNC_SETTLE).await;
    Ok(window)
}

/// 把窗口中的账号档案**无条件全量同步**进 canonical store（仲裁后）。
///
/// ## 为什么不再做登录判定闸门（D-032）
///
/// 出向同步是用户的显式动作（「把当前登录态搬出去」），且「是否登录」的判定
/// 依赖规则包判据的完备性——对 trae 这类「登录态存于域级 cookie + localStorage」
/// 的站点，任何 cookie-only / 文本判据都可能把真实登录误判成未登录（2026-09-10
/// 实测：探针判 loginRequired 而登录窗口里明明是登录态，根因是 S1 历史残缺数据
/// 放大了判据缺陷）。因此本通道语义收敛为 **「S1 忠实镜像 S2 当前状态」**：
/// 捕获到什么就写什么，是否真的已登录由用户自己确认；探针/keeper 稍后用完整
/// S1 数据走 loginCheck 自然得出正确状态。
///
/// 捕获为空（cookie 与存储皆无，即档案里从没登录过）→ 不写入，返回
/// `noSessionData`。仲裁纪律不变：S1 已有更新会话时 `Conflict` 不覆盖。
async fn recover_from_window<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    account_id: &str,
    context: &SyncContext,
    window: &WebviewWindow<R>,
) -> AccountManagerResult<RecoveredSession> {
    let existing = session::restore_session(state, account_id)?;

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
                    status: AccountSessionStatus::Inactive,
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
                status: AccountSessionStatus::Inactive,
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
        // 刻意**不改账号状态**：同步是数据搬运，不是登录判定（见函数文档）；
        // probe / keeper 稍后用这份完整 S1 走 loginCheck 自然得出正确状态。
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
            status: AccountSessionStatus::Inactive,
            reason: None,
        },
        session: Some(session),
    })
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
}
