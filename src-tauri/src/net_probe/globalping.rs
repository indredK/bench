//! Globalping remote DNS compare (S-DIS-04) + node listing helpers.

use super::types::{MultiNodeDnsResult, NodeDnsAnswer, ProbeNode};
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::time::Instant;

const GP_API: &str = "https://api.globalping.io/v1/measurements";
const GP_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);
const GP_MEASUREMENT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(45);
const GP_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(700);

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
#[serde(rename_all = "camelCase")]
struct GpInner {
    #[serde(default)]
    status: String,
    #[serde(default)]
    answers: Vec<GpAnswer>,
    #[serde(default)]
    status_code: Option<u16>,
    #[serde(default)]
    status_code_name: Option<String>,
    #[serde(default)]
    raw_output: Option<String>,
}

fn dns_query_succeeded(result: &GpInner) -> bool {
    result.status == "finished" && result.status_code == Some(0)
}

fn measurement_is_terminal(status: &str) -> bool {
    !status.is_empty() && status != "in-progress"
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
                status_code_name: Some("NOERROR".into()),
                detail: None,
                error_code: None,
            });
        }
        Err(e) => answers.push(NodeDnsAnswer {
            node_id: "local".into(),
            node_label: "This Mac".into(),
            ok: false,
            answers: vec![],
            status_code_name: None,
            detail: Some(e.to_string()),
            error_code: None,
        }),
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
        .map_err(|e| AppError::new("GP_CLIENT", e.to_string()))?;

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

    match client.post(GP_API).json(&body).send().await {
        Ok(resp) if resp.status().is_success() => {
            let created: GpCreate = resp
                .json()
                .await
                .map_err(|e| AppError::new("GP_PARSE", e.to_string()))?;
            // Globalping measurements are asynchronous. Follow the top-level status;
            // finished probe rows do not mean that the entire measurement is final.
            let mut final_res: Option<GpResult> = None;
            let mut timed_out = false;
            let mut last_poll_error = None;
            let measurement_url = format!("{GP_API}/{}", created.id);
            let deadline = tokio::time::Instant::now() + GP_MEASUREMENT_TIMEOUT;

            loop {
                let poll = tokio::time::timeout_at(deadline, async {
                    let response = client.get(&measurement_url).send().await?;
                    let status = response.status();
                    let parsed = if status.is_success() {
                        Some(response.json::<GpResult>().await?)
                    } else {
                        None
                    };
                    Ok::<_, reqwest::Error>((status, parsed))
                })
                .await;

                match poll {
                    Err(_) => {
                        timed_out = true;
                        break;
                    }
                    Ok(Ok((_, Some(parsed)))) => {
                        last_poll_error = None;
                        let terminal = measurement_is_terminal(&parsed.status);
                        final_res = Some(parsed);
                        if terminal {
                            break;
                        }
                    }
                    Ok(Ok((status, None))) if status.as_u16() == 429 => {
                        answers.push(NodeDnsAnswer {
                            node_id: "globalping".into(),
                            node_label: "Globalping".into(),
                            ok: false,
                            answers: vec![],
                            status_code_name: None,
                            detail: Some(
                                "Globalping quota exhausted (HTTP 429). Configure a token later."
                                    .into(),
                            ),
                            error_code: None,
                        });
                        break;
                    }
                    Ok(Ok((status, None)))
                        if status.is_server_error() || status.as_u16() == 408 =>
                    {
                        last_poll_error = Some(format!("Globalping HTTP {status}"));
                    }
                    Ok(Ok((status, None))) => {
                        answers.push(NodeDnsAnswer {
                            node_id: "globalping".into(),
                            node_label: "Globalping".into(),
                            ok: false,
                            answers: vec![],
                            status_code_name: None,
                            detail: Some(format!("Globalping poll failed with HTTP {status}.")),
                            error_code: None,
                        });
                        break;
                    }
                    Ok(Err(error)) => {
                        last_poll_error = Some(format!("Globalping poll request failed: {error}"));
                    }
                }

                if tokio::time::timeout_at(deadline, tokio::time::sleep(GP_POLL_INTERVAL))
                    .await
                    .is_err()
                {
                    timed_out = true;
                    break;
                }
            }

            if let Some(res) = final_res {
                let measurement_status = res.status.clone();
                let no_probe_results = res.results.is_empty();
                for (idx, pr) in res.results.into_iter().enumerate() {
                    let ok = dns_query_succeeded(&pr.result);
                    let probe_timed_out = timed_out && pr.result.status == "in-progress";
                    let label = format!(
                        "Globalping · {}/{}",
                        pr.probe.city.unwrap_or_else(|| "?".into()),
                        pr.probe.country.unwrap_or_else(|| "?".into())
                    );
                    let vals: Vec<String> = pr
                        .result
                        .answers
                        .into_iter()
                        .map(|a| {
                            if a.rr_type.is_empty() {
                                a.value
                            } else {
                                format!("{} {}", a.rr_type, a.value)
                            }
                        })
                        .collect();
                    answers.push(NodeDnsAnswer {
                        node_id: format!("gp-{idx}"),
                        node_label: label,
                        ok,
                        answers: vals,
                        status_code_name: pr.result.status_code_name,
                        detail: pr.result.raw_output,
                        error_code: probe_timed_out.then(|| "GLOBALPING_TIMEOUT".into()),
                    });
                }

                if !timed_out && no_probe_results && !measurement_status.is_empty() {
                    answers.push(NodeDnsAnswer {
                        node_id: "globalping-empty".into(),
                        node_label: "Globalping".into(),
                        ok: false,
                        answers: vec![],
                        status_code_name: None,
                        detail: Some(format!(
                            "The measurement ended with status '{}' but contained no probe results.",
                            measurement_status
                        )),
                        error_code: None,
                    });
                }
            }

            if timed_out {
                let mut detail = format!(
                    "Globalping did not return a final measurement status within {} seconds.",
                    GP_MEASUREMENT_TIMEOUT.as_secs()
                );
                if let Some(error) = last_poll_error {
                    detail.push_str(&format!(" Last polling error: {error}."));
                }
                answers.push(NodeDnsAnswer {
                    node_id: "globalping-timeout".into(),
                    node_label: "Globalping".into(),
                    ok: false,
                    answers: vec![],
                    status_code_name: None,
                    detail: Some(detail),
                    error_code: Some("GLOBALPING_TIMEOUT".into()),
                });
            }
        }
        Ok(resp) if resp.status().as_u16() == 429 => {
            answers.push(NodeDnsAnswer {
                node_id: "globalping".into(),
                node_label: "Globalping".into(),
                ok: false,
                answers: vec![],
                status_code_name: None,
                detail: Some("Globalping quota exhausted (HTTP 429).".into()),
                error_code: None,
            });
        }
        Ok(resp) => {
            answers.push(NodeDnsAnswer {
                node_id: "globalping".into(),
                node_label: "Globalping".into(),
                ok: false,
                answers: vec![],
                status_code_name: None,
                detail: Some(format!("Globalping HTTP {}", resp.status())),
                error_code: None,
            });
        }
        Err(e) => {
            answers.push(NodeDnsAnswer {
                node_id: "globalping".into(),
                node_label: "Globalping".into(),
                ok: false,
                answers: vec![],
                status_code_name: None,
                detail: Some(format!("Globalping request failed: {e}")),
                error_code: None,
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
    use super::{dns_query_succeeded, measurement_is_terminal, GpInner, GpResult};

    #[test]
    fn top_level_in_progress_status_stays_pending_when_a_probe_is_finished() {
        let result: GpResult = serde_json::from_str(
            r#"{"status":"in-progress","results":[{"result":{"status":"finished","statusCode":0},"probe":{}}]}"#,
        )
        .expect("valid partial Globalping measurement");

        assert_eq!(result.results[0].result.status, "finished");
        assert!(!measurement_is_terminal(&result.status));
    }

    #[test]
    fn any_known_nonempty_measurement_status_other_than_in_progress_is_terminal() {
        assert!(measurement_is_terminal("finished"));
        assert!(measurement_is_terminal("failed"));
        assert!(!measurement_is_terminal(""));
        assert!(!measurement_is_terminal("in-progress"));
    }

    #[test]
    fn globalping_nxdomain_is_not_reported_as_success() {
        let result: GpInner = serde_json::from_str(
            r#"{"status":"finished","statusCode":3,"statusCodeName":"NXDOMAIN","answers":[],"rawOutput":"no such domain"}"#,
        )
        .expect("valid Globalping DNS result");

        assert!(!dns_query_succeeded(&result));
        assert_eq!(result.status_code_name.as_deref(), Some("NXDOMAIN"));
        assert_eq!(result.raw_output.as_deref(), Some("no such domain"));
    }

    #[test]
    fn successful_noerror_response_can_have_no_records() {
        let result: GpInner = serde_json::from_str(
            r#"{"status":"finished","statusCode":0,"statusCodeName":"NOERROR","answers":[]}"#,
        )
        .expect("valid Globalping DNS result");

        assert!(dns_query_succeeded(&result));
    }

    #[test]
    fn missing_dns_response_code_fails_closed() {
        let result: GpInner = serde_json::from_str(r#"{"status":"finished","answers":[]}"#)
            .expect("valid partial Globalping DNS result");

        assert!(!dns_query_succeeded(&result));
    }
}
