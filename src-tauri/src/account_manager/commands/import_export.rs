//! Relay data import/export commands (sanitized export only; encryptedFull rejected).

use std::collections::{HashMap, HashSet};

use tauri::{AppHandle, Runtime, State};

use super::shared::{new_id, next_unique_remark, normalize_optional, now_label, trim_or_invalid};
use crate::account_manager::crypto;
use crate::account_manager::state::AccountManagerState;
use crate::account_manager::storage;
use crate::account_manager::types::{
    AccountManagerError, AccountManagerResult, RelayAccountExport, RelayDataExportFile,
    RelayDataExportResult, RelayDataImportResult, RelayExportMode, RelayStation,
    RelayStationExport, StationAccount,
};

const RELAY_EXPORT_VERSION: u32 = 2;
const MAX_IMPORT_BYTES: u64 = 16 * 1024 * 1024;
const MAX_IMPORT_STATIONS: usize = 2_000;
const MAX_IMPORT_ACCOUNTS: usize = 20_000;

fn build_export_file(
    snapshot: &crate::account_manager::state::AccountManagerSnapshot,
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
                    let encrypted_session = match mode {
                        RelayExportMode::Sanitized => None,
                        RelayExportMode::EncryptedFull => {
                            snapshot.sessions.get(&account.id).cloned()
                        }
                    };
                    Ok(RelayAccountExport {
                        username: account.username.clone(),
                        password: None,
                        encrypted_password,
                        encrypted_session,
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

fn validate_export_mode(mode: RelayExportMode) -> AccountManagerResult<RelayExportMode> {
    match mode {
        RelayExportMode::Sanitized => Ok(RelayExportMode::Sanitized),
        RelayExportMode::EncryptedFull => Err(AccountManagerError::invalid_input(
            "encryptedFull export is disabled because it cannot be restored on another device",
        )),
    }
}

fn import_account_secret(
    key: &[u8; 32],
    account: &RelayAccountExport,
) -> AccountManagerResult<Option<crate::account_manager::crypto::EncryptedBlob>> {
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

/// Re-encrypt an imported session blob through the current keyring entry.
/// Returns None when no session is present; returns Err on decrypt failure
/// (caller treats as "skip session" — see import_relay_data).
fn import_account_session(
    key: &[u8; 32],
    account: &RelayAccountExport,
) -> AccountManagerResult<Option<crate::account_manager::crypto::EncryptedBlob>> {
    let Some(blob) = account.encrypted_session.as_ref() else {
        return Ok(None);
    };
    let plaintext = crypto::decrypt(key, blob)?;
    crypto::encrypt(key, &plaintext).map(Some)
}

#[tauri::command]
pub fn export_relay_data(
    state: State<'_, AccountManagerState>,
    path: String,
    mode: Option<RelayExportMode>,
) -> AccountManagerResult<RelayDataExportResult> {
    let selected_mode = validate_export_mode(mode.unwrap_or(RelayExportMode::Sanitized))?;
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
    let file_size = std::fs::metadata(&path)
        .map_err(|e| AccountManagerError::store_fail(format!("stat import {path}: {e}")))?
        .len();
    if file_size > MAX_IMPORT_BYTES {
        return Err(AccountManagerError::invalid_input(format!(
            "import file exceeds {} bytes",
            MAX_IMPORT_BYTES
        )));
    }
    let body = std::fs::read_to_string(&path)
        .map_err(|e| AccountManagerError::store_fail(format!("read import {path}: {e}")))?;
    let data: RelayDataExportFile = serde_json::from_str(&body)
        .map_err(|e| AccountManagerError::invalid_input(format!("invalid import file: {e}")))?;
    if data.version != RELAY_EXPORT_VERSION {
        return Err(AccountManagerError::invalid_input(format!(
            "unsupported import version {} (expected {RELAY_EXPORT_VERSION})",
            data.version
        )));
    }
    if data.stations.len() > MAX_IMPORT_STATIONS {
        return Err(AccountManagerError::invalid_input(format!(
            "import contains more than {MAX_IMPORT_STATIONS} stations"
        )));
    }
    let account_count = data
        .stations
        .iter()
        .try_fold(0usize, |total, station| {
            total.checked_add(station.accounts.len())
        })
        .ok_or_else(|| AccountManagerError::invalid_input("import account count overflow"))?;
    if account_count > MAX_IMPORT_ACCOUNTS {
        return Err(AccountManagerError::invalid_input(format!(
            "import contains more than {MAX_IMPORT_ACCOUNTS} accounts"
        )));
    }

    let key = state.master_key()?;

    storage::with_state_mut(&app, &state, move |snapshot| {
        let mut existing_remarks: HashSet<String> = snapshot
            .stations
            .iter()
            .map(|station| station.remark.clone())
            .collect();

        let mut imported_stations: Vec<RelayStation> = Vec::new();
        let mut imported_accounts: Vec<StationAccount> = Vec::new();
        let mut imported_secrets: HashMap<String, crate::account_manager::crypto::EncryptedBlob> =
            HashMap::new();
        let mut imported_sessions: HashMap<String, crate::account_manager::crypto::EncryptedBlob> =
            HashMap::new();

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
                    .unwrap_or_else(crate::account_manager::types::default_session_ttl_hours),
                id: station_id.clone(),
                remark: unique_remark,
                website: trim_or_invalid(&station.website, "website")?,
                created_at: station.created_at.unwrap_or_else(now_label),
                login_detection: station.login_detection,
                network_proxy: None,
            });

            for account in station.accounts {
                let account_id = new_id("acct");
                let secret = import_account_secret(&key, &account)?;
                let session_blob = import_account_session(&key, &account)?;
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
                    imported_secrets.insert(account_id.clone(), secret);
                }
                if let Some(blob) = session_blob {
                    imported_sessions.insert(account_id, blob);
                }
            }
        }

        snapshot.stations.extend(imported_stations);
        snapshot.accounts.extend(imported_accounts);
        snapshot.secrets.extend(imported_secrets);
        snapshot.sessions.extend(imported_sessions);

        Ok(RelayDataImportResult {
            station_count: snapshot.stations.len(),
            account_count: snapshot.accounts.len(),
            stations: snapshot.stations.clone(),
            accounts: snapshot.accounts.clone(),
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::account_manager::commands::shared::fixtures;
    use crate::account_manager::state::AccountManagerSnapshot;
    use std::collections::HashMap;

    #[test]
    fn build_export_file_defaults_to_sanitized_without_plaintext_or_ciphertext() {
        let snapshot = AccountManagerSnapshot {
            stations: vec![fixtures::make_station("a")],
            accounts: vec![fixtures::make_account("acct-1", "a")],
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
        let encrypted_session = crypto::encrypt(&[7u8; 32], "session").expect("encrypt");
        let mut account = fixtures::make_account("acct-1", "a");
        account.has_password = true;
        let snapshot = AccountManagerSnapshot {
            stations: vec![fixtures::make_station("a")],
            accounts: vec![account],
            secrets: HashMap::from([("acct-1".into(), encrypted.clone())]),
            sessions: HashMap::from([("acct-1".into(), encrypted_session.clone())]),
            external_apps: Vec::new(),
            external_app_bindings: Vec::new(),
        };

        let (export, _) =
            build_export_file(&snapshot, RelayExportMode::EncryptedFull).expect("export");

        assert_eq!(
            export.stations[0].accounts[0].encrypted_password.as_ref(),
            Some(&encrypted)
        );
        assert_eq!(
            export.stations[0].accounts[0].encrypted_session.as_ref(),
            Some(&encrypted_session)
        );
        assert_eq!(export.stations[0].accounts[0].password, None);
    }

    #[test]
    fn encrypted_full_export_is_rejected_at_the_command_boundary() {
        assert_eq!(
            validate_export_mode(RelayExportMode::Sanitized).expect("sanitized"),
            RelayExportMode::Sanitized
        );
        let error = validate_export_mode(RelayExportMode::EncryptedFull).unwrap_err();
        assert!(matches!(error, AccountManagerError::InvalidInput { .. }));
    }
}
