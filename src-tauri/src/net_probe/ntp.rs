//! NTP offset probe — multi-source median (design-discover §3.4).

use super::types::NtpProbeResult;
use crate::error::{AppError, AppResult};
use std::net::SocketAddr;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::net::UdpSocket;
use tokio::time::timeout;

const NTP_SERVERS: &[&str] = &[
    "time.cloudflare.com:123",
    "time.google.com:123",
    "pool.ntp.org:123",
];
const NTP_EPOCH_DELTA: u64 = 2_208_988_800;

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
            Err(e) => {
                used.push((*server).to_string());
                details.push(format!("{server} fail:{e}"));
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

    offsets.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median = offsets[offsets.len() / 2];
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
        elapsed_ms,
        command_hint,
    })
}

async fn probe_one(server_name: &str) -> AppResult<(f64, f64)> {
    let sock = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| AppError::new("NTP_BIND", e.to_string()))?;
    let server: SocketAddr = tokio::net::lookup_host(server_name)
        .await
        .map_err(|e| AppError::new("NTP_DNS", e.to_string()))?
        .next()
        .ok_or_else(|| AppError::new("NTP_DNS", format!("No address for {server_name}")))?;

    let mut req = [0u8; 48];
    req[0] = 0x1b;
    let t1 = now_unix_secs_f64();
    sock.send_to(&req, server)
        .await
        .map_err(|e| AppError::new("NTP_SEND", e.to_string()))?;

    let mut buf = [0u8; 48];
    let recv = timeout(Duration::from_secs(4), sock.recv_from(&mut buf)).await;
    let t4 = now_unix_secs_f64();
    match recv {
        Ok(Ok((n, _))) if n >= 48 => {
            let t2 = ntp_ts_to_unix(&buf[32..40]);
            let t3 = ntp_ts_to_unix(&buf[40..48]);
            let offset = ((t2 - t1) + (t3 - t4)) / 2.0;
            let rtt = (t4 - t1) - (t3 - t2);
            Ok((offset, rtt))
        }
        Ok(Ok(_)) => Err(AppError::new("NTP_SHORT", "response too short")),
        Ok(Err(e)) => Err(AppError::new("NTP_RECV", e.to_string())),
        Err(_) => Err(AppError::new("NTP_TIMEOUT", "timed out")),
    }
}

fn now_unix_secs_f64() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

fn ntp_ts_to_unix(bytes: &[u8]) -> f64 {
    if bytes.len() < 8 {
        return 0.0;
    }
    let secs = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as u64;
    let frac = u32::from_be_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as f64
        / (u32::MAX as f64 + 1.0);
    (secs.saturating_sub(NTP_EPOCH_DELTA) as f64) + frac
}
