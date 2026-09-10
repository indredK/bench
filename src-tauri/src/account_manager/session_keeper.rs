//! Session Keeper — 会话保活调度器。
//!
//! 周期扫描启用了保活计划的 persistent 账号,在隐藏 WebView 中"重新加载"
//! 站点页面:探测登录态 → Ready 则重新捕获 session 并加密落盘,实现静默保活。
//!
//! 互斥:复用 `begin_probe_flight`(同账号 single-flight,与手动刷新互斥)
//! 与 `probe_semaphore`(全局并发 2)。
//! 边界:ephemeral 账号不参与;登录窗口打开中跳过;Windows 上站点配置了
//! 网络代理时跳过(fail-closed,与 probe 行为一致);捕获失败保留旧 session。

use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::{Local, Timelike};
use serde_json::json;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::oneshot;
use tokio::time::{sleep, Instant};

use super::commands::{account_log_error_code, build_proxy_url_for_station};
use super::crypto::EncryptedBlob;
use super::probe;
use super::session;
use super::state::{push_account_log, AccountManagerState, ProbeFlight};
use super::storage;
use super::types::{
    AccountLogKind, AccountLogLevel, AccountManagerError, AccountManagerResult,
    AccountSessionStatus, AccountType, LoginDetectionConfig, RefreshSchedule, RefreshScheduleMode,
    StationAccount,
};
use super::webview;

const KEEPER_TICK_SECONDS: u64 = 30;

/// 在窗口上轮询页面文本并按登录检测配置分类
/// （`classify_confident` 有确定性结果即提前返回，超时回退 `classify`）。
async fn poll_page_config<R: Runtime>(
    config: &LoginDetectionConfig,
    window: &WebviewWindow<R>,
) -> Option<AccountSessionStatus> {
    let poll_deadline = Instant::now() + Duration::from_millis(8000);
    let mut last_text: Option<String> = None;
    let mut confident: Option<AccountSessionStatus> = None;
    let interval = Duration::from_millis(500);
    while Instant::now() < poll_deadline {
        match probe::eval_text(window).await {
            Ok(text) => {
                if let Some(status) = super::detection::classify_confident(&text, config) {
                    confident = Some(status);
                    break;
                }
                last_text = Some(text);
            }
            Err(_) => {
                sleep(interval).await;
                continue;
            }
        }
        sleep(interval).await;
    }
    confident.or_else(|| last_text.map(|text| super::detection::classify(&text, config)))
}

pub fn keeper_window_label(account_id: &str) -> String {
    format!("relay-keeper-{account_id}")
}

/// 计算下次执行时刻(返回 UTC Unix 秒),从 `now` 起算、不补偿错过的周期。
/// - Interval: now + hours * 3600(饱和运算)
/// - Daily: 本地时区下一个 minute_of_day(今天已过则次日;DST gap 兜底 1h 后)
pub(crate) fn compute_next_run<Tz: chrono::TimeZone>(
    schedule: &RefreshSchedule,
    now: chrono::DateTime<Tz>,
) -> i64 {
    match schedule.mode {
        RefreshScheduleMode::Interval { hours } => now
            .timestamp()
            .saturating_add(i64::from(hours).saturating_mul(3600)),
        RefreshScheduleMode::Daily { minute_of_day } => {
            let target_seconds = i64::from(minute_of_day) * 60;
            let now_seconds = i64::from(now.num_seconds_from_midnight());
            // 恰好到点(now == target)视为未过:当日即到期,下一 tick 立即执行。
            let base_date = if now_seconds > target_seconds {
                now.date_naive()
                    .succ_opt()
                    .unwrap_or_else(|| now.date_naive())
            } else {
                now.date_naive()
            };
            let Some(naive) = base_date
                .and_hms_opt(0, 0, 0)
                .map(|midnight| midnight + chrono::Duration::seconds(target_seconds))
            else {
                return now.timestamp() + 3600;
            };
            match now.timezone().from_local_datetime(&naive) {
                chrono::LocalResult::Single(t) => t.timestamp(),
                chrono::LocalResult::Ambiguous(earliest, _) => earliest.timestamp(),
                chrono::LocalResult::None => now.timestamp() + 3600,
            }
        }
    }
}

/// 启动调度循环(软件运行期间常驻;首个 tick 立即触发 = 启动补跑一次错过的计划)。
pub fn spawn_session_keeper<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(KEEPER_TICK_SECONDS));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            run_keeper_tick(&app).await;
        }
    });
}

/// 扫描到期账号并逐个执行静默刷新。init 失败(keyring 不可用等)整轮静默跳过。
async fn run_keeper_tick<R: Runtime>(app: &AppHandle<R>) {
    // state guard 在块作用域内释放,不跨 await 持有。
    let due: Vec<String> = {
        let state = app.state::<AccountManagerState>();
        let Ok(snapshot) = state.read_snapshot_checked() else {
            return;
        };
        let now_ts = Local::now().timestamp();
        snapshot
            .accounts
            .iter()
            .filter(|a| a.account_type == AccountType::Persistent)
            .filter(|a| {
                a.refresh_schedule.as_ref().is_some_and(|s| s.enabled)
                    && a.next_refresh_at_ts.is_some_and(|ts| ts <= now_ts)
            })
            .map(|a| a.id.clone())
            .collect()
    };

    for account_id in due {
        keeper_refresh_one(app, &account_id).await;
    }
}

/// 静默刷新 leader 的执行结果。
enum KeeperRunOutcome {
    /// 完成了一次静默刷新(页面已加载并检测);`new_session` 为 Ready 时
    /// 重新捕获并加密的 session(捕获失败时为 None 且 status=FetchFailed)。
    Refreshed {
        status: AccountSessionStatus,
        new_session: Option<EncryptedBlob>,
        /// Ready 但 session 捕获/加密失败(保留旧 session)——日志标记 captureStatus。
        capture_failed: bool,
        /// 判定来源（D1/方案 A）：L0 指纹短路时为 `fingerprintMissing`，其余 None。
        reason: Option<&'static str>,
    },
    /// 因边界条件跳过本次执行(原因写入日志 skipReason)。
    Skipped { reason: &'static str },
}

/// 对单个到期账号执行一次静默刷新:probe flight(与手动刷新互斥)→
/// leader 执行 → 一次 `with_state_mut` 合并收尾(应用结果 + 推进 next + 写日志)。
async fn keeper_refresh_one<R: Runtime>(app: &AppHandle<R>, account_id: &str) {
    let started = std::time::Instant::now();
    // state guard 在块作用域内释放,不跨 await 持有。
    let flight = {
        let state = app.state::<AccountManagerState>();
        state.begin_probe_flight(account_id)
    };

    match flight {
        ProbeFlight::Leader(leader) => {
            let run = silent_refresh_leader(app, account_id).await;
            let result = finish_keeper_leader_run(app, account_id, run, started);
            if let Err(error) = &result {
                eprintln!("[account_manager] keeper run failed for {account_id}: {error}");
            }
            leader.complete(result);
        }
        // 手动刷新正在进行:等它完成,keeper 仅推进 next 并记录 skip。
        ProbeFlight::Follower(follower) => {
            let shared = follower.wait().await;
            if let Err(error) = finish_keeper_follower_run(app, account_id, &shared, started) {
                eprintln!("[account_manager] keeper finalize failed for {account_id}: {error}");
            }
        }
    }
}

#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
async fn silent_refresh_leader<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
) -> AccountManagerResult<KeeperRunOutcome> {
    // 1. 读取配置(快照释放后再建窗口)。
    let state = app.state::<AccountManagerState>();
    let (website, config, proxy_url, requires_indexed_db, fingerprint) = {
        let snapshot = state.read_snapshot_checked()?;
        let Some(account) = snapshot.accounts.iter().find(|a| a.id == account_id) else {
            return Err(AccountManagerError::not_found(format!(
                "account {account_id}"
            )));
        };
        if account.account_type != AccountType::Persistent {
            return Ok(KeeperRunOutcome::Skipped {
                reason: "notPersistent",
            });
        }
        let Some(station) = snapshot
            .stations
            .iter()
            .find(|s| s.id == account.station_id)
        else {
            return Ok(KeeperRunOutcome::Skipped {
                reason: "stationMissing",
            });
        };
        let proxy_url = build_proxy_url_for_station(app, station)?;
        (
            station.website.clone(),
            station.login_detection.clone(),
            proxy_url,
            station.auth_profile.as_ref().is_some_and(|profile| {
                profile.token_storage == super::types::TokenStorage::IndexedDB
            }),
            snapshot.fingerprints.get(&station.id).cloned(),
        )
    };

    // 2. 用户正开着该账号的登录窗口 → 跳过(避免与用户交互争抢 session)。
    if app
        .get_webview_window(&webview::login_window_label(account_id))
        .is_some()
    {
        return Ok(KeeperRunOutcome::Skipped {
            reason: "loginWindowOpen",
        });
    }

    // 3. 站点代理在当前平台不可用(Windows fail-closed)→ 跳过。
    if proxy_url.is_some() && !super::capabilities::network_proxy_available() {
        return Ok(KeeperRunOutcome::Skipped {
            reason: "proxyUnsupported",
        });
    }

    // 4. 全局并发许可(与手动刷新共享)。
    let _permit = state
        .probe_semaphore
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| AccountManagerError::store_fail(format!("acquire keeper permit: {e}")))?;

    // 5. 关闭残留 keeper 窗口(label 冲突防护)。
    let label = keeper_window_label(account_id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.close();
    }

    // 6. 构建隐藏 WebView(结构与 probe.rs 的 WebView 分支一致)。
    let target: tauri::Url = website
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

    let saved_session = session::restore_session(&state, account_id)?;
    let restore_script = saved_session
        .as_ref()
        .map(|saved| super::browser_storage::restore_initialization_script(&state, saved))
        .transpose()?
        .flatten();
    let wait_for_storage_restore = restore_script.is_some();
    let mut initialization_script = probe::init_script();
    if let Some(script) = restore_script {
        initialization_script.push_str(&script);
    }

    // WebView 加载预算：SPA 站点(如 trae.cn)需要更长时间;与 detect/capture 的 15s 对齐。
    let dead = Instant::now() + Duration::from_millis(15000);
    let (tx, rx) = oneshot::channel::<()>();
    let slot: Arc<Mutex<Option<oneshot::Sender<()>>>> = Arc::new(Mutex::new(Some(tx)));
    let window = {
        #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(unused_mut))]
        let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(blank))
            .visible(false)
            .data_directory(data_dir)
            .initialization_script(initialization_script)
            .on_page_load(move |_, p| {
                if !matches!(p.event(), tauri::webview::PageLoadEvent::Finished) {
                    return;
                }
                if p.url().scheme() == "about" {
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
        if let Some(url) = proxy_url.as_deref() {
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
            .map_err(|e| AccountManagerError::store_fail(format!("build keeper window: {e}")))?
    };

    // 7. 注入 session → 导航 → 等待加载完成。
    if let Some(saved) = saved_session.as_ref() {
        session::inject_session(&window, saved)?;
    }
    window
        .navigate(target)
        .map_err(|e| AccountManagerError::store_fail(format!("navigate keeper window: {e}")))?;
    let load = tokio::time::timeout_at(dead, rx).await;

    let (detected, detected_reason) = match load {
        Err(_) | Ok(Err(_)) => (None, None),
        Ok(Ok(())) => {
            if wait_for_storage_restore {
                super::browser_storage::wait_for_restore(&window).await?;
            }
            // L0b 预检（keeper 路径）：以采样指纹为登录态证据（含值形态匹配）——
            // 轮询等待特征就绪(SPA 延迟写 cookie/localStorage)。
            match fingerprint.as_ref() {
                Some(fp) if !fp.is_empty() => {
                    if super::fingerprint::wait_for_any_feature_present(
                        &window, &website, fp, 6, 500,
                    )
                    .await?
                    {
                        (Some(AccountSessionStatus::Ready), None)
                    } else {
                        (
                            Some(AccountSessionStatus::LoginRequired),
                            Some(super::fingerprint::FINGERPRINT_MISSING_REASON),
                        )
                    }
                }
                _ => (
                    poll_page_config(&config, &window)
                        .await
                        .or(Some(AccountSessionStatus::FetchFailed)),
                    None,
                ),
            }
        }
    };
    let detected_status = detected.unwrap_or(AccountSessionStatus::FetchFailed);

    // 8. Ready → 重新捕获并加密;捕获失败保留旧 session(status=FetchFailed)。
    let new_session = if detected_status == AccountSessionStatus::Ready {
        match session::capture_session_from_window(
            &window,
            &state,
            account_id,
            &website,
            requires_indexed_db,
        )
        .await
        {
            Ok(fresh) => Some(session::encrypt_session(&state, &fresh)?),
            Err(error) => {
                eprintln!("[account_manager] keeper capture failed for {account_id}: {error}");
                None
            }
        }
    } else {
        None
    };
    let final_status = if detected_status == AccountSessionStatus::Ready && new_session.is_none() {
        AccountSessionStatus::FetchFailed
    } else {
        detected_status
    };
    // 捕获失败标记:Ready 但新 session 无法加密落盘(保留旧 session)。
    let capture_failed = detected_status == AccountSessionStatus::Ready && new_session.is_none();

    // 9. 关闭窗口并返回。
    let _ = window.close();
    Ok(KeeperRunOutcome::Refreshed {
        status: final_status,
        new_session,
        capture_failed,
        reason: detected_reason,
    })
}

/// keeper leader 收尾:一次 `with_state_mut` 合并应用结果(状态/session/时间戳)、
/// 状态跃迁日志、autoRefresh 日志与 next 推进;返回更新后的账号给 probe flight。
fn finish_keeper_leader_run<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    run: AccountManagerResult<KeeperRunOutcome>,
    started: std::time::Instant,
) -> AccountManagerResult<StationAccount> {
    let duration_ms = started.elapsed().as_millis() as u64;
    let state = app.state::<AccountManagerState>();
    storage::with_state_mut(app, &state, |snapshot| {
        // 借用计划:account 的可变借用(源自 iter_mut)存续期间不得再对
        // snapshot 整体取 &mut(push_account_log / sessions.insert),
        // 因此先把待写日志与 session blob 收集到局部变量,借用结束后再统一落盘。
        let mut pending_logs: Vec<(AccountLogKind, AccountLogLevel, Option<serde_json::Value>)> =
            Vec::new();
        let mut session_blob = None;
        {
            let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) else {
                return Err(AccountManagerError::not_found(format!(
                    "account {account_id}"
                )));
            };
            match run {
                Ok(KeeperRunOutcome::Refreshed {
                    status,
                    new_session,
                    capture_failed,
                    reason,
                }) => {
                    let old_status = account.status;
                    account.status = status;
                    // D1/方案 A: 指纹 L0 短路时记录来源,供前端徽标 tooltip;Ready 或普通探测清空。
                    account.status_reason = reason.map(str::to_string);
                    if status == AccountSessionStatus::Ready {
                        let now = super::commands::now_label();
                        account.last_refreshed_at = Some(now.clone());
                        if account.first_login_at.is_none() {
                            account.first_login_at = Some(now);
                        }
                    }
                    session_blob = new_session;
                    if old_status != status {
                        let mut status_detail = json!({ "from": old_status, "to": status });
                        if let Some(reason) = reason {
                            status_detail["reason"] = json!(reason);
                        }
                        pending_logs.push((
                            AccountLogKind::StatusChanged,
                            AccountLogLevel::Info,
                            Some(status_detail),
                        ));
                    }
                    let level = match status {
                        AccountSessionStatus::Ready => AccountLogLevel::Success,
                        AccountSessionStatus::LoginRequired => AccountLogLevel::Warn,
                        _ => AccountLogLevel::Error,
                    };
                    let mut auto_detail = json!({
                        "status": status,
                        "durationMs": duration_ms,
                        "layer": "webview",
                        "source": "keeper",
                    });
                    // 捕获失败(Ready 检测成功但 session 无法落盘)——显式标记,区别于探测失败。
                    if capture_failed {
                        auto_detail["captureStatus"] = json!("failed");
                    }
                    if let Some(reason) = reason {
                        auto_detail["reason"] = json!(reason);
                    }
                    pending_logs.push((AccountLogKind::AutoRefresh, level, Some(auto_detail)));
                }
                Ok(KeeperRunOutcome::Skipped { reason }) => {
                    pending_logs.push((
                        AccountLogKind::AutoRefresh,
                        AccountLogLevel::Warn,
                        Some(json!({ "skipReason": reason, "durationMs": duration_ms })),
                    ));
                }
                Err(error) => {
                    let code = account_log_error_code(&error);
                    pending_logs.push((
                        AccountLogKind::AutoRefresh,
                        AccountLogLevel::Error,
                        Some(json!({ "errorCode": code, "durationMs": duration_ms })),
                    ));
                }
            }
            // 无论成败:推进 next(从 now 起算,不补偿)。
            if let Some(schedule) = account.refresh_schedule.filter(|s| s.enabled) {
                account.next_refresh_at_ts = Some(compute_next_run(&schedule, Local::now()));
            }
        }
        if let Some(blob) = session_blob {
            snapshot.sessions.insert(account_id.to_string(), blob);
        }
        for (kind, level, detail) in pending_logs {
            push_account_log(snapshot, account_id, kind, level, detail);
        }
        snapshot
            .accounts
            .iter()
            .find(|a| a.id == account_id)
            .cloned()
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))
    })
}

/// keeper follower 收尾:手动刷新 leader 已写入状态与 manualRefresh 日志,
/// 这里只推进 next 并记录一条 skip 日志(说明本次计划执行被手动刷新覆盖)。
fn finish_keeper_follower_run<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    shared: &AccountManagerResult<StationAccount>,
    started: std::time::Instant,
) -> AccountManagerResult<()> {
    let duration_ms = started.elapsed().as_millis() as u64;
    let state = app.state::<AccountManagerState>();
    storage::with_state_mut(app, &state, |snapshot| {
        let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) else {
            return Err(AccountManagerError::not_found(format!(
                "account {account_id}"
            )));
        };
        // 无论成败:推进 next(从 now 起算,不补偿)。先完成 account 写入,
        // 让其可变借用先于 push_account_log 的 snapshot 借用结束。
        if let Some(schedule) = account.refresh_schedule.filter(|s| s.enabled) {
            account.next_refresh_at_ts = Some(compute_next_run(&schedule, Local::now()));
        }
        let mut detail =
            json!({ "skipReason": "manualRefreshInFlight", "durationMs": duration_ms });
        if let Ok(updated) = shared {
            detail["status"] = json!(updated.status);
        } else if let Err(error) = shared {
            detail["errorCode"] = json!(account_log_error_code(error));
        }
        push_account_log(
            snapshot,
            account_id,
            AccountLogKind::AutoRefresh,
            AccountLogLevel::Warn,
            Some(detail),
        );
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn interval_schedule(hours: u32) -> RefreshSchedule {
        RefreshSchedule {
            enabled: true,
            mode: RefreshScheduleMode::Interval { hours },
        }
    }

    fn daily_schedule(minute_of_day: u32) -> RefreshSchedule {
        RefreshSchedule {
            enabled: true,
            mode: RefreshScheduleMode::Daily { minute_of_day },
        }
    }

    #[test]
    fn interval_next_run_advances_by_hours() {
        let tz = chrono::FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 9, 9, 10, 0, 0).unwrap();
        assert_eq!(
            compute_next_run(&interval_schedule(6), now),
            now.timestamp() + 6 * 3600
        );
        assert_eq!(
            compute_next_run(&interval_schedule(1), now),
            now.timestamp() + 3600
        );
    }

    #[test]
    fn interval_next_run_saturates_instead_of_overflowing() {
        let tz = chrono::FixedOffset::east_opt(0).unwrap();
        let now = tz.with_ymd_and_hms(2026, 9, 9, 10, 0, 0).unwrap();
        assert_eq!(
            compute_next_run(&interval_schedule(8760), now),
            now.timestamp() + 8760 * 3600
        );
    }

    #[test]
    fn daily_next_run_is_today_when_target_not_yet_reached() {
        let tz = chrono::FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 9, 9, 8, 0, 0).unwrap(); // 08:00
        let expected = tz.with_ymd_and_hms(2026, 9, 9, 9, 30, 0).unwrap(); // 09:30
        assert_eq!(
            compute_next_run(&daily_schedule(9 * 60 + 30), now),
            expected.timestamp()
        );
    }

    #[test]
    fn daily_next_run_rolls_to_tomorrow_when_already_past() {
        let tz = chrono::FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 9, 9, 10, 0, 0).unwrap(); // 10:00
        let expected = tz.with_ymd_and_hms(2026, 9, 10, 9, 30, 0).unwrap(); // 次日 09:30
        assert_eq!(
            compute_next_run(&daily_schedule(9 * 60 + 30), now),
            expected.timestamp()
        );
    }

    #[test]
    fn daily_next_run_handles_midnight_boundary() {
        let tz = chrono::FixedOffset::east_opt(8 * 3600).unwrap();
        let now = tz.with_ymd_and_hms(2026, 9, 9, 0, 0, 0).unwrap(); // 午夜整
        let expected = tz.with_ymd_and_hms(2026, 9, 9, 0, 0, 0).unwrap(); // 同日 00:00
        assert_eq!(
            compute_next_run(&daily_schedule(0), now),
            expected.timestamp()
        );
    }
}
