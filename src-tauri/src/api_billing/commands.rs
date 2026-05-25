use chrono::Local;
use rand::RngCore;
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

use super::crypto;
use super::detection;
use super::state::ApiBillingState;
use super::storage;
use super::types::{
    AccountSessionStatus, ApiBillingError, ApiBillingResult, LoginDetectionConfig, LoginMethod,
    RelayAccountExport, RelayDataExportFile, RelayDataExportResult, RelayDataImportResult,
    RelayStation, RelayStationExport, StationAccount,
};
use super::webview;

const RELAY_EXPORT_VERSION: u32 = 1;

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

fn next_unique_remark(base: &str, existing: &mut HashSet<String>) -> String {
    if existing.insert(base.to_string()) {
        return base.to_string();
    }

    let trimmed = base.trim();
    let root = if trimmed.is_empty() { "中转站" } else { trimmed };
    let mut index = 1usize;
    loop {
        let candidate = format!("{root}{index}");
        if existing.insert(candidate.clone()) {
            return candidate;
        }
        index += 1;
    }
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
    login_detection: Option<LoginDetectionConfig>,
) -> ApiBillingResult<RelayStation> {
    let station = RelayStation {
        id: new_id("stn"),
        remark: trim_or_invalid(&remark, "remark")?,
        website: trim_or_invalid(&website, "website")?,
        created_at: now_label(),
        login_detection: login_detection.unwrap_or_default(),
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
    login_detection: Option<LoginDetectionConfig>,
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
        if let Some(d) = login_detection {
            station.login_detection = d;
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
    phone: Option<String>,
    tg_account: Option<String>,
    linked_account: Option<String>,
    invite_link: Option<String>,
    login_methods: Vec<LoginMethod>,
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
        phone: normalize_optional(phone),
        tg_account: normalize_optional(tg_account),
        linked_account: normalize_optional(linked_account),
        invite_link: normalize_optional(invite_link),
        login_methods,
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
    phone: Option<Option<String>>,
    tg_account: Option<Option<String>>,
    linked_account: Option<Option<String>>,
    invite_link: Option<Option<String>>,
    login_methods: Option<Vec<LoginMethod>>,
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
        if let Some(p) = phone {
            account.phone = normalize_optional(p);
        }
        if let Some(t) = tg_account {
            account.tg_account = normalize_optional(t);
        }
        if let Some(l) = linked_account {
            account.linked_account = normalize_optional(l);
        }
        if let Some(i) = invite_link {
            account.invite_link = normalize_optional(i);
        }
        if let Some(login_methods) = login_methods {
            account.login_methods = login_methods;
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

// ───── import / export ─────

#[tauri::command]
pub fn export_relay_data(
    state: State<'_, ApiBillingState>,
    path: String,
) -> ApiBillingResult<RelayDataExportResult> {
    let stations = state.stations.lock().unwrap().clone();
    let accounts = state.accounts.lock().unwrap().clone();
    let secrets = state.secrets.lock().unwrap().clone();
    let key = if secrets.is_empty() {
        None
    } else {
        Some(state.master_key()?)
    };

    let mut exported_accounts = 0usize;
    let stations = stations
        .into_iter()
        .map(|station| {
            let station_accounts = accounts
                .iter()
                .filter(|account| account.station_id == station.id)
                .map(|account| {
                    exported_accounts += 1;
                    let password = match (secrets.get(&account.id), key) {
                        (Some(blob), Some(k)) => Some(crypto::decrypt(&k, blob)?),
                        _ => None,
                    };
                    Ok(RelayAccountExport {
                        username: account.username.clone(),
                        password,
                        notes: account.notes.clone(),
                        phone: account.phone.clone(),
                        tg_account: account.tg_account.clone(),
                        linked_account: account.linked_account.clone(),
                        invite_link: account.invite_link.clone(),
                        login_methods: account.login_methods.clone(),
                        status: account.status,
                        last_login_at: account.last_login_at.clone(),
                        last_refreshed_at: account.last_refreshed_at.clone(),
                        created_at: Some(account.created_at.clone()),
                    })
                })
                .collect::<ApiBillingResult<Vec<_>>>()?;

            Ok(RelayStationExport {
                remark: station.remark,
                website: station.website,
                created_at: Some(station.created_at),
                login_detection: station.login_detection,
                accounts: station_accounts,
            })
        })
        .collect::<ApiBillingResult<Vec<_>>>()?;

    let export = RelayDataExportFile {
        version: RELAY_EXPORT_VERSION,
        exported_at: now_label(),
        stations,
    };
    let body = serde_json::to_string_pretty(&export)
        .map_err(|e| ApiBillingError::store_fail(format!("serialize export: {e}")))?;
    std::fs::write(&path, body)
        .map_err(|e| ApiBillingError::store_fail(format!("write export {path}: {e}")))?;

    Ok(RelayDataExportResult {
        station_count: export.stations.len(),
        account_count: exported_accounts,
    })
}

#[tauri::command]
pub fn import_relay_data<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    path: String,
) -> ApiBillingResult<RelayDataImportResult> {
    let body = std::fs::read_to_string(&path)
        .map_err(|e| ApiBillingError::store_fail(format!("read import {path}: {e}")))?;
    let data: RelayDataExportFile = serde_json::from_str(&body)
        .map_err(|e| ApiBillingError::invalid_input(format!("invalid import file: {e}")))?;

    let mut imported_stations: Vec<RelayStation> = Vec::new();
    let mut imported_accounts: Vec<StationAccount> = Vec::new();
    let mut imported_secrets: HashMap<String, super::crypto::EncryptedBlob> = HashMap::new();

    let mut existing_remarks: HashSet<String> = {
        state
            .stations
            .lock()
            .unwrap()
            .iter()
            .map(|station| station.remark.clone())
            .collect()
    };

    let key = state.master_key()?;

    for station in data.stations {
        let station_remark = trim_or_invalid(&station.remark, "remark")?;
        let unique_remark = next_unique_remark(&station_remark, &mut existing_remarks);
        let station_id = new_id("stn");
        imported_stations.push(RelayStation {
            id: station_id.clone(),
            remark: unique_remark,
            website: trim_or_invalid(&station.website, "website")?,
            created_at: station.created_at.unwrap_or_else(now_label),
            login_detection: station.login_detection,
        });

        for account in station.accounts {
            let account_id = new_id("acct");
            let password = normalize_optional(account.password);
            imported_accounts.push(StationAccount {
                id: account_id.clone(),
                station_id: station_id.clone(),
                username: trim_or_invalid(&account.username, "username")?,
                notes: account.notes.trim().to_string(),
                phone: account.phone.clone(),
                tg_account: account.tg_account.clone(),
                linked_account: account.linked_account.clone(),
                invite_link: account.invite_link.clone(),
                login_methods: account.login_methods.clone(),
                status: account.status,
                last_login_at: account.last_login_at,
                last_refreshed_at: account.last_refreshed_at,
                created_at: account.created_at.unwrap_or_else(now_label),
                has_password: password.is_some(),
            });
            if let Some(password) = password {
                imported_secrets.insert(account_id, crypto::encrypt(&key, &password)?);
            }
        }
    }

    let (stations_snapshot, accounts_snapshot, secrets_snapshot) = {
        let mut stations = state.stations.lock().unwrap();
        let mut accounts = state.accounts.lock().unwrap();
        let mut secrets = state.secrets.lock().unwrap();

        stations.extend(imported_stations);
        accounts.extend(imported_accounts);
        secrets.extend(imported_secrets);

        (stations.clone(), accounts.clone(), secrets.clone())
    };

    storage::save_stations(&app, &stations_snapshot)?;
    storage::save_accounts(&app, &accounts_snapshot)?;
    storage::save_secrets(&app, &secrets_snapshot)?;

    Ok(RelayDataImportResult {
        station_count: stations_snapshot.len(),
        account_count: accounts_snapshot.len(),
        stations: stations_snapshot,
        accounts: accounts_snapshot,
    })
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

// ───── session refresh ─────

async fn refresh_one_impl<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
) -> ApiBillingResult<StationAccount> {
    let (website, detection_config, semaphore) = {
        let state = app.state::<ApiBillingState>();
        let stations = state.stations.lock().unwrap();
        let accounts = state.accounts.lock().unwrap();
        let Some(account) = accounts.iter().find(|a| a.id == account_id) else {
            return Err(ApiBillingError::not_found(format!("account {account_id}")));
        };
        let Some(station) = stations.iter().find(|s| s.id == account.station_id) else {
            return Err(ApiBillingError::not_found(format!(
                "station {}",
                account.station_id
            )));
        };
        (
            station.website.clone(),
            station.login_detection.clone(),
            state.probe_semaphore.clone(),
        )
    };

    let _permit = semaphore
        .acquire_owned()
        .await
        .map_err(|e| ApiBillingError::store_fail(format!("acquire probe permit: {e}")))?;
    let text = webview::run_probe(&app, &account_id, &website).await?;
    let status = detection::classify(&text, &detection_config);

    let (snapshot, updated) = {
        let state = app.state::<ApiBillingState>();
        let mut accounts = state.accounts.lock().unwrap();
        let Some(a) = accounts.iter_mut().find(|a| a.id == account_id) else {
            return Err(ApiBillingError::not_found(format!("account {account_id}")));
        };
        a.status = status;
        a.last_refreshed_at = Some(now_label());
        let updated = a.clone();
        (accounts.clone(), updated)
    };
    storage::save_accounts(&app, &snapshot)?;
    Ok(updated)
}

async fn refresh_many<R: Runtime>(
    app: AppHandle<R>,
    account_ids: Vec<String>,
) -> Vec<StationAccount> {
    let mut set = tokio::task::JoinSet::new();
    for id in account_ids {
        let app_clone = app.clone();
        let id_for_err = id.clone();
        set.spawn(async move {
            let result = refresh_one_impl(app_clone, id).await;
            (id_for_err, result)
        });
    }

    let mut results = Vec::new();
    while let Some(join_res) = set.join_next().await {
        match join_res {
            Ok((_id, Ok(account))) => results.push(account),
            Ok((id, Err(err))) => {
                eprintln!("[api_billing] refresh failed for {id}: {err:?}");
            }
            Err(join_err) => {
                eprintln!("[api_billing] join error: {join_err:?}");
            }
        }
    }
    results
}

#[tauri::command]
pub async fn refresh_account<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
) -> ApiBillingResult<StationAccount> {
    refresh_one_impl(app, account_id).await
}

#[tauri::command]
pub async fn refresh_station<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    station_id: String,
) -> ApiBillingResult<Vec<StationAccount>> {
    let account_ids: Vec<String> = state
        .accounts
        .lock()
        .unwrap()
        .iter()
        .filter(|a| a.station_id == station_id)
        .map(|a| a.id.clone())
        .collect();
    Ok(refresh_many(app, account_ids).await)
}

#[tauri::command]
pub async fn refresh_all<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
) -> ApiBillingResult<Vec<StationAccount>> {
    let account_ids: Vec<String> = state
        .accounts
        .lock()
        .unwrap()
        .iter()
        .map(|a| a.id.clone())
        .collect();
    Ok(refresh_many(app, account_ids).await)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_unique_remark_appends_numeric_suffix() {
        let mut existing = HashSet::from([
            "Alpha".to_string(),
            "Alpha1".to_string(),
            "Alpha2".to_string(),
        ]);
        assert_eq!(next_unique_remark("Alpha", &mut existing), "Alpha3");
        assert!(existing.contains("Alpha3"));
    }
}
