//! NTP offset probe — multi-source median (design-discover §3.4).

use super::types::NtpProbeResult;
use crate::error::{AppError, AppResult};
use rsntp::{AsyncSntpClient, Config};
use std::collections::BTreeSet;
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::{Duration, Instant};
use tokio::net::lookup_host;
use tokio::time::timeout;

const NTP_SERVERS: &[&str] = &[
    "time.cloudflare.com:123",
    "time.google.com:123",
    "pool.ntp.org:123",
];
const NTP_SERVER_TIMEOUT: Duration = Duration::from_secs(4);
const NTP_DNS_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_NTP_ADDRESSES_PER_SERVER: usize = 4;

pub async fn probe_ntp() -> AppResult<NtpProbeResult> {
    let command_hint =
        "probeNtp(local) // multi-source median (cloudflare/google/pool)".to_string();
    let started = Instant::now();

    let mut offsets = Vec::new();
    let mut rtts = Vec::new();
    let mut details = Vec::new();
    let mut used = Vec::new();

    for server in NTP_SERVERS {
        match probe_one(server).await {
            Ok((offset, rtt)) => {
                used.push((*server).to_string());
                offsets.push(offset);
                rtts.push(rtt);
                details.push(format!("{server} offset={offset:.3}s"));
            }
            Err(error) => {
                used.push((*server).to_string());
                details.push(format!("{server} fail:{error}"));
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
            elapsed_ms,
            command_hint,
        });
    }

    let median = median(&mut offsets);
    let rtt_avg = rtts.iter().sum::<f64>() / rtts.len() as f64;
    let severity = severity_for_offset(median);

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
        elapsed_ms,
        command_hint,
    })
}

fn severity_for_offset(offset_seconds: f64) -> &'static str {
    if offset_seconds.abs() > 2.0 {
        "warn"
    } else if offset_seconds.abs() > 0.5 {
        "info"
    } else {
        "ok"
    }
}

fn median(values: &mut [f64]) -> f64 {
    values.sort_by(f64::total_cmp);
    let middle = values.len() / 2;
    if values.len().is_multiple_of(2) {
        values[middle - 1] / 2.0 + values[middle] / 2.0
    } else {
        values[middle]
    }
}

async fn probe_one(server_name: &str) -> AppResult<(f64, f64)> {
    let deadline = Instant::now() + NTP_SERVER_TIMEOUT;
    let resolved = timeout(NTP_DNS_TIMEOUT, lookup_host(server_name))
        .await
        .map_err(|_| AppError::new("NTP_DNS_TIMEOUT", "NTP server lookup timed out"))?
        .map_err(|error| AppError::new("NTP_DNS", error.to_string()))?;
    let mut addresses: Vec<_> = resolved.collect();
    prefer_socket_families(&mut addresses);
    probe_addresses(&addresses, deadline).await
}

async fn probe_addresses(addresses: &[SocketAddr], deadline: Instant) -> AppResult<(f64, f64)> {
    if addresses.is_empty() {
        return Err(AppError::new("NTP_DNS", "No NTP server addresses"));
    }

    let mut last_error = None;
    for (index, address) in addresses.iter().copied().enumerate() {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        let attempts_left = (addresses.len() - index) as u32;
        match probe_one_address(address, remaining / attempts_left).await {
            Ok(result) => return Ok(result),
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error.unwrap_or_else(|| AppError::new("NTP_TIMEOUT", "NTP probe timed out")))
}

async fn probe_one_address(
    address: SocketAddr,
    request_timeout: Duration,
) -> AppResult<(f64, f64)> {
    let request_timeout = request_timeout.max(Duration::from_millis(1));
    let config = Config::default()
        .bind_address(ntp_bind_address(address))
        .timeout(request_timeout)
        // Restrict replies to the queried peer. This prevents an unrelated UDP packet from
        // being accepted as the time source's response.
        .connect_ip(true);
    let client = AsyncSntpClient::with_config(config);

    let result = timeout(
        request_timeout + Duration::from_millis(100),
        client.synchronize(address),
    )
    .await
    .map_err(|_| AppError::new("NTP_TIMEOUT", "NTP server timed out"))?
    .map_err(|error| AppError::new("NTP_RESPONSE", error.to_string()))?;

    let offset = result.clock_offset().as_secs_f64();
    let rtt = result.round_trip_delay().as_secs_f64();
    if !offset.is_finite() || !rtt.is_finite() || rtt < 0.0 {
        return Err(AppError::new(
            "NTP_INVALID_RESULT",
            "NTP response produced invalid timing values",
        ));
    }

    Ok((offset, rtt))
}

fn ntp_bind_address(server: SocketAddr) -> SocketAddr {
    if server.is_ipv6() {
        SocketAddr::from((Ipv6Addr::UNSPECIFIED, 0))
    } else {
        SocketAddr::from((Ipv4Addr::UNSPECIFIED, 0))
    }
}

fn prefer_socket_families(addresses: &mut Vec<SocketAddr>) {
    let mut seen = BTreeSet::new();
    addresses.retain(|address| seen.insert(*address));

    let ipv4 = addresses.iter().copied().filter(SocketAddr::is_ipv4);
    let ipv6 = addresses.iter().copied().filter(SocketAddr::is_ipv6);
    let mut ipv4 = ipv4;
    let mut ipv6 = ipv6;
    let mut candidates = Vec::with_capacity(MAX_NTP_ADDRESSES_PER_SERVER);

    while candidates.len() < MAX_NTP_ADDRESSES_PER_SERVER {
        let mut added = false;
        if let Some(address) = ipv4.next() {
            candidates.push(address);
            added = true;
        }
        if candidates.len() == MAX_NTP_ADDRESSES_PER_SERVER {
            break;
        }
        if let Some(address) = ipv6.next() {
            candidates.push(address);
            added = true;
        }
        if !added {
            break;
        }
    }

    *addresses = candidates;
}

#[cfg(test)]
mod tests {
    use super::{
        median, ntp_bind_address, prefer_socket_families, probe_addresses, probe_one_address,
        severity_for_offset, MAX_NTP_ADDRESSES_PER_SERVER,
    };
    use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
    use tokio::net::UdpSocket;

    const NTP_EPOCH_DELTA: u64 = 2_208_988_800;

    #[test]
    fn bind_address_matches_resolved_server_family() {
        assert_eq!(
            ntp_bind_address("192.0.2.1:123".parse().unwrap()),
            SocketAddr::from((Ipv4Addr::UNSPECIFIED, 0))
        );
        assert_eq!(
            ntp_bind_address("[2001:db8::1]:123".parse().unwrap()),
            SocketAddr::from((Ipv6Addr::UNSPECIFIED, 0))
        );
    }

    #[test]
    fn resolves_unique_addresses_in_family_interleaved_order_and_with_a_cap() {
        let mut addresses = vec![
            "192.0.2.1:123".parse().unwrap(),
            "192.0.2.2:123".parse().unwrap(),
            "192.0.2.3:123".parse().unwrap(),
            "[2001:db8::1]:123".parse().unwrap(),
            "[2001:db8::2]:123".parse().unwrap(),
            "192.0.2.1:123".parse().unwrap(),
        ];

        prefer_socket_families(&mut addresses);

        assert_eq!(addresses.len(), MAX_NTP_ADDRESSES_PER_SERVER);
        assert_eq!(addresses[0], "192.0.2.1:123".parse().unwrap());
        assert_eq!(addresses[1], "[2001:db8::1]:123".parse().unwrap());
        assert_eq!(addresses[2], "192.0.2.2:123".parse().unwrap());
        assert_eq!(addresses[3], "[2001:db8::2]:123".parse().unwrap());
    }

    #[test]
    fn classifies_absolute_median_offset_at_documented_thresholds() {
        assert_eq!(severity_for_offset(0.5), "ok");
        assert_eq!(severity_for_offset(-0.75), "info");
        assert_eq!(severity_for_offset(2.0), "info");
        assert_eq!(severity_for_offset(-2.01), "warn");
    }

    #[test]
    fn median_averages_the_middle_pair_for_even_source_counts() {
        let mut offsets = vec![2.0, -4.0];
        assert_eq!(median(&mut offsets), -1.0);
    }

    #[test]
    fn median_uses_the_center_value_for_odd_source_counts() {
        let mut offsets = vec![4.0, -2.0, 1.0];
        assert_eq!(median(&mut offsets), 1.0);
    }

    #[tokio::test]
    async fn accepts_a_valid_loopback_response_and_rejects_an_invalid_originate_timestamp() {
        let server = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let address = server.local_addr().unwrap();
        let responder = tokio::spawn(async move {
            let mut request = [0u8; 512];
            let (length, peer) = server.recv_from(&mut request).await.unwrap();
            let response = mock_response(&request[..length], true);
            server.send_to(&response, peer).await.unwrap();
        });

        let (offset, rtt) = probe_one_address(address, Duration::from_secs(2))
            .await
            .unwrap();
        responder.await.unwrap();
        assert!(offset.abs() < 1.0);
        assert!(rtt >= 0.0);

        let server = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let address = server.local_addr().unwrap();
        let responder = tokio::spawn(async move {
            let mut request = [0u8; 512];
            let (length, peer) = server.recv_from(&mut request).await.unwrap();
            let response = mock_response(&request[..length], false);
            server.send_to(&response, peer).await.unwrap();
        });

        let error = probe_one_address(address, Duration::from_secs(2))
            .await
            .unwrap_err();
        responder.await.unwrap();
        assert_eq!(error.code, "NTP_RESPONSE");
    }

    #[tokio::test]
    async fn ignores_packets_from_a_different_udp_source() {
        let server = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let attacker = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let address = server.local_addr().unwrap();
        let responder = tokio::spawn(async move {
            let mut request = [0u8; 512];
            let (length, peer) = server.recv_from(&mut request).await.unwrap();
            let forged = mock_response(&request[..length], true);
            attacker.send_to(&forged, peer).await.unwrap();
            tokio::task::yield_now().await;
            let valid = mock_response(&request[..length], true);
            server.send_to(&valid, peer).await.unwrap();
        });

        let result = probe_one_address(address, Duration::from_secs(2)).await;
        responder.await.unwrap();
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn tries_another_resolved_address_after_a_timeout() {
        let silent = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let silent_address = silent.local_addr().unwrap();
        let server = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let server_address = server.local_addr().unwrap();
        let responder = tokio::spawn(async move {
            let mut request = [0u8; 512];
            let (length, peer) = server.recv_from(&mut request).await.unwrap();
            let response = mock_response(&request[..length], true);
            server.send_to(&response, peer).await.unwrap();
        });

        let deadline = Instant::now() + Duration::from_secs(2);
        let result = probe_addresses(&[silent_address, server_address], deadline).await;
        responder.await.unwrap();
        assert!(result.is_ok());
    }

    fn mock_response(request: &[u8], valid_originate_timestamp: bool) -> [u8; 48] {
        let mut response = [0u8; 48];
        response[0] = 0x24; // NTPv4 server response, synchronized.
        response[1] = 2;
        response[24..32].copy_from_slice(&request[40..48]);
        if !valid_originate_timestamp {
            response[24] ^= 1;
        }
        let timestamp = ntp_timestamp(SystemTime::now());
        response[32..40].copy_from_slice(&timestamp);
        response[40..48].copy_from_slice(&timestamp);
        response
    }

    fn ntp_timestamp(time: SystemTime) -> [u8; 8] {
        let since_unix = time.duration_since(UNIX_EPOCH).unwrap();
        let seconds = (since_unix.as_secs() + NTP_EPOCH_DELTA) as u32;
        let fraction = ((u128::from(since_unix.subsec_nanos()) << 32) / 1_000_000_000) as u32;
        let mut timestamp = [0u8; 8];
        timestamp[..4].copy_from_slice(&seconds.to_be_bytes());
        timestamp[4..].copy_from_slice(&fraction.to_be_bytes());
        timestamp
    }
}
