//! WHOIS / RDAP lookup (design-security §5.5). Prefer RDAP HTTPS JSON.

use super::types::WhoisInfo;
use super::validate::validate_host;
use crate::error::{AppError, AppResult};

const MAX_RAW: usize = 16_384;

pub async fn whois_lookup(query: String) -> AppResult<WhoisInfo> {
    let q = query.trim().to_string();
    if q.is_empty() {
        return Err(AppError::invalid_input("WHOIS query cannot be empty"));
    }
    // Allow domains and bare IPs via validate_host-like checks.
    if q.contains('/') || q.contains(' ') {
        return Err(AppError::invalid_input("Invalid WHOIS query"));
    }
    if q.chars().any(|c| ";|&$`()<>\"'\\".contains(c)) {
        return Err(AppError::invalid_input("Invalid WHOIS query characters"));
    }
    if !q
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == ':')
    {
        // allow IPv6 colon
        return Err(AppError::invalid_input("Invalid WHOIS query"));
    }
    let _ = validate_host(q.trim_matches(|c| c == '[' || c == ']'));

    let command_hint = format!("whois('{q}')");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|e| AppError::new("WHOIS_CLIENT", e.to_string()))?;

    // Bootstrap via rdap.org redirector.
    let url = format!("https://rdap.org/domain/{}", urlencoding_lite(&q));
    match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let text = resp.text().await.unwrap_or_default();
            let (raw, partial) = truncate(&text);
            Ok(WhoisInfo {
                query: q,
                source: "rdap.org".into(),
                raw_text: raw,
                partial,
                message: None,
                command_hint,
            })
        }
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            let (raw, _) = truncate(&format!("HTTP {status}\n{body}"));
            Ok(WhoisInfo {
                query: q,
                source: "rdap.org".into(),
                raw_text: raw,
                partial: true,
                message: Some(format!("RDAP returned HTTP {status}")),
                command_hint,
            })
        }
        Err(e) => Ok(WhoisInfo {
            query: q,
            source: "rdap.org".into(),
            raw_text: String::new(),
            partial: true,
            message: Some(format!("RDAP request failed: {e}")),
            command_hint,
        }),
    }
}

fn truncate(text: &str) -> (String, bool) {
    if text.len() <= MAX_RAW {
        (text.to_string(), false)
    } else {
        (text.chars().take(MAX_RAW).collect(), true)
    }
}

fn urlencoding_lite(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
