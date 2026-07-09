use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::token_calculator::types::{builtin_standards, PricingStandard, TokenCalculatorResult};

const STORE_FILE: &str = "token-pricing-store.json";
const STORE_KEY: &str = "standards";
const STORE_KEY_REMOVED: &str = "removed_builtin_ids";

pub fn init_state<R: Runtime>(
    app: &AppHandle<R>,
    state: &crate::token_calculator::TokenCalculatorState,
) -> TokenCalculatorResult<()> {
    let store = app.store(STORE_FILE).map_err(|e| {
        crate::token_calculator::types::TokenCalculatorError::StoreFail {
            message: format!("Failed to open store: {}", e),
        }
    })?;

    // Load saved overrides
    let saved: Vec<PricingStandard> = store
        .get(STORE_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // Load removed built-in IDs
    let removed: Vec<String> = store
        .get(STORE_KEY_REMOVED)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

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

    let mut standards = state.standards.lock().unwrap_or_else(|e| e.into_inner());
    *standards = all;
    state.clear_init_error();

    Ok(())
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
