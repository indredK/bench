//! Diagnostic packet stats (S-SEC-04) — short tcpdump sample when available.
//! Full libpcap path remains pack-gated; this is a degraded counter-only mode.

use super::types::{PcapDiagResult, ScanSessionEvent};
use crate::error::{AppError, AppResult};
use std::process::Command;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Runtime};

const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

pub async fn run_pcap_diag<R: Runtime>(
    app: Option<&AppHandle<R>>,
    duration_secs: u32,
) -> AppResult<PcapDiagResult> {
    let duration_secs = duration_secs.clamp(1, 15);
    let session_id = super::session::new_session_id();
    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "pcap".into(),
            },
        );
    }
    let command_hint = format!(
        "startPacketCapture(local, {{secs:{duration_secs}}}) // degraded: tcpdump counters; sessionId={session_id}"
    );
    let started = Instant::now();

    let result = tauri::async_runtime::spawn_blocking(move || run_tcpdump_sample(duration_secs))
        .await
        .map_err(|e| AppError::task_failed(format!("pcap join: {e}")))?;

    let cancelled = super::session::is_cancelled(&session_id);
    super::session::clear_session(&session_id);

    match result {
        Ok(mut stats) => {
            stats.session_id = session_id;
            stats.cancelled = cancelled;
            stats.command_hint = command_hint;
            stats.elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
            if cancelled {
                stats.message = Some("Capture cancelled.".into());
            }
            Ok(stats)
        }
        Err(e) => Ok(PcapDiagResult {
            mode: "unavailable".into(),
            packets: 0,
            tcp_rst: 0,
            retrans_hint: 0,
            out_of_order_hint: 0,
            cancelled,
            session_id,
            message: Some(e.to_string()),
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            command_hint,
        }),
    }
}

fn run_tcpdump_sample(duration_secs: u32) -> AppResult<PcapDiagResult> {
    // tcpdump -c limits packets; -tttt for timestamps. No payload dump to disk by default.
    let count = (duration_secs * 40).clamp(40, 400);
    let output = Command::new("tcpdump")
        .args([
            "-nn",
            "-c",
            &count.to_string(),
            "-tttt",
            "tcp or udp or icmp",
        ])
        .output()
        .map_err(|e| {
            AppError::new(
                "PCAP_NO_TCPDUMP",
                format!("tcpdump unavailable or not permitted: {e}"),
            )
        })?;

    let text = String::from_utf8_lossy(&output.stderr).to_string()
        + &String::from_utf8_lossy(&output.stdout);
    if text.to_ascii_lowercase().contains("permission")
        || text.to_ascii_lowercase().contains("not permitted")
    {
        return Err(AppError::new(
            "PCAP_PRIVILEGE",
            "Packet capture needs privilege / BPF access (or install pcap-diag pack).",
        ));
    }

    let mut packets = 0u32;
    let mut tcp_rst = 0u32;
    let mut retrans_hint = 0u32;
    let mut out_of_order_hint = 0u32;
    for line in text.lines() {
        let lower = line.to_ascii_lowercase();
        if lower.contains("packets captured") || lower.contains("packets received") {
            continue;
        }
        if line.contains(" IP ") || line.contains(" IP6 ") {
            packets += 1;
        }
        if lower.contains(" flags [r") || lower.contains("rst") {
            tcp_rst += 1;
        }
        if lower.contains("retransmission") || lower.contains("retrans") {
            retrans_hint += 1;
        }
        if lower.contains("out-of-order") || lower.contains("out of order") {
            out_of_order_hint += 1;
        }
    }

    Ok(PcapDiagResult {
        mode: "tcpdump-counters".into(),
        packets,
        tcp_rst,
        retrans_hint,
        out_of_order_hint,
        cancelled: false,
        session_id: String::new(),
        message: Some(
            "Counter-only sample via tcpdump; no full pcap written. Payload not retained.".into(),
        ),
        elapsed_ms: 0.0,
        command_hint: String::new(),
    })
}
