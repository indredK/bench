use super::helpers::*;

/// TCC 服务白名单 (规范 A-1/A-2:读/写命令共享同一份校验)
const ALLOWED_TCC_SERVICES: &[&str] = &[
    "kTCCServiceCamera", "kTCCServiceMicrophone", "kTCCServiceScreenCapture",
    "kTCCServiceSystemPolicyAllFiles", "kTCCServiceLocation", "kTCCServiceAccessibility",
    "kTCCServicePostEvent", "kTCCServiceListenEvent", "kTCCServiceMediaLibrary",
    "kTCCServiceBluetoothAlways",
];

#[tauri::command]
pub async fn reset_tcc_permission(service: String, bundle_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 规范 A-2:写操作须与读操作校验对齐,复用同一份白名单
        if !ALLOWED_TCC_SERVICES.contains(&service.as_str()) {
            return Err(format!("Invalid service: {}", service));
        }
        // bundle_id 不含空格与 shell 元字符 (合法反向域名格式)
        if bundle_id.is_empty() || bundle_id.chars().any(|c| c.is_whitespace() || c == '\'' || c == '"' || c == ';') {
            return Err("Invalid bundle id".to_string());
        }
        run_cmd_err("tccutil", &["reset", &service, &bundle_id])?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
