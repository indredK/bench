//! Globalping remote DNS compare (S-DIS-04) + node listing helpers.

use super::types::{
    GlobalpingHttpStats, GlobalpingMeasurementResult, GlobalpingPingStats, GlobalpingProbeResult,
    GlobalpingQuota, MultiNodeDnsResult, NodeDnsAnswer, ProbeNode,
};
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::time::{Duration, Instant};
use url::{Host, Url};
use zeroize::Zeroizing;

const GP_API: &str = "https://api.globalping.io/v1/measurements";
const GP_CREATE_TIMEOUT: Duration = Duration::from_secs(10);
const GP_POLL_INTERVAL: Duration = Duration::from_millis(700);
const GP_POLL_TIMEOUT: Duration = Duration::from_secs(45);
const GP_TOKEN_ACCOUNT: &str = "api-token.v1";

fn token_entry(app_identifier: &str) -> AppResult<keyring::Entry> {
    if app_identifier.is_empty()
        || app_identifier.len() > 128
        || !app_identifier
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_'))
    {
        return Err(AppError::invalid_input("Invalid application identifier."));
    }
    keyring::Entry::new(
        &format!("bench.globalping.{app_identifier}"),
        GP_TOKEN_ACCOUNT,
    )
    .map_err(|_| AppError::internal("Unable to access secure token storage."))
}

fn read_token_blocking(app_identifier: &str) -> AppResult<Option<Zeroizing<String>>> {
    let entry = token_entry(app_identifier)?;
    match entry.get_password() {
        Ok(token) => Ok(Some(Zeroizing::new(token))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(AppError::internal("Unable to access secure token storage.")),
    }
}

pub async fn token_configured(app_identifier: String) -> AppResult<bool> {
    tokio::task::spawn_blocking(move || {
        read_token_blocking(&app_identifier).map(|token| token.is_some())
    })
    .await
    .map_err(|_| AppError::task_failed("Secure token storage task failed."))?
}

pub async fn save_token(app_identifier: String, token: String) -> AppResult<()> {
    let token = normalize_token(token)?;
    tokio::task::spawn_blocking(move || {
        let entry = token_entry(&app_identifier)?;
        entry
            .set_password(token.as_str())
            .map_err(|_| AppError::internal("Unable to save token to secure storage."))
    })
    .await
    .map_err(|_| AppError::task_failed("Secure token storage task failed."))?
}

fn normalize_token(token: String) -> AppResult<Zeroizing<String>> {
    let mut token = Zeroizing::new(token);
    let leading_whitespace_bytes = token.len() - token.trim_start().len();
    token.drain(..leading_whitespace_bytes);
    let trimmed_length = token.trim_end().len();
    token.truncate(trimmed_length);
    if token.is_empty() || token.len() > 4096 || token.chars().any(char::is_control) {
        return Err(AppError::invalid_input("Invalid Globalping token."));
    }
    Ok(token)
}

pub async fn remove_token(app_identifier: String) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        let entry = token_entry(&app_identifier)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(AppError::internal(
                "Unable to remove token from secure storage.",
            )),
        }
    })
    .await
    .map_err(|_| AppError::task_failed("Secure token storage task failed."))?
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum MeasurementKind {
    Ping,
    Http,
}

impl MeasurementKind {
    fn parse(kind: &str) -> AppResult<Self> {
        match kind {
            "ping" => Ok(Self::Ping),
            "http" => Ok(Self::Http),
            _ => Err(AppError::invalid_input(
                "Unsupported Globalping measurement type.",
            )),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Ping => "ping",
            Self::Http => "http",
        }
    }
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_public_ipv4(ip),
        IpAddr::V6(ip) => is_public_ipv6(ip),
    }
}

fn is_public_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_unspecified()
        || a == 0
        || a >= 224
        || (a == 100 && (b & 0xc0) == 64) // carrier-grade NAT, 100.64.0.0/10
        || (a == 169 && b == 254)
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2) // TEST-NET-1
        || (a == 192 && b == 88 && c == 99) // deprecated 6to4 relay
        || (a == 198 && (b == 18 || b == 19)) // benchmarking
        || (a == 198 && b == 51 && c == 100) // TEST-NET-2
        || (a == 203 && b == 0 && c == 113)) // TEST-NET-3
}

fn is_public_ipv6(ip: Ipv6Addr) -> bool {
    let segments = ip.segments();
    let is_global_unicast = segments[0] & 0xe000 == 0x2000; // 2000::/3
    let is_special_registry = segments[0] == 0x2001 && segments[1] & 0xfe00 == 0;
    let is_documentation = (segments[0] == 0x2001 && segments[1] == 0x0db8)
        || (segments[0] == 0x3fff && segments[1] & 0xf000 == 0);
    let is_ipv4_mapped = ip.to_ipv4_mapped().is_some();
    is_global_unicast
        && !is_special_registry
        && !is_documentation
        && !ip.is_loopback()
        && !ip.is_unspecified()
        && !ip.is_unicast_link_local()
        && !ip.is_unique_local()
        && !ip.is_multicast()
        && !is_ipv4_mapped
}

fn validate_public_host(host: &str) -> AppResult<()> {
    if let Ok(ip) = host.parse::<IpAddr>() {
        return if is_public_ip(ip) {
            Ok(())
        } else {
            Err(AppError::invalid_input(
                "Globalping only accepts public network targets.",
            ))
        };
    }

    let normalized = host.trim_end_matches('.').to_ascii_lowercase();
    let blocked_suffixes = [
        ".localhost",
        ".local",
        ".lan",
        ".internal",
        ".home",
        ".home.arpa",
        ".test",
        ".invalid",
        ".onion",
    ];
    if !normalized.contains('.')
        || normalized.len() > 253
        || blocked_suffixes
            .iter()
            .any(|suffix| normalized.ends_with(suffix))
        || matches!(normalized.as_str(), "localhost" | "local" | "internal")
        || normalized.split('.').any(|label| {
            label.is_empty()
                || label.len() > 63
                || label.starts_with('-')
                || label.ends_with('-')
                || !label
                    .bytes()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == b'-')
        })
    {
        return Err(AppError::invalid_input(
            "Enter a public host name or public IP address.",
        ));
    }
    Ok(())
}

fn normalize_target(kind: MeasurementKind, target: &str) -> AppResult<String> {
    let target = target.trim();
    if target.is_empty() || target.len() > 2048 || target.chars().any(char::is_control) {
        return Err(AppError::invalid_input("Invalid Globalping target."));
    }

    match kind {
        MeasurementKind::Ping => {
            if let Ok(ip) = target.parse::<IpAddr>() {
                return if is_public_ip(ip) {
                    Ok(ip.to_string())
                } else {
                    Err(AppError::invalid_input(
                        "Globalping only accepts public network targets.",
                    ))
                };
            }
            let parsed = if target.contains("://") {
                Url::parse(target)
            } else {
                Url::parse(&format!("http://{target}"))
            }
            .map_err(|_| AppError::invalid_input("Enter a host name or IP address for Ping."))?;
            if !matches!(parsed.scheme(), "http" | "https")
                || parsed.path() != "/"
                || parsed.query().is_some()
                || parsed.fragment().is_some()
                || !parsed.username().is_empty()
                || parsed.password().is_some()
                || parsed.port().is_some()
            {
                return Err(AppError::invalid_input(
                    "Ping accepts only a host name or IP address, without a port or path.",
                ));
            }
            let host = parsed
                .host_str()
                .ok_or_else(|| AppError::invalid_input("Enter a valid Ping target."))?;
            validate_public_host(host)?;
            Ok(host.to_owned())
        }
        MeasurementKind::Http => {
            let raw_url = if target.contains("://") {
                target.to_owned()
            } else {
                format!("https://{target}")
            };
            let parsed = Url::parse(&raw_url)
                .map_err(|_| AppError::invalid_input("Enter a valid HTTP or HTTPS URL."))?;
            if !matches!(parsed.scheme(), "http" | "https")
                || !parsed.username().is_empty()
                || parsed.password().is_some()
                || parsed.fragment().is_some()
            {
                return Err(AppError::invalid_input(
                    "Globalping HTTP requires a public HTTP(S) URL without credentials or a fragment.",
                ));
            }
            let host = parsed
                .host_str()
                .ok_or_else(|| AppError::invalid_input("Enter a valid public URL."))?;
            validate_public_host(host)?;
            Ok(parsed.to_string())
        }
    }
}

#[derive(Debug, Eq, PartialEq)]
struct GlobalpingHttpTarget {
    target: String,
    protocol: &'static str,
    path: String,
    query: Option<String>,
    port: Option<u16>,
}

fn globalping_http_target(url: &str) -> AppResult<GlobalpingHttpTarget> {
    let parsed =
        Url::parse(url).map_err(|_| AppError::invalid_input("Enter a valid HTTP or HTTPS URL."))?;
    let target = match parsed.host() {
        Some(Host::Domain(host)) => host.to_owned(),
        Some(Host::Ipv4(host)) => host.to_string(),
        Some(Host::Ipv6(host)) => host.to_string(),
        None => return Err(AppError::invalid_input("Enter a valid public URL.")),
    };
    Ok(GlobalpingHttpTarget {
        target,
        protocol: if parsed.scheme() == "http" {
            "HTTP"
        } else {
            "HTTPS"
        },
        path: parsed.path().to_owned(),
        query: parsed.query().map(str::to_owned),
        port: parsed.port(),
    })
}

fn measurement_request_body(
    kind: MeasurementKind,
    display_target: &str,
    http_target: Option<&GlobalpingHttpTarget>,
    method: Option<&str>,
    locations: Vec<serde_json::Value>,
) -> serde_json::Value {
    let api_target = http_target
        .map(|http_target| http_target.target.as_str())
        .unwrap_or(display_target);
    let mut body = serde_json::json!({
        "type": kind.as_str(),
        "target": api_target,
        "locations": locations,
        "timeout": 30,
        "inProgressUpdates": true
    });
    if let (Some(method), Some(http_target)) = (method, http_target) {
        let mut request = serde_json::Map::new();
        request.insert("method".into(), serde_json::json!(method));
        request.insert("path".into(), serde_json::json!(http_target.path));
        if let Some(query) = &http_target.query {
            request.insert("query".into(), serde_json::json!(query));
        }
        let mut options = serde_json::json!({
            "protocol": http_target.protocol,
            "request": request
        });
        if let Some(port) = http_target.port {
            options["port"] = serde_json::json!(port);
        }
        body["measurementOptions"] = options;
    }
    body
}

fn failure_code_for_status(status: reqwest::StatusCode) -> &'static str {
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        "invalid_token"
    } else if status.is_client_error() {
        "invalid_request"
    } else if status.is_server_error() {
        "service_error"
    } else {
        "http_error"
    }
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
    // Built-in Globalping location presets (anonymous quota).
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
    for a in agents {
        nodes.push(a.clone());
    }
    nodes
}

#[derive(Debug, Deserialize)]
struct GpCreate {
    id: String,
    #[serde(default, rename = "probesCount")]
    probes_count: u32,
}

fn valid_measurement_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .bytes()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, b'-' | b'_'))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GpResult {
    #[serde(default)]
    status: String,
    #[serde(default)]
    probes_count: u32,
    #[serde(default)]
    results: Vec<GpProbeResult>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GpPingStats {
    min: Option<f64>,
    avg: Option<f64>,
    max: Option<f64>,
    total: Option<u32>,
    rcv: Option<u32>,
    loss: Option<f64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GpHttpTimings {
    total: Option<f64>,
    dns: Option<f64>,
    tcp: Option<f64>,
    tls: Option<f64>,
    first_byte: Option<f64>,
    download: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum GpMeasurementTimings {
    Http(GpHttpTimings),
    Ping(Vec<serde_json::Value>),
}

struct GpPollOutcome {
    result: Option<GpResult>,
    failure: Option<String>,
    failure_code: Option<String>,
}

enum GpPollError {
    RateLimited,
    Http(reqwest::StatusCode),
    Request(String),
    Parse(String),
}

async fn poll_measurement(
    client: &reqwest::Client,
    url: &str,
    bearer_token: Option<&str>,
    timeout: Duration,
    interval: Duration,
) -> GpPollOutcome {
    let deadline = tokio::time::Instant::now() + timeout;
    let mut latest_result = None;
    let mut last_request_error = None;
    let mut etag: Option<String> = None;

    loop {
        let next_poll = tokio::time::Instant::now() + interval;
        if next_poll >= deadline {
            tokio::time::sleep_until(deadline).await;
            break;
        }
        tokio::time::sleep_until(next_poll).await;

        let response = tokio::time::timeout_at(deadline, async {
            let mut request = client.get(url);
            if let Some(etag) = &etag {
                request = request.header(reqwest::header::IF_NONE_MATCH, etag);
            }
            if let Some(token) = bearer_token {
                request = request.bearer_auth(token);
            }
            let response = request
                .send()
                .await
                .map_err(|e| GpPollError::Request(e.to_string()))?;
            let status = response.status();
            if status == reqwest::StatusCode::NOT_MODIFIED {
                return Ok(None);
            }
            if status.as_u16() == 429 {
                return Err(GpPollError::RateLimited);
            }
            if !status.is_success() {
                return Err(GpPollError::Http(status));
            }
            let response_etag = response
                .headers()
                .get(reqwest::header::ETAG)
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned);
            let result = response
                .json::<GpResult>()
                .await
                .map_err(|e| GpPollError::Parse(e.to_string()))?;
            Ok(Some((response_etag, result)))
        })
        .await;

        match response {
            Err(_) => break,
            Ok(Ok(None)) => {
                last_request_error = None;
            }
            Ok(Ok(Some((_response_etag, result)))) if result.status != "in-progress" => {
                let failure_code = (result.status != "finished").then(|| "terminal_failure".into());
                let failure = if result.status == "finished" {
                    result
                        .results
                        .is_empty()
                        .then(|| "Globalping finished without probe results.".into())
                } else {
                    let status = if result.status.is_empty() {
                        "unknown"
                    } else {
                        result.status.as_str()
                    };
                    Some(format!(
                        "Globalping measurement ended with status '{status}'."
                    ))
                };
                return GpPollOutcome {
                    result: Some(result),
                    failure,
                    failure_code,
                };
            }
            Ok(Ok(Some((response_etag, result)))) => {
                etag = response_etag;
                latest_result = Some(result);
                last_request_error = None;
            }
            Ok(Err(GpPollError::RateLimited)) => {
                return GpPollOutcome {
                    result: latest_result,
                    failure: Some(
                        "Globalping quota exhausted (HTTP 429). Configure a token later.".into(),
                    ),
                    failure_code: Some("rate_limited".into()),
                };
            }
            Ok(Err(GpPollError::Http(status))) => {
                return GpPollOutcome {
                    result: latest_result,
                    failure: Some(format!("Globalping returned HTTP {status} while polling.")),
                    failure_code: Some(failure_code_for_status(status).into()),
                };
            }
            Ok(Err(GpPollError::Parse(error))) => {
                return GpPollOutcome {
                    result: latest_result,
                    failure: Some(format!("Globalping response could not be parsed: {error}")),
                    failure_code: Some("invalid_response".into()),
                };
            }
            Ok(Err(GpPollError::Request(error))) => {
                last_request_error = Some(format!("Globalping polling request failed: {error}"));
            }
        }
    }

    let timeout_seconds = timeout.as_secs_f64();
    let (failure, failure_code) = match last_request_error {
        Some(error) => (
            format!(
                "Globalping polling timed out after {timeout_seconds:.1} seconds. Last error: {error}"
            ),
            "network_error".to_owned(),
        ),
        None => (
            format!("Globalping measurement polling timed out after {timeout_seconds:.1} seconds."),
            "timed_out".to_owned(),
        ),
    };
    GpPollOutcome {
        result: latest_result,
        failure: Some(failure),
        failure_code: Some(failure_code),
    }
}

fn globalping_failure(detail: String) -> NodeDnsAnswer {
    NodeDnsAnswer {
        node_id: "globalping-error".into(),
        node_label: "Globalping".into(),
        ok: false,
        answers: vec![],
        detail: Some(detail),
    }
}

fn map_globalping_results(result: GpResult) -> Vec<NodeDnsAnswer> {
    result
        .results
        .into_iter()
        .enumerate()
        .map(|(idx, probe_result)| {
            let label = format!(
                "Globalping · {}/{}",
                probe_result.probe.city.unwrap_or_else(|| "?".into()),
                probe_result.probe.country.unwrap_or_else(|| "?".into())
            );
            let answers: Vec<String> = probe_result
                .result
                .answers
                .into_iter()
                .map(|answer| {
                    if answer.rr_type.is_empty() {
                        answer.value
                    } else {
                        format!("{} {}", answer.rr_type, answer.value)
                    }
                })
                .collect();
            let ok = match probe_result.result.status.as_str() {
                "finished" => true,
                "" => !answers.is_empty(),
                _ => false,
            };
            NodeDnsAnswer {
                node_id: format!("gp-{idx}"),
                node_label: label,
                ok,
                answers,
                detail: probe_result.result.raw_output,
            }
        })
        .collect()
}

fn append_poll_outcome(answers: &mut Vec<NodeDnsAnswer>, outcome: GpPollOutcome) {
    if let Some(result) = outcome.result {
        answers.extend(map_globalping_results(result));
    }
    if let Some(failure) = outcome.failure {
        answers.push(globalping_failure(failure));
    }
}

fn globalping_client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(GP_POLL_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|_| AppError::internal("Unable to initialize the Globalping client."))
}

fn failed_measurement(
    kind: MeasurementKind,
    target: String,
    method: Option<String>,
    failure_code: &str,
    elapsed_ms: f64,
) -> GlobalpingMeasurementResult {
    GlobalpingMeasurementResult {
        kind: kind.as_str().into(),
        command_hint: match &method {
            Some(method) => {
                format!("globalping http '{target}' --method {method} from world, US, Europe")
            }
            None => format!("globalping ping '{target}' from world, US, Europe"),
        },
        target,
        method,
        status: "failed".into(),
        failure_code: Some(failure_code.into()),
        quota: None,
        probes_count: 0,
        results: vec![],
        elapsed_ms,
    }
}

fn quota_from_headers(headers: &reqwest::header::HeaderMap) -> Option<GlobalpingQuota> {
    let parse_u32 = |name: &'static str| {
        headers
            .get(name)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u32>().ok())
    };
    let parse_u64 = |name: &'static str| {
        headers
            .get(name)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
    };
    let quota = GlobalpingQuota {
        rate_limit_limit: parse_u32("x-ratelimit-limit"),
        rate_limit_consumed: parse_u32("x-ratelimit-consumed"),
        rate_limit_remaining: parse_u32("x-ratelimit-remaining"),
        rate_limit_reset_seconds: parse_u64("x-ratelimit-reset"),
        credits_remaining: parse_u64("x-credits-remaining"),
        credits_consumed: parse_u64("x-credits-consumed"),
    };
    (quota.rate_limit_limit.is_some()
        || quota.rate_limit_consumed.is_some()
        || quota.rate_limit_remaining.is_some()
        || quota.rate_limit_reset_seconds.is_some()
        || quota.credits_remaining.is_some()
        || quota.credits_consumed.is_some())
    .then_some(quota)
}

fn map_measurement_results(response: GpResult) -> Vec<GlobalpingProbeResult> {
    response
        .results
        .into_iter()
        .enumerate()
        .map(|(index, item)| {
            let city = item.probe.city.unwrap_or_else(|| "?".into());
            let country = item.probe.country.unwrap_or_else(|| "?".into());
            let GpInner {
                status,
                failure_source,
                resolved_address,
                stats,
                status_code,
                timings,
                tls,
                ..
            } = item.result;
            let ping = stats.map(|stats| GlobalpingPingStats {
                packets_sent: stats.total.unwrap_or_default(),
                packets_received: stats.rcv.unwrap_or_default(),
                loss_percent: stats.loss.unwrap_or(100.0),
                min_rtt_ms: stats.min,
                avg_rtt_ms: stats.avg,
                max_rtt_ms: stats.max,
            });
            let timings = match timings {
                Some(GpMeasurementTimings::Http(timings)) => Some(timings),
                Some(GpMeasurementTimings::Ping(samples)) => {
                    let _sample_count = samples.len();
                    None
                }
                None => None,
            };
            let http = if status_code.is_some() || timings.is_some() {
                let timings = timings.unwrap_or_default();
                Some(GlobalpingHttpStats {
                    status_code,
                    total_ms: timings.total,
                    dns_ms: timings.dns,
                    tcp_ms: timings.tcp,
                    tls_ms: timings.tls,
                    first_byte_ms: timings.first_byte,
                    download_ms: timings.download,
                    tls_available: tls.is_some(),
                })
            } else {
                None
            };
            GlobalpingProbeResult {
                node_id: format!("gp-{index}"),
                node_label: format!("Globalping · {city}/{country}"),
                status: if status.is_empty() {
                    "unknown".into()
                } else {
                    status.clone()
                },
                ok: status == "finished",
                failure_source,
                resolved_address,
                ping,
                http,
            }
        })
        .collect()
}

pub async fn run_measurement(
    app_identifier: String,
    kind: String,
    target: String,
    method: Option<String>,
) -> AppResult<GlobalpingMeasurementResult> {
    let kind = MeasurementKind::parse(&kind)?;
    let target = normalize_target(kind, &target)?;
    let http_target = (kind == MeasurementKind::Http)
        .then(|| globalping_http_target(&target))
        .transpose()?;
    let method = if kind == MeasurementKind::Http {
        let method = method.unwrap_or_else(|| "HEAD".into()).to_ascii_uppercase();
        if !matches!(method.as_str(), "HEAD" | "GET" | "OPTIONS") {
            return Err(AppError::invalid_input(
                "Globalping HTTP supports HEAD, GET, or OPTIONS.",
            ));
        }
        Some(method)
    } else if method.is_some() {
        return Err(AppError::invalid_input(
            "HTTP request methods are only valid for HTTP measurements.",
        ));
    } else {
        None
    };

    let started = Instant::now();
    let token = read_token_blocking_async(app_identifier).await?;
    let token_ref = token.as_ref().map(|value| value.as_str());
    let client = globalping_client()?;
    let locations = ["world", "US", "Europe"]
        .into_iter()
        .map(|magic| serde_json::json!({ "magic": magic, "limit": 1 }))
        .collect::<Vec<_>>();
    let body = measurement_request_body(
        kind,
        &target,
        http_target.as_ref(),
        method.as_deref(),
        locations,
    );

    let mut request = client.post(GP_API).json(&body);
    if let Some(token) = token_ref {
        request = request.bearer_auth(token);
    }
    let response = tokio::time::timeout(GP_CREATE_TIMEOUT, async {
        let response = request.send().await?;
        let status = response.status();
        let quota = quota_from_headers(response.headers());
        let body = if status.is_success() {
            Some(response.bytes().await?)
        } else {
            None
        };
        Ok::<_, reqwest::Error>((status, quota, body))
    })
    .await;
    let (status, quota, response_body) = match response {
        Ok(Ok(response)) => response,
        Ok(Err(_)) => {
            return Ok(failed_measurement(
                kind,
                target,
                method,
                "network_error",
                started.elapsed().as_secs_f64() * 1000.0,
            ));
        }
        Err(_) => {
            return Ok(failed_measurement(
                kind,
                target,
                method,
                "timed_out",
                started.elapsed().as_secs_f64() * 1000.0,
            ));
        }
    };
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let mut result = failed_measurement(
            kind,
            target,
            method,
            "rate_limited",
            started.elapsed().as_secs_f64() * 1000.0,
        );
        result.quota = quota;
        return Ok(result);
    }
    if !status.is_success() {
        let mut result = failed_measurement(
            kind,
            target,
            method,
            failure_code_for_status(status),
            started.elapsed().as_secs_f64() * 1000.0,
        );
        result.quota = quota;
        return Ok(result);
    }
    let created = match response_body
        .as_deref()
        .ok_or("missing create response body")
        .and_then(|body| serde_json::from_slice::<GpCreate>(body).map_err(|_| "invalid JSON"))
    {
        Ok(created) if valid_measurement_id(&created.id) => created,
        _ => {
            let mut result = failed_measurement(
                kind,
                target,
                method,
                "invalid_response",
                started.elapsed().as_secs_f64() * 1000.0,
            );
            result.quota = quota;
            return Ok(result);
        }
    };

    let poll_url = format!("{GP_API}/{}", created.id);
    let poll = poll_measurement(
        &client,
        &poll_url,
        token_ref,
        GP_POLL_TIMEOUT,
        GP_POLL_INTERVAL,
    )
    .await;
    let failure_code = poll.failure_code;
    let status = poll
        .result
        .as_ref()
        .map(|response| response.status.clone())
        .unwrap_or_else(|| "failed".into());
    let probes_count = poll
        .result
        .as_ref()
        .map(|response| response.probes_count)
        .filter(|count| *count > 0)
        .unwrap_or(created.probes_count);
    let mut results = poll.result.map(map_measurement_results).unwrap_or_default();
    if results.is_empty() && failure_code.is_none() {
        let mut result = failed_measurement(
            kind,
            target,
            method,
            "no_results",
            started.elapsed().as_secs_f64() * 1000.0,
        );
        result.quota = quota;
        return Ok(result);
    }
    Ok(GlobalpingMeasurementResult {
        kind: kind.as_str().into(),
        target: target.clone(),
        method: method.clone(),
        status: if failure_code.is_some() && !results.is_empty() {
            "partial".into()
        } else {
            status
        },
        failure_code,
        quota,
        probes_count,
        results: std::mem::take(&mut results),
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint: match method {
            Some(method) => {
                format!("globalping http '{target}' --method {method} from world, US, Europe")
            }
            None => format!("globalping ping '{target}' from world, US, Europe"),
        },
    })
}

async fn read_token_blocking_async(app_identifier: String) -> AppResult<Option<Zeroizing<String>>> {
    tokio::task::spawn_blocking(move || read_token_blocking(&app_identifier))
        .await
        .map_err(|_| AppError::task_failed("Secure token storage task failed."))?
}

#[derive(Debug, Deserialize)]
struct GpProbeResult {
    #[serde(default)]
    result: GpInner,
    #[serde(default)]
    probe: GpProbeMeta,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GpInner {
    #[serde(default)]
    status: String,
    #[serde(default)]
    answers: Vec<GpAnswer>,
    #[serde(default)]
    raw_output: Option<String>,
    failure_source: Option<String>,
    resolved_address: Option<String>,
    stats: Option<GpPingStats>,
    status_code: Option<u16>,
    timings: Option<GpMeasurementTimings>,
    tls: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct GpAnswer {
    #[serde(default)]
    value: String,
    #[serde(rename = "type", default)]
    rr_type: String,
}

#[derive(Debug, Default, Deserialize)]
struct GpProbeMeta {
    #[serde(default)]
    city: Option<String>,
    #[serde(default)]
    country: Option<String>,
}

pub async fn compare_dns_multi(
    app_identifier: String,
    domain: String,
    location_magics: Vec<String>,
) -> AppResult<MultiNodeDnsResult> {
    super::validate::validate_host(&domain)?;
    let started = Instant::now();
    let command_hint = format!(
        "dnsLookup(multi, '{domain}') // via globalping locations={:?}",
        location_magics
    );

    let mut answers = Vec::new();

    // Local first
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

    let magics = if location_magics.is_empty() {
        vec!["world".into()]
    } else {
        location_magics.into_iter().take(3).collect()
    };

    let token = match read_token_blocking_async(app_identifier).await {
        Ok(token) => token,
        Err(error) => {
            answers.push(globalping_failure(error.to_string()));
            return Ok(MultiNodeDnsResult {
                domain,
                answers,
                elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
                command_hint,
            });
        }
    };
    let token_ref = token.as_ref().map(|value| value.as_str());

    let client = globalping_client()?;

    let locations: Vec<serde_json::Value> = magics
        .iter()
        .map(|m| serde_json::json!({ "magic": m, "limit": 1 }))
        .collect();
    let body = serde_json::json!({
        "type": "dns",
        "target": domain,
        "locations": locations,
        "inProgressUpdates": true,
        "measurementOptions": { "query": { "type": "A" } }
    });

    let mut request = client.post(GP_API).json(&body);
    if let Some(token) = token_ref {
        request = request.bearer_auth(token);
    }
    let create_deadline = tokio::time::Instant::now() + GP_CREATE_TIMEOUT;
    let create_response = tokio::time::timeout_at(create_deadline, async {
        let response = request.send().await?;
        let status = response.status();
        let created = if status.is_success() {
            Some(response.json::<GpCreate>().await?)
        } else {
            None
        };
        Ok::<_, reqwest::Error>((status, created))
    })
    .await;
    match create_response {
        Err(_) => answers.push(globalping_failure(
            "Globalping measurement creation timed out after 10 seconds.".into(),
        )),
        Ok(Err(error)) => answers.push(globalping_failure(format!(
            "Globalping create request failed: {error}"
        ))),
        Ok(Ok((status, Some(created)))) if status.is_success() => {
            if !valid_measurement_id(&created.id) {
                answers.push(globalping_failure(
                    "Globalping returned an invalid measurement identifier.".into(),
                ));
                return Ok(MultiNodeDnsResult {
                    domain,
                    answers,
                    elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
                    command_hint,
                });
            }
            let url = format!("{GP_API}/{}", created.id);
            let poll =
                poll_measurement(&client, &url, token_ref, GP_POLL_TIMEOUT, GP_POLL_INTERVAL).await;
            append_poll_outcome(&mut answers, poll);
        }
        Ok(Ok((status, _))) if status.as_u16() == 429 => {
            answers.push(NodeDnsAnswer {
                node_id: "globalping".into(),
                node_label: "Globalping".into(),
                ok: false,
                answers: vec![],
                detail: Some("Globalping quota exhausted (HTTP 429).".into()),
            });
        }
        Ok(Ok((status, _))) => {
            answers.push(NodeDnsAnswer {
                node_id: "globalping".into(),
                node_label: "Globalping".into(),
                ok: false,
                answers: vec![],
                detail: Some(format!("Globalping HTTP {status}")),
            });
        }
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
    use super::{
        append_poll_outcome, failure_code_for_status, globalping_http_target,
        map_measurement_results, measurement_request_body, normalize_target, normalize_token,
        poll_measurement, quota_from_headers, valid_measurement_id, GpPollOutcome, MeasurementKind,
    };
    use crate::net_probe::types::NodeDnsAnswer;
    use std::io::{Read, Write};
    use std::net::{Ipv6Addr, TcpListener};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;

    fn serve(responses: Vec<(u16, &'static str)>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("read test server address");
        thread::spawn(move || {
            for (status, body) in responses {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                let mut request = [0; 2048];
                let _ = stream.read(&mut request);
                let reason = match status {
                    200 => "OK",
                    429 => "Too Many Requests",
                    503 => "Service Unavailable",
                    _ => "Error",
                };
                let response = format!(
                    "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes());
            }
        });
        format!("http://{address}/v1/measurements/test-id")
    }

    fn serve_slow(delay: Duration) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("read test server address");
        thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let mut request = [0; 2048];
            let _ = stream.read(&mut request);
            thread::sleep(delay);
            let body = r#"{"status":"in-progress","results":[]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(response.as_bytes());
        });
        format!("http://{address}/v1/measurements/test-id")
    }

    fn serve_etag() -> (String, Arc<AtomicBool>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("read test server address");
        let saw_conditional_request = Arc::new(AtomicBool::new(false));
        let test_flag = Arc::clone(&saw_conditional_request);
        thread::spawn(move || {
            let bodies = [
                Some(r#"{"status":"in-progress","results":[]}"#),
                None,
                Some(
                    r#"{"status":"finished","probesCount":1,"results":[{"probe":{"city":"Test","country":"ZZ"},"result":{"status":"finished"}}]}"#,
                ),
            ];
            for (index, body) in bodies.into_iter().enumerate() {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                let mut request = Vec::new();
                let mut chunk = [0; 512];
                loop {
                    let Ok(read) = stream.read(&mut chunk) else {
                        return;
                    };
                    if read == 0 {
                        return;
                    }
                    request.extend_from_slice(&chunk[..read]);
                    if request.windows(4).any(|window| window == b"\r\n\r\n") {
                        break;
                    }
                }
                if index == 1 {
                    let request = String::from_utf8_lossy(&request).to_ascii_lowercase();
                    test_flag.store(request.contains("if-none-match: \"v1\""), Ordering::SeqCst);
                }
                let response = match body {
                    Some(body) => format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nETag: \"v1\"\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    ),
                    None => "HTTP/1.1 304 Not Modified\r\nETag: \"v1\"\r\nConnection: close\r\n\r\n".to_owned(),
                };
                let _ = stream.write_all(response.as_bytes());
            }
        });
        (
            format!("http://{address}/v1/measurements/test-id"),
            saw_conditional_request,
        )
    }

    fn serve_etag_replacement() -> (String, Arc<AtomicBool>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("read test server address");
        let sent_stale_etag = Arc::new(AtomicBool::new(false));
        let test_flag = Arc::clone(&sent_stale_etag);
        thread::spawn(move || {
            let bodies = [
                (
                    "\r\nETag: \"v1\"",
                    r#"{"status":"in-progress","results":[]}"#,
                ),
                ("", r#"{"status":"in-progress","results":[]}"#),
                (
                    "",
                    r#"{"status":"finished","probesCount":1,"results":[{"probe":{"city":"Test","country":"ZZ"},"result":{"status":"finished"}}]}"#,
                ),
            ];
            for (index, (etag, body)) in bodies.into_iter().enumerate() {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                let mut request = Vec::new();
                let mut chunk = [0; 512];
                loop {
                    let Ok(read) = stream.read(&mut chunk) else {
                        return;
                    };
                    if read == 0 {
                        return;
                    }
                    request.extend_from_slice(&chunk[..read]);
                    if request.windows(4).any(|window| window == b"\r\n\r\n") {
                        break;
                    }
                }
                if index == 2 {
                    let request = String::from_utf8_lossy(&request).to_ascii_lowercase();
                    test_flag.store(request.contains("if-none-match:"), Ordering::SeqCst);
                }
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json{etag}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes());
            }
        });
        (
            format!("http://{address}/v1/measurements/test-id"),
            sent_stale_etag,
        )
    }

    fn client() -> reqwest::Client {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .expect("build test HTTP client")
    }

    #[tokio::test]
    async fn stops_when_globalping_returns_a_terminal_failure_status() {
        let url = serve(vec![
            (200, r#"{"status":"in-progress","results":[]}"#),
            (200, r#"{"status":"failed","results":[]}"#),
        ]);

        let outcome = poll_measurement(
            &client(),
            &url,
            None,
            Duration::from_secs(1),
            Duration::from_millis(1),
        )
        .await;

        assert_eq!(outcome.result.expect("terminal response").status, "failed");
        assert!(outcome
            .failure
            .as_deref()
            .is_some_and(|failure| failure.contains("status 'failed'")));
    }

    #[tokio::test]
    async fn preserves_partial_results_and_surfaces_http_errors() {
        let url = serve(vec![
            (
                200,
                r#"{"status":"in-progress","results":[{"result":{"status":"in-progress","answers":[{"type":"A","value":"192.0.2.1"}]},"probe":{"city":"Test","country":"ZZ"}}]}"#,
            ),
            (503, r#"{"error":"temporarily unavailable"}"#),
        ]);
        let outcome = poll_measurement(
            &client(),
            &url,
            None,
            Duration::from_secs(1),
            Duration::from_millis(1),
        )
        .await;
        let local = NodeDnsAnswer {
            node_id: "local".into(),
            node_label: "Local".into(),
            ok: true,
            answers: vec!["192.0.2.2".into()],
            detail: None,
        };
        let mut answers = vec![local];

        append_poll_outcome(&mut answers, outcome);

        assert_eq!(answers.len(), 3);
        assert_eq!(answers[0].node_id, "local");
        assert!(answers[1].answers.contains(&"A 192.0.2.1".into()));
        assert!(!answers[1].ok, "an in-progress probe must not be marked OK");
        assert_eq!(answers[2].node_id, "globalping-error");
        assert!(!answers[2].ok);
        assert!(answers[2]
            .detail
            .as_deref()
            .is_some_and(|detail| detail.contains("HTTP 503")));
    }

    #[tokio::test]
    async fn enforces_one_total_poll_deadline_for_slow_responses() {
        let url = serve_slow(Duration::from_millis(250));
        let outcome = poll_measurement(
            &client(),
            &url,
            None,
            Duration::from_millis(80),
            Duration::from_millis(1),
        )
        .await;

        assert!(outcome.result.is_none());
        assert!(outcome
            .failure
            .as_deref()
            .is_some_and(|failure| failure.contains("timed out")));
    }

    #[tokio::test]
    async fn sends_etag_and_keeps_polling_after_not_modified() {
        let (url, saw_conditional_request) = serve_etag();
        let outcome = poll_measurement(
            &client(),
            &url,
            None,
            Duration::from_secs(1),
            Duration::from_millis(1),
        )
        .await;

        assert!(saw_conditional_request.load(Ordering::SeqCst));
        assert_eq!(
            outcome.result.expect("final measurement").status,
            "finished"
        );
        assert!(outcome.failure.is_none());
    }

    #[tokio::test]
    async fn clears_an_etag_when_a_fresh_response_omits_it() {
        let (url, sent_stale_etag) = serve_etag_replacement();
        let outcome = poll_measurement(
            &client(),
            &url,
            None,
            Duration::from_secs(1),
            Duration::from_millis(1),
        )
        .await;

        assert!(!sent_stale_etag.load(Ordering::SeqCst));
        assert_eq!(
            outcome.result.expect("final measurement").status,
            "finished"
        );
    }

    #[test]
    fn appends_remote_failure_without_replacing_local_result() {
        let local = NodeDnsAnswer {
            node_id: "local".into(),
            node_label: "Local".into(),
            ok: true,
            answers: vec!["192.0.2.2".into()],
            detail: None,
        };
        let mut answers = vec![local];

        append_poll_outcome(
            &mut answers,
            GpPollOutcome {
                result: None,
                failure: Some("Globalping timed out".into()),
                failure_code: Some("timed_out".into()),
            },
        );

        assert_eq!(answers.len(), 2);
        assert_eq!(answers[0].node_id, "local");
        assert_eq!(answers[0].answers, ["192.0.2.2"]);
        assert_eq!(answers[1].node_id, "globalping-error");
        assert!(!answers[1].ok);
    }

    #[test]
    fn accepts_public_targets_and_rejects_local_or_private_destinations() {
        assert_eq!(
            normalize_target(MeasurementKind::Ping, "example.com").expect("public host"),
            "example.com"
        );
        assert_eq!(
            normalize_target(MeasurementKind::Ping, "1.1.1.1").expect("public ipv4"),
            "1.1.1.1"
        );
        assert_eq!(
            normalize_target(MeasurementKind::Http, "example.com/health").expect("public url"),
            "https://example.com/health"
        );
        for target in [
            "127.0.0.1",
            "10.0.0.4",
            "169.254.169.254",
            "100.64.0.1",
            "192.168.1.1",
            "224.0.0.1",
            "::1",
            "2001:db8::1",
            "3fff::1",
            "printer",
            "host.local",
            "service.internal",
        ] {
            assert!(
                normalize_target(MeasurementKind::Ping, target).is_err(),
                "should reject {target}"
            );
        }
        for target in [
            Ipv6Addr::new(0xfd00, 0, 0, 0, 0, 0, 0, 1).to_string(),
            Ipv6Addr::new(0xfe80, 0, 0, 0, 0, 0, 0, 1).to_string(),
        ] {
            assert!(
                normalize_target(MeasurementKind::Ping, &target).is_err(),
                "should reject {target}"
            );
        }
        for target in [
            "http://127.0.0.1/",
            "http://169.254.169.254/latest/meta-data/",
            "https://user:password@example.com/",
            "ftp://example.com/",
            "http://device.local/",
        ] {
            assert!(
                normalize_target(MeasurementKind::Http, target).is_err(),
                "should reject {target}"
            );
        }
    }

    #[test]
    fn reads_globalping_quota_headers_without_assuming_missing_values() {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("x-ratelimit-limit", "250".parse().expect("header value"));
        headers.insert("x-ratelimit-consumed", "3".parse().expect("header value"));
        headers.insert(
            "x-ratelimit-remaining",
            "247".parse().expect("header value"),
        );
        headers.insert("x-ratelimit-reset", "3600".parse().expect("header value"));
        headers.insert("x-credits-remaining", "12".parse().expect("header value"));

        let quota = quota_from_headers(&headers).expect("quota headers");
        assert_eq!(quota.rate_limit_limit, Some(250));
        assert_eq!(quota.rate_limit_consumed, Some(3));
        assert_eq!(quota.rate_limit_remaining, Some(247));
        assert_eq!(quota.rate_limit_reset_seconds, Some(3600));
        assert_eq!(quota.credits_remaining, Some(12));
        assert_eq!(quota.credits_consumed, None);
        assert!(quota_from_headers(&reqwest::header::HeaderMap::new()).is_none());
    }

    #[test]
    fn trims_token_in_its_zeroizing_buffer_and_rejects_control_characters() {
        let token = normalize_token(" \nsecret-token\t ".into()).expect("normalized token");
        assert_eq!(token.as_str(), "secret-token");
        assert!(normalize_token("secret\ntoken".into()).is_err());
        assert!(normalize_token("   ".into()).is_err());
    }

    #[test]
    fn measurement_id_cannot_escape_the_api_path() {
        assert!(valid_measurement_id("abc_123-xyz"));
        assert!(!valid_measurement_id(""));
        assert!(!valid_measurement_id("../health"));
        assert!(!valid_measurement_id("id?include=raw"));
    }

    #[test]
    fn http_urls_map_to_globalping_target_and_request_options() {
        let http_target = globalping_http_target("https://example.com:8443/path/to?q=one&x=two")
            .expect("HTTP URL mapping");
        assert_eq!(
            http_target,
            super::GlobalpingHttpTarget {
                target: "example.com".into(),
                protocol: "HTTPS",
                path: "/path/to".into(),
                query: Some("q=one&x=two".into()),
                port: Some(8443),
            }
        );
        let body = measurement_request_body(
            MeasurementKind::Http,
            "https://example.com:8443/path/to?q=one&x=two",
            Some(&http_target),
            Some("HEAD"),
            vec![serde_json::json!({ "magic": "world", "limit": 1 })],
        );
        assert_eq!(body["target"], "example.com");
        assert!(body["inProgressUpdates"].as_bool().unwrap_or_default());
        assert_eq!(body["measurementOptions"]["protocol"], "HTTPS");
        assert_eq!(body["measurementOptions"]["port"], 8443);
        assert_eq!(body["measurementOptions"]["request"]["method"], "HEAD");
        assert_eq!(body["measurementOptions"]["request"]["path"], "/path/to");
        assert_eq!(
            body["measurementOptions"]["request"]["query"],
            "q=one&x=two"
        );
        assert_eq!(
            globalping_http_target("http://[2606:4700:4700::1111]/")
                .expect("public IPv6 URL")
                .target,
            "2606:4700:4700::1111"
        );
    }

    #[test]
    fn globalping_client_errors_are_not_reported_as_service_outages() {
        assert_eq!(
            failure_code_for_status(reqwest::StatusCode::BAD_REQUEST),
            "invalid_request"
        );
        assert_eq!(
            failure_code_for_status(reqwest::StatusCode::UNPROCESSABLE_ENTITY),
            "invalid_request"
        );
        assert_eq!(
            failure_code_for_status(reqwest::StatusCode::UNAUTHORIZED),
            "invalid_token"
        );
        assert_eq!(
            failure_code_for_status(reqwest::StatusCode::SERVICE_UNAVAILABLE),
            "service_error"
        );
    }

    #[test]
    fn rejects_ping_paths_ports_and_control_methods() {
        for target in [
            "https://example.com/path",
            "https://example.com:8443",
            "example.com/path",
            "example.com?token=value",
        ] {
            assert!(normalize_target(MeasurementKind::Ping, target).is_err());
        }
    }

    #[test]
    fn maps_globalping_ping_and_http_metrics_without_returning_bodies() {
        let response: super::GpResult = serde_json::from_value(serde_json::json!({
            "status": "finished",
            "probesCount": 2,
            "results": [
                {
                    "probe": { "city": "Tokyo", "country": "JP" },
                    "result": {
                        "status": "finished",
                        "resolvedAddress": "203.0.113.4",
                        "stats": { "min": 8.0, "avg": 9.5, "max": 12.0, "total": 3, "rcv": 3, "drop": 0, "loss": 0.0 },
                        "timings": [{ "rtt": 8.0, "ttl": 54 }],
                        "rawOutput": "secret raw output is not exposed"
                    }
                },
                {
                    "probe": { "city": "Berlin", "country": "DE" },
                    "result": {
                        "status": "finished",
                        "resolvedAddress": "203.0.113.5",
                        "statusCode": 200,
                        "statusCodeName": "OK",
                        "rawHeaders": "set-cookie: private=value",
                        "rawBody": "response body is not exposed",
                        "truncated": false,
                        "headers": { "content-type": "text/plain" },
                        "timings": { "total": 42.0, "dns": 3.0, "tcp": 5.0, "tls": 12.0, "firstByte": 21.0, "download": 1.0 },
                        "tls": { "issuer": "test" }
                    }
                }
            ]
        }))
        .expect("parse measurement response");

        let results = map_measurement_results(response);

        assert_eq!(results.len(), 2);
        assert_eq!(
            results[0].ping.as_ref().expect("ping stats").avg_rtt_ms,
            Some(9.5)
        );
        assert_eq!(results[0].status, "finished");
        let http = results[1].http.as_ref().expect("http metrics");
        assert_eq!(http.status_code, Some(200));
        assert_eq!(http.total_ms, Some(42.0));
        assert!(http.tls_available);
        let serialized = serde_json::to_string(&results).expect("serialize safe results");
        assert!(!serialized.contains("rawBody"));
        assert!(!serialized.contains("rawHeaders"));
        assert!(!serialized.contains("secret raw output"));
    }
}
