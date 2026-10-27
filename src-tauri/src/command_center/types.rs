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
    /// 用户自定义分组；缺失时代表未分组，兼容旧 cards.json / 导出文件。
    #[serde(default)]
    pub group: String,
    /// 用户自定义标签；缺失时为空，兼容旧 cards.json / 导出文件。
    #[serde(default)]
    pub tags: Vec<String>,
    pub created_at: u64,
    pub updated_at: u64,
    /// 命令市场来源（P5；缺省 = 本地手建卡片）。市场安装/升级时写入。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub market: Option<MarketProvenance>,
}

impl CommandCard {
    /// Bound user-controlled organization metadata even for direct IPC or imported JSON writes.
    pub fn normalize_classification(&mut self) {
        self.group = self.group.trim().chars().take(80).collect();

        let mut seen = std::collections::HashSet::new();
        self.tags = self
            .tags
            .drain(..)
            .filter_map(|tag| {
                let tag: String = tag.trim().chars().take(40).collect();
                if tag.is_empty() || !seen.insert(tag.to_lowercase()) {
                    return None;
                }
                Some(tag)
            })
            .take(12)
            .collect();
    }
}

/// 命令市场来源标记（spec：extension-workflow §12）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketProvenance {
    /// 市场命令版本（X.Y.Z；参与版本单调检查）。
    pub version: String,
    /// 安装时间（unix 秒）。
    pub installed_at: u64,
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

/// 命令市场 id 校验（与市场仓库 build-registry 同规则：`^[a-z][a-z0-9-]*$`）。
pub fn is_valid_command_id(id: &str) -> bool {
    let mut chars = id.chars();
    match chars.next() {
        Some(first) if first.is_ascii_lowercase() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

#[cfg(test)]
mod tests {
    use super::CommandCard;

    #[test]
    fn legacy_cards_default_group_and_tags() {
        let legacy = r#"{
            "id":"legacy-card",
            "title":"Legacy",
            "description":"",
            "kind":"shell",
            "command":"echo legacy",
            "icon":null,
            "createdAt":1,
            "updatedAt":1
        }"#;

        let card: CommandCard = serde_json::from_str(legacy).expect("legacy card deserializes");
        assert!(card.group.is_empty());
        assert!(card.tags.is_empty());
    }

    #[test]
    fn classification_is_trimmed_bounded_and_deduplicated() {
        let mut card: CommandCard = serde_json::from_str(
            r#"{
                "id":"metadata-card",
                "title":"Metadata",
                "kind":"shell",
                "command":"echo metadata",
                "createdAt":1,
                "updatedAt":1,
                "group":"  Networking  ",
                "tags":[" API ","api","界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界界","local"]
            }"#,
        )
        .expect("metadata card deserializes");

        card.normalize_classification();

        assert_eq!(card.group, "Networking");
        assert_eq!(card.tags.len(), 3);
        assert_eq!(card.tags[0], "API");
        assert_eq!(card.tags[1].chars().count(), 40);
        assert_eq!(card.tags[2], "local");
    }
}
