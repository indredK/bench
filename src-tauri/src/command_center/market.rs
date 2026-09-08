//! Command Market（P5）：命令脚本与 Bench 客户端解耦发布。
//!
//! **目标**（用户约定）：命令脚本可独立于 Bench 发布/更新——命令作者把命令
//! 发布到独立仓库（Git 托管静态 JSON），Bench 从市场源拉取并一键安装进
//! 本地命令卡片库，无需重新发布客户端。
//!
//! **市场源**（后端 canonical 配置，renderer 不得自选 —— 对齐 D-007）：
//! - env `BENCH_COMMAND_MARKET_URL`：远程索引（指向 `registry.json` 的 https URL，含相对 `file` 下载）；
//! - env `BENCH_COMMAND_MARKET_DIR`：本地目录（开发调试，直接读盘）。
//! - 两者都未配置 → 市场为空（能力保留，UI 显示空态提示）。
//!
//! **安装管线（fail-closed，任一步失败即拒绝且不改动本地卡片库）**：
//! 1. 拉取并校验 registry（schemaVersion、file 安全相对路径、sha256 格式）；
//! 2. 解析命令文件，校验 sha256 + size、id 与请求一致、kind/command 合法；
//! 3. 版本单调：同 id 卡片的 market 版本 ≥ 新版本 → 拒绝降级；
//! 4. 落位：写入/覆盖卡片（id 与市场命令 id 一致，携带 `market` 来源标记）。

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use sha2::Digest;

use crate::error::{AppError, AppResult};

use super::{
    storage,
    types::{CardKind, CommandCard, MarketProvenance},
};

/// registry schema 版本（宿主支持版本；与 command-market 仓库同步演进）。
pub const MARKET_SCHEMA_VERSION: u32 = 1;

const REGISTRY_URL_ENV: &str = "BENCH_COMMAND_MARKET_URL";
const REGISTRY_DIR_ENV: &str = "BENCH_COMMAND_MARKET_DIR";

/// 官方命令市场索引（kindred-plugin-market org；env 未设置时作为默认源 —— P5 零配置）。
pub const OFFICIAL_COMMAND_MARKET_URL: &str =
    "https://raw.githubusercontent.com/kindred-plugin-market/command-market/main/registry.json";

/// 远程 registry 条目。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MarketRegistryEntry {
    pub id: String,
    pub version: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub kind: CardKind,
    /// 相对 registry 的命令文件路径（`commands/<id>.json`）。
    pub file: String,
    /// 命令文件 sha256（hex 64）。
    pub sha256: String,
    /// 命令文件字节数。
    pub size: u64,
}

/// registry 索引文档。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MarketRegistry {
    pub schema_version: u32,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub commands: Vec<MarketRegistryEntry>,
}

/// 市场命令文件（可安装的完整命令定义）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MarketCommandDoc {
    pub schema_version: u32,
    pub id: String,
    pub version: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub kind: CardKind,
    pub command: String,
    #[serde(default)]
    pub icon: Option<String>,
}

/// 市场列表（返回给命令中心；安装状态由宿主比对本地卡片库得出）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandMarketListing {
    /// 市场源描述（url / dir）；未配置时为 None（UI 显示空态）。
    pub source: Option<String>,
    pub updated_at: Option<String>,
    pub commands: Vec<MarketCommandDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketCommandDto {
    pub id: String,
    pub version: String,
    pub title: String,
    pub description: String,
    pub kind: CardKind,
    /// 已安装（本地卡片 market 版本一致或更高）。
    pub installed: bool,
    /// 本地已装版本更低，可升级。
    pub upgradable: bool,
}

/// 市场源解析结果。
enum MarketSource {
    Url(String),
    Dir(PathBuf),
}

/// 读取市场源配置（两者都未配置 = 市场未启用）。
fn market_source() -> AppResult<Option<MarketSource>> {
    let dir = std::env::var(REGISTRY_DIR_ENV).unwrap_or_default();
    if !dir.trim().is_empty() {
        return Ok(Some(MarketSource::Dir(PathBuf::from(dir.trim()))));
    }
    let url = std::env::var(REGISTRY_URL_ENV).unwrap_or_default();
    let url = url.trim().to_string();
    if url.is_empty() {
        // P5：未配置 env → 官方默认源（零配置市场）。
        return Ok(Some(MarketSource::Url(
            OFFICIAL_COMMAND_MARKET_URL.to_string(),
        )));
    }
    if !url.starts_with("https://") {
        return Err(AppError::internal(format!(
            "{REGISTRY_URL_ENV} must be https, got `{url}`"
        )));
    }
    Ok(Some(MarketSource::Url(url)))
}

fn is_valid_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

fn is_valid_semver(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

/// 版本单调比较：`a >= b`（三段纯数字逐段比较）。
fn version_at_least(a: &str, b: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.split('.')
            .map(|p| p.parse::<u64>().unwrap_or(0))
            .collect()
    };
    let (av, bv) = (parse(a), parse(b));
    for i in 0..3 {
        let x = av.get(i).copied().unwrap_or(0);
        let y = bv.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    true
}

/// registry 校验（fail-closed）。
fn validate_registry(doc: &MarketRegistry) -> AppResult<()> {
    if doc.schema_version != MARKET_SCHEMA_VERSION {
        return Err(AppError::unsupported(format!(
            "command market schema_version {} not supported (host supports {})",
            doc.schema_version, MARKET_SCHEMA_VERSION
        )));
    }
    let mut seen = std::collections::BTreeSet::new();
    for entry in &doc.commands {
        if !super::types::is_valid_command_id(&entry.id) {
            return Err(AppError::invalid_input(format!(
                "registry command id `{}` is invalid",
                entry.id
            )));
        }
        if !seen.insert(entry.id.clone()) {
            return Err(AppError::invalid_input(format!(
                "registry contains duplicate command id `{}`",
                entry.id
            )));
        }
        if !is_valid_semver(&entry.version) {
            return Err(AppError::invalid_input(format!(
                "registry command `{}` has invalid version `{}`",
                entry.id, entry.version
            )));
        }
        // file 必须是 registry 内的安全相对路径（防穿越/绝对路径投喂）。
        let file = Path::new(&entry.file);
        if file.is_absolute()
            || entry.file.starts_with('/')
            || entry
                .file
                .split('/')
                .any(|seg| seg == ".." || seg.is_empty())
            || !entry.file.starts_with("commands/")
        {
            return Err(AppError::invalid_input(format!(
                "registry command `{}` file `{}` must be a relative path under commands/",
                entry.id, entry.file
            )));
        }
        if !is_valid_sha256_hex(&entry.sha256) {
            return Err(AppError::invalid_input(format!(
                "registry command `{}` has invalid sha256",
                entry.id
            )));
        }
    }
    Ok(())
}

/// 拉取 registry（bytes）。
async fn fetch_registry_bytes(source: &MarketSource) -> AppResult<Vec<u8>> {
    match source {
        MarketSource::Dir(dir) => {
            let path = dir.join("registry.json");
            std::fs::read(&path).map_err(|e| AppError::io(format!("read {}: {e}", path.display())))
        }
        MarketSource::Url(url) => {
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .map_err(|e| AppError::internal(format!("build http client: {e}")))?;
            let response = client
                .get(url)
                .send()
                .await
                .map_err(|e| AppError::internal(format!("fetch {url}: {e}")))?;
            if !response.status().is_success() {
                return Err(AppError::internal(format!(
                    "fetch {url}: HTTP {}",
                    response.status()
                )));
            }
            let bytes = response
                .bytes()
                .await
                .map_err(|e| AppError::internal(format!("read {url}: {e}")))?;
            Ok(bytes.to_vec())
        }
    }
}

/// 拉取命令文件（bytes）。
async fn fetch_command_bytes(source: &MarketSource, file: &str) -> AppResult<Vec<u8>> {
    match source {
        MarketSource::Dir(dir) => {
            let path = dir.join(file);
            std::fs::read(&path).map_err(|e| AppError::io(format!("read {}: {e}", path.display())))
        }
        MarketSource::Url(url) => {
            // 命令文件 URL = registry URL 同目录 + file 相对路径。
            let trimmed = url.trim_end_matches('/');
            let base = match trimmed.rfind('/') {
                Some(idx) => trimmed[..idx].to_string(),
                None => trimmed.to_string(),
            };
            let file_url = format!("{base}/{file}");
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .map_err(|e| AppError::internal(format!("build http client: {e}")))?;
            let response = client
                .get(&file_url)
                .send()
                .await
                .map_err(|e| AppError::internal(format!("fetch {file_url}: {e}")))?;
            if !response.status().is_success() {
                return Err(AppError::internal(format!(
                    "fetch {file_url}: HTTP {}",
                    response.status()
                )));
            }
            let bytes = response
                .bytes()
                .await
                .map_err(|e| AppError::internal(format!("read {file_url}: {e}")))?;
            Ok(bytes.to_vec())
        }
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = sha2::Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// 浏览命令市场：拉 registry + 与本地卡片库比对安装状态。
#[tauri::command]
pub async fn command_market_list() -> AppResult<CommandMarketListing> {
    let Some(source) = market_source()? else {
        return Ok(CommandMarketListing {
            source: None,
            updated_at: None,
            commands: Vec::new(),
        });
    };

    let bytes = fetch_registry_bytes(&source).await?;
    let doc: MarketRegistry = serde_json::from_slice(&bytes)
        .map_err(|e| AppError::invalid_input(format!("market registry JSON invalid: {e}")))?;
    validate_registry(&doc)?;

    let installed: BTreeMap<String, String> = storage::load_cards()?
        .into_iter()
        .filter_map(|card| card.market.map(|m| (card.id, m.version)))
        .collect();

    let commands = doc
        .commands
        .iter()
        .map(|entry| {
            let installed_version = installed.get(&entry.id);
            let installed = installed_version.is_some_and(|v| version_at_least(v, &entry.version));
            let upgradable =
                installed_version.is_some_and(|v| !version_at_least(&entry.version, v));
            MarketCommandDto {
                id: entry.id.clone(),
                version: entry.version.clone(),
                title: entry.title.clone(),
                description: entry.description.clone(),
                kind: entry.kind,
                installed,
                upgradable,
            }
        })
        .collect();

    Ok(CommandMarketListing {
        source: Some(match &source {
            MarketSource::Url(url) => url.clone(),
            MarketSource::Dir(dir) => dir.display().to_string(),
        }),
        updated_at: doc.updated_at,
        commands,
    })
}

/// 安装命令（spec：sha256 校验 → 解析绑定 → 版本单调 → 落位）。
#[tauri::command]
pub async fn command_market_install(command_id: String) -> AppResult<()> {
    if !super::types::is_valid_command_id(&command_id) {
        return Err(AppError::invalid_input(format!(
            "invalid command id `{command_id}`"
        )));
    }
    let Some(source) = market_source()? else {
        return Err(AppError::internal(
            "command market source is not configured (set BENCH_COMMAND_MARKET_URL or BENCH_COMMAND_MARKET_DIR)",
        ));
    };

    let bytes = fetch_registry_bytes(&source).await?;
    let doc: MarketRegistry = serde_json::from_slice(&bytes)
        .map_err(|e| AppError::invalid_input(format!("market registry JSON invalid: {e}")))?;
    validate_registry(&doc)?;
    let entry = doc
        .commands
        .iter()
        .find(|c| c.id == command_id)
        .ok_or_else(|| AppError::not_found(format!("command `{command_id}` not found in market")))?
        .clone();

    let file_bytes = fetch_command_bytes(&source, &entry.file).await?;
    if file_bytes.len() as u64 != entry.size {
        return Err(AppError::invalid_input(format!(
            "command file size mismatch (registry {}, got {})",
            entry.size,
            file_bytes.len()
        )));
    }
    if sha256_hex(&file_bytes) != entry.sha256 {
        return Err(AppError::forbidden_path(
            "command file sha256 mismatch (corrupted or tampered)",
        ));
    }
    let doc: MarketCommandDoc = serde_json::from_slice(&file_bytes)
        .map_err(|e| AppError::invalid_input(format!("command file JSON invalid: {e}")))?;
    if doc.schema_version != MARKET_SCHEMA_VERSION {
        return Err(AppError::unsupported(format!(
            "command file schema_version {} not supported",
            doc.schema_version
        )));
    }
    if doc.id != command_id {
        return Err(AppError::forbidden_path(format!(
            "command file id `{}` does not match requested `{command_id}`",
            doc.id
        )));
    }
    if doc.version != entry.version {
        return Err(AppError::forbidden_path(format!(
            "command file version `{}` does not match registry `{}`",
            doc.version, entry.version
        )));
    }
    if doc.title.trim().is_empty() || doc.command.trim().is_empty() {
        return Err(AppError::invalid_input(
            "command file title and command must be non-empty",
        ));
    }

    // 版本单调：本地同 id 卡片 market 版本 ≥ 新版本 → 拒绝降级。
    let existing = storage::load_cards()?;
    if let Some(card) = existing.iter().find(|c| c.id == command_id) {
        if let Some(provenance) = &card.market {
            if version_at_least(&provenance.version, &doc.version) {
                return Err(AppError::invalid_input(format!(
                    "installed command version {} is not older than {} (downgrade rejected)",
                    provenance.version, doc.version
                )));
            }
        } else {
            return Err(AppError::invalid_input(format!(
                "a local command card with id `{command_id}` already exists (rename it before installing)"
            )));
        }
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let card = CommandCard {
        id: doc.id.clone(),
        title: doc.title.clone(),
        description: doc.description.clone(),
        kind: doc.kind,
        command: doc.command.clone(),
        icon: doc.icon.clone(),
        created_at: now,
        updated_at: now,
        market: Some(MarketProvenance {
            version: doc.version.clone(),
            installed_at: now,
        }),
    };

    // 落位：upsert 语义（已装 market 卡 → 覆盖升级；否则追加）。
    let mut cards = existing;
    match cards.iter_mut().find(|c| c.id == command_id) {
        Some(slot) => *slot = card,
        None => cards.push(card),
    }
    storage::save_cards(&cards)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const REGISTRY_JSON: &str = r#"{
        "schemaVersion": 1,
        "updatedAt": "2026-09-08T00:00:00Z",
        "commands": [
            {
                "id": "clear-browser-history",
                "version": "1.0.0",
                "title": "清除浏览记录",
                "description": "demo",
                "kind": "shell",
                "file": "commands/clear-browser-history.json",
                "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
                "size": 233
            }
        ]
    }"#;

    #[test]
    fn parses_and_validates_registry() {
        let doc: MarketRegistry = serde_json::from_str(REGISTRY_JSON).expect("parse");
        validate_registry(&doc).expect("valid");
        assert_eq!(doc.commands[0].id, "clear-browser-history");
    }

    #[test]
    fn rejects_unsupported_schema_or_bad_file() {
        let bad_schema = REGISTRY_JSON.replace("\"schemaVersion\": 1,", "\"schemaVersion\": 2,");
        let doc: MarketRegistry = serde_json::from_str(&bad_schema).expect("parse");
        assert_eq!(validate_registry(&doc).unwrap_err().code, "UNSUPPORTED");

        let bad_file =
            REGISTRY_JSON.replace("commands/clear-browser-history.json", "../../etc/passwd");
        let doc: MarketRegistry = serde_json::from_str(&bad_file).expect("parse");
        assert_eq!(validate_registry(&doc).unwrap_err().code, "INVALID_INPUT");
    }

    #[test]
    fn version_monotonic_semantics() {
        assert!(version_at_least("1.0.0", "1.0.0"));
        assert!(version_at_least("1.1.0", "1.0.9"));
        assert!(!version_at_least("0.9.9", "1.0.0"));
        assert!(!version_at_least("1.2.0", "1.10.0"));
    }

    #[test]
    fn market_source_from_env() {
        // 纯函数路径：URL 必须 https；两者均未配置由 env 决定（集成验证见 list 空态）。
        std::env::set_var(
            REGISTRY_URL_ENV,
            "http://insecure.example.com/registry.json",
        );
        assert!(matches!(market_source(), Err(_)));
        std::env::remove_var(REGISTRY_URL_ENV);
        std::env::set_var(REGISTRY_DIR_ENV, "/tmp/cmd-market");
        assert!(matches!(market_source(), Ok(Some(MarketSource::Dir(_)))));
        std::env::remove_var(REGISTRY_DIR_ENV);
        // P5：两个 env 均未设置 → 官方默认源（零配置市场）。
        assert!(matches!(
            market_source(),
            Ok(Some(MarketSource::Url(url))) if url == OFFICIAL_COMMAND_MARKET_URL
        ));
    }
}
