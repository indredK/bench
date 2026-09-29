//! Globalping REST adapter for remote DNS, ping, and HTTP measurements.

use super::types::{
    GlobalpingMeasurementResult, GlobalpingProbeResult, GlobalpingRateLimit, ProbeNode,
};
use crate::error::{AppError, AppResult};
use reqwest::header::{HeaderMap, ETAG, IF_NONE_MATCH};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::IpAddr;
use std::time::Duration;
use tauri::Emitter;
use url::{Host, Url};

const GP_API: &str = "https://api.globalping.io/v1/measurements";
const GP_PROGRESS_EVENT: &str = "network-probe:globalping-progress";
const GP_TOKEN_ACCOUNT: &str = "api-token.v1";
const GP_MAX_LOCATIONS: usize = 3;
const GP_MAX_TARGET_LEN: usize = 2048;
const GP_REQUEST_TIMEOUT: Duration = Duration::from_secs(12);
const GP_MEASUREMENT_TIMEOUT: Duration = Duration::from_secs(50);
const GP_POLL_INTERVAL: Duration = Duration::from_millis(500);

const GP_LOCATIONS: [&str; 4] = ["world", "US", "Europe", "Asia"];

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
    // Globalping locations are selectable presets. `reachable` means the adapter is configured,
    // not that a probe in that region is currently online.
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
struct GpMeasurement {
    #[serde(default)]
    status: String,
    #[serde(default)]
    results: Vec<Value>,
}

#[derive(Debug, Clone)]
struct ValidatedTarget {
    api_target: String,
    display_target: String,
    host_for_log: String,
    measurement_options: Value,
}

/// `action` is one of `status`, `save`, or `clear`. The secret is never returned to the renderer.
pub fn manage_globalping_token(
    app_identifier: &str,
    action: &str,
    token: Option<String>,
) -> AppResult<bool> {
    let entry = globalping_token_entry(app_identifier)?;
    match action {
        "status" if token.is_none() => match entry.get_password() {
            Ok(_) => Ok(true),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(_) => Err(token_storage_error()),
        },
        "save" => {
            let token = token.ok_or_else(|| invalid_input("A Globalping token is required."))?;
            let token = token.trim();
            if token.is_empty()
                || token.len() > 2048
                || !token.is_ascii()
                || token
                    .chars()
                    .any(|character| character.is_control() || character.is_whitespace())
            {
                return Err(invalid_input("The Globalping token format is invalid."));
            }
            entry
                .set_password(token)
                .map_err(|_| token_storage_error())?;
            Ok(true)
        }
        "clear" if token.is_none() => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(false),
            Err(_) => Err(token_storage_error()),
        },
        _ => Err(invalid_input("Invalid Globalping token operation.")),
    }
}

fn globalping_token_entry(app_identifier: &str) -> AppResult<keyring::Entry> {
    let service = globalping_token_service(app_identifier)?;
    keyring::Entry::new(&service, GP_TOKEN_ACCOUNT).map_err(|_| token_storage_error())
}

fn globalping_token_service(app_identifier: &str) -> AppResult<String> {
    if app_identifier.is_empty()
        || app_identifier.len() > 255
        || app_identifier
            .chars()
            .any(|character| !(character.is_ascii_alphanumeric() || ".-_".contains(character)))
    {
        return Err(token_storage_error());
    }
    Ok(format!("{app_identifier}.network-probe.globalping"))
}

fn token_storage_error() -> AppError {
    AppError::new(
        "GP_TOKEN_STORAGE",
        "Could not access the system secure credential store.",
    )
}

pub async fn run_measurement_multi(
    window: tauri::WebviewWindow,
    app_identifier: String,
    measurement_type: String,
    target: String,
    location_magics: Vec<String>,
) -> AppResult<GlobalpingMeasurementResult> {
    let measurement_type = validate_measurement_type(&measurement_type)?;
    let locations = validate_locations(location_magics)?;
    let validated_target = validate_target(measurement_type, &target)?;
    let started = std::time::Instant::now();
    let command_hint = format!(
        "globalping {} {} locations={}",
        measurement_type,
        validated_target.host_for_log,
        locations.join(",")
    );

    let mut local_results = Vec::new();
    if measurement_type == "dns" {
        let domain = validated_target.api_target.clone();
        match super::dns::dns_lookup(domain, Some("A".into()), None).await {
            Ok(result) => {
                let answers = result
                    .records
                    .into_iter()
                    .take(20)
                    .map(|record| bounded_text(&format!("{} {}", record.rr_type, record.data), 512))
                    .collect();
                local_results.push(GlobalpingProbeResult {
                    id: "local".into(),
                    label: "This Mac".into(),
                    status: "finished".into(),
                    summary: None,
                    detail: None,
                    answers,
                    dns_rcode: Some("NOERROR".into()),
                    avg_rtt_ms: None,
                    packet_loss_percent: None,
                    packets_sent: None,
                    packets_received: None,
                    http_status_code: None,
                    total_time_ms: None,
                    failure_source: None,
                });
            }
            Err(error) => local_results.push(GlobalpingProbeResult {
                id: "local".into(),
                label: "This Mac".into(),
                status: "failed".into(),
                summary: None,
                detail: Some(bounded_text(&error.to_string(), 1024)),
                answers: Vec::new(),
                dns_rcode: None,
                avg_rtt_ms: None,
                packet_loss_percent: None,
                packets_sent: None,
                packets_received: None,
                http_status_code: None,
                total_time_ms: None,
                failure_source: None,
            }),
        }
    }

    let token_identifier = app_identifier.clone();
    let token = tauri::async_runtime::spawn_blocking(move || {
        let entry = globalping_token_entry(&token_identifier)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(token_storage_error()),
        }
    })
    .await
    .ok()
    .and_then(Result::ok)
    .flatten();

    let client = reqwest::Client::builder()
        .timeout(GP_REQUEST_TIMEOUT)
        .user_agent("Bench-NetworkProbe/1.0")
        .default_headers({
            let mut headers = HeaderMap::new();
            headers.insert(
                reqwest::header::ACCEPT_ENCODING,
                reqwest::header::HeaderValue::from_static("gzip, br"),
            );
            headers
        })
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| AppError::new("GP_CLIENT", "Could not initialize Globalping client."))?;

    let body = build_measurement_body(measurement_type, &validated_target, &locations);
    let create_request = client.post(GP_API).json(&body);
    let create_request = match token.as_deref() {
        Some(token) => create_request.bearer_auth(token),
        None => create_request,
    };
    let response = create_request
        .send()
        .await
        .map_err(|_| AppError::new("GP_CLIENT", "Globalping measurement request failed."))?;

    if response.status().as_u16() == 429 {
        let rate_limit = rate_limit_from_headers(response.headers());
        return Ok(GlobalpingMeasurementResult {
            measurement_type: measurement_type.into(),
            target: validated_target.display_target,
            status: "rate-limited".into(),
            probes: local_results,
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            command_hint,
            rate_limit,
            retry_after_seconds: None,
        });
    }
    if !response.status().is_success() {
        return Err(AppError::new(
            "GP_RESPONSE",
            format!("Globalping returned HTTP {}.", response.status().as_u16()),
        ));
    }

    let created: GpCreate = response
        .json()
        .await
        .map_err(|_| AppError::new("GP_PARSE", "Invalid Globalping response."))?;
    if created.id.is_empty()
        || created.id.len() > 128
        || !created
            .id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_".contains(character))
    {
        return Err(AppError::new(
            "GP_PARSE",
            "Invalid Globalping measurement ID.",
        ));
    }

    let deadline = tokio::time::Instant::now() + GP_MEASUREMENT_TIMEOUT;
    let result_url = format!("{GP_API}/{}", created.id);
    let mut etag: Option<String> = None;
    let mut latest: Option<GpMeasurement> = None;
    let mut retry_after_seconds = None;
    let mut last_emitted_probes: Option<Vec<u8>> = None;

    let terminal_status = loop {
        if tokio::time::Instant::now() >= deadline {
            break "timed-out";
        }
        // Globalping requires at least 500 ms between measurement reads, measured after response.
        tokio::time::sleep(GP_POLL_INTERVAL).await;
        if tokio::time::Instant::now() >= deadline {
            break "timed-out";
        }
        let mut request = client.get(&result_url);
        if let Some(etag) = etag.as_deref() {
            request = request.header(IF_NONE_MATCH, etag);
        }
        if let Some(token) = token.as_deref() {
            request = request.bearer_auth(token);
        }

        let response = match tokio::time::timeout_at(deadline, request.send()).await {
            Ok(Ok(response)) => response,
            Ok(Err(_)) | Err(_) => break "failed",
        };
        if response.status().as_u16() == 429 {
            retry_after_seconds = response
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<u64>().ok())
                .map(|value| value.min(3600));
            break "rate-limited";
        }
        if response.status().as_u16() == 304 {
            continue;
        }
        if !response.status().is_success() {
            break "failed";
        }
        if let Some(value) = response.headers().get(ETAG).and_then(|v| v.to_str().ok()) {
            etag = Some(value.to_owned());
        }
        let parsed: GpMeasurement = match response.json().await {
            Ok(parsed) => parsed,
            Err(_) => break "failed",
        };
        let is_in_progress = parsed.status == "in-progress";
        if is_in_progress {
            let mut probes = local_results.clone();
            probes.extend(map_measurement_results(&parsed, measurement_type));
            let fingerprint = serde_json::to_vec(&probes).ok();
            if fingerprint != last_emitted_probes {
                let progress = GlobalpingMeasurementResult {
                    measurement_type: measurement_type.into(),
                    target: validated_target.display_target.clone(),
                    status: "in-progress".into(),
                    probes,
                    elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
                    command_hint: command_hint.clone(),
                    rate_limit: None,
                    retry_after_seconds: None,
                };
                // Progress is scoped to the invoking window to avoid leaking one view's
                // measurement into another window. A closed view must not fail the probe.
                let _ = window.emit(GP_PROGRESS_EVENT, &progress);
                last_emitted_probes = fingerprint;
            }
        }
        latest = Some(parsed);
        if !is_in_progress {
            break "finished";
        }
    };

    let mut probes = local_results;
    if let Some(measurement) = latest.as_ref() {
        probes.extend(map_measurement_results(measurement, measurement_type));
    }
    let status = overall_status(terminal_status, &probes);

    Ok(GlobalpingMeasurementResult {
        measurement_type: measurement_type.into(),
        target: validated_target.display_target,
        status: status.into(),
        probes,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
        rate_limit: None,
        retry_after_seconds,
    })
}

fn validate_measurement_type(value: &str) -> AppResult<&'static str> {
    match value {
        "dns" => Ok("dns"),
        "ping" => Ok("ping"),
        "http" => Ok("http"),
        _ => Err(invalid_input("Unsupported Globalping measurement type.")),
    }
}

fn validate_locations(values: Vec<String>) -> AppResult<Vec<String>> {
    let values = if values.is_empty() {
        vec!["world".to_owned()]
    } else {
        values
    };
    let mut locations = Vec::new();
    for value in values {
        if !GP_LOCATIONS.contains(&value.as_str()) {
            return Err(invalid_input("Unsupported Globalping location."));
        }
        if !locations.contains(&value) {
            locations.push(value);
        }
    }
    if locations.is_empty() || locations.len() > GP_MAX_LOCATIONS {
        return Err(invalid_input("Select one to three Globalping locations."));
    }
    Ok(locations)
}

fn validate_target(measurement_type: &str, raw: &str) -> AppResult<ValidatedTarget> {
    let value = raw.trim();
    if value.is_empty() || value.len() > GP_MAX_TARGET_LEN || value != raw {
        return Err(invalid_input("Globalping target is empty or too long."));
    }
    match measurement_type {
        "dns" => {
            let host = parse_single_host(value)?;
            if host.parse::<IpAddr>().is_ok() {
                return Err(invalid_input("DNS measurement requires a domain name."));
            }
            Ok(ValidatedTarget {
                api_target: host.clone(),
                display_target: host.clone(),
                host_for_log: host,
                measurement_options: json!({ "query": { "type": "A" } }),
            })
        }
        "ping" => {
            let host = parse_single_host(value)?;
            Ok(ValidatedTarget {
                api_target: host.clone(),
                display_target: host.clone(),
                host_for_log: host,
                measurement_options: json!({ "packets": 3 }),
            })
        }
        "http" => parse_http_target(value),
        _ => Err(invalid_input("Unsupported Globalping measurement type.")),
    }
}

fn parse_single_host(value: &str) -> AppResult<String> {
    if value.chars().any(|character| {
        character.is_whitespace() || character.is_control() || "/\\?#@%,".contains(character)
    }) {
        return Err(invalid_input("Enter one hostname or IP address."));
    }
    let host =
        Host::parse(value).map_err(|_| invalid_input("Enter one valid hostname or IP address."))?;
    match host {
        Host::Domain(domain) => Ok(domain),
        Host::Ipv4(ip) => Ok(ip.to_string()),
        Host::Ipv6(ip) => Ok(ip.to_string()),
    }
}

fn parse_http_target(value: &str) -> AppResult<ValidatedTarget> {
    let url = Url::parse(value).map_err(|_| invalid_input("Enter a valid HTTP or HTTPS URL."))?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.host_str().is_none()
    {
        return Err(invalid_input(
            "Use an HTTP or HTTPS URL without credentials or a fragment.",
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| invalid_input("Enter a valid HTTP or HTTPS URL."))?;
    let mut measurement_options = json!({
        "protocol": if url.scheme() == "https" { "HTTPS" } else { "HTTP" },
        "request": { "method": "HEAD", "path": url.path() },
    });
    if let Some(port) = url.port_or_known_default() {
        measurement_options["port"] = json!(port);
    }
    if let Some(query) = url.query() {
        measurement_options["request"]["query"] = json!(query);
    }
    let display_target = if url.path() == "/" {
        url.origin().ascii_serialization()
    } else {
        format!("{}{}", url.origin().ascii_serialization(), url.path())
    };
    Ok(ValidatedTarget {
        api_target: host.to_owned(),
        display_target,
        host_for_log: host.to_owned(),
        measurement_options,
    })
}

fn build_measurement_body(
    measurement_type: &str,
    target: &ValidatedTarget,
    locations: &[String],
) -> Value {
    json!({
        "type": measurement_type,
        "target": target.api_target,
        "locations": locations.iter().map(|magic| json!({ "magic": magic, "limit": 1 })).collect::<Vec<_>>(),
        "inProgressUpdates": true,
        "measurementOptions": target.measurement_options,
    })
}

fn rate_limit_from_headers(headers: &HeaderMap) -> Option<GlobalpingRateLimit> {
    let limit = header_number(headers, "x-ratelimit-limit");
    let consumed = header_number(headers, "x-ratelimit-consumed");
    let remaining = header_number(headers, "x-ratelimit-remaining");
    let reset_seconds = header_number(headers, "x-ratelimit-reset");
    let credits_remaining = header_number(headers, "x-credits-remaining");
    if limit.is_none()
        && consumed.is_none()
        && remaining.is_none()
        && reset_seconds.is_none()
        && credits_remaining.is_none()
    {
        None
    } else {
        Some(GlobalpingRateLimit {
            limit,
            consumed,
            remaining,
            reset_seconds,
            credits_remaining,
        })
    }
}

fn header_number(headers: &HeaderMap, name: &str) -> Option<u32> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
}

fn map_measurement_results(
    measurement: &GpMeasurement,
    measurement_type: &str,
) -> Vec<GlobalpingProbeResult> {
    measurement
        .results
        .iter()
        .take(50)
        .enumerate()
        .map(|(index, item)| map_probe_result(item, index, measurement_type))
        .collect()
}

fn overall_status(terminal_status: &str, probes: &[GlobalpingProbeResult]) -> &'static str {
    match terminal_status {
        "finished" if probes.iter().all(|probe| probe.status == "finished") => "complete",
        "finished" => "partial",
        "timed-out" => "timed-out",
        "rate-limited" => "rate-limited",
        _ => "failed",
    }
}

fn map_probe_result(item: &Value, index: usize, measurement_type: &str) -> GlobalpingProbeResult {
    let probe = &item["probe"];
    let result = &item["result"];
    let status = result["status"].as_str().unwrap_or("failed");
    let status = match status {
        "finished" | "failed" | "offline" | "in-progress" => status,
        _ => "failed",
    };
    let location = probe.get("location").unwrap_or(probe);
    let city = location["city"].as_str().filter(|value| !value.is_empty());
    let country = location["country"]
        .as_str()
        .filter(|value| !value.is_empty());
    let label = match (city, country) {
        (Some(city), Some(country)) => format!("{city}, {country}"),
        (Some(city), None) => city.to_owned(),
        (None, Some(country)) => country.to_owned(),
        (None, None) => format!("Globalping #{}", index + 1),
    };
    let mut mapped = GlobalpingProbeResult {
        id: format!("globalping-{index}"),
        label: bounded_text(&label, 128),
        status: status.into(),
        summary: None,
        detail: if status == "failed" || status == "offline" {
            safe_output(&result["rawOutput"])
        } else {
            None
        },
        answers: Vec::new(),
        dns_rcode: None,
        avg_rtt_ms: None,
        packet_loss_percent: None,
        packets_sent: None,
        packets_received: None,
        http_status_code: None,
        total_time_ms: None,
        failure_source: result["failureSource"].as_str().map(str::to_owned),
    };

    if status != "finished" {
        return mapped;
    }
    match measurement_type {
        "dns" => {
            mapped.dns_rcode = result["statusCodeName"].as_str().map(str::to_owned);
            let answers = result["hops"][0]["answers"]
                .as_array()
                .or_else(|| result["answers"].as_array());
            mapped.answers = answers
                .into_iter()
                .flatten()
                .take(20)
                .filter_map(|answer| {
                    let value = answer["value"].as_str()?;
                    let rr_type = answer["type"].as_str().unwrap_or_default();
                    Some(bounded_text(
                        if rr_type.is_empty() {
                            value.to_owned()
                        } else {
                            format!("{rr_type} {value}")
                        }
                        .as_str(),
                        512,
                    ))
                })
                .collect();
        }
        "ping" => {
            mapped.avg_rtt_ms = result["stats"]["avg"].as_f64();
            mapped.packet_loss_percent = result["stats"]["loss"].as_f64();
            mapped.packets_sent = result["stats"]["total"]
                .as_u64()
                .map(|v| v.min(u32::MAX as u64) as u32);
            mapped.packets_received = result["stats"]["rcv"]
                .as_u64()
                .map(|v| v.min(u32::MAX as u64) as u32);
        }
        "http" => {
            mapped.http_status_code = result["statusCode"]
                .as_u64()
                .and_then(|value| u16::try_from(value).ok());
            mapped.total_time_ms = result["timings"]["total"].as_f64();
        }
        _ => {}
    }
    mapped
}

fn safe_output(value: &Value) -> Option<String> {
    let output = value.as_str()?;
    let sanitized: String = output
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\t'))
        .take(1024)
        .collect();
    let sanitized = sanitized.trim();
    (!sanitized.is_empty()).then(|| sanitized.to_owned())
}

fn bounded_text(value: &str, limit: usize) -> String {
    value
        .chars()
        .filter(|character| !character.is_control())
        .take(limit)
        .collect()
}

fn invalid_input(message: &str) -> AppError {
    AppError::new("INVALID_INPUT", message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_keychain_service_is_scoped_to_app_identifier() {
        assert_eq!(
            globalping_token_service("com.bench.app").unwrap(),
            "com.bench.app.network-probe.globalping"
        );
        assert_ne!(
            globalping_token_service("com.bench.app").unwrap(),
            globalping_token_service("com.bench.app.monitorqa").unwrap()
        );
        assert!(globalping_token_service("com.bench.app/qa").is_err());
    }

    #[test]
    fn location_list_is_whitelisted_deduplicated_and_bounded() {
        assert_eq!(validate_locations(vec![]).unwrap(), ["world"]);
        assert_eq!(
            validate_locations(vec!["US".into(), "US".into(), "Asia".into()]).unwrap(),
            ["US", "Asia"]
        );
        assert!(validate_locations(vec![
            "world".into(),
            "US".into(),
            "Europe".into(),
            "Asia".into()
        ])
        .is_err());
        assert!(validate_locations(vec!["random-city".into()]).is_err());
    }

    #[test]
    fn validates_dns_ping_and_http_targets_without_logging_http_query() {
        assert_eq!(
            validate_target("dns", "example.com").unwrap().api_target,
            "example.com"
        );
        assert!(validate_target("dns", "8.8.8.8").is_err());
        assert!(validate_target("ping", "example.com/path").is_err());
        let http = validate_target("http", "https://example.com/health?token=secret").unwrap();
        assert_eq!(http.api_target, "example.com");
        assert_eq!(http.host_for_log, "example.com");
        assert_eq!(http.measurement_options["port"], 443);
        assert_eq!(http.measurement_options["request"]["query"], "token=secret");
        assert!(!http.display_target.contains("secret"));
        let custom_port = validate_target("http", "http://example.com:8080/").unwrap();
        assert_eq!(custom_port.measurement_options["port"], 8080);
        assert!(validate_target("http", "https://user:pass@example.com/").is_err());
        assert!(validate_target("http", "ftp://example.com/").is_err());
        assert!(validate_target("http", "https://example.com/#fragment").is_err());
    }

    #[test]
    fn request_enables_interactive_updates_and_uses_a_single_probe_per_region() {
        let target = validate_target("ping", "1.1.1.1").unwrap();
        let body = build_measurement_body("ping", &target, &["US".into(), "Europe".into()]);
        assert_eq!(body["inProgressUpdates"], true);
        assert_eq!(body["locations"][0]["limit"], 1);
        assert_eq!(body["locations"].as_array().unwrap().len(), 2);
        assert_eq!(body["measurementOptions"]["packets"], 3);
    }

    #[test]
    fn maps_current_globalping_response_shapes_for_dns_ping_and_http() {
        let dns = json!({"probe":{"location":{"city":"Tokyo","country":"JP"}},"result":{"status":"finished","statusCodeName":"NOERROR","hops":[{"answers":[{"type":"A","value":"1.2.3.4"}]}]}});
        let mapped = map_probe_result(&dns, 0, "dns");
        assert_eq!(mapped.label, "Tokyo, JP");
        assert_eq!(mapped.dns_rcode.as_deref(), Some("NOERROR"));
        assert_eq!(mapped.answers, ["A 1.2.3.4"]);

        let ping = json!({"probe":{"location":{"city":"Berlin","country":"DE"}},"result":{"status":"finished","stats":{"avg":12.5,"loss":25.0,"total":4,"rcv":3}}});
        let mapped = map_probe_result(&ping, 0, "ping");
        assert_eq!(mapped.avg_rtt_ms, Some(12.5));
        assert_eq!(mapped.packet_loss_percent, Some(25.0));
        assert_eq!(mapped.packets_sent, Some(4));
        assert_eq!(mapped.packets_received, Some(3));

        let http = json!({"probe":{"location":{"country":"US"}},"result":{"status":"finished","statusCode":204,"timings":{"total":42}}});
        let mapped = map_probe_result(&http, 0, "http");
        assert_eq!(mapped.http_status_code, Some(204));
        assert_eq!(mapped.total_time_ms, Some(42.0));
    }

    #[test]
    fn reads_official_globalping_rate_limit_headers() {
        let mut headers = HeaderMap::new();
        headers.insert("x-ratelimit-limit", "250".parse().unwrap());
        headers.insert("x-ratelimit-consumed", "250".parse().unwrap());
        headers.insert("x-ratelimit-remaining", "0".parse().unwrap());
        headers.insert("x-ratelimit-reset", "30".parse().unwrap());
        headers.insert("x-credits-remaining", "7".parse().unwrap());
        assert_eq!(
            rate_limit_from_headers(&headers),
            Some(GlobalpingRateLimit {
                limit: Some(250),
                consumed: Some(250),
                remaining: Some(0),
                reset_seconds: Some(30),
                credits_remaining: Some(7),
            })
        );
    }

    #[test]
    fn timeout_status_remains_visible_even_when_local_dns_has_a_result() {
        let local_probe = GlobalpingProbeResult {
            id: "local".into(),
            label: "This Mac".into(),
            status: "finished".into(),
            summary: None,
            detail: None,
            answers: vec!["A 1.2.3.4".into()],
            dns_rcode: Some("NOERROR".into()),
            avg_rtt_ms: None,
            packet_loss_percent: None,
            packets_sent: None,
            packets_received: None,
            http_status_code: None,
            total_time_ms: None,
            failure_source: None,
        };
        assert_eq!(overall_status("timed-out", &[local_probe]), "timed-out");
    }
}
