//! WHOIS / RDAP lookup (design-security §5.5). Prefer RDAP HTTPS JSON.

use super::types::WhoisInfo;
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use std::net::IpAddr;
use url::Url;

const MAX_RAW: usize = 16_384;

pub async fn whois_lookup(query: String) -> AppResult<WhoisInfo> {
    let q = query.trim().to_string();
    if q.is_empty() {
        return Err(AppError::invalid_input("WHOIS query cannot be empty"));
    }
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
        return Err(AppError::invalid_input("Invalid WHOIS query"));
    }
    validate_host(&q)?;

    let command_hint = format!("whois('{q}')");
    let url = rdap_url(&q)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|e| AppError::new("WHOIS_CLIENT", e.to_string()))?;

    match client.get(url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let (raw_text, partial, message) = match read_limited_body(resp).await {
                Ok((raw_text, partial)) => (raw_text, partial, None),
                Err(e) => (
                    String::new(),
                    true,
                    Some(format!("RDAP response read failed: {e}")),
                ),
            };
            Ok(WhoisInfo {
                query: q,
                source: "rdap.org".into(),
                raw_text,
                partial,
                message,
                command_hint,
            })
        }
        Ok(resp) => {
            let status = resp.status();
            let (body, read_error) = match read_limited_body(resp).await {
                Ok((body, _)) => (body, None),
                Err(e) => (String::new(), Some(e.to_string())),
            };
            let (raw_text, _) = truncate(&format!("HTTP {status}\n{body}"));
            Ok(WhoisInfo {
                query: q,
                source: "rdap.org".into(),
                raw_text,
                partial: true,
                message: Some(match read_error {
                    Some(error) => {
                        format!("RDAP returned HTTP {status}; response read failed: {error}")
                    }
                    None => format!("RDAP returned HTTP {status}"),
                }),
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

fn rdap_url(query: &str) -> AppResult<Url> {
    let query_type = if query.parse::<IpAddr>().is_ok() {
        "ip"
    } else {
        "domain"
    };
    let mut url =
        Url::parse("https://rdap.org/").map_err(|e| AppError::new("WHOIS_URL", e.to_string()))?;
    url.path_segments_mut()
        .map_err(|_| AppError::new("WHOIS_URL", "RDAP base URL cannot accept path segments"))?
        .extend([query_type, query]);
    Ok(url)
}

async fn read_limited_body(response: reqwest::Response) -> Result<(String, bool), reqwest::Error> {
    let content_length = response.content_length();
    let mut bytes = Vec::with_capacity(MAX_RAW);
    let mut partial = false;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if append_limited(&mut bytes, &chunk, content_length) {
            partial = true;
            break;
        }
    }

    let decoded = String::from_utf8_lossy(&bytes);
    let (raw, truncated) = truncate(&decoded);
    Ok((raw, partial || truncated))
}

fn append_limited(bytes: &mut Vec<u8>, chunk: &[u8], content_length: Option<u64>) -> bool {
    let remaining = MAX_RAW.saturating_sub(bytes.len());
    let copied = chunk.len().min(remaining);
    bytes.extend_from_slice(&chunk[..copied]);

    copied < chunk.len()
        || (bytes.len() == MAX_RAW && content_length.is_none_or(|length| length > MAX_RAW as u64))
}

fn truncate(text: &str) -> (String, bool) {
    if text.len() <= MAX_RAW {
        return (text.to_string(), false);
    }

    let mut end = MAX_RAW;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    (text[..end].to_string(), true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rdap_url_selects_ip_or_domain_endpoint() {
        assert_eq!(rdap_url("1.1.1.1").unwrap().path(), "/ip/1.1.1.1");
        assert_eq!(
            rdap_url("2606:4700:4700::1111").unwrap().path(),
            "/ip/2606:4700:4700::1111"
        );
        assert_eq!(
            rdap_url("example.com").unwrap().path(),
            "/domain/example.com"
        );
    }

    #[test]
    fn truncate_caps_utf8_text_by_bytes_without_splitting_a_character() {
        let text = "网".repeat(MAX_RAW);
        let (raw, partial) = truncate(&text);

        assert!(partial);
        assert!(raw.len() <= MAX_RAW);
        assert!(raw.is_char_boundary(raw.len()));
    }

    #[test]
    fn append_limited_keeps_only_the_configured_response_bytes() {
        let chunk = vec![b'x'; MAX_RAW * 4];
        let mut bytes = Vec::new();

        let partial = append_limited(&mut bytes, &chunk, Some((MAX_RAW * 4) as u64));

        assert!(partial);
        assert_eq!(bytes.len(), MAX_RAW);
    }
}
