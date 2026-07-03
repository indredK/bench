use super::helpers::*;

#[tauri::command]
pub async fn get_keyboard_fn_key_state() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(defaults_read_bool("com.apple.keyboard", "fnState")))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_keyboard_fn_key_state(use_fn: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if use_fn { "true" } else { "false" };
        defaults_write("com.apple.keyboard", "fnState", val)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── 文本替换控制（NSGlobalDomain，开发者刚需）──

macro_rules! ns_global_bool_toggle {
    ($get_fn:ident, $set_fn:ident, $key:literal) => {
        #[tauri::command]
        pub async fn $get_fn() -> Result<bool, String> {
            tauri::async_runtime::spawn_blocking(|| {
                Ok(defaults_read_bool("NSGlobalDomain", $key))
            })
            .await
            .map_err(|e| e.to_string())?
        }

        #[tauri::command]
        pub async fn $set_fn(enabled: bool) -> Result<(), String> {
            tauri::async_runtime::spawn_blocking(move || {
                defaults_write("NSGlobalDomain", $key, if enabled { "true" } else { "false" })?;
                Ok(())
            })
            .await
            .map_err(|e| e.to_string())?
        }
    };
}

ns_global_bool_toggle!(get_auto_correct_state, set_auto_correct_state, "NSAutomaticSpellingCorrectionEnabled");
ns_global_bool_toggle!(get_smart_quotes_state, set_smart_quotes_state, "NSAutomaticQuoteSubstitutionEnabled");
ns_global_bool_toggle!(get_smart_dashes_state, set_smart_dashes_state, "NSAutomaticDashSubstitutionEnabled");
ns_global_bool_toggle!(get_auto_capitalize_state, set_auto_capitalize_state, "NSAutomaticCapitalizationEnabled");
