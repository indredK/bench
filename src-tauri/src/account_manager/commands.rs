use chrono::Local;
use rand::RngCore;
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

use super::crypto;
use super::probe;
use super::state::{AccountManagerSnapshot, AccountManagerState};
use super::storage;
use super::types::{
    AccountSessionStatus, AccountType, AccountManagerError, AuthProfile, ExclusivityMode, ProbeResult, ProbeStrategy, AccountManagerResult, LoginDetectionConfig, LoginMethod,
    RelayAccountExport, RelayDataExportFile, RelayDataExportResult, RelayDataImportResult,
    RelayExportMode, RelayStation, RelayStationExport, StationAccount,
    ExternalApp, ExternalAppBinding,
};
use super::webview;

const RELAY_EXPORT_VERSION: u32 = 2;

fn new_id(prefix: &str) -> String {
    let mut bytes = [0u8; 4];
    rand::thread_rng().fill_bytes(&mut bytes);
    let suffix: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
    format!("{prefix}-{suffix}")
}

pub fn now_label() -> String {
    Local::now().format("%Y-%m-%d %H:%M").to_string()
}

fn trim_or_invalid(input: &str, field: &str) -> AccountManagerResult<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AccountManagerError::invalid_input(format!("{field} is required")));
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
) -> AccountManagerResult<Vec<T>> {
    if ordered_ids.len() != current.len() {
        return Err(AccountManagerError::invalid_input(format!(
            "{label} reorder length mismatch: got {}, expected {}",
            ordered_ids.len(),
            current.len()
        )));
    }
    let mut seen: HashSet<&str> = HashSet::with_capacity(ordered_ids.len());
    for id in ordered_ids {
        if !seen.insert(id.as_str()) {
            return Err(AccountManagerError::invalid_input(format!(
                "{label} reorder duplicate id: {id}"
            )));
        }
    }
    let mut by_id: HashMap<&str, T> =
        current.iter().map(|item| (item.id(), item.clone())).collect();
    let mut out: Vec<T> = Vec::with_capacity(ordered_ids.len());
    for id in ordered_ids {
        let Some(item) = by_id.remove(id.as_str()) else {
            return Err(AccountManagerError::invalid_input(format!(
                "{label} reorder unknown id: {id}"
            )));
        };
        out.push(item);
    }
    Ok(out)
}

fn build_export_file(
    snapshot: &AccountManagerSnapshot,
    mode: RelayExportMode,
) -> AccountManagerResult<(RelayDataExportFile, usize)> {
    let mut exported_accounts = 0usize;
    let stations = snapshot
        .stations
        .iter()
        .map(|station| {
            let station_accounts = snapshot
                .accounts
                .iter()
                .filter(|account| account.station_id == station.id)
                .map(|account| {
                    exported_accounts += 1;
                    let encrypted_password = match mode {
                        RelayExportMode::Sanitized => None,
                        RelayExportMode::EncryptedFull => {
                            snapshot.secrets.get(&account.id).cloned()
                        }
                    };
                    Ok(RelayAccountExport {
                        username: account.username.clone(),
                        password: None,
                        encrypted_password,
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
                .collect::<AccountManagerResult<Vec<_>>>()?;

            Ok(RelayStationExport {
                remark: station.remark.clone(),
                website: station.website.clone(),
                created_at: Some(station.created_at.clone()),
                login_detection: station.login_detection.clone(),
                accounts: station_accounts,
                session_ttl_hours: Some(station.session_ttl_hours),
            })
        })
        .collect::<AccountManagerResult<Vec<_>>>()?;

    Ok((
        RelayDataExportFile {
            version: RELAY_EXPORT_VERSION,
            exported_at: now_label(),
            mode,
            stations,
        },
        exported_accounts,
    ))
}

fn import_account_secret(
    key: &[u8; 32],
    account: &RelayAccountExport,
) -> AccountManagerResult<Option<super::crypto::EncryptedBlob>> {
    if let Some(password) = normalize_optional(account.password.clone()) {
        return crypto::encrypt(key, &password).map(Some);
    }

    let Some(blob) = account.encrypted_password.as_ref() else {
        return Ok(None);
    };

    // Re-encrypt through the current keyring entry so malformed / foreign blobs
    // fail fast instead of silently persisting unusable ciphertext.
    let plaintext = crypto::decrypt(key, blob)?;
    crypto::encrypt(key, &plaintext).map(Some)
}

// ───── stations ─────

#[tauri::command]
pub fn list_stations(state: State<'_, AccountManagerState>) -> AccountManagerResult<Vec<RelayStation>> {
    Ok(state.read_snapshot_checked()?.stations)
}

#[tauri::command]
pub fn create_station<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    remark: String,
    website: String,
    login_detection: Option<LoginDetectionConfig>,
) -> AccountManagerResult<RelayStation> {
    let station = RelayStation {
            exclusivity_mode: Default::default(),
            auth_profile: None,
            probe_failure_count: 0,
            session_ttl_hours: super::types::default_session_ttl_hours(),
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
    state: State<'_, AccountManagerState>,
    id: String,
    remark: Option<String>,
    website: Option<String>,
    login_detection: Option<LoginDetectionConfig>,
    session_ttl_hours: Option<u32>,
) -> AccountManagerResult<RelayStation> {
    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(station) = snapshot.stations.iter_mut().find(|s| s.id == id) else {
            return Err(AccountManagerError::not_found(format!("station {id}")));
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
        if let Some(ttl) = session_ttl_hours {
            station.session_ttl_hours = ttl;
        }
        Ok(station.clone())
    })
}

/// 便捷命令:仅设置 session_ttl_hours(供前端面板使用)。
#[tauri::command]
pub fn set_session_ttl<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
    ttl_hours: u32,
) -> AccountManagerResult<RelayStation> {
    update_station(app, state, station_id, None, None, None, Some(ttl_hours))
}

#[tauri::command]
pub fn delete_station<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    id: String,
) -> AccountManagerResult<()> {
    let dropped_account_ids = storage::with_state_mut(&app, &state, |snapshot| {
        let before = snapshot.stations.len();
        snapshot.stations.retain(|s| s.id != id);
        if snapshot.stations.len() == before {
            return Err(AccountManagerError::not_found(format!("station {id}")));
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
    state: State<'_, AccountManagerState>,
    ordered_ids: Vec<String>,
) -> AccountManagerResult<Vec<RelayStation>> {
    storage::with_state_mut(&app, &state, |snapshot| {
        snapshot.stations = reorder_by_ids(&snapshot.stations, &ordered_ids, "station")?;
        Ok(snapshot.stations.clone())
    })
}

// ───── accounts ─────

#[tauri::command]
pub fn list_accounts(
    state: State<'_, AccountManagerState>,
    station_id: String,
) -> AccountManagerResult<Vec<StationAccount>> {
    Ok(state
        .read_snapshot_checked()?
        .accounts
        .into_iter()
        .filter(|a| a.station_id == station_id)
        .collect())
}

#[tauri::command]
pub fn list_all_accounts(
    state: State<'_, AccountManagerState>,
) -> AccountManagerResult<Vec<StationAccount>> {
    Ok(state.read_snapshot_checked()?.accounts)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
    username: String,
    password: Option<String>,
    notes: String,
    phone: Option<String>,
    tg_account: Option<String>,
    linked_account: Option<String>,
    invite_link: Option<String>,
    login_methods: Vec<LoginMethod>,
) -> AccountManagerResult<StationAccount> {
    let password = normalize_optional(password);
    let encrypted_password = match password {
        Some(pw) => {
            let key = state.master_key()?;
            Some(crypto::encrypt(&key, &pw)?)
        }
        None => None,
    };
    let account = StationAccount {
            account_type: Default::default(),
            website: None,
            session: None,
            exclusivity_group: None,
            proxy_enabled: false,
            external_app_ids: Vec::new(),
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
            return Err(AccountManagerError::not_found(format!("station {}", account.station_id)));
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
    state: State<'_, AccountManagerState>,
    id: String,
    username: Option<String>,
    notes: Option<String>,
    phone: Option<Option<String>>,
    tg_account: Option<Option<String>>,
    linked_account: Option<Option<String>>,
    invite_link: Option<Option<String>>,
    login_methods: Option<Vec<LoginMethod>>,
) -> AccountManagerResult<StationAccount> {
    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == id) else {
            return Err(AccountManagerError::not_found(format!("account {id}")));
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
    state: State<'_, AccountManagerState>,
    id: String,
) -> AccountManagerResult<()> {
    storage::with_state_mut(&app, &state, |snapshot| {
        let before = snapshot.accounts.len();
        snapshot.accounts.retain(|a| a.id != id);
        if snapshot.accounts.len() == before {
            return Err(AccountManagerError::not_found(format!("account {id}")));
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
    state: State<'_, AccountManagerState>,
    station_id: String,
    ordered_ids: Vec<String>,
) -> AccountManagerResult<Vec<StationAccount>> {
    storage::with_state_mut(&app, &state, |snapshot| {
        if !snapshot.stations.iter().any(|s| s.id == station_id) {
            return Err(AccountManagerError::not_found(format!("station {station_id}")));
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
    state: State<'_, AccountManagerState>,
    path: String,
    mode: Option<RelayExportMode>,
) -> AccountManagerResult<RelayDataExportResult> {
    let selected_mode = mode.unwrap_or(RelayExportMode::Sanitized);
    let snapshot = state.read_snapshot_checked()?;
    let (export, exported_accounts) = build_export_file(&snapshot, selected_mode.clone())?;
    let body = serde_json::to_string_pretty(&export)
        .map_err(|e| AccountManagerError::store_fail(format!("serialize export: {e}")))?;
    std::fs::write(&path, body)
        .map_err(|e| AccountManagerError::store_fail(format!("write export {path}: {e}")))?;

    Ok(RelayDataExportResult {
        station_count: export.stations.len(),
        account_count: exported_accounts,
        mode: selected_mode,
    })
}

#[tauri::command]
pub fn import_relay_data<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    path: String,
) -> AccountManagerResult<RelayDataImportResult> {
    let body = std::fs::read_to_string(&path)
        .map_err(|e| AccountManagerError::store_fail(format!("read import {path}: {e}")))?;
    let data: RelayDataExportFile = serde_json::from_str(&body)
        .map_err(|e| AccountManagerError::invalid_input(format!("invalid import file: {e}")))?;

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
                exclusivity_mode: Default::default(),
                auth_profile: None,
                probe_failure_count: 0,
                session_ttl_hours: station
                    .session_ttl_hours
                    .unwrap_or_else(super::types::default_session_ttl_hours),
                id: station_id.clone(),
                remark: unique_remark,
                website: trim_or_invalid(&station.website, "website")?,
                created_at: station.created_at.unwrap_or_else(now_label),
                login_detection: station.login_detection,
            });

            for account in station.accounts {
                let account_id = new_id("acct");
                let secret = import_account_secret(&key, &account)?;
                imported_accounts.push(StationAccount {
                account_type: Default::default(),
                website: None,
                session: None,
                exclusivity_group: None,
                    proxy_enabled: false,
                    external_app_ids: Vec::new(),
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
                    has_password: secret.is_some(),
                });
                if let Some(secret) = secret {
                    imported_secrets.insert(account_id, secret);
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
    state: State<'_, AccountManagerState>,
    account_id: String,
) -> AccountManagerResult<String> {
    let blob = state
        .read_snapshot_checked()?
        .secrets
        .get(&account_id)
        .cloned()
        .ok_or_else(|| AccountManagerError::not_found(format!("password for {account_id}")))?;
    let key = state.master_key()?;
    crypto::decrypt(&key, &blob)
}

#[tauri::command]
pub fn set_password<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
    password: String,
) -> AccountManagerResult<()> {
    let blob = if password.is_empty() {
        None
    } else {
        let key = state.master_key()?;
        Some(crypto::encrypt(&key, &password)?)
    };

    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) else {
            return Err(AccountManagerError::not_found(format!("account {account_id}")));
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
    state: State<'_, AccountManagerState>,
    account_id: String,
) -> AccountManagerResult<()> {
    set_password(app, state, account_id, String::new())
}

#[tauri::command]
pub fn copy_password_to_clipboard<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
) -> AccountManagerResult<()> {
    let blob = state
        .read_snapshot_checked()?
        .secrets
        .get(&account_id)
        .cloned()
        .ok_or_else(|| AccountManagerError::not_found(format!("password for {account_id}")))?;
    let key = state.master_key()?;
    let plaintext = crypto::decrypt(&key, &blob)?;
    app.clipboard()
        .write_text(plaintext)
        .map_err(|e| AccountManagerError::clipboard_fail(e.to_string()))?;
    Ok(())
}

// ───── ephemeral (Phase 2) ─────

/// 创建一个临时账号(快速登录入口)。
/// `station_id` 可选 — 为 None 时表示不归属任何 Station,账号自带 `website`。
#[tauri::command]
pub fn create_ephemeral_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    website: String,
    username: String,
    station_id: Option<String>,
) -> AccountManagerResult<StationAccount> {
    let website = trim_or_invalid(&website, "website")?;
    let username = trim_or_invalid(&username, "username")?;

    // 若指定了 station,必须存在
    if let Some(ref sid) = station_id {
        let exists = state
            .read_snapshot_checked()?
            .stations
            .iter()
            .any(|s| &s.id == sid);
        if !exists {
            return Err(AccountManagerError::not_found(format!("station {sid}")));
        }
    }

    let account = StationAccount {
        account_type: AccountType::Ephemeral,
        website: Some(website),
        session: None,
        exclusivity_group: None,
        proxy_enabled: false,
        external_app_ids: Vec::new(),
        id: new_id("eph"),
        station_id: station_id.unwrap_or_default(),
        username,
        notes: String::new(),
        phone: None,
        tg_account: None,
        linked_account: None,
        invite_link: None,
        login_methods: Vec::new(),
        status: AccountSessionStatus::LoginRequired,
        last_login_at: None,
        last_refreshed_at: None,
        created_at: now_label(),
        has_password: false,
    };

    storage::with_state_mut(&app, &state, |snapshot| {
        snapshot.accounts.push(account.clone());
        Ok(account)
    })
}

// ───── session refresh ─────

async fn refresh_one_impl<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
) -> AccountManagerResult<StationAccount> {
    let (website, detection_config, semaphore) = {
        let state = app.state::<AccountManagerState>();
        let snapshot = state.read_snapshot_checked()?;
        let Some(account) = snapshot.accounts.iter().find(|a| a.id == account_id) else {
            return Err(AccountManagerError::not_found(format!("account {account_id}")));
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
        (
            station.website.clone(),
            station.login_detection.clone(),
            state.probe_semaphore.clone(),
        )
    };

    let _permit = semaphore
        .acquire_owned()
        .await
        .map_err(|e| AccountManagerError::store_fail(format!("acquire probe permit: {e}")))?;
    let outcome = probe::run_probe(&app, &account_id, &website, &detection_config).await?;
    let state = app.state::<AccountManagerState>();
    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) else {
            return Err(AccountManagerError::not_found(format!("account {account_id}")));
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
                eprintln!("[account_manager] refresh failed for {id}: {err:?}");
            }
            Err(join_err) => {
                eprintln!("[account_manager] join error: {join_err:?}");
            }
        }
    }
    results
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
) -> AccountManagerResult<Vec<StationAccount>> {
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
) -> AccountManagerResult<Vec<StationAccount>> {
    let account_ids: Vec<String> = state
        .read_snapshot_checked()?
        .accounts
        .into_iter()
        .map(|a| a.id)
        .collect();
    Ok(refresh_many(app, account_ids).await)
}

#[tauri::command]
pub fn open_login_window<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
    return_url: Option<String>,
) -> AccountManagerResult<()> {
    let (username, website, station) = {
        let snapshot = state.read_snapshot_checked()?;
        let account = snapshot
            .accounts
            .iter()
            .find(|a| a.id == account_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
        let station = snapshot
            .stations
            .iter()
            .find(|s| s.id == account.station_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("station {}", account.station_id)))?;
        (account.username.clone(), station.website.clone(), station.clone())
    };

    // 互斥模式：登录前处理同站其它账号（exclusive 登出冲突账号 / rotating 降级活跃账号）
    crate::account_manager::exclusivity::enforce_exclusivity_before_login(&app, &station, &account_id)?;

    webview::open_login_window(&app, &account_id, &username, &website, return_url.as_deref())
}

#[tauri::command]
pub async fn mark_account_logged_in<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
) -> AccountManagerResult<StationAccount> {
    // 0. 找到账号 + 站点
    let snapshot = state.read_snapshot_checked()?;
    let account = snapshot
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .cloned()
        .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
    let station = snapshot
        .stations
        .iter()
        .find(|s| s.id == account.station_id)
        .cloned();

    // 1. 尝试从登录窗口捕获 session(Persistent 账号才持久化)
    let login_label = crate::account_manager::webview::login_window_label(&account_id);
    if let Some(window) = app.get_webview_window(&login_label) {
        // 1a. session 捕获
        match crate::account_manager::session::capture_session_after_login(
            &window, &account, &None,
        )
        .await
        {
            Ok(session) => {
                if account.account_type == AccountType::Persistent {
                    crate::account_manager::session::persist_session(&state, &account_id, &session)?;
                }
            }
            Err(e) => {
                eprintln!(
                    "[account_manager] mark_logged_in: capture failed for {account_id}: {e:?}"
                );
            }
        }

        // 2. 登录成功后自动跑一次 AuthProfile 检测(写入 Station.auth_profile)。
        if let Some(station) = station.as_ref() {
            match crate::account_manager::detection::detect_auth_profile(&window).await {
                Ok(profile) => {
                    if let Err(e) = storage::with_state_mut(&app, &state, |snapshot| {
                        if let Some(s) = snapshot.stations.iter_mut().find(|s| s.id == station.id) {
                            s.auth_profile = Some(profile);
                        }
                        Ok(())
                    }) {
                        eprintln!(
                            "[account_manager] mark_logged_in: failed to save auth profile for {}: {e:?}",
                            station.id
                        );
                    }
                }
                Err(e) => {
                    eprintln!(
                        "[account_manager] mark_logged_in: auth profile detect failed for {}: {e:?}",
                        station.id
                    );
                }
            }
        }
    }

    // 3. 标记 Ready + 刷新时间戳
    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) else {
            return Err(AccountManagerError::not_found(format!("account {account_id}")));
        };
        account.status = AccountSessionStatus::Ready;
        account.last_login_at = Some(now_label());
        account.last_refreshed_at = Some(now_label());
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
            exclusivity_mode: Default::default(),
            auth_profile: None,
            probe_failure_count: 0,
            session_ttl_hours: crate::account_manager::types::default_session_ttl_hours(),
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
        assert!(matches!(err, AccountManagerError::InvalidInput { .. }));
    }

    #[test]
    fn reorder_by_ids_rejects_duplicate_id() {
        let current = vec![make_station("a"), make_station("b")];
        let ordered = vec!["a".to_string(), "a".to_string()];
        let err = reorder_by_ids(&current, &ordered, "station").unwrap_err();
        assert!(matches!(err, AccountManagerError::InvalidInput { .. }));
    }

    #[test]
    fn reorder_by_ids_rejects_unknown_id() {
        let current = vec![make_station("a"), make_station("b")];
        let ordered = vec!["a".to_string(), "z".to_string()];
        let err = reorder_by_ids(&current, &ordered, "station").unwrap_err();
        assert!(matches!(err, AccountManagerError::InvalidInput { .. }));
    }

    #[test]
    fn reorder_by_ids_empty_ok_on_empty_current() {
        let current: Vec<RelayStation> = vec![];
        let out = reorder_by_ids(&current, &[], "station").expect("ok");
        assert!(out.is_empty());
    }

    #[test]
    fn build_export_file_defaults_to_sanitized_without_plaintext_or_ciphertext() {
        let snapshot = AccountManagerSnapshot {
            stations: vec![make_station("a")],
            accounts: vec![StationAccount {
                id: "acct-1".into(),
                station_id: "a".into(),
                username: "user".into(),
                notes: String::new(),
                phone: None,
                tg_account: None,
                linked_account: None,
                invite_link: None,
                login_methods: vec![],
                status: AccountSessionStatus::Ready,
                last_login_at: None,
                last_refreshed_at: None,
                created_at: "2026-01-01 00:00".into(),
                has_password: true,
                account_type: Default::default(),
                website: None,
                session: None,
                exclusivity_group: None,
                proxy_enabled: false,
                external_app_ids: Vec::new(),
            }],
            secrets: HashMap::from([(
                "acct-1".into(),
                crypto::encrypt(&[9u8; 32], "secret").expect("encrypt"),
            )]),
            sessions: HashMap::new(),
            external_apps: Vec::new(),
            external_app_bindings: Vec::new(),
        };

        let (export, count) =
            build_export_file(&snapshot, RelayExportMode::Sanitized).expect("export");

        assert_eq!(count, 1);
        assert_eq!(export.mode, RelayExportMode::Sanitized);
        assert_eq!(export.stations[0].accounts[0].password, None);
        assert_eq!(export.stations[0].accounts[0].encrypted_password, None);
    }

    #[test]
    fn build_export_file_keeps_ciphertext_in_encrypted_full_mode() {
        let encrypted = crypto::encrypt(&[7u8; 32], "secret").expect("encrypt");
        let snapshot = AccountManagerSnapshot {
            stations: vec![make_station("a")],
            accounts: vec![StationAccount {
                id: "acct-1".into(),
                station_id: "a".into(),
                username: "user".into(),
                notes: String::new(),
                phone: None,
                tg_account: None,
                linked_account: None,
                invite_link: None,
                login_methods: vec![],
                status: AccountSessionStatus::Ready,
                last_login_at: None,
                last_refreshed_at: None,
                created_at: "2026-01-01 00:00".into(),
                has_password: true,
                account_type: Default::default(),
                website: None,
                session: None,
                exclusivity_group: None,
                proxy_enabled: false,
                external_app_ids: Vec::new(),
            }],
            secrets: HashMap::from([("acct-1".into(), encrypted.clone())]),
            sessions: HashMap::new(),
            external_apps: Vec::new(),
            external_app_bindings: Vec::new(),
        };

        let (export, _) =
            build_export_file(&snapshot, RelayExportMode::EncryptedFull).expect("export");

        assert_eq!(
            export.stations[0].accounts[0].encrypted_password.as_ref(),
            Some(&encrypted)
        );
        assert_eq!(export.stations[0].accounts[0].password, None);
    }
}

// ═══════════════════════════════════════════════
// Session Manager — 新增命令 (v1.3)
// ═══════════════════════════════════════════════

/// 从登录窗口捕获 session 并加密存储
#[tauri::command]
pub async fn capture_account_session<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
) -> AccountManagerResult<AccountSessionStatus> {
    let snapshot = state.read_snapshot_checked()?;
    let account = snapshot.accounts.iter()
        .find(|a| a.id == account_id)
        .cloned()
        .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;

    let login_label = crate::account_manager::webview::login_window_label(&account_id);
    let window = app.get_webview_window(&login_label)
        .ok_or_else(|| AccountManagerError::not_found("login window not found"))?;

    let session = crate::account_manager::session::capture_session_after_login(
        &window, &account, &None,
    ).await?;

    crate::account_manager::session::persist_session(&state, &account_id, &session)?;

    storage::with_state_mut(&app, &state, |snapshot| {
        if let Some(a) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) {
            a.status = AccountSessionStatus::Ready;
            a.last_login_at = Some(now_label());
        }
        Ok(())
    })?;

    Ok(AccountSessionStatus::Ready)
}

/// 从存储恢复 session 并做 probe
#[tauri::command]
pub async fn restore_account_session<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
) -> AccountManagerResult<AccountSessionStatus> {
    let session = crate::account_manager::session::restore_session(&state, &account_id)?
        .ok_or_else(|| AccountManagerError::not_found("no stored session"))?;

    let snapshot = state.read_snapshot_checked()?;
    let account = snapshot.accounts.iter()
        .find(|a| a.id == account_id)
        .cloned()
        .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;

    let website = account.website.clone()
        .or_else(|| snapshot.stations.iter()
            .find(|s| s.id == account.station_id)
            .map(|s| s.website.clone()))
        .unwrap_or_default();

    // 根据 Station 的 AuthProfile 选择探针策略；缺失时默认 HttpFirst
    let station = snapshot.stations.iter().find(|s| s.id == account.station_id);
    let strategy = station
        .and_then(|s| s.auth_profile.as_ref())
        .map(|p| p.probe_strategy)
        .unwrap_or(ProbeStrategy::HttpFirst);
    let config = station
        .map(|s| s.login_detection.clone())
        .unwrap_or_default();
    let station_id = station.map(|s| s.id.clone());

    let result = crate::account_manager::probe::probe_session(
        &app, &account_id, &website, &session, strategy, &config,
    ).await;

    // 不确定 / 反机器人 / 网络错误 → 触发自适应降级
    if matches!(
        result,
        ProbeResult::AntiBotBlocked | ProbeResult::Uncertain | ProbeResult::NetworkError(_)
    ) {
        if let Some(ref sid) = station_id {
            let _ = crate::account_manager::probe::adaptive_degrade(&app, sid).await;
        }
    }

    let status = match result {
        ProbeResult::Ready => AccountSessionStatus::Ready,
        ProbeResult::LoginRequired | ProbeResult::Expired => AccountSessionStatus::LoginRequired,
        ProbeResult::SsoChallenge => AccountSessionStatus::LoginRequired,
        ProbeResult::AntiBotBlocked
        | ProbeResult::Uncertain
        | ProbeResult::NetworkError(_) => AccountSessionStatus::FetchFailed,
    };

    // 持久化刷新后的状态
    storage::with_state_mut(&app, &state, |snap| {
        if let Some(a) = snap.accounts.iter_mut().find(|a| a.id == account_id) {
            a.status = status;
            a.last_refreshed_at = Some(now_label());
        }
        Ok(())
    })?;

    Ok(status)
}

/// 清除账号的 session 存储
#[tauri::command]
pub fn clear_account_session(
    state: State<'_, AccountManagerState>,
    account_id: String,
) -> AccountManagerResult<()> {
    let mut snapshot = state.snapshot.write().unwrap_or_else(|e| e.into_inner());
    snapshot.sessions.remove(&account_id);
    if let Some(a) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) {
        a.session = None;
    }
    Ok(())
}

/// 为 AuthProfile 检测选择最合适的账号 session。
fn pick_account_for_auth_detection<R: Runtime>(
    app: &AppHandle<R>,
    accounts: &[StationAccount],
    station_id: &str,
    account_id: Option<&str>,
) -> AccountManagerResult<StationAccount> {
    let station_accounts: Vec<&StationAccount> = accounts
        .iter()
        .filter(|account| account.station_id == station_id)
        .collect();

    if station_accounts.is_empty() {
        return Err(AccountManagerError::not_found("no account for station"));
    }

    if let Some(id) = account_id {
        return station_accounts
            .iter()
            .find(|account| account.id == id)
            .map(|account| (*account).clone())
            .ok_or_else(|| AccountManagerError::not_found(format!("account {id}")));
    }

    if let Some(account) = station_accounts.iter().find(|account| {
        app.get_webview_window(&webview::login_window_label(&account.id))
            .is_some()
    }) {
        return Ok((*account).clone());
    }

    if let Some(account) = station_accounts
        .iter()
        .filter(|account| account.last_login_at.is_some())
        .max_by(|left, right| left.last_login_at.cmp(&right.last_login_at))
    {
        return Ok((*account).clone());
    }

    Ok(station_accounts[0].clone())
}

/// 对指定 Station 执行 AuthProfile 检测
///
/// 优先使用已有的登录窗口；如果登录窗口不存在，则打开一个隐藏的临时窗口
/// 加载站点页面后执行检测（使用该账号的独立 session 存储）。
#[tauri::command]
pub async fn detect_station_auth_profile<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
    account_id: Option<String>,
) -> AccountManagerResult<AuthProfile> {
    let snapshot = state.read_snapshot_checked()?;
    let station = snapshot.stations.iter()
        .find(|s| s.id == station_id)
        .cloned()
        .ok_or_else(|| AccountManagerError::not_found(format!("station {station_id}")))?;

    let account = pick_account_for_auth_detection(
        &app,
        &snapshot.accounts,
        &station_id,
        account_id.as_deref(),
    )?;

    // 优先使用已有的登录窗口
    let login_label = crate::account_manager::webview::login_window_label(&account.id);
    let profile = if let Some(window) = app.get_webview_window(&login_label) {
        crate::account_manager::detection::detect_auth_profile(&window).await?
    } else {
        // 没有登录窗口，打开一个隐藏的临时窗口检测
        let temp_label = format!("relay-auth-detect-{}", account.id);
        // 清理可能残留的旧窗口
        if let Some(old) = app.get_webview_window(&temp_label) { let _ = old.close(); }

        let parsed = station.website.parse()
            .map_err(|e| AccountManagerError::invalid_input(format!("website url: {e}")))?;
        let data_dir = webview::account_data_dir(&app, &account.id)?;
        if let Some(parent) = data_dir.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AccountManagerError::store_fail(format!("create dir: {e}")))?;
        }

        use std::sync::{Arc, Mutex};
        use std::time::{Duration, Instant};
        use tauri::WebviewUrl;
        use tokio::sync::oneshot;

        let deadline = Instant::now() + Duration::from_millis(15000);
        let (tx, rx) = oneshot::channel::<()>();
        let slot: Arc<Mutex<Option<oneshot::Sender<()>>>> = Arc::new(Mutex::new(Some(tx)));
        let slot_clone = slot.clone();

        let mut builder = tauri::WebviewWindowBuilder::new(&app, &temp_label, WebviewUrl::External(parsed))
            .visible(false)
            .data_directory(data_dir)
            .on_page_load(move |_, p| {
                if !matches!(p.event(), tauri::webview::PageLoadEvent::Finished) { return; }
                if let Ok(mut guard) = slot_clone.lock() {
                    if let Some(sender) = guard.take() {
                        let _ = sender.send(());
                    }
                }
            });

        #[cfg(any(target_os = "macos", target_os = "ios"))]
        {
            builder = builder.data_store_identifier(webview::account_data_store_identifier(&account.id));
        }

        let window = builder.build()
            .map_err(|e| AccountManagerError::store_fail(format!("build detect window: {e}")))?;

        // 等待页面加载完成
        let load_result = tokio::time::timeout_at(deadline.into(), rx).await;
        if load_result.is_err() {
            let _ = window.close();
            return Err(AccountManagerError::store_fail("detect window load timeout"));
        }

        // 额外等一小会儿，让页面 JS 运行一下
        tokio::time::sleep(Duration::from_millis(500)).await;

        let result = crate::account_manager::detection::detect_auth_profile(&window).await;
        let _ = window.close();
        result?
    };

    storage::with_state_mut(&app, &state, |snapshot| {
        if let Some(s) = snapshot.stations.iter_mut().find(|s| s.id == station_id) {
            s.auth_profile = Some(profile.clone());
        }
        Ok(())
    })?;

    Ok(profile)
}

/// 返回已存储的 AuthProfile
#[tauri::command]
pub fn get_station_auth_profile(
    state: State<'_, AccountManagerState>,
    station_id: String,
) -> AccountManagerResult<Option<AuthProfile>> {
    let snapshot = state.read_snapshot_checked()?;
    Ok(snapshot.stations.iter()
        .find(|s| s.id == station_id)
        .and_then(|s| s.auth_profile.clone()))
}

/// 设置互斥模式
#[tauri::command]
pub fn set_exclusivity_mode<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
    mode: ExclusivityMode,
) -> AccountManagerResult<RelayStation> {
    storage::with_state_mut(&app, &state, |snapshot| {
        let station = snapshot.stations.iter_mut()
            .find(|s| s.id == station_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("station {station_id}")))?;
        station.exclusivity_mode = mode;
        Ok(station.clone())
    })
}

/// Rotating 模式下切换活跃账号：将同站其它 Ready 账号置为 Inactive，
/// 目标账号若有已存储 session 则恢复为 Ready，否则保持原状并返回最新状态。
#[tauri::command]
pub async fn switch_active_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
    account_id: String,
) -> AccountManagerResult<StationAccount> {
    storage::with_state_mut(&app, &state, |snapshot| {
        let station = snapshot.stations.iter()
            .find(|s| s.id == station_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("station {station_id}")))?;

        if station.exclusivity_mode != ExclusivityMode::Rotating {
            return Err(AccountManagerError::invalid_input(
                "switch_active_account only applies to rotating mode",
            ));
        }

        for account in snapshot.accounts.iter_mut() {
            if account.station_id != station_id {
                continue;
            }
            if account.id == account_id {
                // 目标账号：若有已存储 session 则标记 Ready
                if account.session.is_some() && account.status != AccountSessionStatus::Ready {
                    account.status = AccountSessionStatus::Ready;
                }
            } else if account.status == AccountSessionStatus::Ready {
                // 其它活跃账号降级为 Inactive（保留 session）
                account.status = AccountSessionStatus::Inactive;
            }
        }

        snapshot
            .accounts
            .iter()
            .find(|a| a.id == account_id)
            .cloned()
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))
    })
}

#[tauri::command]
pub fn set_account_proxy_enabled<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
    enabled: bool,
) -> AccountManagerResult<StationAccount> {
    let result = storage::with_state_mut(&app, &state, |snapshot| {
        let account = snapshot.accounts.iter_mut()
            .find(|a| a.id == account_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
        account.proxy_enabled = enabled;

        // 关闭代理时立即吊销该账号的所有外部 App 绑定与引用（设计文档 §7.2）。
        if !enabled {
            account.external_app_ids.clear();
            snapshot
                .external_app_bindings
                .retain(|b| b.account_id != account_id);
        }

        Ok(snapshot
            .accounts
            .iter()
            .find(|a| a.id == account_id)
            .cloned()
            .expect("account exists"))
    })?;

    crate::account_manager::proxy::protocol::audit_log(
        "proxy_setting_changed",
        &[
            ("account_id", &account_id),
            ("enabled", if enabled { "true" } else { "false" }),
        ],
    );
    Ok(result)
}

/// 手动覆盖 Station 的探针策略（覆盖自动检测）。
#[tauri::command]
pub fn set_probe_strategy<R: Runtime>(
    app: AppHandle<R>,
    _state: State<'_, AccountManagerState>,
    station_id: String,
    strategy: ProbeStrategy,
) -> AccountManagerResult<RelayStation> {
    crate::account_manager::probe::set_probe_strategy(&app, &station_id, strategy)
}

/// 重置 Station 的探针策略为自动（清除手动覆盖与失败计数）。
#[tauri::command]
pub fn reset_probe_strategy<R: Runtime>(
    app: AppHandle<R>,
    _state: State<'_, AccountManagerState>,
    station_id: String,
) -> AccountManagerResult<RelayStation> {
    crate::account_manager::probe::reset_probe_strategy(&app, &station_id)
}

// ═══════════════════════════════════════════════
// 外部登录代理 — Phase 1 命令
// ═══════════════════════════════════════════════

/// 从 return URL 中提取自定义 scheme（小写）。
fn return_url_scheme(return_url: &str) -> Option<String> {
    url::Url::parse(return_url)
        .ok()
        .map(|u| u.scheme().to_lowercase())
        .filter(|s| !s.is_empty())
}

/// 记录一次外部代理登录的用量：
/// - 按 return URL 的 scheme 查找/创建 `ExternalApp`（首次出现则以 scheme 作为默认名）。
/// - upsert `ExternalAppBinding(app, account)`，累加使用次数与最后使用时间。
/// - 在账号的 `external_app_ids` 上登记该 App。
///
/// 此函数在用户已于账号选择器确认后调用，因此“创建 App 记录”等同于授权落库。
fn record_proxy_usage<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    return_url: &str,
    account_id: &str,
) -> AccountManagerResult<()> {
    let Some(scheme) = return_url_scheme(return_url) else {
        return Ok(());
    };
    // loopback http/https 回调(native-app 模式)没有稳定的"外部 App 身份"可记录,
    // 账号已归属到目标站点的 Station,故跳过 ExternalApp/Binding 记录,避免产生
    // 名为 "http" 的垃圾 App 记录。
    if matches!(scheme.as_str(), "http" | "https") {
        return Ok(());
    }
    let return_host = url::Url::parse(return_url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_lowercase()));

    storage::with_state_mut(app, state, |snapshot| {
        let now = now_label();

        // 1. 查找/创建 ExternalApp（按 scheme 去重）。
        let app_id = if let Some(existing) = snapshot
            .external_apps
            .iter_mut()
            .find(|a| a.url_scheme.eq_ignore_ascii_case(&scheme))
        {
            existing.last_used_at = now.clone();
            existing.use_count = existing.use_count.saturating_add(1);
            if let Some(host) = return_host.as_ref() {
                if !existing.return_hosts.iter().any(|h| h.eq_ignore_ascii_case(host)) {
                    existing.return_hosts.push(host.clone());
                }
            }
            existing.id.clone()
        } else {
            let external_app = ExternalApp {
                id: new_id("app"),
                name: scheme.clone(),
                url_scheme: scheme.clone(),
                return_hosts: return_host.clone().into_iter().collect(),
                first_used_at: now.clone(),
                last_used_at: now.clone(),
                use_count: 1,
            };
            let id = external_app.id.clone();
            snapshot.external_apps.push(external_app);
            id
        };

        // 2. upsert binding(app, account)。
        if let Some(binding) = snapshot
            .external_app_bindings
            .iter_mut()
            .find(|b| b.app_id == app_id && b.account_id == account_id)
        {
            binding.last_used_at = now.clone();
            binding.use_count = binding.use_count.saturating_add(1);
        } else {
            snapshot.external_app_bindings.push(ExternalAppBinding {
                id: new_id("bind"),
                app_id: app_id.clone(),
                account_id: account_id.to_string(),
                first_used_at: now.clone(),
                last_used_at: now.clone(),
                use_count: 1,
            });
        }

        // 3. 在账号上登记 App 引用。
        if let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) {
            if !account.external_app_ids.contains(&app_id) {
                account.external_app_ids.push(app_id.clone());
            }
        }

        Ok(())
    })?;

    crate::account_manager::proxy::protocol::audit_log(
        "proxy_usage_recorded",
        &[("scheme", &scheme), ("account_id", account_id)],
    );
    Ok(())
}

/// 解析 bench-auth://authorize 协议请求
#[tauri::command]
pub fn parse_auth_proxy_url(
    raw_url: String,
) -> AccountManagerResult<crate::account_manager::proxy::protocol::AuthProxyRequest> {
    crate::account_manager::proxy::protocol::parse_auth_proxy_url(&raw_url)
        .map_err(AccountManagerError::invalid_input)
}

/// 根据目标 URL 匹配可用的 Station 列表
#[tauri::command]
pub fn match_proxy_target(
    state: State<'_, AccountManagerState>,
    target: String,
) -> AccountManagerResult<serde_json::Value> {
    let snapshot = state.read_snapshot_checked()?;
    let matches = crate::account_manager::proxy::matching::match_target_to_stations(
        &target,
        &snapshot.stations,
        &snapshot.accounts,
    );
    serde_json::to_value(matches)
        .map_err(|e| AccountManagerError::store_fail(format!("serialize matches: {e}")))
}

/// 构建外部登录代理的回调 URL
#[tauri::command]
pub fn build_proxy_return_url(
    return_url: String,
    token: String,
    token_type: String,
    state: Option<String>,
    station_id: String,
    account_id: String,
) -> String {
    let result = crate::account_manager::proxy::protocol::AuthProxyResult {
        token,
        token_type,
        state,
        station_id,
        account_id,
    };
    crate::account_manager::proxy::protocol::build_return_url(&return_url, &result)
}

// ═══════════════════════════════════════════════
// 外部登录代理 — Phase 1 编排命令
// ═══════════════════════════════════════════════

/// 接收外部 `bench-auth://authorize` 请求，返回匹配到的 Station + 账号列表。
///
/// 调用方（前端）拿到结果后展示账号选择器；用户选定账号后再调
/// `proxy_login` 启动登录流程。
///
/// 注: 参数名 `state` 与 Tauri 注入的 `State<>` 同名,故把 State 参数
/// 前缀下划线以避开冲突。Tauri 不会把 `_state` 暴露给 JS。
#[tauri::command]
pub fn handle_auth_proxy<R: Runtime>(
    _app: AppHandle<R>,
    _state: State<'_, AccountManagerState>,
    target_url: String,
    return_url: String,
    state: Option<String>,
    site_hint: Option<String>,
) -> AccountManagerResult<Vec<crate::account_manager::proxy::matching::AuthProxyMatch>> {
    let _ = state;

    let snapshot = _state.read_snapshot_checked()?;

    // Phase 4 安全:return URL allowlist 校验
    match crate::account_manager::proxy::protocol::validate_return_url(
        &return_url,
        &snapshot.external_apps,
    ) {
        Ok(true) => {
            // 已注册且通过校验 — 放行
            crate::account_manager::proxy::protocol::audit_log(
                "handle_auth_proxy",
                &[("return_url", &return_url), ("status", "registered")],
            );
        }
        Ok(false) => {
            // 未注册 — 调用方(前端)应弹首次确认对话框
            crate::account_manager::proxy::protocol::audit_log(
                "handle_auth_proxy",
                &[("return_url", &return_url), ("status", "unregistered")],
            );
        }
        Err(msg) => {
            crate::account_manager::proxy::protocol::audit_log(
                "handle_auth_proxy_rejected",
                &[("return_url", &return_url), ("reason", &msg)],
            );
            return Err(AccountManagerError::invalid_input(format!(
                "return URL rejected: {msg}"
            )));
        }
    }

    // 优先使用 site_hint 直接定位 Station(用户提示)
    if let Some(site_id) = site_hint.as_ref() {
        if let Some(station) = snapshot.stations.iter().find(|s| &s.id == site_id) {
            let accounts: Vec<StationAccount> = snapshot
                .accounts
                .iter()
                .filter(|a| a.station_id == station.id && a.proxy_enabled)
                .cloned()
                .collect();
            return Ok(vec![crate::account_manager::proxy::matching::AuthProxyMatch {
                station_id: station.id.clone(),
                station_name: station.remark.clone(),
                website: station.website.clone(),
                accounts,
                confidence: crate::account_manager::proxy::matching::MatchConfidence::Manual,
            }]);
        }
    }

    let matches = crate::account_manager::proxy::matching::match_target_to_stations(
        &target_url,
        &snapshot.stations,
        &snapshot.accounts,
    );
    crate::account_manager::proxy::protocol::audit_log(
        "handle_auth_proxy_matched",
        &[
            ("target_url", &target_url),
            ("matches", &matches.len().to_string()),
        ],
    );
    Ok(matches)
}

/// 启动外部代理登录的核心实现(供 `proxy_login` 与 `proxy_login_new_account` 复用)。
///
/// 流程: 校验账号 → 记录用量 → 打开该账号的独立分区登录窗口(导航到 target,
/// 启用 callback 转交/ loopback 完成检测) → 有密码则延迟自动填充。
///
/// 登录完成由 WebView 导航处理器异步完成(命中 loopback / 自定义 scheme 回调时
/// 捕获 session、标记 Ready、关闭窗口),本函数立即返回占位结果。
async fn run_proxy_login<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    account_id: String,
    target_url: String,
    return_url: String,
) -> AccountManagerResult<crate::account_manager::proxy::protocol::AuthProxyResult> {
    let (username, station_id, has_password) = {
        let snapshot = state.read_snapshot_checked()?;
        let account = snapshot
            .accounts
            .iter()
            .find(|a| a.id == account_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
        if !account.proxy_enabled {
            return Err(AccountManagerError::invalid_input(format!(
                "account {account_id} has proxy disabled"
            )));
        }
        (account.username.clone(), account.station_id.clone(), account.has_password)
    };

    // 记录外部 App + 绑定用量(loopback 回调会被自动跳过)。失败不阻塞主流程。
    if let Err(e) = record_proxy_usage(app, state, &return_url, &account_id) {
        eprintln!("[proxy_login] record usage failed: {e:?}");
    }

    // 打开账号独立分区登录窗口,启用回调处理:
    // - loopback 回调(http://127.0.0.1:.../...): 放行 → 本地服务器收 code → 捕获 session → 关窗
    // - 自定义 scheme 回调(myapp://...): openExternal 转交外部 App → 关窗
    let ret_opt = if return_url.trim().is_empty() {
        None
    } else {
        Some(return_url.as_str())
    };
    webview::open_login_window(app, &account_id, &username, &target_url, ret_opt)?;

    crate::account_manager::proxy::protocol::audit_log(
        "proxy_login_started",
        &[
            ("account_id", &account_id),
            ("target_url", &target_url),
            ("has_password", if has_password { "true" } else { "false" }),
        ],
    );

    // 有保存的密码 → 延迟自动填充(只填字段,不自动提交)。
    if has_password {
        let app_clone = app.clone();
        let account_id_for_fill = account_id.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let state = app_clone.state::<AccountManagerState>();
            let snapshot = match state.read_snapshot_checked() {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[proxy_login] delayed fill: read state: {e:?}");
                    return;
                }
            };
            let Some(account) = snapshot.accounts.iter().find(|a| a.id == account_id_for_fill)
            else {
                return;
            };
            let Some(blob) = snapshot.secrets.get(&account.id).cloned() else {
                return;
            };
            let key = match state.master_key() {
                Ok(k) => k,
                Err(e) => {
                    eprintln!("[proxy_login] delayed fill: master key: {e:?}");
                    return;
                }
            };
            let password = match crypto::decrypt(&key, &blob) {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("[proxy_login] delayed fill: decrypt: {e:?}");
                    return;
                }
            };
            if let Err(e) = webview::fill_credentials(
                &app_clone,
                &account.id,
                &account.username,
                &password,
            )
            .await
            {
                eprintln!("[proxy_login] delayed fill: fill_credentials: {e:?}");
            }
        });
    }

    Ok(crate::account_manager::proxy::protocol::AuthProxyResult {
        token: String::new(),
        token_type: "sessionProof".to_string(),
        state: None,
        station_id,
        account_id,
    })
}

/// 启动外部代理登录:打开该账号的独立分区登录窗口,登录完成后由 WebView
/// 导航处理器自动转交 callback / 捕获 session。
#[tauri::command]
pub async fn proxy_login<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
    target_url: String,
    return_url: String,
) -> AccountManagerResult<crate::account_manager::proxy::protocol::AuthProxyResult> {
    run_proxy_login(&app, &state, account_id, target_url, return_url).await
}

/// `handle_browser_open` 的统一返回结构。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserOpenResult {
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_url: Option<String>,
    pub host: String,
    pub is_authorize: bool,
    pub matches: Vec<crate::account_manager::proxy::matching::AuthProxyMatch>,
}

/// 接收一次"用 bench 打开"的 URL（`bench-auth://authorize?...` 或直接是
/// `https://.../authorize?...` 这类 OAuth 登录链接），返回统一的处理结果:
/// - `target`: 真正要登录的目标 URL
/// - `return_url`: 识别出的回调地址(loopback 或自定义 scheme),可能为空
/// - `host`: target 的 host(用于自动建站/分组)
/// - `is_authorize`: 是否像登录/authorize 链接
/// - `matches`: 按 host 匹配到的、已开启代理的账号
#[tauri::command]
pub fn handle_browser_open(
    state: State<'_, AccountManagerState>,
    url: String,
) -> AccountManagerResult<BrowserOpenResult> {
    use crate::account_manager::proxy::protocol;

    let (target, return_url) = if url.starts_with("bench-auth://") {
        let req = protocol::parse_auth_proxy_url(&url)
            .map_err(AccountManagerError::invalid_input)?;
        (req.target, Some(req.return_url))
    } else {
        let ret = protocol::extract_loopback_callback(&url);
        (url.clone(), ret)
    };

    // 校验回调地址(若有):loopback http/https 或合法自定义 scheme 才放行。
    let snapshot = state.read_snapshot_checked()?;
    if let Some(ref ret) = return_url {
        if let Err(msg) = protocol::validate_return_url(ret, &snapshot.external_apps) {
            // 校验失败不直接中断(仍可让用户在隔离窗口登录),仅记录审计。
            protocol::audit_log(
                "handle_browser_open_return_rejected",
                &[("reason", &msg)],
            );
        }
    }

    let host = url::Url::parse(&target)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_lowercase()))
        .unwrap_or_default();
    let is_authorize = protocol::is_oauth_authorize_like(&target);

    let matches = crate::account_manager::proxy::matching::match_target_to_stations(
        &target,
        &snapshot.stations,
        &snapshot.accounts,
    );

    protocol::audit_log(
        "handle_browser_open",
        &[
            ("host", &host),
            ("is_authorize", if is_authorize { "true" } else { "false" }),
            ("matches", &matches.len().to_string()),
        ],
    );

    Ok(BrowserOpenResult {
        target,
        return_url,
        host,
        is_authorize,
        matches,
    })
}

/// 在所选站点下「使用新账号登录」:确保 host 对应的 Station 存在(自动建站/分组),
/// 创建一个开启代理的新账号,然后立即对该账号启动代理登录。
/// 返回新建的账号(供前端刷新列表)。
#[tauri::command]
pub async fn proxy_login_new_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    host: String,
    target_url: String,
    return_url: String,
    username: Option<String>,
) -> AccountManagerResult<StationAccount> {
    let host = trim_or_invalid(&host, "host")?;

    // 1. 确保 Station 存在(按 host 匹配,否则新建)。
    let station = ensure_station_for_host(&app, &state, &host)?;

    // 2. 创建新账号(Persistent + 开启代理)。
    let display_name = normalize_optional(username)
        .unwrap_or_else(|| format!("{host} 账号"));
    let account = StationAccount {
        account_type: AccountType::Persistent,
        website: None,
        session: None,
        exclusivity_group: None,
        proxy_enabled: true,
        external_app_ids: Vec::new(),
        id: new_id("acct"),
        station_id: station.id.clone(),
        username: display_name,
        notes: String::new(),
        phone: None,
        tg_account: None,
        linked_account: None,
        invite_link: None,
        login_methods: Vec::new(),
        status: AccountSessionStatus::LoginRequired,
        last_login_at: None,
        last_refreshed_at: None,
        created_at: now_label(),
        has_password: false,
    };
    let account = storage::with_state_mut(&app, &state, |snapshot| {
        snapshot.accounts.push(account.clone());
        Ok(account.clone())
    })?;

    // 3. 启动代理登录(新账号无密码,直接进入手动登录)。
    run_proxy_login(&app, &state, account.id.clone(), target_url, return_url).await?;

    Ok(account)
}

/// 找到 website host 等于 `host` 的 Station;不存在则自动新建(remark=host)。
fn ensure_station_for_host<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    host: &str,
) -> AccountManagerResult<RelayStation> {
    let host_norm = host.trim().to_lowercase();

    let existing = state.read_snapshot_checked()?.stations.into_iter().find(|s| {
        let sh = s
            .website
            .trim()
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_end_matches('/')
            .to_lowercase();
        sh == host_norm || host_norm.ends_with(&format!(".{sh}"))
    });
    if let Some(station) = existing {
        return Ok(station);
    }

    let station = RelayStation {
        exclusivity_mode: Default::default(),
        auth_profile: None,
        probe_failure_count: 0,
        session_ttl_hours: super::types::default_session_ttl_hours(),
        id: new_id("stn"),
        remark: host_norm.clone(),
        website: format!("https://{host_norm}"),
        created_at: now_label(),
        login_detection: LoginDetectionConfig::default(),
    };
    storage::with_state_mut(app, state, |snapshot| {
        snapshot.stations.push(station.clone());
        Ok(station.clone())
    })
}

// ═══════════════════════════════════════════════
// 外部登录代理 — Phase 3 外部 App 管理
// ═══════════════════════════════════════════════

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

/// 注册外部 App。若相同 `url_scheme` 已存在,直接返回已有记录(去重)。
#[tauri::command]
pub fn register_external_app<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    name: String,
    url_scheme: String,
    return_hosts: Vec<String>,
) -> AccountManagerResult<ExternalApp> {
    let name = trim_or_invalid(&name, "name")?;
    let url_scheme = trim_or_invalid(&url_scheme, "urlScheme")?;
    let return_hosts: Vec<String> = return_hosts
        .into_iter()
        .map(|h| h.trim().to_lowercase())
        .filter(|h| !h.is_empty())
        .collect();

    storage::with_state_mut(&app, &state, |snapshot| {
        // 去重:相同 url_scheme 直接复用
        if let Some(existing) = snapshot
            .external_apps
            .iter()
            .find(|a| a.url_scheme == url_scheme)
        {
            return Ok(existing.clone());
        }

        let now = now_label();
        let external_app = ExternalApp {
            id: new_id("app"),
            name,
            url_scheme,
            return_hosts,
            first_used_at: now.clone(),
            last_used_at: now,
            use_count: 0,
        };
        snapshot.external_apps.push(external_app.clone());
        Ok(external_app)
    })
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
            return Err(AccountManagerError::not_found(format!("external app {app_id}")));
        }
        // 同步移除该 app 的所有绑定
        snapshot.external_app_bindings.retain(|b| b.app_id != app_id);
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
