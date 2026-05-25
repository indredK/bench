use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use sha2::{Digest, Sha256};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::oneshot;
use tokio::time::Instant;

use super::types::{ApiBillingError, ApiBillingResult};

const LOGIN_WINDOW_WIDTH: f64 = 1080.0;
const LOGIN_WINDOW_HEIGHT: f64 = 720.0;
const PROBE_LOAD_TIMEOUT_SECS: u64 = 15;
const PROBE_MAX_WAIT_AFTER_LOAD_MS: u64 = 6_000;
const PROBE_POLL_INTERVAL_MS: u64 = 300;
const PROBE_STABLE_POLLS_REQUIRED: usize = 2;
const PROBE_EVAL_TIMEOUT_SECS: u64 = 3;
const PROBE_TEXT_LIMIT: usize = 200_000;

pub fn probe_window_label(account_id: &str) -> String {
    format!("relay-probe-{account_id}")
}

pub fn login_window_label(account_id: &str) -> String {
    format!("relay-login-{account_id}")
}

pub fn account_data_dir<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
) -> ApiBillingResult<PathBuf> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| ApiBillingError::store_fail(format!("app_local_data_dir: {e}")))?;
    Ok(base.join("relay-accounts").join(account_id))
}

pub fn remove_account_data_dir<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
) {
    if let Ok(dir) = account_data_dir(app, account_id) {
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
    }
}

fn account_data_store_identifier(account_id: &str) -> [u8; 16] {
    let digest = Sha256::digest(account_id.as_bytes());
    let mut out = [0u8; 16];
    out.copy_from_slice(&digest[..16]);
    out
}

pub fn open_login_window<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    username: &str,
    url: &str,
) -> ApiBillingResult<()> {
    let label = login_window_label(account_id);
    if let Some(existing) = app.get_webview_window(&label) {
        existing
            .set_focus()
            .map_err(|e| ApiBillingError::store_fail(format!("focus login window: {e}")))?;
        return Ok(());
    }

    let parsed = url
        .parse()
        .map_err(|e| ApiBillingError::invalid_input(format!("website url: {e}")))?;

    let data_dir = account_data_dir(app, account_id)?;
    if let Some(parent) = data_dir.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| ApiBillingError::store_fail(format!("create relay-accounts: {e}")))?;
    }

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed))
        .title(format!("{username} · 登录"))
        .inner_size(LOGIN_WINDOW_WIDTH, LOGIN_WINDOW_HEIGHT)
        .center()
        .data_directory(data_dir);

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
        .map_err(|e| ApiBillingError::store_fail(format!("build login window: {e}")))?;
    Ok(())
}

fn probe_script() -> String {
    format!(
        "JSON.stringify((document.body && document.body.innerText ? document.body.innerText : '').slice(0, {limit}))",
        limit = PROBE_TEXT_LIMIT,
    )
}

async fn eval_inner_text<R: Runtime>(window: &WebviewWindow<R>) -> ApiBillingResult<String> {
    let (tx, rx) = oneshot::channel::<String>();
    let slot: Arc<Mutex<Option<oneshot::Sender<String>>>> = Arc::new(Mutex::new(Some(tx)));

    window
        .eval_with_callback(probe_script(), move |result| {
            let Ok(mut guard) = slot.lock() else {
                return;
            };
            if let Some(sender) = guard.take() {
                let _ = sender.send(result);
            }
        })
        .map_err(|e| ApiBillingError::store_fail(format!("eval probe script: {e}")))?;

    let payload = tokio::time::timeout(Duration::from_secs(PROBE_EVAL_TIMEOUT_SECS), rx)
        .await
        .map_err(|_| ApiBillingError::store_fail("probe eval timeout"))?
        .map_err(|_| ApiBillingError::store_fail("probe eval channel closed"))?;

    let text: String = serde_json::from_str(&payload)
        .map_err(|e| ApiBillingError::store_fail(format!("decode probe payload: {e}")))?;
    Ok(text)
}

async fn poll_until_text_stable<R: Runtime>(
    window: &WebviewWindow<R>,
) -> ApiBillingResult<String> {
    let start = Instant::now();
    let max_wait = Duration::from_millis(PROBE_MAX_WAIT_AFTER_LOAD_MS);
    let poll_interval = Duration::from_millis(PROBE_POLL_INTERVAL_MS);

    let mut last_text = eval_inner_text(window).await?;
    let mut stable_count: usize = 1;

    while start.elapsed() < max_wait {
        tokio::time::sleep(poll_interval).await;
        let text = eval_inner_text(window).await?;
        if text == last_text {
            stable_count += 1;
            if stable_count >= PROBE_STABLE_POLLS_REQUIRED {
                return Ok(text);
            }
        } else {
            last_text = text;
            stable_count = 1;
        }
    }

    Ok(last_text)
}

pub async fn run_probe<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    website: &str,
) -> ApiBillingResult<String> {
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

    let (load_tx, load_rx) = oneshot::channel::<()>();
    let load_slot: Arc<Mutex<Option<oneshot::Sender<()>>>> =
        Arc::new(Mutex::new(Some(load_tx)));

    let window = {
        let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed))
            .visible(false)
            .data_directory(data_dir)
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

    let load_outcome =
        tokio::time::timeout(Duration::from_secs(PROBE_LOAD_TIMEOUT_SECS), load_rx).await;

    let result = match load_outcome {
        Err(_) => Err(ApiBillingError::store_fail("probe load timeout")),
        Ok(Err(_)) => Err(ApiBillingError::store_fail("probe load channel closed")),
        Ok(Ok(())) => poll_until_text_stable(&window).await,
    };

    let _ = window.close();

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifier_is_deterministic() {
        let a = account_data_store_identifier("acct-deadbeef");
        let b = account_data_store_identifier("acct-deadbeef");
        assert_eq!(a, b);
    }

    #[test]
    fn identifier_differs_per_account() {
        let a = account_data_store_identifier("acct-aaaa");
        let b = account_data_store_identifier("acct-bbbb");
        assert_ne!(a, b);
    }

    #[test]
    fn login_window_label_format() {
        assert_eq!(login_window_label("acct-123"), "relay-login-acct-123");
    }

    #[test]
    fn probe_window_label_format() {
        assert_eq!(probe_window_label("acct-123"), "relay-probe-acct-123");
    }

    #[test]
    fn probe_script_contains_limit() {
        let script = probe_script();
        assert!(script.contains("document.body"));
        assert!(script.contains(&PROBE_TEXT_LIMIT.to_string()));
    }
}
