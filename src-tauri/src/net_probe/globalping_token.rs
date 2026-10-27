//! Globalping API credential storage in the operating system credential vault.

use std::sync::{Mutex, MutexGuard, OnceLock};

use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

const KEYRING_SERVICE: &str = "bench.network-probe.globalping";
const KEYRING_ACCOUNT: &str = "api-token.v1";
const MAX_TOKEN_BYTES: usize = 4096;

fn keyring_lock() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn open_entry() -> AppResult<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|_| credential_store_error())
}

fn credential_store_error() -> AppError {
    AppError::new(
        "GP_TOKEN_STORE",
        "Globalping credential storage is unavailable.",
    )
}

fn normalize_token(input: String) -> AppResult<Zeroizing<String>> {
    let input = Zeroizing::new(input);
    if input.len() > MAX_TOKEN_BYTES + 128 {
        return Err(AppError::invalid_input("Globalping token is invalid."));
    }
    let normalized = Zeroizing::new(input.trim().to_owned());

    if normalized.is_empty() {
        return Err(AppError::invalid_input("Globalping token cannot be empty."));
    }
    if normalized.len() > MAX_TOKEN_BYTES || normalized.chars().any(char::is_control) {
        return Err(AppError::invalid_input("Globalping token is invalid."));
    }

    Ok(normalized)
}

fn normalize_stored_token(input: String) -> AppResult<Option<Zeroizing<String>>> {
    let input = Zeroizing::new(input);
    if input.len() > MAX_TOKEN_BYTES {
        return Err(credential_store_error());
    }

    let token = Zeroizing::new(input.trim().to_owned());
    if token.is_empty() {
        return Ok(None);
    }
    if token.len() > MAX_TOKEN_BYTES || token.chars().any(char::is_control) {
        return Err(credential_store_error());
    }

    Ok(Some(token))
}

fn read_token() -> AppResult<Option<Zeroizing<String>>> {
    match open_entry()?.get_password() {
        Ok(token) => normalize_stored_token(token),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(credential_store_error()),
    }
}

pub fn save_token(input: String) -> AppResult<()> {
    let token = normalize_token(input)?;
    let _guard = keyring_lock();
    open_entry()?
        .set_password(&token)
        .map_err(|_| credential_store_error())
}

pub fn clear_token() -> AppResult<()> {
    let _guard = keyring_lock();
    match open_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(credential_store_error()),
    }
}

pub fn token_is_configured() -> AppResult<bool> {
    let _guard = keyring_lock();
    Ok(read_token()?.is_some())
}

pub fn load_token() -> AppResult<Option<Zeroizing<String>>> {
    let _guard = keyring_lock();
    read_token()
}

#[cfg(test)]
mod tests {
    use super::{normalize_stored_token, normalize_token};

    #[test]
    fn trims_token_edges_without_logging_or_persisting_the_input() {
        let token = normalize_token("  gp_test-token  ".to_owned()).unwrap();
        assert_eq!(token.as_str(), "gp_test-token");
    }

    #[test]
    fn rejects_blank_tokens() {
        assert_eq!(
            normalize_token(" \n ".to_owned()).unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn rejects_control_characters_and_oversized_tokens() {
        assert!(normalize_token("gp_test\ntoken".to_owned()).is_err());
        assert!(normalize_token("x".repeat(4097)).is_err());
    }

    #[test]
    fn blank_stored_credentials_are_treated_as_missing() {
        assert!(normalize_stored_token(" \t ".to_owned()).unwrap().is_none());
    }

    #[test]
    fn malformed_stored_credentials_fail_closed() {
        assert_eq!(
            normalize_stored_token("gp_test\ntoken".to_owned())
                .unwrap_err()
                .code,
            "GP_TOKEN_STORE"
        );
        assert_eq!(
            normalize_stored_token("x".repeat(4097)).unwrap_err().code,
            "GP_TOKEN_STORE"
        );
    }
}
