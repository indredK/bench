//! DNSSEC / DoH / DoT — Hickory validation over DoT plus Cloudflare DoH reachability (S-SEC-05).

use super::types::DnsSecCheckResult;
use super::validate::validate_host;
use crate::error::AppResult;
use hickory_resolver::{
    config::{NameServerConfig, ResolveHosts, ResolverConfig},
    net::{runtime::TokioRuntimeProvider, DnsError, NetError},
    proto::{
        dnssec::{Proof, TrustAnchors},
        op::ResponseCode,
    },
    Resolver,
};
use serde::Deserialize;
use std::{net::SocketAddr, sync::Arc, time::Instant};
use tokio::time::{timeout, Duration};

const DOH_URL: &str = "https://cloudflare-dns.com/dns-query";
const DOT_ADDRESS: SocketAddr = SocketAddr::new(
    std::net::IpAddr::V4(std::net::Ipv4Addr::new(1, 1, 1, 1)),
    853,
);
const DOT_SERVER_NAME: &str = "cloudflare-dns.com";
const DOT_TIMEOUT: Duration = Duration::from_secs(10);
const DOT_REQUEST_TIMEOUT: Duration = Duration::from_secs(4);
const DOH_RESPONSE_LIMIT: usize = 16 * 1024;

#[derive(Debug, Deserialize)]
struct DohJson {
    #[serde(rename = "Status")]
    status: Option<u32>,
    #[serde(rename = "AD")]
    ad: Option<bool>,
}

pub async fn check_dnssec(domain: String) -> AppResult<DnsSecCheckResult> {
    validate_host(&domain)?;
    let command_hint = format!("checkDnsSec('{domain}') // local DNSSEC validation + DoH/DoT");

    let (doh, dot) = tokio::join!(
        probe_doh(&domain),
        probe_dot_dnssec(&domain, DOT_ADDRESS, DOT_SERVER_NAME)
    );
    let (doh_ok, doh_rtt_ms, doh_detail) = doh;
    let (dnssec_status, dnssec_detail, dot_ok, dot_rtt_ms, dot_detail) = dot;

    Ok(DnsSecCheckResult {
        domain,
        dnssec_status: dnssec_status.into(),
        dnssec_detail: Some(dnssec_detail.into()),
        doh_ok,
        doh_rtt_ms,
        doh_detail: Some(doh_detail.into()),
        dot_ok,
        dot_rtt_ms,
        dot_detail: Some(dot_detail.into()),
        command_hint,
    })
}

async fn probe_doh(domain: &str) -> (bool, Option<f64>, &'static str) {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
    {
        Ok(client) => client,
        Err(_) => return (false, None, "requestFailed"),
    };

    let started = Instant::now();
    let response = match client
        .get(DOH_URL)
        .query(&[("name", domain), ("type", "A"), ("do", "true")])
        .header("accept", "application/dns-json")
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => response,
        Ok(_) => return (false, None, "httpError"),
        Err(_) => return (false, None, "requestFailed"),
    };

    let body =
        match super::bounded_http::read_response_body_limited(response, DOH_RESPONSE_LIMIT).await {
            Ok(body) if !body.truncated => body,
            Ok(_) => return (false, None, "responseTooLarge"),
            Err(_) => return (false, None, "requestFailed"),
        };
    let body = match serde_json::from_slice::<DohJson>(&body.bytes) {
        Ok(body) if body.status.is_some() => body,
        _ => return (false, None, "invalidResponse"),
    };

    let detail = match (body.status, body.ad) {
        (Some(2), _) => "resolverServfail",
        (Some(0), Some(true)) => "authenticatedData",
        (Some(0), Some(false)) => "notAuthenticated",
        (Some(0), None) => "missingAdSignal",
        _ => "resolverFailure",
    };
    (true, Some(started.elapsed().as_secs_f64() * 1000.0), detail)
}

async fn probe_dot_dnssec(
    domain: &str,
    address: SocketAddr,
    server_name: &str,
) -> (&'static str, &'static str, bool, Option<f64>, &'static str) {
    let mut nameserver = NameServerConfig::tls(address.ip(), Arc::from(server_name));
    if let Some(connection) = nameserver.connections.first_mut() {
        connection.port = address.port();
    }

    let config = ResolverConfig::from_name_servers(vec![nameserver]);
    let mut builder = Resolver::builder_with_config(config, TokioRuntimeProvider::default());
    {
        let options = builder.options_mut();
        options.timeout = DOT_REQUEST_TIMEOUT;
        options.attempts = 1;
        options.use_hosts_file = ResolveHosts::Never;
    }
    let resolver = match builder
        .with_trust_anchor(Arc::new(TrustAnchors::default()))
        .build()
    {
        Ok(resolver) => resolver,
        Err(_) => {
            return (
                "unknown",
                "resolverConfigurationFailed",
                false,
                None,
                "tlsOrQueryFailed",
            )
        }
    };

    let started = Instant::now();
    let query_name = if domain.ends_with('.') {
        domain.to_owned()
    } else {
        format!("{domain}.")
    };
    match timeout(DOT_TIMEOUT, resolver.lookup_ip(query_name)).await {
        Ok(Ok(lookup)) => {
            let (status, detail) = classify_proofs(
                lookup
                    .as_lookup()
                    .answers()
                    .iter()
                    .map(|record| record.proof),
            );
            (
                status,
                detail,
                true,
                Some(started.elapsed().as_secs_f64() * 1000.0),
                "tlsVerifiedQuerySucceeded",
            )
        }
        Ok(Err(error)) => {
            let elapsed = Some(started.elapsed().as_secs_f64() * 1000.0);
            if let Some((status, detail)) = classify_dns_error(&error) {
                (status, detail, true, elapsed, "tlsVerifiedDnsResponse")
            } else {
                (
                    "unknown",
                    "resolverFailure",
                    false,
                    None,
                    "tlsOrQueryFailed",
                )
            }
        }
        Err(_) => ("unknown", "requestTimedOut", false, None, "timedOut"),
    }
}

fn classify_proofs(proofs: impl Iterator<Item = Proof>) -> (&'static str, &'static str) {
    let mut any = false;
    let mut has_secure = false;
    let mut has_insecure = false;
    let mut has_bogus = false;

    for proof in proofs {
        any = true;
        match proof {
            Proof::Secure => has_secure = true,
            Proof::Insecure => has_insecure = true,
            Proof::Bogus => has_bogus = true,
            Proof::Indeterminate => return ("unknown", "localValidationIndeterminate"),
        }
    }

    if has_bogus {
        ("bogus", "localValidationBogus")
    } else if has_insecure {
        // A CNAME chain may cross from a signed zone into an unsigned one. The whole answer
        // is only as authenticated as its least secure record.
        ("insecure", "localValidationInsecure")
    } else if any && has_secure {
        ("secure", "localValidationSecure")
    } else {
        ("unknown", "noAnswer")
    }
}

fn classify_dns_error(error: &NetError) -> Option<(&'static str, &'static str)> {
    match error {
        NetError::Dns(DnsError::DnssecBogus) => Some(("bogus", "localValidationBogus")),
        NetError::Dns(DnsError::Nsec { proof, .. }) => Some(match proof {
            Proof::Secure => ("secure", "localValidationSecure"),
            Proof::Insecure => ("insecure", "localValidationInsecure"),
            Proof::Bogus => ("bogus", "localValidationBogus"),
            Proof::Indeterminate => ("unknown", "localValidationIndeterminate"),
        }),
        NetError::Dns(DnsError::NoRecordsFound(no_records)) => Some(classify_proofs(
            no_records
                .authorities
                .as_deref()
                .unwrap_or_default()
                .iter()
                .map(|record| record.proof),
        )),
        NetError::Dns(DnsError::ResponseCode(ResponseCode::ServFail)) => {
            Some(("unknown", "resolverServfail"))
        }
        NetError::Dns(_) => Some(("unknown", "resolverFailure")),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{io::AsyncReadExt, net::TcpListener};

    #[test]
    fn servfail_is_unknown_instead_of_dnssec_bogus() {
        let error = NetError::Dns(DnsError::ResponseCode(ResponseCode::ServFail));
        assert_eq!(
            classify_dns_error(&error),
            Some(("unknown", "resolverServfail"))
        );
    }

    #[test]
    fn only_hickorys_explicit_bogus_proof_is_classified_as_bogus() {
        let error = NetError::Dns(DnsError::DnssecBogus);
        assert_eq!(
            classify_dns_error(&error),
            Some(("bogus", "localValidationBogus"))
        );
        assert_eq!(
            classify_proofs([Proof::Bogus].into_iter()),
            ("bogus", "localValidationBogus")
        );
    }

    #[test]
    fn missing_dnssec_proof_is_not_reported_as_secure() {
        assert_eq!(classify_proofs(std::iter::empty()), ("unknown", "noAnswer"));
        assert_eq!(
            classify_proofs([Proof::Indeterminate].into_iter()),
            ("unknown", "localValidationIndeterminate")
        );
    }

    #[test]
    fn insecure_cname_target_downgrades_the_entire_answer() {
        assert_eq!(
            classify_proofs([Proof::Secure, Proof::Insecure].into_iter()),
            ("insecure", "localValidationInsecure")
        );
    }

    #[tokio::test]
    async fn plain_tcp_listener_is_not_accepted_as_dot_success() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind plain TCP listener");
        let address = listener.local_addr().expect("read listener address");
        let server = tokio::spawn(async move {
            if let Ok((mut stream, _)) = listener.accept().await {
                let mut client_hello = [0_u8; 1024];
                let _ = stream.read(&mut client_hello).await;
                // A plain TCP endpoint closes after seeing a TLS ClientHello.
            }
        });

        let (_, _, dot_ok, _, dot_detail) =
            probe_dot_dnssec("cloudflare.com", address, DOT_SERVER_NAME).await;
        server.await.expect("join plain TCP fixture");

        assert!(!dot_ok);
        assert_ne!(dot_detail, "tlsVerifiedQuerySucceeded");
    }
}
