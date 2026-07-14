use serde::de::DeserializeOwned;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

use crate::persistence::{backup_file, ensure_file_size};
use crate::token_calculator::types::{builtin_standards, PricingStandard, TokenCalculatorResult};

const STORE_FILE: &str = "token-pricing-store.json";
const STORE_KEY: &str = "standards";
const STORE_KEY_REMOVED: &str = "removed_builtin_ids";
const STORE_KEY_SCHEMA: &str = "schema_version";
const CURRENT_SCHEMA: u32 = 1;
const MAX_STORE_FILE_BYTES: u64 = 8 * 1024 * 1024;

pub fn init_state<R: Runtime>(
    app: &AppHandle<R>,
    state: &crate::token_calculator::TokenCalculatorState,
) -> TokenCalculatorResult<()> {
    let store_path = app
        .path()
        .app_data_dir()
        .map(|directory| directory.join(STORE_FILE))
        .map_err(|e| store_error(format!("app data dir: {e}")))?;
    ensure_file_size(&store_path, MAX_STORE_FILE_BYTES)
        .map_err(|_| store_error("pricing store exceeds size limit"))?;
    let store = app.store(STORE_FILE).map_err(|e| {
        crate::token_calculator::types::TokenCalculatorError::StoreFail {
            message: format!("Failed to open store: {}", e),
        }
    })?;
    let schema = store
        .get(STORE_KEY_SCHEMA)
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    validate_schema(schema)?;

    // Load saved overrides
    let saved: Vec<PricingStandard> = decode_optional(store.get(STORE_KEY), STORE_KEY)?;

    // Load removed built-in IDs
    let removed: Vec<String> = decode_optional(store.get(STORE_KEY_REMOVED), STORE_KEY_REMOVED)?;

    // Start with built-in defaults, excluding removed ones
    let mut all: Vec<PricingStandard> = builtin_standards()
        .into_iter()
        .filter(|s| !removed.contains(&s.id))
        .collect();

    // Override built-ins with saved versions (matching ID → replace)
    for saved_s in &saved {
        if let Some(pos) = all.iter().position(|b| b.id == saved_s.id) {
            all[pos] = saved_s.clone();
        } else {
            // Pure custom standard – append
            all.push(saved_s.clone());
        }
    }

    if schema < u64::from(CURRENT_SCHEMA) {
        backup_file(&store_path, "pre-v1", 3)
            .map_err(|_| store_error("backup pricing store migration"))?;
        store.set(STORE_KEY_SCHEMA, serde_json::json!(CURRENT_SCHEMA));
        store
            .save()
            .map_err(|e| store_error(format!("save pricing store migration: {e}")))?;
    }

    let mut standards = state.standards.lock().unwrap_or_else(|e| e.into_inner());
    *standards = all;
    state.clear_init_error();

    Ok(())
}

fn store_error(message: impl Into<String>) -> crate::token_calculator::types::TokenCalculatorError {
    crate::token_calculator::types::TokenCalculatorError::StoreFail {
        message: message.into(),
    }
}

fn decode_optional<T: DeserializeOwned + Default>(
    value: Option<serde_json::Value>,
    label: &str,
) -> TokenCalculatorResult<T> {
    match value {
        Some(value) => serde_json::from_value(value)
            .map_err(|error| store_error(format!("decode {label}: {error}"))),
        None => Ok(T::default()),
    }
}

fn validate_schema(schema: u64) -> TokenCalculatorResult<()> {
    if schema > u64::from(CURRENT_SCHEMA) {
        Err(store_error(format!(
            "pricing store schema {schema} is newer than supported schema {CURRENT_SCHEMA}"
        )))
    } else {
        Ok(())
    }
}

fn save_all_standards<R: Runtime>(
    app: &AppHandle<R>,
    standards: &[PricingStandard],
    removed_ids: &[String],
) -> TokenCalculatorResult<()> {
    let store = app.store(STORE_FILE).map_err(|e| {
        crate::token_calculator::types::TokenCalculatorError::StoreFail {
            message: format!("Failed to open store: {}", e),
        }
    })?;
    let schema = store
        .get(STORE_KEY_SCHEMA)
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    validate_schema(schema)?;

    // Save all standards (both built-in overrides and custom)
    let value = serde_json::to_value(standards).map_err(|e| {
        crate::token_calculator::types::TokenCalculatorError::StoreFail {
            message: format!("Failed to serialize: {}", e),
        }
    })?;
    store.set(STORE_KEY, value);

    // Save removed built-in IDs
    let removed_value = serde_json::to_value(removed_ids).map_err(|e| {
        crate::token_calculator::types::TokenCalculatorError::StoreFail {
            message: format!("Failed to serialize removed IDs: {}", e),
        }
    })?;
    store.set(STORE_KEY_REMOVED, removed_value);
    store.set(STORE_KEY_SCHEMA, serde_json::json!(CURRENT_SCHEMA));

    store.save().map_err(
        |e| crate::token_calculator::types::TokenCalculatorError::StoreFail {
            message: format!("Failed to save store: {}", e),
        },
    )?;

    Ok(())
}

/// Mutate all standards and persist them before publishing the new in-memory state.
pub fn with_standards_mut<R: Runtime, F, T>(
    app: &AppHandle<R>,
    state: &crate::token_calculator::TokenCalculatorState,
    f: F,
) -> TokenCalculatorResult<T>
where
    F: FnOnce(&mut Vec<PricingStandard>) -> TokenCalculatorResult<T>,
{
    state.ensure_ready()?;
    let mut standards = state.standards.lock().unwrap_or_else(|e| e.into_inner());
    let mut next = standards.clone();
    let result = f(&mut next)?;

    // Save all current standards + track removed built-in IDs
    let builtin_default_ids: Vec<String> =
        builtin_standards().iter().map(|s| s.id.clone()).collect();
    let current_ids: Vec<String> = next.iter().map(|s| s.id.clone()).collect();
    let removed_ids: Vec<String> = builtin_default_ids
        .into_iter()
        .filter(|id| !current_ids.contains(id))
        .collect();

    save_all_standards(app, &next, &removed_ids)?;
    *standards = next;

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn future_pricing_schema_is_fail_closed() {
        assert!(validate_schema(u64::from(CURRENT_SCHEMA)).is_ok());
        assert!(validate_schema(u64::from(CURRENT_SCHEMA) + 1).is_err());
    }

    #[test]
    fn malformed_saved_values_are_not_silently_reset() {
        let result = decode_optional::<Vec<String>>(Some(serde_json::json!({"bad": true})), "ids");
        assert!(result.is_err());
    }
}
