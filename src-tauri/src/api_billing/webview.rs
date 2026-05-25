//! 中转站 webview 辅助 / relay webview helpers:
//!   - 管理每个账号独立的 cookie/storage 目录
//!   - 拼装并打开登录窗口
//! 探针(judging session state)的逻辑见 `super::probe`,本模块只关心窗口本身.
use std::path::PathBuf;

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

use super::types::{ApiBillingError, ApiBillingResult};

const LOGIN_WINDOW_WIDTH: f64 = 1080.0;
const LOGIN_WINDOW_HEIGHT: f64 = 720.0;

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

pub fn remove_account_data_dir<R: Runtime>(app: &AppHandle<R>, account_id: &str) {
    if let Ok(dir) = account_data_dir(app, account_id) {
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
    }
}

/// 由 account_id 派生一个 16 字节稳定标识,用作 WebKit `data_store_identifier`.
/// 仅在 macOS/iOS 下被使用,但放在通用位置便于 probe 与 login 共用.
pub fn account_data_store_identifier(account_id: &str) -> [u8; 16] {
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
}
