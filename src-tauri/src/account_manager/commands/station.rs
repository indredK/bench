//! Station-owned commands: CRUD, per-station network proxy, deletion and reorder.

use tauri::{AppHandle, Manager, Runtime, State};

use super::shared::{
    deletion_resource, new_id, now_label, remove_station_metadata, reorder_by_ids, trim_or_invalid,
};
use crate::account_manager::capabilities;
use crate::account_manager::crypto;
use crate::account_manager::state::AccountManagerState;
use crate::account_manager::storage;
use crate::account_manager::types::{
    AccountManagerCapabilities, AccountManagerError, AccountManagerResult, DeletionReport,
    DeletionResourceKind, DeletionResourceStatus, DeletionStatus, LoginDetectionConfig,
    NetworkProxyConfig, PasswordAction, ProbeStrategy, RelayStation,
};
use crate::account_manager::webview;

const MAX_PROXY_PASSWORD_BYTES: usize = 4 * 1024;

#[tauri::command]
pub fn get_account_manager_capabilities(
    state: State<'_, AccountManagerState>,
) -> AccountManagerCapabilities {
    let keyring_ready = state.ensure_ready().is_ok() && state.master_key().is_ok();
    capabilities::current(keyring_ready)
}

/// 初始化失败后的显式重试入口（前端加载失败页的「重试」触发）。
///
/// 背景：启动时 `init_state` 失败（典型：用户在 macOS 钥匙串授权弹窗点了拒绝）
/// 后，`ensure_ready()` 令所有命令恒定失败，而 master key 只会在 `init_state`
/// 内初始化 —— 没有重试入口时钥匙串授权弹窗不会再出现，账号管理功能将永久
/// 失效直至重启应用。
///
/// 幂等护栏：`ensure_ready()` 已通过（初始化正常）时直接返回，不重跑
/// `init_state`，避免普通加载失败误触发钥匙串弹窗；仅当 `init_error` 置位时
/// 才重新执行 `init_state`（内部 master key 走 keyring → 重新弹出授权框，
/// 成功后由 `init_state` 清除 `init_error` 并重建 snapshot）。
#[tauri::command]
pub async fn retry_account_manager_init<R: Runtime>(app: AppHandle<R>) -> AccountManagerResult<()> {
    if app.state::<AccountManagerState>().ensure_ready().is_ok() {
        return Ok(());
    }
    // init_state 含钥匙串 GUI 授权（阻塞至用户响应）与文件 IO，放 blocking 线程。
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AccountManagerState>();
        crate::account_manager::init_state(&app, &state)
    })
    .await
    .map_err(|error| AccountManagerError::store_fail(format!("join retry init task: {error}")))?
}

#[tauri::command]
pub fn list_stations(
    state: State<'_, AccountManagerState>,
) -> AccountManagerResult<Vec<RelayStation>> {
    Ok(state.read_snapshot_checked()?.stations)
}

#[tauri::command]
pub fn create_station<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    remark: String,
    website: String,
    login_detection: Option<LoginDetectionConfig>,
) -> AccountManagerResult<RelayStation> {
    let station = RelayStation {
        exclusivity_mode: Default::default(),
        auth_profile: None,
        probe_failure_count: 0,
        session_ttl_hours: crate::account_manager::types::default_session_ttl_hours(),
        id: new_id("stn"),
        remark: trim_or_invalid(&remark, "remark")?,
        website: trim_or_invalid(&website, "website")?,
        created_at: now_label(),
        login_detection: login_detection.unwrap_or_default(),
        network_proxy: None,
        login_fingerprint: None,
    };
    storage::with_state_mut(&app, &state, |snapshot| {
        snapshot.stations.push(station.clone());
        Ok(station.clone())
    })
}

#[tauri::command]
pub fn update_station<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    id: String,
    remark: Option<String>,
    website: Option<String>,
    login_detection: Option<LoginDetectionConfig>,
    session_ttl_hours: Option<u32>,
) -> AccountManagerResult<RelayStation> {
    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(station) = snapshot.stations.iter_mut().find(|s| s.id == id) else {
            return Err(AccountManagerError::not_found(format!("station {id}")));
        };
        if let Some(r) = remark.as_ref() {
            station.remark = trim_or_invalid(r, "remark")?;
        }
        if let Some(w) = website.as_ref() {
            station.website = trim_or_invalid(w, "website")?;
        }
        if let Some(d) = login_detection.clone() {
            station.login_detection = d;
        }
        if let Some(ttl) = session_ttl_hours {
            station.session_ttl_hours = ttl;
        }
        Ok(station.clone())
    })
}

/// 便捷命令:仅设置 session_ttl_hours(供前端面板使用)。
#[tauri::command]
pub fn set_session_ttl<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
    ttl_hours: u32,
) -> AccountManagerResult<RelayStation> {
    update_station(app, state, station_id, None, None, None, Some(ttl_hours))
}

/// 设置或清除 station 的网络代理。
/// `config = None` 表示清除代理（直连）。
/// `password` 为明文（前端传入），由本命令加密为 `encrypted_password`；
/// 与 `set_password` 命令保持一致。None 表示保留已存密码；清除代理会同时清除密码。
#[tauri::command]
pub fn set_station_network_proxy<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
    config: Option<NetworkProxyConfig>,
    password_action: PasswordAction,
) -> AccountManagerResult<RelayStation> {
    if config.is_some() && !capabilities::network_proxy_available() {
        return Err(AccountManagerError::invalid_input(
            "network proxy is not supported for login WebViews on this platform",
        ));
    }
    let existing_password = state
        .read_snapshot_checked()?
        .stations
        .iter()
        .find(|station| station.id == station_id)
        .and_then(|station| station.network_proxy.as_ref())
        .and_then(|config| config.encrypted_password.clone());
    // 前端可能传入 config.encrypted_password（应为 None）；后端统一覆盖。
    let prepared: Option<NetworkProxyConfig> = match config {
        None => None,
        Some(mut c) => {
            c.encrypted_password = match password_action {
                PasswordAction::Keep => existing_password,
                PasswordAction::Clear => None,
                PasswordAction::Set { password } => {
                    if password.len() > MAX_PROXY_PASSWORD_BYTES {
                        return Err(AccountManagerError::invalid_input(format!(
                            "proxy password exceeds {MAX_PROXY_PASSWORD_BYTES} bytes"
                        )));
                    }
                    let key = state.master_key()?;
                    Some(crypto::encrypt(&key, &password)?)
                }
            };
            Some(c)
        }
    };

    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(station) = snapshot.stations.iter_mut().find(|s| s.id == station_id) else {
            return Err(AccountManagerError::not_found(format!(
                "station {station_id}"
            )));
        };
        station.network_proxy = prepared;
        Ok(station.clone())
    })
}

#[tauri::command]
pub fn delete_station<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    id: String,
) -> AccountManagerResult<DeletionReport> {
    let snapshot = state.read_snapshot_checked()?;
    if !snapshot.stations.iter().any(|station| station.id == id) {
        return Err(AccountManagerError::not_found(format!("station {id}")));
    }
    let account_ids = snapshot
        .accounts
        .iter()
        .filter(|account| account.station_id == id)
        .map(|account| account.id.clone())
        .collect::<Vec<_>>();
    let mut resources = account_ids
        .iter()
        .map(|account_id| {
            deletion_resource(
                DeletionResourceKind::WebviewData,
                Some(account_id.clone()),
                webview::remove_account_data_dir(&app, account_id),
            )
        })
        .collect::<Vec<_>>();

    if resources
        .iter()
        .any(|resource| resource.status == DeletionResourceStatus::Failed)
    {
        return Ok(DeletionReport {
            target_id: id,
            status: DeletionStatus::Partial,
            metadata_deleted: false,
            removed_account_count: 0,
            resources,
        });
    }

    let metadata_result = storage::with_state_mut(&app, &state, |snapshot| {
        remove_station_metadata(snapshot, &id)
    });
    let removed_account_count = metadata_result.as_ref().copied().unwrap_or(0);
    resources.push(deletion_resource(
        DeletionResourceKind::Metadata,
        None,
        metadata_result.map(|_| ()),
    ));
    let metadata_deleted = resources
        .last()
        .is_some_and(|resource| resource.status == DeletionResourceStatus::Succeeded);
    Ok(DeletionReport {
        target_id: id,
        status: if metadata_deleted {
            DeletionStatus::Complete
        } else {
            DeletionStatus::Partial
        },
        metadata_deleted,
        removed_account_count,
        resources,
    })
}

#[tauri::command]
pub fn reorder_stations<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    ordered_ids: Vec<String>,
) -> AccountManagerResult<Vec<RelayStation>> {
    storage::with_state_mut(&app, &state, |snapshot| {
        snapshot.stations = reorder_by_ids(&snapshot.stations, &ordered_ids, "station")?;
        Ok(snapshot.stations.clone())
    })
}

/// 手动覆盖 Station 的探针策略（覆盖自动检测）。
#[tauri::command]
pub fn set_probe_strategy<R: Runtime>(
    app: AppHandle<R>,
    _state: State<'_, AccountManagerState>,
    station_id: String,
    strategy: ProbeStrategy,
) -> AccountManagerResult<RelayStation> {
    crate::account_manager::probe::set_probe_strategy(&app, &station_id, strategy)
}

/// 重置 Station 的探针策略为自动（清除手动覆盖与失败计数）。
#[tauri::command]
pub fn reset_probe_strategy<R: Runtime>(
    app: AppHandle<R>,
    _state: State<'_, AccountManagerState>,
    station_id: String,
) -> AccountManagerResult<RelayStation> {
    crate::account_manager::probe::reset_probe_strategy(&app, &station_id)
}

/// 按 URL host 匹配站点(快速登录粘贴 URL → 自动识别分组)。
/// - host 精确相等 → Exact
/// - 互为父子域(同一可注册域)→ RegistrableDomain
/// URL 无法解析(输入中途不完整属常态)返回空列表,不报错。
#[tauri::command]
pub fn match_stations_by_url(
    state: State<'_, AccountManagerState>,
    url: String,
) -> AccountManagerResult<Vec<crate::account_manager::types::StationUrlMatch>> {
    let snapshot = state.read_snapshot_checked()?;
    Ok(station_matches_for_url(
        &snapshot.stations,
        &snapshot.accounts,
        &url,
    ))
}

/// URL → 站点匹配的**纯函数**实现。
///
/// 抽出来供两处共用，避免规则漂移：
/// - IPC 命令 `match_stations_by_url`（快速登录粘贴 URL → 自动识别分组）；
/// - 浏览器扩展本地桥 `POST /v1/site/resolve`（读日常浏览器登录态前先定位站点）。
///
/// 规则：host 精确相等 → `Exact`；互为父子域 → `RegistrableDomain`；
/// URL 无法解析（输入中途不完整属常态）返回空列表，不报错。
pub fn station_matches_for_url(
    stations: &[crate::account_manager::types::RelayStation],
    accounts: &[crate::account_manager::types::StationAccount],
    url: &str,
) -> Vec<crate::account_manager::types::StationUrlMatch> {
    use crate::account_manager::types::{StationUrlMatch, StationUrlMatchConfidence};

    let Some(parsed) = url::Url::parse(url.trim()).ok() else {
        return Vec::new();
    };
    let Some(target_host) = parsed.host_str().map(|h| h.to_lowercase()) else {
        return Vec::new();
    };
    if target_host.is_empty() {
        return Vec::new();
    }

    let mut matches = Vec::new();
    for station in stations {
        let Some(station_host) = url::Url::parse(station.website.trim())
            .ok()
            .and_then(|u| u.host_str().map(|h| h.to_lowercase()))
        else {
            continue;
        };
        if station_host.is_empty() {
            continue;
        }
        let confidence = if target_host == station_host {
            StationUrlMatchConfidence::Exact
        } else if target_host.ends_with(&format!(".{station_host}"))
            || station_host.ends_with(&format!(".{target_host}"))
        {
            StationUrlMatchConfidence::RegistrableDomain
        } else {
            continue;
        };
        matches.push(StationUrlMatch {
            station_id: station.id.clone(),
            remark: station.remark.clone(),
            website: station.website.clone(),
            account_count: accounts
                .iter()
                .filter(|account| account.station_id == station.id)
                .count(),
            confidence,
        });
    }
    // Exact 优先，同置信度按站点备注排序保证稳定输出。
    matches.sort_by(|a, b| {
        let rank = |c: &StationUrlMatchConfidence| match c {
            StationUrlMatchConfidence::Exact => 0,
            StationUrlMatchConfidence::RegistrableDomain => 1,
        };
        rank(&a.confidence)
            .cmp(&rank(&b.confidence))
            .then_with(|| a.remark.cmp(&b.remark))
    });
    matches
}
