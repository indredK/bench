use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

use super::types::{ApiBillingError, ApiBillingResult};

const LOGIN_WINDOW_WIDTH: f64 = 1080.0;
const LOGIN_WINDOW_HEIGHT: f64 = 720.0;
const PROBE_TIMEOUT_SECS: u64 = 8;
const PROBE_RESULT_HOST: &str = "probe-result.local";

pub fn login_window_label(account_id: &str) -> String {
    format!("relay-login-{account_id}")
}

pub fn probe_window_label(account_id: &str) -> String {
    format!("relay-probe-{}-{}", account_id, uuid::Uuid::new_v4())
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

pub async fn run_probe<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    website_url: &str,
    probe_url: &str,
) -> ApiBillingResult<u16> {
    let label = probe_window_label(account_id);
    let data_dir = account_data_dir(app, account_id)?;
    eprintln!(
        "[probe] account={} | probe_url={} | label={}",
        account_id, probe_url, label
    );
    if let Some(parent) = data_dir.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| ApiBillingError::store_fail(format!("create probe data dir: {e}")))?;
    }

    let parsed = website_url
        .parse()
        .map_err(|e| ApiBillingError::invalid_input(format!("website url for probe: {e}")))?;

    let (tx, rx) = tokio::sync::oneshot::channel::<u16>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    let script = format!(
        "!function(){{var u='{p}';var c=new AbortController();setTimeout(function(){{c.abort()}},5000);fetch(u,{{credentials:'include',cache:'no-store',signal:c.signal}}).then(function(r){{window.location.href='https://{h}/'+r.status}}).catch(function(e){{window.location.href='https://{h}/'+(e.name==='AbortError'?408:0)}})}}()",
        p = probe_url.replace('\'', "\\'").replace('\n', ""),
        h = PROBE_RESULT_HOST,
    );

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed))
        .data_directory(data_dir)
        .visible(false)
        .initialization_script(&script)
        .on_navigation(move |url| {
            if url.host_str() == Some(PROBE_RESULT_HOST) {
                let status = url.path().trim_start_matches('/').parse::<u16>().unwrap_or(0);
                eprintln!("[probe] navigation captured status={}", status);
                if let Ok(mut guard) = tx.lock() {
                    if let Some(sender) = guard.take() {
                        let _ = sender.send(status);
                    }
                }
                return false;
            }
            true
        });

    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        builder = builder.data_store_identifier(account_data_store_identifier(account_id));
    }

    builder
        .build()
        .map_err(|e| ApiBillingError::webview_fail(format!("build probe window: {e}")))?;

    let result = tokio::time::timeout(std::time::Duration::from_secs(PROBE_TIMEOUT_SECS), rx).await;

    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.close();
    }

    match result {
        Ok(Ok(status)) => {
            eprintln!("[probe] success status={}", status);
            Ok(status)
        }
        Ok(Err(_)) => {
            eprintln!("[probe] channel closed unexpectedly");
            Err(ApiBillingError::probe_network(
                "probe channel closed".to_string(),
                None,
            ))
        }
        Err(_) => {
            eprintln!("[probe] timed out after {}s", PROBE_TIMEOUT_SECS);
            Err(ApiBillingError::probe_timeout(format!(
                "probe timed out after {PROBE_TIMEOUT_SECS}s"
            )))
        }
    }
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
    fn probe_window_label_contains_account_id() {
        let label = probe_window_label("acct-abc");
        assert!(label.starts_with("relay-probe-acct-abc-"));
    }
}