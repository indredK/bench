//! 命令路由核心：MCP tools、Native Messaging 命令与 CLI 共用同一份实现。
//!
//! 每个 [`Command`] 声明：
//! - `mcp_tool`: 是否暴露为 MCP tool（只读命令才暴露 —— 删除类能力一律留在
//!   Bench GUI 内执行，见 docs/implementation-playbook-mcp-and-browser.md §4.1）；
//! - `requires_root`: 是否需要路径白名单（涉及用户文件系统时为 true）；
//! - `input_schema`: 手写 JSON Schema（与实现保持同步，CI 冒烟会抽查）。

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use serde_json::{json, Value};

use bench_capabilities as caps;

use crate::HostConfig;

pub struct Command {
    pub name: &'static str,
    pub description: &'static str,
    pub mcp_tool: bool,
    pub requires_root: bool,
    /// 手写 JSON Schema 字面量（static 中不能用动态构造，运行时解析一次）。
    pub input_schema: &'static str,
}

impl Command {
    pub fn schema(&self) -> Value {
        serde_json::from_str(self.input_schema).expect("static schema must be valid JSON")
    }
}

pub const COMMANDS: &[Command] = &[
    Command {
        name: "ping",
        description: "探活：返回 { pong: true }。不暴露为 MCP tool（协议层自带 ping）。",
        mcp_tool: false,
        requires_root: false,
        input_schema: r#"{ "type": "object", "properties": {} }"#,
    },
    Command {
        name: "terminology_search",
        description: "在 Bench 术语库中检索术语（匹配标题与描述，大小写不敏感），返回术语、释义与「行业 / 分类」层级路径。用于确保写作与代码中的术语用法与团队术语表一致。",
        mcp_tool: true,
        requires_root: false,
        input_schema: r#"{
            "type": "object",
            "properties": {
                "query": { "type": "string", "description": "搜索关键词" },
                "limit": { "type": "integer", "description": "返回条数上限，默认 20", "minimum": 1, "maximum": 100 }
            },
            "required": ["query"]
        }"#,
    },
    Command {
        name: "terminology_list_industries",
        description: "列出 Bench 术语库的行业 / 分类 / 子分类树。",
        mcp_tool: true,
        requires_root: false,
        input_schema: r#"{ "type": "object", "properties": {} }"#,
    },
    Command {
        name: "terminology_stats",
        description: "返回术语库规模统计（术语数、行业数）。术语库为空时 count 为 0，不视为错误。",
        mcp_tool: true,
        requires_root: false,
        input_schema: r#"{ "type": "object", "properties": {} }"#,
    },
    Command {
        name: "clean_space_scan_custom_folder",
        description: "只读扫描一个已授权目录，按「文件早于 N 天」规则估算可清理项与可释放字节数。不会删除任何文件。",
        mcp_tool: true,
        requires_root: true,
        input_schema: r#"{
            "type": "object",
            "properties": {
                "path": { "type": "string", "description": "绝对路径；必须位于 --allow-root 白名单内" },
                "mtimeDays": { "type": "integer", "description": "仅包含早于 N 天的文件，默认 30", "minimum": 0 },
                "includeSubfolders": { "type": "boolean", "description": "是否递归子目录，默认 false" }
            },
            "required": ["path"]
        }"#,
    },
    Command {
        name: "photo_triage_album_summary",
        description: "读取 Bench 照片筛选的相册清单（build 目录下的 manifest.json）并返回统计：总数、图/视频/Live 构成、已删除数、按目录聚合。只读。",
        mcp_tool: true,
        requires_root: true,
        input_schema: r#"{
            "type": "object",
            "properties": {
                "buildDir": { "type": "string", "description": "相册构建目录（包含 manifest.json）；必须位于 --allow-root 白名单内" }
            },
            "required": ["buildDir"]
        }"#,
    },
    Command {
        name: "photo_triage_scan",
        description: "对相册源目录执行扫描并生成 manifest（会写入 build 目录）。仅浏览器扩展与 CLI 可用；不暴露为 MCP tool（重量级写操作）。",
        mcp_tool: false,
        requires_root: true,
        input_schema: r#"{
            "type": "object",
            "properties": {
                "src": { "type": "string", "description": "相册源目录（绝对路径，须在白名单内）" },
                "build": { "type": "string", "description": "构建输出目录（绝对路径，须在白名单内）" },
                "force": { "type": "boolean", "description": "true 时清空代理缓存重建，默认 false" }
            },
            "required": ["src", "build"]
        }"#,
    },
];

pub fn find(name: &str) -> Option<&'static Command> {
    COMMANDS.iter().find(|c| c.name == name)
}

/// 调用一个命令。返回 JSON 值；未知命令 / 参数错误 / 白名单拒绝都会返回 `Err`。
pub fn invoke(config: &HostConfig, name: &str, params: &Value) -> Result<Value, String> {
    let _command = find(name).ok_or_else(|| format!("UNKNOWN_COMMAND: {name}"))?;
    let params = params.as_object().cloned().unwrap_or_default();
    let result = match name {
        "ping" => Ok(json!({ "pong": true, "version": crate::VERSION })),
        "terminology_search" => {
            let query = params
                .get("query")
                .and_then(Value::as_str)
                .ok_or("INVALID_PARAMS: query (string) is required")?;
            let limit = params
                .get("limit")
                .and_then(Value::as_u64)
                .map(|v| v as usize)
                .unwrap_or(20);
            let snapshot = config.store.load().map_err(|e| e.to_string())?;
            Ok(json!({
                "query": query,
                "count": snapshot.term_count(),
                "hits": snapshot.search(query, limit),
            }))
        }
        "terminology_list_industries" => {
            let snapshot = config.store.load().map_err(|e| e.to_string())?;
            Ok(json!({ "industries": snapshot.list_industries() }))
        }
        "terminology_stats" => {
            let snapshot = config.store.load().map_err(|e| e.to_string())?;
            Ok(json!({
                "termCount": snapshot.term_count(),
                "industryCount": snapshot.industries.len(),
                "isEmpty": snapshot.is_empty(),
            }))
        }
        "clean_space_scan_custom_folder" => {
            let path = params
                .get("path")
                .and_then(Value::as_str)
                .ok_or("INVALID_PARAMS: path (string) is required")?;
            config
                .guard
                .check(std::path::Path::new(path))
                .map_err(|e| e.to_string())?;
            let mtime_days = params
                .get("mtimeDays")
                .and_then(Value::as_u64)
                .map(|v| v as u32)
                .unwrap_or(30);
            let include_subfolders = params
                .get("includeSubfolders")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            caps::clean_space::scan_custom_folder(path, mtime_days, include_subfolders)
                .map(|r| serde_json::to_value(r).expect("serialize FolderScanResult"))
                .map_err(|e| e.to_string())
        }
        "photo_triage_album_summary" => {
            let build = params
                .get("buildDir")
                .and_then(Value::as_str)
                .ok_or("INVALID_PARAMS: buildDir (string) is required")?;
            config
                .guard
                .check(std::path::Path::new(build))
                .map_err(|e| e.to_string())?;
            caps::photo_triage::read_manifest_summary(std::path::Path::new(build))
                .map(|r| serde_json::to_value(r).expect("serialize ManifestSummary"))
                .map_err(|e| e.to_string())
        }
        "photo_triage_scan" => {
            let src = params
                .get("src")
                .and_then(Value::as_str)
                .ok_or("INVALID_PARAMS: src (string) is required")?;
            let build = params
                .get("build")
                .and_then(Value::as_str)
                .ok_or("INVALID_PARAMS: build (string) is required")?;
            config
                .guard
                .check(std::path::Path::new(src))
                .map_err(|e| e.to_string())?;
            config
                .guard
                .check(std::path::Path::new(build))
                .map_err(|e| e.to_string())?;
            let force = params
                .get("force")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let mut progress = |_: caps::photo_triage::BuildProgress| {};
            let cancel = AtomicBool::new(false);
            caps::photo_triage::build_manifest(
                std::path::Path::new(src),
                std::path::Path::new(build),
                force,
                &mut progress,
                &cancel,
            )
            .map(|count| json!({ "count": count, "build": build }))
            .map_err(|e| e.to_string())
        }
        other => Err(format!("UNKNOWN_COMMAND: {other}")),
    };
    let _ = Arc::new(()); // 保持 std 引用风格一致（无操作）
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use bench_capabilities::{PathGuard, StoreLocator};

    fn test_config() -> HostConfig {
        HostConfig {
            guard: PathGuard::default(),
            store: StoreLocator::default(),
        }
    }

    #[test]
    fn ping_roundtrip() {
        let out = invoke(&test_config(), "ping", &json!({})).unwrap();
        assert_eq!(out["pong"], true);
    }

    #[test]
    fn unknown_command_is_error() {
        assert!(invoke(&test_config(), "nope", &json!({}))
            .unwrap_err()
            .starts_with("UNKNOWN_COMMAND"));
    }

    #[test]
    fn missing_required_param_is_error() {
        assert!(invoke(&test_config(), "terminology_search", &json!({}))
            .unwrap_err()
            .starts_with("INVALID_PARAMS"));
    }

    #[test]
    fn fs_command_requires_allow_root() {
        let err = invoke(
            &test_config(),
            "clean_space_scan_custom_folder",
            &json!({ "path": "/tmp" }),
        )
        .unwrap_err();
        assert!(err.contains("PATH_NOT_ALLOWED"), "got: {err}");
    }

    #[test]
    fn no_destructive_command_is_mcp_tool() {
        // 安全红线：MCP 不暴露任何删除/清理执行类工具
        for command in COMMANDS {
            let destructive = command.name.contains("trash")
                || command.name.contains("delete")
                || command.name.contains("cleanup")
                || command.name.contains("remove");
            if destructive {
                assert!(
                    !command.mcp_tool,
                    "{} must not be exposed as an MCP tool",
                    command.name
                );
            }
        }
    }

    #[test]
    fn scan_is_not_mcp_tool() {
        assert!(!find("photo_triage_scan").unwrap().mcp_tool);
    }
}
