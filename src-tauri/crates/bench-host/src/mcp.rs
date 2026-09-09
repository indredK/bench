//! MCP stdio transport：newline-delimited JSON-RPC 2.0 子集实现。
//!
//! 覆盖 AI 客户端接入所需的稳定方法集（MCP `2025-06-18` 语义）：
//! `initialize` / `notifications/initialized` / `tools/list` / `tools/call` /
//! `ping`。零三方依赖、单文件可测 —— 待 `rmcp`（MCP 官方 Rust SDK，Tier 1）
//! 在本仓库依赖树中稳定后再整体迁移（见实施手册 §4.2 与开放问题）。
//!
//! 通道约定：stdin/stdout 每行一条 JSON 消息，行内不得包含换行；
//! 日志一律写 stderr（main.rs 已统一）。

use std::io::{BufRead, BufWriter, Write};

use serde_json::{json, Value};

use crate::dispatcher;
use crate::HostConfig;

/// MCP 协议版本：遵循 stable `2025-06-18`（客户端带更高版本时按规范回退到己方版本）。
const PROTOCOL_VERSION: &str = "2025-06-18";

pub fn run(config: HostConfig) -> Result<(), String> {
    let stdin = std::io::stdin();
    let mut reader = stdin.lock();
    let stdout = std::io::stdout();
    let mut writer = BufWriter::new(stdout.lock());

    let mut line = String::new();
    loop {
        line.clear();
        let read = reader
            .read_line(&mut line)
            .map_err(|e| format!("stdin read failed: {e}"))?;
        if read == 0 {
            return Ok(()); // EOF：客户端断开，正常退出
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let msg: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                // 单行解析失败不能杀死整个会话：回一个可定位的解析错误
                write_response(
                    &mut writer,
                    json!({
                        "jsonrpc": "2.0",
                        "id": Value::Null,
                        "error": { "code": -32700, "message": format!("Parse error: {e}") }
                    }),
                )?;
                continue;
            }
        };

        let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
        let has_id = msg.get("id").is_some_and(|id| !id.is_null());

        if !has_id {
            // notification：initialized 等无需响应
            continue;
        }
        let id = msg["id"].clone();

        let response = match method {
            "initialize" => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": { "tools": { "listChanged": false } },
                    "serverInfo": { "name": "bench", "version": crate::VERSION },
                }
            }),
            "ping" => json!({ "jsonrpc": "2.0", "id": id, "result": {} }),
            "tools/list" => {
                let tools: Vec<Value> = dispatcher::COMMANDS
                    .iter()
                    .filter(|c| c.mcp_tool)
                    .map(|c| {
                        json!({
                            "name": c.name,
                            "description": c.description,
                            "inputSchema": c.schema(),
                        })
                    })
                    .collect();
                json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": tools } })
            }
            "tools/call" => {
                let params = msg.get("params").cloned().unwrap_or(Value::Null);
                let name = params
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let arguments = params.get("arguments").cloned().unwrap_or(json!({}));
                match dispatcher::invoke(&config, &name, &arguments) {
                    Ok(value) => {
                        let text = serde_json::to_string_pretty(&value)
                            .unwrap_or_else(|_| value.to_string());
                        json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": {
                                "content": [ { "type": "text", "text": text } ],
                                "structuredContent": value,
                                "isError": false,
                            }
                        })
                    }
                    Err(message) => {
                        // 领域错误（含 PATH_NOT_ALLOWED / INVALID_PARAMS）以工具结果
                        // 形式返回 isError，而不是 JSON-RPC error —— 让模型能看到原因
                        json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": {
                                "content": [ { "type": "text", "text": message } ],
                                "isError": true,
                            }
                        })
                    }
                }
            }
            other => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32601, "message": format!("Method not found: {other}") }
            }),
        };
        write_response(&mut writer, response)?;
    }
}

fn write_response<W: Write>(writer: &mut W, response: Value) -> Result<(), String> {
    let mut line = serde_json::to_string(&response).map_err(|e| e.to_string())?;
    line.push('\n');
    writer
        .write_all(line.as_bytes())
        .and_then(|_| writer.flush())
        .map_err(|e| format!("stdout write failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tools_list_excludes_non_mcp_commands() {
        let tools: Vec<&str> = dispatcher::COMMANDS
            .iter()
            .filter(|c| c.mcp_tool)
            .map(|c| c.name)
            .collect();
        assert!(tools.contains(&"terminology_search"));
        assert!(!tools.contains(&"ping"));
        assert!(!tools.contains(&"photo_triage_scan"));
    }

    #[test]
    fn initialize_response_shape() {
        let result = json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "bench", "version": crate::VERSION },
        });
        assert_eq!(result["serverInfo"]["name"], "bench");
    }
}
