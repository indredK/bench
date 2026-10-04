//! DNSSEC / DoH / DoT — Cloudflare DoH JSON AD bit + reachability (S-SEC-05).

use super::types::DnsSecCheckResult;
use super::validate::validate_host;
use crate::error::AppResult;
use hickory_resolver::{
    config::{ResolverConfig, CLOUDFLARE},
    net::{runtime::TokioRuntimeProvider, DnsError, NetError},
    proto::dnssec::Proof,
    TokioResolver,
};
use serde::Deserialize;
use std::time::Instant;
use tokio::time::{timeout, Duration};

const DOH_URL: &str = "https://cloudflare-dns.com/dns-query";
const MAX_DOH_RESPONSE_BYTES: usize = 64 * 1024;
const DOT_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Deserialize)]
struct DohJson {
    #[serde(rename = "Status")]
    status: Option<u32>,
    #[serde(rename = "AD")]
    ad: Option<bool>,
    #[serde(rename = "CD")]
    cd: Option<bool>,
    #[serde(default)]
    #[serde(rename = "Answer")]
    answer: Option<Vec<serde_json::Value>>,
}

pub async fn check_dnssec(domain: String) -> AppResult<DnsSecCheckResult> {
    validate_host(&domain)?;
    let command_hint = format!("checkDnsSec('{domain}') // DoH AD-bit + DoT reachability");

    let (doh_status, doh_detail, doh_ok, doh_rtt_ms, doh_message) = probe_doh_dnssec(&domain).await;
    let (dot_status, dot_ok, dot_rtt_ms, dot_detail) = probe_dot(&domain).await;
    let (dnssec_status, dnssec_detail) = if dot_status != "unknown" {
        (dot_status, dot_detail.clone().or(doh_detail.clone()))
    } else if doh_status == "secure" {
        ("secure".into(), doh_detail.clone())
    } else {
        (
            "unknown".into(),
            dot_detail.clone().or(doh_detail).or(doh_message.clone()),
        )
    };

    Ok(DnsSecCheckResult {
        domain,
        dnssec_status,
        dnssec_detail,
        doh_ok,
        doh_rtt_ms,
        doh_detail: doh_message,
        dot_ok,
        dot_rtt_ms,
        dot_detail,
        command_hint,
    })
}

async fn probe_doh_dnssec(
    domain: &str,
) -> (String, Option<String>, bool, Option<f64>, Option<String>) {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return (
                "unknown".into(),
                Some(format!("DoH client: {e}")),
                false,
                None,
                Some(format!("DoH client: {e}")),
            )
        }
    };
    // type=A + DO flag via cd=false (default) — Cloudflare reports AD when chain validates.
    let url = format!("{DOH_URL}?name={domain}&type=A&do=true");
    let t0 = Instant::now();
    match client
        .get(&url)
        .header("accept", "application/dns-json")
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            match super::bounded_http::read_response_body_limited(resp, MAX_DOH_RESPONSE_BYTES)
                .await
            {
                Ok(body) if body.truncated => (
                    "unknown".into(),
                    Some(format!(
                        "DoH response exceeded the {} byte safety limit.",
                        MAX_DOH_RESPONSE_BYTES
                    )),
                    true,
                    Some(ms),
                    Some("DoH response was too large to parse safely.".into()),
                ),
                Ok(body) => match serde_json::from_slice::<DohJson>(&body.bytes) {
                    Ok(body) => {
                        let ad = body.ad.unwrap_or(false);
                        let status = body.status.unwrap_or(0);
                        let answers = body.answer.as_ref().map(|a| a.len()).unwrap_or(0);
                        let (dnssec_status, dnssec_detail) = if status == 2 {
                            (
                            "unknown".into(),
                            Some(
                                "DoH returned SERVFAIL; this alone cannot distinguish DNSSEC failure from an upstream or network error."
                                    .into(),
                            ),
                        )
                        } else if ad {
                            (
                            "secure".into(),
                            Some(format!(
                                "Cloudflare DoH reported AD=true ({answers} answers). Authenticated Data bit set."
                            )),
                        )
                        } else if answers > 0 {
                            (
                            "unknown".into(),
                            Some(format!(
                                "Answers present but AD=false (CD={:?}); the DoH response does not prove the zone is insecure.",
                                body.cd
                            )),
                        )
                        } else {
                            (
                                "unknown".into(),
                                Some("DoH OK but no answers and AD=false.".into()),
                            )
                        };
                        (
                            dnssec_status,
                            dnssec_detail,
                            true,
                            Some(ms),
                            Some(format!("DoH OK via {DOH_URL} (AD={ad})")),
                        )
                    }
                    Err(e) => (
                        "unknown".into(),
                        Some(format!("DoH JSON parse: {e}")),
                        true,
                        Some(ms),
                        Some(format!("DoH HTTP OK but JSON parse failed: {e}")),
                    ),
                },
                Err(e) => (
                    "unknown".into(),
                    Some(format!("DoH response read failed: {e}")),
                    true,
                    Some(ms),
                    Some("DoH response could not be read completely.".into()),
                ),
            }
        }
        Ok(resp) => (
            "unknown".into(),
            Some(format!("DoH HTTP {}", resp.status())),
            false,
            None,
            Some(format!("DoH HTTP {}", resp.status())),
        ),
        Err(e) => (
            "unknown".into(),
            Some(format!("DoH failed: {e}")),
            false,
            None,
            Some(format!("DoH failed: {e}")),
        ),
    }
}

async fn probe_dot(domain: &str) -> (String, bool, Option<f64>, Option<String>) {
    let mut builder = TokioResolver::builder_with_config(
        ResolverConfig::tls(&CLOUDFLARE),
        TokioRuntimeProvider::default(),
    );
    builder.options_mut().validate = true;
    builder.options_mut().timeout = DOT_TIMEOUT;
    builder.options_mut().attempts = 1;

    let resolver = match builder.build() {
        Ok(resolver) => resolver,
        Err(error) => {
            return (
                "unknown".into(),
                false,
                None,
                Some(format!("DoT resolver setup failed: {error}")),
            )
        }
    };
    let t0 = Instant::now();
    let query_name = format!("{}.", domain.trim_end_matches('.'));
    match timeout(DOT_TIMEOUT, resolver.lookup_ip(query_name)).await {
        Ok(Ok(lookup)) => {
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            let status = status_from_proofs(lookup.as_lookup().answers().iter().map(|r| r.proof));
            (
                status.into(),
                true,
                Some(ms),
                Some(format!(
                    "TLS certificate and DNS response validated via DoT (DNSSEC: {status})."
                )),
            )
        }
        Ok(Err(NetError::Dns(DnsError::DnssecBogus))) => {
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            (
                "bogus".into(),
                true,
                Some(ms),
                Some(
                    "TLS certificate validated; Hickory DNSSEC validation rejected the answer."
                        .into(),
                ),
            )
        }
        Ok(Err(NetError::Dns(DnsError::Nsec { proof, .. }))) => {
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            let status = status_from_proofs(std::iter::once(proof));
            (
                status.into(),
                true,
                Some(ms),
                Some(format!(
                    "TLS certificate and negative DNS proof validated via DoT (DNSSEC: {status})."
                )),
            )
        }
        Ok(Err(error @ NetError::Dns(_))) => {
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            (
                "unknown".into(),
                true,
                Some(ms),
                Some(format!(
                    "TLS validated; DoT returned no classifiable DNSSEC result: {error}"
                )),
            )
        }
        Ok(Err(error)) => (
            "unknown".into(),
            false,
            None,
            Some(format!("DoT TLS/DNS query failed: {error}")),
        ),
        Err(_) => (
            "unknown".into(),
            false,
            None,
            Some("DoT TLS/DNS query timed out.".into()),
        ),
    }
}

fn status_from_proofs(proofs: impl Iterator<Item = Proof>) -> &'static str {
    let proofs: Vec<Proof> = proofs.collect();
    if proofs.is_empty() {
        return "unknown";
    }
    if proofs.iter().any(Proof::is_bogus) {
        return "bogus";
    }
    if proofs.iter().all(Proof::is_secure) {
        return "secure";
    }
    if proofs.iter().all(Proof::is_insecure) {
        return "insecure";
    }
    "unknown"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dnssec_status_requires_consistent_proofs() {
        assert_eq!(status_from_proofs([Proof::Secure].into_iter()), "secure");
        assert_eq!(
            status_from_proofs([Proof::Insecure].into_iter()),
            "insecure"
        );
        assert_eq!(status_from_proofs([Proof::Bogus].into_iter()), "bogus");
        assert_eq!(
            status_from_proofs([Proof::Indeterminate].into_iter()),
            "unknown"
        );
        assert_eq!(
            status_from_proofs([Proof::Secure, Proof::Insecure].into_iter()),
            "unknown"
        );
        assert_eq!(status_from_proofs(std::iter::empty()), "unknown");
    }
}
