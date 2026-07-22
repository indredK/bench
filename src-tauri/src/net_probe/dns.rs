use super::types::{DnsLookupResult, DnsRecordItem};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use hickory_resolver::config::{NameServerConfig, ResolverConfig};
use hickory_resolver::net::runtime::TokioRuntimeProvider;
use hickory_resolver::proto::rr::RecordType;
use hickory_resolver::Resolver;
use std::net::IpAddr;
use std::str::FromStr;
use std::time::Instant;

pub async fn dns_lookup(
    domain: String,
    rr_type: Option<String>,
    resolver: Option<String>,
) -> AppResult<DnsLookupResult> {
    validate_host(&domain)?;
    let rr = parse_rr_type(rr_type.as_deref().unwrap_or("A"))?;
    let resolver_label = resolver
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("system")
        .to_string();
    let command_hint =
        format!("dnsLookup(local, '{domain}', {{rrType:'{rr:?}',resolver:'{resolver_label}'}})");

    let built = build_resolver(resolver.as_deref())?;
    let started = Instant::now();
    let lookup = built
        .lookup(domain.clone(), rr)
        .await
        .map_err(|e| AppError::new("DNS_LOOKUP_FAILED", e.to_string()))?;
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;

    let mut records = Vec::new();
    for record in lookup.answers() {
        records.push(DnsRecordItem {
            name: record.name.to_string(),
            rr_type: format!("{:?}", record.data.record_type()),
            ttl: record.ttl,
            data: record.data.to_string(),
        });
    }

    Ok(DnsLookupResult {
        domain,
        rr_type: format!("{rr:?}"),
        resolver: resolver_label,
        elapsed_ms,
        records,
        command_hint,
    })
}

fn build_resolver(resolver: Option<&str>) -> AppResult<Resolver<TokioRuntimeProvider>> {
    match resolver.map(str::trim).filter(|s| !s.is_empty()) {
        None | Some("system") => Resolver::builder_tokio()
            .map_err(|e| AppError::new("DNS_CONFIG", e.to_string()))?
            .build()
            .map_err(|e| AppError::new("DNS_CONFIG", e.to_string())),
        Some(ip_str) => {
            let ip: IpAddr = ip_str
                .parse()
                .map_err(|_| AppError::invalid_input(format!("Invalid resolver IP: {ip_str}")))?;
            let config =
                ResolverConfig::from_parts(None, vec![], vec![NameServerConfig::udp_and_tcp(ip)]);
            Resolver::builder_with_config(config, TokioRuntimeProvider::default())
                .build()
                .map_err(|e| AppError::new("DNS_CONFIG", e.to_string()))
        }
    }
}

fn parse_rr_type(value: &str) -> AppResult<RecordType> {
    let upper = value.trim().to_ascii_uppercase();
    RecordType::from_str(&upper)
        .map_err(|_| AppError::invalid_input(format!("Unsupported rrType: {value}")))
}
