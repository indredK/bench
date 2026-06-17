use std::collections::HashMap;

use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use super::crypto::{self, EncryptedBlob};
use super::state::ApiBillingState;
use super::types::{ApiBillingError, ApiBillingResult, RelayStation, StationAccount};

const STORE_FILE: &str = "relay-store.json";
const KEY_STATIONS: &str = "stations";
const KEY_ACCOUNTS: &str = "accounts";
const KEY_SECRETS: &str = "secrets";
const KEY_SCHEMA: &str = "schema_version";
const CURRENT_SCHEMA: u32 = 2;

#[derive(Clone)]
pub struct ApiBillingSnapshot {
    pub stations: Vec<RelayStation>,
    pub accounts: Vec<StationAccount>,
    pub secrets: HashMap<String, EncryptedBlob>,
}

/// Load persisted state from the plugin-store and populate the managed state.
/// Called once during `setup`. Migrates P0 plaintext secrets to encrypted blobs.
pub fn init_state<R: Runtime>(app: &AppHandle<R>, state: &ApiBillingState) -> ApiBillingResult<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| ApiBillingError::store_fail(format!("open store: {e}")))?;

    let stations: Vec<RelayStation> = store
        .get(KEY_STATIONS)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let accounts: Vec<StationAccount> = store
        .get(KEY_ACCOUNTS)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let (secrets, needs_resave) = load_and_migrate_secrets(store.get(KEY_SECRETS), state)?;

    *state.stations.lock().unwrap() = stations;
    *state.accounts.lock().unwrap() = accounts;
    *state.secrets.lock().unwrap() = secrets.clone();

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
            .map_err(|e| ApiBillingError::store_fail(format!("save migrations: {e}")))?;
    }

    Ok(())
}

/// Read the raw secrets value and convert it to `HashMap<String, EncryptedBlob>`.
/// Returns `(map, needs_resave)` — `needs_resave` is true when P0 plaintext entries
/// were encountered and encrypted.
fn load_and_migrate_secrets(
    raw: Option<Value>,
    state: &ApiBillingState,
) -> ApiBillingResult<(HashMap<String, EncryptedBlob>, bool)> {
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
                        return Err(ApiBillingError::store_fail(format!(
                            "decode secret {id}: {e}"
                        )));
                    }
                }
            }
            other => {
                return Err(ApiBillingError::store_fail(format!(
                    "unexpected secret shape for {id}: {other}"
                )));
            }
        }
    }

    Ok((out, migrated))
}

fn save_snapshot<R: Runtime>(
    app: &AppHandle<R>,
    snapshot: &ApiBillingSnapshot,
) -> ApiBillingResult<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| ApiBillingError::store_fail(format!("open store: {e}")))?;
    store.set(KEY_STATIONS, json!(&snapshot.stations));
    store.set(KEY_ACCOUNTS, json!(&snapshot.accounts));
    store.set(KEY_SECRETS, json!(&snapshot.secrets));
    store.set(KEY_SCHEMA, json!(CURRENT_SCHEMA));
    store
        .save()
        .map_err(|e| ApiBillingError::store_fail(format!("save snapshot: {e}")))?;
    Ok(())
}

pub fn with_state_mut<R: Runtime, F, T>(
    app: &AppHandle<R>,
    state: &ApiBillingState,
    f: F,
) -> ApiBillingResult<T>
where
    F: FnOnce(&mut ApiBillingSnapshot) -> ApiBillingResult<T>,
{
    let mut stations = state.stations.lock().unwrap_or_else(|e| e.into_inner());
    let mut accounts = state.accounts.lock().unwrap_or_else(|e| e.into_inner());
    let mut secrets = state.secrets.lock().unwrap_or_else(|e| e.into_inner());

    let mut next = ApiBillingSnapshot {
        stations: stations.clone(),
        accounts: accounts.clone(),
        secrets: secrets.clone(),
    };

    let result = f(&mut next)?;
    save_snapshot(app, &next)?;

    *stations = next.stations;
    *accounts = next.accounts;
    *secrets = next.secrets;

    Ok(result)
}
