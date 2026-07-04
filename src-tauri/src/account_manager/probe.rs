//! 分层探针引擎 — HTTP HEAD probe + WebView 多源证据 probe + 自适应降级
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;
use tokio::time::{sleep, timeout, Instant};
use super::detection;
use super::state::AccountManagerState;
use super::storage;
use super::types::*;
use super::webview;

fn init_script() -> String {
    format!("(function(){{window.__probeBillingSnapshot=function(){{var b=document.body;var r=(b&&b.innerText)?b.innerText:'';return r.length>{}?r.slice(0,{}):r;}};}})();", 200_000, 200_000)
}

async fn eval_text<R: Runtime>(window: &tauri::WebviewWindow<R>) -> AccountManagerResult<String> {
    let (tx, rx) = oneshot::channel::<String>();
    let slot: Arc<Mutex<Option<oneshot::Sender<String>>>> = Arc::new(Mutex::new(Some(tx)));
    window.eval_with_callback("window.__probeBillingSnapshot?window.__probeBillingSnapshot():''", move |r| {
        if let Ok(mut g) = slot.lock() { if let Some(s) = g.take() { let _ = s.send(r); } }
    }).map_err(|e| AccountManagerError::store_fail(format!("eval: {e}")))?;
    let payload = timeout(Duration::from_millis(2000), rx).await
        .map_err(|_| AccountManagerError::store_fail("timeout"))?
        .map_err(|_| AccountManagerError::store_fail("closed"))?;
    let text: String = serde_json::from_str(&payload)
        .map_err(|e| AccountManagerError::store_fail(format!("decode: {e}")))?;
    if text.is_empty() { return Err(AccountManagerError::store_fail("empty")); }
    Ok(text)
}

pub struct ProbeOutcome { pub status: AccountSessionStatus }

pub fn probe_window_label(account_id: &str) -> String { format!("relay-probe-{account_id}") }

/// 重置 station 的探针失败计数与策略（恢复为自动/默认）。
pub fn reset_probe_strategy<R: Runtime>(
    app: &AppHandle<R>,
    station_id: &str,
) -> AccountManagerResult<RelayStation> {
    let state = app.state::<AccountManagerState>();
    storage::with_state_mut(app, &state, |snapshot| {
        let station = snapshot
            .stations
            .iter_mut()
            .find(|s| s.id == station_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("station {station_id}")))?;
        station.probe_failure_count = 0;
        if let Some(ref mut profile) = station.auth_profile {
            // 恢复为默认的自动策略（HTTP 优先）
            profile.probe_strategy = ProbeStrategy::HttpFirst;
        }
        Ok(station.clone())
    })
}

/// 手动覆盖 station 的探针策略。
pub fn set_probe_strategy<R: Runtime>(
    app: &AppHandle<R>,
    station_id: &str,
    strategy: ProbeStrategy,
) -> AccountManagerResult<RelayStation> {
    let state = app.state::<AccountManagerState>();
    storage::with_state_mut(app, &state, |snapshot| {
        let station = snapshot
            .stations
            .iter_mut()
            .find(|s| s.id == station_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("station {station_id}")))?;
        // 确保 auth_profile 存在，再写入手动策略
        let profile = station
            .auth_profile
            .get_or_insert_with(AuthProfile::default);
        profile.probe_strategy = strategy;
        // 手动覆盖时重置失败计数，避免立刻被自适应降级覆盖
        station.probe_failure_count = 0;
        Ok(station.clone())
    })
}

pub async fn run_probe<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    website: &str,
    config: &LoginDetectionConfig,
    proxy_url: Option<&str>,
) -> AccountManagerResult<ProbeOutcome> {
    let label = probe_window_label(account_id);
    if let Some(e) = app.get_webview_window(&label) { let _ = e.close(); }
    let parsed = website.parse().map_err(|e| AccountManagerError::invalid_input(format!("url: {e}")))?;
    let data_dir = webview::account_data_dir(app, account_id)?;
    if let Some(p) = data_dir.parent() { std::fs::create_dir_all(p).map_err(|e| AccountManagerError::store_fail(format!("dir: {e}")))?; }
    let dead = Instant::now() + Duration::from_millis(5000);
    let (tx, rx) = oneshot::channel::<()>();
    let slot: Arc<Mutex<Option<oneshot::Sender<()>>>> = Arc::new(Mutex::new(Some(tx)));
    let window = {
        let mut b = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed)).visible(false).data_directory(data_dir).initialization_script(init_script())
            .on_page_load(move |_, p| {
                if !matches!(p.event(), tauri::webview::PageLoadEvent::Finished) { return; }
                if let Ok(mut g) = slot.lock() { if let Some(s) = g.take() { let _ = s.send(()); } }
            });
        #[cfg(any(target_os="macos",target_os="ios"))] { b = b.data_store_identifier(webview::account_data_store_identifier(account_id)); }
        #[cfg(target_os = "macos")]
        if let Some(url) = proxy_url {
            if let Ok(parsed_url) = url.parse::<tauri::Url>() {
                b = b.proxy_url(parsed_url);
            }
        }
        b.build().map_err(|e| AccountManagerError::store_fail(format!("build: {e}")))?
    };
    let load = tokio::time::timeout_at(dead, rx).await;
    let out = match load { Err(_)|Ok(Err(_)) => None, Ok(Ok(())) => {
        let pd = Instant::now() + Duration::from_millis(8000);
        let mut lt: Option<String> = None;
        let mut out = None;
        let iv = Duration::from_millis(500);
        while Instant::now() < pd {
            match eval_text(&window).await {
                Ok(t) => { if let Some(s) = detection::classify_confident(&t, config) { out = Some(s); break; } lt = Some(t); }
                Err(_) => { sleep(iv).await; continue; }
            }
            sleep(iv).await;
        }
        if out.is_none() { lt.map(|t| detection::classify(&t, config)) } else { out }
    }};
    let _ = window.close();
    Ok(match out { Some(s) => ProbeOutcome{status:s}, None => ProbeOutcome{status: AccountSessionStatus::FetchFailed} })
}
