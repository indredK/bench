use aes_gcm::aead::array::typenum::U12;
use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::RngExt;
use serde::{Deserialize, Serialize};

use super::types::{AccountManagerError, AccountManagerResult};

const KEYRING_SERVICE: &str = "bench.account-manager";
const KEYRING_ACCOUNT: &str = "master-key.v1";
const BLOB_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EncryptedBlob {
    pub v: u8,
    pub nonce: String,
    pub ct: String,
}

pub fn get_or_create_master_key() -> AccountManagerResult<[u8; 32]> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| AccountManagerError::keyring_unavailable(format!("open entry: {e}")))?;
    match entry.get_password() {
        Ok(b64) => {
            let bytes = BASE64.decode(b64.as_bytes()).map_err(|e| {
                AccountManagerError::keyring_unavailable(format!("decode key: {e}"))
            })?;
            if bytes.len() != 32 {
                return Err(AccountManagerError::keyring_unavailable(format!(
                    "master key wrong length: {}",
                    bytes.len()
                )));
            }
            let mut k = [0u8; 32];
            k.copy_from_slice(&bytes);
            Ok(k)
        }
        Err(keyring::Error::NoEntry) => {
            let mut key = [0u8; 32];
            rand::rng().fill(&mut key);
            entry
                .set_password(&BASE64.encode(key))
                .map_err(|e| AccountManagerError::keyring_unavailable(format!("write key: {e}")))?;
            Ok(key)
        }
        Err(e) => Err(AccountManagerError::keyring_unavailable(e.to_string())),
    }
}

pub fn encrypt(key: &[u8; 32], plaintext: &str) -> AccountManagerResult<EncryptedBlob> {
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce_bytes = [0u8; 12];
    rand::rng().fill(&mut nonce_bytes);
    let nonce: &Nonce<U12> = (&nonce_bytes).into();
    let ct = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| AccountManagerError::crypto_fail(format!("encrypt: {e}")))?;
    Ok(EncryptedBlob {
        v: BLOB_VERSION,
        nonce: BASE64.encode(nonce_bytes),
        ct: BASE64.encode(ct),
    })
}

pub fn decrypt(key: &[u8; 32], blob: &EncryptedBlob) -> AccountManagerResult<String> {
    if blob.v != BLOB_VERSION {
        return Err(AccountManagerError::crypto_fail(format!(
            "unsupported blob version {}",
            blob.v
        )));
    }
    let nonce_bytes = BASE64
        .decode(blob.nonce.as_bytes())
        .map_err(|e| AccountManagerError::crypto_fail(format!("decode nonce: {e}")))?;
    if nonce_bytes.len() != 12 {
        return Err(AccountManagerError::crypto_fail(format!(
            "nonce wrong length: {}",
            nonce_bytes.len()
        )));
    }
    let ct_bytes = BASE64
        .decode(blob.ct.as_bytes())
        .map_err(|e| AccountManagerError::crypto_fail(format!("decode ct: {e}")))?;
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce_fixed = [0u8; 12];
    nonce_fixed.copy_from_slice(&nonce_bytes);
    let nonce: &Nonce<U12> = (&nonce_fixed).into();
    let pt = cipher
        .decrypt(nonce, ct_bytes.as_ref())
        .map_err(|e| AccountManagerError::crypto_fail(format!("decrypt: {e}")))?;
    String::from_utf8(pt).map_err(|e| AccountManagerError::crypto_fail(format!("utf8: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = [7u8; 32];
        let blob = encrypt(&key, "hello, 世界").unwrap();
        let out = decrypt(&key, &blob).unwrap();
        assert_eq!(out, "hello, 世界");
    }

    #[test]
    fn nonces_differ_per_call() {
        let key = [3u8; 32];
        let a = encrypt(&key, "same input").unwrap();
        let b = encrypt(&key, "same input").unwrap();
        assert_ne!(a.nonce, b.nonce);
        assert_ne!(a.ct, b.ct);
    }

    #[test]
    fn wrong_key_fails() {
        let key1 = [1u8; 32];
        let key2 = [2u8; 32];
        let blob = encrypt(&key1, "secret").unwrap();
        assert!(decrypt(&key2, &blob).is_err());
    }
}
