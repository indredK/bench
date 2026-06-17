//! api-billing 探针 / Login probe: 用隐藏 webview 渲染中转站,等待登录态可判定后返回.
//!
//! 预算拆成两段以避免冷启动吃掉总额:
//!   - load 阶段 ≤ `PROBE_LOAD_BUDGET_MS` 等首个 `PageLoadEvent::Finished`
//!   - poll 阶段 ≤ `PROBE_POLL_BUDGET_MS` 每 500ms 抓一帧 innerText 喂 `detection`
//!
//! poll 期间只信"正向 needle 命中"早退 —— SPA 等 XHR 时 DOM 会短暂静止,
//! 用 absence-based classify 兜底容易把过渡态(还没渲染用户菜单)误判 `LoginRequired`.
//! 预算耗满仍没命中正向 needle → 用最后一帧走完整 `classify` 取定论 (含 absence).
//! 任一阶段彻底失败 → `AccountSessionStatus::FetchFailed`.
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::oneshot;
use tokio::time::Instant;

use super::detection;
use super::types::{AccountSessionStatus, ApiBillingError, ApiBillingResult, LoginDetectionConfig};
use super::webview::{account_data_dir, account_data_store_identifier};

/// 首屏 `PageLoadEvent::Finished` 之前的预算: 冷启动 + 重定向链 + SPA bundle 下载.
const PROBE_LOAD_BUDGET_MS: u64 = 5_000;
/// 首屏完成之后的预算: SPA 异步拉数据 + 用户菜单渲染 + needle 命中.
/// 与 load 解耦,避免冷启动吃掉 load 预算后没时间做语义判定.
const PROBE_POLL_BUDGET_MS: u64 = 8_000;
const PROBE_POLL_INTERVAL_MS: u64 = 500;
const PROBE_EVAL_TIMEOUT_MS: u64 = 2_000;
const PROBE_TEXT_LIMIT: usize = 200_000;

pub fn probe_window_label(account_id: &str) -> String {
    format!("relay-probe-{account_id}")
}

pub struct ProbeOutcome {
    pub status: AccountSessionStatus,
}

/// 注入到探针页面的 JS: 仅暴露 `__probeBillingSnapshot()` 返回当前 body.innerText.
/// 每次完整导航 (新 document) 都会重新执行.
fn init_script() -> String {
    format!(
        r#"(function(){{
  window.__probeBillingSnapshot = function() {{
    var body = document.body;
    var raw = (body && body.innerText) ? body.innerText : '';
    return raw.length > {limit} ? raw.slice(0, {limit}) : raw;
  }};
}})();"#,
        limit = PROBE_TEXT_LIMIT,
    )
}

async fn eval_text<R: Runtime>(window: &WebviewWindow<R>) -> ApiBillingResult<String> {
    let (tx, rx) = oneshot::channel::<String>();
    let slot: Arc<Mutex<Option<oneshot::Sender<String>>>> = Arc::new(Mutex::new(Some(tx)));

    window
        .eval_with_callback(
            "window.__probeBillingSnapshot ? window.__probeBillingSnapshot() : ''",
            move |result| {
                let Ok(mut guard) = slot.lock() else {
                    return;
                };
                if let Some(sender) = guard.take() {
                    let _ = sender.send(result);
                }
            },
        )
        .map_err(|e| ApiBillingError::store_fail(format!("eval probe snapshot: {e}")))?;

    let payload = tokio::time::timeout(Duration::from_millis(PROBE_EVAL_TIMEOUT_MS), rx)
        .await
        .map_err(|_| ApiBillingError::store_fail("probe eval timeout"))?
        .map_err(|_| ApiBillingError::store_fail("probe eval channel closed"))?;

    // eval_with_callback 返回 JSON-encoded JS 值; 解外层得到 innerText 字符串.
    let text: String = serde_json::from_str(&payload)
        .map_err(|e| ApiBillingError::store_fail(format!("decode probe text: {e}")))?;
    if text.is_empty() {
        return Err(ApiBillingError::store_fail("probe snapshot not ready"));
    }
    Ok(text)
}

/// 在 deadline 之前寻找确定结果. 返回 `Some` 表示已得出定论 (Ready/LoginRequired/Expired),
/// 返回 `None` 表示一次 snapshot 都没拿到,调用方应返回 FetchFailed.
///
/// 策略: 循环里只信"正向 needle 命中"早退. SPA 等 XHR 时 DOM 经常静止,
/// 此时用 absence-based `classify` 兜底会把过渡态(用户菜单还没渲染)误判为 LoginRequired.
/// 预算耗满才用最后一帧走完整 `classify`,届时 SPA 早就 hydrate 完了,定论可靠.
async fn poll_for_outcome<R: Runtime>(
    window: &WebviewWindow<R>,
    config: &LoginDetectionConfig,
    deadline: Instant,
) -> Option<AccountSessionStatus> {
    let poll_interval = Duration::from_millis(PROBE_POLL_INTERVAL_MS);
    let mut last_text: Option<String> = None;

    while Instant::now() < deadline {
        let text = match eval_text(window).await {
            Ok(t) => t,
            Err(_) => {
                // 早期 document 还没准备好或瞬时 eval 失败: 退避一拍再试.
                tokio::time::sleep(poll_interval).await;
                continue;
            }
        };

        // 正向 needle (如 "退出登录") 在 SPA hydration 过渡态不会出现,早退安全.
        if let Some(status) = detection::classify_confident(&text, config) {
            return Some(status);
        }

        last_text = Some(text);
        tokio::time::sleep(poll_interval).await;
    }

    // 预算耗尽仍没正向命中: 此时 SPA 已 hydrate 充分,用最后一帧做完整 classify (含 absence).
    last_text.map(|text| detection::classify(&text, config))
}

pub async fn run_probe<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    website: &str,
    config: &LoginDetectionConfig,
) -> ApiBillingResult<ProbeOutcome> {
    let label = probe_window_label(account_id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.close();
    }

    let parsed = website
        .parse()
        .map_err(|e| ApiBillingError::invalid_input(format!("website url: {e}")))?;

    let data_dir = account_data_dir(app, account_id)?;
    if let Some(parent) = data_dir.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| ApiBillingError::store_fail(format!("create relay-accounts: {e}")))?;
    }

    let load_deadline = Instant::now() + Duration::from_millis(PROBE_LOAD_BUDGET_MS);

    let (load_tx, load_rx) = oneshot::channel::<()>();
    let load_slot: Arc<Mutex<Option<oneshot::Sender<()>>>> =
        Arc::new(Mutex::new(Some(load_tx)));

    let window = {
        #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(unused_mut))]
        let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed))
            .visible(false)
            .data_directory(data_dir)
            .initialization_script(init_script())
            .on_page_load(move |_window, payload| {
                if !matches!(payload.event(), PageLoadEvent::Finished) {
                    return;
                }
                let Ok(mut guard) = load_slot.lock() else {
                    return;
                };
                if let Some(sender) = guard.take() {
                    let _ = sender.send(());
                }
            });

        #[cfg(any(target_os = "macos", target_os = "ios"))]
        {
            builder = builder.data_store_identifier(account_data_store_identifier(account_id));
        }
        #[cfg(not(any(target_os = "macos", target_os = "ios")))]
        {
            let _ = account_data_store_identifier;
        }

        builder
            .build()
            .map_err(|e| ApiBillingError::store_fail(format!("build probe window: {e}")))?
    };

    // 先在 load 预算内等首屏 Finished; 拿到之后再用独立的 poll 预算做语义判定.
    // 冷启动 (重定向链 + SPA bundle) 经常吃满 5–8s,如果共用一个总预算,后段没机会跑.
    let load_outcome = tokio::time::timeout_at(load_deadline, load_rx).await;

    let outcome = match load_outcome {
        Err(_) => None, // load 预算耗尽都没拿到 Finished
        Ok(Err(_)) => None,
        Ok(Ok(())) => {
            let poll_deadline = Instant::now() + Duration::from_millis(PROBE_POLL_BUDGET_MS);
            poll_for_outcome(&window, config, poll_deadline).await
        }
    };

    let _ = window.close();

    Ok(match outcome {
        Some(status) => ProbeOutcome { status },
        None => ProbeOutcome {
            status: AccountSessionStatus::FetchFailed,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_window_label_format() {
        assert_eq!(probe_window_label("acct-123"), "relay-probe-acct-123");
    }

    #[test]
    fn init_script_embeds_text_limit() {
        let s = init_script();
        assert!(s.contains(&PROBE_TEXT_LIMIT.to_string()));
        assert!(s.contains("__probeBillingSnapshot"));
    }
}
