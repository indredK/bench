//! System Settings / 系统设置快捷入口
//!
//! Platform-specific: open macOS System Settings → Storage pane.

use std::process::Command;

use crate::error::{AppError, AppResult};

/// Open macOS System Settings → Storage pane.
///
/// Uses `open "x-apple.systempreferences:com.apple.Settings?Storage"`.
/// Falls back to `?General` on failure.
pub fn open_system_storage_settings() -> AppResult<()> {
    #[cfg(target_os = "macos")]
    {
        let primary = "x-apple.systempreferences:com.apple.Settings?Storage";
        let result = Command::new("open").arg(primary).output();

        match result {
            Ok(out) if out.status.success() => Ok(()),
            _ => {
                // Fallback to General settings
                let fallback = "x-apple.systempreferences:com.apple.Settings?General";
                let fb_result = Command::new("open").arg(fallback).output();
                match fb_result {
                    Ok(out) if out.status.success() => Ok(()),
                    Ok(out) => {
                        let stderr = String::from_utf8_lossy(&out.stderr);
                        Err(AppError::io(format!(
                            "Failed to open System Settings: {}",
                            stderr
                        )))
                    }
                    Err(e) => Err(AppError::io(format!(
                        "Failed to launch open command: {}",
                        e
                    ))),
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
