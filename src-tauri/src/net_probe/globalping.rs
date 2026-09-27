//! Globalping remote DNS compare (S-DIS-04) + node listing helpers.

use super::types::{MultiNodeDnsResult, NodeDnsAnswer, ProbeNode};
use crate::error::{AppError, AppResult};
use reqwest::header::{HeaderMap, ETAG, IF_NONE_MATCH};
use serde::Deserialize;
use std::time::{Duration, Instant};
use tokio::time::{sleep, timeout_at, Instant as TokioInstant};

const GP_API: &str = "https://api.globalping.io/v1/measurements";
const GP_OPERATION_TIMEOUT: Duration = Duration::from_secs(35);
const GP_PROBE_TIMEOUT_SECS: u8 = 20;
const GP_POLL_INTERVAL: Duration = Duration::from_millis(700);

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
struct GpInner {
    #[serde(default)]
    status: String,
    #[serde(default)]
    answers: Vec<GpAnswer>,
    #[serde(rename = "rawOutput", default)]
    raw_output: Option<String>,
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

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|e| AppError::new("GP_CLIENT", e.to_string()))?;

    answers.extend(
        remote_dns_answers(
            &client,
            GP_API,
            &domain,
            &magics,
            GP_OPERATION_TIMEOUT,
            GP_POLL_INTERVAL,
        )
        .await,
    );

    Ok(MultiNodeDnsResult {
        domain,
        answers,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

async fn remote_dns_answers(
    client: &reqwest::Client,
    api_url: &str,
    domain: &str,
    magics: &[String],
    operation_timeout: Duration,
    poll_interval: Duration,
) -> Vec<NodeDnsAnswer> {
    let deadline = TokioInstant::now() + operation_timeout;
    let locations: Vec<serde_json::Value> = magics
        .iter()
        .map(|m| serde_json::json!({ "magic": m, "limit": 1 }))
        .collect();
    let body = serde_json::json!({
        "type": "dns",
        "target": domain,
        "locations": locations,
        "timeout": GP_PROBE_TIMEOUT_SECS,
        "inProgressUpdates": true,
        "measurementOptions": { "query": { "type": "A" } }
    });

    let create_response = match timeout_at(deadline, client.post(api_url).json(&body).send()).await
    {
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

    let created: GpCreate = match timeout_at(deadline, create_response.json()).await {
        Ok(Ok(created)) => created,
        Ok(Err(error)) => {
            return vec![globalping_failure(format!(
                "Globalping response parse failed: {error}"
            ))]
        }
        Err(_) => return vec![globalping_timeout(operation_timeout)],
    };

    let url = format!("{api_url}/{}", created.id);
    let mut latest: Option<GpResult> = None;
    let mut etag = None;
    let mut should_wait = false;
    let mut poll_error = None;

    loop {
        if should_wait && timeout_at(deadline, sleep(poll_interval)).await.is_err() {
            poll_error = Some(globalping_timeout_message(operation_timeout));
            break;
        }
        should_wait = true;

        let mut request = client.get(&url);
        if let Some(value) = &etag {
            request = request.header(IF_NONE_MATCH, value);
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

        let parsed: GpResult = match timeout_at(deadline, response.json()).await {
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

    let mut results = latest.map(map_probe_results).unwrap_or_default();
    if let Some(error) = poll_error {
        results.push(globalping_failure(error));
    } else if results.is_empty() {
        results.push(globalping_failure(
            "Globalping finished without returning probe results.".into(),
        ));
    }
    results
}

fn map_probe_results(result: GpResult) -> Vec<NodeDnsAnswer> {
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

fn globalping_failure(detail: String) -> NodeDnsAnswer {
    NodeDnsAnswer {
        node_id: "globalping-status".into(),
        node_label: "Globalping".into(),
        ok: false,
        answers: vec![],
        detail: Some(detail),
    }
}

fn globalping_timeout(timeout: Duration) -> NodeDnsAnswer {
    globalping_failure(globalping_timeout_message(timeout))
}

fn globalping_timeout_message(timeout: Duration) -> String {
    format!(
        "Globalping measurement timed out after {} seconds.",
        timeout.as_secs()
    )
}

fn globalping_http_error(status: u16, headers: &HeaderMap) -> String {
    if status == 429 {
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
        format!("Globalping rate limit reached (HTTP 429){details}. Try again later.")
    } else {
        format!("Globalping HTTP {status}")
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

    #[tokio::test]
    async fn polls_until_final_result_and_maps_explicit_probe_failure() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock API");
        let address = listener.local_addr().expect("mock API address");
        let server = thread::spawn(move || {
            let (mut stream, request) = accept_request(&listener);
            assert!(request.contains("\"inProgressUpdates\":true"));
            assert!(request.contains("\"timeout\":20"));
            respond(&mut stream, 202, "", r#"{"id":"test-id"}"#);

            let (mut stream, request) = accept_request(&listener);
            assert!(request.starts_with("GET /v1/measurements/test-id"));
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

        let results = remote_dns_answers(
            &test_client(),
            &format!("http://{address}/v1/measurements"),
            "example.com",
            &["world".into()],
            Duration::from_secs(2),
            Duration::from_millis(10),
        )
        .await;

        server.join().expect("mock server");
        assert_eq!(results.len(), 2);
        assert!(results[0].ok);
        assert_eq!(results[0].answers, ["A 192.0.2.1"]);
        assert!(
            !results[1].ok,
            "an explicit failed status must not be marked OK because it contains an address"
        );
        assert_eq!(results[1].detail.as_deref(), Some("probe failed"));
    }

    #[tokio::test]
    async fn etag_not_modified_response_keeps_polling_until_final_result() {
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

            let (mut stream, request) = accept_request(&listener);
            assert!(request
                .to_ascii_lowercase()
                .contains("if-none-match: \"v1\""));
            respond(&mut stream, 304, "", "");

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

        let results = remote_dns_answers(
            &test_client(),
            &format!("http://{address}/v1/measurements"),
            "example.com",
            &["world".into()],
            Duration::from_secs(2),
            Duration::from_millis(10),
        )
        .await;

        server.join().expect("mock server");
        assert_eq!(results.len(), 2);
        assert!(results[0].ok);
        assert_eq!(results[0].answers, ["A 192.0.2.1"]);
        assert!(
            !results[1].ok,
            "an explicit failed status must not be marked OK because it contains an address"
        );
        assert_eq!(results[1].detail.as_deref(), Some("probe failed"));
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
            thread::sleep(Duration::from_millis(250));
        });

        let started = std::time::Instant::now();
        let results = remote_dns_answers(
            &test_client(),
            &format!("http://{address}/v1/measurements"),
            "example.com",
            &["world".into()],
            Duration::from_millis(120),
            Duration::from_millis(10),
        )
        .await;

        let elapsed = started.elapsed();
        server.join().expect("mock server");
        assert_eq!(
            results.len(),
            2,
            "partial result and timeout row are retained"
        );
        assert_eq!(results[0].answers, ["A 192.0.2.1"]);
        assert_eq!(results[1].node_id, "globalping-status");
        assert!(results[1].detail.as_deref().unwrap().contains("timed out"));
        assert!(elapsed < Duration::from_secs(1));
    }
}
