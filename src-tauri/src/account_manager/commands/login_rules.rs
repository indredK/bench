//! Login rulepack IPC commands / 登录规则包命令:
//! 更新登录逻辑弹窗（overview）与按范围更新（all | generic | site）。

use tauri::{AppHandle, Runtime};

use crate::account_manager::login_rules::{
    self, LoginRulesOverview, LoginRulesUpdateReport, LoginRulesUpdateScope,
};
use crate::account_manager::types::{AccountManagerError, AccountManagerResult};

/// 「更新登录逻辑」弹窗数据：当前生效规则详情（generic + 当前站点）
/// 与远程可更新状态（驱动按钮可用态）。website = 当前站点 URL。
#[tauri::command]
pub async fn get_login_rules_overview<R: Runtime>(
    app: AppHandle<R>,
    website: String,
) -> AccountManagerResult<LoginRulesOverview> {
    Ok(login_rules::overview(&app, &website).await)
}

/// 按范围拉取远程规则并写入缓存：all（全部）/ generic（仅兜底）/ site（仅当前站点）。
#[tauri::command]
pub async fn update_login_rules<R: Runtime>(
    app: AppHandle<R>,
    scope: LoginRulesUpdateScope,
    website: Option<String>,
) -> AccountManagerResult<LoginRulesUpdateReport> {
    login_rules::update_login_rules(&app, scope, website.as_deref())
        .await
        .map_err(AccountManagerError::store_fail)
}
