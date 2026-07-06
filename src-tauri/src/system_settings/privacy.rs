use super::helpers::*;
use crate::error::{AppError, AppResult};

const ALLOWED_TCC_SERVICES: &[&str] = &[
    "kTCCServiceCamera", "kTCCServiceMicrophone", "kTCCServiceScreenCapture",
    "kTCCServiceSystemPolicyAllFiles", "kTCCServiceLocation", "kTCCServiceAccessibility",
    "kTCCServicePostEvent", "kTCCServiceListenEvent", "kTCCServiceMediaLibrary",
    "kTCCServiceBluetoothAlways",
];

#[tauri::command]
pub async fn reset_tcc_permission(service: String, bundle_id: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        if !ALLOWED_TCC_SERVICES.contains(&service.as_str()) {
            return Err(AppError::invalid_input(format!("Invalid service: {}", service)));
        }
        if bundle_id.is_empty() || bundle_id.chars().any(|c| c.is_whitespace() || c == '\'' || c == '"' || c == ';') {
            return Err(AppError::invalid_input("Invalid bundle id"));
        }
        run_cmd_err("tccutil", &["reset", &service, &bundle_id])?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("reset_tcc_permission: {e}")))?
}
