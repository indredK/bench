//! bench-host / Bench 能力出口。
//!
//! 单一二进制，按子命令切换角色（全部基于 stdio，日志一律走 stderr）：
//!
//! - `bench-host mcp`    —— MCP stdio server（newline-delimited JSON-RPC 2.0），
//!   供 Claude Desktop / Claude Code / Cursor / VS Code Copilot 等 AI 客户端接入；
//! - `bench-host native` —— Chrome/Edge/Firefox Native Messaging host
//!   （4 字节本机序长度前缀 + JSON），供 bench-companion 浏览器扩展调用；
//! - `bench-host tools`  —— 列出全部命令（CLI 排查用）；
//! - `bench-host call <command> [params-json]` —— 直接调用一次命令，JSON 输出。
//!
//! 三种通道共享 [`dispatcher`]，命令实现只有一份。
//!
//! 工程铁律：stdout 是协议通道。任何日志/调试输出必须走 stderr，
//! 否则会破坏帧解析且极难排查（CI 有 stdout 纯净性冒烟测试）。

mod cli;
mod dispatcher;
mod mcp;
mod native;

use bench_capabilities::{PathGuard, StoreLocator};

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone)]
pub struct HostConfig {
    pub guard: PathGuard,
    pub store: StoreLocator,
    /// Bench app 写下的浏览器扩展本地桥描述文件（端口 + 一次性 token）。
    /// `None` 表示未由 app 生成 wrapper 启动，此时桥相关命令会明确报错而非猜测路径。
    pub bridge_descriptor: Option<std::path::PathBuf>,
}

fn print_usage() {
    eprintln!(
        "bench-host v{VERSION}\n\
         \n\
         USAGE:\n\
         \x20 bench-host mcp [--allow-root <dir>]... [--store-dir <dir>] [--bridge-descriptor <file>]\n\
         \x20 bench-host native [--allow-root <dir>]... [--store-dir <dir>] [--bridge-descriptor <file>]\n\
         \x20 bench-host tools\n\
         \x20 bench-host call <command> [params-json] [--allow-root <dir>]... [--store-dir <dir>] [--bridge-descriptor <file>]\n\
         \n\
         Subcommands:\n\
         \x20 mcp     MCP stdio server (AI clients)\n\
         \x20 native  Browser Native Messaging host (bench-companion extension)\n\
         \x20 tools   List available commands\n\
         \x20 call    Invoke one command and print the JSON result\n\
         \n\
         Flags:\n\
         \x20 --bridge-descriptor <file>  Bench 写入的浏览器扩展本地桥描述（端口 + 一次性 token）"
    );
}

/// 手写 argv 解析：子命令 + 可重复的全局 flag。零三方依赖，模式数量少，不值得引 clap。
fn parse_args(args: &[String]) -> Option<(String, Vec<String>, HostConfig)> {
    let mut subcommand: Option<String> = None;
    let mut rest: Vec<String> = Vec::new();
    let mut allow_roots: Vec<String> = Vec::new();
    let mut store_dir: Option<String> = None;
    let mut bridge_descriptor: Option<String> = None;

    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        match arg.as_str() {
            "--allow-root" => {
                i += 1;
                allow_roots.push(args.get(i)?.clone());
            }
            "--store-dir" => {
                i += 1;
                store_dir = Some(args.get(i)?.clone());
            }
            "--bridge-descriptor" => {
                i += 1;
                bridge_descriptor = Some(args.get(i)?.clone());
            }
            "--help" | "-h" | "help" => return None,
            _ if subcommand.is_none() => subcommand = Some(arg.clone()),
            _ => rest.push(arg.clone()),
        }
        i += 1;
    }

    let store = match store_dir {
        Some(dir) => StoreLocator::with_dir(dir),
        None => StoreLocator::default(),
    };
    Some((
        subcommand?,
        rest,
        HostConfig {
            guard: PathGuard::new(allow_roots),
            store,
            bridge_descriptor: bridge_descriptor.map(std::path::PathBuf::from),
        },
    ))
}

fn main() {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let Some((subcommand, rest, config)) = parse_args(&raw) else {
        print_usage();
        std::process::exit(2);
    };

    let code = match subcommand.as_str() {
        "mcp" => mcp::run(config),
        "native" => native::run(config),
        "tools" => {
            cli::print_tools();
            Ok(())
        }
        "call" => cli::run(config, &rest),
        other => {
            eprintln!("未知子命令: {other}");
            print_usage();
            std::process::exit(2);
        }
    }
    .err()
    .map(|e| {
        eprintln!("bench-host: {e}");
        1
    })
    .unwrap_or(0);
    std::process::exit(code);
}
