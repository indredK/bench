//! Auth proxy / external login commands: deep-link handling, ticket consumption,
//! partitioned login windows, external app usage recording, auto station creation.

use tauri::{AppHandle, Manager, Runtime, State};
use zeroize::Zeroizing;

use super::shared::{
    build_proxy_url_for_station, new_id, normalize_login_url, normalize_optional, now_label,
    trim_or_invalid,
};
use crate::account_manager::crypto;
use crate::account_manager::proxy::matching::normalized_station_hostname;
use crate::account_manager::state::{AccountManagerSnapshot, AccountManagerState, AuthProxyTicket};
use crate::account_manager::storage;
use crate::account_manager::types::{
    AccountManagerError, AccountManagerResult, AccountSessionStatus, AccountType, AuthProfile,
    ExternalApp, ExternalAppBinding, LoginDetectionConfig, RelayStation, StationAccount,
};
use crate::account_manager::webview;

#[tauri::command]
pub fn open_login_window<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
    return_url: Option<String>,
    url: Option<String>,
) -> AccountManagerResult<()> {
    // 显式 URL 优先(快速登录粘贴的认证 URL)，禁止将认证信息嵌入 URL。
    let explicit_url = match url.as_deref() {
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(normalize_login_url(trimmed)?)
            }
        }
        None => None,
    };

    let (username, website, station) = {
        let snapshot = state.read_snapshot_checked()?;
        let account = snapshot
            .accounts
            .iter()
            .find(|a| a.id == account_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
        // ephemeral 账号可能不归属任何 Station:回退到账号自带 website。
        let station = match snapshot
            .stations
            .iter()
            .find(|s| s.id == account.station_id)
        {
            Some(station) => station.clone(),
            None if account.account_type == AccountType::Ephemeral => {
                let fallback = account.website.clone().ok_or_else(|| {
                    AccountManagerError::not_found(format!("station {}", account.station_id))
                })?;
                RelayStation {
                    id: account.station_id.clone(),
                    remark: String::new(),
                    website: fallback,
                    created_at: String::new(),
                    login_detection: LoginDetectionConfig::default(),
                    exclusivity_mode: Default::default(),
                    auth_profile: None,
                    probe_failure_count: 0,
                    session_ttl_hours: crate::account_manager::types::default_session_ttl_hours(),
                    network_proxy: None,
                    login_fingerprint: None,
                }
            }
            None => {
                return Err(AccountManagerError::not_found(format!(
                    "station {}",
                    account.station_id
                )));
            }
        };
        (account.username.clone(), station.website.clone(), station)
    };

    // 目标 URL 优先级:显式 url > station.website。
    let target = match explicit_url {
        Some(explicit_url) => explicit_url,
        None => normalize_login_url(&website)?,
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
        &target,
        return_url.as_deref(),
        None,
        proxy_url.as_deref(),
    )?;

    // 登录窗口已打开 → 记录 login/info 日志(不含 URL 原文,query 可能含 token)。
    if let Err(error) = storage::append_account_log(
        &app,
        &state,
        &account_id,
        crate::account_manager::types::AccountLogKind::Login,
        crate::account_manager::types::AccountLogLevel::Info,
        Some(serde_json::json!({ "target": "loginWindow" })),
    ) {
        eprintln!("[account_manager] append login log failed: {error}");
    }
    Ok(())
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
    expected_station_id: Option<String>,
) -> AccountManagerResult<()> {
    let AuthProxyTicket {
        target_url,
        return_url,
        request_state,
        host: target_host,
        allowed_account_stations,
        ..
    } = ticket;
    let (username, station, has_password, proxy_url) = {
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
        let ticket_station_id = allowed_account_stations
            .iter()
            .find(|(allowed_id, _)| allowed_id == &account.id)
            .map(|(_, station_id)| station_id.as_str());
        ensure_auth_proxy_account_matches_target(
            &snapshot,
            &account.id,
            &target_url,
            expected_station_id.as_deref().or(ticket_station_id),
        )?;
        // 查找所属 station 并构建代理 URL(若 station 无代理配置则返回 None = 直连)。
        let station = snapshot
            .stations
            .iter()
            .find(|s| s.id == account.station_id)
            .cloned()
            .ok_or_else(|| {
                AccountManagerError::not_found(format!("station {}", account.station_id))
            })?;
        let proxy_url = build_proxy_url_for_station(app, &station)?;
        (
            account.username.clone(),
            station.clone(),
            account.has_password,
            proxy_url,
        )
    };

    // 互斥对齐（F1-T4）：与 open_login_window 命令一致，登录前处理同站其它账号
    // （exclusive 登出冲突账号 / rotating 降级活跃账号），避免经外部登录绕过互斥约束。
    crate::account_manager::exclusivity::enforce_exclusivity_before_login(
        app,
        &station,
        &account_id,
    )?;

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

    Ok(())
}

/// 启动外部代理登录:打开该账号的独立分区登录窗口,登录完成后由 WebView
/// 导航处理器自动转交 callback / 捕获 session。
#[tauri::command]
pub async fn proxy_login<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
    ticket_id: String,
) -> AccountManagerResult<()> {
    let ticket = state.consume_auth_proxy_ticket(&ticket_id, Some(&account_id), false)?;
    let retry_ticket = ticket.clone();
    match run_proxy_login(&app, &state, account_id, ticket, None).await {
        Ok(()) => Ok(()),
        Err(error) => {
            restore_proxy_ticket_after_failure(&state, retry_ticket);
            Err(error)
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
    let retry_ticket = ticket.clone();
    let host = match trim_or_invalid(&ticket.host, "host") {
        Ok(host) => host.to_lowercase(),
        Err(error) => {
            restore_proxy_ticket_after_failure(&state, retry_ticket);
            return Err(error);
        }
    };

    // Station 的查找/创建与新账号插入在同一持久化 mutation 内，避免
    // 并发深链重复建站，也避免账号写入失败后留下刚创建的空站点。
    let display_name = normalize_optional(username).unwrap_or_else(|| format!("{host} account"));
    let (account, station, station_created) =
        match storage::with_state_mut(&app, &state, |snapshot| {
            let (station, station_created) = ensure_station_for_host(snapshot, &host);
            let account = build_proxy_account(&station.id, display_name);
            snapshot.accounts.push(account.clone());
            Ok((account, station, station_created))
        }) {
            Ok(created) => created,
            Err(error) => {
                restore_proxy_ticket_after_failure(&state, retry_ticket);
                return Err(error);
            }
        };

    // 启动代理登录失败时回滚新建 account；仅当新建的空 Station 仍未被改动且无人使用时一起清理。
    match run_proxy_login(
        &app,
        &state,
        account.id.clone(),
        ticket,
        Some(station.id.clone()),
    )
    .await
    {
        Ok(()) => Ok(account),
        Err(login_error) => {
            if webview::remove_account_data_dir(&app, &account.id).is_err() {
                eprintln!("[account_manager] auth proxy new-account WebView cleanup failed");
                return Err(AccountManagerError::store_fail(
                    "proxy login failed and its login window could not be cleaned up",
                ));
            }
            let cleanup = storage::with_state_mut(&app, &state, |snapshot| {
                rollback_new_proxy_account(snapshot, &account.id, &station, station_created)
            });
            if cleanup.is_ok() {
                restore_proxy_ticket_after_failure(&state, retry_ticket);
                Err(login_error)
            } else {
                eprintln!("[account_manager] auth proxy new-account cleanup failed");
                Err(AccountManagerError::store_fail(
                    "proxy login failed and new account cleanup could not be completed",
                ))
            }
        }
    }
}

fn build_proxy_account(station_id: &str, username: String) -> StationAccount {
    StationAccount {
        account_type: AccountType::Persistent,
        website: None,
        session: None,
        exclusivity_group: None,
        proxy_enabled: true,
        external_app_ids: Vec::new(),
        refresh_schedule: None,
        next_refresh_at_ts: None,
        first_login_at: None,
        status_reason: None,
        id: new_id("acct"),
        station_id: station_id.to_string(),
        username,
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
    }
}

fn ensure_auth_proxy_account_matches_target(
    snapshot: &AccountManagerSnapshot,
    account_id: &str,
    target_url: &str,
    expected_station_id: Option<&str>,
) -> AccountManagerResult<()> {
    let current_station_id = snapshot
        .accounts
        .iter()
        .find(|account| account.id == account_id && account.proxy_enabled)
        .map(|account| account.station_id.as_str());
    let matches = crate::account_manager::proxy::matching::match_target_to_stations(
        target_url,
        &snapshot.stations,
        &snapshot.accounts,
    );
    if matches.iter().any(|matched_station| {
        Some(matched_station.station_id.as_str()) == current_station_id
            && Some(matched_station.station_id.as_str()) == expected_station_id
            && matched_station
                .accounts
                .iter()
                .any(|account| account.id == account_id)
    }) {
        return Ok(());
    }
    Err(AccountManagerError::invalid_input(
        "account is no longer eligible for this auth proxy target",
    ))
}

fn rollback_new_proxy_account(
    snapshot: &mut AccountManagerSnapshot,
    account_id: &str,
    station: &RelayStation,
    station_created: bool,
) -> AccountManagerResult<()> {
    if snapshot.accounts.iter().any(|item| item.id == account_id) {
        super::shared::remove_account_metadata(snapshot, account_id)?;
    }
    if station_created
        && !snapshot
            .accounts
            .iter()
            .any(|item| item.station_id == station.id)
    {
        let station_unchanged = snapshot
            .stations
            .iter()
            .find(|stored| stored.id == station.id)
            .and_then(|stored| {
                Some(serde_json::to_value(stored).ok()? == serde_json::to_value(station).ok()?)
            })
            .unwrap_or(false);
        if station_unchanged {
            snapshot.stations.retain(|stored| stored.id != station.id);
        }
    }
    Ok(())
}

/// 在已锁定的 canonical snapshot 中查找或新建 Station。
/// 调用方必须在 `storage::with_state_mut` 闭包内使用，保证 check-and-insert 原子化。
fn ensure_station_for_host(
    snapshot: &mut AccountManagerSnapshot,
    host: &str,
) -> (RelayStation, bool) {
    let host_norm = host.trim().to_lowercase();

    let existing = snapshot.stations.iter().find(|station| {
        let Some(station_host) = normalized_station_hostname(&station.website) else {
            return false;
        };
        station_host == host_norm || host_norm.ends_with(&format!(".{station_host}"))
    });
    if let Some(station) = existing {
        return (station.clone(), false);
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
        login_fingerprint: None,
    };
    snapshot.stations.push(station.clone());
    (station, true)
}

fn restore_proxy_ticket_after_failure(state: &AccountManagerState, ticket: AuthProxyTicket) {
    if !state.restore_auth_proxy_ticket(ticket) {
        eprintln!("[account_manager] auth proxy ticket expired or could not be restored");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_proxy_station_creation_is_idempotent_within_canonical_snapshot() {
        let mut snapshot = AccountManagerSnapshot::default();

        let (created, was_created) = ensure_station_for_host(&mut snapshot, "Example.com");
        let (existing, was_created_again) = ensure_station_for_host(&mut snapshot, "example.com");

        assert!(was_created);
        assert!(!was_created_again);
        assert_eq!(created.id, existing.id);
        assert_eq!(snapshot.stations.len(), 1);
    }

    #[test]
    fn auth_proxy_reuses_a_station_with_a_login_path_and_query() {
        let mut snapshot = AccountManagerSnapshot::default();
        snapshot.stations.push(RelayStation {
            id: "stn-existing".into(),
            remark: "Example".into(),
            website: "https://example.com/login/path?tenant=work".into(),
            created_at: String::new(),
            login_detection: LoginDetectionConfig::default(),
            exclusivity_mode: Default::default(),
            auth_profile: None,
            probe_failure_count: 0,
            session_ttl_hours: crate::account_manager::types::default_session_ttl_hours(),
            network_proxy: None,
            login_fingerprint: None,
        });

        let (station, created) = ensure_station_for_host(&mut snapshot, "example.com");

        assert!(!created);
        assert_eq!(station.id, "stn-existing");
        assert_eq!(snapshot.stations.len(), 1);
    }

    #[test]
    fn auth_proxy_rechecks_account_station_match_before_launch() {
        let mut snapshot = AccountManagerSnapshot::default();
        let (matched_station, _) = ensure_station_for_host(&mut snapshot, "example.com");
        let (unmatched_station, _) = ensure_station_for_host(&mut snapshot, "other.example");
        let account = build_proxy_account(&matched_station.id, "example account".into());
        snapshot.accounts.push(account.clone());

        assert!(ensure_auth_proxy_account_matches_target(
            &snapshot,
            &account.id,
            "https://example.com/oauth/authorize",
            Some(&matched_station.id),
        )
        .is_ok());

        snapshot.accounts[0].station_id = unmatched_station.id;
        assert!(ensure_auth_proxy_account_matches_target(
            &snapshot,
            &account.id,
            "https://example.com/oauth/authorize",
            Some(&matched_station.id),
        )
        .is_err());
    }

    #[test]
    fn failed_new_account_login_removes_its_account_and_unused_created_station() {
        let mut snapshot = AccountManagerSnapshot::default();
        let (station, station_created) = ensure_station_for_host(&mut snapshot, "example.com");
        let account = build_proxy_account(&station.id, "example.com account".into());
        snapshot.accounts.push(account.clone());

        rollback_new_proxy_account(&mut snapshot, &account.id, &station, station_created)
            .expect("rollback should succeed");

        assert!(snapshot.accounts.is_empty());
        assert!(snapshot.stations.is_empty());
    }

    #[test]
    fn failed_new_account_login_keeps_station_used_by_another_account() {
        let mut snapshot = AccountManagerSnapshot::default();
        let (station, station_created) = ensure_station_for_host(&mut snapshot, "example.com");
        let failed_account = build_proxy_account(&station.id, "first".into());
        let surviving_account = build_proxy_account(&station.id, "second".into());
        snapshot.accounts.push(failed_account.clone());
        snapshot.accounts.push(surviving_account);

        rollback_new_proxy_account(&mut snapshot, &failed_account.id, &station, station_created)
            .expect("rollback should preserve the other account");

        assert_eq!(snapshot.accounts.len(), 1);
        assert_eq!(snapshot.stations.len(), 1);
    }

    #[test]
    fn failed_new_account_login_keeps_a_station_changed_during_launch() {
        let mut snapshot = AccountManagerSnapshot::default();
        let (station, station_created) = ensure_station_for_host(&mut snapshot, "example.com");
        let account = build_proxy_account(&station.id, "first".into());
        snapshot.accounts.push(account.clone());
        snapshot.stations[0].remark = "User edited station".into();

        rollback_new_proxy_account(&mut snapshot, &account.id, &station, station_created)
            .expect("rollback should preserve user edits");

        assert!(snapshot.accounts.is_empty());
        assert_eq!(snapshot.stations.len(), 1);
        assert_eq!(snapshot.stations[0].remark, "User edited station");
    }
}
