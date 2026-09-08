//! Extension manifest —— P3.1 schema v2（D-024，契约见 docs/extension-spec.md §3）。
//!
//! 每个插件在产物根目录携带 `manifest.json`。宿主在**列举 / 打开 / 启用**前
//! 解析并校验，fail-closed：
//!
//! - schema 版本不匹配 → 拒绝；
//! - `files`：逐文件完整性清单（必填，非空、无重复、路径安全、sha256 格式合法）；
//!   `manifest.json` 自身与宿主维护的 `.disabled` **不得**入列（前者文件哈希
//!   无法自嵌套，完整性由 canonical 文本签名覆盖，见 [signature]）；
//! - `display.zh` 可选（P3.1 起回退 `en`，降低第三方作者门槛）；
//! - `expiresAt` 可选（market 推荐）：过期元数据拒绝（防 freeze attack）；
//! - `acl.commands` 必须是 [acl] 注册表子集；
//! - `engines.bench` 合法性 + 宿主兼容门控。

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

use super::acl;
use super::assets::is_safe_relative_path;

/// 当前支持的 manifest schema 版本。未来版本一律 fail-closed 拒绝。
///
/// v1 → v2（P3.1）：`files` 由无变必填；`display.zh` 由必变选；`expiresAt` 新增。
pub const MANIFEST_SCHEMA_VERSION: u32 = 2;

/// manifest 文件名（插件产物根目录）。
pub const MANIFEST_FILE: &str = "manifest.json";

/// 禁用标记文件名（宿主维护，置于插件产物目录内；存在即表示已禁用）。
pub const EXT_DISABLED_MARKER: &str = ".disabled";

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
    /// 展示名（en 必填；zh 可选，缺失回退 en）。
    pub display: ExtensionDisplay,
    /// 分发形态：bundled（随主包捆绑）/ market（registry 下载）。
    pub distribution: ExtensionDistribution,
    /// 入口（相对产物根目录）。
    pub entry: ExtensionEntry,
    /// 逐文件完整性清单（P3.1 起必填，规则见 [`ExtensionFileEntry`] 与 spec §3.3）。
    pub files: Vec<ExtensionFileEntry>,
    /// 申请的宿主命令 ACL（必须是 [acl] 注册表的子集）。
    pub acl: ExtensionAcl,
    /// 宿主兼容矩阵。
    pub engines: ExtensionEngines,
    /// 过期时间（ISO 8601 / RFC 3339，如 `2027-09-08T00:00:00Z`）。
    ///
    /// market 推荐填写：宿主拒绝过期元数据（防 freeze attack）。bundled 不填。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    /// 可用平台声明（P5；spec §3.1）。每项 `macos` | `windows`；
    /// **缺省 = 全平台**，空数组非法。宿主在已装列表中过滤不含当前平台的插件。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub platforms: Option<Vec<String>>,
    /// minisign 签名（对「去掉 `signature` 字段后的 canonical JSON」的签名，
    /// 见 [signature]；`market` 强制校验，`bundled` 豁免）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

/// 宿主平台标识（`ext_list_installed` 过滤用）。
pub fn host_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

impl ExtensionManifest {
    /// 当前宿主平台是否在声明范围内（缺省 = 全平台）。
    pub fn supports_host_platform(&self) -> bool {
        match &self.platforms {
            None => true,
            Some(list) => list.iter().any(|p| p == super::manifest::host_platform()),
        }
    }
}

/// 展示名。`zh` 自 P3.1 起可选（缺失回退 `en`）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionDisplay {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub zh: Option<String>,
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

/// 逐文件完整性条目（spec §3.3）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtensionFileEntry {
    /// 相对产物根的路径（`/` 分隔；不含 `..`、不以 `/` 开头）。
    pub path: String,
    /// 文件内容 SHA256，小写十六进制 64 字符。
    pub sha256: String,
    /// 文件字节数（解压后）。
    pub size: u64,
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
    /// 例如 `">=2.0.0"`（P3 起参与加载门控）。
    pub bench: String,
}

impl ExtensionManifest {
    /// 从 JSON 文本解析并完整校验（含 `expiresAt` 过期检查）。
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
        if self.display.en.trim().is_empty() {
            return Err(AppError::invalid_input("display.en must not be empty"));
        }
        if let Some(zh) = &self.display.zh {
            if zh.trim().is_empty() {
                return Err(AppError::invalid_input(
                    "display.zh must not be empty when present",
                ));
            }
        }
        self.entry.validate()?;
        self.validate_files()?;
        self.acl.validate()?;
        self.validate_engines()?;
        self.validate_expires_at()?;
        self.validate_platforms()?;
        Ok(())
    }

    /// `platforms` 规则（P5，spec §3.1）：每项为已知平台名，且不得为空数组
    /// （空数组 = 哪里都不可用，视为配置错误 fail-closed）。
    fn validate_platforms(&self) -> AppResult<()> {
        let Some(platforms) = &self.platforms else {
            return Ok(());
        };
        if platforms.is_empty() {
            return Err(AppError::invalid_input(
                "manifest.platforms must not be empty (omit the field for all platforms)",
            ));
        }
        for platform in platforms {
            if !matches!(platform.as_str(), "macos" | "windows" | "linux") {
                return Err(AppError::invalid_input(format!(
                    "manifest.platforms contains unknown platform `{platform}` (expected macos | windows | linux)"
                )));
            }
        }
        Ok(())
    }

    /// 展示名（zh 缺失时回退 en）。
    pub fn display_name(&self, lang: &str) -> &str {
        if lang == "zh" {
            self.display.zh.as_deref().unwrap_or(&self.display.en)
        } else {
            &self.display.en
        }
    }

    /// `files` 清单规则（spec §3.3）：非空、无重复、路径合法、sha256 格式合法。
    fn validate_files(&self) -> AppResult<()> {
        if self.files.is_empty() {
            return Err(AppError::invalid_input(
                "manifest.files must not be empty (per-file integrity list is required)",
            ));
        }
        let mut seen = std::collections::BTreeSet::new();
        for file in &self.files {
            if !seen.insert(file.path.as_str()) {
                return Err(AppError::invalid_input(format!(
                    "manifest.files contains duplicate path `{}`",
                    file.path
                )));
            }
            if !is_safe_relative_path(&file.path) {
                return Err(AppError::forbidden_path(format!(
                    "manifest.files path `{}` must be a safe relative path inside the bundle",
                    file.path
                )));
            }
            if file.path.ends_with('/') {
                return Err(AppError::invalid_input(format!(
                    "manifest.files path `{}` must not end with `/`",
                    file.path
                )));
            }
            // manifest.json 无法把自己的哈希写进自己（fixpoint 不存在），
            // 其完整性由 canonical 文本签名覆盖；.disabled 由宿主维护。
            if file.path == MANIFEST_FILE || file.path == EXT_DISABLED_MARKER {
                return Err(AppError::invalid_input(format!(
                    "manifest.files must not list `{}`",
                    file.path
                )));
            }
            if !is_valid_sha256_hex(&file.sha256) {
                return Err(AppError::invalid_input(format!(
                    "manifest.files entry `{}` has invalid sha256 (expected 64 lowercase hex chars)",
                    file.path
                )));
            }
        }
        Ok(())
    }

    /// `expiresAt`：存在时必须是合法 RFC 3339 且未过期（fail-closed）。
    fn validate_expires_at(&self) -> AppResult<()> {
        let Some(text) = &self.expires_at else {
            return Ok(());
        };
        let parsed = chrono::DateTime::parse_from_rfc3339(text).map_err(|_| {
            AppError::invalid_input(format!(
                "manifest.expiresAt `{text}` is not a valid RFC 3339 timestamp"
            ))
        })?;
        if parsed < chrono::Utc::now() {
            return Err(AppError::invalid_input(format!(
                "manifest.expiresAt `{text}` has expired (metadata freshness check failed)"
            )));
        }
        Ok(())
    }

    /// 宿主版本是否满足 `engines.bench` 约束。
    ///
    /// 支持 `*` 与 `>=X.Y.Z`（其余前缀视为非法，fail-closed）。
    pub fn satisfies_engines(&self, host_version: &str) -> bool {
        let constraint = self.engines.bench.trim();
        if constraint == "*" || constraint.is_empty() {
            return true;
        }
        let Some(minimum) = constraint.strip_prefix(">=") else {
            return false;
        };
        is_valid_semver(minimum) && semver_at_least(host_version, minimum)
    }

    fn validate_engines(&self) -> AppResult<()> {
        let constraint = self.engines.bench.trim();
        if constraint == "*" || constraint.is_empty() {
            return Ok(());
        }
        if !constraint.starts_with(">=") || !is_valid_semver(&constraint[2..]) {
            return Err(AppError::invalid_input(format!(
                "engines.bench `{}` must be `*` or `>=X.Y.Z`",
                self.engines.bench
            )));
        }
        Ok(())
    }
}

/// 简化 semver 比较：`host >= minimum`（逐段数值比较，段数不足按 0 补齐）。
pub(crate) fn semver_at_least(host: &str, minimum: &str) -> bool {
    let parse = |text: &str| -> Vec<u64> {
        text.split('.')
            .map(|part| part.parse::<u64>().unwrap_or(0))
            .collect()
    };
    let mut host_parts = parse(host);
    let min_parts = parse(minimum);
    while host_parts.len() < min_parts.len() {
        host_parts.push(0);
    }
    for (index, min) in min_parts.iter().enumerate() {
        match host_parts[index].cmp(min) {
            std::cmp::Ordering::Less => return false,
            std::cmp::Ordering::Greater => return true,
            std::cmp::Ordering::Equal => continue,
        }
    }
    true
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

/// SHA256 十六进制串：64 字符、小写。
pub(crate) fn is_valid_sha256_hex(text: &str) -> bool {
    text.len() == 64
        && text
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_MANIFEST: &str = r#"{
        "schemaVersion": 2,
        "id": "photo-triage",
        "version": "1.0.0",
        "display": { "zh": "照片筛选", "en": "Photo Triage" },
        "distribution": "bundled",
        "entry": { "index": "index.html" },
        "files": [
            { "path": "index.html", "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "size": 512 },
            { "path": "assets/index-a1b2c3.js", "sha256": "2c624232cdd221771e2835f7b7c8f4e0fcbf5e7eb3f6b7c3ac4d5e6f708192a3", "size": 469123 }
        ],
        "acl": { "commands": ["photo_triage_scan", "photo_triage_trash"] },
        "engines": { "bench": ">=2.0.0" }
    }"#;

    #[test]
    fn parses_valid_manifest() {
        let m = ExtensionManifest::parse(VALID_MANIFEST).expect("should parse");
        assert_eq!(m.id, "photo-triage");
        assert_eq!(m.distribution, ExtensionDistribution::Bundled);
        assert_eq!(m.acl.commands.len(), 2);
        assert_eq!(m.files.len(), 2);
        assert!(m.expires_at.is_none());
        assert!(m.signature.is_none());
    }

    #[test]
    fn rejects_v1_schema() {
        let text = VALID_MANIFEST.replace("\"schemaVersion\": 2", "\"schemaVersion\": 1");
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
    fn rejects_empty_files() {
        let text = VALID_MANIFEST.replace(
            r#""files": [
            { "path": "index.html", "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "size": 512 },
            { "path": "assets/index-a1b2c3.js", "sha256": "2c624232cdd221771e2835f7b7c8f4e0fcbf5e7eb3f6b7c3ac4d5e6f708192a3", "size": 469123 }
        ]"#,
            "\"files\": []",
        );
        assert_eq!(
            ExtensionManifest::parse(&text).unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn rejects_duplicate_file_paths() {
        let text = VALID_MANIFEST.replace(
            "{ \"path\": \"assets/index-a1b2c3.js\", \"sha256\": \"2c624232cdd221771e2835f7b7c8f4e0fcbf5e7eb3f6b7c3ac4d5e6f708192a3\", \"size\": 469123 }",
            "{ \"path\": \"index.html\", \"sha256\": \"2c624232cdd221771e2835f7b7c8f4e0fcbf5e7eb3f6b7c3ac4d5e6f708192a3\", \"size\": 469123 }",
        );
        let err = ExtensionManifest::parse(&text).unwrap_err();
        assert_eq!(err.code, "INVALID_INPUT");
        assert!(err.message.contains("duplicate"));
    }

    #[test]
    fn rejects_invalid_sha256_format() {
        // 大写十六进制 → 非法（规格要求小写）。
        let text = VALID_MANIFEST.replace(
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "9F86D081884C7D659A2FEAA0C55AD015A3BF4F1B2B0B822CD15D6C15B0F00A08",
        );
        assert_eq!(
            ExtensionManifest::parse(&text).unwrap_err().code,
            "INVALID_INPUT"
        );
        // 长度不足 → 非法。
        let text = VALID_MANIFEST.replace(
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "9f86d081",
        );
        assert_eq!(
            ExtensionManifest::parse(&text).unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn rejects_unsafe_files_paths() {
        for bad in [
            "/absolute/index.html",
            "assets/../../evil.js",
            "C:/windows/win.ini",
            "assets\\win-path.js",
            "manifest.json",
            ".disabled",
            "assets/",
        ] {
            let text = VALID_MANIFEST.replace("assets/index-a1b2c3.js", bad);
            let err = ExtensionManifest::parse(&text).unwrap_err();
            assert!(
                err.code == "FORBIDDEN_PATH" || err.code == "INVALID_INPUT",
                "path `{bad}` should be rejected, got {} ({})",
                err.code,
                err.message
            );
        }
    }

    #[test]
    fn display_zh_is_optional_and_falls_back_to_en() {
        let text = VALID_MANIFEST.replace(
            "\"display\": { \"zh\": \"照片筛选\", \"en\": \"Photo Triage\" }",
            "\"display\": { \"en\": \"Photo Triage\" }",
        );
        let m = ExtensionManifest::parse(&text).expect("zh optional");
        assert_eq!(m.display_name("zh"), "Photo Triage");
        assert_eq!(m.display_name("en"), "Photo Triage");

        let text = VALID_MANIFEST.replace(
            "\"display\": { \"zh\": \"照片筛选\", \"en\": \"Photo Triage\" }",
            "\"display\": { \"zh\": \"照片筛选\", \"en\": \"Photo Triage\" }",
        );
        let m = ExtensionManifest::parse(&text).expect("zh present");
        assert_eq!(m.display_name("zh"), "照片筛选");
    }

    #[test]
    fn rejects_empty_display_en() {
        let text = VALID_MANIFEST.replace(
            "\"display\": { \"zh\": \"照片筛选\", \"en\": \"Photo Triage\" }",
            "\"display\": { \"zh\": \"照片筛选\", \"en\": \"\" }",
        );
        assert_eq!(
            ExtensionManifest::parse(&text).unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn rejects_expired_expires_at() {
        let text = VALID_MANIFEST.replace(
            "\"engines\": { \"bench\": \">=2.0.0\" }",
            "\"engines\": { \"bench\": \">=2.0.0\" }, \"expiresAt\": \"2020-01-01T00:00:00Z\"",
        );
        let err = ExtensionManifest::parse(&text).unwrap_err();
        assert_eq!(err.code, "INVALID_INPUT");
        assert!(err.message.contains("expired"));
    }

    #[test]
    fn rejects_malformed_expires_at() {
        let text = VALID_MANIFEST.replace(
            "\"engines\": { \"bench\": \">=2.0.0\" }",
            "\"engines\": { \"bench\": \">=2.0.0\" }, \"expiresAt\": \"not-a-date\"",
        );
        assert_eq!(
            ExtensionManifest::parse(&text).unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn accepts_future_expires_at() {
        let text = VALID_MANIFEST.replace(
            "\"engines\": { \"bench\": \">=2.0.0\" }",
            "\"engines\": { \"bench\": \">=2.0.0\" }, \"expiresAt\": \"2099-01-01T00:00:00Z\"",
        );
        let m = ExtensionManifest::parse(&text).expect("future expiry accepted");
        assert_eq!(m.expires_at.as_deref(), Some("2099-01-01T00:00:00Z"));
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

    #[test]
    fn sha256_hex_validator() {
        assert!(is_valid_sha256_hex(
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
        ));
        assert!(!is_valid_sha256_hex("9F86D081")); // 大写
        assert!(!is_valid_sha256_hex("abc")); // 太短
        assert!(!is_valid_sha256_hex(
            "zz86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
        ));
    }

    #[test]
    fn engines_gate() {
        let make = |bench: &str| -> ExtensionManifest {
            ExtensionManifest::parse(
                &VALID_MANIFEST.replace("\">=2.0.0\"", &format!("\"{bench}\"")),
            )
            .expect("valid manifest")
        };
        // 宿主 1.30.0
        assert!(make("*").satisfies_engines("1.30.0"));
        assert!(make(">=1.30.0").satisfies_engines("1.30.0"));
        assert!(make(">=1.29.0").satisfies_engines("1.30.0"));
        assert!(!make(">=2.0.0").satisfies_engines("1.30.0"));
        // 非法约束（`>` 前缀 / 纯版本号）在 parse 阶段即被拒绝（见 engines_constraint_validation）。
    }

    #[test]
    fn engines_constraint_validation() {
        let bad = VALID_MANIFEST.replace("\">=2.0.0\"", "\">1.0.0\"");
        assert_eq!(
            ExtensionManifest::parse(&bad).unwrap_err().code,
            "INVALID_INPUT"
        );
    }
}

#[cfg(test)]
mod platform_tests {
    use super::*;

    #[test]
    fn platforms_missing_means_all() {
        let manifest = manifest_with_platforms(None).expect("parse");
        assert!(manifest.supports_host_platform());
    }

    #[test]
    fn platforms_filter_matches_host() {
        let macos_only = manifest_with_platforms(Some(vec!["macos".into()])).expect("parse");
        assert_eq!(
            macos_only.supports_host_platform(),
            host_platform() == "macos"
        );
    }

    #[test]
    fn platforms_empty_is_invalid() {
        let manifest = manifest_with_platforms(Some(vec![]));
        assert_eq!(manifest.unwrap_err().code, "INVALID_INPUT");
    }

    #[test]
    fn platforms_unknown_value_is_invalid() {
        let manifest = manifest_with_platforms(Some(vec!["android".into()]));
        assert_eq!(manifest.unwrap_err().code, "INVALID_INPUT");
    }

    fn manifest_with_platforms(platforms: Option<Vec<String>>) -> AppResult<ExtensionManifest> {
        let mut json = r#"{
            "schemaVersion": 2,
            "id": "platform-probe",
            "version": "1.0.0",
            "display": { "en": "Probe" },
            "distribution": "bundled",
            "entry": { "index": "index.html" },
            "files": [{ "path": "index.html", "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "size": 4 }],
            "acl": { "commands": [] },
            "engines": { "bench": "*" }
        }"#.to_string();
        if let Some(list) = platforms {
            let items: Vec<String> = list.iter().map(|p| format!("\"{p}\"")).collect();
            json = json.replace(
                "\"engines\"",
                &format!("\"platforms\": [{}], \"engines\"", items.join(", ")),
            );
        }
        ExtensionManifest::parse(&json)
    }
}
