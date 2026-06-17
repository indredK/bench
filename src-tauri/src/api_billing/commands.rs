use chrono::Local;
use rand::RngCore;
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

use super::crypto;
use super::probe;
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

trait HasId {
    fn id(&self) -> &str;
}

impl HasId for RelayStation {
    fn id(&self) -> &str {
        &self.id
    }
}

impl HasId for StationAccount {
    fn id(&self) -> &str {
        &self.id
    }
}

/// Validate that `ordered_ids` is an exact permutation of the ids in `current`,
/// then return `current` reordered to match. Rejects duplicates, missing ids,
/// and unknown ids — all map to `INVALID_INPUT`.
fn reorder_by_ids<T: HasId + Clone>(
    current: &[T],
    ordered_ids: &[String],
    label: &str,
) -> ApiBillingResult<Vec<T>> {
    if ordered_ids.len() != current.len() {
        return Err(ApiBillingError::invalid_input(format!(
            "{label} reorder length mismatch: got {}, expected {}",
            ordered_ids.len(),
            current.len()
        )));
    }
    let mut seen: HashSet<&str> = HashSet::with_capacity(ordered_ids.len());
    for id in ordered_ids {
        if !seen.insert(id.as_str()) {
            return Err(ApiBillingError::invalid_input(format!(
                "{label} reorder duplicate id: {id}"
            )));
        }
    }
    let mut by_id: HashMap<&str, T> =
        current.iter().map(|item| (item.id(), item.clone())).collect();
    let mut out: Vec<T> = Vec::with_capacity(ordered_ids.len());
    for id in ordered_ids {
        let Some(item) = by_id.remove(id.as_str()) else {
            return Err(ApiBillingError::invalid_input(format!(
                "{label} reorder unknown id: {id}"
            )));
        };
        out.push(item);
    }
    Ok(out)
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
    storage::with_state_mut(&app, &state, |snapshot| {
        snapshot.stations.push(station.clone());
        Ok(station.clone())
    })
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
    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(station) = snapshot.stations.iter_mut().find(|s| s.id == id) else {
            return Err(ApiBillingError::not_found(format!("station {id}")));
        };
        if let Some(r) = remark.as_ref() {
            station.remark = trim_or_invalid(r, "remark")?;
        }
        if let Some(w) = website.as_ref() {
            station.website = trim_or_invalid(w, "website")?;
        }
        if let Some(d) = login_detection.clone() {
            station.login_detection = d;
        }
        Ok(station.clone())
    })
}

#[tauri::command]
pub fn delete_station<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    id: String,
) -> ApiBillingResult<()> {
    let dropped_account_ids = storage::with_state_mut(&app, &state, |snapshot| {
        let before = snapshot.stations.len();
        snapshot.stations.retain(|s| s.id != id);
        if snapshot.stations.len() == before {
            return Err(ApiBillingError::not_found(format!("station {id}")));
        }

        let mut dropped_account_ids: Vec<String> = Vec::new();
        snapshot.accounts.retain(|a| {
            if a.station_id == id {
                dropped_account_ids.push(a.id.clone());
                false
            } else {
                true
            }
        });
        for aid in &dropped_account_ids {
            snapshot.secrets.remove(aid);
        }

        Ok(dropped_account_ids)
    })?;

    for aid in &dropped_account_ids {
        super::webview::remove_account_data_dir(&app, aid);
    }
    Ok(())
}

#[tauri::command]
pub fn reorder_stations<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    ordered_ids: Vec<String>,
) -> ApiBillingResult<Vec<RelayStation>> {
    storage::with_state_mut(&app, &state, |snapshot| {
        snapshot.stations = reorder_by_ids(&snapshot.stations, &ordered_ids, "station")?;
        Ok(snapshot.stations.clone())
    })
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
#[allow(clippy::too_many_arguments)]
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
    let password = normalize_optional(password);
    let encrypted_password = match password {
        Some(pw) => {
            let key = state.master_key()?;
            Some(crypto::encrypt(&key, &pw)?)
        }
        None => None,
    };
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
        has_password: encrypted_password.is_some(),
    };

    storage::with_state_mut(&app, &state, |snapshot| {
        if !snapshot.stations.iter().any(|s| s.id == account.station_id) {
            return Err(ApiBillingError::not_found(format!("station {}", account.station_id)));
        }
        snapshot.accounts.push(account.clone());
        if let Some(blob) = encrypted_password.clone() {
            snapshot.secrets.insert(account.id.clone(), blob);
        }
        Ok(account.clone())
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
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
    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == id) else {
            return Err(ApiBillingError::not_found(format!("account {id}")));
        };
        if let Some(u) = username.as_ref() {
            account.username = trim_or_invalid(u, "username")?;
        }
        if let Some(n) = notes.as_ref() {
            account.notes = n.trim().to_string();
        }
        if let Some(p) = phone.clone() {
            account.phone = normalize_optional(p);
        }
        if let Some(t) = tg_account.clone() {
            account.tg_account = normalize_optional(t);
        }
        if let Some(l) = linked_account.clone() {
            account.linked_account = normalize_optional(l);
        }
        if let Some(i) = invite_link.clone() {
            account.invite_link = normalize_optional(i);
        }
        if let Some(methods) = login_methods.clone() {
            account.login_methods = methods;
        }
        Ok(account.clone())
    })
}

#[tauri::command]
pub fn delete_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    id: String,
) -> ApiBillingResult<()> {
    storage::with_state_mut(&app, &state, |snapshot| {
        let before = snapshot.accounts.len();
        snapshot.accounts.retain(|a| a.id != id);
        if snapshot.accounts.len() == before {
            return Err(ApiBillingError::not_found(format!("account {id}")));
        }
        snapshot.secrets.remove(&id);
        Ok(())
    })?;
    super::webview::remove_account_data_dir(&app, &id);
    Ok(())
}

#[tauri::command]
pub fn reorder_accounts<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ApiBillingState>,
    station_id: String,
    ordered_ids: Vec<String>,
) -> ApiBillingResult<Vec<StationAccount>> {
    storage::with_state_mut(&app, &state, |snapshot| {
        if !snapshot.stations.iter().any(|s| s.id == station_id) {
            return Err(ApiBillingError::not_found(format!("station {station_id}")));
        }

        let (mine, others): (Vec<StationAccount>, Vec<StationAccount>) = snapshot
            .accounts
            .iter()
            .cloned()
            .partition(|a| a.station_id == station_id);
        let mine_reordered = reorder_by_ids(&mine, &ordered_ids, "account")?;

        let mut mine_iter = mine_reordered.into_iter();
        let mut others_iter = others.into_iter();
        let mut next: Vec<StationAccount> = Vec::with_capacity(snapshot.accounts.len());
        for original in &snapshot.accounts {
            if original.station_id == station_id {
                next.push(
                    mine_iter
                        .next()
                        .expect("reorder_by_ids returns same-length vec"),
                );
            } else {
                next.push(
                    others_iter
                        .next()
                        .expect("partition preserved this element"),
                );
            }
        }
        snapshot.accounts = next;
        Ok(snapshot
            .accounts
            .iter()
            .filter(|a| a.station_id == station_id)
            .cloned()
            .collect::<Vec<_>>())
    })
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

    let key = state.master_key()?;

    storage::with_state_mut(&app, &state, move |snapshot| {
        let mut existing_remarks: HashSet<String> =
            snapshot.stations.iter().map(|station| station.remark.clone()).collect();

        let mut imported_stations: Vec<RelayStation> = Vec::new();
        let mut imported_accounts: Vec<StationAccount> = Vec::new();
        let mut imported_secrets: HashMap<String, super::crypto::EncryptedBlob> = HashMap::new();

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

        snapshot.stations.extend(imported_stations);
        snapshot.accounts.extend(imported_accounts);
        snapshot.secrets.extend(imported_secrets);

        Ok(RelayDataImportResult {
            station_count: snapshot.stations.len(),
            account_count: snapshot.accounts.len(),
            stations: snapshot.stations.clone(),
            accounts: snapshot.accounts.clone(),
        })
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
    let blob = if password.is_empty() {
        None
    } else {
        let key = state.master_key()?;
        Some(crypto::encrypt(&key, &password)?)
    };

    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) else {
            return Err(ApiBillingError::not_found(format!("account {account_id}")));
        };
        match blob.clone() {
            Some(encrypted) => {
                snapshot.secrets.insert(account_id.clone(), encrypted);
            }
            None => {
                snapshot.secrets.remove(&account_id);
            }
        }
        account.has_password = snapshot.secrets.contains_key(&account_id);
        Ok(())
    })
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
    let outcome = probe::run_probe(&app, &account_id, &website, &detection_config).await?;
    let state = app.state::<ApiBillingState>();
    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) else {
            return Err(ApiBillingError::not_found(format!("account {account_id}")));
        };
        account.status = outcome.status;
        account.last_refreshed_at = Some(now_label());
        Ok(account.clone())
    })
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
        let stations = state.stations.lock().unwrap();
        let accounts = state.accounts.lock().unwrap();
        let account = accounts
            .iter()
            .find(|a| a.id == account_id)
            .ok_or_else(|| ApiBillingError::not_found(format!("account {account_id}")))?;
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
    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) else {
            return Err(ApiBillingError::not_found(format!("account {account_id}")));
        };
        account.status = AccountSessionStatus::Ready;
        account.last_login_at = Some(now_label());
        Ok(account.clone())
    })
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

    fn make_station(id: &str) -> RelayStation {
        RelayStation {
            id: id.to_string(),
            remark: id.to_string(),
            website: format!("https://{id}.test"),
            created_at: "2026-01-01 00:00".to_string(),
            login_detection: super::super::types::LoginDetectionConfig::default(),
        }
    }

    #[test]
    fn reorder_by_ids_returns_items_in_requested_order() {
        let current = vec![make_station("a"), make_station("b"), make_station("c")];
        let ordered_ids = vec!["c".to_string(), "a".to_string(), "b".to_string()];
        let out = reorder_by_ids(&current, &ordered_ids, "station").expect("ok");
        let ids: Vec<&str> = out.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec!["c", "a", "b"]);
    }

    #[test]
    fn reorder_by_ids_rejects_length_mismatch() {
        let current = vec![make_station("a"), make_station("b")];
        let err = reorder_by_ids(&current, &["a".to_string()], "station").unwrap_err();
        assert!(matches!(err, ApiBillingError::InvalidInput { .. }));
    }

    #[test]
    fn reorder_by_ids_rejects_duplicate_id() {
        let current = vec![make_station("a"), make_station("b")];
        let ordered = vec!["a".to_string(), "a".to_string()];
        let err = reorder_by_ids(&current, &ordered, "station").unwrap_err();
        assert!(matches!(err, ApiBillingError::InvalidInput { .. }));
    }

    #[test]
    fn reorder_by_ids_rejects_unknown_id() {
        let current = vec![make_station("a"), make_station("b")];
        let ordered = vec!["a".to_string(), "z".to_string()];
        let err = reorder_by_ids(&current, &ordered, "station").unwrap_err();
        assert!(matches!(err, ApiBillingError::InvalidInput { .. }));
    }

    #[test]
    fn reorder_by_ids_empty_ok_on_empty_current() {
        let current: Vec<RelayStation> = vec![];
        let out = reorder_by_ids(&current, &[], "station").expect("ok");
        assert!(out.is_empty());
    }
}
