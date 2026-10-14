use super::types::{PingProbeResult, PingSample, PingSampleEvent, ScanSessionEvent};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::net::IpAddr;
use std::time::Duration;
use surge_ping::{Client, Config, PingIdentifier, PingSequence, ICMP};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::time::sleep;

pub const PING_SAMPLE_EVENT: &str = "network-probe:ping-sample";
const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

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
    ping_host_with_sample(target, count, interval_ms, None, |_| {}).await
}

pub async fn ping_host_streaming<R: Runtime>(
    app: &AppHandle<R>,
    target: String,
    count: Option<u32>,
    interval_ms: Option<u64>,
) -> AppResult<PingProbeResult> {
    validate_host(&target)?;
    let session_id = super::session::new_session_id();
    let _ = app.emit(
        SCAN_SESSION_EVENT,
        &ScanSessionEvent {
            session_id: session_id.clone(),
            kind: "ping".into(),
        },
    );
    let result = ping_host_with_sample(target, count, interval_ms, Some(&session_id), |sample| {
        let _ = app.emit(
            PING_SAMPLE_EVENT,
            PingSampleEvent {
                session_id: session_id.clone(),
                sample: sample.clone(),
            },
        );
    })
    .await;
    super::session::clear_session(&session_id);
    result
}

async fn ping_host_with_sample(
    target: String,
    count: Option<u32>,
    interval_ms: Option<u64>,
    session_id: Option<&str>,
    mut on_sample: impl FnMut(&PingSample),
) -> AppResult<PingProbeResult> {
    validate_host(&target)?;
    let count = count.unwrap_or(DEFAULT_COUNT).clamp(1, MAX_COUNT);
    let interval_ms = interval_ms
        .unwrap_or(DEFAULT_INTERVAL_MS)
        .clamp(100, MAX_INTERVAL_MS);
    let command_hint =
        format!("pingHost(local, '{target}', {{count:{count},intervalMs:{interval_ms}}})");

    let ip = if let Some(session_id) = session_id {
        tokio::select! {
            biased;
            _ = wait_for_cancellation(session_id) => {
                return Ok(summarize_result(
                    target.clone(),
                    String::new(),
                    session_id.to_string(),
                    command_hint.clone(),
                    Vec::new(),
                    true,
                ));
            }
            result = resolve_target_ip(&target) => result?,
        }
    } else {
        resolve_target_ip(&target).await?
    };
    if session_id.is_some_and(super::session::is_cancelled) {
        return Ok(summarize_result(
            target,
            ip.to_string(),
            session_id.unwrap_or_default().to_string(),
            command_hint,
            Vec::new(),
            true,
        ));
    }
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
    let mut cancelled = false;

    for seq in 0..count {
        if session_id.is_some_and(super::session::is_cancelled) {
            cancelled = true;
            break;
        }
        if seq > 0 {
            if let Some(session_id) = session_id {
                tokio::select! {
                    biased;
                    _ = wait_for_cancellation(session_id) => {
                        cancelled = true;
                        break;
                    }
                    _ = sleep(Duration::from_millis(interval_ms)) => {}
                }
            } else {
                sleep(Duration::from_millis(interval_ms)).await;
            }
        }
        let ping_result = if let Some(session_id) = session_id {
            tokio::select! {
                biased;
                _ = wait_for_cancellation(session_id) => {
                    cancelled = true;
                    break;
                }
                result = pinger.ping(PingSequence(seq as u16), &payload) => result,
            }
        } else {
            pinger.ping(PingSequence(seq as u16), &payload).await
        };
        let sample = match ping_result {
            Ok((_packet, duration)) => {
                let rtt_ms = duration.as_secs_f64() * 1000.0;
                PingSample {
                    seq,
                    ok: true,
                    rtt_ms: Some(rtt_ms),
                    error: None,
                }
            }
            Err(e) => PingSample {
                seq,
                ok: false,
                rtt_ms: None,
                error: Some(e.to_string()),
            },
        };
        on_sample(&sample);
        samples.push(sample);
    }

    Ok(summarize_result(
        target,
        ip.to_string(),
        session_id.unwrap_or_default().to_string(),
        command_hint,
        samples,
        cancelled,
    ))
}

async fn wait_for_cancellation(session_id: &str) {
    while !super::session::is_cancelled(session_id) {
        sleep(Duration::from_millis(25)).await;
    }
}

fn summarize_result(
    target: String,
    resolved_ip: String,
    session_id: String,
    command_hint: String,
    samples: Vec<PingSample>,
    cancelled: bool,
) -> PingProbeResult {
    let packets_sent = samples.len() as u32;
    let rtts = samples
        .iter()
        .filter_map(|sample| sample.rtt_ms)
        .collect::<Vec<_>>();
    let packets_received = rtts.len() as u32;
    let (min_rtt_ms, avg_rtt_ms, max_rtt_ms, stddev_rtt_ms) = if rtts.is_empty() {
        (None, None, None, None)
    } else {
        let min = rtts.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = rtts.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let avg = rtts.iter().sum::<f64>() / rtts.len() as f64;
        let variance =
            rtts.iter().map(|value| (value - avg).powi(2)).sum::<f64>() / rtts.len() as f64;
        (Some(min), Some(avg), Some(max), Some(variance.sqrt()))
    };
    let loss_percent = if packets_sent == 0 {
        0.0
    } else {
        100.0 * (1.0 - packets_received as f64 / packets_sent as f64)
    };

    PingProbeResult {
        target,
        resolved_ip,
        packets_sent,
        packets_received,
        loss_percent,
        min_rtt_ms,
        avg_rtt_ms,
        max_rtt_ms,
        stddev_rtt_ms,
        samples,
        session_id,
        cancelled,
        command_hint,
    }
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

#[cfg(test)]
mod tests {
    use super::ping_host_with_sample;
    use crate::net_probe::session::{cancel_scan, clear_session, new_session_id};

    #[tokio::test]
    async fn a_cancelled_session_stops_before_resolving_or_sending_packets() {
        let session_id = new_session_id();
        cancel_scan(session_id.clone());

        let result = ping_host_with_sample(
            "127.0.0.1".into(),
            Some(20),
            Some(1_000),
            Some(&session_id),
            |_| {},
        )
        .await
        .expect("pre-cancelled ping returns a cancelled result");

        clear_session(&session_id);
        assert!(result.cancelled);
        assert_eq!(result.packets_sent, 0);
        assert!(result.samples.is_empty());
        assert!(result.resolved_ip.is_empty());
    }
}
