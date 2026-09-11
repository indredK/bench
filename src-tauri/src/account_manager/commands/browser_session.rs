//! 账号 ↔ 浏览器互通命令（I1 出向 / I2 入向）。
//!
//! 全部命令只接受 `accountId` 与少量枚举/布尔参数，**不接受 URL、路径或凭据**：
//! 站点地址一律由后端从该账号所属 `RelayStation` 读取，避免 renderer 扩大授权范围。
//! 返回 DTO 只含计数与枚举，绝不含 cookie 值 / storage 值 / 明文会话。

use tauri::{AppHandle, Runtime, State};

use crate::account_manager::browser_session::{
    self, BrowserCaptureOutcome, BrowserDailySyncOutcome, BrowserOpenOutcome, BrowserProbeOutcome,
    BrowserSessionPreview, BrowserStationCaptureOutcome, BrowserStatusOutcome,
};
use crate::account_manager::state::AccountManagerState;
use crate::account_manager::types::{
    AccountLogKind, AccountLogLevel, AccountManagerError, AccountManagerResult,
};

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
    browser_session::open_for_account(&app, &account_id, browser_id, inject_session, reset_profile)
        .await
}

/// 把该账号的登录态同步到**用户日常浏览器**（不是 Bench 的隔离实例）。
///
/// 会话写入日常浏览器由 Bench Companion 扩展完成（浏览器安全模型不允许 Bench
/// 直接写别人 profile 的 cookie，详见
/// [`browser_session::sync_to_daily_browser`]）；本命令负责确保 Bench 侧会话就绪
/// （必要时从内置登录档案补采）并在所选浏览器里打开站点。
#[tauri::command]
pub async fn browser_session_sync_daily<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
    browser_id: Option<String>,
) -> AccountManagerResult<BrowserDailySyncOutcome> {
    if let Some(id) = browser_id.as_deref() {
        if !browser_session::browser::is_supported_id(id) {
            return Err(AccountManagerError::invalid_input(format!(
                "UNSUPPORTED_BROWSER: {id}"
            )));
        }
    }
    browser_session::sync_to_daily_browser(&app, &account_id, browser_id).await
}

/// 查询该账号的浏览器实例状态（是否运行、浏览器 id、调试端口）。
#[tauri::command]
pub async fn browser_session_status<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
) -> AccountManagerResult<BrowserStatusOutcome> {
    let scope = browser_session::profile::Scope::Account(account_id);
    browser_session::status_for_scope(&app, &scope).await
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
    let scope = browser_session::profile::Scope::Account(account_id);
    browser_session::probe(&app, &scope).await
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
    let scope = browser_session::profile::Scope::Account(account_id.clone());
    browser_session::profile::remove_profile_dir(&app, &scope)
        .map_err(AccountManagerError::store_fail)?;
    crate::account_manager::state::log_account_operation(
        &app,
        &state,
        &account_id,
        AccountLogKind::BrowserInterop,
        AccountLogLevel::Warn,
        serde_json::json!({ "action": "clearProfile" }),
    );
    Ok(true)
}

// ═══════════════════════════════════════════════
// 站点维度互通（「账号列表头部 → 浏览器互通」入口）
//
// 与账号维度不同：站点维度实例属于「某个站点」而非「某个账号」——用户是
// 「在某个站点上登录」，此时还不知道这份登录态该归哪个账号（可能新建，也可能
// 归已有账号）。因此站点维度实例只用于「手动登录 + 回采」，不注入任何会话。
// ═══════════════════════════════════════════════

/// 以站点维度打开（或复用）托管浏览器实例，导航到站点首页供用户手动登录。
///
/// 与 `browser_session_open` 的区别：站点维度**没有可注入的会话**
/// （`injectSession` 恒为 false），仅作为「用户手动登录」的沙箱。
#[tauri::command]
pub async fn browser_session_open_station<R: Runtime>(
    app: AppHandle<R>,
    station_id: String,
    browser_id: Option<String>,
    reset_profile: bool,
) -> AccountManagerResult<BrowserOpenOutcome> {
    if let Some(id) = browser_id.as_deref() {
        if !browser_session::browser::is_supported_id(id) {
            return Err(AccountManagerError::invalid_input(format!(
                "UNSUPPORTED_BROWSER: {id}"
            )));
        }
    }
    browser_session::open_for_station(&app, &station_id, browser_id, reset_profile).await
}

/// 查询站点维度实例的运行状态。
#[tauri::command]
pub async fn browser_session_status_station<R: Runtime>(
    app: AppHandle<R>,
    station_id: String,
) -> AccountManagerResult<BrowserStatusOutcome> {
    let scope = browser_session::profile::Scope::Station(station_id);
    browser_session::status_for_scope(&app, &scope).await
}

/// 关闭站点维度实例。
#[tauri::command]
pub async fn browser_session_close_station<R: Runtime>(
    app: AppHandle<R>,
    station_id: String,
) -> AccountManagerResult<bool> {
    let scope = browser_session::profile::Scope::Station(station_id);
    Ok(browser_session::close_for_scope(&app, &scope).await)
}

/// 实时预览站点维度实例中的登录态概览（只读，不关闭实例、不写入数据）。
///
/// 供回采面板展示「当前浏览器登录态的所有信息」。
#[tauri::command]
pub async fn browser_session_preview_station<R: Runtime>(
    app: AppHandle<R>,
    station_id: String,
) -> AccountManagerResult<BrowserSessionPreview> {
    browser_session::preview_station_session(&app, &station_id).await
}

/// 从站点维度实例回采登录态并落库到目标账号。
///
/// - `target_account_id = Some(id)`：写入已有账号（走新鲜度仲裁，可能 `conflict`）。
/// - `target_account_id = None`：以 `new_username` 在该站点下**新建**账号承接登录态。
/// - `force = true`：覆盖 `conflict`（即用户二次确认「仍要覆盖」）。
///
/// 内部顺序为「采集 → 关闭实例 → 落库」；用户感知到的是「点完回采浏览器就关了」。
#[tauri::command]
pub async fn browser_session_capture_station<R: Runtime>(
    app: AppHandle<R>,
    station_id: String,
    target_account_id: Option<String>,
    new_username: Option<String>,
    new_password: Option<String>,
    force: bool,
) -> AccountManagerResult<BrowserStationCaptureOutcome> {
    browser_session::capture_for_station(
        &app,
        &station_id,
        target_account_id,
        new_username,
        new_password,
        force,
    )
    .await
}
