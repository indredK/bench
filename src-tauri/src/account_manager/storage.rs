use std::collections::HashMap;

use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use super::crypto::{self, EncryptedBlob};
use super::state::{AccountManagerSnapshot, AccountManagerState};
use super::types::{AccountManagerError, AccountManagerResult, RelayStation, StationAccount};

const STORE_FILE: &str = "account-manager-store.json";
const KEY_STATIONS: &str = "stations";
const KEY_ACCOUNTS: &str = "accounts";
const KEY_SECRETS: &str = "secrets";
const KEY_SCHEMA: &str = "schema_version";
const KEY_EXTERNAL_APPS: &str = "external_apps";
const KEY_EXTERNAL_APP_BINDINGS: &str = "external_app_bindings";
const CURRENT_SCHEMA: u32 = 4;

/// Load persisted state from the plugin-store and populate the managed state.
/// Called once during `setup`. Migrates P0 plaintext secrets to encrypted blobs.
pub fn init_state<R: Runtime>(app: &AppHandle<R>, state: &AccountManagerState) -> AccountManagerResult<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AccountManagerError::store_fail(format!("open store: {e}")))?;

    let stations: Vec<RelayStation> = store
        .get(KEY_STATIONS)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let accounts: Vec<StationAccount> = store
        .get(KEY_ACCOUNTS)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let (secrets, needs_resave) = load_and_migrate_secrets(store.get(KEY_SECRETS), state)?;

    let sessions = load_sessions_from_store(app);
    let external_apps: Vec<super::types::ExternalApp> = store
        .get(KEY_EXTERNAL_APPS)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let external_app_bindings: Vec<super::types::ExternalAppBinding> = store
        .get(KEY_EXTERNAL_APP_BINDINGS)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let snapshot = AccountManagerSnapshot {
        stations,
        accounts,
        secrets: secrets.clone(),
        sessions,
        external_apps,
        external_app_bindings,
    };
    state.replace_snapshot(snapshot);

    let schema = store
        .get(KEY_SCHEMA)
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let mut dirty = false;
    if needs_resave {
        store.set(KEY_SECRETS, json!(secrets));
        dirty = true;
    }
    if schema < CURRENT_SCHEMA as u64 {
        store.set(KEY_SCHEMA, json!(CURRENT_SCHEMA));
        dirty = true;
    }
    if dirty {
        store
            .save()
            .map_err(|e| AccountManagerError::store_fail(format!("save migrations: {e}")))?;
    }

    state.clear_init_error();

    Ok(())
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
            Value::Object(_) => {
                match serde_json::from_value::<EncryptedBlob>(entry) {
                    Ok(blob) => {
                        out.insert(id, blob);
                    }
                    Err(e) => {
                        return Err(AccountManagerError::store_fail(format!(
                            "decode secret {id}: {e}"
                        )));
                    }
                }
            }
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
    store.set("sessions", json!(&snapshot.sessions));
    store.set(KEY_EXTERNAL_APPS, json!(&snapshot.external_apps));
    store.set(KEY_EXTERNAL_APP_BINDINGS, json!(&snapshot.external_app_bindings));
    store.set(KEY_SCHEMA, json!(CURRENT_SCHEMA));
    store
        .save()
        .map_err(|e| AccountManagerError::store_fail(format!("save snapshot: {e}")))?;
    Ok(())
}



// Session Manager: schema v3 additions
#[allow(dead_code)]
pub fn save_sessions_to_store(
    app: &AppHandle<impl Runtime>,
    sessions: &HashMap<String, EncryptedBlob>,
) -> AccountManagerResult<()> {
    let store = app.store(STORE_FILE)
        .map_err(|e| AccountManagerError::store_fail(format!("open store: {e}")))?;
    store.set("sessions", serde_json::json!(sessions));
    store.save()
        .map_err(|e| AccountManagerError::store_fail(format!("save sessions: {e}")))?;
    Ok(())
}

pub fn load_sessions_from_store(app: &AppHandle<impl Runtime>) -> HashMap<String, EncryptedBlob> {
    let Ok(store) = app.store(STORE_FILE) else { return HashMap::new() };
    store.get("sessions")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

#[allow(dead_code)]
pub fn flush_to_disk(app: &AppHandle<impl Runtime>) -> AccountManagerResult<()> {
    let store = app.store(STORE_FILE)
        .map_err(|e| AccountManagerError::store_fail(format!("open store: {e}")))?;
    store.save()
        .map_err(|e| AccountManagerError::store_fail(format!("flush: {e}")))?;
    Ok(())
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

    let mut next = snapshot.clone();

    let result = f(&mut next)?;
    save_snapshot(app, &next)?;

    *snapshot = next;

    Ok(result)
}
