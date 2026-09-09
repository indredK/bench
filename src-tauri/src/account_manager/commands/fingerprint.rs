//! 登录指纹命令（F2）— 采样 / 用户确认登录态。
//!
//! - `capture_login_fingerprint`: 采集站点登录态特征（cookie 特征 + storage 键名，
//!   均不含值），顺带刷新 authProfile；结果存站点级字段。
//! - `confirm_login_fingerprint`: 用户确认后将账号标为 Ready（用户显式断言，
//!   是 design.md §3「恢复后必须 probe」红线的可追溯例外，见 D4）。

use serde_json::json;
use tauri::{AppHandle, Manager, Runtime, State};

use super::shared::{build_proxy_url_for_station, now_label};
use crate::account_manager::fingerprint::{self, LoginFingerprintSummary};
use crate::account_manager::state::{push_account_log, AccountManagerState};
use crate::account_manager::storage;
use crate::account_manager::types::{
    AccountLogKind, AccountLogLevel, AccountManagerError, AccountManagerResult,
    AccountSessionStatus,
};
use crate::account_manager::webview;

const DETECT_WINDOW_LOAD_TIMEOUT_MS: u64 = 15000;

/// 采集登录指纹：优先复用已打开的登录窗口；否则开隐藏窗口（注入该账号 session）。
/// 同一窗口顺带刷新 authProfile（一次加载同时产出「认证方法画像」与「登录态证据」）。
#[tauri::command]
pub async fn capture_login_fingerprint<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
    account_id: String,
) -> AccountManagerResult<LoginFingerprintSummary> {
    // 1. 校验站点与账号归属（锁内读取，释放后再建窗口）。
    let (website, proxy_url) = {
        let snapshot = state.read_snapshot_checked()?;
        let station = snapshot
            .stations
            .iter()
            .find(|s| s.id == station_id)
            .cloned()
            .ok_or_else(|| AccountManagerError::not_found(format!("station {station_id}")))?;
        let _account = snapshot
            .accounts
            .iter()
            .find(|a| a.id == account_id && a.station_id == station_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
        let proxy_url = build_proxy_url_for_station(&app, &station)?;
        if proxy_url.is_some() && !crate::account_manager::capabilities::network_proxy_available() {
            return Err(AccountManagerError::invalid_input(
                "network proxy is not supported for fingerprint capture on this platform",
            ));
        }
        (station.website.clone(), proxy_url)
    };

    // 2. 优先复用已打开的登录窗口（用户交互中的窗口通常已登录）。
    #[cfg(not(target_os = "macos"))]
    let _ = &proxy_url;
    let login_label = webview::login_window_label(&account_id);
    let (capture, profile) = if let Some(window) = app.get_webview_window(&login_label) {
        let capture = fingerprint::capture_from_window(&window, &website, &account_id).await?;
        let profile = crate::account_manager::detection::detect_auth_profile(&window).await?;
        (capture, profile)
    } else {
        // 3. 无登录窗口 → 开隐藏窗口（复用 detect_station_auth_profile 的构建模式）。
        use std::sync::{Arc, Mutex};
        use std::time::{Duration, Instant};
        use tauri::WebviewUrl;
        use tokio::sync::oneshot;

        let label = format!("relay-fingerprint-{account_id}");
        if let Some(old) = app.get_webview_window(&label) {
            let _ = old.close();
        }
        let parsed = website
            .parse()
            .map_err(|e| AccountManagerError::invalid_input(format!("website url: {e}")))?;
        let blank: tauri::Url = "about:blank"
            .parse()
            .map_err(|e| AccountManagerError::invalid_input(format!("about:blank: {e}")))?;
        let data_dir = webview::account_data_dir(&app, &account_id)?;
        if let Some(parent) = data_dir.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AccountManagerError::store_fail(format!("create dir: {e}")))?;
        }

        let deadline = Instant::now() + Duration::from_millis(DETECT_WINDOW_LOAD_TIMEOUT_MS);
        let (tx, rx) = oneshot::channel::<()>();
        let slot: Arc<Mutex<Option<oneshot::Sender<()>>>> = Arc::new(Mutex::new(Some(tx)));
        let slot_clone = slot.clone();
        let saved_session = crate::account_manager::session::restore_session(&state, &account_id)?;
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
            tauri::WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(blank))
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
                builder.data_store_identifier(webview::account_data_store_identifier(&account_id));
        }

        let window = builder.build().map_err(|e| {
            AccountManagerError::store_fail(format!("build fingerprint window: {e}"))
        })?;
        if let Some(saved) = saved_session {
            crate::account_manager::session::inject_session(&window, &saved)?;
        }
        window
            .navigate(parsed)
            .map_err(|e| AccountManagerError::store_fail(format!("navigate: {e}")))?;

        let load_result = tokio::time::timeout_at(deadline.into(), rx).await;
        if load_result.is_err() {
            let _ = window.close();
            return Err(AccountManagerError::store_fail(
                "fingerprint window load timeout",
            ));
        }
        if wait_for_storage_restore {
            crate::account_manager::browser_storage::wait_for_restore(&window).await?;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;

        let capture = fingerprint::capture_from_window(&window, &website, &account_id).await;
        let profile = crate::account_manager::detection::detect_auth_profile(&window).await;
        let _ = window.close();
        (capture?, profile?)
    };

    // 4. 落盘：完整指纹写入 snapshot.fingerprints；摘要挂载到站点字段。
    let summary = LoginFingerprintSummary::from_capture(&capture);
    let fingerprint_value = capture.fingerprint.clone();
    let info = crate::account_manager::types::LoginFingerprintInfo {
        sampled_at: fingerprint_value.sampled_at.clone(),
        sampled_by_account: fingerprint_value.sampled_by_account.clone(),
        cookie_count: fingerprint_value.cookie_features.len(),
        storage_key_count: fingerprint_value.storage_keys.len(),
    };
    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(station) = snapshot.stations.iter_mut().find(|s| s.id == station_id) else {
            return Err(AccountManagerError::not_found(format!(
                "station {station_id}"
            )));
        };
        station.auth_profile = Some(profile);
        station.login_fingerprint = Some(info);
        snapshot
            .fingerprints
            .insert(station_id.clone(), fingerprint_value);
        push_account_log(
            snapshot,
            &account_id,
            AccountLogKind::StatusChanged,
            AccountLogLevel::Info,
            Some(json!({
                "source": "fingerprintCapture",
                "cookieCount": summary.cookie_count,
                "storageKeyCount": summary.storage_key_count,
            })),
        );
        Ok(())
    })?;

    crate::account_manager::proxy::protocol::audit_log(
        "fingerprint_captured",
        &[
            ("station", &station_id),
            ("cookies", &summary.cookie_count.to_string()),
            ("storage_keys", &summary.storage_key_count.to_string()),
        ],
    );

    Ok(summary)
}

/// 用户确认：将该账号当前状态识别为该站点的活跃（已登录）状态。
/// 显式用户断言 → status=Ready + lastLoginAt/firstLoginAt 回填 + 日志。
#[tauri::command]
pub async fn confirm_login_fingerprint<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
    account_id: String,
) -> AccountManagerResult<crate::account_manager::types::StationAccount> {
    state.ensure_ready()?;
    let station_exists = state
        .read_snapshot_checked()?
        .stations
        .iter()
        .any(|s| s.id == station_id);
    if !station_exists {
        return Err(AccountManagerError::not_found(format!(
            "station {station_id}"
        )));
    }
    let now = now_label();
    let updated = storage::with_state_mut(&app, &state, |snapshot| {
        // 借用计划:account 的可变借用(源自 iter_mut)存续期间不得再对 snapshot
        // 整体取 &mut(push_account_log),因此先完成字段写入并收集,借用结束后统一落日志。
        let (old_status, updated) = {
            let Some(account) = snapshot
                .accounts
                .iter_mut()
                .find(|a| a.id == account_id && a.station_id == station_id)
            else {
                return Err(AccountManagerError::not_found(format!(
                    "account {account_id}"
                )));
            };
            let old_status = account.status;
            account.status = AccountSessionStatus::Ready;
            account.last_login_at = Some(now.clone());
            if account.first_login_at.is_none() {
                account.first_login_at = Some(now.clone());
            }
            (old_status, account.clone())
        };
        if old_status != AccountSessionStatus::Ready {
            push_account_log(
                snapshot,
                &account_id,
                AccountLogKind::StatusChanged,
                AccountLogLevel::Success,
                Some(
                    json!({ "from": old_status, "to": AccountSessionStatus::Ready, "source": "fingerprintConfirm" }),
                ),
            );
        }
        Ok(updated)
    })?;

    crate::account_manager::proxy::protocol::audit_log(
        "fingerprint_confirmed",
        &[("station", &station_id), ("account", &account_id)],
    );

    Ok(updated)
}
