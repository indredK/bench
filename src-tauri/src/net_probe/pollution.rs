//! Pollution / hijack indicators — detect only, never attack (design-security §5.2).

use super::types::{PollutionFinding, PollutionReport};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::collections::BTreeSet;
use std::time::Instant;

const RESOLVERS: &[(&str, &str)] = &[
    ("system", "system"),
    ("1.1.1.1", "1.1.1.1"),
    ("8.8.8.8", "8.8.8.8"),
];

pub async fn run_pollution_check(domain: String) -> AppResult<PollutionReport> {
    validate_host(&domain)?;
    let started = Instant::now();
    let command_hint = format!("detectPollution(local, '{domain}')");
    let mut findings = Vec::new();

    // --- DNS multi-resolver ---
    let mut answer_sets: Vec<(String, BTreeSet<String>)> = Vec::new();
    for (label, resolver) in RESOLVERS {
        let resolver_arg = if *resolver == "system" {
            None
        } else {
            Some((*resolver).to_string())
        };
        match super::dns::dns_lookup(domain.clone(), Some("A".into()), resolver_arg).await {
            Ok(res) => {
                let set: BTreeSet<String> = res.records.into_iter().map(|r| r.data).collect();
                answer_sets.push(((*label).into(), set));
            }
            Err(e) => {
                findings.push(PollutionFinding {
                    code: "dns_resolver_failed".into(),
                    kind: "dns".into(),
                    severity: "warn".into(),
                    evidence: format!("resolver {label} failed: {e}"),
                    command_hint: format!(
                        "dnsLookup(local, '{domain}', {{rrType:'A',resolver:'{label}'}})"
                    ),
                });
            }
        }
    }

    if answer_sets.len() >= 2 {
        let first = &answer_sets[0].1;
        let diverge = answer_sets.iter().any(|(_, set)| set != first);
        if diverge {
            let summary: Vec<String> = answer_sets
                .iter()
                .map(|(label, set)| {
                    let joined = if set.is_empty() {
                        "(empty)".into()
                    } else {
                        set.iter().cloned().collect::<Vec<_>>().join(", ")
                    };
                    format!("{label}=[{joined}]")
                })
                .collect();
            findings.push(PollutionFinding {
                code: "dns_answers_disagree".into(),
                kind: "dns".into(),
                severity: "warn".into(),
                evidence: format!(
                    "Resolver answers disagree for {domain}: {}",
                    summary.join("; ")
                ),
                command_hint: format!("detectDnsPollution(local, '{domain}')"),
            });
        } else if !first.is_empty() {
            findings.push(PollutionFinding {
                code: "dns_resolvers_agree".into(),
                kind: "dns".into(),
                severity: "info".into(),
                evidence: format!(
                    "Resolvers agree for {domain}: {}",
                    first.iter().cloned().collect::<Vec<_>>().join(", ")
                ),
                command_hint: format!("detectDnsPollution(local, '{domain}')"),
            });
        }
    }

    // --- hosts overrides ---
    match tauri::async_runtime::spawn_blocking(super::hosts::check_hosts_overrides).await {
        Ok(Ok(hosts)) => {
            let suspicious: Vec<_> = hosts.into_iter().filter(|h| h.suspicious).collect();
            if suspicious.is_empty() {
                findings.push(PollutionFinding {
                    code: "hosts_clean".into(),
                    kind: "hosts".into(),
                    severity: "info".into(),
                    evidence: "No suspicious hosts overrides detected.".into(),
                    command_hint: "checkHostsOverrides()".into(),
                });
            } else {
                for h in suspicious.into_iter().take(12) {
                    findings.push(PollutionFinding {
                        code: "hosts_override".into(),
                        kind: "hosts".into(),
                        severity: "warn".into(),
                        evidence: format!(
                            "hosts line {}: {} → {}",
                            h.line,
                            h.names.join(", "),
                            h.address
                        ),
                        command_hint: "checkHostsOverrides()".into(),
                    });
                }
            }
        }
        Ok(Err(e)) => findings.push(PollutionFinding {
            code: "hosts_read_failed".into(),
            kind: "hosts".into(),
            severity: "warn".into(),
            evidence: format!("Could not read hosts: {e}"),
            command_hint: "checkHostsOverrides()".into(),
        }),
        Err(e) => {
            return Err(AppError::task_failed(format!("hosts join: {e}")));
        }
    }

    // --- light TLS / MITM indicators ---
    findings.push(check_ssl_light(&domain).await);

    // --- default route via tunnel (proxy/vpn hint) ---
    if let Ok(Ok(status)) =
        tauri::async_runtime::spawn_blocking(super::offline::get_proxy_vpn_status).await
    {
        if status.default_via_tunnel {
            findings.push(PollutionFinding {
                code: "route_tunnel_detected".into(),
                kind: "route".into(),
                severity: "info".into(),
                evidence: "Default route appears to go through a tunnel (VPN/proxy-like).".into(),
                command_hint: "getProxyVpnStatus()".into(),
            });
        }
        if status.proxy_enabled {
            findings.push(PollutionFinding {
                code: "route_proxy_enabled".into(),
                kind: "route".into(),
                severity: "info".into(),
                evidence: format!(
                    "System HTTP(S) proxy is enabled ({}); may be a corporate middlebox.",
                    status.proxy_detail.unwrap_or_else(|| "enabled".into())
                ),
                command_hint: "getProxyVpnStatus()".into(),
            });
        }
    }

    // --- ARP spoofing hints (read-only) ---
    match tauri::async_runtime::spawn_blocking(super::discovery::detect_arp_spoofing_hints).await {
        Ok(Ok(mut arp_findings)) => findings.append(&mut arp_findings),
        Ok(Err(e)) => findings.push(PollutionFinding {
            code: "arp_check_failed".into(),
            kind: "arp".into(),
            severity: "warn".into(),
            evidence: format!("ARP spoofing check failed: {e}"),
            command_hint: "detectArpSpoofing(local) // read-only".into(),
        }),
        Err(e) => {
            return Err(AppError::task_failed(format!("arp spoof join: {e}")));
        }
    }

    Ok(PollutionReport {
        domain,
        findings,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

async fn check_ssl_light(domain: &str) -> PollutionFinding {
    let url = format!("https://{domain}/");
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::limited(3))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return PollutionFinding {
                code: "tls_client_setup_failed".into(),
                kind: "tls".into(),
                severity: "warn".into(),
                evidence: format!("TLS client build failed: {e}"),
                command_hint: format!("checkSsl('{domain}')"),
            };
        }
    };

    match client.get(&url).send().await {
        Ok(resp) => {
            let status = resp.status();
            // A successful response means this client accepted the certificate chain;
            // it is not a full comparison against the operating system's trust store.
            PollutionFinding {
                code: "tls_probe_succeeded".into(),
                kind: "tls".into(),
                severity: "info".into(),
                evidence: format!("HTTPS to {domain} succeeded (HTTP {status}); the client accepted the certificate chain."),
                command_hint: format!("checkSsl('{domain}')"),
            }
        }
        Err(e) => https_probe_failed(domain, e),
    }
}

fn https_probe_failed(domain: &str, error: impl std::fmt::Display) -> PollutionFinding {
    PollutionFinding {
        code: "tls_probe_failed".into(),
        kind: "tls".into(),
        // A failed HTTP request can be caused by DNS, routing, timeout, proxy, or TLS.
        // It does not establish interception, so never classify this as a high-risk finding.
        severity: "warn".into(),
        evidence: format!(
            "Could not verify HTTPS for {domain}: {error}. This failure alone does not indicate TLS interception."
        ),
        command_hint: format!("checkSsl('{domain}')"),
    }
}

#[cfg(test)]
mod tests {
    use super::https_probe_failed;

    #[test]
    fn ordinary_https_transport_failures_are_not_reported_as_high_risk() {
        for message in [
            "request timed out",
            "failed to resolve host",
            "proxy connection refused",
            "certificate verification failed",
        ] {
            let finding = https_probe_failed("example.com", message);

            assert_eq!(finding.code, "tls_probe_failed");
            assert_eq!(finding.kind, "tls");
            assert_eq!(finding.severity, "warn");
            assert!(finding
                .evidence
                .contains("does not indicate TLS interception"));
        }
    }
}
