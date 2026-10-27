//! Globalping remote DNS compare (S-DIS-04) + node listing helpers.

use super::types::{
    GlobalpingHttpTimings, GlobalpingMeasurementResult, GlobalpingPingStats,
    GlobalpingProbeMeasurement, GlobalpingRateLimitInfo, MultiNodeDnsResult, NodeDnsAnswer,
    ProbeNode,
};
use crate::error::{AppError, AppResult};
use reqwest::header::{HeaderMap, HeaderValue, ETAG, IF_NONE_MATCH};
use reqwest::{RequestBuilder, Response, StatusCode};
use serde::{de::DeserializeOwned, Deserialize};
use std::collections::BTreeMap;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::time::Instant as TokioInstant;

const GP_API: &str = "https://api.globalping.io/v1/measurements";
const GP_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const GP_MEASUREMENT_TIMEOUT: Duration = Duration::from_secs(20);
const GP_POLL_INTERVAL: Duration = Duration::from_millis(700);
const MAX_GLOBALPING_RESPONSE_BYTES: usize = 512 * 1024;
const LOCAL_DNS_TIMEOUT: Duration = Duration::from_secs(5);
const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";
const MULTI_NODE_PROGRESS_EVENT: &str = "network-probe:multi-node-progress";
const GLOBALPING_PROGRESS_EVENT: &str = "network-probe:globalping-progress";
const GLOBALPING_LOCATION_MAGICS: [&str; 3] = ["world", "US", "Europe"];

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
    ] {
        nodes.push(ProbeNode {
            id: id.into(),
            kind: "remote-proxy".into(),
            label: label.into(),
            reachable: true,
            endpoint: Some(format!("globalping:{magic}")),
            region: Some(magic.into()),
            // Advertise only functions currently wired through Bench's IPC and UI.
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
}

#[derive(Debug, Deserialize)]
struct GpResult {
    #[serde(default)]
    status: String,
    #[serde(default)]
    results: Vec<GpProbeResult>,
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
    #[serde(default)]
    resolved_address: Option<String>,
    #[serde(default)]
    stats: Option<GpPingStats>,
    #[serde(default)]
    status_code: Option<u16>,
    #[serde(default)]
    status_code_name: Option<String>,
    #[serde(default)]
    timings: Option<GpHttpTimings>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GpPingStats {
    #[serde(default)]
    min: Option<f64>,
    #[serde(default)]
    avg: Option<f64>,
    #[serde(default)]
    max: Option<f64>,
    #[serde(default)]
    loss: Option<f64>,
    #[serde(default)]
    total: Option<u32>,
    #[serde(default)]
    rcv: Option<u32>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GpHttpTimings {
    #[serde(default)]
    total: u64,
    #[serde(default)]
    dns: Option<u64>,
    #[serde(default)]
    tcp: u64,
    #[serde(default)]
    tls: Option<u64>,
    #[serde(default)]
    first_byte: u64,
    #[serde(default)]
    download: u64,
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

pub async fn compare_dns_multi<R: Runtime>(
    app: &AppHandle<R>,
    domain: String,
    location_magics: Vec<String>,
) -> AppResult<MultiNodeDnsResult> {
    validate_dns_target_input(&domain)?;
    let location_magics = normalize_location_magics(location_magics)?;
    let session_id = super::session::new_session_id();
    let _ = app.emit(
        SCAN_SESSION_EVENT,
        &super::types::ScanSessionEvent {
            session_id: session_id.clone(),
            kind: "multiNode".into(),
        },
    );
    let result = compare_dns_multi_with_session(domain, location_magics, &session_id, |partial| {
        let _ = app.emit(MULTI_NODE_PROGRESS_EVENT, partial);
    })
    .await;
    super::session::clear_session(&session_id);
    result
}

fn validate_dns_target_input(domain: &str) -> AppResult<()> {
    super::validate::validate_host(domain)?;

    let host = url::Host::parse(domain.trim_end_matches('.'));
    if !matches!(host, Ok(url::Host::Domain(_))) {
        return Err(AppError::invalid_input(
            "DNS comparison requires a domain name, not an IP address",
        ));
    }

    validate_public_target_host(domain)
}

#[derive(Debug, Clone)]
enum RemoteMeasurementTarget {
    Ping {
        api_target: String,
    },
    Http {
        api_target: String,
        protocol: &'static str,
        port: u16,
        path: String,
        method: &'static str,
    },
}

impl RemoteMeasurementTarget {
    fn api_target(&self) -> &str {
        match self {
            Self::Ping { api_target } | Self::Http { api_target, .. } => api_target,
        }
    }

    fn measurement_type(&self) -> &'static str {
        match self {
            Self::Ping { .. } => "ping",
            Self::Http { .. } => "http",
        }
    }

    fn measurement_options(&self) -> serde_json::Value {
        match self {
            Self::Ping { .. } => serde_json::json!({ "packets": 4 }),
            Self::Http {
                protocol,
                port,
                path,
                method,
                ..
            } => serde_json::json!({
                "protocol": protocol,
                "port": port,
                "request": { "path": path, "method": method }
            }),
        }
    }
}

pub async fn run_remote_measurement<R: Runtime>(
    app: &AppHandle<R>,
    measurement_type: String,
    target: String,
    http_method: Option<String>,
    location_magics: Vec<String>,
) -> AppResult<GlobalpingMeasurementResult> {
    let location_magics = normalize_location_magics(location_magics)?;
    let raw_target = target.trim().to_owned();
    let request_target =
        prepare_remote_measurement_target(&measurement_type, &raw_target, http_method.as_deref())?;
    let display_target = redact_remote_display_target(&raw_target);
    let session_id = super::session::new_session_id();
    let _ = app.emit(
        SCAN_SESSION_EVENT,
        &super::types::ScanSessionEvent {
            session_id: session_id.clone(),
            kind: "multiNode".into(),
        },
    );
    let result = run_remote_measurement_with_session(
        display_target,
        request_target,
        location_magics,
        &session_id,
        |partial| {
            let _ = app.emit(GLOBALPING_PROGRESS_EVENT, partial);
        },
    )
    .await;
    super::session::clear_session(&session_id);
    result
}

fn prepare_remote_measurement_target(
    measurement_type: &str,
    target: &str,
    http_method: Option<&str>,
) -> AppResult<RemoteMeasurementTarget> {
    if target.is_empty() || target.len() > 2048 {
        return Err(crate::error::AppError::invalid_input(
            "Target must contain 1 to 2048 characters",
        ));
    }

    match measurement_type {
        "ping" => {
            let host = target.trim();
            super::validate::validate_host(host)?;
            if host.contains("/")
                || host.contains('?')
                || host.contains('#')
                || host.contains("@")
                || host.contains('%')
            {
                return Err(crate::error::AppError::invalid_input(
                    "Ping target must be a public hostname or IP address",
                ));
            }
            let api_target = strip_ipv6_brackets(host);
            if api_target.parse::<std::net::IpAddr>().is_err() && api_target.contains(':') {
                return Err(crate::error::AppError::invalid_input(
                    "Ping target must be a hostname or IP address without a port",
                ));
            }
            validate_public_target_host(api_target)?;
            Ok(RemoteMeasurementTarget::Ping {
                api_target: api_target.to_owned(),
            })
        }
        "http" => {
            let url = reqwest::Url::parse(target).map_err(|_| {
                crate::error::AppError::invalid_input("HTTP target must be an absolute URL")
            })?;
            if !matches!(url.scheme(), "http" | "https")
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
            {
                return Err(crate::error::AppError::invalid_input(
                    "Use a public HTTP(S) URL without credentials, query strings, or fragments",
                ));
            }
            let host = url.host_str().ok_or_else(|| {
                crate::error::AppError::invalid_input("HTTP target must include a hostname")
            })?;
            let api_target = strip_ipv6_brackets(host);
            validate_public_target_host(api_target)?;
            let method = match http_method.unwrap_or("GET") {
                "GET" => "GET",
                "HEAD" => "HEAD",
                _ => {
                    return Err(crate::error::AppError::invalid_input(
                        "HTTP method must be GET or HEAD",
                    ));
                }
            };
            let protocol = if url.scheme() == "https" {
                "HTTPS"
            } else {
                "HTTP"
            };
            let port = url.port_or_known_default().ok_or_else(|| {
                crate::error::AppError::invalid_input("HTTP target has an invalid port")
            })?;
            Ok(RemoteMeasurementTarget::Http {
                api_target: api_target.to_owned(),
                protocol,
                port,
                path: if url.path().is_empty() {
                    "/".into()
                } else {
                    url.path().to_owned()
                },
                method,
            })
        }
        _ => Err(crate::error::AppError::invalid_input(
            "Measurement type must be ping or http",
        )),
    }
}

fn redact_remote_display_target(target: &str) -> String {
    match reqwest::Url::parse(target) {
        Ok(url) if matches!(url.scheme(), "http" | "https") => {
            super::probe::redact_url_for_display(&url)
        }
        _ => target.to_owned(),
    }
}

fn normalize_location_magics(location_magics: Vec<String>) -> AppResult<Vec<String>> {
    if location_magics.is_empty() {
        return Ok(vec!["world".into()]);
    }

    if location_magics.len() > GLOBALPING_LOCATION_MAGICS.len()
        || location_magics
            .iter()
            .any(|location| !GLOBALPING_LOCATION_MAGICS.contains(&location.as_str()))
    {
        return Err(AppError::new(
            "INVALID_GLOBALPING_LOCATIONS",
            "Locations must be unique supported Globalping presets",
        ));
    }

    let mut normalized = Vec::with_capacity(location_magics.len());
    for location in location_magics {
        if normalized.iter().any(|existing| existing == &location) {
            return Err(AppError::new(
                "INVALID_GLOBALPING_LOCATIONS",
                "Locations must be unique supported Globalping presets",
            ));
        }
        normalized.push(location);
    }
    Ok(normalized)
}

fn validate_public_target_host(host: &str) -> AppResult<()> {
    let host = host.strip_suffix('.').unwrap_or(host);
    if host.is_empty() || host.ends_with('.') {
        return Err(crate::error::AppError::invalid_input(
            "Only public internet targets can be measured remotely",
        ));
    }
    let host_for_ip = strip_ipv6_brackets(host);
    if let Ok(ip) = host_for_ip.parse::<std::net::IpAddr>() {
        return validate_public_target_ip(ip);
    }

    // Use the same WHATWG host parser as URL handling so legacy numeric IPv4
    // forms (for example 127.1 or 0x7f000001) cannot pass as DNS names.
    let host = match url::Host::parse(host_for_ip) {
        Ok(url::Host::Ipv4(ip)) => return validate_public_target_ip(ip.into()),
        Ok(url::Host::Ipv6(ip)) => return validate_public_target_ip(ip.into()),
        Ok(url::Host::Domain(domain)) => domain,
        Err(_) => {
            return Err(crate::error::AppError::invalid_input(
                "Only public internet targets can be measured remotely",
            ));
        }
    };

    // These roots are reserved for local/private use or documentation. IANA's
    // special-use designation also covers their subdomains.
    if [
        "localhost",
        "local",
        "internal",
        "test",
        "example",
        "invalid",
        "alt",
        "onion",
        "arpa",
        "example.com",
        "example.net",
        "example.org",
    ]
    .iter()
    .any(|suffix| {
        host.eq_ignore_ascii_case(suffix)
            || host.to_ascii_lowercase().ends_with(&format!(".{suffix}"))
    }) || !host.contains('.')
    {
        return Err(crate::error::AppError::invalid_input(
            "Only public internet targets can be measured remotely",
        ));
    }
    Ok(())
}

fn validate_public_target_ip(ip: std::net::IpAddr) -> AppResult<()> {
    let is_public = match ip {
        std::net::IpAddr::V4(ip) => {
            let octets = ip.octets();
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_broadcast()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && octets[0] != 0
                && !(octets[0] == 100 && (64..=127).contains(&octets[1]))
                && !(octets[0] == 192
                    && (octets[1] == 0
                        && ((octets[2] == 0 && octets[3] != 9 && octets[3] != 10)
                            || octets[2] == 2)
                        || octets[1] == 88 && octets[2] == 99))
                && !(octets[0] == 198
                    && ((octets[1] == 18 || octets[1] == 19)
                        || octets[1] == 51 && octets[2] == 100))
                && !(octets[0] == 203 && octets[1] == 0 && octets[2] == 113)
                && octets[0] < 240
        }
        std::net::IpAddr::V6(ip) => ip
            .to_ipv4_mapped()
            .map(|mapped| validate_public_target_ip(mapped.into()).is_ok())
            .unwrap_or_else(|| is_public_ipv6_target(ip)),
    };
    if !is_public {
        return Err(crate::error::AppError::invalid_input(
            "Only public internet targets can be measured remotely",
        ));
    }
    Ok(())
}

fn is_public_ipv6_target(ip: std::net::Ipv6Addr) -> bool {
    let [first, second, third, fourth, fifth, sixth, seventh, eighth] = ip.segments();

    // General global-unicast allocations currently occupy 2000::/3. Do not
    // infer public reachability from the broader IPv6 unicast address space.
    if first & 0xe000 != 0x2000 {
        return false;
    }

    // IANA lists 2001::/23 as special-purpose and not globally reachable,
    // except for the more-specific public assignments below.
    let in_ietf_assignments = first == 0x2001 && second <= 0x01ff;
    let public_ietf_exception = (second == 0x0001
        && third == 0
        && fourth == 0
        && fifth == 0
        && sixth == 0
        && seventh == 0
        && (eighth == 1 || eighth == 2 || eighth == 3))
        || second == 0x0003
        || (second == 0x0004 && third == 0x0112)
        || (second & 0xfff0 == 0x0020)
        || (second & 0xfff0 == 0x0030);
    if in_ietf_assignments && !public_ietf_exception {
        return false;
    }

    // Non-global special-purpose ranges inside 2000::/3.
    !(first == 0x2001 && second == 0x0db8) // 2001:db8::/32 documentation
        && !(first == 0x2001 && second == 0x0002 && third == 0) // 2001:2::/48 benchmarking
        && first != 0x2002 // 2002::/16 6to4
        && !(first == 0x3fff && second & 0xf000 == 0) // 3fff::/20 documentation
}

fn strip_ipv6_brackets(host: &str) -> &str {
    host.strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host)
}

async fn run_remote_measurement_with_session<F>(
    display_target: String,
    request_target: RemoteMeasurementTarget,
    location_magics: Vec<String>,
    session_id: &str,
    mut emit_progress: F,
) -> AppResult<GlobalpingMeasurementResult>
where
    F: FnMut(&GlobalpingMeasurementResult),
{
    let started = Instant::now();
    let measurement_type = request_target.measurement_type().to_owned();
    let command_hint = format!(
        "globalping {} '{}' from {:?}",
        measurement_type, display_target, location_magics
    );
    let mut probes = BTreeMap::new();
    let token_result = tokio::select! {
        biased;
        _ = wait_for_cancellation(session_id) => {
            return Ok(make_remote_result(display_target, measurement_type, probes, started, command_hint, session_id, true));
        }
        result = tauri::async_runtime::spawn_blocking(super::globalping_token::load_token) => result,
    };
    let token = match token_result {
        Ok(Ok(token)) => token,
        Ok(Err(_)) | Err(_) => {
            probes.insert(0, globalping_measurement_failure("credentialStore", None));
            return Ok(make_remote_result(
                display_target,
                measurement_type,
                probes,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
    };
    let magics = location_magics;
    let client = match reqwest::Client::builder()
        .timeout(GP_REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
    {
        Ok(client) => client,
        Err(_error) => {
            probes.insert(0, globalping_measurement_failure("request", None));
            return Ok(make_remote_result(
                display_target,
                measurement_type,
                probes,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
    };
    let locations: Vec<serde_json::Value> = magics
        .iter()
        .map(|magic| serde_json::json!({ "magic": magic, "limit": 1 }))
        .collect();
    let body = serde_json::json!({
        "type": measurement_type,
        "target": request_target.api_target(),
        "locations": locations,
        "measurementOptions": request_target.measurement_options(),
        "inProgressUpdates": true,
        "timeout": 8
    });
    let deadline = TokioInstant::now() + GP_MEASUREMENT_TIMEOUT;
    let create_result = tokio::select! {
        biased;
        _ = wait_for_cancellation(session_id) => {
            return Ok(make_remote_result(display_target, measurement_type, probes, started, command_hint, session_id, true));
        }
        result = tokio::time::timeout_at(deadline, async {
            let response = with_optional_bearer(
                client.post(GP_API).json(&body), token.as_ref().map(|token| token.as_str())
            ).send().await?;
            if response.status().as_u16() == 429 {
                return Ok::<_, reqwest::Error>(CreateOutcome::Quota(parse_rate_limit_info(response.headers())));
            }
            let status = response.status();
            if !status.is_success() {
                return Ok(CreateOutcome::Http(status.as_u16()));
            }
            Ok(match parse_limited_json::<GpCreate>(response).await {
                Ok(created) => CreateOutcome::Created(created),
                Err(()) => CreateOutcome::InvalidResponse,
            })
        }) => result,
    };
    let created = match create_result {
        Err(_) => {
            probes.insert(0, globalping_measurement_failure("timeout", None));
            return Ok(make_remote_result(
                display_target,
                measurement_type,
                probes,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
        Ok(Ok(CreateOutcome::Created(created))) => created,
        Ok(Ok(CreateOutcome::Quota(rate_limit))) => {
            probes.insert(0, globalping_measurement_failure("quota", rate_limit));
            return Ok(make_remote_result(
                display_target,
                measurement_type,
                probes,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
        Ok(Ok(CreateOutcome::Http(status))) => {
            probes.insert(
                0,
                globalping_measurement_failure(http_failure_kind(status), None),
            );
            return Ok(make_remote_result(
                display_target,
                measurement_type,
                probes,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
        Ok(Ok(CreateOutcome::InvalidResponse)) => {
            probes.insert(0, globalping_measurement_failure("request", None));
            return Ok(make_remote_result(
                display_target,
                measurement_type,
                probes,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
        Ok(Err(error)) => {
            probes.insert(
                0,
                globalping_measurement_failure(request_failure_kind(&error), None),
            );
            return Ok(make_remote_result(
                display_target,
                measurement_type,
                probes,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
    };

    let Some(url) = measurement_url(&created.id) else {
        probes.insert(0, globalping_measurement_failure("request", None));
        return Ok(make_remote_result(
            display_target,
            measurement_type,
            probes,
            started,
            command_hint,
            session_id,
            false,
        ));
    };
    let mut measurement_etag: Option<HeaderValue> = None;
    loop {
        if super::session::is_cancelled(session_id) {
            return Ok(make_remote_result(
                display_target,
                measurement_type,
                probes,
                started,
                command_hint,
                session_id,
                true,
            ));
        }
        if TokioInstant::now() >= deadline {
            probes
                .entry(usize::MAX)
                .or_insert_with(|| globalping_measurement_failure("timeout", None));
            break;
        }
        let poll_result = tokio::select! {
            biased;
            _ = wait_for_cancellation(session_id) => {
                return Ok(make_remote_result(display_target, measurement_type, probes, started, command_hint, session_id, true));
            }
            result = tokio::time::timeout_at(deadline, async {
                let response = with_if_none_match(
                    with_optional_bearer(client.get(&url), token.as_ref().map(|token| token.as_str())),
                    measurement_etag.as_ref(),
                ).send().await?;
                if response.status().as_u16() == 429 {
                    return Ok::<_, reqwest::Error>(PollOutcome::Quota(parse_rate_limit_info(response.headers())));
                }
                if response.status() == StatusCode::NOT_MODIFIED {
                    return Ok(PollOutcome::NotModified);
                }
                let status = response.status();
                if !status.is_success() {
                    return Ok(PollOutcome::Http(status.as_u16()));
                }
                let etag = response.headers().get(ETAG).cloned();
                Ok(match parse_limited_json::<GpResult>(response).await {
                    Ok(result) => PollOutcome::Result(result, etag),
                    Err(()) => PollOutcome::InvalidResponse,
                })
            }) => result,
        };
        match poll_result {
            Err(_) => {
                probes
                    .entry(usize::MAX)
                    .or_insert_with(|| globalping_measurement_failure("timeout", None));
                break;
            }
            Ok(Ok(PollOutcome::Result(result, etag))) => {
                measurement_etag = etag;
                let changed = merge_remote_measurement_results(
                    &mut probes,
                    &result,
                    matches!(&request_target, RemoteMeasurementTarget::Ping { .. }),
                );
                if changed {
                    emit_progress(&make_remote_result(
                        display_target.clone(),
                        measurement_type.clone(),
                        probes.clone(),
                        started,
                        command_hint.clone(),
                        session_id,
                        false,
                    ));
                }
                if is_measurement_terminal(&result.status) {
                    if result.results.is_empty() {
                        probes
                            .entry(usize::MAX)
                            .or_insert_with(|| globalping_measurement_failure("measurement", None));
                    }
                    break;
                }
            }
            Ok(Ok(PollOutcome::NotModified)) => {}
            Ok(Ok(PollOutcome::Quota(rate_limit))) => {
                probes
                    .entry(usize::MAX)
                    .or_insert_with(|| globalping_measurement_failure("quota", rate_limit));
                break;
            }
            Ok(Ok(PollOutcome::Http(status))) => {
                probes.entry(usize::MAX).or_insert_with(|| {
                    globalping_measurement_failure(http_failure_kind(status), None)
                });
                break;
            }
            Ok(Ok(PollOutcome::InvalidResponse)) => {
                probes
                    .entry(usize::MAX)
                    .or_insert_with(|| globalping_measurement_failure("request", None));
                break;
            }
            Ok(Err(error)) => {
                probes.entry(usize::MAX).or_insert_with(|| {
                    globalping_measurement_failure(request_failure_kind(&error), None)
                });
                break;
            }
        }
        tokio::select! {
            biased;
            _ = wait_for_cancellation(session_id) => {
                return Ok(make_remote_result(display_target, measurement_type, probes, started, command_hint, session_id, true));
            }
            _ = tokio::time::sleep_until(next_poll_wakeup(TokioInstant::now(), deadline)) => {}
        }
    }
    Ok(make_remote_result(
        display_target,
        measurement_type,
        probes,
        started,
        command_hint,
        session_id,
        false,
    ))
}

fn merge_remote_measurement_results(
    probes: &mut BTreeMap<usize, GlobalpingProbeMeasurement>,
    result: &GpResult,
    include_raw_output: bool,
) -> bool {
    let mut changed = false;
    for (idx, probe_result) in result.results.iter().enumerate() {
        if probe_result.result.status.is_empty() || probe_result.result.status == "in-progress" {
            continue;
        }
        if let std::collections::btree_map::Entry::Vacant(entry) = probes.entry(idx) {
            entry.insert(map_remote_measurement_result(
                idx,
                probe_result,
                include_raw_output,
            ));
            changed = true;
        }
    }
    changed
}

fn map_remote_measurement_result(
    idx: usize,
    probe_result: &GpProbeResult,
    include_raw_output: bool,
) -> GlobalpingProbeMeasurement {
    let label = format!(
        "Globalping · {}/{}",
        probe_result.probe.city.as_deref().unwrap_or("?"),
        probe_result.probe.country.as_deref().unwrap_or("?")
    );
    let failed = probe_result.result.status != "finished";
    let stats = probe_result
        .result
        .stats
        .as_ref()
        .map(|stats| GlobalpingPingStats {
            min_rtt_ms: stats.min,
            avg_rtt_ms: stats.avg,
            max_rtt_ms: stats.max,
            loss_percent: stats.loss,
            packets_sent: stats.total,
            packets_received: stats.rcv,
        });
    let timings = probe_result
        .result
        .timings
        .as_ref()
        .map(|timings| GlobalpingHttpTimings {
            total_ms: timings.total,
            dns_ms: timings.dns,
            tcp_ms: timings.tcp,
            tls_ms: timings.tls,
            first_byte_ms: timings.first_byte,
            download_ms: timings.download,
        });
    GlobalpingProbeMeasurement {
        node_id: format!("gp-{idx}"),
        node_label: label,
        status: probe_result.result.status.clone(),
        failure_kind: failed.then(|| "measurement".into()),
        // HTTP raw output may echo a user-supplied private URL path. Structured
        // status and timing fields are sufficient; keep raw text only for Ping.
        detail: include_raw_output
            .then(|| probe_result.result.raw_output.clone())
            .flatten(),
        resolved_address: probe_result.result.resolved_address.clone(),
        ping_stats: stats,
        http_status_code: probe_result.result.status_code,
        http_status_name: probe_result.result.status_code_name.clone(),
        http_timings: timings,
        rate_limit: None,
    }
}

fn globalping_measurement_failure(
    failure_kind: &str,
    rate_limit: Option<GlobalpingRateLimitInfo>,
) -> GlobalpingProbeMeasurement {
    GlobalpingProbeMeasurement {
        node_id: "globalping".into(),
        node_label: "Globalping".into(),
        status: "failed".into(),
        failure_kind: Some(failure_kind.into()),
        detail: None,
        resolved_address: None,
        ping_stats: None,
        http_status_code: None,
        http_status_name: None,
        http_timings: None,
        rate_limit,
    }
}

fn request_failure_kind(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        "timeout"
    } else {
        "request"
    }
}

fn http_failure_kind(status: u16) -> &'static str {
    if status == 401 || status == 403 {
        "auth"
    } else {
        "request"
    }
}

fn make_remote_result(
    target: String,
    measurement_type: String,
    probes: BTreeMap<usize, GlobalpingProbeMeasurement>,
    started: Instant,
    command_hint: String,
    session_id: &str,
    cancelled: bool,
) -> GlobalpingMeasurementResult {
    GlobalpingMeasurementResult {
        target,
        measurement_type,
        probes: probes.into_values().collect(),
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        session_id: session_id.into(),
        cancelled,
        command_hint,
    }
}

async fn compare_dns_multi_with_session<F>(
    domain: String,
    location_magics: Vec<String>,
    session_id: &str,
    mut emit_progress: F,
) -> AppResult<MultiNodeDnsResult>
where
    F: FnMut(&MultiNodeDnsResult),
{
    let started = Instant::now();
    let command_hint = format!(
        "dnsLookup(multi, '{domain}') // via globalping locations={:?}",
        location_magics
    );
    let mut answers = Vec::new();

    // Keep the local answer useful even when a system resolver stalls.
    let local_result = tokio::select! {
        biased;
        _ = wait_for_cancellation(session_id) => {
            return Ok(make_result(domain, answers, started, command_hint, session_id, true));
        }
        result = tokio::time::timeout(LOCAL_DNS_TIMEOUT, super::dns::dns_lookup(domain.clone(), Some("A".into()), None)) => result,
    };
    match local_result {
        Ok(Ok(res)) => {
            let vals: Vec<String> = res.records.into_iter().map(|r| r.data).collect();
            answers.push(NodeDnsAnswer {
                node_id: "local".into(),
                node_label: "This Mac".into(),
                ok: true,
                answers: vals,
                detail: None,
                failure_kind: None,
                rate_limit: None,
            });
        }
        Ok(Err(error)) => answers.push(NodeDnsAnswer {
            node_id: "local".into(),
            node_label: "This Mac".into(),
            ok: false,
            answers: vec![],
            detail: Some(error.to_string()),
            failure_kind: Some("request".into()),
            rate_limit: None,
        }),
        Err(_) => answers.push(NodeDnsAnswer {
            node_id: "local".into(),
            node_label: "This Mac".into(),
            ok: false,
            answers: vec![],
            detail: None,
            failure_kind: Some("timeout".into()),
            rate_limit: None,
        }),
    }
    if super::session::is_cancelled(session_id) {
        return Ok(make_result(
            domain,
            answers,
            started,
            command_hint,
            session_id,
            true,
        ));
    }

    let mut remote_answers = BTreeMap::new();
    emit_progress(&make_result(
        domain.clone(),
        answers.clone(),
        started,
        command_hint.clone(),
        session_id,
        false,
    ));

    let token_result = tokio::select! {
        biased;
        _ = wait_for_cancellation(session_id) => {
            return Ok(make_result(domain, materialize_answers(&answers, &remote_answers), started, command_hint, session_id, true));
        }
        result = tauri::async_runtime::spawn_blocking(super::globalping_token::load_token) => result,
    };
    let token = match token_result {
        Ok(Ok(token)) => token,
        Ok(Err(error)) => {
            answers.push(globalping_failure("credentialStore", Some(error.message)));
            return Ok(make_result(
                domain,
                answers,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
        Err(_) => {
            answers.push(globalping_failure("credentialStore", None));
            return Ok(make_result(
                domain,
                answers,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
    };

    let magics = location_magics;
    let client = match reqwest::Client::builder()
        .timeout(GP_REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            answers.push(globalping_failure("request", Some(error.to_string())));
            return Ok(make_result(
                domain,
                answers,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
    };
    let locations: Vec<serde_json::Value> = magics
        .iter()
        .map(|magic| serde_json::json!({ "magic": magic, "limit": 1 }))
        .collect();
    let body = serde_json::json!({
        "type": "dns",
        "target": domain.clone(),
        "locations": locations,
        "measurementOptions": { "query": { "type": "A" } },
        "inProgressUpdates": true
    });
    let deadline = TokioInstant::now() + GP_MEASUREMENT_TIMEOUT;

    let create_result = tokio::select! {
        biased;
        _ = wait_for_cancellation(session_id) => {
            return Ok(make_result(domain, materialize_answers(&answers, &remote_answers), started, command_hint, session_id, true));
        }
        result = tokio::time::timeout_at(deadline, async {
            let request = with_optional_bearer(
                client.post(GP_API).json(&body),
                token.as_ref().map(|token| token.as_str()),
            );
            let response = request.send().await?;
            if response.status().as_u16() == 429 {
                return Ok::<_, reqwest::Error>(CreateOutcome::Quota(parse_rate_limit_info(
                    response.headers(),
                )));
            }
            let status = response.status();
            if !status.is_success() {
                return Ok(CreateOutcome::Http(status.as_u16()));
            }
            Ok(match parse_limited_json::<GpCreate>(response).await {
                Ok(created) => CreateOutcome::Created(created),
                Err(()) => CreateOutcome::InvalidResponse,
            })
        }) => result,
    };

    let created = match create_result {
        Err(_) => {
            answers.push(globalping_failure("timeout", None));
            return Ok(make_result(
                domain,
                answers,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
        Ok(Ok(CreateOutcome::Created(created))) => created,
        Ok(Ok(CreateOutcome::Quota(rate_limit))) => {
            answers.push(globalping_quota_failure(rate_limit));
            return Ok(make_result(
                domain,
                answers,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
        Ok(Ok(CreateOutcome::Http(status))) => {
            answers.push(globalping_http_failure(status));
            return Ok(make_result(
                domain,
                answers,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
        Ok(Ok(CreateOutcome::InvalidResponse)) => {
            answers.push(globalping_failure("request", None));
            return Ok(make_result(
                domain,
                answers,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
        Ok(Err(error)) => {
            answers.push(globalping_request_failure(error));
            return Ok(make_result(
                domain,
                answers,
                started,
                command_hint,
                session_id,
                false,
            ));
        }
    };

    let Some(url) = measurement_url(&created.id) else {
        answers.push(globalping_failure("request", None));
        return Ok(make_result(
            domain,
            materialize_answers(&answers, &remote_answers),
            started,
            command_hint,
            session_id,
            false,
        ));
    };
    let mut measurement_etag: Option<HeaderValue> = None;
    loop {
        if super::session::is_cancelled(session_id) {
            return Ok(make_result(
                domain,
                materialize_answers(&answers, &remote_answers),
                started,
                command_hint,
                session_id,
                true,
            ));
        }
        if TokioInstant::now() >= deadline {
            answers.push(globalping_failure("timeout", None));
            break;
        }

        // Globalping defines every status other than `in-progress` as terminal.
        let poll_result = tokio::select! {
            biased;
            _ = wait_for_cancellation(session_id) => {
            return Ok(make_result(domain, materialize_answers(&answers, &remote_answers), started, command_hint, session_id, true));
            }
            result = tokio::time::timeout_at(deadline, async {
                let request = with_optional_bearer(
                    client.get(&url),
                    token.as_ref().map(|token| token.as_str()),
                );
                let response = with_if_none_match(request, measurement_etag.as_ref())
                    .send()
                    .await?;
                if response.status().as_u16() == 429 {
                    return Ok::<_, reqwest::Error>(PollOutcome::Quota(parse_rate_limit_info(
                        response.headers(),
                    )));
                }
                if response.status() == StatusCode::NOT_MODIFIED {
                    return Ok(PollOutcome::NotModified);
                }
                let status = response.status();
                if !status.is_success() {
                    return Ok(PollOutcome::Http(status.as_u16()));
                }
                let etag = response.headers().get(ETAG).cloned();
                Ok(match parse_limited_json::<GpResult>(response).await {
                    Ok(result) => PollOutcome::Result(result, etag),
                    Err(()) => PollOutcome::InvalidResponse,
                })
            }) => result,
        };

        match poll_result {
            Err(_) => {
                answers.push(globalping_failure("timeout", None));
                break;
            }
            Ok(Ok(PollOutcome::Result(result, _))) if is_measurement_terminal(&result.status) => {
                if result.results.is_empty() {
                    answers.push(globalping_failure("measurement", None));
                } else {
                    merge_measurement_results(&mut remote_answers, &result, true);
                    emit_progress(&make_result(
                        domain.clone(),
                        materialize_answers(&answers, &remote_answers),
                        started,
                        command_hint.clone(),
                        session_id,
                        false,
                    ));
                }
                break;
            }
            Ok(Ok(PollOutcome::Result(result, etag))) => {
                measurement_etag = etag;
                if merge_measurement_results(&mut remote_answers, &result, false) {
                    emit_progress(&make_result(
                        domain.clone(),
                        materialize_answers(&answers, &remote_answers),
                        started,
                        command_hint.clone(),
                        session_id,
                        false,
                    ));
                }
            }
            Ok(Ok(PollOutcome::NotModified)) => {}
            Ok(Ok(PollOutcome::Quota(rate_limit))) => {
                answers.push(globalping_quota_failure(rate_limit));
                break;
            }
            Ok(Ok(PollOutcome::Http(status))) => {
                answers.push(globalping_http_failure(status));
                break;
            }
            Ok(Ok(PollOutcome::InvalidResponse)) => {
                answers.push(globalping_failure("request", None));
                break;
            }
            Ok(Err(error)) => {
                answers.push(globalping_request_failure(error));
                break;
            }
        }

        tokio::select! {
            biased;
            _ = wait_for_cancellation(session_id) => {
                return Ok(make_result(domain, materialize_answers(&answers, &remote_answers), started, command_hint, session_id, true));
            }
            _ = tokio::time::sleep_until(next_poll_wakeup(TokioInstant::now(), deadline)) => {}
        }
    }

    Ok(make_result(
        domain,
        materialize_answers(&answers, &remote_answers),
        started,
        command_hint,
        session_id,
        false,
    ))
}

#[derive(Debug)]
enum CreateOutcome {
    Created(GpCreate),
    Quota(Option<GlobalpingRateLimitInfo>),
    Http(u16),
    InvalidResponse,
}

#[derive(Debug)]
enum PollOutcome {
    Result(GpResult, Option<HeaderValue>),
    NotModified,
    Quota(Option<GlobalpingRateLimitInfo>),
    Http(u16),
    InvalidResponse,
}

async fn parse_limited_json<T: DeserializeOwned>(mut response: Response) -> Result<T, ()> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_GLOBALPING_RESPONSE_BYTES as u64)
    {
        return Err(());
    }

    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ())? {
        append_limited_response_chunk(&mut body, &chunk)?;
    }
    serde_json::from_slice(&body).map_err(|_| ())
}

fn append_limited_response_chunk(body: &mut Vec<u8>, chunk: &[u8]) -> Result<(), ()> {
    if body.len().saturating_add(chunk.len()) > MAX_GLOBALPING_RESPONSE_BYTES {
        return Err(());
    }
    body.extend_from_slice(chunk);
    Ok(())
}

fn merge_measurement_results(
    answers: &mut BTreeMap<usize, NodeDnsAnswer>,
    result: &GpResult,
    include_in_progress: bool,
) -> bool {
    let mut changed = false;
    for (idx, probe_result) in result.results.iter().enumerate() {
        if !include_in_progress
            && (probe_result.result.status.is_empty()
                || probe_result.result.status == "in-progress")
        {
            continue;
        }
        if let std::collections::btree_map::Entry::Vacant(entry) = answers.entry(idx) {
            entry.insert(map_measurement_result(idx, probe_result));
            changed = true;
        }
    }
    changed
}

fn map_measurement_result(idx: usize, probe_result: &GpProbeResult) -> NodeDnsAnswer {
    let label = format!(
        "Globalping · {}/{}",
        probe_result
            .probe
            .city
            .clone()
            .unwrap_or_else(|| "?".into()),
        probe_result
            .probe
            .country
            .clone()
            .unwrap_or_else(|| "?".into())
    );
    let vals: Vec<String> = probe_result
        .result
        .answers
        .iter()
        .map(|answer| {
            if answer.rr_type.is_empty() {
                answer.value.clone()
            } else {
                format!("{} {}", answer.rr_type, answer.value)
            }
        })
        .collect();
    let (ok, failure_kind) = classify_probe_result(&probe_result.result.status, !vals.is_empty());
    NodeDnsAnswer {
        node_id: format!("gp-{idx}"),
        node_label: label,
        ok,
        answers: vals,
        detail: probe_result.result.raw_output.clone(),
        failure_kind: failure_kind.map(str::to_owned),
        rate_limit: None,
    }
}

fn materialize_answers(
    local_answers: &[NodeDnsAnswer],
    remote_answers: &BTreeMap<usize, NodeDnsAnswer>,
) -> Vec<NodeDnsAnswer> {
    let mut answers = local_answers.to_vec();
    answers.extend(remote_answers.values().cloned());
    answers
}

fn classify_probe_result(status: &str, has_answers: bool) -> (bool, Option<&'static str>) {
    match (status, has_answers) {
        ("finished", true) => (true, None),
        ("finished", false) => (false, Some("noAnswers")),
        _ => (false, Some("measurement")),
    }
}

fn is_measurement_terminal(status: &str) -> bool {
    status != "in-progress"
}

fn next_poll_wakeup(now: TokioInstant, deadline: TokioInstant) -> TokioInstant {
    std::cmp::min(now + GP_POLL_INTERVAL, deadline)
}

fn measurement_url(id: &str) -> Option<String> {
    (!id.is_empty() && id.bytes().all(|byte| byte.is_ascii_alphanumeric()))
        .then(|| format!("{GP_API}/{id}"))
}

fn globalping_failure(failure_kind: &str, detail: Option<String>) -> NodeDnsAnswer {
    NodeDnsAnswer {
        node_id: "globalping".into(),
        node_label: "Globalping".into(),
        ok: false,
        answers: vec![],
        detail,
        failure_kind: Some(failure_kind.into()),
        rate_limit: None,
    }
}

fn with_optional_bearer(request: RequestBuilder, token: Option<&str>) -> RequestBuilder {
    match token {
        Some(token) => request.bearer_auth(token),
        None => request,
    }
}

fn with_if_none_match(request: RequestBuilder, etag: Option<&HeaderValue>) -> RequestBuilder {
    match etag {
        Some(etag) => request.header(IF_NONE_MATCH, etag.clone()),
        None => request,
    }
}

fn globalping_http_failure(status: u16) -> NodeDnsAnswer {
    let failure_kind = if status == 401 || status == 403 {
        "auth"
    } else {
        "request"
    };
    globalping_failure(failure_kind, Some(format!("Globalping HTTP {status}")))
}

fn globalping_quota_failure(rate_limit: Option<GlobalpingRateLimitInfo>) -> NodeDnsAnswer {
    let mut answer = globalping_failure("quota", None);
    answer.rate_limit = rate_limit;
    answer
}

fn parse_rate_limit_info(headers: &HeaderMap) -> Option<GlobalpingRateLimitInfo> {
    let parse_header = |name: &str| {
        headers
            .get(name)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.trim().parse::<u64>().ok())
    };
    let limit = parse_header("x-ratelimit-limit");
    let consumed = parse_header("x-ratelimit-consumed");
    let remaining = parse_header("x-ratelimit-remaining");
    // Globalping defines both Retry-After and X-RateLimit-Reset as relative seconds.
    let wait_seconds = parse_header("retry-after").or_else(|| parse_header("x-ratelimit-reset"));
    let credits_consumed = parse_header("x-credits-consumed");
    let credits_remaining = parse_header("x-credits-remaining");
    let request_cost = parse_header("x-request-cost");

    (limit.is_some()
        || consumed.is_some()
        || remaining.is_some()
        || wait_seconds.is_some()
        || credits_consumed.is_some()
        || credits_remaining.is_some()
        || request_cost.is_some())
    .then_some(GlobalpingRateLimitInfo {
        limit,
        consumed,
        remaining,
        wait_seconds,
        credits_consumed,
        credits_remaining,
        request_cost,
    })
}

fn globalping_request_failure(error: reqwest::Error) -> NodeDnsAnswer {
    let failure_kind = if error.is_timeout() {
        "timeout"
    } else {
        "request"
    };
    globalping_failure(failure_kind, Some(error.to_string()))
}

fn make_result(
    domain: String,
    answers: Vec<NodeDnsAnswer>,
    started: Instant,
    command_hint: String,
    session_id: &str,
    cancelled: bool,
) -> MultiNodeDnsResult {
    MultiNodeDnsResult {
        domain,
        answers,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        session_id: session_id.into(),
        cancelled,
        command_hint,
    }
}

async fn wait_for_cancellation(session_id: &str) {
    while !super::session::is_cancelled(session_id) {
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::{
        append_limited_response_chunk, classify_probe_result, compare_dns_multi_with_session,
        globalping_http_failure, is_measurement_terminal, list_nodes_with_agents,
        map_remote_measurement_result, measurement_url, merge_measurement_results,
        next_poll_wakeup, normalize_location_magics, parse_rate_limit_info,
        prepare_remote_measurement_target, redact_remote_display_target,
        validate_public_target_host, with_if_none_match, with_optional_bearer, GpAnswer, GpInner,
        GpProbeMeta, GpProbeResult, GpResult, MAX_GLOBALPING_RESPONSE_BYTES,
    };
    use crate::net_probe::session::{cancel_scan, clear_session, new_session_id};
    use reqwest::header::{HeaderMap, HeaderValue, IF_NONE_MATCH};
    use reqwest::{Client, StatusCode};
    use std::collections::BTreeMap;
    use std::time::Duration;
    use tokio::time::Instant;

    #[test]
    fn follows_globalping_terminal_status_contract() {
        assert!(!is_measurement_terminal("in-progress"));
        assert!(is_measurement_terminal("finished"));
        assert!(is_measurement_terminal("failed"));
        assert!(is_measurement_terminal("unknown-future-status"));
    }

    #[test]
    fn built_in_globalping_nodes_advertise_only_bench_wired_capabilities() {
        let nodes = list_nodes_with_agents(&[]);
        let globalping_nodes: Vec<_> = nodes
            .iter()
            .filter(|node| node.kind == "remote-proxy")
            .collect();

        assert_eq!(globalping_nodes.len(), 3);
        assert_eq!(
            globalping_nodes
                .iter()
                .map(|node| node.id.as_str())
                .collect::<Vec<_>>(),
            vec!["gp-world", "gp-us", "gp-eu"]
        );
        for node in globalping_nodes {
            assert_eq!(
                node.capabilities.as_ref().unwrap(),
                &vec!["dns".to_owned(), "ping".to_owned(), "http".to_owned()]
            );
        }
    }

    #[test]
    fn globalping_locations_are_bounded_and_restricted_to_supported_presets() {
        assert_eq!(
            normalize_location_magics(vec!["world".into(), "US".into(), "Europe".into()]).unwrap(),
            vec!["world".to_owned(), "US".to_owned(), "Europe".to_owned()]
        );
        assert_eq!(
            normalize_location_magics(Vec::new()).unwrap(),
            vec!["world".to_owned()]
        );
        assert_eq!(
            normalize_location_magics(vec!["world".into(); 4])
                .unwrap_err()
                .code,
            "INVALID_GLOBALPING_LOCATIONS"
        );
        assert!(normalize_location_magics(vec!["world".into(), "world".into()]).is_err());
        assert!(normalize_location_magics(vec!["Asia".into()]).is_err());
        assert!(normalize_location_magics(vec!["world\nforged-report-line".into()]).is_err());
        assert!(normalize_location_magics(vec!["x".repeat(4096)]).is_err());
    }

    #[test]
    fn remote_measurements_reject_private_targets_and_sensitive_http_url_parts() {
        assert!(validate_public_target_host("localhost").is_err());
        assert!(validate_public_target_host("192.168.1.10").is_err());
        assert!(validate_public_target_host("203.0.113.10").is_err());
        assert!(validate_public_target_host("iana.org").is_ok());
        for globally_reachable_special in ["192.0.0.9", "192.0.0.10"] {
            assert!(
                validate_public_target_host(globally_reachable_special).is_ok(),
                "globally reachable IANA exception {globally_reachable_special} should pass"
            );
        }
        for unavailable_special in ["192.0.0.8", "192.0.0.170", "192.0.0.171"] {
            assert!(
                validate_public_target_host(unavailable_special).is_err(),
                "non-global IANA special address {unavailable_special} should be rejected"
            );
        }
        for alternate_ipv4 in ["127.1", "0177.0.0.1", "0x7f.0.0.1", "0x7f000001"] {
            assert!(
                validate_public_target_host(alternate_ipv4).is_err(),
                "alternate IPv4 target {alternate_ipv4} must be canonicalized and rejected"
            );
        }
        for special_name in [
            "router",
            "router.home.arpa",
            "resolver.arpa",
            "printer.local",
            "hidden.onion",
            "service.alt",
            "example.com",
            "www.example.com",
            "example.net",
            "docs.example.org",
        ] {
            assert!(
                validate_public_target_host(special_name).is_err(),
                "special-use or single-label target {special_name} must be rejected"
            );
        }
        for special_ipv6 in [
            "100::1",
            "2001::1",
            "2001:2::1",
            "2001:db8::1",
            "2002:c000:0201::1",
            "3fff::1",
            "5f00::1",
        ] {
            assert!(
                validate_public_target_host(special_ipv6).is_err(),
                "special-purpose IPv6 target {special_ipv6} must be rejected"
            );
        }
        assert!(validate_public_target_host("2001:4860:4860::8888").is_ok());
        assert!(validate_public_target_host("2001:3::1").is_ok());
        assert!(validate_public_target_host("2001:1::1").is_ok());

        assert!(prepare_remote_measurement_target("ping", "https://example.com", None).is_err());
        assert!(
            prepare_remote_measurement_target("http", "http://127.0.0.1/", Some("GET")).is_err()
        );
        assert!(prepare_remote_measurement_target("http", "http://[::1]/", Some("GET")).is_err());
        assert!(prepare_remote_measurement_target("ping", "example.com:443", None).is_err());
        assert_eq!(
            prepare_remote_measurement_target("ping", "[2001:4860:4860::8888]", None)
                .expect("public IPv6 target should pass")
                .api_target(),
            "2001:4860:4860::8888"
        );
        assert!(prepare_remote_measurement_target(
            "http",
            "https://iana.org/?token=secret",
            Some("GET")
        )
        .is_err());
        assert!(
            prepare_remote_measurement_target("http", "https://user@iana.org/", Some("GET"))
                .is_err()
        );
        assert!(
            prepare_remote_measurement_target("http", "https://iana.org/path", Some("POST"))
                .is_err()
        );
    }

    #[test]
    fn globalping_dns_rejects_nonpublic_names_and_ip_literals_before_network_io() {
        for domain in [
            "router",
            "router.home.arpa",
            "printer.local",
            "service.internal",
            "host.example",
            "192.168.1.10",
            "8.8.8.8",
            "[2001:4860:4860::8888]",
            "127.1",
        ] {
            assert!(
                super::validate_dns_target_input(domain).is_err(),
                "invalid DNS target {domain} must be rejected"
            );
        }

        assert!(super::validate_dns_target_input("iana.org").is_ok());
        assert!(super::validate_dns_target_input("www.iana.org.").is_ok());
    }

    #[test]
    fn remote_http_url_maps_to_safe_globalping_options() {
        let target =
            prepare_remote_measurement_target("http", "https://www.iana.org/domains", Some("HEAD"))
                .expect("public URL with a supported method should pass");
        assert_eq!(target.api_target(), "www.iana.org");
        assert_eq!(target.measurement_type(), "http");
        assert_eq!(
            target.measurement_options(),
            serde_json::json!({
                "protocol": "HTTPS",
                "port": 443,
                "request": { "path": "/domains", "method": "HEAD" }
            })
        );
    }

    #[test]
    fn remote_measurement_display_redacts_private_url_paths_and_query_values() {
        assert_eq!(
            redact_remote_display_target(
                "https://user:secret@www.iana.org/private/customer/42?token=secret#private"
            ),
            "https://www.iana.org/[redacted-path]?[redacted]#[redacted]"
        );
        assert_eq!(redact_remote_display_target("example.com"), "example.com");
    }

    #[test]
    fn globalping_camel_case_http_fields_deserialize_into_typed_metrics() {
        let result: GpProbeResult = serde_json::from_value(serde_json::json!({
            "probe": { "city": "Frankfurt", "country": "DE" },
            "result": {
                "status": "finished",
                "rawOutput": "HTTP/2 200 OK",
                "resolvedAddress": "203.0.113.9",
                "statusCode": 200,
                "statusCodeName": "OK",
                "timings": {
                    "total": 120,
                    "dns": 10,
                    "tcp": 32,
                    "tls": 30,
                    "firstByte": 40,
                    "download": 8
                }
            }
        }))
        .expect("Globalping camelCase result fields should deserialize");
        let mapped = map_remote_measurement_result(0, &result, false);

        assert_eq!(mapped.detail, None);
        assert_eq!(mapped.resolved_address.as_deref(), Some("203.0.113.9"));
        assert_eq!(mapped.http_status_code, Some(200));
        assert_eq!(mapped.http_status_name.as_deref(), Some("OK"));
        let timings = mapped.http_timings.expect("HTTP timing fields should map");
        assert_eq!(timings.total_ms, 120);
        assert_eq!(timings.first_byte_ms, 40);
        assert_eq!(timings.download_ms, 8);
    }

    #[test]
    fn measurement_poll_url_accepts_only_opaque_alphanumeric_ids() {
        assert!(measurement_url("a1B2c3").is_some());
        assert!(measurement_url("").is_none());
        assert!(measurement_url("../v1/probes").is_none());
        assert!(measurement_url("id?redirect=https://example.com").is_none());
    }

    #[test]
    fn bearer_token_is_optional_and_auth_failures_are_distinguished() {
        let anonymous = with_optional_bearer(Client::new().get("https://example.invalid"), None)
            .build()
            .unwrap();
        assert!(!anonymous
            .headers()
            .contains_key(reqwest::header::AUTHORIZATION));

        let authenticated = with_optional_bearer(
            Client::new().get("https://example.invalid"),
            Some("gp_test-token"),
        )
        .build()
        .unwrap();
        assert_eq!(
            authenticated
                .headers()
                .get(reqwest::header::AUTHORIZATION)
                .unwrap(),
            "Bearer gp_test-token"
        );

        assert_eq!(
            globalping_http_failure(StatusCode::UNAUTHORIZED.as_u16())
                .failure_kind
                .as_deref(),
            Some("auth")
        );
        assert_eq!(
            globalping_http_failure(429).failure_kind.as_deref(),
            Some("request")
        );
    }

    #[test]
    fn measurement_poll_uses_etag_only_after_the_server_provides_one() {
        let client = Client::new();
        let etag = HeaderValue::from_static("\"measurement-v1\"");
        let initial = with_if_none_match(client.get("https://example.invalid"), None)
            .build()
            .unwrap();
        assert!(!initial.headers().contains_key(IF_NONE_MATCH));

        let cached = with_if_none_match(client.get("https://example.invalid"), Some(&etag))
            .build()
            .unwrap();
        assert_eq!(cached.headers().get(IF_NONE_MATCH), Some(&etag));
    }

    #[test]
    fn globalping_response_chunks_are_bounded_without_appending_over_limit() {
        let mut body = Vec::new();
        let within_limit = vec![b'x'; MAX_GLOBALPING_RESPONSE_BYTES];

        assert!(append_limited_response_chunk(&mut body, &within_limit).is_ok());
        assert_eq!(body.len(), MAX_GLOBALPING_RESPONSE_BYTES);
        assert!(append_limited_response_chunk(&mut body, b"x").is_err());
        assert_eq!(body.len(), MAX_GLOBALPING_RESPONSE_BYTES);
    }

    #[test]
    fn only_finished_probes_with_dns_answers_are_successful() {
        assert_eq!(classify_probe_result("finished", true), (true, None));
        assert_eq!(
            classify_probe_result("finished", false),
            (false, Some("noAnswers"))
        );
        assert_eq!(
            classify_probe_result("failed", true),
            (false, Some("measurement"))
        );
        assert_eq!(
            classify_probe_result("offline", false),
            (false, Some("measurement"))
        );
        assert_eq!(
            classify_probe_result("unknown-future-status", true),
            (false, Some("measurement"))
        );
    }

    #[test]
    fn poll_sleep_never_exceeds_measurement_deadline() {
        let now = Instant::now();
        let near_deadline = now + Duration::from_millis(100);
        assert_eq!(next_poll_wakeup(now, near_deadline), near_deadline);

        let later_deadline = now + Duration::from_secs(2);
        assert_eq!(
            next_poll_wakeup(now, later_deadline),
            now + Duration::from_millis(700)
        );
    }

    #[test]
    fn parses_globalping_rate_limit_headers_as_relative_seconds() {
        let mut headers = HeaderMap::new();
        headers.insert("x-ratelimit-limit", HeaderValue::from_static("250"));
        headers.insert("x-ratelimit-consumed", HeaderValue::from_static("3"));
        headers.insert("x-ratelimit-remaining", HeaderValue::from_static("0"));
        headers.insert("x-ratelimit-reset", HeaderValue::from_static("3600"));
        headers.insert("x-credits-consumed", HeaderValue::from_static("2"));
        headers.insert("x-credits-remaining", HeaderValue::from_static("18"));
        headers.insert("x-request-cost", HeaderValue::from_static("1"));

        let info = parse_rate_limit_info(&headers).expect("recognized rate limit headers");
        assert_eq!(info.limit, Some(250));
        assert_eq!(info.consumed, Some(3));
        assert_eq!(info.remaining, Some(0));
        assert_eq!(info.wait_seconds, Some(3600));
        assert_eq!(info.credits_consumed, Some(2));
        assert_eq!(info.credits_remaining, Some(18));
        assert_eq!(info.request_cost, Some(1));
    }

    #[test]
    fn retry_after_takes_precedence_and_invalid_headers_are_ignored() {
        let mut headers = HeaderMap::new();
        headers.insert("retry-after", HeaderValue::from_static("4"));
        headers.insert("x-ratelimit-reset", HeaderValue::from_static("3600"));
        headers.insert("x-ratelimit-limit", HeaderValue::from_static("invalid"));

        let info = parse_rate_limit_info(&headers).expect("retry-after is sufficient");
        assert_eq!(info.limit, None);
        assert_eq!(info.consumed, None);
        assert_eq!(info.remaining, None);
        assert_eq!(info.wait_seconds, Some(4));
        assert_eq!(info.credits_consumed, None);
        assert_eq!(info.credits_remaining, None);
        assert_eq!(info.request_cost, None);
    }

    #[test]
    fn omits_rate_limit_info_when_headers_are_missing_or_invalid() {
        let mut headers = HeaderMap::new();
        headers.insert("x-ratelimit-limit", HeaderValue::from_static("invalid"));
        assert!(parse_rate_limit_info(&headers).is_none());
    }

    #[tokio::test]
    async fn pre_cancelled_comparison_returns_without_network_work() {
        let session_id = new_session_id();
        cancel_scan(session_id.clone());

        let result = compare_dns_multi_with_session(
            "example.com".into(),
            vec!["world".into()],
            &session_id,
            |_| {},
        )
        .await
        .expect("a cancelled comparison should return its partial result");

        assert!(result.cancelled);
        assert_eq!(result.session_id, session_id);
        assert!(result.answers.is_empty());
        clear_session(&result.session_id);
    }

    #[test]
    fn partial_globalping_results_include_only_terminal_probes_and_keep_stable_indexes() {
        let result = GpResult {
            status: "in-progress".into(),
            results: vec![
                GpProbeResult {
                    result: GpInner {
                        status: "in-progress".into(),
                        answers: vec![],
                        ..GpInner::default()
                    },
                    probe: GpProbeMeta {
                        city: Some("Seattle".into()),
                        country: Some("US".into()),
                    },
                },
                GpProbeResult {
                    result: GpInner {
                        status: "".into(),
                        answers: vec![],
                        ..GpInner::default()
                    },
                    probe: GpProbeMeta {
                        city: Some("Seattle".into()),
                        country: Some("US".into()),
                    },
                },
                GpProbeResult {
                    result: GpInner {
                        status: "finished".into(),
                        answers: vec![GpAnswer {
                            value: "203.0.113.9".into(),
                            rr_type: "A".into(),
                        }],
                        ..GpInner::default()
                    },
                    probe: GpProbeMeta {
                        city: Some("Frankfurt".into()),
                        country: Some("DE".into()),
                    },
                },
            ],
        };
        let mut answers = BTreeMap::new();

        assert!(merge_measurement_results(&mut answers, &result, false));
        assert_eq!(answers.len(), 1);
        assert_eq!(answers.get(&2).unwrap().node_id, "gp-2");
        assert_eq!(answers.get(&2).unwrap().answers, vec!["A 203.0.113.9"]);
        assert!(!merge_measurement_results(&mut answers, &result, false));
    }
}
