use super::types::{PingProbeResult, PingSample, PingSampleEvent, ScanSessionEvent};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::net::IpAddr;
use std::time::Duration;
use surge_ping::{Client, Config, PingIdentifier, PingSequence, ICMP};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::time::sleep;

pub const PING_SAMPLE_EVENT: &str = "network-probe:ping-sample";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

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
    ping_host_with_sample(target, count, interval_ms, false, |_| {}, |_, _| {}).await
}

pub async fn ping_host_streaming<R: Runtime>(
    app: &AppHandle<R>,
    target: String,
    count: Option<u32>,
    interval_ms: Option<u64>,
) -> AppResult<PingProbeResult> {
    ping_host_with_sample(
        target,
        count,
        interval_ms,
        true,
        |session_id| {
            let _ = app.emit(
                SCAN_SESSION_EVENT,
                &ScanSessionEvent {
                    session_id: session_id.to_owned(),
                    kind: "ping".into(),
                },
            );
        },
        |session_id, sample| {
            let _ = app.emit(
                PING_SAMPLE_EVENT,
                &PingSampleEvent {
                    session_id: session_id.to_owned(),
                    sample: sample.clone(),
                },
            );
        },
    )
    .await
}

async fn ping_host_with_sample(
    target: String,
    count: Option<u32>,
    interval_ms: Option<u64>,
    cancellable: bool,
    mut on_session: impl FnMut(&str),
    mut on_sample: impl FnMut(&str, &PingSample),
) -> AppResult<PingProbeResult> {
    validate_host(&target)?;
    let count = count.unwrap_or(DEFAULT_COUNT).clamp(1, MAX_COUNT);
    let interval_ms = interval_ms
        .unwrap_or(DEFAULT_INTERVAL_MS)
        .clamp(100, MAX_INTERVAL_MS);

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

    // Expose cancellation only after DNS resolution and socket setup have completed.
    // This keeps the stop control honest: every phase after it appears is interruptible.
    let session_id = cancellable.then(super::session::new_session_id);
    let _session_guard = session_id
        .as_ref()
        .map(|session_id| super::session::SessionGuard::new(session_id.clone()));
    if let Some(session_id) = session_id.as_deref() {
        on_session(session_id);
    }

    let command_hint = match session_id.as_deref() {
        Some(session_id) => format!(
            "pingHost(local, '{target}', {{count:{count},intervalMs:{interval_ms}}}) // sessionId={session_id}"
        ),
        None => format!(
            "pingHost(local, '{target}', {{count:{count},intervalMs:{interval_ms}}})"
        ),
    };

    let payload = [0u8; 56];
    let mut samples = Vec::with_capacity(count as usize);
    let mut cancelled = false;

    for seq in 0..count {
        if let Some(session_id) = session_id.as_deref() {
            if super::session::is_cancelled(session_id) {
                cancelled = true;
                break;
            }
        }

        if seq > 0 {
            let interval = Duration::from_millis(interval_ms);
            let wait_finished = if let Some(session_id) = session_id.as_deref() {
                tokio::select! {
                    biased;
                    _ = super::session::wait_for_cancel(session_id) => false,
                    _ = sleep(interval) => true,
                }
            } else {
                sleep(interval).await;
                true
            };
            if !wait_finished {
                cancelled = true;
                break;
            }
        }

        let response = if let Some(session_id) = session_id.as_deref() {
            tokio::select! {
                biased;
                _ = super::session::wait_for_cancel(session_id) => {
                    cancelled = true;
                    None
                }
                response = pinger.ping(PingSequence(seq as u16), &payload) => Some(response),
            }
        } else {
            Some(pinger.ping(PingSequence(seq as u16), &payload).await)
        };
        let Some(response) = response else {
            break;
        };

        let sample = match response {
            Ok((_packet, duration)) => PingSample {
                seq,
                ok: true,
                rtt_ms: Some(duration.as_secs_f64() * 1000.0),
                error: None,
            },
            Err(e) => PingSample {
                seq,
                ok: false,
                rtt_ms: None,
                error: Some(e.to_string()),
            },
        };
        on_sample(session_id.as_deref().unwrap_or_default(), &sample);
        samples.push(sample);
    }

    Ok(build_ping_result(
        target,
        ip,
        samples,
        session_id,
        cancelled,
        command_hint,
    ))
}

fn build_ping_result(
    target: String,
    ip: IpAddr,
    samples: Vec<PingSample>,
    session_id: Option<String>,
    cancelled: bool,
    command_hint: String,
) -> PingProbeResult {
    let rtts = samples
        .iter()
        .filter_map(|sample| sample.rtt_ms)
        .collect::<Vec<_>>();
    let packets_sent = samples.len() as u32;
    let packets_received = rtts.len() as u32;
    let (min_rtt, avg_rtt, max_rtt, stddev_rtt) = if rtts.is_empty() {
        (None, None, None, None)
    } else {
        let min = rtts.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = rtts.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let avg = rtts.iter().sum::<f64>() / rtts.len() as f64;
        let var = rtts.iter().map(|value| (value - avg).powi(2)).sum::<f64>() / rtts.len() as f64;
        (Some(min), Some(avg), Some(max), Some(var.sqrt()))
    };
    // On cancellation, only completed attempts are included. Do not report future,
    // unsent packets as lost; the cancelled flag carries the partial-result state.
    let loss_percent = if packets_sent == 0 {
        0.0
    } else {
        100.0 * (1.0 - packets_received as f64 / packets_sent as f64)
    };

    PingProbeResult {
        target,
        resolved_ip: ip.to_string(),
        packets_sent,
        packets_received,
        loss_percent,
        min_rtt_ms: min_rtt,
        avg_rtt_ms: avg_rtt,
        max_rtt_ms: max_rtt,
        stddev_rtt_ms: stddev_rtt,
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
    use super::*;

    #[test]
    fn cancelled_ping_reports_only_completed_packet_attempts() {
        let result = build_ping_result(
            "example.test".into(),
            "192.0.2.1".parse().unwrap(),
            vec![
                PingSample {
                    seq: 0,
                    ok: true,
                    rtt_ms: Some(12.0),
                    error: None,
                },
                PingSample {
                    seq: 1,
                    ok: false,
                    rtt_ms: None,
                    error: Some("timeout".into()),
                },
            ],
            Some("test-session".into()),
            true,
            "pingHost(...)".into(),
        );

        assert!(result.cancelled);
        assert_eq!(result.session_id.as_deref(), Some("test-session"));
        assert_eq!(result.packets_sent, 2);
        assert_eq!(result.packets_received, 1);
        assert_eq!(result.loss_percent, 50.0);
        assert_eq!(result.samples.len(), 2);
    }

    #[test]
    fn cancelled_ping_with_no_completed_attempts_has_no_phantom_loss() {
        let result = build_ping_result(
            "example.test".into(),
            "192.0.2.1".parse().unwrap(),
            vec![],
            Some("test-session".into()),
            true,
            "pingHost(...)".into(),
        );

        assert!(result.cancelled);
        assert_eq!(result.packets_sent, 0);
        assert_eq!(result.loss_percent, 0.0);
    }
}
