//! Globalping remote measurements and built-in location helpers.

use super::types::{
    GlobalpingHttpResult, GlobalpingPingResult, GlobalpingPingSample, MultiNodeDnsResult,
    NodeDnsAnswer, ProbeNode,
};
use crate::error::{AppError, AppResult};
use reqwest::header::{HeaderValue, ACCEPT_ENCODING, ETAG, IF_NONE_MATCH};
use reqwest::redirect::Policy;
use reqwest::{Client, RequestBuilder, StatusCode};
use serde::Deserialize;
use serde_json::Value;
use std::net::IpAddr;
use std::time::{Duration, Instant};
use url::{Host, Url};
use zeroize::Zeroizing;

const GP_API: &str = "https://api.globalping.io/v1/measurements";
const GP_KEYRING_SERVICE: &str = "bench.network-probe.globalping";
const GP_KEYRING_ACCOUNT: &str = "api-token.v1";
const GP_MAX_RESPONSE_BYTES: usize = 256 * 1024;
const GP_TOTAL_TIMEOUT: Duration = Duration::from_secs(45);
const GP_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const GP_POLL_INTERVAL: Duration = Duration::from_millis(700);

fn invalid_target() -> AppError {
    AppError::new(
        "GP_TARGET_INVALID",
        "Use a public host or IP without URL credentials or fragments.",
    )
}

pub fn list_nodes_with_agents(agents: &[ProbeNode]) -> Vec<ProbeNode> {
    let mut nodes = vec![ProbeNode {
        id: "local".into(),
        kind: "local".into(),
        label: "This Mac".into(),
        reachable: true,
        endpoint: None,
        region: None,
        capabilities: None,
    }];
    for (id, label, magic) in [
        ("gp-world", "Globalping · world", "world"),
        ("gp-us", "Globalping · US", "US"),
        ("gp-eu", "Globalping · EU", "Europe"),
        ("gp-asia", "Globalping · Asia", "Asia"),
    ] {
        nodes.push(ProbeNode {
            id: id.into(),
            kind: "remote-proxy".into(),
            label: label.into(),
            reachable: true,
            endpoint: Some(format!("globalping:{magic}")),
            region: Some(magic.into()),
            capabilities: Some(vec!["dns".into(), "ping".into(), "http".into()]),
        });
    }
    nodes.extend(agents.iter().cloned());
    nodes
}

#[derive(Debug, Deserialize)]
struct GpCreate {
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GpResult {
    #[serde(default)]
    status: String,
    #[serde(default)]
    results: Vec<GpProbeResult>,
}

#[derive(Debug, Deserialize)]
struct GpProbeResult {
    #[serde(default)]
    result: Value,
    #[serde(default)]
    probe: GpProbeMeta,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GpProbeMeta {
    #[serde(default)]
    city: Option<String>,
    #[serde(default)]
    country: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GpDnsResult {
    #[serde(default)]
    status: String,
    #[serde(default)]
    answers: Vec<GpAnswer>,
    #[serde(default)]
    raw_output: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GpAnswer {
    #[serde(default)]
    value: String,
    #[serde(rename = "type", default)]
    rr_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GpPingData {
    status: String,
    resolved_address: Option<String>,
    stats: GpPingStats,
    #[serde(default)]
    timings: Vec<GpPingTiming>,
}

#[derive(Debug, Deserialize)]
struct GpPingStats {
    min: Option<f64>,
    avg: Option<f64>,
    max: Option<f64>,
    total: u32,
    rcv: u32,
    loss: f64,
}

#[derive(Debug, Deserialize)]
struct GpPingTiming {
    rtt: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GpHttpData {
    status: String,
    resolved_address: Option<String>,
    status_code: Option<u16>,
    timings: Option<GpHttpTimings>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GpHttpTimings {
    first_byte: Option<f64>,
}

fn client() -> AppResult<Client> {
    Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(GP_REQUEST_TIMEOUT)
        .redirect(Policy::none())
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|_| AppError::new("GP_CLIENT", "Could not initialize the Globalping client."))
}

fn token_entry() -> AppResult<keyring::Entry> {
    keyring::Entry::new(GP_KEYRING_SERVICE, GP_KEYRING_ACCOUNT).map_err(|_| {
        AppError::new(
            "GP_CREDENTIAL_STORE",
            "The credential store is unavailable.",
        )
    })
}

fn read_token_from_keyring() -> AppResult<Option<String>> {
    match token_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(AppError::new(
            "GP_CREDENTIAL_STORE",
            "The Globalping token could not be read from the credential store.",
        )),
    }
}

async fn load_token() -> AppResult<Option<Zeroizing<String>>> {
    let token = tokio::task::spawn_blocking(read_token_from_keyring)
        .await
        .map_err(|_| AppError::task_failed("Could not read the Globalping credential."))??;
    Ok(token.map(Zeroizing::new))
}

pub async fn token_is_configured() -> AppResult<bool> {
    Ok(load_token().await?.is_some())
}

pub async fn save_token(token: String) -> AppResult<()> {
    let input = Zeroizing::new(token);
    let token = Zeroizing::new(input.trim().to_string());
    if token.is_empty()
        || token.len() > 4096
        || !token
            .bytes()
            .all(|byte| (0x21..=0x7e).contains(&byte) && byte != b'"' && byte != b'\\')
    {
        return Err(AppError::new(
            "GP_TOKEN_INVALID",
            "Enter a valid Globalping access token.",
        ));
    }
    let token = Zeroizing::new(token);
    tokio::task::spawn_blocking(move || {
        token_entry()?.set_password(token.as_str()).map_err(|_| {
            AppError::new(
                "GP_CREDENTIAL_STORE",
                "The Globalping token could not be saved to the credential store.",
            )
        })
    })
    .await
    .map_err(|_| AppError::task_failed("Could not save the Globalping credential."))??;
    Ok(())
}

pub async fn delete_token() -> AppResult<()> {
    tokio::task::spawn_blocking(|| match token_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(AppError::new(
            "GP_CREDENTIAL_STORE",
            "The Globalping token could not be removed from the credential store.",
        )),
    })
    .await
    .map_err(|_| AppError::task_failed("Could not remove the Globalping credential."))??;
    Ok(())
}

fn with_auth(request: RequestBuilder, token: Option<&str>) -> RequestBuilder {
    match token {
        Some(token) => request.bearer_auth(token),
        None => request,
    }
}

fn api_error(status: StatusCode, retry_after: Option<&HeaderValue>) -> AppError {
    if status == StatusCode::TOO_MANY_REQUESTS {
        let retry_detail = retry_after
            .and_then(|value| value.to_str().ok())
            .map(|value| format!(" Retry-After: {value}."))
            .unwrap_or_default();
        return AppError::new(
            "GP_RATE_LIMITED",
            format!("Globalping rate limit reached.{retry_detail}"),
        );
    }
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return AppError::new(
            "GP_AUTH_FAILED",
            "Globalping rejected the configured access token.",
        );
    }
    AppError::new(
        "GP_REQUEST_FAILED",
        format!("Globalping returned HTTP {}.", status.as_u16()),
    )
}

async fn create_and_poll(body: Value, token: Option<&str>) -> AppResult<GpResult> {
    let client = client()?;
    let deadline = tokio::time::Instant::now() + GP_TOTAL_TIMEOUT;
    let create_response = tokio::time::timeout_at(
        deadline,
        with_auth(
            client
                .post(GP_API)
                .header(ACCEPT_ENCODING, "br")
                .json(&body),
            token,
        )
        .send(),
    )
    .await
    .map_err(|_| AppError::new("GP_TIMEOUT", "Globalping measurement timed out."))?
    .map_err(|_| AppError::new("GP_REQUEST_FAILED", "Could not reach Globalping."))?;
    if !create_response.status().is_success() {
        return Err(api_error(
            create_response.status(),
            create_response.headers().get("retry-after"),
        ));
    }
    let response = tokio::time::timeout_at(
        deadline,
        super::bounded_http::read_response_body_limited(create_response, GP_MAX_RESPONSE_BYTES),
    )
    .await
    .map_err(|_| AppError::new("GP_TIMEOUT", "Globalping measurement timed out."))?
    .map_err(|_| AppError::new("GP_READ", "Could not read the Globalping response."))?;
    if response.truncated {
        return Err(AppError::new(
            "GP_RESPONSE_TOO_LARGE",
            "Globalping returned a response that exceeded the safety limit.",
        ));
    }
    let created: GpCreate = serde_json::from_slice(&response.bytes)
        .map_err(|_| AppError::new("GP_PARSE", "Globalping returned an invalid response."))?;
    if created.id.is_empty() || created.id.len() > 128 {
        return Err(AppError::new(
            "GP_PARSE",
            "Globalping returned an invalid measurement ID.",
        ));
    }

    let poll_url = measurement_url(&created.id)?;
    let mut etag: Option<HeaderValue> = None;
    loop {
        let now = tokio::time::Instant::now();
        if now >= deadline {
            break;
        }
        tokio::time::sleep(GP_POLL_INTERVAL.min(deadline.saturating_duration_since(now))).await;
        if tokio::time::Instant::now() >= deadline {
            break;
        }

        let mut request = client.get(poll_url.clone()).header(ACCEPT_ENCODING, "br");
        if let Some(etag) = etag.as_ref() {
            request = request.header(IF_NONE_MATCH, etag.clone());
        }
        let response = tokio::time::timeout_at(deadline, with_auth(request, token).send())
            .await
            .map_err(|_| AppError::new("GP_TIMEOUT", "Globalping measurement timed out."))?
            .map_err(|_| AppError::new("GP_REQUEST_FAILED", "Could not reach Globalping."))?;
        if response.status() == StatusCode::NOT_MODIFIED {
            continue;
        }
        if !response.status().is_success() {
            return Err(api_error(
                response.status(),
                response.headers().get("retry-after"),
            ));
        }
        if let Some(value) = response.headers().get(ETAG) {
            etag = Some(value.clone());
        }
        let response = tokio::time::timeout_at(
            deadline,
            super::bounded_http::read_response_body_limited(response, GP_MAX_RESPONSE_BYTES),
        )
        .await
        .map_err(|_| AppError::new("GP_TIMEOUT", "Globalping measurement timed out."))?
        .map_err(|_| AppError::new("GP_READ", "Could not read the Globalping response."))?;
        if response.truncated {
            return Err(AppError::new(
                "GP_RESPONSE_TOO_LARGE",
                "Globalping returned a response that exceeded the safety limit.",
            ));
        }
        let parsed: GpResult = serde_json::from_slice(&response.bytes)
            .map_err(|_| AppError::new("GP_PARSE", "Globalping returned an invalid response."))?;
        if parsed.status != "in-progress" {
            return Ok(parsed);
        }
    }
    Err(AppError::new(
        "GP_TIMEOUT",
        "Globalping measurement did not finish within the polling window.",
    ))
}

fn measurement_url(id: &str) -> AppResult<Url> {
    let mut url = Url::parse(GP_API)
        .map_err(|_| AppError::new("GP_URL", "Globalping endpoint is invalid."))?;
    url.path_segments_mut()
        .map_err(|_| AppError::new("GP_URL", "Globalping endpoint cannot accept path segments"))?
        .push(id);
    Ok(url)
}

fn validated_location(location: &str) -> AppResult<&'static str> {
    match location {
        "world" => Ok("world"),
        "US" => Ok("US"),
        "Europe" => Ok("Europe"),
        "Asia" => Ok("Asia"),
        _ => Err(AppError::invalid_input(
            "Choose one of the built-in Globalping locations.",
        )),
    }
}

fn is_non_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_unspecified()
                || ip.is_multicast()
                || [
                    "100.64.0.0/10",
                    "192.0.0.0/24",
                    "192.0.2.0/24",
                    "192.88.99.0/24",
                    "198.18.0.0/15",
                    "198.51.100.0/24",
                    "203.0.113.0/24",
                    "240.0.0.0/4",
                ]
                .iter()
                .any(|range| {
                    range
                        .parse::<ipnet::Ipv4Net>()
                        .is_ok_and(|net| net.contains(&ip))
                })
        }
        IpAddr::V6(ip) => {
            ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_unique_local()
                || ip.is_unicast_link_local()
                || ip.is_multicast()
                || ip.to_ipv4_mapped().is_some()
                || ["2001:db8::/32"].iter().any(|range| {
                    range
                        .parse::<ipnet::Ipv6Net>()
                        .is_ok_and(|net| net.contains(&ip))
                })
        }
    }
}

fn validate_public_host(host: &str) -> AppResult<()> {
    if host.is_empty() || host.len() > 253 {
        return Err(invalid_target());
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_non_public_ip(ip) {
            return Err(invalid_target());
        }
        return Ok(());
    }
    let canonical = host.trim_end_matches('.').to_ascii_lowercase();
    if !canonical.contains('.')
        || canonical == "localhost"
        || canonical.ends_with(".localhost")
        || canonical.ends_with(".local")
        || canonical.ends_with(".internal")
        || canonical.ends_with(".lan")
        || canonical.ends_with(".home.arpa")
        || [".test", ".example", ".invalid"]
            .iter()
            .any(|suffix| canonical.ends_with(suffix))
    {
        return Err(invalid_target());
    }
    super::validate::validate_host(host).map_err(|_| invalid_target())
}

fn validate_ping_target(target: &str) -> AppResult<String> {
    let target = target.trim();
    if target.is_empty() || target.len() > 253 || target.contains('/') {
        return Err(invalid_target());
    }
    let bracketed = target.starts_with('[') || target.ends_with(']');
    let host = if bracketed {
        target
            .strip_prefix('[')
            .and_then(|value| value.strip_suffix(']'))
            .ok_or_else(invalid_target)?
    } else {
        target
    };
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_non_public_ip(ip) || (bracketed && !matches!(ip, IpAddr::V6(_))) {
            return Err(invalid_target());
        }
        return Ok(ip.to_string());
    }
    if bracketed || target.contains(':') {
        return Err(invalid_target());
    }
    validate_public_host(host)?;
    Ok(host.to_string())
}

#[derive(Debug)]
struct ParsedHttpTarget {
    target: String,
    protocol: &'static str,
    port: u16,
    path: String,
    query: Option<String>,
    display_url: String,
}

fn http_measurement_body(target: &ParsedHttpTarget, location: &str) -> Value {
    let mut request = serde_json::json!({
        "path": target.path,
        "method": "GET"
    });
    if let Some(query) = target.query.as_ref() {
        request["query"] = serde_json::json!(query);
    }
    serde_json::json!({
        "type": "http",
        "target": target.target,
        "locations": [{ "magic": location, "limit": 1 }],
        "measurementOptions": {
            "protocol": target.protocol,
            "port": target.port,
            "request": request
        },
        "inProgressUpdates": true,
        "timeout": 20
    })
}

fn parse_http_target(input: &str) -> AppResult<ParsedHttpTarget> {
    let input = input.trim();
    if input.is_empty() || input.len() > 2048 {
        return Err(invalid_target());
    }
    let candidate = if input.starts_with("http://") || input.starts_with("https://") {
        input.to_string()
    } else if input.contains("://") {
        return Err(invalid_target());
    } else {
        format!("https://{input}")
    };
    let url = Url::parse(&candidate).map_err(|_| invalid_target())?;
    let protocol = match url.scheme() {
        "http" => "HTTP",
        "https" => "HTTPS",
        _ => return Err(invalid_target()),
    };
    let authority = candidate
        .split_once("://")
        .map(|(_, rest)| rest.split(['/', '?', '#']).next().unwrap_or_default())
        .unwrap_or_default();
    if authority.contains('@')
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err(invalid_target());
    }
    let host = match url.host() {
        Some(Host::Domain(host)) => host.to_string(),
        Some(Host::Ipv4(ip)) => ip.to_string(),
        Some(Host::Ipv6(ip)) => ip.to_string(),
        None => return Err(invalid_target()),
    };
    validate_public_host(&host)?;
    let port = url
        .port_or_known_default()
        .filter(|port| *port > 0)
        .ok_or_else(invalid_target)?;
    let has_query = url.query().is_some();
    let mut display_url = url.clone();
    display_url.set_query(None);
    display_url.set_fragment(None);
    let display_url = if has_query {
        format!("{}?…", display_url)
    } else {
        display_url.to_string()
    };
    Ok(ParsedHttpTarget {
        target: host,
        protocol,
        port,
        path: if url.path().is_empty() {
            "/".into()
        } else {
            url.path().into()
        },
        query: url.query().map(ToOwned::to_owned),
        display_url,
    })
}

fn probe_location(probe: GpProbeMeta) -> (Option<String>, Option<String>) {
    (probe.city, probe.country)
}

pub async fn run_ping(
    target: String,
    packets: u32,
    location: String,
) -> AppResult<GlobalpingPingResult> {
    let target = validate_ping_target(&target)?;
    if !(1..=16).contains(&packets) {
        return Err(AppError::new(
            "GP_PACKET_COUNT_INVALID",
            "Globalping ping supports between 1 and 16 packets.",
        ));
    }
    let location = validated_location(&location)?;
    let token = load_token().await?;
    let body = serde_json::json!({
        "type": "ping",
        "target": target,
        "locations": [{ "magic": location, "limit": 1 }],
        "measurementOptions": { "packets": packets },
        "inProgressUpdates": true,
        "timeout": 20
    });
    let result = create_and_poll(body, token.as_deref().map(String::as_str)).await?;
    let probe = result
        .results
        .into_iter()
        .next()
        .ok_or_else(|| AppError::new("GP_NO_PROBES", "No Globalping probe was available."))?;
    let data: GpPingData = serde_json::from_value(probe.result)
        .map_err(|_| AppError::new("GP_PARSE", "Globalping returned an invalid ping result."))?;
    if data.status != "finished" {
        return Err(AppError::new(
            "GP_PROBE_FAILED",
            "The selected Globalping probe could not finish the ping measurement.",
        ));
    }
    let (probe_city, probe_country) = probe_location(probe.probe);
    let command_hint = format!("globalpingPing('{target}', {packets}, '{location}')");
    Ok(GlobalpingPingResult {
        target,
        location: location.into(),
        probe_city,
        probe_country,
        resolved_address: data.resolved_address,
        packets_sent: data.stats.total,
        packets_received: data.stats.rcv,
        loss_percent: data.stats.loss,
        min_rtt_ms: data.stats.min,
        avg_rtt_ms: data.stats.avg,
        max_rtt_ms: data.stats.max,
        samples: data
            .timings
            .into_iter()
            .enumerate()
            .map(|(index, timing)| GlobalpingPingSample {
                seq: (index + 1) as u32,
                rtt_ms: timing.rtt,
            })
            .collect(),
        command_hint,
    })
}

pub async fn run_http(input: String, location: String) -> AppResult<GlobalpingHttpResult> {
    let parsed_target = parse_http_target(&input)?;
    let location = validated_location(&location)?;
    let token = load_token().await?;
    let body = http_measurement_body(&parsed_target, location);
    let result = create_and_poll(body, token.as_deref().map(String::as_str)).await?;
    let probe = result
        .results
        .into_iter()
        .next()
        .ok_or_else(|| AppError::new("GP_NO_PROBES", "No Globalping probe was available."))?;
    let data: GpHttpData = serde_json::from_value(probe.result)
        .map_err(|_| AppError::new("GP_PARSE", "Globalping returned an invalid HTTP result."))?;
    let (probe_city, probe_country) = probe_location(probe.probe);
    let command_hint = format!(
        "globalpingHttp('{location}', '{}')",
        parsed_target.display_url
    );
    Ok(GlobalpingHttpResult {
        target: parsed_target.display_url,
        location: location.into(),
        probe_city,
        probe_country,
        resolved_address: data.resolved_address,
        status_code: if data.status == "finished" {
            data.status_code
        } else {
            None
        },
        ttfb_ms: data.timings.and_then(|timings| timings.first_byte),
        measurement_status: data.status,
        command_hint,
    })
}

pub async fn compare_dns_multi(
    domain: String,
    location_magics: Vec<String>,
) -> AppResult<MultiNodeDnsResult> {
    super::validate::validate_host(&domain)?;
    let started = Instant::now();
    let magics = if location_magics.is_empty() {
        vec!["world".to_string()]
    } else {
        location_magics.into_iter().take(3).collect()
    };
    let magics = magics
        .iter()
        .map(|location| validated_location(location).map(str::to_string))
        .collect::<AppResult<Vec<_>>>()?;
    let command_hint =
        format!("dnsLookup(multi, '{domain}') // via globalping locations={magics:?}");

    let mut answers = Vec::new();
    match super::dns::dns_lookup(domain.clone(), Some("A".into()), None).await {
        Ok(res) => {
            let vals: Vec<String> = res.records.into_iter().map(|r| r.data).collect();
            answers.push(NodeDnsAnswer {
                node_id: "local".into(),
                node_label: "This Mac".into(),
                ok: true,
                answers: vals,
                detail: None,
            });
        }
        Err(e) => answers.push(NodeDnsAnswer {
            node_id: "local".into(),
            node_label: "This Mac".into(),
            ok: false,
            answers: vec![],
            detail: Some(e.to_string()),
        }),
    }

    let token = load_token().await?;
    let locations: Vec<Value> = magics
        .iter()
        .map(|magic| serde_json::json!({ "magic": magic, "limit": 1 }))
        .collect();
    let body = serde_json::json!({
        "type": "dns",
        "target": domain,
        "locations": locations,
        "measurementOptions": { "query": { "type": "A" } },
        "inProgressUpdates": true,
        "timeout": 20
    });
    match create_and_poll(body, token.as_deref().map(String::as_str)).await {
        Ok(result) => {
            for (index, probe) in result.results.into_iter().enumerate() {
                let label = format!(
                    "Globalping · {}/{}",
                    probe.probe.city.as_deref().unwrap_or("?"),
                    probe.probe.country.as_deref().unwrap_or("?")
                );
                let parsed = serde_json::from_value::<GpDnsResult>(probe.result).ok();
                let vals = parsed
                    .as_ref()
                    .map(|result| {
                        result
                            .answers
                            .iter()
                            .map(|answer| {
                                if answer.rr_type.is_empty() {
                                    answer.value.clone()
                                } else {
                                    format!("{} {}", answer.rr_type, answer.value)
                                }
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                let ok = parsed
                    .as_ref()
                    .is_some_and(|result| result.status == "finished");
                answers.push(NodeDnsAnswer {
                    node_id: format!("gp-{index}"),
                    node_label: label,
                    ok,
                    answers: vals,
                    detail: parsed
                        .and_then(|result| result.raw_output)
                        .map(|value| value.chars().take(16_384).collect()),
                });
            }
            if !answers
                .iter()
                .any(|answer| answer.node_id.starts_with("gp-"))
            {
                answers.push(NodeDnsAnswer {
                    node_id: "globalping".into(),
                    node_label: "Globalping".into(),
                    ok: false,
                    answers: vec![],
                    detail: Some("No Globalping probe was available.".into()),
                });
            }
        }
        Err(error) => answers.push(NodeDnsAnswer {
            node_id: "globalping".into(),
            node_label: "Globalping".into(),
            ok: false,
            answers: vec![],
            detail: Some(error.to_string()),
        }),
    }

    Ok(MultiNodeDnsResult {
        domain,
        answers,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn measurement_id_is_encoded_as_a_single_path_segment() {
        let url = measurement_url("id/with?reserved#characters").unwrap();

        assert!(url.as_str().ends_with("/id%2Fwith%3Freserved%23characters"));
        assert_eq!(url.path_segments().unwrap().count(), 3);
    }

    #[test]
    fn remote_ping_accepts_public_hosts_and_rejects_private_targets() {
        assert_eq!(validate_ping_target("1.1.1.1").unwrap(), "1.1.1.1");
        assert_eq!(validate_ping_target("example.com").unwrap(), "example.com");
        assert!(validate_ping_target("127.0.0.1").is_err());
        assert!(validate_ping_target("192.168.1.10").is_err());
        assert!(validate_ping_target("printer.local").is_err());
    }

    #[test]
    fn remote_http_rejects_credentials_fragments_and_private_targets() {
        for input in [
            "https://user:secret@example.com/",
            "https://@example.com/",
            "https://example.com/#section",
            "http://127.0.0.1/",
            "ftp://example.com/",
        ] {
            assert_eq!(
                parse_http_target(input).unwrap_err().code,
                "GP_TARGET_INVALID"
            );
        }
    }

    #[test]
    fn remote_http_preserves_query_for_measurement_but_redacts_it_from_display() {
        let parsed = parse_http_target("https://example.com/health?token=secret").unwrap();

        assert_eq!(parsed.target, "example.com");
        assert_eq!(parsed.protocol, "HTTPS");
        assert_eq!(parsed.port, 443);
        assert_eq!(parsed.path, "/health");
        assert_eq!(parsed.query.as_deref(), Some("token=secret"));
        assert_eq!(parsed.display_url, "https://example.com/health?…");

        let no_query = parse_http_target("https://example.com/health").unwrap();
        assert_eq!(no_query.display_url, "https://example.com/health");
    }

    #[test]
    fn http_measurement_omits_absent_query_and_preserves_present_query() {
        let without_query = parse_http_target("https://example.com/health").unwrap();
        let body = http_measurement_body(&without_query, "world");
        assert!(body["measurementOptions"]["request"].get("query").is_none());

        let with_query = parse_http_target("https://example.com/health?status=ready").unwrap();
        let body = http_measurement_body(&with_query, "world");
        assert_eq!(
            body["measurementOptions"]["request"]["query"],
            "status=ready"
        );
    }

    #[test]
    fn location_is_allowlisted() {
        assert_eq!(validated_location("Europe").unwrap(), "Europe");
        assert!(validated_location("world+limit=500").is_err());
    }
}
