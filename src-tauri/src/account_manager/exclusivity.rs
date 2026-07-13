//! 多账号互斥引擎 — exclusive / coexisting / rotating
//!
//! 当前实现仅做状态层面的互斥管理（标记冲突账号为 LoginRequired / Inactive）。
//! 未来若需要通过 WebView 执行真实登出，可将相关函数改为 async。
use tauri::{AppHandle, Manager, Runtime};

use super::state::AccountManagerState;
use super::storage;
use super::types::*;

/// 在执行新登录前处理互斥逻辑。
///
/// - `Coexisting`: 无限制
/// - `Exclusive`: 将同站其它 Ready 账号标记为 LoginRequired 并清除 session
/// - `Rotating`: 将同站其它 Ready 账号降级为 Inactive（保留 session）
pub fn enforce_exclusivity_before_login<R: Runtime>(
    app: &AppHandle<R>,
    station: &RelayStation,
    new_account_id: &str,
) -> AccountManagerResult<()> {
    match station.exclusivity_mode {
        ExclusivityMode::Coexisting => Ok(()),
        ExclusivityMode::Exclusive => logout_conflicting_accounts(app, station, new_account_id),
        ExclusivityMode::Rotating => deactivate_active_account(app, station, new_account_id),
    }
}

/// Exclusive 模式：登出当前活跃的其它账号（清除 session 并标记需重新登录）。
fn logout_conflicting_accounts<R: Runtime>(
    app: &AppHandle<R>,
    station: &RelayStation,
    exclude_account_id: &str,
) -> AccountManagerResult<()> {
    let state = app.state::<AccountManagerState>();
    let revoked = storage::with_state_mut(app, &state, |snapshot| {
        let mut revoked = Vec::new();
        for account in snapshot.accounts.iter_mut() {
            if account.station_id == station.id
                && account.id != exclude_account_id
                && account.status == AccountSessionStatus::Ready
            {
                account.status = AccountSessionStatus::LoginRequired;
                account.session = None;
                revoked.push(account.id.clone());
            }
        }
        for account_id in &revoked {
            snapshot.sessions.remove(account_id);
        }
        Ok(revoked)
    })?;
    for account_id in revoked {
        super::webview::remove_account_data_dir(app, &account_id)?;
    }
    Ok(())
}

/// Rotating 模式：取消当前活跃账号的激活状态（保留 session，仅标记 Inactive）。
fn deactivate_active_account<R: Runtime>(
    app: &AppHandle<R>,
    station: &RelayStation,
    new_account_id: &str,
) -> AccountManagerResult<()> {
    let state = app.state::<AccountManagerState>();
    storage::with_state_mut(app, &state, |snapshot| {
        for account in snapshot.accounts.iter_mut() {
            if account.station_id == station.id
                && account.id != new_account_id
                && account.status == AccountSessionStatus::Ready
            {
                account.status = AccountSessionStatus::Inactive;
            }
        }
        Ok(())
    })
}
