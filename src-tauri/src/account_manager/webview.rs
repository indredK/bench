//! 中转站 webview 辅助 / relay webview helpers:
//!   - 管理每个账号独立的 cookie/storage 目录
//!   - 拼装并打开登录窗口
//!   - 自动填充账号密码 (Phase 1)
//!
//! 探针(judging session state)的逻辑见 `super::probe`,本模块只关心窗口本身.
//! Token / session 提取见 `super::session::capture_session_after_login` — Tauri 2
//! 的 `eval` 不返回 JS 值,所以走 IPC 命令 + 内置 cookie 抓取通道。
use std::path::PathBuf;

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;

use super::proxy::auto_fill::AUTO_FILL_SCRIPT;
use super::types::{AccountManagerError, AccountManagerResult};

const LOGIN_WINDOW_WIDTH: f64 = 1080.0;
const LOGIN_WINDOW_HEIGHT: f64 = 720.0;

pub fn login_window_label(account_id: &str) -> String {
    format!("relay-login-{account_id}")
}

pub fn account_data_dir<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
) -> AccountManagerResult<PathBuf> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AccountManagerError::store_fail(format!("app_local_data_dir: {e}")))?;
    Ok(base.join("relay-accounts").join(account_id))
}

pub fn remove_account_data_dir<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
) -> AccountManagerResult<()> {
    for label in [
        login_window_label(account_id),
        probe_window_label(account_id),
    ] {
        if let Some(window) = app.get_webview_window(&label) {
            window.clear_all_browsing_data().map_err(|e| {
                AccountManagerError::store_fail(format!("clear WebView data for {account_id}: {e}"))
            })?;
            window.close().map_err(|e| {
                AccountManagerError::store_fail(format!("close WebView for {account_id}: {e}"))
            })?;
        }
    }
    let dir = account_data_dir(app, account_id)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| {
            AccountManagerError::store_fail(format!(
                "remove WebView data for {account_id} at {}: {e}",
                dir.display()
            ))
        })?;
    }
    Ok(())
}

fn probe_window_label(account_id: &str) -> String {
    format!("relay-probe-{account_id}")
}

/// 由 account_id 派生一个 16 字节稳定标识,用作 WebKit `data_store_identifier`.
/// 仅在 macOS/iOS 下被使用,但放在通用位置便于 probe 与 login 共用.
pub fn account_data_store_identifier(account_id: &str) -> [u8; 16] {
    let digest = Sha256::digest(account_id.as_bytes());
    let mut out = [0u8; 16];
    out.copy_from_slice(&digest[..16]);
    out
}

/// 判断一次 WebView 导航是否命中外部 App 的 return callback。
///
/// 匹配规则：忽略大小写比较 scheme，并要求导航 URL 以 return 前缀开头
/// （允许其后追加 `?code=...` 等 query）。return 本身若无 query 也能匹配。
pub fn is_return_callback(nav_url: &str, return_url: &str) -> bool {
    super::proxy::protocol::callback_matches(nav_url, return_url)
}

/// 把外部 App 自己的原始 callback URL 通过系统 opener 转交回该 App。
/// bench 不解析其中内容，只负责转交。
#[allow(deprecated)]
fn forward_callback_to_external_app<R: Runtime>(app: &AppHandle<R>, callback_url: &str) {
    if let Err(e) = app.shell().open(callback_url.to_string(), None) {
        eprintln!("[account_manager] forward callback failed: {e:?}");
    }
}

async fn forward_loopback_callback(callback_url: &str) -> AccountManagerResult<()> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| AccountManagerError::store_fail("build loopback callback client"))?;
    client
        .get(callback_url)
        .send()
        .await
        .map_err(|_| AccountManagerError::store_fail("loopback callback delivery failed"))?;
    Ok(())
}

#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
pub fn open_login_window<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    username: &str,
    url: &str,
    return_url: Option<&str>,
    callback_state: Option<&str>,
    proxy_url: Option<&str>,
) -> AccountManagerResult<()> {
    let label = login_window_label(account_id);
    if app.get_webview_window(&label).is_some() {
        return Err(AccountManagerError::invalid_input(format!(
            "login already in progress for account {account_id}"
        )));
    }

    let parsed: tauri::Url = url
        .parse()
        .map_err(|e| AccountManagerError::invalid_input(format!("website url: {e}")))?;
    let blank: tauri::Url = "about:blank"
        .parse()
        .map_err(|e| AccountManagerError::invalid_input(format!("blank url: {e}")))?;

    let data_dir = account_data_dir(app, account_id)?;
    if let Some(parent) = data_dir.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AccountManagerError::store_fail(format!("create relay-accounts: {e}")))?;
    }

    let state = app.state::<super::state::AccountManagerState>();
    let saved_session = super::session::restore_session(&state, account_id)?;
    let restore_script = saved_session
        .as_ref()
        .map(|session| super::browser_storage::restore_initialization_script(&state, session))
        .transpose()?
        .flatten();

    #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(unused_mut))]
    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(blank))
        .title(format!("{username} · 登录"))
        .inner_size(LOGIN_WINDOW_WIDTH, LOGIN_WINDOW_HEIGHT)
        .center()
        .data_directory(data_dir);
    if let Some(script) = restore_script {
        builder = builder.initialization_script(script);
    }

    // per-station 网络代理：仅在 macOS 14+ WebView 生效。其他平台 fail closed。
    if let Some(url) = proxy_url {
        if !super::capabilities::network_proxy_available() {
            return Err(AccountManagerError::invalid_input(
                "network proxy is not supported for login WebViews on this platform",
            ));
        }
        #[cfg(target_os = "macos")]
        {
            let parsed_url = url.parse::<tauri::Url>().map_err(|e| {
                AccountManagerError::invalid_input(format!("invalid network proxy URL: {e}"))
            })?;
            builder = builder.proxy_url(parsed_url);
        }
    }

    if let Some(ret) = return_url {
        let ret_owned = ret.to_string();
        let callback_state_owned = callback_state.map(str::to_string);
        let label_clone = label.clone();
        let account_id_owned = account_id.to_string();
        let target_owned = url.to_string();
        let app_clone = app.clone() as AppHandle<R>;
        builder = builder.on_navigation(move |nav_url| {
            let nav_str = nav_url.as_str();

            if !is_return_callback(nav_str, &ret_owned) {
                return true;
            }
            if !super::proxy::protocol::callback_state_matches(
                nav_str,
                callback_state_owned.as_deref(),
            ) {
                super::proxy::protocol::audit_log(
                    "proxy_callback_state_rejected",
                    &[("scheme", nav_url.scheme())],
                );
                return false;
            }

            if super::proxy::protocol::is_loopback_url(&ret_owned) {
                super::proxy::protocol::audit_log(
                    "proxy_loopback_callback",
                    &[("host", nav_url.host_str().unwrap_or(""))],
                );
                let app2 = app_clone.clone();
                let label2 = label_clone.clone();
                let account2 = account_id_owned.clone();
                let target2 = target_owned.clone();
                let return2 = ret_owned.clone();
                let callback2 = nav_str.to_string();
                tauri::async_runtime::spawn(async move {
                    complete_proxy_login(&app2, &account2, &target2, &return2, &callback2).await;
                    if let Some(win) = app2.get_webview_window(&label2) {
                        let _ = win.close();
                    }
                });
                return false;
            }

            super::proxy::protocol::audit_log(
                "proxy_callback_forwarded",
                &[("scheme", nav_url.scheme())],
            );
            let app2 = app_clone.clone();
            let label2 = label_clone.clone();
            let account2 = account_id_owned.clone();
            let target2 = target_owned.clone();
            let return2 = ret_owned.clone();
            let callback2 = nav_str.to_string();
            tauri::async_runtime::spawn(async move {
                complete_proxy_login(&app2, &account2, &target2, &return2, &callback2).await;
                if let Some(win) = app2.get_webview_window(&label2) {
                    let _ = win.close();
                }
            });
            false
        });
    }

    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        builder = builder.data_store_identifier(account_data_store_identifier(account_id));
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        let _ = account_data_store_identifier;
    }

    let window = builder
        .build()
        .map_err(|e| AccountManagerError::store_fail(format!("build login window: {e}")))?;
    if let Some(saved) = saved_session {
        super::session::inject_session(&window, &saved)?;
    }
    window
        .navigate(parsed)
        .map_err(|e| AccountManagerError::store_fail(format!("navigate login window: {e}")))?;
    Ok(())
}

async fn complete_proxy_login<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    target_url: &str,
    return_url: &str,
    callback_url: &str,
) {
    let capture_result = super::session::finalize_proxy_session(app, account_id, target_url).await;
    let forward_result = if super::proxy::protocol::is_loopback_url(return_url) {
        forward_loopback_callback(callback_url).await
    } else {
        forward_callback_to_external_app(app, callback_url);
        Ok(())
    };
    if let Err(error) = forward_result {
        eprintln!("[account_manager] callback forwarding failed: {error}");
    }

    match capture_result {
        Ok(()) => {
            if let Some(window) = app.get_webview_window(&login_window_label(account_id)) {
                let _ = window.close();
            }
            let verified = match super::commands::refresh_one_impl(
                app.clone(),
                account_id.to_string(),
            )
            .await
            {
                Ok(account) => account.status == super::types::AccountSessionStatus::Ready,
                Err(error) => {
                    eprintln!("[account_manager] post-login probe failed: {error}");
                    false
                }
            };
            if !verified {
                eprintln!("[account_manager] captured proxy session was not verified as ready");
                return;
            }
            let state = app.state::<super::state::AccountManagerState>();
            if let Err(error) =
                super::commands::record_proxy_usage(app, &state, return_url, account_id)
            {
                eprintln!("[account_manager] record proxy usage failed: {error}");
            }
        }
        Err(error) => eprintln!("[account_manager] finalize proxy session failed: {error}"),
    }
}

// ═══════════════════════════════════════════════
// Phase 1: 自动填充 + token 提取
// ═══════════════════════════════════════════════

/// 在指定账号的登录窗口中执行自动填充脚本。
///
/// 调用前需确保:
/// - 登录窗口已导航到登录页
/// - `username` / `password` 已解密
pub async fn fill_credentials<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    username: &str,
    password: &str,
    expected_url: &str,
) -> AccountManagerResult<()> {
    let label = login_window_label(account_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| AccountManagerError::not_found("login window not found"))?;
    let current_url = window
        .url()
        .map_err(|e| AccountManagerError::store_fail(format!("read login URL: {e}")))?;
    let expected_url = expected_url.parse::<tauri::Url>().map_err(|e| {
        AccountManagerError::invalid_input(format!("invalid credential origin: {e}"))
    })?;
    if !same_origin(&current_url, &expected_url) {
        return Err(AccountManagerError::invalid_input(
            "refusing to fill credentials into a different origin",
        ));
    }

    // AUTO_FILL_SCRIPT 形如 `(function(username, password){...})();` — 把末尾的空参调用
    // `)();` 替换为带参调用 `)(USERNAME_JSON, PASSWORD_JSON);` 即可注入凭证。
    let escaped_username = serde_json::to_string(username)
        .map_err(|e| AccountManagerError::store_fail(format!("encode username: {e}")))?;
    let escaped_password = serde_json::to_string(password)
        .map_err(|e| AccountManagerError::store_fail(format!("encode password: {e}")))?;
    let trimmed = AUTO_FILL_SCRIPT.trim();
    let body = trimmed
        .strip_suffix(")();")
        .or_else(|| trimmed.strip_suffix(")()"))
        .unwrap_or(trimmed);
    let script = format!("{body})({escaped_username}, {escaped_password});");

    window
        .eval(&script)
        .map_err(|e| AccountManagerError::store_fail(format!("eval auto-fill: {e}")))?;
    Ok(())
}

fn same_origin(actual: &tauri::Url, expected: &tauri::Url) -> bool {
    actual.scheme().eq_ignore_ascii_case(expected.scheme())
        && actual.host_str().map(str::to_ascii_lowercase)
            == expected.host_str().map(str::to_ascii_lowercase)
        && actual.port_or_known_default() == expected.port_or_known_default()
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
    fn credential_fill_requires_same_origin() {
        let expected = tauri::Url::parse("https://example.com/login").unwrap();
        assert!(same_origin(
            &tauri::Url::parse("https://example.com/oauth").unwrap(),
            &expected
        ));
        assert!(!same_origin(
            &tauri::Url::parse("https://evil.example/login").unwrap(),
            &expected
        ));
        assert!(!same_origin(
            &tauri::Url::parse("http://example.com/login").unwrap(),
            &expected
        ));
    }

    #[test]
    fn fill_script_injects_args_at_call_site() {
        // AUTO_FILL_SCRIPT 形如 `(function(u,p){...})();` — 验证我们能把空参调用
        // 替换为带参调用,且不破坏外层括号结构。
        let username = "alice";
        let password = "p\"ass";
        let escaped_username = serde_json::to_string(username).unwrap();
        let escaped_password = serde_json::to_string(password).unwrap();
        let trimmed = AUTO_FILL_SCRIPT.trim();
        let body = trimmed
            .strip_suffix(")();")
            .or_else(|| trimmed.strip_suffix(")()"))
            .unwrap_or(trimmed);
        let script = format!("{body})({escaped_username}, {escaped_password});");

        // 函数体应该保留在最前面
        assert!(script.starts_with("(function(username, password)"));
        // 末尾是带参调用
        assert!(script.ends_with(r#"("alice", "p\"ass");"#));
        // 不应残留空参调用
        assert!(!script.ends_with(")();"));
    }
}
