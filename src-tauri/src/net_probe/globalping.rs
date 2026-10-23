//! Globalping remote DNS compare (S-DIS-04) + node listing helpers.

use super::types::{MultiNodeDnsResult, NodeDnsAnswer, ProbeNode};
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::time::{Duration, Instant};

const GP_API: &str = "https://api.globalping.io/v1/measurements";
const GP_POLL_INTERVAL: Duration = Duration::from_millis(700);
const GP_POLL_TIMEOUT: Duration = Duration::from_secs(45);

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

struct GpPollOutcome {
    result: Option<GpResult>,
    failure: Option<String>,
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
    timeout: Duration,
    interval: Duration,
) -> GpPollOutcome {
    let deadline = tokio::time::Instant::now() + timeout;
    let mut latest_result = None;
    let mut last_request_error = None;

    loop {
        let next_poll = tokio::time::Instant::now() + interval;
        if next_poll >= deadline {
            tokio::time::sleep_until(deadline).await;
            break;
        }
        tokio::time::sleep_until(next_poll).await;

        let response = tokio::time::timeout_at(deadline, async {
            let response = client
                .get(url)
                .send()
                .await
                .map_err(|e| GpPollError::Request(e.to_string()))?;
            let status = response.status();
            if status.as_u16() == 429 {
                return Err(GpPollError::RateLimited);
            }
            if !status.is_success() {
                return Err(GpPollError::Http(status));
            }
            response
                .json::<GpResult>()
                .await
                .map_err(|e| GpPollError::Parse(e.to_string()))
        })
        .await;

        match response {
            Err(_) => break,
            Ok(Ok(result)) if result.status != "in-progress" => {
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
                };
            }
            Ok(Ok(result)) => {
                latest_result = Some(result);
                last_request_error = None;
            }
            Ok(Err(GpPollError::RateLimited)) => {
                return GpPollOutcome {
                    result: latest_result,
                    failure: Some(
                        "Globalping quota exhausted (HTTP 429). Configure a token later.".into(),
                    ),
                };
            }
            Ok(Err(GpPollError::Http(status))) => {
                return GpPollOutcome {
                    result: latest_result,
                    failure: Some(format!("Globalping returned HTTP {status} while polling.")),
                };
            }
            Ok(Err(GpPollError::Parse(error))) => {
                return GpPollOutcome {
                    result: latest_result,
                    failure: Some(format!("Globalping response could not be parsed: {error}")),
                };
            }
            Ok(Err(GpPollError::Request(error))) => {
                last_request_error = Some(format!("Globalping polling request failed: {error}"));
            }
        }
    }

    let timeout_seconds = timeout.as_secs_f64();
    let failure = match last_request_error {
        Some(error) => format!(
            "Globalping polling timed out after {timeout_seconds:.1} seconds. Last error: {error}"
        ),
        None => {
            format!("Globalping measurement polling timed out after {timeout_seconds:.1} seconds.")
        }
    };
    GpPollOutcome {
        result: latest_result,
        failure: Some(failure),
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
        .timeout(Duration::from_secs(45))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|e| AppError::new("GP_CLIENT", e.to_string()))?;

    let locations: Vec<serde_json::Value> = magics
        .iter()
        .map(|m| serde_json::json!({ "magic": m, "limit": 1 }))
        .collect();
    let body = serde_json::json!({
        "type": "dns",
        "target": domain,
        "locations": locations,
        "measurementOptions": { "query": { "type": "A" } }
    });

    match client.post(GP_API).json(&body).send().await {
        Ok(resp) if resp.status().is_success() => {
            let created: GpCreate = match resp.json().await {
                Ok(created) => created,
                Err(error) => {
                    answers.push(globalping_failure(format!(
                        "Globalping create response could not be parsed: {error}"
                    )));
                    return Ok(MultiNodeDnsResult {
                        domain,
                        answers,
                        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
                        command_hint,
                    });
                }
            };
            let url = format!("{GP_API}/{}", created.id);
            let poll = poll_measurement(&client, &url, GP_POLL_TIMEOUT, GP_POLL_INTERVAL).await;
            append_poll_outcome(&mut answers, poll);
        }
        Ok(resp) if resp.status().as_u16() == 429 => {
            answers.push(NodeDnsAnswer {
                node_id: "globalping".into(),
                node_label: "Globalping".into(),
                ok: false,
                answers: vec![],
                detail: Some("Globalping quota exhausted (HTTP 429).".into()),
            });
        }
        Ok(resp) => {
            answers.push(NodeDnsAnswer {
                node_id: "globalping".into(),
                node_label: "Globalping".into(),
                ok: false,
                answers: vec![],
                detail: Some(format!("Globalping HTTP {}", resp.status())),
            });
        }
        Err(e) => {
            answers.push(NodeDnsAnswer {
                node_id: "globalping".into(),
                node_label: "Globalping".into(),
                ok: false,
                answers: vec![],
                detail: Some(format!("Globalping request failed: {e}")),
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
    use super::{append_poll_outcome, poll_measurement, GpPollOutcome};
    use crate::net_probe::types::NodeDnsAnswer;
    use std::io::{Read, Write};
    use std::net::TcpListener;
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
            },
        );

        assert_eq!(answers.len(), 2);
        assert_eq!(answers[0].node_id, "local");
        assert_eq!(answers[0].answers, ["192.0.2.2"]);
        assert_eq!(answers[1].node_id, "globalping-error");
        assert!(!answers[1].ok);
    }
}
