use super::helpers::*;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn get_keyboard_fn_key_state() -> AppResult<bool> {
    tauri::async_runtime::spawn_blocking(|| Ok(defaults_read_bool("com.apple.keyboard", "fnState")))
        .await
        .map_err(|e| AppError::internal(format!("get_keyboard_fn_key_state: {e}")))?
}

#[tauri::command]
pub async fn set_keyboard_fn_key_state(use_fn: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if use_fn { "true" } else { "false" };
        defaults_write("com.apple.keyboard", "fnState", val)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_keyboard_fn_key_state: {e}")))?
}

macro_rules! ns_global_bool_toggle {
    ($get_fn:ident, $set_fn:ident, $key:literal) => {
        #[tauri::command]
        pub async fn $get_fn() -> AppResult<bool> {
            tauri::async_runtime::spawn_blocking(|| Ok(defaults_read_bool("NSGlobalDomain", $key)))
                .await
                .map_err(|e| AppError::internal(format!("{}: {}", stringify!($get_fn), e)))?
        }

        #[tauri::command]
        pub async fn $set_fn(enabled: bool) -> AppResult<()> {
            tauri::async_runtime::spawn_blocking(move || {
                defaults_write(
                    "NSGlobalDomain",
                    $key,
                    if enabled { "true" } else { "false" },
                )?;
                Ok(())
            })
            .await
            .map_err(|e| AppError::internal(format!("{}: {}", stringify!($set_fn), e)))?
        }
    };
}

ns_global_bool_toggle!(
    get_auto_correct_state,
    set_auto_correct_state,
    "NSAutomaticSpellingCorrectionEnabled"
);
ns_global_bool_toggle!(
    get_smart_quotes_state,
    set_smart_quotes_state,
    "NSAutomaticQuoteSubstitutionEnabled"
);
ns_global_bool_toggle!(
    get_smart_dashes_state,
    set_smart_dashes_state,
    "NSAutomaticDashSubstitutionEnabled"
);
ns_global_bool_toggle!(
    get_auto_capitalize_state,
    set_auto_capitalize_state,
    "NSAutomaticCapitalizationEnabled"
);
