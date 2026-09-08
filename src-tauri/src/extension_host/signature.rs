//! Extension 签名校验（P3 骨架，D-024 分发安全模型）。
//!
//! 分发策略：
//! - `bundled`：随主包构建捆绑，**豁免**插件级签名（主包二进制本身由
//!   minisign updater 签名链覆盖）；
//! - `market`：registry 分发，**强制**校验 manifest 的 minisign 签名
//!   （`manifest.signature`，值为 minisign 签名文件第二行的 base64 文本），
//!   fail-closed。
//!
//! 签名对象：registry 发布时对 manifest 的规范 JSON 文本（minified UTF-8
//! 字节流）签名，宿主对同一字节流验签。
//!
//! 公钥来源：环境变量 `BENCH_EXT_REGISTRY_PUBKEY`（minisign 公钥文件的
//! 完整两行文本，即 `minisign.pub` 内容）优先；未设置时回退宿主 updater
//! 公钥（`tauri.conf.json plugins.updater.pubkey`，base64(两行文本)）。

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use minisign_verify::{PublicKey, Signature};

use crate::error::{AppError, AppResult};

use super::manifest::{ExtensionDistribution, ExtensionManifest};

/// updater 公钥（与 `tauri.conf.json plugins.updater.pubkey` 相同的 base64 文本）。
const UPDATER_PUBKEY_B64: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IENFQkI3QjQ3NDU1MzRGMQpSV1R4TkZWMHRMZnJESHY4dUlEV3gya01mNmwzdU40YnZkR1pDQ0NVaWpCUUdxT2tFb2swTFl6bwo=";

/// 解析 registry 公钥（fail-closed：任一环节失败即拒绝）。
fn registry_public_key() -> AppResult<PublicKey> {
    if let Ok(file_text) = std::env::var("BENCH_EXT_REGISTRY_PUBKEY") {
        return PublicKey::decode(&file_text)
            .map_err(|e| AppError::internal(format!("invalid BENCH_EXT_REGISTRY_PUBKEY: {e}")));
    }
    let file_text = BASE64
        .decode(UPDATER_PUBKEY_B64.trim())
        .map_err(|e| AppError::internal(format!("decode updater pubkey: {e}")))?;
    let file_text = String::from_utf8(file_text)
        .map_err(|e| AppError::internal(format!("updater pubkey not utf8: {e}")))?;
    PublicKey::decode(&file_text)
        .map_err(|e| AppError::internal(format!("invalid updater pubkey: {e}")))
}

/// 校验 market 插件的 manifest 签名（fail-closed）；bundled 直接豁免。
///
/// - `canonical_text`：registry 签名时使用的规范 manifest 文本（原样字节）；
/// - `manifest`：已解析的 manifest（读取 signature 与 distribution）。
pub fn verify_distribution_signature(
    manifest: &ExtensionManifest,
    canonical_text: &str,
) -> AppResult<()> {
    match manifest.distribution {
        ExtensionDistribution::Bundled => Ok(()),
        ExtensionDistribution::Market => {
            let signature_text = manifest.signature.as_deref().ok_or_else(|| {
                AppError::forbidden_path(format!(
                    "market extension `{}` is missing a manifest signature",
                    manifest.id
                ))
            })?;
            let signature = Signature::decode(signature_text.trim())
                .map_err(|e| AppError::forbidden_path(format!("invalid signature: {e}")))?;
            let public_key = registry_public_key()?;
            public_key
                .verify(canonical_text.as_bytes(), &signature, false)
                .map_err(|e| {
                    AppError::forbidden_path(format!(
                        "manifest signature verification failed for `{}`: {e}",
                        manifest.id
                    ))
                })?;
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_with_distribution(
        distribution: &str,
        signature: Option<&str>,
    ) -> ExtensionManifest {
        let signature_field = signature
            .map(|value| format!(r#", "signature": "{value}""#))
            .unwrap_or_default();
        let text = format!(
            r#"{{
                "schemaVersion": 1, "id": "fake-ext", "version": "1.0.0",
                "display": {{ "zh": "假", "en": "Fake" }},
                "distribution": "{distribution}",
                "entry": {{ "index": "index.html" }},
                "acl": {{ "commands": [] }},
                "engines": {{ "bench": "*" }}{signature_field}
            }}"#
        );
        ExtensionManifest::parse(&text).expect("valid manifest")
    }

    #[test]
    fn bundled_is_exempt() {
        let manifest = manifest_with_distribution("bundled", None);
        assert!(verify_distribution_signature(&manifest, "{}").is_ok());
    }

    #[test]
    fn market_without_signature_rejected() {
        let manifest = manifest_with_distribution("market", None);
        let err = verify_distribution_signature(&manifest, "{}").unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
    }

    #[test]
    fn market_with_garbage_signature_rejected() {
        let manifest = manifest_with_distribution("market", Some("not-a-minisign-signature"));
        let err = verify_distribution_signature(&manifest, "{}").unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
    }

    #[test]
    fn updater_pubkey_decodes() {
        // updater 公钥两层解码后必须是合法 minisign 公钥（两行文本）。
        let result = registry_public_key();
        assert!(result.is_ok(), "updater pubkey should decode: {result:?}");
    }
}
