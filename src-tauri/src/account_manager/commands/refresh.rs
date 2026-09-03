//! Session refresh orchestration: single-flight probe, station/all refresh.

use futures_util::stream::{FuturesUnordered, StreamExt};
use tauri::{AppHandle, Manager, Runtime, State};

use super::shared::{build_proxy_url_for_station, now_label};
use crate::account_manager::probe;
use crate::account_manager::state::{AccountManagerState, ProbeFlight};
use crate::account_manager::storage;
use crate::account_manager::types::{
    AccountManagerError, AccountManagerResult, AccountSessionStatus, RefreshReport, StationAccount,
};

pub(crate) async fn refresh_one_impl<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
) -> AccountManagerResult<StationAccount> {
    let flight = app
        .state::<AccountManagerState>()
        .begin_probe_flight(&account_id);
    match flight {
        ProbeFlight::Follower(follower) => follower.wait().await,
        ProbeFlight::Leader(leader) => {
            let result = refresh_one_leader(app, account_id).await;
            leader.complete(result.clone());
            result
        }
    }
}

async fn refresh_one_leader<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
) -> AccountManagerResult<StationAccount> {
    let (website, detection_config, strategy, semaphore, proxy_url) = {
        let state = app.state::<AccountManagerState>();
        let snapshot = state.read_snapshot_checked()?;
        let Some(account) = snapshot.accounts.iter().find(|a| a.id == account_id) else {
            return Err(AccountManagerError::not_found(format!(
                "account {account_id}"
            )));
        };
        let Some(station) = snapshot
            .stations
            .iter()
            .find(|s| s.id == account.station_id)
        else {
            return Err(AccountManagerError::not_found(format!(
                "station {}",
                account.station_id
            )));
        };
        // 在 snapshot 释放前构建 proxy_url（需借 station 引用）。
        let proxy_url = build_proxy_url_for_station(&app, station)?;
        (
            station.website.clone(),
            station.login_detection.clone(),
            station
                .auth_profile
                .as_ref()
                .map(|profile| profile.probe_strategy)
                .unwrap_or_default(),
            state.probe_semaphore.clone(),
            proxy_url,
        )
    };

    let _permit = semaphore
        .acquire_owned()
        .await
        .map_err(|e| AccountManagerError::store_fail(format!("acquire probe permit: {e}")))?;
    let outcome = probe::run_probe(
        &app,
        &account_id,
        &website,
        &detection_config,
        strategy,
        proxy_url.as_deref(),
    )
    .await?;
    let state = app.state::<AccountManagerState>();
    storage::with_state_mut(&app, &state, |snapshot| {
        let station_id = {
            let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) else {
                return Err(AccountManagerError::not_found(format!(
                    "account {account_id}"
                )));
            };
            account.status = outcome.status;
            account.last_refreshed_at = Some(now_label());
            account.station_id.clone()
        };
        if let Some(station) = snapshot
            .stations
            .iter_mut()
            .find(|station| station.id == station_id)
        {
            if outcome.status == AccountSessionStatus::FetchFailed {
                station.probe_failure_count = station.probe_failure_count.saturating_add(1);
            } else {
                station.probe_failure_count = 0;
            }
        }
        snapshot
            .accounts
            .iter()
            .find(|account| account.id == account_id)
            .cloned()
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))
    })
}

async fn refresh_many<R: Runtime>(app: AppHandle<R>, account_ids: Vec<String>) -> RefreshReport {
    let total = account_ids.len();
    let mut set = FuturesUnordered::new();
    for id in account_ids {
        let app_clone = app.clone();
        let id_for_err = id.clone();
        set.push(async move {
            let result = refresh_one_impl(app_clone, id).await;
            (id_for_err, result)
        });
    }

    let mut succeeded = Vec::new();
    let mut failed = Vec::new();
    while let Some((id, result)) = set.next().await {
        match result {
            Ok(account) => succeeded.push(account),
            Err(error) => {
                eprintln!("[account_manager] refresh failed for {id}: {error:?}");
                failed.push(crate::account_manager::types::RefreshFailure {
                    account_id: id,
                    error,
                });
            }
        }
    }
    RefreshReport {
        total,
        succeeded,
        failed,
    }
}

#[tauri::command]
pub async fn refresh_account<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
) -> AccountManagerResult<StationAccount> {
    refresh_one_impl(app, account_id).await
}

#[tauri::command]
pub async fn refresh_station<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
) -> AccountManagerResult<RefreshReport> {
    let account_ids: Vec<String> = state
        .read_snapshot_checked()?
        .accounts
        .into_iter()
        .filter(|a| a.station_id == station_id)
        .map(|a| a.id)
        .collect();
    Ok(refresh_many(app, account_ids).await)
}

#[tauri::command]
pub async fn refresh_all<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
) -> AccountManagerResult<RefreshReport> {
    let account_ids: Vec<String> = state
        .read_snapshot_checked()?
        .accounts
        .into_iter()
        .map(|a| a.id)
        .collect();
    Ok(refresh_many(app, account_ids).await)
}
