//! Globalping remote DNS compare (S-DIS-04) + node listing helpers.

use super::types::{MultiNodeDnsResult, NodeDnsAnswer, ProbeNode};
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::time::Instant as TokioInstant;

const GP_API: &str = "https://api.globalping.io/v1/measurements";
const GP_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const GP_MEASUREMENT_TIMEOUT: Duration = Duration::from_secs(20);
const GP_POLL_INTERVAL: Duration = Duration::from_millis(700);
const LOCAL_DNS_TIMEOUT: Duration = Duration::from_secs(5);
const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

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

pub async fn compare_dns_multi<R: Runtime>(
    app: &AppHandle<R>,
    domain: String,
    location_magics: Vec<String>,
) -> AppResult<MultiNodeDnsResult> {
    super::validate::validate_host(&domain)?;
    let session_id = super::session::new_session_id();
    let _ = app.emit(
        SCAN_SESSION_EVENT,
        &super::types::ScanSessionEvent {
            session_id: session_id.clone(),
            kind: "multiNode".into(),
        },
    );
    let result = compare_dns_multi_with_session(domain, location_magics, &session_id).await;
    super::session::clear_session(&session_id);
    result
}

async fn compare_dns_multi_with_session(
    domain: String,
    location_magics: Vec<String>,
    session_id: &str,
) -> AppResult<MultiNodeDnsResult> {
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
            });
        }
        Ok(Err(error)) => answers.push(NodeDnsAnswer {
            node_id: "local".into(),
            node_label: "This Mac".into(),
            ok: false,
            answers: vec![],
            detail: Some(error.to_string()),
            failure_kind: Some("request".into()),
        }),
        Err(_) => answers.push(NodeDnsAnswer {
            node_id: "local".into(),
            node_label: "This Mac".into(),
            ok: false,
            answers: vec![],
            detail: None,
            failure_kind: Some("timeout".into()),
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

    let magics = if location_magics.is_empty() {
        vec!["world".into()]
    } else {
        location_magics.into_iter().take(3).collect()
    };
    let client = reqwest::Client::builder()
        .timeout(GP_REQUEST_TIMEOUT)
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|error| AppError::new("GP_CLIENT", error.to_string()))?;
    let locations: Vec<serde_json::Value> = magics
        .iter()
        .map(|magic| serde_json::json!({ "magic": magic, "limit": 1 }))
        .collect();
    let body = serde_json::json!({
        "type": "dns",
        "target": domain.clone(),
        "locations": locations,
        "measurementOptions": { "query": { "type": "A" } }
    });
    let deadline = TokioInstant::now() + GP_MEASUREMENT_TIMEOUT;

    let create_result = tokio::select! {
        biased;
        _ = wait_for_cancellation(session_id) => {
            return Ok(make_result(domain, answers, started, command_hint, session_id, true));
        }
        result = tokio::time::timeout_at(deadline, async {
            let response = client.post(GP_API).json(&body).send().await?;
            if response.status().as_u16() == 429 {
                return Ok::<_, reqwest::Error>(CreateOutcome::Quota);
            }
            let status = response.status();
            if !status.is_success() {
                return Ok(CreateOutcome::Http(status.as_u16()));
            }
            response.json::<GpCreate>().await.map(CreateOutcome::Created)
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
        Ok(Ok(CreateOutcome::Quota)) => {
            answers.push(globalping_failure("quota", None));
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
            answers.push(globalping_failure(
                "request",
                Some(format!("Globalping HTTP {status}")),
            ));
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

    let url = format!("{GP_API}/{}", created.id);
    loop {
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
        if TokioInstant::now() >= deadline {
            answers.push(globalping_failure("timeout", None));
            break;
        }

        // Globalping defines every status other than `in-progress` as terminal.
        let poll_result = tokio::select! {
            biased;
            _ = wait_for_cancellation(session_id) => {
                return Ok(make_result(domain, answers, started, command_hint, session_id, true));
            }
            result = tokio::time::timeout_at(deadline, async {
                let response = client.get(&url).send().await?;
                if response.status().as_u16() == 429 {
                    return Ok::<_, reqwest::Error>(PollOutcome::Quota);
                }
                let status = response.status();
                if !status.is_success() {
                    return Ok(PollOutcome::Http(status.as_u16()));
                }
                response.json::<GpResult>().await.map(PollOutcome::Result)
            }) => result,
        };

        match poll_result {
            Err(_) => {
                answers.push(globalping_failure("timeout", None));
                break;
            }
            Ok(Ok(PollOutcome::Result(result))) if is_measurement_terminal(&result.status) => {
                if result.results.is_empty() {
                    answers.push(globalping_failure("measurement", None));
                } else {
                    append_measurement_results(&mut answers, result);
                }
                break;
            }
            Ok(Ok(PollOutcome::Result(_))) => {}
            Ok(Ok(PollOutcome::Quota)) => {
                answers.push(globalping_failure("quota", None));
                break;
            }
            Ok(Ok(PollOutcome::Http(status))) => {
                answers.push(globalping_failure(
                    "request",
                    Some(format!("Globalping HTTP {status}")),
                ));
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
                return Ok(make_result(domain, answers, started, command_hint, session_id, true));
            }
            _ = tokio::time::sleep_until(next_poll_wakeup(TokioInstant::now(), deadline)) => {}
        }
    }

    Ok(make_result(
        domain,
        answers,
        started,
        command_hint,
        session_id,
        false,
    ))
}

#[derive(Debug)]
enum CreateOutcome {
    Created(GpCreate),
    Quota,
    Http(u16),
}

#[derive(Debug)]
enum PollOutcome {
    Result(GpResult),
    Quota,
    Http(u16),
}

fn append_measurement_results(answers: &mut Vec<NodeDnsAnswer>, result: GpResult) {
    for (idx, probe_result) in result.results.into_iter().enumerate() {
        let label = format!(
            "Globalping · {}/{}",
            probe_result.probe.city.unwrap_or_else(|| "?".into()),
            probe_result.probe.country.unwrap_or_else(|| "?".into())
        );
        let vals: Vec<String> = probe_result
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
        let (ok, failure_kind) =
            classify_probe_result(&probe_result.result.status, !vals.is_empty());
        answers.push(NodeDnsAnswer {
            node_id: format!("gp-{idx}"),
            node_label: label,
            ok,
            answers: vals,
            detail: probe_result.result.raw_output,
            failure_kind: failure_kind.map(str::to_owned),
        });
    }
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

fn globalping_failure(failure_kind: &str, detail: Option<String>) -> NodeDnsAnswer {
    NodeDnsAnswer {
        node_id: "globalping".into(),
        node_label: "Globalping".into(),
        ok: false,
        answers: vec![],
        detail,
        failure_kind: Some(failure_kind.into()),
    }
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
        classify_probe_result, compare_dns_multi_with_session, is_measurement_terminal,
        next_poll_wakeup,
    };
    use crate::net_probe::session::{cancel_scan, clear_session, new_session_id};
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

    #[tokio::test]
    async fn pre_cancelled_comparison_returns_without_network_work() {
        let session_id = new_session_id();
        cancel_scan(session_id.clone());

        let result =
            compare_dns_multi_with_session("example.com".into(), vec!["world".into()], &session_id)
                .await
                .expect("a cancelled comparison should return its partial result");

        assert!(result.cancelled);
        assert_eq!(result.session_id, session_id);
        assert!(result.answers.is_empty());
        clear_session(&result.session_id);
    }
}
