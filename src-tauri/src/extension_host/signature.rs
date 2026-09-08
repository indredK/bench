//! Extension 签名校验（P3.1 重做，spec §4；D-024 分发安全模型）。
//!
//! 分发策略：
//! - `bundled`：随主包构建捆绑，**豁免**插件级签名（主包二进制本身由
//!   minisign updater 签名链覆盖）；
//! - `market`：registry 分发，**强制**校验 minisign 签名，fail-closed。
//!
//! **签名对象 = canonical 文本**（spec §4.1，不是 manifest 文件原文）：
//! 1. manifest 的 JSON 对象；
//! 2. **删除 `signature` 字段**（规避自引用循环）；
//! 3. 所有对象键按字典序升序**递归**排列；
//! 4. 紧凑 JSON（无空格、无换行）；
//! 5. UTF-8 字节流，不加 BOM / 尾随换行。
//!
//! 键排序显式递归执行：即使依赖树启用 serde_json `preserve_order`（Map 退化为
//! 插入序）也能产出逐字节确定的文本。
//!
//! **trusted comment**（spec §4.2）：固定 `<id>@<version>`。minisign 的 global
//! signature 覆盖 trusted comment，验签成功后读取是可信的；宿主校验其与
//! manifest 的 `id`/`version` 完全一致，把签名绑定到具体插件与版本。
//!
//! **公钥三态**（spec §4.3，**不做静默回退**）：
//! - release（默认）：env `BENCH_EXT_REGISTRY_PUBKEY`（minisign.pub 完整两行
//!   文本）；缺失即配置错误 —— **禁止回退 updater 公钥**（updater 私钥泄露即
//!   等同插件签发权，属密钥用途混用）；
//! - dev（`BENCH_EXT_DEV_MODE=1`）：允许本地自签/未签（UI 明示「未验证分发源」）；
//! - selfhost：用户以自签 registry 公钥设置同一 env，走正常验签
//!   （UI 标注第三方 registry）。

use minisign_verify::{PublicKey, Signature};
use serde_json::Value;

use crate::error::{AppError, AppResult};

use super::manifest::{ExtensionDistribution, ExtensionManifest};

/// registry 公钥环境变量（minisign.pub 文件完整两行文本）。
pub const REGISTRY_PUBKEY_ENV: &str = "BENCH_EXT_REGISTRY_PUBKEY";

/// 开发模式环境变量（值为 `1` 时允许本地自签/未签的 market 插件）。
pub const DEV_MODE_ENV: &str = "BENCH_EXT_DEV_MODE";

/// 构造 canonical 文本（spec §4.1）：删 `signature` → 键升序 → 紧凑 JSON。
pub fn canonical_manifest_text(raw: &str) -> AppResult<String> {
    let value: Value = serde_json::from_str(raw)
        .map_err(|e| AppError::invalid_input(format!("manifest is not valid JSON: {e}")))?;
    let mut object = match value {
        Value::Object(map) => map,
        _ => {
            return Err(AppError::invalid_input(
                "manifest JSON must be an object at top level",
            ))
        }
    };
    object.remove("signature");
    let sorted = sort_keys_recursively(Value::Object(object));
    Ok(sorted.to_string())
}

/// 递归按键升序重排对象键（不依赖 serde_json Map 的具体实现）。
fn sort_keys_recursively(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let sorted: std::collections::BTreeMap<String, Value> = map.into_iter().collect();
            Value::Object(sorted.into_iter().collect())
        }
        Value::Array(items) => Value::Array(items.into_iter().map(sort_keys_recursively).collect()),
        other => other,
    }
}

/// 开发模式是否开启（纯函数便于测试；生产入口读 [`DEV_MODE_ENV`]）。
fn dev_mode_from_env(value: Option<&str>) -> bool {
    value.map(str::trim) == Some("1")
}

fn dev_mode_enabled() -> bool {
    dev_mode_from_env(std::env::var(DEV_MODE_ENV).ok().as_deref())
}

/// 解析 registry 公钥（纯函数便于测试）。
///
/// - `None`（env 未设置）：**配置错误**，不回退 updater 公钥；
/// - `Some(text)`：必须是合法的 minisign 公钥两行文本。
fn decode_registry_pubkey(env_text: Option<&str>) -> AppResult<PublicKey> {
    let Some(text) = env_text else {
        return Err(AppError::internal(format!(
            "extension registry public key is not configured (set {REGISTRY_PUBKEY_ENV} to the \
             minisign public key); refusing to verify market extensions without a pinned key"
        )));
    };
    PublicKey::decode(text.trim())
        .map_err(|e| AppError::internal(format!("invalid {REGISTRY_PUBKEY_ENV}: {e}")))
}

/// 校验 market 插件的 manifest 签名（fail-closed）；bundled 直接豁免。
///
/// - `canonical_text`：[canonical_manifest_text] 产出的规范文本；
/// - `manifest`：已解析的 manifest（读取 signature 与 distribution）。
pub fn verify_distribution_signature(
    manifest: &ExtensionManifest,
    canonical_text: &str,
) -> AppResult<()> {
    let pubkey_env = std::env::var(REGISTRY_PUBKEY_ENV).ok();
    verify_signature_with(
        manifest,
        canonical_text,
        pubkey_env.as_deref(),
        dev_mode_enabled(),
    )
}

/// 签名校验核心（环境以参数注入，便于测试与 P4 管线复用）。
pub(crate) fn verify_signature_with(
    manifest: &ExtensionManifest,
    canonical_text: &str,
    pubkey_env: Option<&str>,
    dev_mode: bool,
) -> AppResult<()> {
    match manifest.distribution {
        ExtensionDistribution::Bundled => Ok(()),
        ExtensionDistribution::Market => {
            if dev_mode {
                // spec §4.3 dev 态：允许本地自签/未签（UI 明示「未验证分发源」）。
                eprintln!(
                    "[extension_host] dev mode: skipping signature verification for `{}` \
                     (unverified distribution source)",
                    manifest.id
                );
                return Ok(());
            }
            let signature_text = manifest.signature.as_deref().ok_or_else(|| {
                AppError::forbidden_path(format!(
                    "market extension `{}` is missing a manifest signature",
                    manifest.id
                ))
            })?;
            let signature = Signature::decode(signature_text.trim())
                .map_err(|e| AppError::forbidden_path(format!("invalid signature: {e}")))?;
            let public_key = decode_registry_pubkey(pubkey_env)?;
            public_key
                .verify(canonical_text.as_bytes(), &signature, false)
                .map_err(|e| {
                    AppError::forbidden_path(format!(
                        "manifest signature verification failed for `{}`: {e}",
                        manifest.id
                    ))
                })?;
            // 验签成功后 trusted comment 已被 global signature 认证，可安全读取。
            let expected = format!("{}@{}", manifest.id, manifest.version);
            if signature.trusted_comment().trim() != expected {
                return Err(AppError::forbidden_path(format!(
                    "signature trusted comment `{}` does not bind to `{}` (expected `{expected}`)",
                    signature.trusted_comment().trim(),
                    manifest.id
                )));
            }
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试专用确定性密钥（seed 全 0x07，@noble/ed25519 生成，仅用于单测，
    /// 非生产密钥）。canonical 文本与签名一一对应。
    const TEST_PUBKEY: &str = "untrusted comment: bench test key\nRWQBAgMEBQYHCOpKbGPinFIKvvVQexMuxfmVR3auvr57kkIe6mkURtIs";

    /// 对 CANONICAL_TEXT 的合法签名，trusted comment = `fake-ext@1.0.0`。
    const TEST_SIGNATURE: &str = "untrusted comment: bench test sig\nRUQBAgMEBQYHCAy26WStCVPwdE2SC1IruO3MrUl8k/tkVZ5eKhNM2uCIxgtgsSJUpfCdHf+Xx+ktR8wwvI+QnV6j4/s3v5OfRwQ=\ntrusted comment: fake-ext@1.0.0\nRt8QuX8F1+o/YVISy+BsLbX4qh60JJzv+yGSfoG0Ko7Bttqo0Gi5UNakEXA25D17YdL7g94S1FYmQHMqEBjEAA==";

    /// 对同一 CANONICAL_TEXT 的合法签名，但 trusted comment 绑定错误对象。
    const TEST_SIGNATURE_WRONG_COMMENT: &str = "untrusted comment: bench test sig\nRUQBAgMEBQYHCAy26WStCVPwdE2SC1IruO3MrUl8k/tkVZ5eKhNM2uCIxgtgsSJUpfCdHf+Xx+ktR8wwvI+QnV6j4/s3v5OfRwQ=\ntrusted comment: other-ext@1.0.0\nS058OIpZhPYUdvWRV7vdQIXKHGGuiz7Y2DC7BLPvyfgmjXqT3Vm2+W3G/roqxVyrSnf8/QkeyZmPROej63ZwCw==";

    /// canonical 文本（键升序、紧凑、无 signature 字段）。
    const CANONICAL_TEXT: &str = r#"{"acl":{"commands":[]},"display":{"en":"Fake Ext"},"distribution":"market","engines":{"bench":"*"},"entry":{"index":"index.html"},"files":[{"path":"index.html","sha256":"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08","size":512}],"id":"fake-ext","schemaVersion":2,"version":"1.0.0"}"#;

    /// 键序打乱、带空白、含 signature 字段的 manifest 原文（模拟作者侧产物）。
    fn raw_manifest_with_signature(signature: Option<&str>) -> String {
        let signature_field = match signature {
            Some(sig) => {
                // JSON 字符串内换行需转义（serde 解析后还原为真实换行）。
                let escaped = sig.replace('\n', "\\n");
                format!(r#""signature": "{escaped}","#)
            }
            None => String::new(),
        };
        format!(
            r#"{{
                "id": "fake-ext",
                {signature_field}
                "engines": {{ "bench": "*" }},
                "acl": {{ "commands": [] }},
                "files": [{{ "size": 512, "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "path": "index.html" }}],
                "entry": {{ "index": "index.html" }},
                "distribution": "market",
                "display": {{ "en": "Fake Ext" }},
                "version": "1.0.0",
                "schemaVersion": 2
            }}"#
        )
    }

    fn market_manifest(signature: Option<&str>) -> ExtensionManifest {
        ExtensionManifest::parse(&raw_manifest_with_signature(signature)).expect("valid manifest")
    }

    #[test]
    fn canonical_text_strips_signature_and_sorts_keys() {
        let raw = raw_manifest_with_signature(Some(TEST_SIGNATURE));
        assert_eq!(
            canonical_manifest_text(&raw).expect("canonical"),
            CANONICAL_TEXT
        );
        // 无 signature 字段同样产出一致文本。
        let raw = raw_manifest_with_signature(None);
        assert_eq!(
            canonical_manifest_text(&raw).expect("canonical"),
            CANONICAL_TEXT
        );
    }

    #[test]
    fn canonical_text_rejects_non_object() {
        assert_eq!(
            canonical_manifest_text("[1,2,3]").unwrap_err().code,
            "INVALID_INPUT"
        );
        assert_eq!(
            canonical_manifest_text("not json").unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn market_valid_signature_accepted() {
        let manifest = market_manifest(Some(TEST_SIGNATURE));
        let canonical = canonical_manifest_text(&raw_manifest_with_signature(Some(TEST_SIGNATURE)))
            .expect("canonical");
        verify_signature_with(&manifest, &canonical, Some(TEST_PUBKEY), false)
            .expect("valid signature should pass");
    }

    #[test]
    fn bundled_is_exempt() {
        let text = raw_manifest_with_signature(None).replace("\"market\"", "\"bundled\"");
        let manifest = ExtensionManifest::parse(&text).expect("valid manifest");
        verify_signature_with(&manifest, "{}", None, false)
            .expect("bundled exempt even without pubkey");
    }

    #[test]
    fn market_without_signature_rejected() {
        let manifest = market_manifest(None);
        let err =
            verify_signature_with(&manifest, CANONICAL_TEXT, Some(TEST_PUBKEY), false).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
    }

    #[test]
    fn market_with_garbage_signature_rejected() {
        let manifest = market_manifest(Some("not-a-minisign-signature"));
        let err =
            verify_signature_with(&manifest, CANONICAL_TEXT, Some(TEST_PUBKEY), false).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
    }

    #[test]
    fn market_with_tampered_signature_rejected() {
        // 翻转签名串末位字符。
        let mut chars: Vec<char> = TEST_SIGNATURE.chars().collect();
        let last = chars.last_mut().expect("non-empty");
        *last = if *last == '=' { 'A' } else { '=' };
        let tampered: String = chars.into_iter().collect();
        let manifest = market_manifest(Some(&tampered));
        let err =
            verify_signature_with(&manifest, CANONICAL_TEXT, Some(TEST_PUBKEY), false).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
    }

    #[test]
    fn trusted_comment_mismatch_rejected() {
        // 消息签名本身合法，但 comment 绑定的 id 与 manifest 不一致。
        let manifest = market_manifest(Some(TEST_SIGNATURE_WRONG_COMMENT));
        let err =
            verify_signature_with(&manifest, CANONICAL_TEXT, Some(TEST_PUBKEY), false).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains("trusted comment"));
    }

    #[test]
    fn canonical_text_mismatch_rejected() {
        // 用 A 文本的签名去验 B 文本（内容被篡改）→ 拒绝。
        let manifest = market_manifest(Some(TEST_SIGNATURE));
        let wrong_canonical =
            CANONICAL_TEXT.replace("\"version\":\"1.0.0\"", "\"version\":\"1.0.1\"");
        let err = verify_signature_with(&manifest, &wrong_canonical, Some(TEST_PUBKEY), false)
            .unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
    }

    #[test]
    fn release_without_pubkey_is_config_error_not_silent_pass() {
        let manifest = market_manifest(Some(TEST_SIGNATURE));
        let err = verify_signature_with(&manifest, CANONICAL_TEXT, None, false).unwrap_err();
        // 公钥缺失 = 配置错误（INTERNAL），绝不静默放行。
        assert_eq!(err.code, "INTERNAL");
        assert!(err.message.contains("not configured"));
    }

    #[test]
    fn dev_mode_allows_unsigned_market() {
        let manifest = market_manifest(None);
        verify_signature_with(&manifest, CANONICAL_TEXT, None, true)
            .expect("dev mode skips signature verification");
    }

    #[test]
    fn dev_mode_flag_parsing() {
        assert!(dev_mode_from_env(Some("1")));
        assert!(dev_mode_from_env(Some(" 1 ")));
        assert!(!dev_mode_from_env(Some("0")));
        assert!(!dev_mode_from_env(Some("true")));
        assert!(!dev_mode_from_env(None));
    }

    #[test]
    fn decode_pubkey_rejects_garbage() {
        let err = decode_registry_pubkey(Some("garbage")).unwrap_err();
        assert_eq!(err.code, "INTERNAL");
    }

    #[test]
    fn test_pubkey_decodes() {
        decode_registry_pubkey(Some(TEST_PUBKEY)).expect("fixture pubkey must decode");
    }
}
