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

/// Redact URL userinfo, query values and fragments before returning a target to the UI.
/// Bare hosts are preserved unless they contain URL delimiters, in which case the
/// input is malformed and could contain secrets that must not be echoed.
pub fn redact_probe_target_for_display(input: &str) -> String {
    let trimmed = input.trim();
    if !looks_like_url(trimmed) {
        return if trimmed.chars().any(|ch| matches!(ch, '?' | '#' | '@')) {
            "…".into()
        } else {
            trimmed.into()
        };
    }

    let Ok(mut url) = Url::parse(trimmed) else {
        return "…".into();
    };

    let has_query = url.query().is_some();
    let has_fragment = url.fragment().is_some();
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);

    format!(
        "{url}{}{}",
        if has_query { "?…" } else { "" },
        if has_fragment { "#…" } else { "" }
    )
}

pub fn parse_http_url(input: &str) -> AppResult<Url> {
    if looks_like_url(input) {
        Url::parse(input.trim()).map_err(|e| AppError::invalid_input(format!("Invalid URL: {e}")))
    } else {
        Url::parse(&format!("https://{}", input.trim()))
            .map_err(|e| AppError::invalid_input(format!("Invalid host for HTTPS: {e}")))
    }
}

#[cfg(test)]
mod tests {
    use super::redact_probe_target_for_display;

    #[test]
    fn redacts_credentials_query_and_fragment() {
        assert_eq!(
            redact_probe_target_for_display(
                "https://user:secret@example.com/health?token=private#section"
            ),
            "https://example.com/health?…#…"
        );
    }

    #[test]
    fn preserves_plain_hosts_and_masks_malformed_secret_targets() {
        assert_eq!(
            redact_probe_target_for_display("example.com"),
            "example.com"
        );
        assert_eq!(
            redact_probe_target_for_display("user:secret@example.com"),
            "…"
        );
        assert_eq!(
            redact_probe_target_for_display("https://invalid url?token=secret"),
            "…"
        );
    }
}
