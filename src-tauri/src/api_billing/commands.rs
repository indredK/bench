use chrono::Local;
use rand::RngCore;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

use super::crypto;
use super::state::ApiBillingState;
use super::storage;
use super::types::{
    AccountSessionStatus, ApiBillingError, ApiBillingResult, RelayStation, StationAccount,
};
use super::webview;

fn new_id(prefix: &str) -> String {
    let mut bytes = [0u8; 4];
    rand::thread_rng().fill_bytes(&mut bytes);
    let suffix: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
    format!("{prefix}-{suffix}")
}

fn now_label() -> String {
    Local::now().format("%Y-%m-%d %H:%M").to_string()
}

fn trim_or_invalid(input: &str, field: &str) -> ApiBillingResult<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(ApiBillingError::invalid_input(format!("{field} is required")));
    }
    Ok(trimmed.to_string())
}

fn normalize_optional(input: Option<String>) -> Option<String> {
    input.and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    })
}

// ───── stations ─────

#[tauri::command]
pub fn list_stations(state: State<'_, ApiBillingState>) -> Vec<RelayStation> {
    state.stations.lock().unwrap().clone()
}

#[tauri::command]
pub fn create_station<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    remark: String,
    website: String,
    probe_url: Option<String>,
) -> ApiBillingResult<RelayStation> {
    let station = RelayStation {
        id: new_id("stn"),
        remark: trim_or_invalid(&remark, "remark")?,
        website: trim_or_invalid(&website, "website")?,
        probe_url: normalize_optional(probe_url),
        created_at: now_label(),
    };
    let snapshot = {
        let mut stations = state.stations.lock().unwrap();
        stations.push(station.clone());
        stations.clone()
    };
    storage::save_stations(&app, &snapshot)?;
    Ok(station)
}

#[tauri::command]
pub fn update_station<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    id: String,
    remark: Option<String>,
    website: Option<String>,
    probe_url: Option<Option<String>>,
) -> ApiBillingResult<RelayStation> {
    let snapshot = {
        let mut stations = state.stations.lock().unwrap();
        let Some(station) = stations.iter_mut().find(|s| s.id == id) else {
            return Err(ApiBillingError::not_found(format!("station {id}")));
        };
        if let Some(r) = remark {
            station.remark = trim_or_invalid(&r, "remark")?;
        }
        if let Some(w) = website {
            station.website = trim_or_invalid(&w, "website")?;
        }
        if let Some(p) = probe_url {
            station.probe_url = normalize_optional(p);
        }
        let updated = station.clone();
        let snapshot = stations.clone();
        (snapshot, updated)
    };
    let (stations_snapshot, updated) = snapshot;
    storage::save_stations(&app, &stations_snapshot)?;
    Ok(updated)
}

#[tauri::command]
pub fn delete_station<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    id: String,
) -> ApiBillingResult<()> {
    let (stations_snapshot, accounts_snapshot, secrets_snapshot, dropped_account_ids) = {
        let mut stations = state.stations.lock().unwrap();
        let before = stations.len();
        stations.retain(|s| s.id != id);
        if stations.len() == before {
            return Err(ApiBillingError::not_found(format!("station {id}")));
        }

        let mut accounts = state.accounts.lock().unwrap();
        let mut secrets = state.secrets.lock().unwrap();
        let mut dropped_account_ids: Vec<String> = Vec::new();
        accounts.retain(|a| {
            if a.station_id == id {
                dropped_account_ids.push(a.id.clone());
                false
            } else {
                true
            }
        });
        for aid in &dropped_account_ids {
            secrets.remove(aid);
        }

        (
            stations.clone(),
            accounts.clone(),
            secrets.clone(),
            dropped_account_ids,
        )
    };

    storage::save_stations(&app, &stations_snapshot)?;
    if !dropped_account_ids.is_empty() {
        storage::save_accounts(&app, &accounts_snapshot)?;
        storage::save_secrets(&app, &secrets_snapshot)?;
        for aid in &dropped_account_ids {
            super::webview::remove_account_data_dir(&app, aid);
        }
    }
    Ok(())
}

// ───── accounts ─────

#[tauri::command]
pub fn list_accounts(
    state: State<'_, ApiBillingState>,
    station_id: String,
) -> Vec<StationAccount> {
    state
        .accounts
        .lock()
        .unwrap()
        .iter()
        .filter(|a| a.station_id == station_id)
        .cloned()
        .collect()
}

#[tauri::command]
pub fn list_all_accounts(state: State<'_, ApiBillingState>) -> Vec<StationAccount> {
    state.accounts.lock().unwrap().clone()
}

#[tauri::command]
pub fn create_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    station_id: String,
    username: String,
    password: Option<String>,
    notes: String,
) -> ApiBillingResult<StationAccount> {
    {
        let stations = state.stations.lock().unwrap();
        if !stations.iter().any(|s| s.id == station_id) {
            return Err(ApiBillingError::not_found(format!("station {station_id}")));
        }
    }

    let password = normalize_optional(password);
    let has_password = password.is_some();
    let account = StationAccount {
        id: new_id("acct"),
        station_id,
        username: trim_or_invalid(&username, "username")?,
        notes: notes.trim().to_string(),
        status: AccountSessionStatus::LoginRequired,
        last_login_at: None,
        last_refreshed_at: None,
        created_at: now_label(),
        has_password,
    };

    let (accounts_snapshot, secrets_snapshot, persist_secrets) = {
        let mut accounts = state.accounts.lock().unwrap();
        accounts.push(account.clone());
        let mut secrets = state.secrets.lock().unwrap();
        if let Some(pw) = password {
            let key = state.master_key()?;
            let blob = crypto::encrypt(&key, &pw)?;
            secrets.insert(account.id.clone(), blob);
            (accounts.clone(), secrets.clone(), true)
        } else {
            (accounts.clone(), secrets.clone(), false)
        }
    };

    storage::save_accounts(&app, &accounts_snapshot)?;
    if persist_secrets {
        storage::save_secrets(&app, &secrets_snapshot)?;
    }
    Ok(account)
}

#[tauri::command]
pub fn update_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    id: String,
    username: Option<String>,
    notes: Option<String>,
) -> ApiBillingResult<StationAccount> {
    let (accounts_snapshot, updated) = {
        let mut accounts = state.accounts.lock().unwrap();
        let Some(account) = accounts.iter_mut().find(|a| a.id == id) else {
            return Err(ApiBillingError::not_found(format!("account {id}")));
        };
        if let Some(u) = username {
            account.username = trim_or_invalid(&u, "username")?;
        }
        if let Some(n) = notes {
            account.notes = n.trim().to_string();
        }
        let updated = account.clone();
        (accounts.clone(), updated)
    };
    storage::save_accounts(&app, &accounts_snapshot)?;
    Ok(updated)
}

#[tauri::command]
pub fn delete_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    id: String,
) -> ApiBillingResult<()> {
    let (accounts_snapshot, secrets_snapshot, removed) = {
        let mut accounts = state.accounts.lock().unwrap();
        let before = accounts.len();
        accounts.retain(|a| a.id != id);
        if accounts.len() == before {
            return Err(ApiBillingError::not_found(format!("account {id}")));
        }
        let mut secrets = state.secrets.lock().unwrap();
        let removed = secrets.remove(&id).is_some();
        (accounts.clone(), secrets.clone(), removed)
    };
    storage::save_accounts(&app, &accounts_snapshot)?;
    if removed {
        storage::save_secrets(&app, &secrets_snapshot)?;
    }
    super::webview::remove_account_data_dir(&app, &id);
    Ok(())
}

// ───── secrets (P1: AES-256-GCM encrypted at rest) ─────

#[tauri::command]
pub fn reveal_password(
    state: State<'_, ApiBillingState>,
    account_id: String,
) -> ApiBillingResult<String> {
    let blob = {
        let secrets = state.secrets.lock().unwrap();
        secrets
            .get(&account_id)
            .cloned()
            .ok_or_else(|| ApiBillingError::not_found(format!("password for {account_id}")))?
    };
    let key = state.master_key()?;
    crypto::decrypt(&key, &blob)
}

#[tauri::command]
pub fn set_password<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    account_id: String,
    password: String,
) -> ApiBillingResult<()> {
    {
        let accounts = state.accounts.lock().unwrap();
        if !accounts.iter().any(|a| a.id == account_id) {
            return Err(ApiBillingError::not_found(format!("account {account_id}")));
        }
    }

    let blob = if password.is_empty() {
        None
    } else {
        let key = state.master_key()?;
        Some(crypto::encrypt(&key, &password)?)
    };

    let (accounts_snapshot, secrets_snapshot) = {
        let mut secrets = state.secrets.lock().unwrap();
        let mut accounts = state.accounts.lock().unwrap();
        match blob {
            Some(b) => {
                secrets.insert(account_id.clone(), b);
            }
            None => {
                secrets.remove(&account_id);
            }
        }
        let has = secrets.contains_key(&account_id);
        if let Some(a) = accounts.iter_mut().find(|a| a.id == account_id) {
            a.has_password = has;
        }
        (accounts.clone(), secrets.clone())
    };
    storage::save_accounts(&app, &accounts_snapshot)?;
    storage::save_secrets(&app, &secrets_snapshot)?;
    Ok(())
}

#[tauri::command]
pub fn clear_password<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    account_id: String,
) -> ApiBillingResult<()> {
    set_password(app, state, account_id, String::new())
}

#[tauri::command]
pub fn copy_password_to_clipboard<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    account_id: String,
) -> ApiBillingResult<()> {
    let blob = {
        let secrets = state.secrets.lock().unwrap();
        secrets
            .get(&account_id)
            .cloned()
            .ok_or_else(|| ApiBillingError::not_found(format!("password for {account_id}")))?
    };
    let key = state.master_key()?;
    let plaintext = crypto::decrypt(&key, &blob)?;
    app.clipboard()
        .write_text(plaintext)
        .map_err(|e| ApiBillingError::clipboard_fail(e.to_string()))?;
    Ok(())
}

// ───── session (P3: hidden probe + refresh_* + 并发限流) ─────

fn classify(status: u16) -> AccountSessionStatus {
    if (200..300).contains(&status) {
        AccountSessionStatus::Ready
    } else if status == 401 || status == 403 {
        AccountSessionStatus::LoginRequired
    } else {
        AccountSessionStatus::Expired
    }
}

async fn do_refresh_one<R: Runtime>(
    app: &AppHandle<R>,
    _state: &ApiBillingState,
    account: &StationAccount,
    stations: &[RelayStation],
) -> ApiBillingResult<AccountSessionStatus> {
    let station = stations
        .iter()
        .find(|s| s.id == account.station_id)
        .ok_or_else(|| ApiBillingError::not_found(format!("station {}", account.station_id)))?;

    let Some(probe_url) = &station.probe_url else {
        return Ok(account.status);
    };

    let status_code = webview::run_probe(app, &account.id, &station.website, probe_url).await?;
    Ok(classify(status_code))
}

#[tauri::command]
pub async fn refresh_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    account_id: String,
) -> ApiBillingResult<StationAccount> {
    let sem = state.probe_semaphore.clone();
    let _permit = sem.acquire().await.map_err(|e| {
        ApiBillingError::probe_network(format!("semaphore closed: {e}"), None)
    })?;

    let (account, stations) = {
        let accounts = state.accounts.lock().unwrap();
        let account = accounts
            .iter()
            .find(|a| a.id == account_id)
            .cloned()
            .ok_or_else(|| ApiBillingError::not_found(format!("account {account_id}")))?;
        let stations = state.stations.lock().unwrap().clone();
        (account, stations)
    };

    let new_status = do_refresh_one(&app, &state, &account, &stations).await?;

    let (accounts_snapshot, updated) = {
        let mut accounts = state.accounts.lock().unwrap();
        let Some(a) = accounts.iter_mut().find(|a| a.id == account_id) else {
            return Err(ApiBillingError::not_found(format!("account {account_id}")));
        };
        a.status = new_status;
        a.last_refreshed_at = Some(now_label());
        let updated = a.clone();
        (accounts.clone(), updated)
    };
    storage::save_accounts(&app, &accounts_snapshot)?;
    Ok(updated)
}

#[tauri::command]
pub async fn refresh_station<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    station_id: String,
) -> ApiBillingResult<Vec<StationAccount>> {
    let subset: Vec<StationAccount> = {
        state
            .accounts
            .lock()
            .unwrap()
            .iter()
            .filter(|a| a.station_id == station_id)
            .cloned()
            .collect()
    };
    let stations = state.stations.lock().unwrap().clone();

    let sem = state.probe_semaphore.clone();
    let mut results: Vec<(String, AccountSessionStatus)> = Vec::new();
    for acct in &subset {
        let _permit = sem.acquire().await.map_err(|e| {
            ApiBillingError::probe_network(format!("semaphore closed: {e}"), None)
        })?;
        let station = stations
            .iter()
            .find(|s| s.id == acct.station_id)
            .ok_or_else(|| ApiBillingError::not_found(format!("station {}", acct.station_id)))?;
        if let Some(probe_url) = &station.probe_url {
            let status_code =
                webview::run_probe(&app, &acct.id, &station.website, probe_url).await?;
            results.push((acct.id.clone(), classify(status_code)));
        } else {
            results.push((acct.id.clone(), acct.status));
        }
    }

    let snapshot = {
        let mut accounts = state.accounts.lock().unwrap();
        let now = now_label();
        for (id, status) in &results {
            if let Some(a) = accounts.iter_mut().find(|a| &a.id == id) {
                a.status = *status;
                a.last_refreshed_at = Some(now.clone());
            }
        }
        accounts.clone()
    };
    storage::save_accounts(&app, &snapshot)?;

    Ok(snapshot
        .into_iter()
        .filter(|a| a.station_id == station_id)
        .collect())
}

#[tauri::command]
pub async fn refresh_all<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
) -> ApiBillingResult<Vec<StationAccount>> {
    let all_accounts = state.accounts.lock().unwrap().clone();
    let stations = state.stations.lock().unwrap().clone();

    let sem = state.probe_semaphore.clone();
    let mut results: Vec<(String, AccountSessionStatus)> = Vec::new();
    for acct in &all_accounts {
        let _permit = sem.acquire().await.map_err(|e| {
            ApiBillingError::probe_network(format!("semaphore closed: {e}"), None)
        })?;
        let station = stations
            .iter()
            .find(|s| s.id == acct.station_id)
            .ok_or_else(|| ApiBillingError::not_found(format!("station {}", acct.station_id)))?;
        if let Some(probe_url) = &station.probe_url {
            let status_code =
                webview::run_probe(&app, &acct.id, &station.website, probe_url).await?;
            results.push((acct.id.clone(), classify(status_code)));
        } else {
            results.push((acct.id.clone(), acct.status));
        }
    }

    let snapshot = {
        let mut accounts = state.accounts.lock().unwrap();
        let now = now_label();
        for (id, status) in &results {
            if let Some(a) = accounts.iter_mut().find(|a| &a.id == id) {
                a.status = *status;
                a.last_refreshed_at = Some(now.clone());
            }
        }
        accounts.clone()
    };
    storage::save_accounts(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn open_login_window<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    account_id: String,
) -> ApiBillingResult<()> {
    let (username, website) = {
        let accounts = state.accounts.lock().unwrap();
        let account = accounts
            .iter()
            .find(|a| a.id == account_id)
            .ok_or_else(|| ApiBillingError::not_found(format!("account {account_id}")))?;
        let stations = state.stations.lock().unwrap();
        let station = stations
            .iter()
            .find(|s| s.id == account.station_id)
            .ok_or_else(|| ApiBillingError::not_found(format!("station {}", account.station_id)))?;
        (account.username.clone(), station.website.clone())
    };
    webview::open_login_window(&app, &account_id, &username, &website)
}

#[tauri::command]
pub fn mark_account_logged_in<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    account_id: String,
) -> ApiBillingResult<StationAccount> {
    let (snapshot, updated) = {
        let mut accounts = state.accounts.lock().unwrap();
        let Some(a) = accounts.iter_mut().find(|a| a.id == account_id) else {
            return Err(ApiBillingError::not_found(format!("account {account_id}")));
        };
        a.status = AccountSessionStatus::Ready;
        a.last_login_at = Some(now_label());
        let updated = a.clone();
        (accounts.clone(), updated)
    };
    storage::save_accounts(&app, &snapshot)?;
    Ok(updated)
}
