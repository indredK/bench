use crate::error::{AppError, AppResult};

pub fn validate_host(host: &str) -> AppResult<()> {
    if host.is_empty() {
        return Err(AppError::invalid_input("Host cannot be empty"));
    }
    if host.len() > 253 {
        return Err(AppError::invalid_input("Host too long"));
    }
    if host.starts_with('-') {
        return Err(AppError::invalid_input(
            "Invalid host: must not start with '-'",
        ));
    }
    let forbidden = [
        ';', '|', '&', '$', '`', '(', ')', '<', '>', '\n', '\r', '"', '\'', '\\', ' ',
    ];
    if host.chars().any(|c| forbidden.contains(&c)) {
        return Err(AppError::invalid_input(
            "Invalid host: contains forbidden characters",
        ));
    }
    Ok(())
}
