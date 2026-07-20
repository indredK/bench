//! Command Center Types / 命令中心类型: DTO shapes only; 只定义数据形状.

use serde::{Deserialize, Serialize};

/// 卡片动作类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CardKind {
    /// 普通 shell 执行。
    Shell,
    /// 经 osascript 提权执行。
    ShellAdmin,
    /// 仅复制到剪贴板。
    Copy,
    /// 打开路径或 URL。
    Open,
}

/// 一张命令卡片。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandCard {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub kind: CardKind,
    /// shell/shellAdmin 的命令、copy 的文本、open 的路径或 URL。
    pub command: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

/// 执行一次卡片的结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResult {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}
