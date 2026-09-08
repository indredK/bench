//! Extension manifest —— P2 schema v1 定稿（D-024）。
//!
//! 每个插件在产物根目录携带 `manifest.json`。宿主在**列举 / 打开 / 启用**前
//! 解析并校验：schema 版本不匹配（fail-closed）、id/version/entry 格式、
//! ACL 声明必须是 [acl] 注册表子集。
//!
//! 字段与 D-024 对应：
//! - `distribution`: `bundled`（随主包捆绑）/ `market`（registry 下载 + minisign）；
//! - `acl.commands`: 插件申请的自定命令子集（宿主在网关处按窗口 deny-by-default）；
//! - `engines.bench`: 宿主兼容矩阵（P3 起参与加载门控）。

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

use super::acl;

/// 当前支持的 manifest schema 版本。未来版本一律 fail-closed 拒绝。
pub const MANIFEST_SCHEMA_VERSION: u32 = 1;

/// manifest 文件名（插件产物根目录）。
pub const MANIFEST_FILE: &str = "manifest.json";

/// 插件清单。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtensionManifest {
    /// schema 版本，宿主只接受 [`MANIFEST_SCHEMA_VERSION`]。
    pub schema_version: u32,
    /// 插件 id：`^[a-z][a-z0-9-]*$`，同时是产物目录名与窗口 label 后缀。
    pub id: String,
    /// 插件语义化版本（X.Y.Z），与宿主版本解耦。
    pub version: String,
    /// 展示名（zh/en；后续 locale 集扩充为 map）。
    pub display: ExtensionDisplay,
    /// 分发形态：bundled（随主包捆绑）/ market（registry 下载）。
    pub distribution: ExtensionDistribution,
    /// 入口（相对产物根目录）。
    pub entry: ExtensionEntry,
    /// 申请的宿主命令 ACL（必须是 [acl] 注册表的子集）。
    pub acl: ExtensionAcl,
    /// 宿主兼容矩阵。
    pub engines: ExtensionEngines,
}

/// 展示名。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionDisplay {
    pub zh: String,
    pub en: String,
}

/// 分发形态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExtensionDistribution {
    /// 随主包构建捆绑，用户升级即获得。
    Bundled,
    /// 经 canonical registry 下载 + minisign 校验（P3 启用）。
    Market,
}

/// 入口声明。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtensionEntry {
    /// 入口 HTML，相对产物根目录，必须 `.html` 结尾且不含路径穿越。
    pub index: String,
}

/// 命令 ACL 申请。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtensionAcl {
    /// 申请调用的宿主命令（snake_case，与 contracts.ts 一致）。
    #[serde(default)]
    pub commands: Vec<String>,
}

/// 宿主兼容矩阵。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtensionEngines {
    /// 例如 `">=2.0.0"`（P3 起参与加载门控，P2 仅校验格式）。
    pub bench: String,
}

impl ExtensionManifest {
    /// 从 JSON 文本解析并完整校验。
    pub fn parse(text: &str) -> AppResult<Self> {
        let manifest: Self = serde_json::from_str(text)
            .map_err(|e| AppError::invalid_input(format!("invalid extension manifest: {e}")))?;
        manifest.validate()?;
        Ok(manifest)
    }

    /// 完整校验（fail-closed）。
    pub fn validate(&self) -> AppResult<()> {
        if self.schema_version != MANIFEST_SCHEMA_VERSION {
            return Err(AppError::unsupported(format!(
                "manifest schema_version {} not supported (host supports {})",
                self.schema_version, MANIFEST_SCHEMA_VERSION
            )));
        }
        if !is_valid_extension_id(&self.id) {
            return Err(AppError::invalid_input(format!(
                "invalid extension id `{}` (expected ^[a-z][a-z0-9-]*$)",
                self.id
            )));
        }
        if !is_valid_semver(&self.version) {
            return Err(AppError::invalid_input(format!(
                "invalid extension version `{}` (expected X.Y.Z)",
                self.version
            )));
        }
        if self.display.zh.trim().is_empty() || self.display.en.trim().is_empty() {
            return Err(AppError::invalid_input(
                "display.zh / display.en must not be empty",
            ));
        }
        self.entry.validate()?;
        self.acl.validate()?;
        Ok(())
    }
}

impl ExtensionEntry {
    fn validate(&self) -> AppResult<()> {
        if !self.index.ends_with(".html") {
            return Err(AppError::invalid_input(format!(
                "entry.index `{}` must end with .html",
                self.index
            )));
        }
        if self.index.starts_with('/') || self.index.split('/').any(|seg| seg == "..") {
            return Err(AppError::forbidden_path(format!(
                "entry.index `{}` must be a relative path inside the bundle",
                self.index
            )));
        }
        Ok(())
    }
}

impl ExtensionAcl {
    fn validate(&self) -> AppResult<()> {
        for command in &self.commands {
            if !acl::is_command_allowed(command) {
                return Err(AppError::forbidden_path(format!(
                    "acl.commands contains `{command}` which is not in the host allow-list"
                )));
            }
        }
        Ok(())
    }
}

/// 插件 id 格式：小写字母开头，仅小写字母 / 数字 / 连字符。
pub fn is_valid_extension_id(id: &str) -> bool {
    let mut chars = id.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// 简化 semver 校验：`X.Y.Z`，每段数字。
pub fn is_valid_semver(version: &str) -> bool {
    let parts: Vec<&str> = version.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_MANIFEST: &str = r#"{
        "schemaVersion": 1,
        "id": "photo-triage",
        "version": "1.0.0",
        "display": { "zh": "照片筛选", "en": "Photo Triage" },
        "distribution": "bundled",
        "entry": { "index": "index.html" },
        "acl": { "commands": ["photo_triage_scan", "photo_triage_trash"] },
        "engines": { "bench": ">=2.0.0" }
    }"#;

    #[test]
    fn parses_valid_manifest() {
        let m = ExtensionManifest::parse(VALID_MANIFEST).expect("should parse");
        assert_eq!(m.id, "photo-triage");
        assert_eq!(m.distribution, ExtensionDistribution::Bundled);
        assert_eq!(m.acl.commands.len(), 2);
    }

    #[test]
    fn rejects_unknown_schema_version() {
        let text = VALID_MANIFEST.replace("\"schemaVersion\": 1", "\"schemaVersion\": 2");
        let err = ExtensionManifest::parse(&text).unwrap_err();
        assert_eq!(err.code, "UNSUPPORTED");
    }

    #[test]
    fn rejects_invalid_id() {
        let text = VALID_MANIFEST.replace("\"photo-triage\"", "\"Photo_Triage\"");
        assert_eq!(
            ExtensionManifest::parse(&text).unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn rejects_invalid_semver() {
        let text = VALID_MANIFEST.replace("\"1.0.0\"", "\"1.0\"");
        assert_eq!(
            ExtensionManifest::parse(&text).unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn rejects_traversal_entry() {
        let text = VALID_MANIFEST.replace("\"index.html\"", "\"../evil.html\"");
        assert_eq!(
            ExtensionManifest::parse(&text).unwrap_err().code,
            "FORBIDDEN_PATH"
        );
    }

    #[test]
    fn rejects_unknown_fields() {
        let text = VALID_MANIFEST.replace(
            "\"engines\": { \"bench\": \">=2.0.0\" }",
            "\"engines\": { \"bench\": \">=2.0.0\" }, \"extra\": true",
        );
        assert_eq!(
            ExtensionManifest::parse(&text).unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn rejects_acl_outside_registry() {
        let text = VALID_MANIFEST.replace(
            "\"commands\": [\"photo_triage_scan\", \"photo_triage_trash\"]",
            "\"commands\": [\"shutdown_now\"]",
        );
        assert_eq!(
            ExtensionManifest::parse(&text).unwrap_err().code,
            "FORBIDDEN_PATH"
        );
    }

    #[test]
    fn id_validator() {
        assert!(is_valid_extension_id("photo-triage"));
        assert!(is_valid_extension_id("bench-poc"));
        assert!(!is_valid_extension_id(""));
        assert!(!is_valid_extension_id("Photo"));
        assert!(!is_valid_extension_id("1photo"));
        assert!(!is_valid_extension_id("photo_triage"));
    }

    #[test]
    fn semver_validator() {
        assert!(is_valid_semver("1.0.0"));
        assert!(is_valid_semver("2.10.30"));
        assert!(!is_valid_semver("1.0"));
        assert!(!is_valid_semver("1.0.0-beta"));
        assert!(!is_valid_semver(""));
    }
}
