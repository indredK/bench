use super::types::{PingProbeResult, PingSample};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::net::IpAddr;
use std::time::Duration;
use surge_ping::{Client, Config, PingIdentifier, PingSequence, ICMP};
use tokio::time::sleep;

const MAX_COUNT: u32 = 20;
const DEFAULT_COUNT: u32 = 4;
const MAX_INTERVAL_MS: u64 = 5_000;
const DEFAULT_INTERVAL_MS: u64 = 1_000;
const PING_TIMEOUT: Duration = Duration::from_secs(2);

pub async fn ping_host(
    target: String,
    count: Option<u32>,
    interval_ms: Option<u64>,
) -> AppResult<PingProbeResult> {
    validate_host(&target)?;
    let count = count.unwrap_or(DEFAULT_COUNT).clamp(1, MAX_COUNT);
    let interval_ms = interval_ms
        .unwrap_or(DEFAULT_INTERVAL_MS)
        .clamp(100, MAX_INTERVAL_MS);
    let command_hint =
        format!("pingHost(local, '{target}', {{count:{count},intervalMs:{interval_ms}}})");

    let ip = resolve_target_ip(&target).await?;
    let config = match ip {
        IpAddr::V4(_) => Config::default(),
        IpAddr::V6(_) => Config::builder().kind(ICMP::V6).build(),
    };
    let client = Client::new(&config).map_err(|e| {
        AppError::new(
            "ICMP_UNAVAILABLE",
            format!("Failed to open ICMP socket (check Local Network permission): {e}"),
        )
    })?;

    let mut pinger = client
        .pinger(ip, PingIdentifier(rand::random::<u16>()))
        .await;
    pinger.timeout(PING_TIMEOUT);

    let payload = [0u8; 56];
    let mut samples = Vec::with_capacity(count as usize);
    let mut rtts = Vec::new();

    for seq in 0..count {
        if seq > 0 {
            sleep(Duration::from_millis(interval_ms)).await;
        }
        match pinger.ping(PingSequence(seq as u16), &payload).await {
            Ok((_packet, duration)) => {
                let rtt_ms = duration.as_secs_f64() * 1000.0;
                rtts.push(rtt_ms);
                samples.push(PingSample {
                    seq,
                    ok: true,
                    rtt_ms: Some(rtt_ms),
                    error: None,
                });
            }
            Err(e) => {
                samples.push(PingSample {
                    seq,
                    ok: false,
                    rtt_ms: None,
                    error: Some(e.to_string()),
                });
            }
        }
    }

    let packets_received = rtts.len() as u32;
    let (min_rtt, avg_rtt, max_rtt, stddev_rtt) = if rtts.is_empty() {
        (None, None, None, None)
    } else {
        let min = rtts.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = rtts.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let avg = rtts.iter().sum::<f64>() / rtts.len() as f64;
        let var = rtts.iter().map(|v| (v - avg).powi(2)).sum::<f64>() / rtts.len() as f64;
        (Some(min), Some(avg), Some(max), Some(var.sqrt()))
    };

    let loss_percent = if count > 0 {
        100.0 * (1.0 - packets_received as f64 / count as f64)
    } else {
        0.0
    };

    Ok(PingProbeResult {
        target,
        resolved_ip: ip.to_string(),
        packets_sent: count,
        packets_received,
        loss_percent,
        min_rtt_ms: min_rtt,
        avg_rtt_ms: avg_rtt,
        max_rtt_ms: max_rtt,
        stddev_rtt_ms: stddev_rtt,
        samples,
        command_hint,
    })
}

pub(crate) async fn resolve_target_ip(target: &str) -> AppResult<IpAddr> {
    if let Ok(ip) = target.parse::<IpAddr>() {
        return Ok(ip);
    }
    let target = target.to_string();
    let addrs = tokio::task::spawn_blocking(move || {
        use std::net::ToSocketAddrs;
        format!("{target}:0")
            .to_socket_addrs()
            .map(|iter| iter.map(|a| a.ip()).collect::<Vec<_>>())
    })
    .await
    .map_err(|e| AppError::task_failed(format!("resolve: {e}")))?
    .map_err(|e| AppError::invalid_input(format!("DNS resolve failed: {e}")))?;

    addrs
        .into_iter()
        .next()
        .ok_or_else(|| AppError::invalid_input("No addresses resolved for target"))
}
