//! Extension 审计日志（P3.3 A6，spec §6.2 / roadmap P3.3）。
//!
//! 追加式 JSONL：`$APPDATA/ext-audit.log`，每行一条
//! `{ ts, event, id, version, reason }`。事件覆盖插件全生命周期与安全拒绝：
//! `install` / `enable` / `disable` / `uninstall` / `verify_fail` /
//! `acl_deny` / `revoke_hit`。
//!
//! - **不落隐私数据**：只记 id / 版本 / 事件 / 拒绝原因（错误消息本身不含
//!   用户路径与内容——错误消息由各调用点构造时保证）；
//! - **环形上限**：超过 [`MAX_AUDIT_BYTES`] 时保留最新一半（按行对齐截断）；
//! - **best-effort**：审计写失败不阻断宿主动作（拒绝本身不受影响），
//!   仅 stderr 记录 —— 审计是可观测性，不是门禁。

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::error::AppResult;

/// 审计日志文件名（`$APPDATA/ext-audit.log`）。
pub const EXT_AUDIT_FILE: &str = "ext-audit.log";

/// 环形上限（roadmap P3.3：建议 2MB 滚动）。
pub const MAX_AUDIT_BYTES: u64 = 2 * 1024 * 1024;

/// 审计事件类型（spec §6.2 / roadmap P3.3 事件集）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuditEvent {
    /// 安装成功（market 安装管线终点的原子落位之后）。
    Install,
    /// 启用（清除 `.disabled` 标记）。
    Enable,
    /// 禁用（写入 `.disabled` 标记）。
    Disable,
    /// 卸载（产物目录删除）。
    Uninstall,
    /// 完整性/签名/清单校验失败（fail-closed 拒绝）。
    VerifyFail,
    /// IPC 网关拒绝 `ext-` 窗口的越权命令。
    AclDeny,
    /// registry `revoked[]` 命中（强制禁用）。
    RevokeHit,
}

impl AuditEvent {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuditEvent::Install => "install",
            AuditEvent::Enable => "enable",
            AuditEvent::Disable => "disable",
            AuditEvent::Uninstall => "uninstall",
            AuditEvent::VerifyFail => "verify_fail",
            AuditEvent::AclDeny => "acl_deny",
            AuditEvent::RevokeHit => "revoke_hit",
        }
    }
}

/// 单条审计记录（JSONL 一行）。
#[derive(Debug, Serialize)]
struct AuditRecord<'a> {
    ts: String,
    event: &'static str,
    id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'a str>,
}

/// `$APPDATA/ext-audit.log` 路径。
fn audit_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(EXT_AUDIT_FILE))
}

/// 记录审计事件（best-effort：失败仅 stderr）。
pub fn record<R: Runtime>(
    app: &AppHandle<R>,
    event: AuditEvent,
    extension_id: &str,
    version: Option<&str>,
    reason: Option<&str>,
) {
    let Some(path) = audit_path(app) else {
        eprintln!("[extension_host] audit: cannot resolve app data dir");
        return;
    };
    if let Err(error) = record_at(&path, event, extension_id, version, reason) {
        eprintln!("[extension_host] audit write failed: {error}");
    }
}

/// 追加一条审计记录（纯文件系统核心，便于测试）。
fn record_at(
    path: &Path,
    event: AuditEvent,
    extension_id: &str,
    version: Option<&str>,
    reason: Option<&str>,
) -> AppResult<()> {
    rotate_if_needed(path)?;
    let record = AuditRecord {
        ts: chrono::Utc::now().to_rfc3339(),
        event: event.as_str(),
        id: extension_id,
        version,
        reason,
    };
    let line = serde_json::to_string(&record)
        .map_err(|e| crate::error::AppError::internal(format!("serialize audit record: {e}")))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| crate::error::AppError::io(format!("create audit dir: {e}")))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| crate::error::AppError::io(format!("open audit log: {e}")))?;
    writeln!(file, "{line}")
        .map_err(|e| crate::error::AppError::io(format!("append audit log: {e}")))?;
    Ok(())
}

/// 环形滚动：超过 [`MAX_AUDIT_BYTES`] 时仅保留最新一半（按行对齐）。
///
/// 同时供诊断 JSONL（`ext-diagnostics.jsonl`）复用 —— 同样的 2MB 上限。
pub fn rotate_diagnostics(path: &Path) -> AppResult<()> {
    rotate_if_needed(path)
}

/// 环形滚动核心。
fn rotate_if_needed(path: &Path) -> AppResult<()> {
    let Ok(metadata) = fs::metadata(path) else {
        return Ok(()); // 文件不存在：无需滚动。
    };
    if metadata.len() <= MAX_AUDIT_BYTES {
        return Ok(());
    }
    let content = fs::read_to_string(path)
        .map_err(|e| crate::error::AppError::io(format!("read audit log: {e}")))?;
    let keep_from = content.len() / 2;
    // 行首对齐：丢弃残行。
    let tail = &content[keep_from..];
    let aligned = match tail.find('\n') {
        Some(index) => &tail[index + 1..],
        None => "",
    };
    fs::write(path, aligned)
        .map_err(|e| crate::error::AppError::io(format!("rotate audit log: {e}")))?;
    Ok(())
}

/// 读取最近 `max_lines` 条审计记录（诊断面板用，P4）。
pub fn read_recent<R: Runtime>(app: &AppHandle<R>, max_lines: usize) -> AppResult<Vec<String>> {
    let Some(path) = audit_path(app) else {
        return Ok(Vec::new());
    };
    read_recent_at(&path, max_lines)
}

fn read_recent_at(path: &Path, max_lines: usize) -> AppResult<Vec<String>> {
    let content = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => {
            return Err(crate::error::AppError::io(format!("read audit log: {e}")));
        }
    };
    let lines: Vec<String> = content.lines().map(str::to_string).collect();
    let start = lines.len().saturating_sub(max_lines);
    Ok(lines[start..].to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_path(tag: &str) -> PathBuf {
        let unique = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "bench-ext-audit-{tag}-{}-{unique}.log",
            std::process::id()
        ))
    }

    #[test]
    fn appends_jsonl_records() {
        let path = temp_path("append");
        record_at(
            &path,
            AuditEvent::Install,
            "photo-triage",
            Some("0.2.0"),
            None,
        )
        .expect("append install");
        record_at(
            &path,
            AuditEvent::VerifyFail,
            "evil-ext",
            Some("1.0.0"),
            Some("sha256 mismatch"),
        )
        .expect("append verify_fail");

        let content = fs::read_to_string(&path).expect("read log");
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        let first: serde_json::Value = serde_json::from_str(lines[0]).expect("json line");
        assert_eq!(first["event"], "install");
        assert_eq!(first["id"], "photo-triage");
        assert_eq!(first["version"], "0.2.0");
        assert!(first["ts"].as_str().expect("ts present").contains("T"));
        let second: serde_json::Value = serde_json::from_str(lines[1]).expect("json line");
        assert_eq!(second["event"], "verify_fail");
        assert_eq!(second["reason"], "sha256 mismatch");
        fs::remove_file(&path).ok();
    }

    #[test]
    fn rotates_when_over_limit() {
        let path = temp_path("rotate");
        // 写入超过上限的行（每行 ~1KB，共 3MB）。
        let filler = "x".repeat(1024);
        for index in 0..3072 {
            record_at(
                &path,
                AuditEvent::Enable,
                "photo-triage",
                None,
                Some(&format!("{index}{filler}")),
            )
            .expect("append");
        }
        let size_after = fs::metadata(&path).expect("meta").len();
        assert!(
            size_after <= MAX_AUDIT_BYTES + 4096,
            "rotated file should be near the cap, got {size_after}"
        );
        // 滚动后仍是合法 JSONL（行对齐截断）。
        let recent = read_recent_at(&path, 5).expect("read recent");
        assert_eq!(recent.len(), 5);
        for line in &recent {
            let value: serde_json::Value = serde_json::from_str(line).expect("aligned json line");
            assert_eq!(value["event"], "enable");
        }
        fs::remove_file(&path).ok();
    }

    #[test]
    fn event_names_cover_required_set() {
        let expected = [
            "install",
            "enable",
            "disable",
            "uninstall",
            "verify_fail",
            "acl_deny",
            "revoke_hit",
        ];
        let actual = [
            AuditEvent::Install,
            AuditEvent::Enable,
            AuditEvent::Disable,
            AuditEvent::Uninstall,
            AuditEvent::VerifyFail,
            AuditEvent::AclDeny,
            AuditEvent::RevokeHit,
        ];
        for (event, name) in actual.iter().zip(expected.iter()) {
            assert_eq!(event.as_str(), *name);
        }
    }
}
