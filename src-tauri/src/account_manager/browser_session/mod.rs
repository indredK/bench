//! 账号 ↔ 浏览器双向互通编排（I1 出向 / I2 入向）。
//!
//! 把「浏览器」作为与 Bench 内部 WebView 并列的**第二个 Session 端点**：
//!
//! - **出向（I1）**：解密 canonical session → 以账号专属 profile 启动独立
//!   Chromium 实例 → CDP `Network.setCookie` 逐条注入 + 注册 localStorage /
//!   sessionStorage / IndexedDB 恢复脚本（复用 `browser_storage`，与 WebView 侧同源）
//!   → 设置 UA → 导航到站点。
//! - **入向（I2）**：连接同一实例 → `Network.getAllCookies` + `Runtime.evaluate`
//!   采集 storage/UA → 新鲜度仲裁 → 加密写回 canonical session → probe 验证。
//!
//! 安全边界（design.md §3/§5/§7）：
//!
//! 1. 明文会话只在 `加密 store → Rust 内存 → loopback CDP → 浏览器进程` 之间流转，
//!    **不进入 renderer / 前端 store / 事件 / 日志**。
//! 2. CDP WebSocket 地址必须是 loopback（见 [`cdp::validate_ws_url`]）。
//! 3. 每账号独立 profile 目录，禁止跨账号复用浏览上下文。
//! 4. 回采必须「用户显式触发 + 新鲜度仲裁 + probe 验证」三条件齐备；物化视图
//!    中的登录态**不构成** Ready 依据。
//! 5. partitioned cookie 沿用 fail-closed：跳过并计数，不降级为普通 cookie。

pub mod browser;
pub mod cdp;
pub mod profile;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};

use super::browser_storage;
use super::session::{self, cookie_domain_matches_target};
use super::state::{push_account_log, AccountManagerState};
use super::storage;
use super::types::{
    AccountLogKind, AccountLogLevel, AccountManagerError, AccountManagerResult, AccountSession,
    AccountSessionStatus, CookieEntry, RelayStation, SessionOrigin,
};
use crate::account_manager::commands::now_label;
use cdp::CdpClient;
use profile::SessionMeta;

/// 冷启动后等待页面就绪的最长时间。
const PAGE_READY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);
const PAGE_READY_POLL: std::time::Duration = std::time::Duration::from_millis(150);
/// 页面就绪后额外等待时间，让 SPA 完成首屏异步初始化后再采集 storage。
const PAGE_SETTLE: std::time::Duration = std::time::Duration::from_millis(900);

// ═══════════════════════════════════════════════
// 返回给前端的 DTO（一律只含计数与枚举，不含凭据 / URL query）
// ═══════════════════════════════════════════════

/// 出向结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserOpenOutcome {
    pub browser_id: String,
    pub reused_instance: bool,
    pub injected_cookies: usize,
    pub skipped_partitioned: usize,
    /// 浏览器拒绝写入的 cookie 数（属性不合法，如 sameSite=None 且非 secure）。
    pub rejected_cookies: usize,
    /// 本次是否**真的**把账号会话写进了该实例。
    /// 登录模式（`inject_session = false`）为 false；注入模式下若 Bench 没有该账号的
    /// 已保存会话，同样为 false —— 调用方不应把这种情况当成成功。
    pub session_injected: bool,
    /// Bench 中是否存在该账号的已保存会话。
    /// false 表示「此账号还没在 Bench 里登录过」，前端应引导用户先登录，而不是提示已注入 0 条。
    pub has_stored_session: bool,
    /// 实际恢复了 Web Storage / IndexedDB 的 origin 份数（0 = 该会话没有存储快照）。
    pub storage_origins: usize,
}

/// 运行状态。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserStatusOutcome {
    pub running: bool,
    pub browser_id: Option<String>,
    pub port: Option<u16>,
}

/// 入向结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserCaptureOutcome {
    /// `saved`（已写入）| `conflict`（Bench 已有更新的会话，等待用户确认）| `empty`（未采到会话）。
    pub outcome: String,
    pub cookie_count: usize,
    pub skipped_partitioned: usize,
    pub storage_origins: usize,
    pub indexed_db_status: String,
    pub captured_at_ts: i64,
    /// 冲突时 Bench 侧已有会话的采集时间与来源。
    pub existing_captured_at_ts: Option<i64>,
    pub existing_origin: Option<String>,
    /// 写入后 probe 的验证结果。
    pub verified: Option<bool>,
}

/// 登录态预检结果（不写入任何数据）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserProbeOutcome {
    pub running: bool,
    pub cookie_count: usize,
    /// 命中的站点指纹特征数（站点未采样指纹时为 None）。
    pub fingerprint_hits: Option<usize>,
    pub fingerprint_total: Option<usize>,
}

// ═══════════════════════════════════════════════
// 内部：账号 / 站点解析
// ═══════════════════════════════════════════════

struct AccountContext {
    station: RelayStation,
}

fn load_context(
    state: &AccountManagerState,
    account_id: &str,
) -> AccountManagerResult<AccountContext> {
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
        .cloned()
        .ok_or_else(|| AccountManagerError::not_found(format!("station {}", account.station_id)))?;
    Ok(AccountContext { station })
}

fn station_origin(station: &RelayStation) -> AccountManagerResult<String> {
    let parsed = url::Url::parse(&station.website)
        .map_err(|e| AccountManagerError::invalid_input(format!("station website: {e}")))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AccountManagerError::invalid_input(
            "station website must be http(s)",
        ));
    }
    Ok(parsed.origin().ascii_serialization())
}

// ═══════════════════════════════════════════════
// 出向：打开浏览器并（可选）注入会话
// ═══════════════════════════════════════════════

/// 连接指定账号的浏览器实例；未运行时返回 `None`。
async fn connect_running<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
) -> AccountManagerResult<Option<(CdpClient, u16)>> {
    let Some(port) = profile::resolve_running_port(app, account_id).await else {
        return Ok(None);
    };
    let ws_url = cdp::browser_ws_url(port)
        .await
        .map_err(AccountManagerError::store_fail)?;
    let client = CdpClient::connect(&ws_url)
        .await
        .map_err(AccountManagerError::store_fail)?;
    Ok(Some((client, port)))
}

/// 打开（或复用）该账号的托管浏览器实例。
///
/// - `inject_session = true`：注入 canonical session 后导航（「以该账号身份浏览」）。
/// - `inject_session = false`：只打开站点首页，供用户在真实浏览器中登录（入向前置）。
/// - `reset_profile = true`：先关闭实例并清空 profile，保证干净起点。
pub async fn open<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    browser_id: Option<String>,
    inject_session: bool,
    reset_profile: bool,
) -> AccountManagerResult<BrowserOpenOutcome> {
    let state = app.state::<AccountManagerState>();
    state.ensure_ready()?;
    let context = load_context(&state, account_id)?;
    let website = context.station.website.clone();
    let origin = station_origin(&context.station)?;

    // 登录窗口打开中 → 拒绝，避免同一账号出现两个活跃浏览上下文。
    let login_label = super::webview::login_window_label(account_id);
    if app.get_webview_window(&login_label).is_some() {
        return Err(AccountManagerError::invalid_input(
            "LOGIN_WINDOW_OPEN: close the Bench login window before opening a browser session",
        ));
    }

    profile::reap_finished(account_id);

    if reset_profile {
        close(app, account_id).await;
        profile::remove_profile_dir(app, account_id).map_err(AccountManagerError::store_fail)?;
    }

    let user_data_dir =
        profile::user_data_dir(app, account_id).map_err(AccountManagerError::store_fail)?;
    let mut reused = false;

    // 已运行 → 复用实例（只重新注入 + 导航）。
    if profile::resolve_running_port(app, account_id)
        .await
        .is_some()
    {
        reused = true;
    } else {
        let installation = browser::find(browser_id.as_deref()).ok_or_else(|| {
            AccountManagerError::invalid_input(
                "NO_CHROMIUM_BROWSER: no supported browser installed",
            )
        })?;
        profile::clear_devtools_port(&user_data_dir);
        let pid = profile::spawn_browser(account_id, &installation, &user_data_dir, "about:blank")
            .map_err(AccountManagerError::store_fail)?;
        profile::write_meta(
            app,
            account_id,
            &SessionMeta {
                browser_id: installation.id.clone(),
                pid,
                opened_at_ts: chrono::Utc::now().timestamp(),
            },
        )
        .map_err(AccountManagerError::store_fail)?;
        let _ = profile::wait_for_devtools_port(&user_data_dir)
            .await
            .map_err(AccountManagerError::store_fail)?;
    }

    let Some((mut client, _port)) = connect_running(app, account_id).await? else {
        return Err(AccountManagerError::store_fail(
            "BROWSER_INSTANCE_UNAVAILABLE",
        ));
    };
    // 新实例复用启动时的空白页；复用实例则附着到已有页面。
    client
        .attach_page()
        .await
        .map_err(AccountManagerError::store_fail)?;

    let mut injected = 0;
    let mut skipped_partitioned = 0;
    let mut rejected = 0;
    let mut storage_origins = 0;
    // localStorage / sessionStorage / IndexedDB 恢复脚本必须在导航**之前**注册，
    // 才能在页面脚本首次读取存储前跑完（与 WebView 的 initialization_script 同语义）。
    // 缺这一步时，token 存 localStorage 的 SPA 站点即使 cookie 注入成功也仍是未登录态。
    // 注：Web Storage 部分同步完成；IndexedDB 恢复本身是异步的，页面可能先于其就绪，
    // 属该方案的已知时序边界。
    let mut restore_script_id: Option<String> = None;

    let saved = if inject_session {
        session::restore_session(&state, account_id)?
    } else {
        None
    };
    let has_stored_session = saved.is_some();

    if let Some(saved) = saved.as_ref() {
        injected = inject_cookies(&client, saved, &origin).await?;
        skipped_partitioned = count_partitioned(saved);
        rejected = saved
            .cookies
            .len()
            .saturating_sub(injected + skipped_partitioned);
        // UA 覆盖只在「同引擎」时进行：把 WebView 的 Safari 系 UA 覆盖到 Chromium
        // 上会让站点把请求判成新客户端，反而作废会话。
        if should_override_user_agent(saved) {
            client
                .set_user_agent(&saved.user_agent)
                .await
                .map_err(AccountManagerError::store_fail)?;
        }
        // 复用 WebView 侧同一份恢复脚本（自包含 IIFE，不依赖任何桥），
        // 保证两条注入链路对同一站点给出一致的存储恢复结果。
        if let Some(script) = browser_storage::restore_initialization_script(&state, saved)? {
            storage_origins = saved.origins.len();
            restore_script_id = client
                .add_init_script(&script)
                .await
                .map_err(AccountManagerError::store_fail)?;
        }
    }

    client
        .navigate(&website)
        .await
        .map_err(AccountManagerError::store_fail)?;

    // 恢复脚本只服务本次导航；立即注销，避免复用实例上重复累积。
    if let Some(identifier) = restore_script_id.as_deref() {
        let _ = client.remove_init_script(identifier).await;
    }

    let browser_id = profile::read_meta(app, account_id)
        .map(|meta| meta.browser_id)
        .unwrap_or_else(|| "unknown".to_string());

    super::proxy::protocol::audit_log(
        "browser_session_opened",
        &[
            ("account", account_id),
            ("injected", &injected.to_string()),
            ("skipped_partitioned", &skipped_partitioned.to_string()),
            ("rejected", &rejected.to_string()),
            ("storage_origins", &storage_origins.to_string()),
            ("has_session", &has_stored_session.to_string()),
            ("reused", &reused.to_string()),
        ],
    );

    Ok(BrowserOpenOutcome {
        browser_id,
        reused_instance: reused,
        injected_cookies: injected,
        skipped_partitioned,
        rejected_cookies: rejected,
        // 只有「本次请求注入 + 确实存在会话」才算注入成功；
        // 否则 0 条注入会被 UI 误报为成功。
        session_injected: inject_session && has_stored_session,
        has_stored_session,
        storage_origins,
    })
}

/// 是否应把会话里记录的 UA 覆盖到托管浏览器上。
///
/// 覆盖 UA 的**目的**是让站点看到与服务端签发会话时一致的 UA。但 Bench 的登录窗口在
/// macOS 上是 WKWebView（Safari 系 UA），托管浏览器是 Chromium 系——跨引擎覆盖等于把
/// Chrome 伪装成 Safari，站点若对 UA 做绑定/分流，反而会把这请求判成新客户端而丢掉会话。
///
/// 因此只在「会话本身采自浏览器（`BrowserCdp`）」且 UA 确实是 Chromium 系时才覆盖，
/// 其余情况一律保留浏览器原生 UA。
fn should_override_user_agent(saved: &AccountSession) -> bool {
    if saved.session_origin != Some(SessionOrigin::BrowserCdp) {
        return false;
    }
    let user_agent = saved.user_agent.to_ascii_lowercase();
    user_agent.contains("chrome/")
        || user_agent.contains("chromium/")
        || user_agent.contains("edg/")
}

/// 向该实例注入 canonical session 的 cookie（partitioned 跳过）。
async fn inject_cookies(
    client: &CdpClient,
    saved: &AccountSession,
    origin: &str,
) -> AccountManagerResult<usize> {
    let mut injected = 0;
    for entry in &saved.cookies {
        if entry.partitioned {
            // fail-closed：不把 partition 作用域的 cookie 降级为普通 cookie。
            continue;
        }
        let params = cookie_injection_params(entry, origin);
        match client.set_cookie(params).await {
            Ok(true) => injected += 1,
            // 浏览器拒绝（属性不合法）不计入成功，也不中断其余 cookie 注入。
            Ok(false) => {}
            Err(error) => {
                // 连接级错误才中止；`CDP_ERROR` 视为单条失败。
                if !error.starts_with("CDP_ERROR") {
                    return Err(AccountManagerError::store_fail(error));
                }
            }
        }
    }
    Ok(injected)
}

fn count_partitioned(saved: &AccountSession) -> usize {
    saved
        .cookies
        .iter()
        .filter(|entry| entry.partitioned)
        .count()
}

/// 把 canonical cookie 映射为 `Network.setCookie` 参数。
///
/// host-only cookie 走 `url`（由浏览器绑定到该 host），域级 cookie 走 `domain` + `path`，
/// 两者的作用域语义与捕获时一致。
fn cookie_injection_params(entry: &CookieEntry, origin: &str) -> Value {
    let mut params = json!({
        "name": entry.name,
        "value": entry.value,
        "path": if entry.path.is_empty() { "/" } else { entry.path.as_str() },
        "httpOnly": entry.http_only,
        "secure": entry.secure,
    });
    if entry.host_only || entry.domain.trim().is_empty() {
        params["url"] = Value::String(origin.to_string());
    } else {
        params["domain"] = Value::String(entry.domain.clone());
    }
    if let Some(same_site) = entry.same_site.as_deref().and_then(normalize_same_site) {
        params["sameSite"] = Value::String(same_site.to_string());
    }
    if let Some(expires) = entry.expires_at_ts {
        params["expires"] = json!(expires);
    }
    params
}

/// CDP 的 `sameSite` 只接受 `Strict` / `Lax` / `None`（首字母大写）。
fn normalize_same_site(raw: &str) -> Option<&'static str> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "strict" => Some("Strict"),
        "lax" => Some("Lax"),
        "none" => Some("None"),
        _ => None,
    }
}

// ═══════════════════════════════════════════════
// 状态查询与关闭
// ═══════════════════════════════════════════════

/// 查询该账号的浏览器实例是否在运行。
pub async fn status<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
) -> AccountManagerResult<BrowserStatusOutcome> {
    profile::reap_finished(account_id);
    let port = profile::resolve_running_port(app, account_id).await;
    Ok(BrowserStatusOutcome {
        running: port.is_some(),
        browser_id: profile::read_meta(app, account_id).map(|meta| meta.browser_id),
        port,
    })
}

/// 关闭该账号的浏览器实例。
///
/// 先经 CDP `Browser.close` 优雅退出（会冲刷 profile），失败再退回进程终止。
/// Bench 重启后启动的实例不在进程表内，此时只能依赖 CDP。
pub async fn close<R: Runtime>(app: &AppHandle<R>, account_id: &str) -> bool {
    let mut closed = false;
    if let Ok(Some((client, port))) = connect_running(app, account_id).await {
        if client.close_browser().await.is_ok() {
            // 等待端口释放，给 profile 冲刷留时间。
            for _ in 0..20 {
                if !profile::is_port_alive(port).await {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            }
            closed = true;
        }
    }
    if profile::kill_tracked(account_id) {
        closed = true;
    }
    if closed {
        profile::clear_meta(app, account_id);
        super::proxy::protocol::audit_log("browser_session_closed", &[("account", account_id)]);
    }
    closed
}

// ═══════════════════════════════════════════════
// 入向：回采
// ═══════════════════════════════════════════════

/// 从托管浏览器实例回采会话。`force = false` 时，若 Bench 已有更新的会话则返回冲突。
pub async fn capture<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    force: bool,
) -> AccountManagerResult<BrowserCaptureOutcome> {
    let state = app.state::<AccountManagerState>();
    state.ensure_ready()?;
    let context = load_context(&state, account_id)?;
    let origin = station_origin(&context.station)?;
    let website = context.station.website.clone();

    let Some((mut client, _port)) = connect_running(app, account_id).await? else {
        return Err(AccountManagerError::invalid_input(
            "BROWSER_NOT_RUNNING: open the browser session before capturing",
        ));
    };
    client
        .attach_page()
        .await
        .map_err(AccountManagerError::store_fail)?;

    // 1. cookie：浏览器级全量 → 按站点可注册域过滤（不采集第三方 / 追踪 cookie）。
    let host = url::Url::parse(&website)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .ok_or_else(|| AccountManagerError::invalid_input("station website has no host"))?;
    let raw_cookies = client
        .all_cookies()
        .await
        .map_err(AccountManagerError::store_fail)?;
    let mut cookies = Vec::new();
    let mut skipped_partitioned = 0;
    for raw in &raw_cookies {
        let Some(entry) = cookie_from_cdp(raw) else {
            continue;
        };
        if !cookie_domain_matches_target(Some(entry.domain.as_str()), &host) {
            continue;
        }
        if entry.partitioned {
            skipped_partitioned += 1;
            continue;
        }
        cookies.push(entry);
    }

    // 2. storage：确保页面在站点 origin 上再采集（复用与 WebView 同一份脚本与上限）。
    ensure_page_on_origin(&client, &origin, &website).await?;
    let mut storage_origins = 0usize;
    let mut indexed_db_status = "unsupported".to_string();
    let captured_origin = capture_origin_via_cdp(&client, &state, &origin).await?;

    let user_agent = client
        .evaluate("navigator.userAgent")
        .await
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_default();

    let mut session = build_session_with_ua(cookies, user_agent);
    if let Some(captured) = captured_origin {
        storage_origins = 1;
        indexed_db_status = match captured.indexed_db_status {
            super::browser_storage::IndexedDbCaptureStatus::Complete => "complete",
            super::browser_storage::IndexedDbCaptureStatus::Unsupported => "unsupported",
            super::browser_storage::IndexedDbCaptureStatus::Limited => "limited",
            super::browser_storage::IndexedDbCaptureStatus::Failed => "failed",
        }
        .to_string();
        if captured.has_data {
            super::browser_storage::merge_origin(&mut session, captured.storage);
        }
    }
    let cookie_count = session.cookies.len();

    finalize_capture(
        app,
        &state,
        account_id,
        &context.station,
        session,
        cookie_count,
        skipped_partitioned,
        storage_origins,
        indexed_db_status,
        force,
    )
    .await
}

fn build_session_with_ua(cookies: Vec<CookieEntry>, user_agent: String) -> AccountSession {
    AccountSession {
        cookies,
        user_agent,
        captured_at: now_label(),
        captured_at_ts: Some(chrono::Utc::now().timestamp()),
        session_origin: Some(SessionOrigin::BrowserCdp),
        origin_detail: Some("cdp".to_string()),
        ..Default::default()
    }
}

/// 回采结果落盘：新鲜度仲裁 → 加密写入 → 互斥 → probe 验证。
#[allow(clippy::too_many_arguments)]
async fn finalize_capture<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    account_id: &str,
    station: &RelayStation,
    session: AccountSession,
    cookie_count: usize,
    skipped_partitioned: usize,
    storage_origins: usize,
    indexed_db_status: String,
    force: bool,
) -> AccountManagerResult<BrowserCaptureOutcome> {
    let captured_at_ts = session
        .captured_at_ts
        .unwrap_or_else(|| chrono::Utc::now().timestamp());

    if cookie_count == 0 && storage_origins == 0 {
        return Ok(BrowserCaptureOutcome {
            outcome: "empty".to_string(),
            cookie_count,
            skipped_partitioned,
            storage_origins,
            indexed_db_status,
            captured_at_ts,
            existing_captured_at_ts: None,
            existing_origin: None,
            verified: None,
        });
    }

    // 新鲜度仲裁：不允许用更旧的浏览态静默覆盖更新的 canonical 会话。
    let existing = session::restore_session(state, account_id)?;
    let verdict = super::session_arbitration::arbitrate(existing.as_ref(), captured_at_ts, force);
    if let super::session_arbitration::Arbitration::Conflict {
        existing_captured_at_ts,
        existing_origin,
    } = verdict
    {
        return Ok(BrowserCaptureOutcome {
            outcome: "conflict".to_string(),
            cookie_count,
            skipped_partitioned,
            storage_origins,
            indexed_db_status,
            captured_at_ts,
            existing_captured_at_ts: Some(existing_captured_at_ts),
            existing_origin,
            verified: None,
        });
    }

    // 互斥：把「以该账号身份登录」的语义与登录窗口对齐（exclusive/rotating 站点）。
    super::exclusivity::enforce_exclusivity_before_login(app, station, account_id)?;

    let account_type = state
        .read_snapshot_checked()?
        .accounts
        .iter()
        .find(|item| item.id == account_id)
        .map(|item| item.account_type)
        .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;

    let encrypted = if account_type == super::types::AccountType::Persistent {
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
        // 捕获 ≠ 已验证：必须由 probe 决定是否 Ready（design.md §3）。
        account.status = AccountSessionStatus::Inactive;
        let now = now_label();
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
                "source": "browserCapture",
                "probeLayer": "http",
                "captureStatus": "captured",
            })),
        );
        Ok(())
    })?;

    super::proxy::protocol::audit_log(
        "browser_session_captured",
        &[
            ("account", account_id),
            ("cookies", &cookie_count.to_string()),
            ("storage_origins", &storage_origins.to_string()),
        ],
    );

    // probe 验证：只有探针确认后才可能进 Ready。
    let verified = match crate::account_manager::commands::refresh_one_impl(
        app.clone(),
        account_id.to_string(),
    )
    .await
    {
        Ok(account) => account.status == AccountSessionStatus::Ready,
        Err(_) => false,
    };

    Ok(BrowserCaptureOutcome {
        outcome: "saved".to_string(),
        cookie_count,
        skipped_partitioned,
        storage_origins,
        indexed_db_status,
        captured_at_ts,
        existing_captured_at_ts: None,
        existing_origin: None,
        verified: Some(verified),
    })
}

/// 登录态预检：只读 cookie，判断「浏览器里是否已登录」，不写入任何数据。
pub async fn probe<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
) -> AccountManagerResult<BrowserProbeOutcome> {
    let state = app.state::<AccountManagerState>();
    let context = load_context(&state, account_id)?;
    let website = context.station.website.clone();
    let host = url::Url::parse(&website)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .ok_or_else(|| AccountManagerError::invalid_input("station website has no host"))?;

    let Some((mut client, _port)) = connect_running(app, account_id).await? else {
        return Ok(BrowserProbeOutcome {
            running: false,
            cookie_count: 0,
            fingerprint_hits: None,
            fingerprint_total: None,
        });
    };
    client
        .attach_page()
        .await
        .map_err(AccountManagerError::store_fail)?;
    let raw_cookies = client
        .all_cookies()
        .await
        .map_err(AccountManagerError::store_fail)?;
    let names: Vec<String> = raw_cookies
        .iter()
        .filter_map(cookie_from_cdp)
        .filter(|entry| cookie_domain_matches_target(Some(entry.domain.as_str()), &host))
        .map(|entry| entry.name)
        .collect();

    let fingerprint = state
        .read_snapshot_checked()?
        .fingerprints
        .get(&context.station.id)
        .cloned();
    let (hits, total) = match fingerprint {
        Some(fingerprint) if !fingerprint.cookie_features.is_empty() => {
            let total = fingerprint.cookie_features.len();
            let hits = fingerprint
                .cookie_features
                .iter()
                .filter(|feature| names.iter().any(|name| name == &feature.name))
                .count();
            (Some(hits), Some(total))
        }
        _ => (None, None),
    };

    Ok(BrowserProbeOutcome {
        running: true,
        cookie_count: names.len(),
        fingerprint_hits: hits,
        fingerprint_total: total,
    })
}

// ═══════════════════════════════════════════════
// CDP ↔ 领域类型映射
// ═══════════════════════════════════════════════

/// 把 CDP `Network.Cookie` 映射为 [`CookieEntry`]。
///
/// `domain` 带前导点表示域级 cookie，否则为 host-only —— 与 RFC 6265 及 Chrome
/// 的实际行为一致，也保证了回采 → 注入的往返语义不变。
fn cookie_from_cdp(raw: &Value) -> Option<CookieEntry> {
    let name = raw.get("name").and_then(Value::as_str)?.to_string();
    let value = raw
        .get("value")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let domain = raw
        .get("domain")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if domain.is_empty() {
        return None;
    }
    let host_only = !domain.starts_with('.');
    let expires_at_ts = {
        let session_cookie = raw.get("session").and_then(Value::as_bool).unwrap_or(false);
        let expires = raw.get("expires").and_then(Value::as_f64).unwrap_or(-1.0);
        if session_cookie || expires <= 0.0 {
            None
        } else {
            Some(expires as i64)
        }
    };
    Some(CookieEntry {
        name,
        value,
        domain,
        host_only,
        path: raw
            .get("path")
            .and_then(Value::as_str)
            .unwrap_or("/")
            .to_string(),
        http_only: raw
            .get("httpOnly")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        secure: raw.get("secure").and_then(Value::as_bool).unwrap_or(false),
        same_site: raw
            .get("sameSite")
            .and_then(Value::as_str)
            .map(|value| value.to_ascii_lowercase()),
        partitioned: raw.get("partitionKey").is_some_and(|key| !key.is_null()),
        expires: expires_at_ts
            .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
            .map(|dt| dt.to_rfc3339()),
        expires_at_ts,
    })
}

// ═══════════════════════════════════════════════
// 页面就绪与 storage 采集（复用 WebView 侧脚本）
// ═══════════════════════════════════════════════

fn origin_of(raw_url: &str) -> Option<String> {
    let parsed = url::Url::parse(raw_url).ok()?;
    // 只有 http(s) 这类「元组源」才有可注入的存储命名空间；
    // about:blank / data: / file: 等的源是 opaque，序列化为字符串 "null"，
    // 若原样返回会让调用方误以为拿到了一个真实 origin。
    if !matches!(parsed.scheme(), "http" | "https") {
        return None;
    }
    Some(parsed.origin().ascii_serialization())
}

async fn current_origin(client: &CdpClient) -> Option<String> {
    let value = client.evaluate("location.href").await.ok()?;
    origin_of(value.as_str()?)
}

/// 确保页面停在站点 origin 上（否则导航过去并等待就绪）。
async fn ensure_page_on_origin(
    client: &CdpClient,
    expected_origin: &str,
    website: &str,
) -> AccountManagerResult<()> {
    if current_origin(client).await.as_deref() == Some(expected_origin) {
        return Ok(());
    }
    client
        .navigate(website)
        .await
        .map_err(AccountManagerError::store_fail)?;
    wait_for_page_ready(client).await
}

async fn wait_for_page_ready(client: &CdpClient) -> AccountManagerResult<()> {
    let deadline = std::time::Instant::now() + PAGE_READY_TIMEOUT;
    while std::time::Instant::now() < deadline {
        let state = client
            .evaluate("document.readyState")
            .await
            .unwrap_or(Value::Null);
        if state.as_str() == Some("complete") {
            tokio::time::sleep(PAGE_SETTLE).await;
            return Ok(());
        }
        tokio::time::sleep(PAGE_READY_POLL).await;
    }
    // 超时不视为致命：SPA 可能长时间不 complete，仍尝试采集。
    Ok(())
}

/// 经 CDP 执行与 WebView 完全相同的 storage 采集脚本。
async fn capture_origin_via_cdp(
    client: &CdpClient,
    state: &AccountManagerState,
    expected_origin: &str,
) -> AccountManagerResult<Option<super::browser_storage::OriginCaptureResult>> {
    // 页面不在目标 origin 时，localStorage 属于别的站点，不得跨 origin 采集。
    if current_origin(client).await.as_deref() != Some(expected_origin) {
        return Ok(None);
    }
    let slot = super::browser_storage::new_capture_slot();
    let script = super::browser_storage::capture_script(&slot)?;
    client
        .evaluate(&script)
        .await
        .map_err(AccountManagerError::store_fail)?;

    let deadline = std::time::Instant::now() + PAGE_READY_TIMEOUT;
    while std::time::Instant::now() < deadline {
        let raw = client
            .evaluate(&super::browser_storage::BridgeState::poll_expression(&slot))
            .await
            .map_err(AccountManagerError::store_fail)?;
        let raw = raw.as_str().unwrap_or_default().to_string();
        if !raw.is_empty() {
            let bridge = super::browser_storage::BridgeState::parse(&raw)?;
            if bridge.status != "pending" {
                let _ = client
                    .evaluate(&super::browser_storage::BridgeState::cleanup_expression(
                        &slot,
                    ))
                    .await;
                return bridge.into_capture(state, expected_origin).map(Some);
            }
        }
        tokio::time::sleep(PAGE_READY_POLL).await;
    }
    Err(AccountManagerError::store_fail("storage capture timeout"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cookie(name: &str, domain: &str, host_only: bool) -> CookieEntry {
        CookieEntry {
            name: name.to_string(),
            value: "v".to_string(),
            domain: domain.to_string(),
            host_only,
            path: "/".to_string(),
            http_only: true,
            secure: true,
            same_site: Some("lax".to_string()),
            partitioned: false,
            expires: None,
            expires_at_ts: Some(1_800_000_000),
        }
    }

    #[test]
    fn host_only_cookie_is_scoped_by_url_not_domain() {
        let params =
            cookie_injection_params(&cookie("sid", "www.trae.cn", true), "https://www.trae.cn");
        assert_eq!(params["url"], json!("https://www.trae.cn"));
        assert!(params.get("domain").is_none());
    }

    #[test]
    fn domain_cookie_is_scoped_by_domain() {
        let params =
            cookie_injection_params(&cookie("sid", ".trae.cn", false), "https://www.trae.cn");
        assert_eq!(params["domain"], json!(".trae.cn"));
        assert!(params.get("url").is_none());
    }

    #[test]
    fn injection_preserves_cookie_attributes() {
        let params =
            cookie_injection_params(&cookie("sid", ".trae.cn", false), "https://www.trae.cn");
        assert_eq!(params["httpOnly"], json!(true));
        assert_eq!(params["secure"], json!(true));
        assert_eq!(params["sameSite"], json!("Lax"));
        assert_eq!(params["expires"], json!(1_800_000_000i64));
        assert_eq!(params["path"], json!("/"));
    }

    #[test]
    fn same_site_is_normalized_to_cdp_casing() {
        assert_eq!(normalize_same_site("strict"), Some("Strict"));
        assert_eq!(normalize_same_site("LAX"), Some("Lax"));
        assert_eq!(normalize_same_site("none"), Some("None"));
        assert_eq!(normalize_same_site("unspecified"), None);
    }

    #[test]
    fn session_cookie_has_no_expires_param() {
        let mut entry = cookie("tmp", ".trae.cn", false);
        entry.expires_at_ts = None;
        let params = cookie_injection_params(&entry, "https://www.trae.cn");
        assert!(params.get("expires").is_none());
    }

    #[test]
    fn cdp_cookie_maps_domain_prefixed_as_domain_cookie() {
        let raw = json!({
            "name": "sid", "value": "abc", "domain": ".trae.cn", "path": "/",
            "expires": 1_800_000_000.5, "httpOnly": true, "secure": true,
            "session": false, "sameSite": "Lax",
        });
        let entry = cookie_from_cdp(&raw).expect("map cookie");
        assert!(!entry.host_only);
        assert_eq!(entry.expires_at_ts, Some(1_800_000_000));
        assert_eq!(entry.same_site.as_deref(), Some("lax"));
        assert!(!entry.partitioned);
    }

    #[test]
    fn cdp_cookie_without_leading_dot_is_host_only() {
        let raw = json!({ "name": "sid", "value": "abc", "domain": "www.trae.cn" });
        let entry = cookie_from_cdp(&raw).expect("map cookie");
        assert!(entry.host_only);
        // 缺省 expires 视为会话 cookie。
        assert_eq!(entry.expires_at_ts, None);
        assert_eq!(entry.path, "/");
    }

    #[test]
    fn cdp_cookie_with_partition_key_is_marked_partitioned() {
        let raw = json!({
            "name": "sid", "value": "abc", "domain": ".trae.cn",
            "partitionKey": { "topLevelSite": "https://a.com", "hasCrossSiteAncestor": false },
        });
        let entry = cookie_from_cdp(&raw).expect("map cookie");
        assert!(entry.partitioned);
    }

    #[test]
    fn cdp_cookie_without_domain_is_dropped() {
        let raw = json!({ "name": "sid", "value": "abc" });
        assert!(cookie_from_cdp(&raw).is_none());
    }

    #[test]
    fn captured_session_is_tagged_with_browser_origin() {
        let session = build_session_with_ua(vec![cookie("sid", ".trae.cn", false)], "UA".into());
        assert_eq!(session.session_origin, Some(SessionOrigin::BrowserCdp));
        assert!(session.captured_at_ts.is_some());
    }

    #[test]
    fn partitioned_count_matches_session() {
        let mut first = cookie("a", ".trae.cn", false);
        first.partitioned = true;
        let second = cookie("b", ".trae.cn", false);
        let session = AccountSession {
            cookies: vec![first, second],
            ..Default::default()
        };
        assert_eq!(count_partitioned(&session), 1);
    }

    #[test]
    fn origin_of_parses_http_urls() {
        assert_eq!(
            origin_of("https://www.trae.cn/path?q=1").as_deref(),
            Some("https://www.trae.cn")
        );
        assert_eq!(origin_of("about:blank"), None);
        // opaque 源（file:/data:）没有可注入的存储命名空间。
        assert_eq!(origin_of("file:///etc/passwd"), None);
        assert_eq!(origin_of("data:text/html,hi"), None);
        assert_eq!(origin_of("not a url"), None);
    }

    #[test]
    fn user_agent_override_only_for_same_engine_sessions() {
        // WebView 采到的会话（默认 Unknown 来源）不覆盖 UA：
        // 把 WKWebView 的 Safari UA 盖到 Chrome 上会丢会话。
        let webview_session = AccountSession {
            user_agent: "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko)".into(),
            ..Default::default()
        };
        assert!(!should_override_user_agent(&webview_session));

        // 即使来源是浏览器，UA 不是 Chromium 系也不覆盖。
        let foreign_ua = AccountSession {
            session_origin: Some(SessionOrigin::BrowserCdp),
            user_agent: "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15".into(),
            ..Default::default()
        };
        assert!(!should_override_user_agent(&foreign_ua));

        // 同引擎（浏览器采、Chromium UA）才覆盖，保持与服务端签发时一致。
        let chromium_ua = AccountSession {
            session_origin: Some(SessionOrigin::BrowserCdp),
            user_agent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
                .into(),
            ..Default::default()
        };
        assert!(should_override_user_agent(&chromium_ua));

        // 空 UA 永不覆盖。
        let empty_ua = AccountSession {
            session_origin: Some(SessionOrigin::BrowserCdp),
            user_agent: String::new(),
            ..Default::default()
        };
        assert!(!should_override_user_agent(&empty_ua));
    }

    #[test]
    fn station_origin_requires_http_scheme() {
        let station: RelayStation = serde_json::from_value(json!({
            "id": "s1",
            "remark": "r",
            "website": "file:///etc/passwd",
            "createdAt": "now",
        }))
        .expect("build station");
        assert!(station_origin(&station).is_err());
    }

    #[test]
    fn station_origin_accepts_https_website() {
        let station: RelayStation = serde_json::from_value(json!({
            "id": "s1",
            "remark": "r",
            "website": "https://www.trae.cn/some/path",
            "createdAt": "now",
        }))
        .expect("build station");
        assert_eq!(
            station_origin(&station).expect("origin"),
            "https://www.trae.cn"
        );
    }
}
