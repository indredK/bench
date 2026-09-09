//! CLI 模式：`bench-host tools` 与 `bench-host call <command> [params-json]`。
//!
//! 供终端、脚本、Raycast Script Commands 与 CI 冒烟使用。
//! 输出统一 JSON（pretty）；错误输出到 stderr 并以非零码退出。

use serde_json::{json, Value};

use crate::dispatcher;
use crate::HostConfig;

pub fn print_tools() {
    let tools: Vec<Value> = dispatcher::COMMANDS
        .iter()
        .map(|c| {
            json!({
                "name": c.name,
                "description": c.description,
                "mcpTool": c.mcp_tool,
                "requiresRoot": c.requires_root,
            })
        })
        .collect();
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({ "commands": tools })).unwrap()
    );
}

pub fn run(config: HostConfig, args: &[String]) -> Result<(), String> {
    let Some(command) = args.first() else {
        return Err("用法: bench-host call <command> [params-json]".into());
    };
    if command == "--help" || command == "-h" {
        println!("用法: bench-host call <command> [params-json]");
        return Ok(());
    }
    let params: Value = match args.get(1) {
        None => json!({}),
        Some(raw) => serde_json::from_str(raw).map_err(|e| format!("INVALID_PARAMS_JSON: {e}"))?,
    };
    let result = dispatcher::invoke(&config, command, &params)?;
    println!("{}", serde_json::to_string_pretty(&result).unwrap());
    Ok(())
}
