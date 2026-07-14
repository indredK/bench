use std::collections::HashMap;
use std::fs::{File, OpenOptions};

use crate::persistence::{backup_file, ensure_file_size};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

use super::crypto::{self, EncryptedBlob};
use super::state::{AccountManagerSnapshot, AccountManagerState};
use super::types::{AccountManagerError, AccountManagerResult, RelayStation, StationAccount};

const STORE_FILE: &str = "account-manager-store.json";
const KEY_STATIONS: &str = "stations";
const KEY_ACCOUNTS: &str = "accounts";
const KEY_SECRETS: &str = "secrets";
const KEY_SESSIONS: &str = "sessions";
const KEY_SCHEMA: &str = "schema_version";
const KEY_EXTERNAL_APPS: &str = "external_apps";
const KEY_EXTERNAL_APP_BINDINGS: &str = "external_app_bindings";
const CURRENT_SCHEMA: u32 = 5;
const MAX_STORE_FILE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_MIGRATION_BACKUPS: usize = 3;

/// Load persisted state from the plugin-store and populate the managed state.
/// Called once during `setup`. Migrates P0 plaintext secrets to encrypted blobs.
pub fn init_state<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
) -> AccountManagerResult<()> {
    state.initialize_master_key(app)?;
    let _store_lock = acquire_store_lock(app)?;
    let store_path = account_store_path(app)?;
    ensure_file_size(&store_path, MAX_STORE_FILE_BYTES)
        .map_err(|_| AccountManagerError::store_fail("account store exceeds size limit"))?;
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AccountManagerError::store_fail(format!("open store: {e}")))?;
    store
        .reload_ignore_defaults()
        .map_err(|e| AccountManagerError::store_fail(format!("reload store: {e}")))?;
    let schema = store.get(KEY_SCHEMA).and_then(|v| v.as_u64()).unwrap_or(0);
    validate_schema_version(schema)?;

    let stations: Vec<RelayStation> = decode_or_default(store.get(KEY_STATIONS), KEY_STATIONS)?;
    let mut accounts: Vec<StationAccount> =
        decode_or_default(store.get(KEY_ACCOUNTS), KEY_ACCOUNTS)?;

    let (secrets, needs_resave) = load_and_migrate_secrets(store.get(KEY_SECRETS), state)?;

    let mut sessions = load_sessions_from_store(app)?;
    let external_apps: Vec<super::types::ExternalApp> =
        decode_or_default(store.get(KEY_EXTERNAL_APPS), KEY_EXTERNAL_APPS)?;
    let external_app_bindings: Vec<super::types::ExternalAppBinding> = decode_or_default(
        store.get(KEY_EXTERNAL_APP_BINDINGS),
        KEY_EXTERNAL_APP_BINDINGS,
    )?;

    let migrated_legacy_sessions = migrate_legacy_sessions(&mut accounts, &mut sessions);

    let snapshot = AccountManagerSnapshot {
        stations,
        accounts,
        secrets: secrets.clone(),
        sessions,
        external_apps,
        external_app_bindings,
    };
    let mut dirty = false;
    if needs_resave {
        store.set(KEY_SECRETS, json!(secrets));
        dirty = true;
    }
    if migrated_legacy_sessions {
        store.set(KEY_ACCOUNTS, json!(&snapshot.accounts));
        store.set(KEY_SESSIONS, json!(&snapshot.sessions));
        dirty = true;
    }
    if schema < CURRENT_SCHEMA as u64 {
        store.set(KEY_SCHEMA, json!(CURRENT_SCHEMA));
        dirty = true;
    }
    if dirty {
        backup_file(&store_path, "pre-v5", MAX_MIGRATION_BACKUPS)
            .map_err(|_| AccountManagerError::store_fail("backup account store migration"))?;
        store
            .save()
            .map_err(|e| AccountManagerError::store_fail(format!("save migrations: {e}")))?;
    }

    state.replace_snapshot(snapshot);
    state.clear_init_error();

    Ok(())
}

fn account_store_path<R: Runtime>(app: &AppHandle<R>) -> AccountManagerResult<std::path::PathBuf> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(STORE_FILE))
        .map_err(|e| AccountManagerError::store_fail(format!("app data dir: {e}")))
}

fn validate_schema_version(schema: u64) -> AccountManagerResult<()> {
    if schema > u64::from(CURRENT_SCHEMA) {
        return Err(AccountManagerError::store_fail(format!(
            "account store schema {schema} is newer than supported schema {CURRENT_SCHEMA}"
        )));
    }
    Ok(())
}

fn acquire_store_lock<R: Runtime>(app: &AppHandle<R>) -> AccountManagerResult<File> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AccountManagerError::store_fail(format!("app data dir: {e}")))?;
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| AccountManagerError::store_fail(format!("create app data dir: {e}")))?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(app_data_dir.join("account-manager-store.lock"))
        .map_err(|e| AccountManagerError::store_fail(format!("open store lock: {e}")))?;
    lock.lock()
        .map_err(|e| AccountManagerError::store_fail(format!("acquire store lock: {e}")))?;
    Ok(lock)
}

fn decode_or_default<T: DeserializeOwned + Default>(
    value: Option<Value>,
    label: &str,
) -> AccountManagerResult<T> {
    match value {
        Some(value) => serde_json::from_value(value)
            .map_err(|e| AccountManagerError::store_fail(format!("decode {label}: {e}"))),
        None => Ok(T::default()),
    }
}

fn migrate_legacy_sessions(
    accounts: &mut [StationAccount],
    sessions: &mut HashMap<String, EncryptedBlob>,
) -> bool {
    let mut migrated = false;
    for account in accounts {
        if let Some(legacy) = account.session.take() {
            sessions.entry(account.id.clone()).or_insert(legacy);
            migrated = true;
        }
    }
    migrated
}

/// Read the raw secrets value and convert it to `HashMap<String, EncryptedBlob>`.
/// Returns `(map, needs_resave)` — `needs_resave` is true when P0 plaintext entries
/// were encountered and encrypted.
fn load_and_migrate_secrets(
    raw: Option<Value>,
    state: &AccountManagerState,
) -> AccountManagerResult<(HashMap<String, EncryptedBlob>, bool)> {
    let Some(value) = raw else {
        return Ok((HashMap::new(), false));
    };
    let Value::Object(map) = value else {
        return Ok((HashMap::new(), false));
    };

    let mut out: HashMap<String, EncryptedBlob> = HashMap::new();
    let mut migrated = false;
    let mut key_cache: Option<[u8; 32]> = None;

    for (id, entry) in map {
        match entry {
            Value::String(plaintext) => {
                // P0 format: encrypt and mark dirty.
                let key = match key_cache {
                    Some(k) => k,
                    None => {
                        let k = state.master_key()?;
                        key_cache = Some(k);
                        k
                    }
                };
                let blob = crypto::encrypt(&key, &plaintext)?;
                out.insert(id, blob);
                migrated = true;
            }
            Value::Object(_) => match serde_json::from_value::<EncryptedBlob>(entry) {
                Ok(blob) => {
                    out.insert(id, blob);
                }
                Err(e) => {
                    return Err(AccountManagerError::store_fail(format!(
                        "decode secret {id}: {e}"
                    )));
                }
            },
            other => {
                return Err(AccountManagerError::store_fail(format!(
                    "unexpected secret shape for {id}: {other}"
                )));
            }
        }
    }

    Ok((out, migrated))
}

fn save_snapshot<R: Runtime>(
    app: &AppHandle<R>,
    snapshot: &AccountManagerSnapshot,
) -> AccountManagerResult<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AccountManagerError::store_fail(format!("open store: {e}")))?;
    store.set(KEY_STATIONS, json!(&snapshot.stations));
    store.set(KEY_ACCOUNTS, json!(&snapshot.accounts));
    store.set(KEY_SECRETS, json!(&snapshot.secrets));
    store.set(KEY_SESSIONS, json!(&snapshot.sessions));
    store.set(KEY_EXTERNAL_APPS, json!(&snapshot.external_apps));
    store.set(
        KEY_EXTERNAL_APP_BINDINGS,
        json!(&snapshot.external_app_bindings),
    );
    store.set(KEY_SCHEMA, json!(CURRENT_SCHEMA));
    store
        .save()
        .map_err(|e| AccountManagerError::store_fail(format!("save snapshot: {e}")))?;
    Ok(())
}

pub fn load_sessions_from_store(
    app: &AppHandle<impl Runtime>,
) -> AccountManagerResult<HashMap<String, EncryptedBlob>> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AccountManagerError::store_fail(format!("open store: {e}")))?;
    match store.get(KEY_SESSIONS) {
        Some(value) => serde_json::from_value(value)
            .map_err(|e| AccountManagerError::store_fail(format!("decode sessions: {e}"))),
        None => Ok(HashMap::new()),
    }
}
pub fn with_state_mut<R: Runtime, F, T>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    f: F,
) -> AccountManagerResult<T>
where
    F: FnOnce(&mut AccountManagerSnapshot) -> AccountManagerResult<T>,
{
    state.ensure_ready()?;
    let mut snapshot = state.snapshot.write().unwrap_or_else(|e| e.into_inner());
    let _store_lock = acquire_store_lock(app)?;
    let store_path = account_store_path(app)?;
    ensure_file_size(&store_path, MAX_STORE_FILE_BYTES)
        .map_err(|_| AccountManagerError::store_fail("account store exceeds size limit"))?;
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AccountManagerError::store_fail(format!("open store: {e}")))?;
    store
        .reload_ignore_defaults()
        .map_err(|e| AccountManagerError::store_fail(format!("reload store: {e}")))?;
    let schema = store
        .get(KEY_SCHEMA)
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    validate_schema_version(schema)?;

    let mut next = AccountManagerSnapshot {
        stations: decode_or_default(store.get(KEY_STATIONS), KEY_STATIONS)?,
        accounts: decode_or_default(store.get(KEY_ACCOUNTS), KEY_ACCOUNTS)?,
        secrets: decode_or_default(store.get(KEY_SECRETS), KEY_SECRETS)?,
        sessions: decode_or_default(store.get(KEY_SESSIONS), KEY_SESSIONS)?,
        external_apps: decode_or_default(store.get(KEY_EXTERNAL_APPS), KEY_EXTERNAL_APPS)?,
        external_app_bindings: decode_or_default(
            store.get(KEY_EXTERNAL_APP_BINDINGS),
            KEY_EXTERNAL_APP_BINDINGS,
        )?,
    };

    let result = f(&mut next)?;
    save_snapshot(app, &next)?;

    *snapshot = next;

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::account_manager::types::{AccountSessionStatus, AccountType};

    fn account(id: &str, session: Option<EncryptedBlob>) -> StationAccount {
        StationAccount {
            id: id.into(),
            station_id: "station".into(),
            username: "user".into(),
            notes: String::new(),
            phone: None,
            tg_account: None,
            linked_account: None,
            invite_link: None,
            login_methods: Vec::new(),
            status: AccountSessionStatus::Ready,
            last_login_at: None,
            last_refreshed_at: None,
            created_at: String::new(),
            has_password: false,
            account_type: AccountType::Persistent,
            website: None,
            session,
            exclusivity_group: None,
            proxy_enabled: false,
            external_app_ids: Vec::new(),
        }
    }

    #[test]
    fn legacy_session_migration_prefers_canonical_map_and_clears_account_field() {
        let legacy = EncryptedBlob {
            v: 1,
            nonce: "legacy".into(),
            ct: "legacy".into(),
        };
        let canonical = EncryptedBlob {
            v: 1,
            nonce: "canonical".into(),
            ct: "canonical".into(),
        };
        let mut accounts = vec![account("acct-1", Some(legacy))];
        let mut sessions = HashMap::from([("acct-1".into(), canonical.clone())]);

        assert!(migrate_legacy_sessions(&mut accounts, &mut sessions));
        assert!(accounts[0].session.is_none());
        assert_eq!(sessions.get("acct-1"), Some(&canonical));
    }

    #[test]
    fn rejects_future_schema_before_migration_or_write() {
        assert!(validate_schema_version(u64::from(CURRENT_SCHEMA)).is_ok());
        let error = validate_schema_version(u64::from(CURRENT_SCHEMA) + 1).unwrap_err();
        assert!(error.to_string().contains("newer than supported"));
    }
}
