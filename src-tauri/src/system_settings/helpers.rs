#[cfg(target_os = "macos")]
use std::process::Command;
use std::{thread, time::Duration};

/// Run a shell command synchronously (blocking). Use only inside spawn_blocking.
#[cfg(target_os = "macos")]
pub fn run_cmd(cmd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("{}: {}", cmd, e))?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn run_cmd(_cmd: &str, _args: &[&str]) -> Result<String, String> {
    Err("This command is only supported on macOS".to_string())
}

/// Run a shell command synchronously, return error if non-zero exit code.
#[cfg(target_os = "macos")]
pub fn run_cmd_err(cmd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("{}: {}", cmd, e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{} failed: {}", cmd, stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn run_cmd_err(_cmd: &str, _args: &[&str]) -> Result<String, String> {
    Err("This command is only supported on macOS".to_string())
}

/// Run a command with administrator privileges via osascript GUI prompt.
#[cfg(target_os = "macos")]
pub fn sudo_cmd(shell_cmd: &str) -> Result<String, String> {
    let script = format!(
        "do shell script \"{}\" with administrator privileges",
        shell_cmd.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("osascript: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("User canceled") || stderr.contains("(-128)") {
            return Err("Operation cancelled by user".to_string());
        }
        return Err(format!("sudo failed: {}", stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn sudo_cmd(_shell_cmd: &str) -> Result<String, String> {
    Err("sudo_cmd is only supported on macOS".to_string())
}

/// defaults read helper
#[cfg(target_os = "macos")]
pub fn defaults_read(domain: &str, key: &str) -> Result<String, String> {
    run_cmd("defaults", &["read", domain, key])
}

#[cfg(not(target_os = "macos"))]
pub fn defaults_read(_domain: &str, _key: &str) -> Result<String, String> {
    Err("defaults is only supported on macOS".to_string())
}

pub fn parse_defaults_bool(value: &str) -> Result<bool, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "yes" | "true" => Ok(true),
        "0" | "no" | "false" => Ok(false),
        other => Err(format!("unexpected boolean value: {other}")),
    }
}

pub fn defaults_read_bool_result(domain: &str, key: &str) -> Result<bool, String> {
    defaults_read(domain, key).and_then(|value| parse_defaults_bool(&value))
}

pub fn defaults_read_bool_or(domain: &str, key: &str, default: bool) -> Result<bool, String> {
    match run_cmd_err("defaults", &["read", domain, key]) {
        Ok(value) => parse_defaults_bool(&value),
        Err(error) if error.contains("does not exist") => Ok(default),
        Err(error) => Err(error),
    }
}

pub fn defaults_read_string_or(domain: &str, key: &str, default: &str) -> Result<String, String> {
    match run_cmd_err("defaults", &["read", domain, key]) {
        Ok(value) if !value.trim().is_empty() => Ok(value.trim().to_string()),
        Ok(_) => Err(format!(
            "defaults returned an empty value for {domain}/{key}"
        )),
        Err(error) if error.contains("does not exist") => Ok(default.to_string()),
        Err(error) => Err(error),
    }
}

pub fn verify_setting<T, F>(expected: &T, mut read: F) -> Result<T, String>
where
    T: Clone + PartialEq + std::fmt::Debug,
    F: FnMut() -> Result<T, String>,
{
    const ATTEMPTS: usize = 4;
    let mut last_error = None;

    for attempt in 0..ATTEMPTS {
        match read() {
            Ok(actual) if &actual == expected => return Ok(actual),
            Ok(actual) => {
                last_error = Some(format!(
                    "read-after-write mismatch: expected {expected:?}, got {actual:?}"
                ));
            }
            Err(error) => last_error = Some(error),
        }

        if attempt + 1 < ATTEMPTS {
            thread::sleep(Duration::from_millis(75));
        }
    }

    Err(last_error.unwrap_or_else(|| "read-after-write verification failed".to_string()))
}

pub fn setting_verification_error(
    setting: &str,
    error: impl std::fmt::Display,
) -> crate::error::AppError {
    crate::error::AppError::new(
        "SETTING_VERIFICATION_FAILED",
        format!("{setting} was not confirmed after writing: {error}"),
    )
}

/// defaults write helper (auto-detects -bool / -int / -string by value shape)
///
/// 类型分发规则 (规范 C-6):
/// - "true" / "false" → `-bool`  (布尔开关,如 ShowPercent / AppleShowAllFiles)
/// - 纯整数 (如 "0" "1" "5" "300") → `-int`  (数值配置,如 askForPasswordDelay / springboard-rows)
/// - 其它 → `-string`  (字符串配置,如 orientation / screencapture type)
///
/// 注意:用错类型会导致系统忽略写入——这是历史上"功能失效"类 bug 的根因
/// (例如电池百分比曾因传 "YES" 走 -string 而失效)。
#[cfg(target_os = "macos")]
pub fn defaults_write(domain: &str, key: &str, value: &str) -> Result<(), String> {
    let arg = match value {
        "true" | "false" => vec!["write", domain, key, "-bool", value],
        v if v.parse::<i64>().is_ok() => vec!["write", domain, key, "-int", v],
        _ => vec!["write", domain, key, "-string", value],
    };
    run_cmd_err("defaults", &arg)?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn defaults_write(_domain: &str, _key: &str, _value: &str) -> Result<(), String> {
    Err("defaults is only supported on macOS".to_string())
}

/// defaults read boolean
pub fn defaults_read_bool(domain: &str, key: &str) -> bool {
    defaults_read_bool_result(domain, key).unwrap_or(false)
}

/// defaults -currentHost read helper (ByHost 域)
///
/// 读取 `~/Library/Preferences/ByHost/<domain>.<UUID>.plist` 中的键值。
/// 某些 macOS 设置(如 Tahoe 电池百分比)存储在 ByHost 域,必须用 `-currentHost` 读取,
/// 普通 `defaults read` 读不到这些键。
#[cfg(target_os = "macos")]
pub fn defaults_read_current_host(domain: &str, key: &str) -> Result<String, String> {
    run_cmd("defaults", &["-currentHost", "read", domain, key])
}

#[cfg(not(target_os = "macos"))]
pub fn defaults_read_current_host(_domain: &str, _key: &str) -> Result<String, String> {
    Err("defaults is only supported on macOS".to_string())
}

/// defaults -currentHost write helper (ByHost 域)
///
/// 写入 `~/Library/Preferences/ByHost/<domain>.<UUID>.plist` 中的键值。
/// 类型分发规则与 `defaults_write` 一致 (-bool / -int / -string)。
#[cfg(target_os = "macos")]
pub fn defaults_write_current_host(domain: &str, key: &str, value: &str) -> Result<(), String> {
    let arg = match value {
        "true" | "false" => vec!["-currentHost", "write", domain, key, "-bool", value],
        v if v.parse::<i64>().is_ok() => vec!["-currentHost", "write", domain, key, "-int", v],
        _ => vec!["-currentHost", "write", domain, key, "-string", value],
    };
    run_cmd_err("defaults", &arg)?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn defaults_write_current_host(_domain: &str, _key: &str, _value: &str) -> Result<(), String> {
    Err("defaults is only supported on macOS".to_string())
}

/// Restart Finder (macOS only, no-op on other platforms)
#[cfg(target_os = "macos")]
pub fn restart_finder() {
    let _ = Command::new("killall").arg("Finder").output();
}

#[cfg(not(target_os = "macos"))]
pub fn restart_finder() {}

/// Restart Dock (macOS only, no-op on other platforms)
#[cfg(target_os = "macos")]
pub fn restart_dock() {
    let _ = Command::new("killall").arg("Dock").output();
}

#[cfg(not(target_os = "macos"))]
pub fn restart_dock() {}

/// Restart ControlCenter (macOS only, no-op on other platforms)
/// 在新版 macOS (Sonoma/Sequoia/Tahoe) 上,写入菜单栏相关 defaults (如电池百分比)
/// 之后必须重启 ControlCenter 才能立即生效,否则系统 UI 不会刷新。
#[cfg(target_os = "macos")]
pub fn restart_controlcenter() {
    let _ = Command::new("killall").arg("ControlCenter").output();
}

#[cfg(not(target_os = "macos"))]
pub fn restart_controlcenter() {}

/// Restart SystemUIServer (macOS only, no-op on other platforms)
/// 在旧版 macOS (Monterey 及更早) 上,菜单栏电池百分比由 SystemUIServer 管理,
/// 写入 defaults 后必须 `killall SystemUIServer` 才能立即生效。
/// 这是传统的刷新命令,与 restart_controlcenter 互补,两者一起调用可覆盖各版本。
#[cfg(target_os = "macos")]
pub fn restart_system_ui_server() {
    let _ = Command::new("killall").arg("SystemUIServer").output();
}

#[cfg(not(target_os = "macos"))]
pub fn restart_system_ui_server() {}

/// 获取 macOS 主版本号 (例如 15 表示 macOS 15 Sequoia)。
/// 在非 macOS 平台或检测失败时返回 0。
/// 用于版本相关的兼容性处理 (如 Ventura 13+ 电池百分比设置迁移)。
#[cfg(target_os = "macos")]
pub fn macos_major_version() -> u32 {
    let output = Command::new("sw_vers").args(["-productVersion"]).output();
    match output {
        Ok(o) => {
            let v = String::from_utf8_lossy(&o.stdout).trim().to_string();
            v.split('.')
                .next()
                .and_then(|n| n.parse::<u32>().ok())
                .unwrap_or(0)
        }
        Err(_) => 0,
    }
}

#[cfg(not(target_os = "macos"))]
pub fn macos_major_version() -> u32 {
    0
}

/// Escape double quotes for AppleScript string interpolation
pub fn escape_applescript(s: &str) -> String {
    s.replace('"', "\"\"")
}
