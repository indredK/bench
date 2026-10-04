//! Globalping remote DNS compare (S-DIS-04) + node listing helpers.

use super::types::{MultiNodeDnsResult, NodeDnsAnswer, ProbeNode};
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::time::Instant;

const GP_API: &str = "https://api.globalping.io/v1/measurements";
const GP_MAX_RESPONSE_BYTES: usize = 256 * 1024;
const GP_TOTAL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(45);

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
        .timeout(std::time::Duration::from_secs(8))
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
            let response =
                super::bounded_http::read_response_body_limited(resp, GP_MAX_RESPONSE_BYTES)
                    .await
                    .map_err(|e| AppError::new("GP_READ", e.to_string()))?;
            if response.truncated {
                return Err(AppError::new(
                    "GP_RESPONSE_TOO_LARGE",
                    "Globalping create response exceeded the safety limit.",
                ));
            }
            let created: GpCreate = serde_json::from_slice(&response.bytes)
                .map_err(|e| AppError::new("GP_PARSE", e.to_string()))?;
            if created.id.is_empty() || created.id.len() > 128 {
                return Err(AppError::new(
                    "GP_PARSE",
                    "Globalping returned an invalid measurement id.",
                ));
            }
            let poll_url = measurement_url(&created.id)?;
            // poll
            let mut final_res: Option<GpResult> = None;
            let mut quota_exhausted = false;
            let deadline = tokio::time::Instant::now() + GP_TOTAL_TIMEOUT;
            loop {
                let now = tokio::time::Instant::now();
                if now >= deadline {
                    break;
                }
                tokio::time::sleep(
                    std::time::Duration::from_millis(700)
                        .min(deadline.saturating_duration_since(now)),
                )
                .await;
                if tokio::time::Instant::now() >= deadline {
                    break;
                }
                match tokio::time::timeout_at(deadline, client.get(poll_url.clone()).send()).await {
                    Err(_) => break,
                    Ok(Ok(r)) if r.status().is_success() => {
                        let response = tokio::time::timeout_at(
                            deadline,
                            super::bounded_http::read_response_body_limited(
                                r,
                                GP_MAX_RESPONSE_BYTES,
                            ),
                        )
                        .await
                        .map_err(|_| {
                            AppError::new("GP_TIMEOUT", "Globalping response read timed out.")
                        })?
                        .map_err(|e| AppError::new("GP_READ", e.to_string()))?;
                        if response.truncated {
                            return Err(AppError::new(
                                "GP_RESPONSE_TOO_LARGE",
                                "Globalping poll response exceeded the safety limit.",
                            ));
                        }
                        let parsed: GpResult = serde_json::from_slice(&response.bytes)
                            .map_err(|e| AppError::new("GP_PARSE", e.to_string()))?;
                        if parsed.status == "finished" || !parsed.results.is_empty() {
                            if parsed.status == "finished"
                                || parsed.results.iter().all(|x| !x.result.status.is_empty())
                            {
                                final_res = Some(parsed);
                                break;
                            }
                            final_res = Some(parsed);
                        }
                    }
                    Ok(Ok(r)) if r.status().as_u16() == 429 => {
                        quota_exhausted = true;
                        answers.push(NodeDnsAnswer {
                            node_id: "globalping".into(),
                            node_label: "Globalping".into(),
                            ok: false,
                            answers: vec![],
                            detail: Some(
                                "Globalping quota exhausted (HTTP 429). Configure a token later."
                                    .into(),
                            ),
                        });
                        break;
                    }
                    Ok(Ok(_)) | Ok(Err(_)) => {}
                }
            }
            if let Some(res) = final_res {
                for (idx, pr) in res.results.into_iter().enumerate() {
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
                    let ok = pr.result.status == "finished" || !vals.is_empty();
                    answers.push(NodeDnsAnswer {
                        node_id: format!("gp-{idx}"),
                        node_label: label,
                        ok,
                        answers: vals,
                        detail: pr
                            .result
                            .raw_output
                            .map(|value| value.chars().take(16_384).collect()),
                    });
                }
            } else if !quota_exhausted {
                answers.push(NodeDnsAnswer {
                    node_id: "globalping".into(),
                    node_label: "Globalping".into(),
                    ok: false,
                    answers: vec![],
                    detail: Some(
                        "Globalping measurement did not finish within the polling window.".into(),
                    ),
                });
            }
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

fn measurement_url(id: &str) -> AppResult<url::Url> {
    let mut url =
        url::Url::parse(GP_API).map_err(|error| AppError::new("GP_URL", error.to_string()))?;
    url.path_segments_mut()
        .map_err(|_| AppError::new("GP_URL", "Globalping endpoint cannot accept path segments"))?
        .push(id);
    Ok(url)
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
}
