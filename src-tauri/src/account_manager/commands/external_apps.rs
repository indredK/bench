//! External app management commands (Phase 3): list/remove apps and bindings.

use std::collections::HashSet;

use tauri::{AppHandle, Runtime, State};

use crate::account_manager::state::AccountManagerState;
use crate::account_manager::storage;
use crate::account_manager::types::{
    AccountManagerError, AccountManagerResult, ExternalApp, ExternalAppBinding,
};

/// 列出已注册的外部 App。
///
/// - `account_id` 提供时,只返回绑定到该账号的 App
/// - `station_id` 提供时(且 `account_id` 未提供),返回绑定到该 Station
///   下任意账号的 App
/// - 两者均未提供时,返回全部外部 App
#[tauri::command]
pub fn list_external_apps(
    state: State<'_, AccountManagerState>,
    station_id: Option<String>,
    account_id: Option<String>,
) -> AccountManagerResult<Vec<ExternalApp>> {
    let snapshot = state.read_snapshot_checked()?;

    if let Some(account_id) = account_id.as_ref() {
        let bound_app_ids: HashSet<&str> = snapshot
            .external_app_bindings
            .iter()
            .filter(|b| &b.account_id == account_id)
            .map(|b| b.app_id.as_str())
            .collect();
        return Ok(snapshot
            .external_apps
            .iter()
            .filter(|a| bound_app_ids.contains(a.id.as_str()))
            .cloned()
            .collect());
    }

    if let Some(station_id) = station_id.as_ref() {
        let account_ids: HashSet<String> = snapshot
            .accounts
            .iter()
            .filter(|a| &a.station_id == station_id)
            .map(|a| a.id.clone())
            .collect();
        let bound_app_ids: HashSet<&str> = snapshot
            .external_app_bindings
            .iter()
            .filter(|b| account_ids.contains(&b.account_id))
            .map(|b| b.app_id.as_str())
            .collect();
        return Ok(snapshot
            .external_apps
            .iter()
            .filter(|a| bound_app_ids.contains(a.id.as_str()))
            .cloned()
            .collect());
    }

    Ok(snapshot.external_apps.clone())
}

/// 移除外部 App + 其所有绑定 + 账号上的引用
#[tauri::command]
pub fn remove_external_app<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    app_id: String,
) -> AccountManagerResult<()> {
    storage::with_state_mut(&app, &state, |snapshot| {
        let before = snapshot.external_apps.len();
        snapshot.external_apps.retain(|a| a.id != app_id);
        if snapshot.external_apps.len() == before {
            return Err(AccountManagerError::not_found(format!(
                "external app {app_id}"
            )));
        }
        // 同步移除该 app 的所有绑定
        snapshot
            .external_app_bindings
            .retain(|b| b.app_id != app_id);
        // 清掉账号上的 external_app_ids 引用
        for account in snapshot.accounts.iter_mut() {
            account.external_app_ids.retain(|id| id != &app_id);
        }
        Ok(())
    })
}

/// 列出外部 App 与账号的绑定关系。`account_id` 提供时只返回该账号的绑定。
#[tauri::command]
pub fn list_external_app_bindings(
    state: State<'_, AccountManagerState>,
    account_id: Option<String>,
) -> AccountManagerResult<Vec<ExternalAppBinding>> {
    let snapshot = state.read_snapshot_checked()?;
    Ok(snapshot
        .external_app_bindings
        .iter()
        .filter(|b| {
            account_id
                .as_ref()
                .map(|id| &b.account_id == id)
                .unwrap_or(true)
        })
        .cloned()
        .collect())
}
