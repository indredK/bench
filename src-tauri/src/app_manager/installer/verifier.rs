use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use sha2::{Digest, Sha512};
use std::io::Read;
use std::path::Path;

/// Verification material extracted from a feed and the app's Info.plist.
/// All fields are optional — the verifier degrades gracefully when no
/// signature or hash is available (returns `Skipped`).
#[derive(Debug, Default, Clone)]
pub struct VerifyConfig {
    /// `sparkle:edSignature` from the enclosure (base64).
    pub ed25519_signature: Option<String>,
    /// `SUPublicEDKey` from the app's Info.plist (base64; 32 bytes raw).
    pub ed25519_pubkey: Option<String>,
    /// SHA-512 from electron-updater `latest-mac.yml` or Sparkle's
    /// `sparkle:installerSHA512Sum` (base64; 64 bytes raw).
    pub sha512: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerifyMethod {
    Ed25519,
    Sha512,
}

#[derive(Debug)]
pub enum VerifyOutcome {
    /// Verification succeeded via the named method.
    Verified(#[allow(dead_code)] VerifyMethod),
    /// No verification material was available. Caller should log a warning
    /// (`SU_NO_SIGNATURE`) but proceed.
    Skipped,
    /// Verification was attempted and failed. Error is `SU_VERIFY_*`.
    Failed(String),
}

/// Read a file fully into memory. Suitable for the 50–500 MB range typical of
/// macOS .dmg / .zip downloads.
fn read_file(path: &Path) -> Result<Vec<u8>, String> {
    let mut f = std::fs::File::open(path).map_err(|e| format!("SU_VERIFY_HASH_FAIL: {e}"))?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf)
        .map_err(|e| format!("SU_VERIFY_HASH_FAIL: {e}"))?;
    Ok(buf)
}

/// Verify the downloaded payload against whatever material is present in
/// `cfg`. Priority is ed25519 > sha512 > skip (per planning doc).
pub fn verify(path: &Path, cfg: &VerifyConfig) -> VerifyOutcome {
    // ed25519 takes priority when both pubkey + signature are present.
    if let (Some(sig_b64), Some(pk_b64)) = (&cfg.ed25519_signature, &cfg.ed25519_pubkey) {
        return match verify_ed25519(path, pk_b64, sig_b64) {
            Ok(()) => VerifyOutcome::Verified(VerifyMethod::Ed25519),
            Err(e) => VerifyOutcome::Failed(e),
        };
    }

    if let Some(hash_b64) = &cfg.sha512 {
        return match verify_sha512(path, hash_b64) {
            Ok(()) => VerifyOutcome::Verified(VerifyMethod::Sha512),
            Err(e) => VerifyOutcome::Failed(e),
        };
    }

    VerifyOutcome::Skipped
}

/// Decode a hex or base64 SHA-512. electron-updater publishes base64; some
/// Sparkle feeds publish hex. We try both.
fn decode_sha512(s: &str) -> Result<[u8; 64], String> {
    let trimmed = s.trim();
    if let Ok(bytes) = B64.decode(trimmed) {
        if bytes.len() == 64 {
            let mut out = [0u8; 64];
            out.copy_from_slice(&bytes);
            return Ok(out);
        }
    }
    // Try hex.
    if trimmed.len() == 128 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        let mut out = [0u8; 64];
        for (i, byte) in out.iter_mut().enumerate() {
            let s = &trimmed[i * 2..i * 2 + 2];
            *byte =
                u8::from_str_radix(s, 16).map_err(|e| format!("SU_VERIFY_HASH_FAIL: hex {e}"))?;
        }
        return Ok(out);
    }
    Err("SU_VERIFY_HASH_FAIL: sha512 not 64 bytes (base64 or hex)".into())
}

fn verify_sha512(path: &Path, expected_b64: &str) -> Result<(), String> {
    let expected = decode_sha512(expected_b64)?;
    let bytes = read_file(path)?;
    let mut hasher = Sha512::new();
    hasher.update(&bytes);
    let actual = hasher.finalize();
    if actual.as_slice() != expected.as_slice() {
        return Err("SU_VERIFY_HASH_FAIL: sha512 mismatch".into());
    }
    Ok(())
}

fn verify_ed25519(path: &Path, pubkey_b64: &str, sig_b64: &str) -> Result<(), String> {
    let pk_bytes = B64
        .decode(pubkey_b64.trim())
        .map_err(|e| format!("SU_VERIFY_SIG_FAIL: pubkey base64 {e}"))?;
    let pk_arr: [u8; 32] = pk_bytes
        .as_slice()
        .try_into()
        .map_err(|_| "SU_VERIFY_SIG_FAIL: pubkey not 32 bytes".to_string())?;
    let key = VerifyingKey::from_bytes(&pk_arr)
        .map_err(|e| format!("SU_VERIFY_SIG_FAIL: pubkey parse {e}"))?;

    let sig_bytes = B64
        .decode(sig_b64.trim())
        .map_err(|e| format!("SU_VERIFY_SIG_FAIL: signature base64 {e}"))?;
    let sig_arr: [u8; 64] = sig_bytes
        .as_slice()
        .try_into()
        .map_err(|_| "SU_VERIFY_SIG_FAIL: signature not 64 bytes".to_string())?;
    let signature = Signature::from_bytes(&sig_arr);

    let bytes = read_file(path)?;
    key.verify(&bytes, &signature)
        .map_err(|e| format!("SU_VERIFY_SIG_FAIL: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use std::io::Write;

    fn write_tmp(name: &str, content: &[u8]) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(name);
        let mut f = std::fs::File::create(&p).unwrap();
        f.write_all(content).unwrap();
        p
    }

    /// Deterministic test key. ed25519-dalek 2.x accepts any 32-byte seed.
    fn test_signing_key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    #[test]
    fn verify_skipped_when_no_material() {
        let p = write_tmp("bench-verify-skip.bin", b"abc");
        let cfg = VerifyConfig::default();
        match verify(&p, &cfg) {
            VerifyOutcome::Skipped => {}
            other => panic!("expected Skipped, got {other:?}"),
        }
        let _ = std::fs::remove_file(p);
    }

    #[test]
    fn verify_sha512_succeeds_with_correct_base64_hash() {
        let payload = b"hello bench";
        let p = write_tmp("bench-verify-sha-ok.bin", payload);

        let mut hasher = Sha512::new();
        hasher.update(payload);
        let digest = hasher.finalize();
        let hash_b64 = B64.encode(digest);

        let cfg = VerifyConfig {
            sha512: Some(hash_b64),
            ..Default::default()
        };
        match verify(&p, &cfg) {
            VerifyOutcome::Verified(VerifyMethod::Sha512) => {}
            other => panic!("expected Verified(Sha512), got {other:?}"),
        }
        let _ = std::fs::remove_file(p);
    }

    #[test]
    fn verify_sha512_succeeds_with_hex_hash() {
        let payload = b"bench hex";
        let p = write_tmp("bench-verify-sha-hex.bin", payload);
        let mut hasher = Sha512::new();
        hasher.update(payload);
        let digest = hasher.finalize();
        let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();

        let cfg = VerifyConfig {
            sha512: Some(hex),
            ..Default::default()
        };
        match verify(&p, &cfg) {
            VerifyOutcome::Verified(VerifyMethod::Sha512) => {}
            other => panic!("expected Verified(Sha512), got {other:?}"),
        }
        let _ = std::fs::remove_file(p);
    }

    #[test]
    fn verify_sha512_fails_on_mismatch() {
        let p = write_tmp("bench-verify-sha-bad.bin", b"actual content");
        let cfg = VerifyConfig {
            sha512: Some(B64.encode([0u8; 64])),
            ..Default::default()
        };
        match verify(&p, &cfg) {
            VerifyOutcome::Failed(e) => assert!(e.starts_with("SU_VERIFY_HASH_FAIL")),
            other => panic!("expected Failed, got {other:?}"),
        }
        let _ = std::fs::remove_file(p);
    }

    #[test]
    fn verify_ed25519_round_trip() {
        let payload = b"verify ed25519";
        let p = write_tmp("bench-verify-ed-ok.bin", payload);

        let signing = test_signing_key();
        let sig = signing.sign(payload);
        let pk_b64 = B64.encode(signing.verifying_key().to_bytes());
        let sig_b64 = B64.encode(sig.to_bytes());

        let cfg = VerifyConfig {
            ed25519_pubkey: Some(pk_b64),
            ed25519_signature: Some(sig_b64),
            ..Default::default()
        };
        match verify(&p, &cfg) {
            VerifyOutcome::Verified(VerifyMethod::Ed25519) => {}
            other => panic!("expected Verified(Ed25519), got {other:?}"),
        }
        let _ = std::fs::remove_file(p);
    }

    #[test]
    fn verify_ed25519_fails_on_tampered_payload() {
        let p = write_tmp("bench-verify-ed-bad.bin", b"tampered");

        let signing = test_signing_key();
        let sig = signing.sign(b"original");
        let pk_b64 = B64.encode(signing.verifying_key().to_bytes());
        let sig_b64 = B64.encode(sig.to_bytes());

        let cfg = VerifyConfig {
            ed25519_pubkey: Some(pk_b64),
            ed25519_signature: Some(sig_b64),
            ..Default::default()
        };
        match verify(&p, &cfg) {
            VerifyOutcome::Failed(e) => assert!(e.starts_with("SU_VERIFY_SIG_FAIL")),
            other => panic!("expected Failed, got {other:?}"),
        }
        let _ = std::fs::remove_file(p);
    }

    #[test]
    fn ed25519_takes_priority_over_sha512_when_both_present() {
        let payload = b"both present";
        let p = write_tmp("bench-verify-both.bin", payload);

        let signing = test_signing_key();
        let sig = signing.sign(payload);
        let pk_b64 = B64.encode(signing.verifying_key().to_bytes());
        let sig_b64 = B64.encode(sig.to_bytes());

        let cfg = VerifyConfig {
            ed25519_pubkey: Some(pk_b64),
            ed25519_signature: Some(sig_b64),
            // Wrong sha512 — should be ignored because ed25519 wins first.
            sha512: Some(B64.encode([0u8; 64])),
        };
        match verify(&p, &cfg) {
            VerifyOutcome::Verified(VerifyMethod::Ed25519) => {}
            other => panic!("expected Verified(Ed25519), got {other:?}"),
        }
        let _ = std::fs::remove_file(p);
    }
}
