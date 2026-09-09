//! MCP 客户端配置写入：探测 + 深合并 + 备份 + 校验回滚。
//!
//! 与浏览器扩展不同，MCP 的「安装」就是往客户端配置文件写一段 JSON ——
//! 这是 Bench 可完全自动化的接入路径（见实施手册 §0.2）。
//!
//! 安全约束：
//! - **深合并**：只插入/更新 `mcpServers.bench` 键，绝不覆盖用户既有配置；
//! - 写入前备份原文件；写回后反序列化校验，失败即回滚。

use serde::Serialize;
use std::path::{Path, PathBuf};

pub const SERVER_KEY: &str = "bench";

/// 已知的 MCP 客户端配置位置（macOS 路径；找不到则标记 not_installed）。
pub fn mcp_targets() -> Vec<McpTarget> {
    let home = std::env::var("HOME").unwrap_or_default();
    let app_support = |p: &str| {
        PathBuf::from(&home)
            .join("Library/Application Support")
            .join(p)
    };
    vec![
        McpTarget {
            id: "claude_desktop".into(),
            name: "Claude Desktop".into(),
            config_path: app_support("Claude/claude_desktop_config.json"),
            installed_hint: app_support("Claude").is_dir(),
        },
        McpTarget {
            id: "claude_code".into(),
            name: "Claude Code".into(),
            config_path: PathBuf::from(&home).join(".claude.json"),
            installed_hint: PathBuf::from(&home).join(".claude.json").exists(),
        },
        McpTarget {
            id: "cursor".into(),
            name: "Cursor".into(),
            config_path: PathBuf::from(&home).join(".cursor/mcp.json"),
            installed_hint: PathBuf::from(&home).join(".cursor").is_dir(),
        },
        McpTarget {
            id: "vscode".into(),
            name: "VS Code (Copilot)".into(),
            config_path: app_support("Code/User/mcp.json"),
            installed_hint: app_support("Code").is_dir(),
        },
        McpTarget {
            id: "windsurf".into(),
            name: "Windsurf".into(),
            config_path: PathBuf::from(&home).join(".codeium/windsurf/mcp_config.json"),
            installed_hint: PathBuf::from(&home).join(".codeium").is_dir(),
        },
    ]
}

#[derive(Debug, Clone, Serialize)]
pub struct McpTarget {
    pub id: String,
    pub name: String,
    pub config_path: PathBuf,
    /// 客户端疑似已安装（仅作 UI 提示，不作为写入门槛）
    pub installed_hint: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpInstallResult {
    pub target_id: String,
    pub config_path: String,
    pub installed: bool,
    pub already_up_to_date: bool,
    pub backup_path: Option<String>,
    pub message: String,
}

/// 生成 `mcpServers.bench` 的配置段。
pub fn bench_server_entry(host_bin: &Path) -> serde_json::Value {
    serde_json::json!({
        "command": host_bin.display().to_string(),
        "args": ["mcp"],
    })
}

/// 把 `entry` 深合并进配置文件的 `mcpServers` 下（保留其余键）。
/// 已是同值时返回 `already_up_to_date = true` 且不写盘。
pub fn install_to(config_path: &Path, entry: &serde_json::Value) -> Result<bool, String> {
    let original = if config_path.exists() {
        std::fs::read_to_string(config_path).map_err(|e| format!("读取配置失败: {e}"))?
    } else {
        "{}".to_string()
    };
    let mut root: serde_json::Value = serde_json::from_str(&original)
        .map_err(|e| format!("配置不是合法 JSON（{config_path:?}）: {e}"))?;

    // 已配置且一致 → 幂等
    let current = root.get("mcpServers").and_then(|m| m.get(SERVER_KEY));
    if current == Some(entry) {
        return Ok(true);
    }

    // 深合并写入
    if root.get("mcpServers").is_none() {
        root["mcpServers"] = serde_json::json!({});
    }
    root["mcpServers"][SERVER_KEY] = entry.clone();
    let updated = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;

    // 备份（仅当文件已存在）
    let mut backup_path = None;
    if config_path.exists() {
        let backup = config_path.with_extension("bench-backup");
        std::fs::copy(config_path, &backup).map_err(|e| format!("备份失败: {e}"))?;
        backup_path = Some(backup.display().to_string());
    }

    // 确保父目录存在（mcp.json 可能尚未创建）
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }

    std::fs::write(config_path, &updated).map_err(|e| format!("写入配置失败: {e}"))?;

    // 写后校验：能重新解析才视为成功；失败回滚
    if let Err(e) = serde_json::from_str::<serde_json::Value>(&updated) {
        if let Some(bp) = &backup_path {
            let _ = std::fs::copy(bp, config_path);
        }
        return Err(format!("写入后校验失败（已回滚）: {e}"));
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_without_touching_existing_servers() {
        let dir = std::env::temp_dir().join(format!("mcp-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("mcp.json");
        std::fs::write(
            &path,
            r#"{ "mcpServers": { "github": { "command": "npx", "args": ["-y", "x"] } }, "other": 1 }"#,
        )
        .unwrap();

        let entry = serde_json::json!({ "command": "/bin/echo", "args": ["mcp"] });
        let already = install_to(&path, &entry).unwrap();
        assert!(!already);

        let merged: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        // 既有配置保留
        assert_eq!(merged["mcpServers"]["github"]["command"], "npx");
        assert_eq!(merged["other"], 1);
        // bench 条目写入
        assert_eq!(merged["mcpServers"]["bench"]["command"], "/bin/echo");

        // 幂等：再次写入返回 already_up_to_date
        assert!(install_to(&path, &entry).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
