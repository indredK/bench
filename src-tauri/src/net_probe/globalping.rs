//! Globalping multi-node DNS, ping and HTTP measurements.

use super::types::{
    MultiNodeMeasurementType, MultiNodeProbeResult, NodeProbeMeasurementResult, ProbeNode,
    ProbeResultMetric,
};
use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, ETAG, IF_NONE_MATCH};
use reqwest::Response;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tokio::time::{sleep, timeout_at, Instant as TokioInstant};
use url::Url;

const GP_API: &str = "https://api.globalping.io/v1/measurements";
const GP_OPERATION_TIMEOUT: Duration = Duration::from_secs(35);
const GP_PROBE_TIMEOUT_SECS: u8 = 20;
const GP_POLL_INTERVAL: Duration = Duration::from_millis(700);
const GP_MAX_LOCATIONS: usize = 3;
const GP_MAX_RESPONSE_BYTES: usize = 1024 * 1024;

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
struct GpProbeMeta {
    #[serde(default)]
    city: Option<String>,
    #[serde(default)]
    country: Option<String>,
}

pub async fn measure_multi(
    target: String,
    measurement_type: MultiNodeMeasurementType,
    locations: Vec<String>,
) -> AppResult<MultiNodeProbeResult> {
    let target = target.trim().to_owned();
    validate_target(&target, measurement_type)?;
    let locations = validate_locations(locations)?;
    let token = tauri::async_runtime::spawn_blocking(super::globalping_tokens::get)
        .await
        .map_err(|error| AppError::task_failed(error.to_string()))??;
    let display_target = safe_display_target(&target, measurement_type);
    let started = Instant::now();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .user_agent("Bench-NetworkProbe/1.0")
        // The reqwest gzip/brotli features negotiate and decode compressed responses.
        .build()
        .map_err(|error| AppError::new("GP_CLIENT", error.to_string()))?;

    let (local, mut remote) = tokio::join!(
        local_measurement(&target, measurement_type),
        remote_measurements(
            &client,
            GP_API,
            &target,
            measurement_type,
            &locations,
            GP_OPERATION_TIMEOUT,
            GP_POLL_INTERVAL,
            token.as_deref(),
        )
    );
    let mut results = vec![local];
    results.append(&mut remote);

    Ok(MultiNodeProbeResult {
        target: display_target.clone(),
        measurement_type,
        results,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint: format!(
            "measureMulti(via:'globalping', type:'{}', target:'{}', locations={:?})",
            measurement_type.api_name(),
            display_target,
            locations
        ),
    })
}

impl MultiNodeMeasurementType {
    fn api_name(self) -> &'static str {
        match self {
            Self::Dns => "dns",
            Self::Ping => "ping",
            Self::Http => "http",
        }
    }
}

fn validate_target(target: &str, measurement_type: MultiNodeMeasurementType) -> AppResult<()> {
    match measurement_type {
        MultiNodeMeasurementType::Dns | MultiNodeMeasurementType::Ping => {
            super::validate::validate_host(target)
        }
        MultiNodeMeasurementType::Http => {
            super::input::validate_probe_input(target)?;
            let url = Url::parse(target)
                .map_err(|error| AppError::invalid_input(format!("Invalid URL: {error}")))?;
            if !url.username().is_empty() || url.password().is_some() {
                return Err(AppError::invalid_input(
                    "HTTP probe URLs cannot contain embedded credentials.",
                ));
            }
            if url.fragment().is_some() {
                return Err(AppError::invalid_input(
                    "HTTP probe URLs cannot contain a fragment.",
                ));
            }
            Ok(())
        }
    }
}

fn validate_locations(locations: Vec<String>) -> AppResult<Vec<String>> {
    if locations.is_empty() || locations.len() > GP_MAX_LOCATIONS {
        return Err(AppError::invalid_input(format!(
            "Select between 1 and {GP_MAX_LOCATIONS} Globalping locations."
        )));
    }
    let allowed = ["world", "US", "Europe", "Asia"];
    let mut unique = Vec::with_capacity(locations.len());
    for location in locations {
        if !allowed.contains(&location.as_str()) {
            return Err(AppError::invalid_input(
                "Unsupported Globalping location preset.",
            ));
        }
        if !unique.contains(&location) {
            unique.push(location);
        }
    }
    if unique.is_empty() {
        return Err(AppError::invalid_input(
            "Select at least one Globalping location.",
        ));
    }
    Ok(unique)
}

fn remote_http_request(target: &str) -> AppResult<(String, Value)> {
    let url = Url::parse(target)
        .map_err(|error| AppError::invalid_input(format!("Invalid URL: {error}")))?;
    let host = url
        .host_str()
        .ok_or_else(|| AppError::invalid_input("URL must include a host"))?;
    let protocol = match url.scheme() {
        "http" => "HTTP",
        "https" => "HTTPS",
        other => {
            return Err(AppError::invalid_input(format!(
                "Unsupported URL scheme: {other}"
            )))
        }
    };
    let port = url
        .port_or_known_default()
        .ok_or_else(|| AppError::invalid_input("URL must include a valid port"))?;

    let mut request = json!({ "method": "HEAD", "path": url.path() });
    if let Some(query) = url.query() {
        request["query"] = json!(query);
    }

    Ok((
        host.to_owned(),
        json!({ "request": request, "protocol": protocol, "port": port }),
    ))
}

fn safe_display_target(target: &str, measurement_type: MultiNodeMeasurementType) -> String {
    if measurement_type != MultiNodeMeasurementType::Http {
        return target.to_owned();
    }
    Url::parse(target)
        .map(|url| url.origin().ascii_serialization())
        .unwrap_or_else(|_| "<invalid-url>".into())
}

async fn local_measurement(
    target: &str,
    measurement_type: MultiNodeMeasurementType,
) -> NodeProbeMeasurementResult {
    match measurement_type {
        MultiNodeMeasurementType::Dns => {
            match super::dns::dns_lookup(target.to_owned(), Some("A".into()), None).await {
                Ok(result) => {
                    let summary: Vec<String> = result
                        .records
                        .into_iter()
                        .map(|record| format!("{} {}", record.rr_type, record.data))
                        .collect();
                    let ok = !summary.is_empty();
                    NodeProbeMeasurementResult {
                        node_id: "local".into(),
                        node_label: "This Mac".into(),
                        ok,
                        summary: summary
                            .into_iter()
                            .map(|value| metric("dnsAnswer", value))
                            .collect(),
                        detail: (!ok).then(|| "No DNS answers returned.".into()),
                    }
                }
                Err(error) => local_failure(error.to_string()),
            }
        }
        MultiNodeMeasurementType::Ping => {
            match super::ping::ping_host(target.to_owned(), Some(3), Some(500)).await {
                Ok(result) => {
                    let mut summary = Vec::new();
                    if let Some(avg) = result.avg_rtt_ms {
                        summary.push(metric("rttAvg", format!("{avg:.2} ms")));
                    }
                    if let Some(min) = result.min_rtt_ms {
                        summary.push(metric("rttMin", format!("{min:.2} ms")));
                    }
                    if let Some(max) = result.max_rtt_ms {
                        summary.push(metric("rttMax", format!("{max:.2} ms")));
                    }
                    summary.push(metric(
                        "packetCount",
                        format!("{}/{}", result.packets_received, result.packets_sent),
                    ));
                    summary.push(metric("packetLoss", format!("{:.1}%", result.loss_percent)));
                    let detail = if result.packets_received == 0 {
                        result
                            .samples
                            .iter()
                            .find_map(|sample| sample.error.clone())
                    } else {
                        None
                    };
                    NodeProbeMeasurementResult {
                        node_id: "local".into(),
                        node_label: "This Mac".into(),
                        ok: result.packets_received > 0,
                        summary,
                        detail,
                    }
                }
                Err(error) => local_failure(error.to_string()),
            }
        }
        MultiNodeMeasurementType::Http => {
            let http = super::probe::probe_http_target_head(target).await;
            let mut summary = Vec::new();
            if let Some(status) = http.status {
                summary.push(metric("httpStatus", status.to_string()));
            }
            if let Some(ttfb) = http.ttfb_ms {
                summary.push(metric("ttfb", format!("{ttfb:.2} ms")));
            }
            NodeProbeMeasurementResult {
                node_id: "local".into(),
                node_label: "This Mac".into(),
                // Receiving any HTTP status confirms that this node reached the server.
                ok: http.status.is_some(),
                summary,
                detail: http.error,
            }
        }
    }
}

fn metric(key: &str, value: String) -> ProbeResultMetric {
    ProbeResultMetric {
        key: key.into(),
        value,
    }
}

fn local_failure(detail: String) -> NodeProbeMeasurementResult {
    NodeProbeMeasurementResult {
        node_id: "local".into(),
        node_label: "This Mac".into(),
        ok: false,
        summary: Vec::new(),
        detail: Some(detail),
    }
}

#[allow(clippy::too_many_arguments)]
async fn remote_measurements(
    client: &reqwest::Client,
    api_url: &str,
    target: &str,
    measurement_type: MultiNodeMeasurementType,
    locations: &[String],
    operation_timeout: Duration,
    poll_interval: Duration,
    token: Option<&str>,
) -> Vec<NodeProbeMeasurementResult> {
    let deadline = TokioInstant::now() + operation_timeout;
    let selected_locations: Vec<Value> = locations
        .iter()
        .map(|location| json!({ "magic": location, "limit": 1 }))
        .collect();
    let (api_target, http_options) = match measurement_type {
        MultiNodeMeasurementType::Http => match remote_http_request(target) {
            Ok((host, options)) => (host, Some(options)),
            Err(error) => return vec![globalping_failure(error.to_string())],
        },
        _ => (target.to_owned(), None),
    };
    let mut body = json!({
        "type": measurement_type.api_name(),
        "target": api_target,
        "locations": selected_locations,
        "timeout": GP_PROBE_TIMEOUT_SECS,
        "inProgressUpdates": true
    });
    match measurement_type {
        MultiNodeMeasurementType::Dns => {
            body["measurementOptions"] = json!({ "query": { "type": "A" } });
        }
        MultiNodeMeasurementType::Ping => {
            body["measurementOptions"] = json!({ "packets": 3 });
        }
        MultiNodeMeasurementType::Http => {
            body["measurementOptions"] =
                http_options.expect("HTTP options are built for HTTP measurements")
        }
    }

    let mut create_request = client.post(api_url).json(&body);
    if let Some(token) = token {
        create_request = create_request.bearer_auth(token);
    }
    let create_response = match timeout_at(deadline, create_request.send()).await {
        Ok(Ok(response)) => response,
        Ok(Err(error)) => {
            return vec![globalping_failure(format!(
                "Globalping request failed: {error}"
            ))]
        }
        Err(_) => return vec![globalping_timeout(operation_timeout)],
    };

    let create_status = create_response.status();
    if !create_status.is_success() {
        return vec![globalping_failure(globalping_http_error(
            create_status.as_u16(),
            create_response.headers(),
        ))];
    }

    let created: GpCreate = match timeout_at(deadline, response_json(create_response)).await {
        Ok(Ok(created)) => created,
        Ok(Err(error)) => {
            return vec![globalping_failure(format!(
                "Globalping response parse failed: {error}"
            ))]
        }
        Err(_) => return vec![globalping_timeout(operation_timeout)],
    };
    if created.id.is_empty()
        || !created
            .id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return vec![globalping_failure(
            "Globalping returned an invalid measurement ID.".into(),
        )];
    }

    // Build the poll URL from our fixed API origin and validated ID; never forward a bearer token
    // to an untrusted Location header from an HTTP response.
    let url = format!("{}/{id}", api_url.trim_end_matches('/'), id = created.id);
    let mut latest: Option<GpResult> = None;
    let mut etag = None;
    let mut should_wait = false;
    let mut poll_error = None;

    loop {
        if should_wait
            && timeout_at(
                deadline,
                sleep(poll_interval.max(Duration::from_millis(500))),
            )
            .await
            .is_err()
        {
            poll_error = Some(globalping_timeout_message(operation_timeout));
            break;
        }
        should_wait = true;

        let mut request = client.get(&url);
        if let Some(value) = &etag {
            request = request.header(IF_NONE_MATCH, value);
        }
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        let response = match timeout_at(deadline, request.send()).await {
            Ok(Ok(response)) => response,
            Ok(Err(error)) => {
                poll_error = Some(format!("Globalping polling failed: {error}"));
                break;
            }
            Err(_) => {
                poll_error = Some(globalping_timeout_message(operation_timeout));
                break;
            }
        };

        if response.status().as_u16() == 304 {
            continue;
        }
        if response.status().as_u16() == 429 {
            poll_error = Some(globalping_http_error(429, response.headers()));
            break;
        }
        if !response.status().is_success() {
            poll_error = Some(globalping_http_error(
                response.status().as_u16(),
                response.headers(),
            ));
            break;
        }

        if let Some(value) = response.headers().get(ETAG) {
            if let Ok(value) = value.to_str() {
                etag = Some(value.to_owned());
            }
        }

        let parsed: GpResult = match timeout_at(deadline, response_json(response)).await {
            Ok(Ok(parsed)) => parsed,
            Ok(Err(error)) => {
                poll_error = Some(format!("Globalping response parse failed: {error}"));
                break;
            }
            Err(_) => {
                poll_error = Some(globalping_timeout_message(operation_timeout));
                break;
            }
        };
        let is_final = parsed.status != "in-progress";
        if is_final && parsed.results.is_empty() && latest.is_some() {
            poll_error = Some(
                "Globalping finished without final probe results; showing the last partial results."
                    .into(),
            );
        } else if is_final || !parsed.results.is_empty() {
            latest = Some(parsed);
        }
        if is_final {
            break;
        }
    }

    let mut results = latest
        .map(|result| map_probe_results(result, measurement_type))
        .unwrap_or_default();
    if let Some(error) = poll_error {
        results.push(globalping_failure(error));
    } else if results.is_empty() {
        results.push(globalping_failure(
            "Globalping finished without returning probe results.".into(),
        ));
    }
    results
}

async fn response_json<T: DeserializeOwned>(response: Response) -> Result<T, String> {
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        if bytes.len().saturating_add(chunk.len()) > GP_MAX_RESPONSE_BYTES {
            return Err(format!(
                "Globalping response exceeded the {} byte limit",
                GP_MAX_RESPONSE_BYTES
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

fn map_probe_results(
    result: GpResult,
    measurement_type: MultiNodeMeasurementType,
) -> Vec<NodeProbeMeasurementResult> {
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
            let status = probe_result
                .result
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let summary = summarize_result(&probe_result.result, measurement_type);
            let measurement_succeeded = match measurement_type {
                MultiNodeMeasurementType::Dns => has_valid_dns_answer(&probe_result.result),
                MultiNodeMeasurementType::Ping => probe_result
                    .result
                    .get("stats")
                    .and_then(|stats| stats.get("rcv"))
                    .and_then(Value::as_u64)
                    .is_some_and(|received| received > 0),
                MultiNodeMeasurementType::Http => {
                    find_http_status_code(&probe_result.result).is_some()
                }
            };
            let detail = probe_result
                .result
                .get("rawOutput")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
            NodeProbeMeasurementResult {
                node_id: format!("gp-{idx}"),
                node_label: label,
                ok: status == "finished" && measurement_succeeded,
                summary,
                detail,
            }
        })
        .collect()
}

fn summarize_result(
    result: &Value,
    measurement_type: MultiNodeMeasurementType,
) -> Vec<ProbeResultMetric> {
    match measurement_type {
        MultiNodeMeasurementType::Dns => result
            .get("answers")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|answer| {
                let value = answer.get("value")?.as_str()?;
                let rr_type = answer.get("type").and_then(Value::as_str)?;
                (rr_type.eq_ignore_ascii_case("A") && value.parse::<std::net::Ipv4Addr>().is_ok())
                    .then(|| metric("dnsAnswer", format!("A {value}")))
            })
            .collect(),
        MultiNodeMeasurementType::Ping => {
            let mut summary = Vec::new();
            if let Some(address) = result.get("resolvedAddress").and_then(Value::as_str) {
                summary.push(metric("resolvedAddress", address.to_owned()));
            }
            if let Some(stats) = result.get("stats") {
                for key in ["avg", "min", "max"] {
                    if let Some(value) = stats.get(key).and_then(Value::as_f64) {
                        let label_key = match key {
                            "avg" => "rttAvg",
                            "min" => "rttMin",
                            _ => "rttMax",
                        };
                        summary.push(metric(label_key, format!("{value:.2} ms")));
                    }
                }
                if let Some(loss) = stats.get("loss").and_then(Value::as_f64) {
                    summary.push(metric("packetLoss", format!("{loss:.1}%")));
                }
                if let (Some(received), Some(total)) = (
                    stats.get("rcv").and_then(Value::as_u64),
                    stats.get("total").and_then(Value::as_u64),
                ) {
                    summary.push(metric("packetCount", format!("{received}/{total}")));
                }
            }
            summary
        }
        MultiNodeMeasurementType::Http => {
            let mut summary = Vec::new();
            if let Some(status) = find_http_status_code(result) {
                summary.push(metric("httpStatus", status.to_string()));
            }
            if let Some(timings) = result.get("timings").and_then(Value::as_object) {
                for (name, value) in timings {
                    if let Some(value) = value.as_f64() {
                        summary.push(metric("timing", format!("{name}: {value:.2} ms")));
                    }
                }
            }
            summary
        }
    }
}

fn find_numeric_field(value: &Value, key: &str) -> Option<u64> {
    match value {
        Value::Object(object) => object.get(key).and_then(Value::as_u64).or_else(|| {
            object
                .values()
                .find_map(|value| find_numeric_field(value, key))
        }),
        Value::Array(values) => values
            .iter()
            .find_map(|value| find_numeric_field(value, key)),
        _ => None,
    }
}

fn has_valid_dns_answer(result: &Value) -> bool {
    result
        .get("answers")
        .and_then(Value::as_array)
        .is_some_and(|answers| {
            answers.iter().any(|answer| {
                answer
                    .get("type")
                    .and_then(Value::as_str)
                    .is_some_and(|rr_type| rr_type.eq_ignore_ascii_case("A"))
                    && answer
                        .get("value")
                        .and_then(Value::as_str)
                        .is_some_and(|value| value.parse::<std::net::Ipv4Addr>().is_ok())
            })
        })
}

fn find_http_status_code(result: &Value) -> Option<u64> {
    find_numeric_field(result, "statusCode").filter(|status| (100..=599).contains(status))
}

fn globalping_failure(detail: String) -> NodeProbeMeasurementResult {
    NodeProbeMeasurementResult {
        node_id: "globalping-status".into(),
        node_label: "Globalping".into(),
        ok: false,
        summary: Vec::new(),
        detail: Some(detail),
    }
}

fn globalping_timeout(timeout: Duration) -> NodeProbeMeasurementResult {
    globalping_failure(globalping_timeout_message(timeout))
}

fn globalping_timeout_message(timeout: Duration) -> String {
    format!(
        "Globalping measurement timed out after {} seconds.",
        timeout.as_secs()
    )
}

fn globalping_http_error(status: u16, headers: &HeaderMap) -> String {
    match status {
        401 | 403 => {
            "Globalping rejected the token; check it or remove it to continue anonymously.".into()
        }
        429 => {
            let rate_limit_details = [
                ("x-ratelimit-remaining", "remaining rate-limit points"),
                ("x-ratelimit-reset", "reset in seconds"),
                ("x-credits-remaining", "remaining credits"),
            ]
            .into_iter()
            .filter_map(|(header, label)| {
                let value = headers.get(header)?.to_str().ok()?;
                Some(format!("{label}: {value}"))
            })
            .collect::<Vec<_>>();
            let details = if rate_limit_details.is_empty() {
                String::new()
            } else {
                format!(" ({})", rate_limit_details.join("; "))
            };
            format!("Globalping rate limit reached (HTTP 429){details}. Try fewer probes or add a token.")
        }
        _ => format!("Globalping HTTP {status}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::thread;

    fn read_request(stream: &mut TcpStream) -> String {
        let mut request = Vec::new();
        let mut buffer = [0; 1024];
        let mut expected_len = None;
        loop {
            let read = stream.read(&mut buffer).expect("read request");
            assert!(read > 0, "client closed before request completed");
            request.extend_from_slice(&buffer[..read]);
            if expected_len.is_none() {
                if let Some(headers_end) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&request[..headers_end]);
                    let content_length = headers
                        .lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim().parse::<usize>().expect("content length"))
                        })
                        .unwrap_or(0);
                    expected_len = Some(headers_end + 4 + content_length);
                }
            }
            if expected_len.is_some_and(|expected| request.len() >= expected) {
                return String::from_utf8_lossy(&request).into_owned();
            }
        }
    }

    fn respond(stream: &mut TcpStream, status: u16, extra_headers: &str, body: &str) {
        let reason = match status {
            200 => "OK",
            202 => "Accepted",
            _ => "Error",
        };
        write!(
            stream,
            "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n{extra_headers}\r\n{body}",
            body.len()
        )
        .expect("write response");
    }

    fn accept_request(listener: &TcpListener) -> (TcpStream, String) {
        let (mut stream, _) = listener.accept().expect("accept client");
        stream
            .set_read_timeout(Some(Duration::from_secs(1)))
            .expect("set read timeout");
        let request = read_request(&mut stream);
        (stream, request)
    }

    fn test_client() -> reqwest::Client {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(1))
            .no_proxy()
            .build()
            .expect("build test client")
    }

    #[test]
    fn rate_limit_error_includes_available_api_limits() {
        let mut headers = HeaderMap::new();
        headers.insert("x-ratelimit-remaining", "0".parse().unwrap());
        headers.insert("x-ratelimit-reset", "42".parse().unwrap());
        headers.insert("x-credits-remaining", "3".parse().unwrap());

        let detail = globalping_http_error(429, &headers);

        assert!(detail.contains("remaining rate-limit points: 0"));
        assert!(detail.contains("reset in seconds: 42"));
        assert!(detail.contains("remaining credits: 3"));
    }

    #[test]
    fn finished_globalping_results_require_measurement_specific_data() {
        let cases = [
            (
                MultiNodeMeasurementType::Dns,
                json!({ "status": "finished", "answers": [] }),
                false,
            ),
            (
                MultiNodeMeasurementType::Dns,
                json!({ "status": "finished", "answers": [{ "type": "A" }] }),
                false,
            ),
            (
                MultiNodeMeasurementType::Dns,
                json!({ "status": "finished", "answers": [{ "type": "AAAA", "value": "2001:db8::1" }] }),
                false,
            ),
            (
                MultiNodeMeasurementType::Dns,
                json!({ "status": "finished", "answers": [{ "type": "A", "value": "192.0.2.1" }] }),
                true,
            ),
            (
                MultiNodeMeasurementType::Ping,
                json!({ "status": "finished", "stats": { "rcv": 0, "total": 3 } }),
                false,
            ),
            (
                MultiNodeMeasurementType::Ping,
                json!({ "status": "finished", "stats": { "rcv": 1, "total": 3 } }),
                true,
            ),
            (
                MultiNodeMeasurementType::Http,
                json!({ "status": "finished", "response": { "statusCode": 503 } }),
                true,
            ),
            (
                MultiNodeMeasurementType::Http,
                json!({ "status": "finished", "response": { "statusCode": 0 } }),
                false,
            ),
            (
                MultiNodeMeasurementType::Http,
                json!({ "status": "finished", "timings": { "total": 10 } }),
                false,
            ),
        ];

        for (measurement_type, result, expected_ok) in cases {
            let mapped = map_probe_results(
                GpResult {
                    status: "finished".into(),
                    results: vec![GpProbeResult {
                        result,
                        probe: GpProbeMeta::default(),
                    }],
                },
                measurement_type,
            );
            assert_eq!(mapped[0].ok, expected_ok, "{measurement_type:?}");
        }
    }

    #[tokio::test]
    async fn ping_uses_bearer_token_and_maps_summary_without_echoing_token() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock API");
        let address = listener.local_addr().expect("mock API address");
        let server = thread::spawn(move || {
            let (mut stream, request) = accept_request(&listener);
            let lower = request.to_ascii_lowercase();
            assert!(lower.contains("authorization: bearer test-token"));
            assert!(request.contains("\"type\":\"ping\""));
            assert!(request.contains("\"packets\":3"));
            let body = request.split_once("\r\n\r\n").unwrap().1;
            assert!(!body.contains("test-token"));
            respond(&mut stream, 202, "", r#"{"id":"test-id"}"#);

            let (mut stream, poll_request) = accept_request(&listener);
            assert!(poll_request
                .to_ascii_lowercase()
                .contains("authorization: bearer test-token"));
            respond(
                &mut stream,
                200,
                "ETag: \"v1\"\r\n",
                r#"{"status":"finished","results":[{"probe":{"city":"Tokyo","country":"JP"},"result":{"status":"finished","resolvedAddress":"192.0.2.1","stats":{"avg":4.25,"min":3.5,"max":5.1,"loss":0,"total":3,"rcv":3}}}]}"#,
            );
        });

        let results = remote_measurements(
            &test_client(),
            &format!("http://{address}/v1/measurements"),
            "example.com",
            MultiNodeMeasurementType::Ping,
            &["world".into()],
            Duration::from_secs(2),
            Duration::from_millis(10),
            Some("test-token"),
        )
        .await;

        server.join().expect("mock server");
        assert_eq!(results.len(), 1);
        assert!(results[0].ok);
        assert!(results[0]
            .summary
            .iter()
            .any(|metric| metric.key == "rttAvg" && metric.value == "4.25 ms"));
        assert!(results[0]
            .summary
            .iter()
            .any(|metric| metric.key == "packetCount" && metric.value == "3/3"));
        assert!(!format!("{results:?}").contains("test-token"));
    }

    #[tokio::test]
    async fn polls_partial_dns_results_and_keeps_failed_probe_visible() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock API");
        let address = listener.local_addr().expect("mock API address");
        let server = thread::spawn(move || {
            let (mut stream, request) = accept_request(&listener);
            assert!(request.contains("\"type\":\"dns\""));
            assert!(request.contains("\"query\":{\"type\":\"A\"}"));
            assert!(request.contains("\"inProgressUpdates\":true"));
            assert!(request.contains("\"timeout\":20"));
            respond(&mut stream, 202, "", r#"{"id":"test-id"}"#);

            let (mut stream, _) = accept_request(&listener);
            respond(
                &mut stream,
                200,
                "ETag: \"v1\"\r\n",
                r#"{"status":"in-progress","results":[{"probe":{"city":"Tokyo","country":"JP"},"result":{"status":"finished","answers":[{"type":"A","value":"192.0.2.1"}]}}]}"#,
            );

            let (mut stream, request) = accept_request(&listener);
            assert!(request
                .to_ascii_lowercase()
                .contains("if-none-match: \"v1\""));
            respond(
                &mut stream,
                200,
                "ETag: \"v2\"\r\n",
                r#"{"status":"finished","results":[{"probe":{"city":"Tokyo","country":"JP"},"result":{"status":"finished","answers":[{"type":"A","value":"192.0.2.1"}]}},{"probe":{"city":"Paris","country":"FR"},"result":{"status":"failed","answers":[{"type":"A","value":"192.0.2.2"}],"rawOutput":"probe failed"}}]}"#,
            );
        });

        let results = remote_measurements(
            &test_client(),
            &format!("http://{address}/v1/measurements"),
            "example.com",
            MultiNodeMeasurementType::Dns,
            &["world".into()],
            Duration::from_secs(2),
            Duration::from_millis(10),
            None,
        )
        .await;

        server.join().expect("mock server");
        assert_eq!(results.len(), 2);
        assert!(results[0].ok);
        assert_eq!(results[0].summary[0].key, "dnsAnswer");
        assert_eq!(results[0].summary[0].value, "A 192.0.2.1");
        assert!(!results[1].ok);
        assert_eq!(results[1].detail.as_deref(), Some("probe failed"));
    }

    #[tokio::test]
    async fn http_uses_head_and_summarizes_response_code() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock API");
        let address = listener.local_addr().expect("mock API address");
        let server = thread::spawn(move || {
            let (mut stream, request) = accept_request(&listener);
            assert!(request.contains("\"type\":\"http\""));
            let body = request.split("\r\n\r\n").nth(1).expect("request body");
            let body: Value = serde_json::from_str(body).expect("valid request JSON");
            assert_eq!(body["target"], "example.com");
            assert_eq!(body["measurementOptions"]["request"]["method"], "HEAD");
            assert_eq!(body["measurementOptions"]["request"]["path"], "/private");
            assert_eq!(
                body["measurementOptions"]["request"]["query"],
                "secret=value"
            );
            assert_eq!(body["measurementOptions"]["protocol"], "HTTPS");
            assert_eq!(body["measurementOptions"]["port"], 443);
            respond(&mut stream, 202, "", r#"{"id":"test-id"}"#);
            let (mut stream, _) = accept_request(&listener);
            respond(
                &mut stream,
                200,
                "",
                r#"{"status":"finished","results":[{"probe":{"city":"London","country":"GB"},"result":{"status":"finished","rawOutput":"HTTP/2 204 No Content","response":{"statusCode":204},"timings":{"total":27.2}}}]}"#,
            );
        });

        let results = remote_measurements(
            &test_client(),
            &format!("http://{address}/v1/measurements"),
            "https://example.com/private?secret=value",
            MultiNodeMeasurementType::Http,
            &["Europe".into()],
            Duration::from_secs(2),
            Duration::from_millis(10),
            None,
        )
        .await;

        server.join().expect("mock server");
        assert_eq!(results.len(), 1);
        assert!(results[0].ok);
        assert!(results[0]
            .summary
            .iter()
            .any(|metric| metric.key == "httpStatus" && metric.value == "204"));
    }

    #[test]
    fn remote_http_request_preserves_http_scheme_and_explicit_port() {
        let (target, options) = remote_http_request("http://example.com:8080/health?full=1")
            .expect("valid HTTP target");

        assert_eq!(target, "example.com");
        assert_eq!(options["protocol"], "HTTP");
        assert_eq!(options["port"], 8080);
        assert_eq!(options["request"]["method"], "HEAD");
        assert_eq!(options["request"]["path"], "/health");
        assert_eq!(options["request"]["query"], "full=1");
    }

    #[tokio::test]
    async fn overall_deadline_keeps_partial_results_and_reports_timeout() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock API");
        let address = listener.local_addr().expect("mock API address");
        let server = thread::spawn(move || {
            let (mut stream, _) = accept_request(&listener);
            respond(&mut stream, 202, "", r#"{"id":"test-id"}"#);

            let (mut stream, _) = accept_request(&listener);
            respond(
                &mut stream,
                200,
                "ETag: \"v1\"\r\n",
                r#"{"status":"in-progress","results":[{"probe":{"city":"Tokyo","country":"JP"},"result":{"status":"finished","answers":[{"type":"A","value":"192.0.2.1"}]}}]}"#,
            );

            let (_stream, _) = accept_request(&listener);
            thread::sleep(Duration::from_millis(700));
        });

        let started = Instant::now();
        let results = remote_measurements(
            &test_client(),
            &format!("http://{address}/v1/measurements"),
            "example.com",
            MultiNodeMeasurementType::Dns,
            &["world".into()],
            Duration::from_millis(600),
            Duration::from_millis(10),
            None,
        )
        .await;

        let elapsed = started.elapsed();
        server.join().expect("mock server");
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].summary[0].value, "A 192.0.2.1");
        assert_eq!(results[1].node_id, "globalping-status");
        assert!(results[1].detail.as_deref().unwrap().contains("timed out"));
        assert!(elapsed < Duration::from_secs(1));
    }
}
