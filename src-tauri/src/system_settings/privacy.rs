use super::helpers::*;

/// TCC 服务白名单 (规范 A-1/A-2:读/写命令共享同一份校验)
const ALLOWED_TCC_SERVICES: &[&str] = &[
    "kTCCServiceCamera", "kTCCServiceMicrophone", "kTCCServiceScreenCapture",
    "kTCCServiceSystemPolicyAllFiles", "kTCCServiceLocation", "kTCCServiceAccessibility",
    "kTCCServicePostEvent", "kTCCServiceListenEvent", "kTCCServiceMediaLibrary",
    "kTCCServiceBluetoothAlways",
];

// Gatekeeper: macOS Tahoe 上 System Settings 使用私有 SecurityPreferences 框架控制，
// spctl 无 --enable-status/--disable-status，defaults 无对应键，第三方工具无法写入。
// 当前实现为只读。

#[tauri::command]
pub async fn get_gatekeeper_state() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = run_cmd("spctl", &["-v", "--status"])?;
        if output.contains("developer id enabled") {
            Ok("identified_developers".to_string())
        } else {
            Ok("app_store".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_tcc_permissions(service: String) -> Result<super::types::TccPermission, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !ALLOWED_TCC_SERVICES.contains(&service.as_str()) {
            return Err(format!("Invalid service: {}", service));
        }
        let home = std::env::var("HOME").unwrap_or_default();
        let tcc_db = format!("{}/Library/Application Support/com.apple.TCC/TCC.db", home);
        let query = format!("SELECT client, auth_value FROM access WHERE service='{}';", service);
        let output = std::process::Command::new("sqlite3")
            .args([&tcc_db, "-header", "-csv", &query])
            .output()
            .map_err(|e| format!("sqlite3: {}", e))?;
        // 规范 P-4:检测 TCC.db 读取失败 (通常缺少「完全磁盘访问」权限),
        // 返回明确错误而非空列表,避免用户误判当前权限状态
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("operation was denied") || stderr.contains("unable to open database") {
                return Err("Requires Full Disk Access to read TCC database".to_string());
            }
            return Err(format!("sqlite3 failed: {}", stderr.trim()));
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut allowed = Vec::new();
        let mut denied = Vec::new();
        for line in stdout.lines().skip(1) {
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() >= 2 {
                let app = parts[0].trim_matches('"').to_string();
                let auth: i32 = parts[1].trim().parse().unwrap_or(0);
                if auth == 2 { allowed.push(app); } else { denied.push(app); }
            }
        }
        Ok(super::types::TccPermission { service, allowed, denied })
    })
    .await
    .map_err(|e| e.to_string())?
}

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
