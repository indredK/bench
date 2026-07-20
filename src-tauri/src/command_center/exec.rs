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
    run_shell_output("shell command", &mut cmd, abort)
}

#[cfg(target_os = "windows")]
pub fn run_shell(command: &str, abort: Arc<AtomicBool>) -> AppResult<RunResult> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_input("command is empty"));
    }
    // 禁止用 `start` 拉起独立窗口（与全局平台约定一致）。
    if trimmed.eq_ignore_ascii_case("start") || trimmed.to_ascii_lowercase().starts_with("start ") {
        return Err(AppError::invalid_input(
            "launching a new window via `start` is not supported",
        ));
    }
    let mut cmd = Command::new("cmd");
    cmd.arg("/C").arg(trimmed);
    run_shell_output("shell command", &mut cmd, abort)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn run_shell(_command: &str, _abort: Arc<AtomicBool>) -> AppResult<RunResult> {
    Err(AppError::unsupported(
        "shell execution is only supported on macOS/Windows",
    ))
}

fn run_shell_output(
    operation: &str,
    cmd: &mut Command,
    abort: Arc<AtomicBool>,
) -> AppResult<RunResult> {
    match run_output_with_timeout(cmd, RUN_TIMEOUT, Some(abort)) {
        Ok(output) => Ok(RunResult {
            success: output.status.success(),
            exit_code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        }),
        Err(error) => Err(subprocess_error(operation, error)),
    }
}

/// 提权执行。
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

#[cfg(target_os = "windows")]
pub fn run_admin(command: &str, _abort: Arc<AtomicBool>) -> AppResult<RunResult> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_input("command is empty"));
    }
    // 通过 PowerShell `Start-Process -Verb RunAs` 触发 UAC 提权。
    // 提权后的进程脱离当前进程树，stdout/stderr 无法回传，且 abort 信号无法送达，
    // 因此仅返回启动是否成功，不含命令输出。
    let escaped = trimmed.replace('\'', "''");
    let ps =
        format!("Start-Process -Verb RunAs -FilePath cmd.exe -ArgumentList '/C {escaped}' -Wait");
    let status = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .status()
        .map_err(|e| AppError::new("CMD_SPAWN_FAILED", format!("powershell: {e}")))?;
    if status.success() {
        Ok(RunResult {
            success: true,
            exit_code: Some(0),
            stdout: String::new(),
            stderr: String::new(),
        })
    } else {
        Err(AppError::new("CMD_FAILED", "privileged command failed"))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn run_admin(_command: &str, _abort: Arc<AtomicBool>) -> AppResult<RunResult> {
    Err(AppError::unsupported(
        "privileged execution is only supported on macOS/Windows",
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

#[cfg(target_os = "windows")]
pub fn open_target(target: &str) -> AppResult<()> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_input("target is empty"));
    }
    let status = Command::new("explorer")
        .arg(trimmed)
        .status()
        .map_err(|e| AppError::new("CMD_SPAWN_FAILED", format!("explorer: {e}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::new(
            "CMD_FAILED",
            "explorer exited unsuccessfully",
        ))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn open_target(_target: &str) -> AppResult<()> {
    Err(AppError::unsupported(
        "opening targets is only supported on macOS/Windows",
    ))
}
