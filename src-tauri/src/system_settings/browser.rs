use super::helpers::*;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn get_default_browser() -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = run_cmd("defaults", &["read", "com.apple.LaunchServices/com.apple.launchservices.secure", "LSHandlers"])?;
        for line in output.lines() {
            if line.contains("https") {
                if let Some(idx) = line.find("LSHandlerRoleAll") {
                    let rest = &line[idx..];
                    if let Some(start) = rest.find('"') {
                        if let Some(end) = rest[start + 1..].find('"') {
                            return Ok(rest[start + 1..start + 1 + end].to_string());
                        }
                    }
                }
            }
        }
        Ok("Safari".to_string())
    })
    .await
    .map_err(|e| AppError::internal(format!("get_default_browser: {e}")))?
}

#[tauri::command]
pub async fn set_default_browser(bundle_id: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let script = r#"tell application "System Events"
            tell process "CoreServicesUIAgent"
                set frontmost to true
            end tell
        end tell"#;
        let _ = run_cmd("osascript", &["-e", script]);
        let ls_register = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
        run_cmd_err(ls_register, &["-hs", &bundle_id])?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_default_browser: {e}")))?
}
