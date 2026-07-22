use crate::error::{AppError, AppResult};
use url::Url;

/// Validate a free-form probe input: bare host or http(s) URL.
pub fn validate_probe_input(input: &str) -> AppResult<()> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_input("Target cannot be empty"));
    }
    if trimmed.len() > 2048 {
        return Err(AppError::invalid_input("Target too long"));
    }
    if looks_like_url(trimmed) {
        let parsed = Url::parse(trimmed)
            .map_err(|e| AppError::invalid_input(format!("Invalid URL: {e}")))?;
        match parsed.scheme() {
            "http" | "https" => {}
            other => {
                return Err(AppError::invalid_input(format!(
                    "Unsupported URL scheme: {other}"
                )));
            }
        }
        if parsed.host_str().is_none() {
            return Err(AppError::invalid_input("URL must include a host"));
        }
        Ok(())
    } else {
        super::validate::validate_host(trimmed)
    }
}

pub fn looks_like_url(input: &str) -> bool {
    let lower = input.to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

pub fn parse_http_url(input: &str) -> AppResult<Url> {
    if looks_like_url(input) {
        Url::parse(input.trim()).map_err(|e| AppError::invalid_input(format!("Invalid URL: {e}")))
    } else {
        Url::parse(&format!("https://{}", input.trim()))
            .map_err(|e| AppError::invalid_input(format!("Invalid host for HTTPS: {e}")))
    }
}
