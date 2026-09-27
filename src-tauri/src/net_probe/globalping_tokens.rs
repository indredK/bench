//! Globalping credentials live in the OS credential store, never in renderer storage.

use super::types::GlobalpingTokenStatus;
use crate::error::{AppError, AppResult};

const KEYRING_SERVICE: &str = "bench.network-probe";
const KEYRING_ACCOUNT: &str = "globalping.token.v1";
const MAX_TOKEN_LENGTH: usize = 4096;

fn entry() -> AppResult<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|_| AppError::new("KEYRING_UNAVAILABLE", "系统钥匙串当前不可用。"))
}

fn validate_token(token: &str) -> AppResult<String> {
    let token = token.trim();
    if token.is_empty() {
        return Err(AppError::invalid_input("Globalping token 不能为空。"));
    }
    if token.len() > MAX_TOKEN_LENGTH || token.chars().any(char::is_control) {
        return Err(AppError::invalid_input("Globalping token 格式无效。"));
    }
    Ok(token.to_owned())
}

pub fn status() -> GlobalpingTokenStatus {
    match entry() {
        Ok(entry) => match entry.get_password() {
            Ok(_) => GlobalpingTokenStatus {
                available: true,
                configured: true,
            },
            Err(keyring::Error::NoEntry) => GlobalpingTokenStatus {
                available: true,
                configured: false,
            },
            Err(_) => GlobalpingTokenStatus {
                available: false,
                configured: false,
            },
        },
        Err(_) => GlobalpingTokenStatus {
            available: false,
            configured: false,
        },
    }
}

pub fn get() -> AppResult<Option<String>> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(AppError::new(
            "KEYRING_UNAVAILABLE",
            "无法读取系统钥匙串；本次测量未发送请求。",
        )),
    }
}

pub fn set(token: String) -> AppResult<GlobalpingTokenStatus> {
    let token = validate_token(&token)?;
    entry()?
        .set_password(&token)
        .map_err(|_| AppError::new("KEYRING_UNAVAILABLE", "无法将 token 保存到系统钥匙串。"))?;
    Ok(GlobalpingTokenStatus {
        available: true,
        configured: true,
    })
}

pub fn clear() -> AppResult<GlobalpingTokenStatus> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(GlobalpingTokenStatus {
            available: true,
            configured: false,
        }),
        Err(_) => Err(AppError::new(
            "KEYRING_UNAVAILABLE",
            "无法从系统钥匙串移除 Globalping token。",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::validate_token;

    #[test]
    fn token_validation_trims_and_rejects_empty_or_control_input() {
        assert_eq!(validate_token("  abc-token  ").unwrap(), "abc-token");
        assert!(validate_token("  ").is_err());
        assert!(validate_token("abc\ntoken").is_err());
    }
}
