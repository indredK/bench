//! NTP offset probe — multi-source median (design-discover §3.4).

use super::types::{NtpProbeResult, NtpSourceResult};
use crate::error::{AppError, AppResult};
use futures_util::future::{join_all, select_ok};
use sntpc::{NtpContext, StdTimestampGen};
use sntpc_net_tokio::UdpSocketWrapper;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::time::timeout;

const NTP_SERVERS: &[&str] = &[
    "time.cloudflare.com:123",
    "time.google.com:123",
    "pool.ntp.org:123",
];
const NTP_TIMEOUT: Duration = Duration::from_secs(4);

pub async fn probe_ntp() -> AppResult<NtpProbeResult> {
    let command_hint =
        "probeNtp(local) // concurrent SNTP median (cloudflare/google/pool)".to_string();
    let started = Instant::now();

    // Three independent providers are queried concurrently so one slow server does not multiply
    // the full timeout by the number of sources.
    let probes = join_all(
        NTP_SERVERS
            .iter()
            .map(|server| async move { (*server, probe_one(server).await) }),
    )
    .await;

    let mut offsets = Vec::new();
    let mut rtts = Vec::new();
    let mut details = Vec::new();
    let mut sources = Vec::with_capacity(NTP_SERVERS.len());
    let mut used = Vec::new();

    for (server, result) in probes {
        used.push(server.to_string());
        match result {
            Ok((offset, rtt)) => {
                offsets.push(offset);
                rtts.push(rtt);
                details.push(format!("{server} offset={offset:.3}s"));
                sources.push(NtpSourceResult {
                    server: server.to_string(),
                    ok: true,
                    offset_seconds: Some(offset),
                    rtt_seconds: Some(rtt),
                    error_code: None,
                });
            }
            Err(error) => {
                details.push(format!("{server} fail:{error}"));
                sources.push(NtpSourceResult {
                    server: server.to_string(),
                    ok: false,
                    offset_seconds: None,
                    rtt_seconds: None,
                    error_code: Some(error.code),
                });
            }
        }
    }

    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    if offsets.is_empty() {
        return Ok(NtpProbeResult {
            server: used.join(", "),
            ok: false,
            offset_seconds: None,
            rtt_seconds: None,
            severity: "fail".into(),
            detail: Some(format!("All NTP sources failed. {}", details.join("; "))),
            sources,
            elapsed_ms,
            command_hint,
        });
    }

    let median = median(&mut offsets);
    let rtt_avg = rtts.iter().sum::<f64>() / rtts.len() as f64;
    let severity = if median.abs() > 2.0 {
        "warn"
    } else if median.abs() > 0.5 {
        "info"
    } else {
        "ok"
    };

    Ok(NtpProbeResult {
        server: used.join(", "),
        ok: true,
        offset_seconds: Some(median),
        rtt_seconds: Some(rtt_avg),
        severity: severity.into(),
        detail: Some(format!(
            "median_offset={median:.3}s from {} source(s). {}",
            offsets.len(),
            details.join("; ")
        )),
        sources,
        elapsed_ms,
        command_hint,
    })
}

async fn probe_one(server_name: &str) -> AppResult<(f64, f64)> {
    let addresses = timeout(NTP_TIMEOUT, tokio::net::lookup_host(server_name))
        .await
        .map_err(|_| AppError::new("NTP_DNS", "server lookup timed out"))?
        .map_err(|error| AppError::new("NTP_DNS", error.to_string()))?;

    // Try at most one address from each family. A v4-only route must not make a v6-first DNS
    // answer look like a server failure, and an unreachable family must not delay a valid reply.
    let mut ipv4 = None;
    let mut ipv6 = None;
    for address in addresses {
        match address.ip() {
            IpAddr::V4(_) if ipv4.is_none() => ipv4 = Some(address),
            IpAddr::V6(_) if ipv6.is_none() => ipv6 = Some(address),
            _ => {}
        }
    }
    let attempts = [ipv4, ipv6]
        .into_iter()
        .flatten()
        .map(|address| Box::pin(probe_address(address)))
        .collect::<Vec<_>>();
    if attempts.is_empty() {
        return Err(AppError::new(
            "NTP_DNS",
            format!("No address for {server_name}"),
        ));
    }

    match select_ok(attempts).await {
        Ok((result, _)) => Ok(result),
        Err(error) => Err(error),
    }
}

async fn probe_address(server: SocketAddr) -> AppResult<(f64, f64)> {
    let bind_address = match server.ip() {
        IpAddr::V4(_) => SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), 0),
        IpAddr::V6(_) => SocketAddr::new(Ipv6Addr::UNSPECIFIED.into(), 0),
    };
    let socket = UdpSocket::bind(bind_address)
        .await
        .map_err(|error| AppError::new("NTP_BIND", error.to_string()))?;
    let socket = UdpSocketWrapper::from(socket);
    let context = NtpContext::new(StdTimestampGen::default());

    let result = timeout(NTP_TIMEOUT, sntpc::get_time(server, &socket, context))
        .await
        .map_err(|_| AppError::new("NTP_TIMEOUT", "timed out"))?
        .map_err(map_sntpc_error)?;

    Ok((
        result.offset() as f64 / 1_000_000.0,
        result.roundtrip() as f64 / 1_000_000.0,
    ))
}

fn map_sntpc_error(error: sntpc::Error) -> AppError {
    match error {
        sntpc::Error::Network => AppError::new("NTP_NETWORK", "UDP exchange failed"),
        sntpc::Error::AddressResolve => {
            AppError::new("NTP_DNS", "server address resolution failed")
        }
        sntpc::Error::ResponseAddressMismatch => {
            AppError::new("NTP_SOURCE", "response came from an unexpected address")
        }
        sntpc::Error::KissOfDeath(code) => AppError::new(
            "NTP_KISS_OF_DEATH",
            format!("server refused the request ({})", code.as_str()),
        ),
        other => AppError::new("NTP_RESPONSE", format!("invalid SNTP response: {other:?}")),
    }
}

fn median(values: &mut [f64]) -> f64 {
    values.sort_by(f64::total_cmp);
    let middle = values.len() / 2;
    if values.len().is_multiple_of(2) {
        (values[middle - 1] + values[middle]) / 2.0
    } else {
        values[middle]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn median_averages_middle_values_for_even_source_counts() {
        assert_eq!(median(&mut [1.0, 4.0]), 2.5);
        assert_eq!(median(&mut [4.0, 1.0, 3.0, 2.0]), 2.5);
    }

    #[test]
    fn median_selects_middle_value_for_odd_source_counts() {
        assert_eq!(median(&mut [9.0, 1.0, 5.0]), 5.0);
    }

    #[tokio::test]
    async fn accepts_a_valid_response_from_the_resolved_server() {
        let server = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let server_address = server.local_addr().unwrap();
        let server_task = tokio::spawn(async move {
            let mut request = [0; 512];
            let (length, client_address) = server.recv_from(&mut request).await.unwrap();
            let response = response_packet(&request[..length], true);
            server.send_to(&response, client_address).await.unwrap();
        });

        let result = probe_one(&server_address.to_string()).await.unwrap();
        assert!(result.0.abs() < 1.0);
        server_task.await.unwrap();
    }

    #[tokio::test]
    async fn rejects_response_with_unmatched_originate_timestamp() {
        let server = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let server_address = server.local_addr().unwrap();
        let server_task = tokio::spawn(async move {
            let mut request = [0; 512];
            let (length, client_address) = server.recv_from(&mut request).await.unwrap();
            let response = response_packet(&request[..length], false);
            server.send_to(&response, client_address).await.unwrap();
        });

        let error = probe_one(&server_address.to_string()).await.unwrap_err();
        assert_eq!(error.code, "NTP_RESPONSE");
        server_task.await.unwrap();
    }

    #[tokio::test]
    async fn rejects_response_from_an_unexpected_udp_source() {
        let server = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let spoof = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let server_address = server.local_addr().unwrap();
        let server_task = tokio::spawn(async move {
            let mut request = [0; 512];
            let (length, client_address) = server.recv_from(&mut request).await.unwrap();
            let response = response_packet(&request[..length], true);
            spoof.send_to(&response, client_address).await.unwrap();
        });

        let error = probe_one(&server_address.to_string()).await.unwrap_err();
        assert_eq!(error.code, "NTP_SOURCE");
        server_task.await.unwrap();
    }

    fn response_packet(request: &[u8], matching_origin: bool) -> [u8; 48] {
        let mut response = [0; 48];
        response[0] = 0x24; // Leap indicator 0, SNTP version 4, server mode.
        response[1] = 2; // Synchronized stratum 2 server.
        response[3] = (-20_i8) as u8;

        response[24..32].copy_from_slice(&request[40..48]);
        if !matching_origin {
            response[24] ^= 0xff;
        }

        let timestamp = current_ntp_timestamp();
        response[32..40].copy_from_slice(&timestamp);
        response[40..48].copy_from_slice(&timestamp);
        response
    }

    fn current_ntp_timestamp() -> [u8; 8] {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        let seconds = (now.as_secs() + 2_208_988_800) as u32;
        let fraction = ((u64::from(now.subsec_nanos()) << 32) / 1_000_000_000) as u32;
        let mut timestamp = [0; 8];
        timestamp[..4].copy_from_slice(&seconds.to_be_bytes());
        timestamp[4..].copy_from_slice(&fraction.to_be_bytes());
        timestamp
    }
}
