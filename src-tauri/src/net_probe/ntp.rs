//! Multi-source SNTP offset probe (design-discover §3.4).

use super::types::{NtpProbeResult, NtpProbeSourceResult};
use crate::error::AppResult;
use futures_util::future::join_all;
use sntpc::{get_time, NtpContext, StdTimestampGen};
use sntpc_net_tokio::UdpSocketWrapper;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::net::{lookup_host, UdpSocket};
use tokio::time::timeout;

const NTP_SERVERS: &[&str] = &[
    "time.apple.com:123",
    "time.cloudflare.com:123",
    "time.google.com:123",
    "ntp.aliyun.com:123",
];
const NTP_REQUEST_TIMEOUT: Duration = Duration::from_secs(4);
const NTP_ADDRESS_TIMEOUT: Duration = Duration::from_secs(1);
const MICROS_PER_SECOND: f64 = 1_000_000.0;

pub async fn probe_ntp() -> AppResult<NtpProbeResult> {
    let command_hint = "probeNtp(local) // multi-source SNTP offset".to_string();
    let started = Instant::now();

    // The servers are independent. Probe concurrently so one unreachable source cannot
    // multiply the user-visible latency by the number of configured servers.
    let results = join_all(NTP_SERVERS.iter().copied().map(probe_one)).await;
    let sources = results
        .into_iter()
        .zip(NTP_SERVERS.iter().copied())
        .map(|(result, server)| match result {
            Ok(source) => source,
            Err(error) => failed_source(server, error.code, error.detail),
        })
        .collect::<Vec<_>>();

    let offsets = sources
        .iter()
        .filter_map(|source| source.offset_seconds)
        .collect::<Vec<_>>();
    let rtts = sources
        .iter()
        .filter_map(|source| source.rtt_seconds)
        .collect::<Vec<_>>();
    let median_offset = median(&offsets);
    let median_rtt = median(&rtts);
    let successful_servers = sources
        .iter()
        .filter(|source| source.ok)
        .map(|source| source.server.as_str())
        .collect::<Vec<_>>();
    let failed_details = sources
        .iter()
        .filter_map(|source| {
            Some(format!(
                "{} [{}]: {}",
                source.server,
                source.error_code.as_deref()?,
                source.detail.as_deref().unwrap_or("request failed")
            ))
        })
        .collect::<Vec<_>>();
    let detail = if failed_details.is_empty() {
        None
    } else if successful_servers.is_empty() {
        Some(format!(
            "All NTP sources failed. {}",
            failed_details.join("; ")
        ))
    } else {
        Some(format!(
            "Some NTP sources failed. {}",
            failed_details.join("; ")
        ))
    };

    let severity = median_offset.map_or("fail", severity_for_offset);

    Ok(NtpProbeResult {
        server: if successful_servers.is_empty() {
            NTP_SERVERS.join(", ")
        } else {
            successful_servers.join(", ")
        },
        ok: median_offset.is_some(),
        offset_seconds: median_offset,
        rtt_seconds: median_rtt,
        sources,
        severity: severity.into(),
        detail,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

#[derive(Debug)]
struct NtpFailure {
    code: &'static str,
    detail: String,
}

struct NtpMeasurement {
    offset_seconds: f64,
    rtt_seconds: f64,
    stratum: u8,
}

async fn probe_one(server_name: &'static str) -> Result<NtpProbeSourceResult, NtpFailure> {
    match timeout(NTP_REQUEST_TIMEOUT, probe_one_inner(server_name)).await {
        Ok(Ok(measurement)) => Ok(NtpProbeSourceResult {
            server: server_name.to_string(),
            ok: true,
            offset_seconds: Some(measurement.offset_seconds),
            rtt_seconds: Some(measurement.rtt_seconds),
            stratum: Some(measurement.stratum),
            error_code: None,
            detail: None,
        }),
        Ok(Err(error)) => Err(error),
        Err(_) => Err(NtpFailure {
            code: "NTP_TIMEOUT",
            detail: format!("request exceeded {} seconds", NTP_REQUEST_TIMEOUT.as_secs()),
        }),
    }
}

async fn probe_one_inner(server_name: &str) -> Result<NtpMeasurement, NtpFailure> {
    // sntpc's standard timestamp generator assumes the local clock is at or after
    // UNIX_EPOCH. Return a normal diagnostic instead of letting its internal unwrap panic.
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| NtpFailure {
            code: "NTP_CLOCK",
            detail: error.to_string(),
        })?;

    let mut addresses = lookup_host(server_name)
        .await
        .map_err(|error| NtpFailure {
            code: "NTP_DNS",
            detail: error.to_string(),
        })?
        .collect::<Vec<_>>();
    if addresses.is_empty() {
        return Err(NtpFailure {
            code: "NTP_DNS",
            detail: "no address returned".into(),
        });
    }
    // Prefer IPv4 for broad network compatibility while still trying resolved IPv6
    // addresses when IPv4 binding or the server response fails.
    addresses.sort_by_key(|address| !address.is_ipv4());

    let mut last_failure = None;
    for address in addresses {
        let bind_address = match address.ip() {
            IpAddr::V4(_) => SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), 0),
            IpAddr::V6(_) => SocketAddr::new(IpAddr::V6(Ipv6Addr::UNSPECIFIED), 0),
        };
        let socket = match UdpSocket::bind(bind_address).await {
            Ok(socket) => socket,
            Err(error) => {
                last_failure = Some(NtpFailure {
                    code: "NTP_BIND",
                    detail: error.to_string(),
                });
                continue;
            }
        };
        let socket = UdpSocketWrapper::new(socket);
        let context = NtpContext::new(StdTimestampGen::default());

        match timeout(NTP_ADDRESS_TIMEOUT, get_time(address, &socket, context)).await {
            Ok(Ok(result)) => {
                return Ok(NtpMeasurement {
                    offset_seconds: result.offset() as f64 / MICROS_PER_SECOND,
                    rtt_seconds: result.roundtrip() as f64 / MICROS_PER_SECOND,
                    stratum: result.stratum(),
                });
            }
            Ok(Err(error)) => {
                last_failure = Some(NtpFailure {
                    code: "NTP_PROTOCOL",
                    detail: format!("{error:?}"),
                });
            }
            Err(_) => {
                last_failure = Some(NtpFailure {
                    code: "NTP_TIMEOUT",
                    detail: format!("no response from {address} within 1 second"),
                });
            }
        }
    }

    Err(last_failure.unwrap_or_else(|| NtpFailure {
        code: "NTP_UNAVAILABLE",
        detail: "no usable address".into(),
    }))
}

fn failed_source(server: &str, code: &'static str, detail: String) -> NtpProbeSourceResult {
    NtpProbeSourceResult {
        server: server.to_string(),
        ok: false,
        offset_seconds: None,
        rtt_seconds: None,
        stratum: None,
        error_code: Some(code.to_string()),
        detail: Some(detail),
    }
}

fn median(values: &[f64]) -> Option<f64> {
    let mut sorted = values
        .iter()
        .copied()
        .filter(|value| value.is_finite())
        .collect::<Vec<_>>();
    sorted.sort_by(f64::total_cmp);

    match sorted.len() {
        0 => None,
        count if count % 2 == 1 => Some(sorted[count / 2]),
        count => Some((sorted[count / 2 - 1] + sorted[count / 2]) / 2.0),
    }
}

fn severity_for_offset(offset_seconds: f64) -> &'static str {
    let absolute_offset = offset_seconds.abs();
    if absolute_offset > 2.0 {
        "high"
    } else if absolute_offset > 0.5 {
        "warn"
    } else {
        "ok"
    }
}

#[cfg(test)]
mod tests {
    use super::{median, severity_for_offset};

    #[test]
    fn median_averages_the_middle_pair_for_even_sample_counts() {
        assert_eq!(median(&[10.0, 2.0]), Some(6.0));
    }

    #[test]
    fn median_selects_the_middle_value_for_odd_sample_counts() {
        assert_eq!(median(&[9.0, 1.0, 5.0]), Some(5.0));
    }

    #[test]
    fn median_ignores_non_finite_samples() {
        assert_eq!(median(&[f64::NAN, 0.2, f64::INFINITY]), Some(0.2));
        assert_eq!(median(&[f64::NAN]), None);
    }

    #[test]
    fn severity_matches_documented_absolute_thresholds() {
        assert_eq!(severity_for_offset(0.5), "ok");
        assert_eq!(severity_for_offset(-0.5), "ok");
        assert_eq!(severity_for_offset(0.501), "warn");
        assert_eq!(severity_for_offset(-0.501), "warn");
        assert_eq!(severity_for_offset(2.0), "warn");
        assert_eq!(severity_for_offset(-2.0), "warn");
        assert_eq!(severity_for_offset(2.001), "high");
        assert_eq!(severity_for_offset(-2.001), "high");
    }
}
