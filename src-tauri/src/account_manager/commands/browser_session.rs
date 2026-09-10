//! 账号 ↔ 浏览器互通命令（I1 出向 / I2 入向）。
//!
//! 全部命令只接受 `accountId` 与少量枚举/布尔参数，**不接受 URL、路径或凭据**：
//! 站点地址一律由后端从该账号所属 `RelayStation` 读取，避免 renderer 扩大授权范围。
//! 返回 DTO 只含计数与枚举，绝不含 cookie 值 / storage 值 / 明文会话。

use tauri::{AppHandle, Runtime, State};

use crate::account_manager::browser_session::{
    self, BrowserCaptureOutcome, BrowserOpenOutcome, BrowserProbeOutcome, BrowserStatusOutcome,
};
use crate::account_manager::state::AccountManagerState;
use crate::account_manager::types::{AccountManagerError, AccountManagerResult};

/// 可用的受支持浏览器列表（前端首次选择弹窗的数据源，不含本机路径）。
#[tauri::command]
pub async fn browser_session_browsers(
) -> AccountManagerResult<Vec<browser_session::browser::BrowserOptionDto>> {
    Ok(browser_session::browser::browser_list_dto())
}

/// 打开（或复用）该账号的托管浏览器实例。
///
/// - `injectSession = true`：注入账号会话后导航到站点（以该账号身份浏览）。
/// - `injectSession = false`：只打开站点，供用户在真实浏览器中完成扫码 / 2FA / SSO 登录。
/// - `resetProfile = true`：先关闭实例并清空 profile，保证干净起点。
#[tauri::command]
pub async fn browser_session_open<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
    browser_id: Option<String>,
    inject_session: bool,
    reset_profile: bool,
) -> AccountManagerResult<BrowserOpenOutcome> {
    if let Some(id) = browser_id.as_deref() {
        if !browser_session::browser::is_supported_id(id) {
            return Err(AccountManagerError::invalid_input(format!(
                "UNSUPPORTED_BROWSER: {id}"
            )));
        }
    }
    browser_session::open(&app, &account_id, browser_id, inject_session, reset_profile).await
}

/// 查询该账号的浏览器实例状态（是否运行、浏览器 id、调试端口）。
#[tauri::command]
pub async fn browser_session_status<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
) -> AccountManagerResult<BrowserStatusOutcome> {
    browser_session::status(&app, &account_id).await
}

/// 关闭该账号的浏览器实例。
#[tauri::command]
pub async fn browser_session_close<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
) -> AccountManagerResult<bool> {
    Ok(browser_session::close(&app, &account_id).await)
}

/// 从托管浏览器回采会话并写入 Bench。
///
/// `force = false` 时若 Bench 已有更新的会话，返回 `outcome = "conflict"` 而不写入；
/// 前端据此二次确认后再以 `force = true` 重试。
#[tauri::command]
pub async fn browser_session_capture<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
    force: bool,
) -> AccountManagerResult<BrowserCaptureOutcome> {
    browser_session::capture(&app, &account_id, force).await
}

/// 只读预检：判断浏览器中是否已存在该站点的登录态（不写入任何数据）。
#[tauri::command]
pub async fn browser_session_probe<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
) -> AccountManagerResult<BrowserProbeOutcome> {
    browser_session::probe(&app, &account_id).await
}

/// 清空该账号的浏览器 profile（先关闭实例）。用于「重新登录」场景。
#[tauri::command]
pub async fn browser_session_clear_profile<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
    state: State<'_, AccountManagerState>,
) -> AccountManagerResult<bool> {
    state.ensure_ready()?;
    browser_session::close(&app, &account_id).await;
    browser_session::profile::remove_profile_dir(&app, &account_id)
        .map_err(AccountManagerError::store_fail)?;
    Ok(true)
}
