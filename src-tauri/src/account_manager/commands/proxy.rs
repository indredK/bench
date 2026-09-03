//! Auth proxy / external login commands: deep-link handling, ticket consumption,
//! partitioned login windows, external app usage recording, auto station creation.

use tauri::{AppHandle, Manager, Runtime, State};
use zeroize::Zeroizing;

use super::shared::{
    build_proxy_url_for_station, new_id, normalize_optional, now_label, trim_or_invalid,
};
use crate::account_manager::crypto;
use crate::account_manager::state::{AccountManagerState, AuthProxyInboxStatus, AuthProxyTicket};
use crate::account_manager::storage;
use crate::account_manager::types::{
    AccountManagerError, AccountManagerResult, AccountSessionStatus, AccountType, AuthProfile,
    ExternalApp, ExternalAppBinding, LoginDetectionConfig, RelayStation, StationAccount,
};
use crate::account_manager::webview;

const MAX_BROWSER_OPEN_URL_BYTES: usize = 32 * 1024;

#[tauri::command]
pub fn open_login_window<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
    return_url: Option<String>,
) -> AccountManagerResult<()> {
    let (username, website, station) = {
        let snapshot = state.read_snapshot_checked()?;
        let account = snapshot
            .accounts
            .iter()
            .find(|a| a.id == account_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
        let station = snapshot
            .stations
            .iter()
            .find(|s| s.id == account.station_id)
            .ok_or_else(|| {
                AccountManagerError::not_found(format!("station {}", account.station_id))
            })?;
        (
            account.username.clone(),
            station.website.clone(),
            station.clone(),
        )
    };

    // 互斥模式：登录前处理同站其它账号（exclusive 登出冲突账号 / rotating 降级活跃账号）
    crate::account_manager::exclusivity::enforce_exclusivity_before_login(
        &app,
        &station,
        &account_id,
    )?;

    let proxy_url = build_proxy_url_for_station(&app, &station)?;
    webview::open_login_window(
        &app,
        &account_id,
        &username,
        &website,
        return_url.as_deref(),
        None,
        proxy_url.as_deref(),
    )
}

/// 为 AuthProfile 检测选择最合适的账号 session。
fn pick_account_for_auth_detection<R: Runtime>(
    app: &AppHandle<R>,
    accounts: &[StationAccount],
    station_id: &str,
    account_id: Option<&str>,
) -> AccountManagerResult<StationAccount> {
    let station_accounts: Vec<&StationAccount> = accounts
        .iter()
        .filter(|account| account.station_id == station_id)
        .collect();

    if station_accounts.is_empty() {
        return Err(AccountManagerError::not_found("no account for station"));
    }

    if let Some(id) = account_id {
        return station_accounts
            .iter()
            .find(|account| account.id == id)
            .map(|account| (*account).clone())
            .ok_or_else(|| AccountManagerError::not_found(format!("account {id}")));
    }

    if let Some(account) = station_accounts.iter().find(|account| {
        app.get_webview_window(&webview::login_window_label(&account.id))
            .is_some()
    }) {
        return Ok((*account).clone());
    }

    if let Some(account) = station_accounts
        .iter()
        .filter(|account| account.last_login_at.is_some())
        .max_by(|left, right| left.last_login_at.cmp(&right.last_login_at))
    {
        return Ok((*account).clone());
    }

    Ok(station_accounts[0].clone())
}

/// 对指定 Station 执行 AuthProfile 检测
///
/// 优先使用已有的登录窗口；如果登录窗口不存在，则打开一个隐藏的临时窗口
/// 加载站点页面后执行检测（使用该账号的独立 session 存储）。
#[tauri::command]
pub async fn detect_station_auth_profile<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
    account_id: Option<String>,
) -> AccountManagerResult<AuthProfile> {
    let snapshot = state.read_snapshot_checked()?;
    let station = snapshot
        .stations
        .iter()
        .find(|s| s.id == station_id)
        .cloned()
        .ok_or_else(|| AccountManagerError::not_found(format!("station {station_id}")))?;
    // 构建 station 的代理 URL；不满足 macOS 14+ 能力时必须 fail closed。
    let proxy_url = build_proxy_url_for_station(&app, &station)?;
    if proxy_url.is_some() && !crate::account_manager::capabilities::network_proxy_available() {
        return Err(AccountManagerError::invalid_input(
            "network proxy is not supported for auth detection on this platform",
        ));
    }
    #[cfg(not(target_os = "macos"))]
    let _ = &proxy_url;

    let account = pick_account_for_auth_detection(
        &app,
        &snapshot.accounts,
        &station_id,
        account_id.as_deref(),
    )?;

    // 优先使用已有的登录窗口
    let login_label = crate::account_manager::webview::login_window_label(&account.id);
    let profile = if let Some(window) = app.get_webview_window(&login_label) {
        crate::account_manager::detection::detect_auth_profile(&window).await?
    } else {
        // 没有登录窗口，打开一个隐藏的临时窗口检测
        let temp_label = format!("relay-auth-detect-{}", account.id);
        // 清理可能残留的旧窗口
        if let Some(old) = app.get_webview_window(&temp_label) {
            let _ = old.close();
        }

        let parsed = station
            .website
            .parse()
            .map_err(|e| AccountManagerError::invalid_input(format!("website url: {e}")))?;
        let blank = "about:blank"
            .parse()
            .map_err(|e| AccountManagerError::invalid_input(format!("blank url: {e}")))?;
        let data_dir = webview::account_data_dir(&app, &account.id)?;
        if let Some(parent) = data_dir.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AccountManagerError::store_fail(format!("create dir: {e}")))?;
        }

        use std::sync::{Arc, Mutex};
        use std::time::{Duration, Instant};
        use tauri::WebviewUrl;
        use tokio::sync::oneshot;

        let deadline = Instant::now() + Duration::from_millis(15000);
        let (tx, rx) = oneshot::channel::<()>();
        let slot: Arc<Mutex<Option<oneshot::Sender<()>>>> = Arc::new(Mutex::new(Some(tx)));
        let slot_clone = slot.clone();
        let saved_session = crate::account_manager::session::restore_session(&state, &account.id)?;
        let restore_script = saved_session
            .as_ref()
            .map(|saved| {
                crate::account_manager::browser_storage::restore_initialization_script(
                    &state, saved,
                )
            })
            .transpose()?
            .flatten();
        let wait_for_storage_restore = restore_script.is_some();

        #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(unused_mut))]
        let mut builder =
            tauri::WebviewWindowBuilder::new(&app, &temp_label, WebviewUrl::External(blank))
                .visible(false)
                .data_directory(data_dir)
                .on_page_load(move |_, p| {
                    if !matches!(p.event(), tauri::webview::PageLoadEvent::Finished) {
                        return;
                    }
                    if p.url().scheme() == "about" {
                        return;
                    }
                    if let Ok(mut guard) = slot_clone.lock() {
                        if let Some(sender) = guard.take() {
                            let _ = sender.send(());
                        }
                    }
                });
        if let Some(script) = restore_script {
            builder = builder.initialization_script(script);
        }

        #[cfg(target_os = "macos")]
        if let Some(url) = proxy_url.as_deref() {
            if let Ok(parsed_url) = url.parse::<tauri::Url>() {
                builder = builder.proxy_url(parsed_url);
            }
        }

        #[cfg(any(target_os = "macos", target_os = "ios"))]
        {
            builder =
                builder.data_store_identifier(webview::account_data_store_identifier(&account.id));
        }

        let window = builder
            .build()
            .map_err(|e| AccountManagerError::store_fail(format!("build detect window: {e}")))?;
        if let Some(saved) = saved_session {
            crate::account_manager::session::inject_session(&window, &saved)?;
        }
        window
            .navigate(parsed)
            .map_err(|e| AccountManagerError::store_fail(format!("navigate detect window: {e}")))?;

        // 等待页面加载完成
        let load_result = tokio::time::timeout_at(deadline.into(), rx).await;
        if load_result.is_err() {
            let _ = window.close();
            return Err(AccountManagerError::store_fail(
                "detect window load timeout",
            ));
        }
        if wait_for_storage_restore {
            crate::account_manager::browser_storage::wait_for_restore(&window).await?;
        }

        // 额外等一小会儿，让页面 JS 运行一下
        tokio::time::sleep(Duration::from_millis(500)).await;

        let result = crate::account_manager::detection::detect_auth_profile(&window).await;
        let _ = window.close();
        result?
    };

    storage::with_state_mut(&app, &state, |snapshot| {
        if let Some(s) = snapshot.stations.iter_mut().find(|s| s.id == station_id) {
            s.auth_profile = Some(profile.clone());
        }
        Ok(())
    })?;

    Ok(profile)
}

// ═══════════════════════════════════════════════
// 外部登录代理 — Phase 1 命令
// ═══════════════════════════════════════════════

/// 从 return URL 中提取自定义 scheme（小写）。
fn return_url_scheme(return_url: &str) -> Option<String> {
    url::Url::parse(return_url)
        .ok()
        .map(|u| u.scheme().to_lowercase())
        .filter(|s| !s.is_empty())
}

/// 记录一次外部代理登录的用量：
/// - 按 return URL 的 scheme 查找/创建 `ExternalApp`（首次出现则以 scheme 作为默认名）。
/// - upsert `ExternalAppBinding(app, account)`，累加使用次数与最后使用时间。
/// - 在账号的 `external_app_ids` 上登记该 App。
///
/// 此函数在用户已于账号选择器确认后调用，因此“创建 App 记录”等同于授权落库。
pub(crate) fn record_proxy_usage<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    return_url: &str,
    account_id: &str,
) -> AccountManagerResult<()> {
    let Some(scheme) = return_url_scheme(return_url) else {
        return Ok(());
    };
    // loopback http/https 回调(native-app 模式)没有稳定的"外部 App 身份"可记录,
    // 账号已归属到目标站点的 Station,故跳过 ExternalApp/Binding 记录,避免产生
    // 名为 "http" 的垃圾 App 记录。
    if matches!(scheme.as_str(), "http" | "https") {
        return Ok(());
    }
    let return_host = url::Url::parse(return_url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_lowercase()));

    storage::with_state_mut(app, state, |snapshot| {
        let now = now_label();

        // 1. 查找/创建 ExternalApp（按 scheme 去重）。
        let app_id = if let Some(existing) = snapshot
            .external_apps
            .iter_mut()
            .find(|a| a.url_scheme.eq_ignore_ascii_case(&scheme))
        {
            existing.last_used_at = now.clone();
            existing.use_count = existing.use_count.saturating_add(1);
            if let Some(host) = return_host.as_ref() {
                if !existing
                    .return_hosts
                    .iter()
                    .any(|h| h.eq_ignore_ascii_case(host))
                {
                    existing.return_hosts.push(host.clone());
                }
            }
            existing.id.clone()
        } else {
            let external_app = ExternalApp {
                id: new_id("app"),
                name: scheme.clone(),
                url_scheme: scheme.clone(),
                return_hosts: return_host.clone().into_iter().collect(),
                first_used_at: now.clone(),
                last_used_at: now.clone(),
                use_count: 1,
            };
            let id = external_app.id.clone();
            snapshot.external_apps.push(external_app);
            id
        };

        // 2. upsert binding(app, account)。
        if let Some(binding) = snapshot
            .external_app_bindings
            .iter_mut()
            .find(|b| b.app_id == app_id && b.account_id == account_id)
        {
            binding.last_used_at = now.clone();
            binding.use_count = binding.use_count.saturating_add(1);
        } else {
            snapshot.external_app_bindings.push(ExternalAppBinding {
                id: new_id("bind"),
                app_id: app_id.clone(),
                account_id: account_id.to_string(),
                first_used_at: now.clone(),
                last_used_at: now.clone(),
                use_count: 1,
            });
        }

        // 3. 在账号上登记 App 引用。
        if let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) {
            if !account.external_app_ids.contains(&app_id) {
                account.external_app_ids.push(app_id.clone());
            }
        }

        Ok(())
    })?;

    crate::account_manager::proxy::protocol::audit_log(
        "proxy_usage_recorded",
        &[("scheme", &scheme), ("account_id", account_id)],
    );
    Ok(())
}

/// 启动外部代理登录的核心实现(供 `proxy_login` 与 `proxy_login_new_account` 复用)。
///
/// 流程: 校验账号 → 记录用量 → 打开该账号的独立分区登录窗口(导航到 target,
/// 启用 callback 转交/ loopback 完成检测) → 有密码则延迟自动填充。
///
/// 登录完成由 WebView 导航处理器异步完成(命中 loopback / 自定义 scheme 回调时
/// 捕获 session、标记 Ready、关闭窗口),本函数立即返回占位结果。
async fn run_proxy_login<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    account_id: String,
    ticket: AuthProxyTicket,
) -> AccountManagerResult<crate::account_manager::proxy::protocol::AuthProxyResult> {
    let AuthProxyTicket {
        target_url,
        return_url,
        request_state,
        host: target_host,
        ..
    } = ticket;
    let (username, station_id, has_password, proxy_url) = {
        let snapshot = state.read_snapshot_checked()?;
        let account = snapshot
            .accounts
            .iter()
            .find(|a| a.id == account_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
        if !account.proxy_enabled {
            return Err(AccountManagerError::invalid_input(format!(
                "account {account_id} has proxy disabled"
            )));
        }
        // 查找所属 station 并构建代理 URL(若 station 无代理配置则返回 None = 直连)。
        let station = snapshot
            .stations
            .iter()
            .find(|s| s.id == account.station_id)
            .ok_or_else(|| {
                AccountManagerError::not_found(format!("station {}", account.station_id))
            })?;
        let proxy_url = build_proxy_url_for_station(app, station)?;
        (
            account.username.clone(),
            account.station_id.clone(),
            account.has_password,
            proxy_url,
        )
    };

    webview::open_login_window(
        app,
        &account_id,
        &username,
        &target_url,
        return_url.as_deref(),
        request_state.as_deref(),
        proxy_url.as_deref(),
    )?;

    crate::account_manager::proxy::protocol::audit_log(
        "proxy_login_started",
        &[
            ("account_id", &account_id),
            ("target_host", &target_host),
            ("has_password", if has_password { "true" } else { "false" }),
        ],
    );

    // 有保存的密码 → 延迟自动填充(只填字段,不自动提交)。
    if has_password {
        let app_clone = app.clone();
        let account_id_for_fill = account_id.clone();
        let expected_url_for_fill = target_url.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let state = app_clone.state::<AccountManagerState>();
            let snapshot = match state.read_snapshot_checked() {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[proxy_login] delayed fill: read state: {e:?}");
                    return;
                }
            };
            let Some(account) = snapshot
                .accounts
                .iter()
                .find(|a| a.id == account_id_for_fill)
            else {
                return;
            };
            let Some(blob) = snapshot.secrets.get(&account.id).cloned() else {
                return;
            };
            let key = match state.master_key() {
                Ok(k) => k,
                Err(e) => {
                    eprintln!("[proxy_login] delayed fill: master key: {e:?}");
                    return;
                }
            };
            let password = match crypto::decrypt(&key, &blob) {
                Ok(p) => Zeroizing::new(p),
                Err(e) => {
                    eprintln!("[proxy_login] delayed fill: decrypt: {e:?}");
                    return;
                }
            };
            if let Err(e) = webview::fill_credentials(
                &app_clone,
                &account.id,
                &account.username,
                &password,
                &expected_url_for_fill,
            )
            .await
            {
                eprintln!("[proxy_login] delayed fill: fill_credentials: {e:?}");
            }
        });
    }

    Ok(crate::account_manager::proxy::protocol::AuthProxyResult {
        token: String::new(),
        token_type: "sessionProof".to_string(),
        state: request_state,
        station_id,
        account_id,
    })
}

/// 启动外部代理登录:打开该账号的独立分区登录窗口,登录完成后由 WebView
/// 导航处理器自动转交 callback / 捕获 session。
#[tauri::command]
pub async fn proxy_login<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
    ticket_id: String,
) -> AccountManagerResult<crate::account_manager::proxy::protocol::AuthProxyResult> {
    let ticket = state.consume_auth_proxy_ticket(&ticket_id, Some(&account_id), false)?;
    run_proxy_login(&app, &state, account_id, ticket).await
}

/// `handle_browser_open` 的统一返回结构。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserOpenResult {
    pub ticket_id: String,
    pub expires_at_ts: i64,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_url: Option<String>,
    pub host: String,
    pub is_authorize: bool,
    pub matches: Vec<crate::account_manager::proxy::matching::AuthProxyMatch>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthProxyDrainResult {
    pub request: Option<BrowserOpenResult>,
    pub pending_count: usize,
    pub dropped_count: u32,
    pub rejected_count: u32,
}

/// 接收一次"用 bench 打开"的 URL（`bench-auth://authorize?...` 或直接是
/// `https://.../authorize?...` 这类 OAuth 登录链接），返回统一的处理结果:
/// - `target`: 真正要登录的目标 URL
/// - `return_url`: 识别出的回调地址(loopback 或自定义 scheme),可能为空
/// - `host`: target 的 host(用于自动建站/分组)
/// - `is_authorize`: 是否像登录/authorize 链接
/// - `matches`: 按 host 匹配到的、已开启代理的账号
fn prepare_browser_open(
    state: &AccountManagerState,
    url: &str,
) -> AccountManagerResult<BrowserOpenResult> {
    use crate::account_manager::proxy::protocol;

    if url.len() > MAX_BROWSER_OPEN_URL_BYTES {
        return Err(AccountManagerError::invalid_input(
            "browser open URL exceeds size limit",
        ));
    }

    let (target, return_url, request_state) = if url.starts_with("bench-auth://") {
        let req =
            protocol::parse_auth_proxy_url(url).map_err(AccountManagerError::invalid_input)?;
        (req.target, Some(req.return_url), req.state)
    } else {
        let ret = protocol::extract_loopback_callback(url);
        (url.to_string(), ret, None)
    };

    let target = protocol::validate_target_url(&target)
        .map_err(AccountManagerError::invalid_input)?
        .to_string();
    let request_state = url::Url::parse(&target)
        .ok()
        .and_then(|parsed| {
            parsed
                .query_pairs()
                .find(|(key, _)| key == "state")
                .map(|(_, value)| value.into_owned())
        })
        .or(request_state);
    let snapshot = state.read_snapshot_checked()?;
    if let Some(ref ret) = return_url {
        protocol::validate_return_url(ret, &snapshot.external_apps)
            .map_err(AccountManagerError::invalid_input)?;
    }

    let host = url::Url::parse(&target)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_lowercase()))
        .unwrap_or_default();
    let is_authorize = protocol::is_oauth_authorize_like(&target);

    let matches = crate::account_manager::proxy::matching::match_target_to_stations(
        &target,
        &snapshot.stations,
        &snapshot.accounts,
    );
    let allowed_account_ids = snapshot
        .accounts
        .iter()
        .filter(|account| account.proxy_enabled)
        .map(|account| account.id.clone())
        .collect::<Vec<_>>();
    let ticket = state.issue_auth_proxy_ticket(
        target.clone(),
        return_url.clone(),
        request_state,
        host.clone(),
        allowed_account_ids,
    );

    protocol::audit_log(
        "handle_browser_open",
        &[
            ("host", &host),
            ("is_authorize", if is_authorize { "true" } else { "false" }),
            ("matches", &matches.len().to_string()),
        ],
    );

    Ok(BrowserOpenResult {
        ticket_id: ticket.id,
        expires_at_ts: ticket.expires_at_ts,
        target,
        return_url,
        host,
        is_authorize,
        matches,
    })
}

#[tauri::command]
pub fn handle_browser_open(
    state: State<'_, AccountManagerState>,
    url: String,
) -> AccountManagerResult<BrowserOpenResult> {
    prepare_browser_open(&state, &url)
}

#[tauri::command]
pub fn get_auth_proxy_inbox_status(
    state: State<'_, AccountManagerState>,
) -> AccountManagerResult<AuthProxyInboxStatus> {
    state.ensure_ready()?;
    Ok(state.auth_proxy_inbox_status())
}

#[tauri::command]
pub fn drain_auth_proxy_request(
    state: State<'_, AccountManagerState>,
) -> AccountManagerResult<AuthProxyDrainResult> {
    state.ensure_ready()?;
    Ok(drain_auth_proxy_request_impl(&state))
}

pub(crate) fn drain_auth_proxy_request_impl(state: &AccountManagerState) -> AuthProxyDrainResult {
    let mut dropped_count = 0u32;
    let mut rejected_count = 0u32;

    loop {
        let (url, status) = state.take_auth_proxy_url();
        dropped_count = dropped_count.saturating_add(status.dropped_count);
        let Some(url) = url else {
            return AuthProxyDrainResult {
                request: None,
                pending_count: status.pending_count,
                dropped_count,
                rejected_count,
            };
        };

        match prepare_browser_open(state, &url) {
            Ok(request) => {
                return AuthProxyDrainResult {
                    request: Some(request),
                    pending_count: status.pending_count,
                    dropped_count,
                    rejected_count,
                };
            }
            Err(_) => {
                rejected_count = rejected_count.saturating_add(1);
                eprintln!("[account_manager] discarded malformed auth proxy deep link");
            }
        }
    }
}

/// 在所选站点下「使用新账号登录」:确保 host 对应的 Station 存在(自动建站/分组),
/// 创建一个开启代理的新账号,然后立即对该账号启动代理登录。
/// 返回新建的账号(供前端刷新列表)。
#[tauri::command]
pub async fn proxy_login_new_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    ticket_id: String,
    username: Option<String>,
) -> AccountManagerResult<StationAccount> {
    let ticket = state.consume_auth_proxy_ticket(&ticket_id, None, true)?;
    let host = trim_or_invalid(&ticket.host, "host")?;

    // 1. 确保 Station 存在(按 host 匹配,否则新建)。
    let station = ensure_station_for_host(&app, &state, &host)?;

    // 2. 创建新账号(Persistent + 开启代理)。默认名使用语言无关 canonical 值,
    //    展示层按 locale 决定是否本地化（§4 语言无关 canonical value）。
    let display_name = normalize_optional(username).unwrap_or_else(|| format!("{host} account"));
    let account = StationAccount {
        account_type: AccountType::Persistent,
        website: None,
        session: None,
        exclusivity_group: None,
        proxy_enabled: true,
        external_app_ids: Vec::new(),
        id: new_id("acct"),
        station_id: station.id.clone(),
        username: display_name,
        notes: String::new(),
        phone: None,
        tg_account: None,
        linked_account: None,
        invite_link: None,
        login_methods: Vec::new(),
        status: AccountSessionStatus::LoginRequired,
        last_login_at: None,
        last_refreshed_at: None,
        created_at: now_label(),
        has_password: false,
    };
    let account = storage::with_state_mut(&app, &state, |snapshot| {
        snapshot.accounts.push(account.clone());
        Ok(account.clone())
    })?;

    // 3. 启动代理登录(新账号无密码,直接进入手动登录)。
    run_proxy_login(&app, &state, account.id.clone(), ticket).await?;

    Ok(account)
}

/// 找到 website host 等于 `host` 的 Station;不存在则自动新建(remark=host)。
fn ensure_station_for_host<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    host: &str,
) -> AccountManagerResult<RelayStation> {
    let host_norm = host.trim().to_lowercase();

    let existing = state
        .read_snapshot_checked()?
        .stations
        .into_iter()
        .find(|s| {
            let sh = s
                .website
                .trim()
                .trim_start_matches("https://")
                .trim_start_matches("http://")
                .trim_end_matches('/')
                .to_lowercase();
            sh == host_norm || host_norm.ends_with(&format!(".{sh}"))
        });
    if let Some(station) = existing {
        return Ok(station);
    }

    let station = RelayStation {
        exclusivity_mode: Default::default(),
        auth_profile: None,
        probe_failure_count: 0,
        session_ttl_hours: crate::account_manager::types::default_session_ttl_hours(),
        id: new_id("stn"),
        remark: host_norm.clone(),
        website: format!("https://{host_norm}"),
        created_at: now_label(),
        login_detection: LoginDetectionConfig::default(),
        network_proxy: None,
    };
    storage::with_state_mut(app, state, |snapshot| {
        snapshot.stations.push(station.clone());
        Ok(station.clone())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::account_manager::state::AccountManagerState;

    #[test]
    fn auth_proxy_drain_skips_malformed_entries_and_returns_the_next_valid_request() {
        let state = AccountManagerState::new();
        state
            .enqueue_auth_proxy_url("bench-auth://authorize".into())
            .expect("enqueue malformed request");
        state
            .enqueue_auth_proxy_url(
                "bench-auth://authorize?target=https%3A%2F%2Fexample.com%2Foauth%2Fauthorize&return=demo%3A%2Fcallback"
                    .into(),
            )
            .expect("enqueue valid request");

        let result = drain_auth_proxy_request_impl(&state);

        assert_eq!(result.rejected_count, 1);
        assert_eq!(result.pending_count, 0);
        let request = result.request.expect("valid request");
        assert_eq!(request.host, "example.com");
        assert_eq!(request.return_url.as_deref(), Some("demo:/callback"));
        assert!(!request.ticket_id.is_empty());
    }
}
