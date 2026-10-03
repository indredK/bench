//! DNSSEC / DoH / DoT — Hickory wire-format DoH with local DNSSEC validation (S-SEC-05).

use super::types::DnsSecCheckResult;
use super::validate::validate_host;
use crate::error::AppResult;
use hickory_resolver::config::{ResolveHosts, ResolverConfig, ResolverOpts, CLOUDFLARE};
use hickory_resolver::lookup::Lookup;
use hickory_resolver::net::runtime::TokioRuntimeProvider;
use hickory_resolver::net::{DnsError, NetError};
use hickory_resolver::proto::dnssec::Proof;
use hickory_resolver::proto::rr::{Record, RecordType};
use hickory_resolver::Resolver;
use std::time::Instant;
use tokio::time::{timeout, Duration};

const DOT_PROBE_DOMAIN: &str = "example.com.";
const DNS_QUERY_TIMEOUT: Duration = Duration::from_secs(5);

pub async fn check_dnssec(domain: String) -> AppResult<DnsSecCheckResult> {
    validate_host(&domain)?;
    let command_hint =
        format!("checkDnsSec('{domain}') // Hickory DoH DNSSEC validation + DoT reachability");

    let (
        (dnssec_status, dnssec_detail, doh_ok, doh_rtt_ms, doh_detail),
        (dot_ok, dot_rtt_ms, dot_detail),
    ) = tokio::join!(probe_doh_dnssec(&domain), probe_dot());

    Ok(DnsSecCheckResult {
        domain,
        dnssec_status,
        dnssec_detail,
        doh_ok,
        doh_rtt_ms,
        doh_detail,
        dot_ok,
        dot_rtt_ms,
        dot_detail,
        command_hint,
    })
}

async fn probe_doh_dnssec(
    domain: &str,
) -> (String, Option<String>, bool, Option<f64>, Option<String>) {
    let mut options = ResolverOpts::default();
    options.validate = true;
    options.timeout = DNS_QUERY_TIMEOUT;
    options.attempts = 1;
    options.use_hosts_file = ResolveHosts::Never;
    options.preserve_intermediates = true;
    let resolver = match Resolver::builder_with_config(
        ResolverConfig::https(&CLOUDFLARE),
        TokioRuntimeProvider::default(),
    )
    .with_options(options)
    .build()
    {
        Ok(resolver) => resolver,
        Err(error) => {
            return (
                "unknown".into(),
                Some(format!("DoH resolver setup failed: {error}")),
                false,
                None,
                Some(format!("DoH resolver setup failed: {error}")),
            )
        }
    };

    let query_domain = if domain.ends_with('.') {
        domain.to_owned()
    } else {
        format!("{domain}.")
    };
    let t0 = Instant::now();
    match timeout(
        DNS_QUERY_TIMEOUT,
        resolver.lookup(query_domain, RecordType::A),
    )
    .await
    {
        Ok(result) => {
            let (dnssec_status, dnssec_detail, doh_ok) = classify_doh_lookup(result);
            let ms = doh_ok.then(|| t0.elapsed().as_secs_f64() * 1000.0);
            let doh_detail = if doh_ok {
                Some(format!(
                    "DoH over HTTPS via Cloudflare completed; Hickory locally evaluated DNSSEC ({dnssec_status})"
                ))
            } else {
                dnssec_detail.clone()
            };
            (dnssec_status, dnssec_detail, doh_ok, ms, doh_detail)
        }
        Err(_) => (
            "unknown".into(),
            Some("DoH DNS query timed out before DNSSEC validation completed.".into()),
            false,
            None,
            Some("DoH DNS query timed out before DNSSEC validation completed.".into()),
        ),
    }
}

fn classify_doh_lookup(result: Result<Lookup, NetError>) -> (String, Option<String>, bool) {
    match result {
        Ok(lookup) => {
            let status = classify_proofs(
                lookup
                    .answers()
                    .iter()
                    .filter(|record| record.record_type() != RecordType::RRSIG)
                    .map(|record| &record.proof),
            );
            let detail = match status {
                "secure" => format!(
                    "Hickory locally validated the DNSSEC chain for {} answer record(s).",
                    lookup.answers().len()
                ),
                "insecure" => {
                    "Hickory determined the response has no authenticated DNSSEC chain.".into()
                }
                "bogus" => "Hickory rejected the DNSSEC proof for the response.".into(),
                _ => "Hickory could not determine the DNSSEC status of the response.".into(),
            };
            (status.into(), Some(detail), true)
        }
        Err(NetError::Dns(DnsError::Nsec { proof, .. })) => {
            let status = proof_status(proof);
            (
                status.into(),
                Some(format!(
                    "Hickory could not validate the DNS denial proof ({proof})."
                )),
                true,
            )
        }
        Err(NetError::Dns(DnsError::NoRecordsFound(no_records))) => {
            let authorities = no_records.authorities.as_deref().unwrap_or_default();
            let status = classify_negative_records(authorities);
            let detail = match status {
                "secure" => "Hickory locally validated the DNSSEC proof for the negative response.".into(),
                "insecure" => "Hickory determined the negative response belongs to an insecure DNSSEC chain.".into(),
                "bogus" => "Hickory rejected the DNSSEC proof for the negative response.".into(),
                _ => format!(
                    "Hickory received a negative DNS response ({}) but could not determine its DNSSEC status.",
                    no_records.response_code
                ),
            };
            (status.into(), Some(detail), true)
        }
        Err(NetError::Dns(error)) => (
            "unknown".into(),
            Some(format!(
                "Cloudflare returned a DNS response that Hickory could not classify: {error}"
            )),
            true,
        ),
        Err(error) => (
            "unknown".into(),
            Some(format!("DoH query failed: {error}")),
            false,
        ),
    }
}

fn classify_proofs<'a>(proofs: impl Iterator<Item = &'a Proof>) -> &'static str {
    let mut found_proof = false;
    let mut found_insecure = false;
    let mut found_bogus = false;
    let mut found_indeterminate = false;

    for proof in proofs {
        found_proof = true;
        match proof {
            Proof::Secure => {}
            Proof::Insecure => found_insecure = true,
            Proof::Bogus => found_bogus = true,
            Proof::Indeterminate => found_indeterminate = true,
        }
    }

    if found_bogus {
        return "bogus";
    }
    if found_indeterminate {
        return "unknown";
    }

    match (found_proof, found_insecure) {
        (false, _) => "unknown",
        (true, true) => "insecure",
        (true, false) => "secure",
    }
}

fn classify_negative_records(records: &[Record]) -> &'static str {
    let relevant_records = records
        .iter()
        .filter(|record| record.record_type() != RecordType::RRSIG)
        .collect::<Vec<_>>();
    let has_authenticated_denial = relevant_records.iter().any(|record| {
        record.proof.is_secure()
            && matches!(record.record_type(), RecordType::NSEC | RecordType::NSEC3)
    });
    let proofs = relevant_records
        .iter()
        .map(|record| record.proof)
        .collect::<Vec<_>>();

    classify_negative_proofs(&proofs, has_authenticated_denial)
}

fn classify_negative_proofs(proofs: &[Proof], has_authenticated_denial: bool) -> &'static str {
    let status = classify_proofs(proofs.iter());
    if status == "secure" && !has_authenticated_denial {
        "unknown"
    } else {
        status
    }
}

fn proof_status(proof: Proof) -> &'static str {
    match proof {
        Proof::Secure => "secure",
        Proof::Insecure => "insecure",
        Proof::Bogus => "bogus",
        Proof::Indeterminate => "unknown",
    }
}

async fn probe_dot() -> (bool, Option<f64>, Option<String>) {
    let mut options = ResolverOpts::default();
    options.timeout = DNS_QUERY_TIMEOUT;
    options.attempts = 1;
    options.use_hosts_file = ResolveHosts::Never;
    let resolver = match Resolver::builder_with_config(
        ResolverConfig::tls(&CLOUDFLARE),
        TokioRuntimeProvider::default(),
    )
    .with_options(options)
    .build()
    {
        Ok(resolver) => resolver,
        Err(error) => {
            return (
                false,
                None,
                Some(format!("DoT resolver setup failed: {error}")),
            )
        }
    };

    let t0 = Instant::now();
    match timeout(
        Duration::from_secs(5),
        resolver.lookup(DOT_PROBE_DOMAIN, RecordType::A),
    )
    .await
    {
        Ok(Ok(lookup)) => {
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            (
                true,
                Some(ms),
                Some(format!(
                    "DoT TLS handshake and DNS query succeeded via Cloudflare ({} answers)",
                    lookup.answers().len()
                )),
            )
        }
        Ok(Err(error)) => (false, None, Some(format!("DoT query failed: {error}"))),
        Err(_) => (false, None, Some("DoT DNS query timed out".into())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secure_answer_requires_every_answer_rrset_to_be_validated() {
        assert_eq!(classify_proofs([Proof::Secure].iter()), "secure");
        assert_eq!(
            classify_proofs([Proof::Secure, Proof::Insecure].iter()),
            "insecure"
        );
    }

    #[test]
    fn bogus_and_indeterminate_proofs_are_not_mislabeled() {
        assert_eq!(classify_proofs([Proof::Bogus].iter()), "bogus");
        assert_eq!(classify_proofs([Proof::Indeterminate].iter()), "unknown");
        assert_eq!(
            classify_proofs([Proof::Indeterminate, Proof::Bogus].iter()),
            "bogus"
        );
        assert_eq!(classify_proofs([].iter()), "unknown");
    }

    #[test]
    fn negative_answer_is_secure_only_with_authenticated_denial_proof() {
        assert_eq!(classify_negative_proofs(&[Proof::Secure], true), "secure");
        assert_eq!(classify_negative_proofs(&[Proof::Secure], false), "unknown");
        assert_eq!(
            classify_negative_proofs(&[Proof::Insecure], false),
            "insecure"
        );
    }
}
