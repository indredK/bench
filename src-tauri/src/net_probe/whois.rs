//! WHOIS / RDAP lookup (design-security §5.5). Prefer RDAP HTTPS JSON.

use super::bounded_http::read_response_body_limited;
use super::types::{WhoisErrorCode, WhoisInfo};
use crate::error::{AppError, AppResult};
use std::{
    io,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{lookup_host, TcpStream},
    time::timeout,
};
use url::{Host, Url};

const MAX_RAW: usize = 16_384;
const RDAP_BOOTSTRAP: &str = "https://rdap.org";
const WHOIS_PORT: u16 = 43;
const WHOIS_TIMEOUT: Duration = Duration::from_secs(5);

pub async fn whois_lookup(query: String) -> AppResult<WhoisInfo> {
    let q = query.trim().to_string();
    if q.is_empty() {
        return Err(AppError::invalid_input("WHOIS query cannot be empty"));
    }
    if q.len() > 253 || q.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(AppError::invalid_input("Invalid WHOIS query"));
    }

    let (resource, value) = rdap_resource(&q)?;

    let command_hint = format!("whois('{q}')");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|e| AppError::new("WHOIS_CLIENT", e.to_string()))?;

    // rdap.org bootstraps both domain and IP resources to the authoritative registry.
    let url = rdap_url(resource, &value)?;
    let (rdap_source, rdap_status, rdap_error_code, rdap_error) = match client.get(url).send().await
    {
        Ok(resp) if resp.status().is_success() => {
            let rdap_source = format!("rdap.org (HTTP {})", resp.status());
            match read_response_body_limited(resp, MAX_RAW).await {
                Ok(body) if !body.truncated => {
                    let (raw_text, truncated) = format_rdap_body(&body.bytes);
                    return Ok(WhoisInfo {
                        query: q,
                        source: rdap_source,
                        raw_text,
                        partial: truncated,
                        error_code: truncated.then_some(WhoisErrorCode::ResponseTruncated),
                        http_status: None,
                        message: truncated
                            .then_some("RDAP response exceeded the display limit.".into()),
                        command_hint,
                    });
                }
                Ok(_) => (
                    rdap_source.clone(),
                    None,
                    WhoisErrorCode::ResponseTruncated,
                    format!("{rdap_source} response exceeded the {MAX_RAW} byte limit."),
                ),
                Err(error) => (
                    rdap_source.clone(),
                    None,
                    WhoisErrorCode::BodyReadFailed,
                    format!("{rdap_source} response body read failed: {error}"),
                ),
            }
        }
        Ok(resp) => {
            let status = resp.status();
            let source = format!("rdap.org (HTTP {status})");
            let response_text = match read_response_body_limited(resp, MAX_RAW).await {
                Ok(body) => String::from_utf8_lossy(&body.bytes).into_owned(),
                Err(error) => format!("Response body read failed: {error}"),
            };
            (
                source,
                Some(status.as_u16()),
                WhoisErrorCode::HttpError,
                format!("RDAP returned HTTP {status}: {response_text}"),
            )
        }
        Err(error) => (
            "rdap.org".into(),
            None,
            WhoisErrorCode::RequestFailed,
            format!("RDAP request failed: {error}"),
        ),
    };

    match whois_fallback(&value).await {
        Ok((server, body, truncated)) => {
            let raw_text = String::from_utf8_lossy(&body).into_owned();
            let (raw_text, display_truncated) = cap_display_text(raw_text);
            let partial = truncated || display_truncated;
            Ok(WhoisInfo {
                query: q,
                source: format!("whois://{server}"),
                raw_text,
                partial,
                error_code: partial.then_some(WhoisErrorCode::ResponseTruncated),
                http_status: rdap_status,
                message: partial.then_some("WHOIS response exceeded the display limit.".into()),
                command_hint,
            })
        }
        Err(fallback_error) => {
            let detail = format!("{rdap_error}\nWHOIS fallback failed: {fallback_error}");
            Ok(WhoisInfo {
                query: q,
                source: rdap_source,
                // Preserve diagnostics in `message` for the collapsed technical-details UI;
                // `raw_text` is reserved for an actual RDAP/WHOIS response body.
                raw_text: String::new(),
                partial: true,
                error_code: Some(rdap_error_code),
                http_status: rdap_status,
                message: Some(detail),
                command_hint,
            })
        }
    }
}

fn rdap_url(resource: &'static str, value: &str) -> AppResult<Url> {
    let mut url = Url::parse(RDAP_BOOTSTRAP)
        .map_err(|error| AppError::new("WHOIS_URL", error.to_string()))?;
    url.path_segments_mut()
        .map_err(|_| AppError::new("WHOIS_URL", "RDAP endpoint cannot accept path segments"))?
        .pop_if_empty()
        .extend([resource, value]);
    Ok(url)
}

async fn whois_fallback(query: &str) -> Result<(String, Vec<u8>, bool), String> {
    let bootstrap = query_whois_server("whois.iana.org", query).await?;
    let bootstrap_text = String::from_utf8_lossy(&bootstrap.0);
    let server = parse_iana_referral(&bootstrap_text)
        .ok_or_else(|| "IANA response did not include a usable WHOIS referral.".to_string())?;
    let (body, truncated) = query_whois_server(&server, query).await?;
    if body.is_empty() {
        return Err(format!("{server} returned an empty WHOIS response."));
    }
    Ok((server, body, truncated))
}

async fn query_whois_server(host: &str, query: &str) -> Result<(Vec<u8>, bool), String> {
    if !is_valid_whois_host(host) {
        return Err("WHOIS server name is invalid.".into());
    }
    if query.is_empty() || query.bytes().any(|byte| matches!(byte, b'\r' | b'\n')) {
        return Err("WHOIS query contains invalid line breaks.".into());
    }

    let mut addresses = timeout(WHOIS_TIMEOUT, lookup_host((host, WHOIS_PORT)))
        .await
        .map_err(|_| format!("Resolving {host} timed out."))?
        .map_err(|error| format!("Resolving {host} failed: {error}"))?;
    let address = addresses
        .find(is_public_socket_address)
        .ok_or_else(|| format!("{host} has no public WHOIS address."))?;

    timeout(WHOIS_TIMEOUT, async move {
        let mut stream = TcpStream::connect(address).await?;
        stream.write_all(query.as_bytes()).await?;
        stream.write_all(b"\r\n").await?;

        let mut body = Vec::with_capacity(MAX_RAW.min(4096));
        let mut buffer = [0_u8; 2048];
        loop {
            let count = stream.read(&mut buffer).await?;
            if count == 0 {
                break;
            }
            let remaining = MAX_RAW.saturating_sub(body.len());
            let retained = count.min(remaining);
            body.extend_from_slice(&buffer[..retained]);
            if retained < count || body.len() == MAX_RAW {
                return Ok::<_, io::Error>((body, true));
            }
        }
        Ok((body, false))
    })
    .await
    .map_err(|_| format!("WHOIS request to {host} timed out."))?
    .map_err(|error| format!("WHOIS request to {host} failed: {error}"))
}

fn parse_iana_referral(response: &str) -> Option<String> {
    response.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        if !matches!(key.trim().to_ascii_lowercase().as_str(), "refer" | "whois") {
            return None;
        }
        let host = value.split('#').next()?.trim().trim_end_matches('.');
        is_valid_whois_host(host).then(|| host.to_ascii_lowercase())
    })
}

fn is_valid_whois_host(host: &str) -> bool {
    if host.is_empty()
        || host.len() > 253
        || host.parse::<IpAddr>().is_ok()
        || !host.is_ascii()
        || !host.contains('.')
    {
        return false;
    }
    host.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && label
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            && label
                .as_bytes()
                .first()
                .is_some_and(|byte| byte.is_ascii_alphanumeric())
            && label
                .as_bytes()
                .last()
                .is_some_and(|byte| byte.is_ascii_alphanumeric())
    })
}

fn is_public_socket_address(address: &SocketAddr) -> bool {
    match address.ip() {
        IpAddr::V4(address) => is_public_ipv4(address),
        IpAddr::V6(address) => {
            if let Some(mapped) = address.to_ipv4() {
                return is_public_ipv4(mapped);
            }
            let segments = address.segments();
            (segments[0] & 0xe000) == 0x2000 && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
        }
    }
}

fn is_public_ipv4(address: Ipv4Addr) -> bool {
    let octets = address.octets();
    !(address.is_unspecified()
        || address.is_private()
        || address.is_loopback()
        || address.is_link_local()
        || address.is_broadcast()
        || address.is_multicast()
        || octets[0] == 0
        || (octets[0] == 100 && (64..=127).contains(&octets[1]))
        || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
        || (octets[0] == 192 && octets[1] == 0 && octets[2] == 2)
        || (octets[0] == 198 && (18..=19).contains(&octets[1]))
        || (octets[0] == 198 && octets[1] == 51 && octets[2] == 100)
        || (octets[0] == 203 && octets[1] == 0 && octets[2] == 113)
        || octets[0] >= 224)
}

fn rdap_resource(query: &str) -> AppResult<(&'static str, String)> {
    if let Ok(address) = query.parse::<IpAddr>() {
        return Ok(("ip", address.to_string()));
    }

    match Host::parse(query)
        .map_err(|_| AppError::invalid_input("Enter a valid domain name or IP address"))?
    {
        Host::Ipv4(address) => Ok(("ip", address.to_string())),
        Host::Ipv6(address) => Ok(("ip", address.to_string())),
        Host::Domain(domain) => Ok(("domain", domain.trim_end_matches('.').to_string())),
    }
}

fn format_rdap_body(bytes: &[u8]) -> (String, bool) {
    let formatted = serde_json::from_slice::<serde_json::Value>(bytes)
        .and_then(|value| serde_json::to_string_pretty(&value))
        .unwrap_or_else(|_| String::from_utf8_lossy(bytes).into_owned());
    cap_display_text(formatted)
}

fn cap_display_text(mut text: String) -> (String, bool) {
    if text.len() <= MAX_RAW {
        return (text, false);
    }
    let mut end = MAX_RAW.saturating_sub('…'.len_utf8());
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    text.truncate(end);
    text.push('…');
    (text, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rdap_resource_routes_domains_and_addresses_correctly() {
        assert_eq!(
            rdap_resource("example.com").unwrap(),
            ("domain", "example.com".into())
        );
        assert_eq!(rdap_resource("8.8.8.8").unwrap(), ("ip", "8.8.8.8".into()));
        assert_eq!(
            rdap_resource("2001:4860:4860::8888").unwrap(),
            ("ip", "2001:4860:4860::8888".into())
        );
        assert_eq!(
            rdap_resource("[2001:4860:4860::8888]").unwrap(),
            ("ip", "2001:4860:4860::8888".into())
        );
    }

    #[test]
    fn rdap_urls_encode_each_resource_as_a_path_segment() {
        assert_eq!(
            rdap_url("domain", "example.com").unwrap().path(),
            "/domain/example.com"
        );
        assert_eq!(rdap_url("ip", "8.8.8.8").unwrap().path(), "/ip/8.8.8.8");
    }

    #[test]
    fn parses_only_valid_iana_referral_hosts() {
        assert_eq!(
            parse_iana_referral("domain: example.com\nrefer: whois.verisign-grs.com\n"),
            Some("whois.verisign-grs.com".into())
        );
        assert_eq!(
            parse_iana_referral("refer: 127.0.0.1\nrefer: whois.nic.example/path\n"),
            None
        );
    }

    #[test]
    fn only_public_whois_destinations_are_used() {
        assert!(is_public_socket_address(&"8.8.8.8:43".parse().unwrap()));
        assert!(!is_public_socket_address(&"127.0.0.1:43".parse().unwrap()));
        assert!(!is_public_socket_address(
            &"192.168.1.1:43".parse().unwrap()
        ));
        assert!(!is_public_socket_address(
            &"[2001:db8::1]:43".parse().unwrap()
        ));
    }

    #[test]
    fn rejects_non_host_queries() {
        assert!(rdap_resource("bad/path").is_err());
        assert!(rdap_resource("not a host").is_err());
    }

    #[test]
    fn pretty_prints_valid_json_and_preserves_other_bodies() {
        assert_eq!(
            format_rdap_body(br#"{"name":"example"}"#).0,
            "{\n  \"name\": \"example\"\n}"
        );
        assert_eq!(format_rdap_body(b"not json").0, "not json");
    }

    #[test]
    fn caps_pretty_printed_json_without_splitting_utf8() {
        let oversized = format!("{{\"value\":\"{}\"}}", "界".repeat(MAX_RAW));
        let (display, truncated) = cap_display_text(oversized);
        assert!(truncated);
        assert!(display.len() <= MAX_RAW);
        assert!(display.is_char_boundary(display.len()));
    }
}
