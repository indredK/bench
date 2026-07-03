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

/// 判断一次 WebView 导航是否命中外部 App 的 return callback。
///
/// 匹配规则：忽略大小写比较 scheme，并要求导航 URL 以 return 前缀开头
/// （允许其后追加 `?code=...` 等 query）。return 本身若无 query 也能匹配。
pub fn is_return_callback(nav_url: &str, return_url: &str) -> bool {
    let nav = nav_url.trim();
    let ret = return_url.trim();
    if ret.is_empty() {
        return false;
    }

    // 先按 scheme 粗筛：scheme 必须一致（大小写不敏感）。
    let nav_scheme = nav.split(':').next().unwrap_or("");
    let ret_scheme = ret.split(':').next().unwrap_or("");
    if !nav_scheme.eq_ignore_ascii_case(ret_scheme) {
        return false;
    }

    // 去掉 query/fragment 后比较前缀，避免 `myapp://cb-evil` 误命中 `myapp://cb`。
    let ret_base = ret.split(['?', '#']).next().unwrap_or(ret);
    let nav_base = nav.split(['?', '#']).next().unwrap_or(nav);
    nav_base.eq_ignore_ascii_case(ret_base)
}

/// 把外部 App 自己的原始 callback URL 通过系统 opener 转交回该 App。
/// bench 不解析其中内容，只负责转交。
#[allow(deprecated)]
fn forward_callback_to_external_app<R: Runtime>(app: &AppHandle<R>, callback_url: &str) {
    if let Err(e) = app.shell().open(callback_url.to_string(), None) {
        eprintln!("[account_manager] forward callback failed: {e:?}");
    }
}

pub fn open_login_window<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    username: &str,
    url: &str,
    return_url: Option<&str>,
    proxy_url: Option<&str>,
) -> AccountManagerResult<()> {
    let label = login_window_label(account_id);
    if let Some(existing) = app.get_webview_window(&label) {
        existing
            .set_focus()
            .map_err(|e| AccountManagerError::store_fail(format!("focus login window: {e}")))?;
        return Ok(());
    }

    let parsed = url
        .parse()
        .map_err(|e| AccountManagerError::invalid_input(format!("website url: {e}")))?;

    let data_dir = account_data_dir(app, account_id)?;
    if let Some(parent) = data_dir.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AccountManagerError::store_fail(format!("create relay-accounts: {e}")))?;
    }

    #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(unused_mut))]
    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed))
        .title(format!("{username} · 登录"))
        .inner_size(LOGIN_WINDOW_WIDTH, LOGIN_WINDOW_HEIGHT)
        .center()
        .data_directory(data_dir);

    // per-station 网络代理：仅在 macOS 14+ 生效（`macos-proxy` feature）。
    // 非 macOS 平台静默忽略，前端 UI 已展示 macOS-only 提示。
    #[cfg(target_os = "macos")]
    if let Some(url) = proxy_url {
        if let Ok(parsed_url) = url.parse::<tauri::Url>() {
            builder = builder.proxy_url(parsed_url);
        }
    }

    if let Some(ret) = return_url {
        let ret_owned = ret.to_string();
        let label_clone = label.clone();
        let account_id_owned = account_id.to_string();
        let target_owned = url.to_string();
        let app_clone = app.clone() as AppHandle<R>;
        builder = builder.on_navigation(move |nav_url| {
            let nav_str = nav_url.as_str();

            // 情况 1: native-app loopback 回调(如 http://127.0.0.1:56290/authorize?code=...）。
            // 这是 Trae / GitHub CLI / VS Code 等工具的标准模式: 外部 App 在本地起了
            // HTTP 服务器收 code。我们**放行**这次导航,让请求真正打到该本地服务器
            // (外部 App 由此完成登录),随后捕获目标站点 session、标记 Ready、关闭窗口。
            if super::proxy::protocol::is_loopback_url(nav_str) {
                super::proxy::protocol::audit_log(
                    "proxy_loopback_callback",
                    &[("host", nav_url.host_str().unwrap_or(""))],
                );
                let app2 = app_clone.clone();
                let label2 = label_clone.clone();
                let account2 = account_id_owned.clone();
                let target2 = target_owned.clone();
                tauri::async_runtime::spawn(async move {
                    // 给本地服务器一点时间消费 callback 并响应。
                    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
                    super::session::finalize_proxy_session(&app2, &account2, &target2).await;
                    if let Some(win) = app2.get_webview_window(&label2) {
                        let _ = win.close();
                    }
                });
                return true;
            }

            // 情况 2: 自定义 scheme 回调(如 myapp://callback?code=...）。
            // 取消 WebView 导航,把原始 callback 原样 openExternal 交还外部 App。
            if is_return_callback(nav_str, &ret_owned) {
                forward_callback_to_external_app(&app_clone, nav_str);
                super::proxy::protocol::audit_log(
                    "proxy_callback_forwarded",
                    &[("scheme", nav_url.scheme())],
                );
                let app2 = app_clone.clone();
                let label2 = label_clone.clone();
                let account2 = account_id_owned.clone();
                let target2 = target_owned.clone();
                tauri::async_runtime::spawn(async move {
                    super::session::finalize_proxy_session(&app2, &account2, &target2).await;
                    if let Some(win) = app2.get_webview_window(&label2) {
                        let _ = win.close();
                    }
                });
                false
            } else {
                true
            }
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

    builder
        .build()
        .map_err(|e| AccountManagerError::store_fail(format!("build login window: {e}")))?;
    Ok(())
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
) -> AccountManagerResult<()> {
    let label = login_window_label(account_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| AccountManagerError::not_found("login window not found"))?;

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
