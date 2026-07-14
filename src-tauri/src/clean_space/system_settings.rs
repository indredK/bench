//! System Settings / 系统设置快捷入口
//!
//! Platform-specific: open macOS System Settings → Storage pane.

use std::process::Command;
use std::time::Duration;

use crate::error::{AppError, AppResult};
use crate::subprocess::run_status_with_timeout;

const OPEN_SETTINGS_TIMEOUT: Duration = Duration::from_secs(10);

/// Open macOS System Settings → Storage pane.
///
/// Uses `open "x-apple.systempreferences:com.apple.Settings?Storage"`.
/// Falls back to `?General` on failure.
pub fn open_system_storage_settings() -> AppResult<()> {
    #[cfg(target_os = "macos")]
    {
        let primary = "x-apple.systempreferences:com.apple.Settings?Storage";
        let result =
            run_status_with_timeout(Command::new("open").arg(primary), OPEN_SETTINGS_TIMEOUT);

        match result {
            Ok(_) => Ok(()),
            _ => {
                // Fallback to General settings
                let fallback = "x-apple.systempreferences:com.apple.Settings?General";
                let fb_result = run_status_with_timeout(
                    Command::new("open").arg(fallback),
                    OPEN_SETTINGS_TIMEOUT,
                );
                match fb_result {
                    Ok(_) => Ok(()),
                    Err(_) => Err(AppError::io("Failed to open System Settings")),
                }
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err(AppError::unsupported(
            "System storage settings is only supported on macOS",
        ))
    }
}
