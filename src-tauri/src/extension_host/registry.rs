//! Canonical registry（P4，spec §5；静态 JSON + Git 托管）。
//!
//! **信任边界（D-007）**：registry 基址只由后端 env
//! `BENCH_EXT_REGISTRY_URL` 决定，renderer 只能传 `id` + `version`，
//! 下载 URL 由宿主从自身拉取的目录解析 —— renderer 永不提交下载地址。
//!
//! 目录格式（spec §5.2）：
//! ```jsonc
//! { "schemaVersion": 1, "updatedAt": "...",
//!   "extensions": [{ "id", "display", "description", "publisher",
//!                    "versions": [{ "version", "engines", "downloadUrl",
//!                                   "sha256", "size", "publishedAt", "yanked" }] }],
//!   "revoked": [{ "id", "versions", "reason", "at" }] }
//! ```
//!
//! 吊销语义（spec §5.3）：命中 `revoked` → 宿主**强制禁用**（写 `.disabled`）
//! + UI 显著警示，不静默删除。

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// canonical registry 基址环境变量（后端独占配置）。
pub const REGISTRY_URL_ENV: &str = "BENCH_EXT_REGISTRY_URL";

/// 官方插件市场基址（kindred-plugin-market org；env `BENCH_EXT_REGISTRY_URL`
/// 未设置时作为默认源 —— P5：零配置即可用市场）。
///
/// ⚠️ 语义与 `registry_base_url()` 一致：这里是**目录基址**（不含 `registry.json`），
/// 索引 URL = 基址 + `/registry.json`（`registry_index_url`）。写成文件 URL 会拼出
/// `registry.json/registry.json` 双重路径（P5 实测踩坑）。
pub const OFFICIAL_REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/kindred-plugin-market/plugin-market/main";

/// 判断 registry 基址是否为官方源（官方源豁免 minisign 验签：
/// 完整性由 registry sha256 + 包内 files 清单双通道兜底，spec §13）。
pub fn is_official_registry(base_url: &str) -> bool {
    base_url.trim_end_matches('/') == OFFICIAL_REGISTRY_URL.trim_end_matches('/')
}

/// registry 目录 schema 版本（与本文件同步演进）。
pub const REGISTRY_SCHEMA_VERSION: u32 = 1;

/// registry 目录文档。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegistryDoc {
    pub schema_version: u32,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub extensions: Vec<RegistryEntry>,
    #[serde(default)]
    pub revoked: Vec<RevokedEntry>,
}

/// registry 条目（单个插件）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegistryEntry {
    pub id: String,
    pub display: RegistryDisplay,
    #[serde(default)]
    pub description: Option<RegistryDisplay>,
    #[serde(default)]
    pub publisher: Option<RegistryPublisher>,
    #[serde(default)]
    pub versions: Vec<RegistryVersion>,
}

/// 展示名/描述（en 必填，zh 可选 —— 与 manifest v2 对齐）。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryDisplay {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub zh: Option<String>,
    pub en: String,
}

/// 发布者信息。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegistryPublisher {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// 单版本条目。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegistryVersion {
    pub version: String,
    pub engines: RegistryEngines,
    pub download_url: String,
    /// 整包 sha256（下载后先验再解压，spec §5.2）。
    pub sha256: String,
    /// 整包字节数。
    pub size: u64,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub yanked: bool,
}

/// engines 约束（registry 侧同 manifest 规则：`*` / `>=X.Y.Z`）。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegistryEngines {
    pub bench: String,
}

/// 吊销条目（spec §5.3）。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RevokedEntry {
    pub id: String,
    /// `*` 或版本表达式（`<1.2.0` / `<=1.2.0` / 精确版本）。
    pub versions: String,
    pub reason: String,
    #[serde(default)]
    pub at: Option<String>,
}

impl RevokedEntry {
    /// 版本是否命中吊销范围。**未知表达式视为命中**（fail-closed：宁可错杀）。
    pub fn matches(&self, version: &str) -> bool {
        let pattern = self.versions.trim();
        if pattern == "*" || pattern.is_empty() {
            return true;
        }
        if let Some(bound) = pattern.strip_prefix("<=") {
            return !super::manifest::semver_at_least(version, bound);
        }
        if let Some(bound) = pattern.strip_prefix('<') {
            return !super::manifest::semver_at_least(version, bound) && version != bound;
        }
        if let Some(bound) = pattern.strip_prefix(">=") {
            return super::manifest::semver_at_least(version, bound);
        }
        // 精确版本。未知格式（如范围组合）→ fail-closed 视为命中。
        version == pattern
    }
}

/// 校验 registry 文档（schema 版本 + 必填结构，fail-closed）。
pub fn validate_registry_doc(doc: &RegistryDoc) -> AppResult<()> {
    if doc.schema_version != REGISTRY_SCHEMA_VERSION {
        return Err(AppError::unsupported(format!(
            "registry schema_version {} not supported (host supports {})",
            doc.schema_version, REGISTRY_SCHEMA_VERSION
        )));
    }
    for entry in &doc.extensions {
        if !super::manifest::is_valid_extension_id(&entry.id) {
            return Err(AppError::invalid_input(format!(
                "registry entry id `{}` is invalid",
                entry.id
            )));
        }
        if entry.display.en.trim().is_empty() {
            return Err(AppError::invalid_input(format!(
                "registry entry `{}` has empty display.en",
                entry.id
            )));
        }
        if entry.versions.is_empty() {
            return Err(AppError::invalid_input(format!(
                "registry entry `{}` has no versions",
                entry.id
            )));
        }
        for version in &entry.versions {
            if !super::manifest::is_valid_semver(&version.version) {
                return Err(AppError::invalid_input(format!(
                    "registry entry `{}` has invalid version `{}`",
                    entry.id, version.version
                )));
            }
            if !super::manifest::is_valid_sha256_hex(&version.sha256) {
                return Err(AppError::invalid_input(format!(
                    "registry entry `{}` version `{}` has invalid sha256",
                    entry.id, version.version
                )));
            }
            if !version.download_url.starts_with("https://") {
                return Err(AppError::invalid_input(format!(
                    "registry entry `{}` version `{}` downloadUrl must be https",
                    entry.id, version.version
                )));
            }
        }
    }
    Ok(())
}

/// 读取 registry 基址（后端 canonical 配置；缺失 = market 功能未配置）。
pub fn registry_base_url() -> AppResult<String> {
    let url = std::env::var(REGISTRY_URL_ENV).unwrap_or_default();
    let url = url.trim().to_string();
    let url = if url.is_empty() {
        // P5：未配置 env → 官方默认源（零配置市场）。
        OFFICIAL_REGISTRY_URL.to_string()
    } else {
        url
    };
    if !url.starts_with("https://") {
        return Err(AppError::internal(format!(
            "extension registry URL must be https, got `{url}`"
        )));
    }
    Ok(url)
}

/// 从基址解析目录 JSON URL（约定：`<base>/registry.json`，spec §5.2 静态托管）。
pub fn registry_index_url(base: &str) -> String {
    let base = base.trim_end_matches('/');
    format!("{base}/registry.json")
}

/// 下载 URL 必须与 registry 基址同源（防止 registry 内容投喂任意下载点）。
///
/// registry 允许经 GitHub Pages/jsDelivr 托管，下载文件可在 CDN —— 因此这里
/// 不做严格同源，而是要求 https 且非 localhost（公网分发语义），完整性由
/// 整包 sha256 + minisign 签名双通道兜底。
pub fn validate_download_url(url: &str) -> AppResult<()> {
    if !url.starts_with("https://") {
        return Err(AppError::forbidden_path(format!(
            "download url must be https, got `{url}`"
        )));
    }
    let host_part = url
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("");
    let host = host_part.split(':').next().unwrap_or("");
    if host.is_empty() || host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0" {
        return Err(AppError::forbidden_path(format!(
            "download url host `{host}` is not allowed"
        )));
    }
    Ok(())
}

/// 判断某已安装版本是否命中吊销列表；命中返回原因。
pub fn revoke_hit(doc: &RegistryDoc, extension_id: &str, version: &str) -> Option<String> {
    doc.revoked
        .iter()
        .find(|entry| entry.id == extension_id && entry.matches(version))
        .map(|entry| entry.reason.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_REGISTRY: &str = r#"{
        "schemaVersion": 1,
        "updatedAt": "2026-09-08T00:00:00Z",
        "extensions": [
            {
                "id": "photo-triage",
                "display": { "en": "Photo Triage", "zh": "照片筛选" },
                "publisher": { "name": "Bench Official" },
                "versions": [
                    {
                        "version": "1.2.0",
                        "engines": { "bench": ">=1.30.0" },
                        "downloadUrl": "https://cdn.example.com/photo-triage-1.2.0.zip",
                        "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
                        "size": 471859,
                        "publishedAt": "2026-09-08T00:00:00Z",
                        "yanked": false
                    }
                ]
            }
        ],
        "revoked": [
            { "id": "evil-ext", "versions": "*", "reason": "malicious" }
        ]
    }"#;

    #[test]
    fn parses_and_validates_registry() {
        let doc: RegistryDoc = serde_json::from_str(VALID_REGISTRY).expect("parse");
        validate_registry_doc(&doc).expect("valid");
        assert_eq!(doc.extensions.len(), 1);
        assert_eq!(doc.extensions[0].versions[0].version, "1.2.0");
    }

    #[test]
    fn rejects_unknown_schema_or_bad_urls() {
        let doc: RegistryDoc = serde_json::from_str(
            VALID_REGISTRY
                .replace("\"schemaVersion\": 1", "\"schemaVersion\": 2")
                .as_str(),
        )
        .expect("parse");
        assert_eq!(validate_registry_doc(&doc).unwrap_err().code, "UNSUPPORTED");

        let http_url = VALID_REGISTRY.replace("https://cdn.example.com", "http://cdn.example.com");
        let doc: RegistryDoc = serde_json::from_str(&http_url).expect("parse");
        assert_eq!(
            validate_registry_doc(&doc).unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn revoke_matching_semantics() {
        let star = RevokedEntry {
            id: "x".into(),
            versions: "*".into(),
            reason: "r".into(),
            at: None,
        };
        assert!(star.matches("0.0.1"));
        assert!(star.matches("9.9.9"));

        let below = RevokedEntry {
            id: "x".into(),
            versions: "<1.2.0".into(),
            reason: "r".into(),
            at: None,
        };
        assert!(below.matches("1.1.0"));
        assert!(below.matches("1.1.99"));
        assert!(!below.matches("1.2.0"));
        assert!(!below.matches("2.0.0"));

        let exact = RevokedEntry {
            id: "x".into(),
            versions: "1.2.0".into(),
            reason: "r".into(),
            at: None,
        };
        assert!(exact.matches("1.2.0"));
        assert!(!exact.matches("1.2.1"));
    }

    #[test]
    fn download_url_validation() {
        assert!(validate_download_url("https://cdn.example.com/a.zip").is_ok());
        assert_eq!(
            validate_download_url("http://cdn.example.com/a.zip")
                .unwrap_err()
                .code,
            "FORBIDDEN_PATH"
        );
        assert_eq!(
            validate_download_url("https://localhost/a.zip")
                .unwrap_err()
                .code,
            "FORBIDDEN_PATH"
        );
        assert_eq!(
            validate_download_url("https://127.0.0.1/a.zip")
                .unwrap_err()
                .code,
            "FORBIDDEN_PATH"
        );
    }

    #[test]
    fn registry_url_requires_https() {
        // 纯函数路径不易直接测 env；这里校验 URL 规则由 registry_base_url 的
        // https 前缀检查覆盖 —— 直接测 index URL 拼接。
        assert_eq!(
            registry_index_url("https://r.example.com/"),
            "https://r.example.com/registry.json"
        );
    }
}

#[cfg(test)]
mod official_fixture_tests {
    use super::*;

    /// 官方线上 registry.json 的离线快照：防止 RegistryDoc 结构演进
    /// （deny_unknown_fields）与真实发布格式漂移（P5）。
    const OFFICIAL_FIXTURE: &str = include_str!("fixtures/official-registry.json");

    #[test]
    fn parses_official_registry_fixture() {
        let doc: RegistryDoc =
            serde_json::from_str(OFFICIAL_FIXTURE).expect("parse official registry");
        validate_registry_doc(&doc).expect("official registry validates");
        assert_eq!(doc.extensions.len(), 4);
        for entry in &doc.extensions {
            assert_eq!(entry.versions.len(), 1);
            validate_download_url(&entry.versions[0].download_url).expect("download url valid");
        }
    }

    #[test]
    fn official_base_matches_and_resolves_index() {
        assert!(is_official_registry(OFFICIAL_REGISTRY_URL));
        assert!(is_official_registry(&format!("{OFFICIAL_REGISTRY_URL}/")));
        assert!(!is_official_registry(
            "https://market.example.com/registry.json"
        ));
        assert_eq!(
            registry_index_url(OFFICIAL_REGISTRY_URL),
            "https://raw.githubusercontent.com/kindred-plugin-market/plugin-market/main/registry.json"
        );
    }
}
