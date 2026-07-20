//! Command Center Execution / 命令中心执行: run shell/admin/open; 只做命令执行.

use std::process::Command;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Duration;

use crate::command_center::types::RunResult;
use crate::error::{AppError, AppResult};
use crate::subprocess::{run_output_with_timeout, SubprocessError, SubprocessErrorKind};

const RUN_TIMEOUT: Duration = Duration::from_secs(300);

fn subprocess_error(operation: &str, error: SubprocessError) -> AppError {
    let (code, reason) = match error.kind {
        SubprocessErrorKind::Spawn => ("CMD_SPAWN_FAILED", "could not start".to_string()),
        SubprocessErrorKind::Exit => (
            "CMD_FAILED",
            error
                .exit_code
                .map(|c| format!("exited with code {c}"))
                .unwrap_or_else(|| "exited unsuccessfully".to_string()),
        ),
        SubprocessErrorKind::Timeout => ("CMD_TIMEOUT", "timed out".to_string()),
        SubprocessErrorKind::Wait => ("CMD_FAILED", "could not be monitored".to_string()),
        SubprocessErrorKind::Aborted => ("CMD_ABORTED", "aborted by user".to_string()),
    };
    AppError::new(code, format!("{operation} {reason}"))
}

/// 普通 shell 执行，捕获 stdout/stderr。
#[cfg(target_os = "macos")]
pub fn run_shell(command: &str, abort: Arc<AtomicBool>) -> AppResult<RunResult> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_input("command is empty"));
    }
    let mut cmd = Command::new("/bin/sh");
    cmd.arg("-c").arg(trimmed);
    match run_output_with_timeout(&mut cmd, RUN_TIMEOUT, Some(abort)) {
        Ok(output) => Ok(RunResult {
            success: output.status.success(),
            exit_code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        }),
        Err(error) => Err(subprocess_error("shell command", error)),
    }
}

#[cfg(not(target_os = "macos"))]
pub fn run_shell(_command: &str, _abort: Arc<AtomicBool>) -> AppResult<RunResult> {
    Err(AppError::unsupported(
        "shell execution is only supported on macOS",
    ))
}

/// 提权执行（macOS osascript GUI prompt）。
#[cfg(target_os = "macos")]
pub fn run_admin(command: &str, abort: Arc<AtomicBool>) -> AppResult<RunResult> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_input("command is empty"));
    }
    let script = format!(
        "do shell script \"{}\" with administrator privileges",
        trimmed.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let mut cmd = Command::new("osascript");
    cmd.arg("-e").arg(&script);
    match run_output_with_timeout(&mut cmd, RUN_TIMEOUT, Some(abort)) {
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
            if !output.status.success()
                && (stderr.contains("User canceled") || stderr.contains("(-128)"))
            {
                return Err(AppError::new("CMD_CANCELLED", "cancelled by user"));
            }
            Ok(RunResult {
                success: output.status.success(),
                exit_code: output.status.code(),
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                stderr,
            })
        }
        Err(error) => Err(subprocess_error("privileged command", error)),
    }
}

#[cfg(not(target_os = "macos"))]
pub fn run_admin(_command: &str, _abort: Arc<AtomicBool>) -> AppResult<RunResult> {
    Err(AppError::unsupported(
        "privileged execution is only supported on macOS",
    ))
}

/// 打开路径或 URL。
#[cfg(target_os = "macos")]
pub fn open_target(target: &str) -> AppResult<()> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_input("target is empty"));
    }
    let status = Command::new("open")
        .arg(trimmed)
        .status()
        .map_err(|e| AppError::new("CMD_SPAWN_FAILED", format!("open: {e}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::new("CMD_FAILED", "open exited unsuccessfully"))
    }
}

#[cfg(not(target_os = "macos"))]
pub fn open_target(_target: &str) -> AppResult<()> {
    Err(AppError::unsupported(
        "opening targets is only supported on macOS",
    ))
}
