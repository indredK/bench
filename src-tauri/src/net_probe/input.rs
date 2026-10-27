use crate::error::{AppError, AppResult};
use std::net::IpAddr;
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
        if trimmed
            .chars()
            .any(|character| matches!(character, '/' | '?' | '#' | '@' | '%'))
        {
            return Err(AppError::invalid_input(
                "Bare targets must be hostnames or IP addresses, not URL components",
            ));
        }
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
        let host = input.trim();
        let url = match host.parse::<IpAddr>() {
            Ok(IpAddr::V6(address)) => format!("https://[{address}]"),
            _ => format!("https://{host}"),
        };
        Url::parse(&url)
            .map_err(|e| AppError::invalid_input(format!("Invalid host for HTTPS: {e}")))
    }
}

#[cfg(test)]
mod tests {
    use super::validate_probe_input;

    #[test]
    fn accepts_bare_hosts_and_explicit_http_urls() {
        assert!(validate_probe_input("example.com").is_ok());
        assert!(validate_probe_input("https://example.com/path?token=secret").is_ok());
    }

    #[test]
    fn rejects_url_components_without_an_explicit_scheme() {
        for target in [
            "example.com/path",
            "example.com?token=secret",
            "example.com#fragment",
            "user@example.com",
            "example%2ecom",
        ] {
            assert!(validate_probe_input(target).is_err(), "accepted {target:?}");
        }
    }

    #[test]
    fn parses_bare_ipv6_hosts_as_bracketed_https_urls() {
        let parsed = super::parse_http_url("2001:db8::1").expect("bare IPv6 host should parse");
        assert_eq!(parsed.as_str(), "https://[2001:db8::1]/");
    }
}
