//! Diagnostic packet stats (S-SEC-04) — short tcpdump sample when available.
//! Full libpcap path is planned; this is a degraded counter-only mode.

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
    let (session_id, abort) = super::session::new_session_with_abort_token();
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
    let result =
        tauri::async_runtime::spawn_blocking(move || run_tcpdump_sample(duration_secs, abort))
            .await;

    let cancelled = super::session::is_cancelled(&session_id);
    super::session::clear_session(&session_id);
    let result = result.map_err(|e| AppError::task_failed(format!("pcap join: {e}")))?;

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
        Err(e) if cancelled || e.code == "PCAP_CANCELLED" => Ok(PcapDiagResult {
            mode: "unavailable".into(),
            packets: 0,
            tcp_rst: 0,
            retrans_hint: 0,
            out_of_order_hint: 0,
            cancelled: true,
            session_id,
            message: Some("Capture cancelled.".into()),
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            command_hint,
        }),
        Err(error) => Err(error),
    }
}

fn run_tcpdump_sample(
    duration_secs: u32,
    abort: std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> AppResult<PcapDiagResult> {
    // Stop when either the packet cap or the requested sampling window is reached.
    // `-l` flushes each packet line so a quiet-window timeout can return partial counters.
    let count = (duration_secs * 40).clamp(40, 400);
    let mut command = Command::new("tcpdump");
    command.args([
        "-nn",
        "-l",
        "-c",
        &count.to_string(),
        "-tttt",
        "tcp or udp or icmp",
    ]);
    let captured = crate::subprocess::run_output_for_window(
        &mut command,
        std::time::Duration::from_secs(u64::from(duration_secs)),
        Some(abort),
    )
    .map_err(|error| match error.kind {
        crate::subprocess::SubprocessErrorKind::Spawn => AppError::new(
            "PCAP_NO_TCPDUMP",
            format!("tcpdump unavailable or not permitted: {error:?}"),
        ),
        crate::subprocess::SubprocessErrorKind::Timeout => {
            AppError::new("PCAP_TIMEOUT", "Packet sampling window expired.")
        }
        crate::subprocess::SubprocessErrorKind::Aborted => {
            AppError::new("PCAP_CANCELLED", "Capture cancelled.")
        }
        other => AppError::new("PCAP_FAILED", format!("tcpdump failed: {other:?}")),
    })?;

    let output = captured.output;
    parse_tcpdump_output(
        output.status.success(),
        captured.reached_time_limit,
        output.status.code(),
        &output.stdout,
        &output.stderr,
    )
}

fn parse_tcpdump_output(
    success: bool,
    capture_window_reached: bool,
    exit_code: Option<i32>,
    stdout: &[u8],
    stderr: &[u8],
) -> AppResult<PcapDiagResult> {
    let text = String::from_utf8_lossy(stderr).to_string() + &String::from_utf8_lossy(stdout);
    if text.to_ascii_lowercase().contains("permission")
        || text.to_ascii_lowercase().contains("not permitted")
    {
        return Err(AppError::new(
            "PCAP_PRIVILEGE",
            "Packet capture needs privilege / BPF access; this build has no installed capture helper.",
        ));
    }
    if !success && !capture_window_reached {
        return Err(AppError::new(
            "PCAP_FAILED",
            format!(
                "tcpdump exited unsuccessfully (status {}).",
                exit_code.map_or_else(
                    || "terminated by signal".to_string(),
                    |code| code.to_string()
                )
            ),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_denial_is_reported_as_a_specific_error() {
        let error = parse_tcpdump_output(false, false, Some(1), b"", b"tcpdump: Permission denied")
            .expect_err("permission denial must not become an empty successful sample");

        assert_eq!(error.code, "PCAP_PRIVILEGE");
    }

    #[test]
    fn unsuccessful_tcpdump_exit_is_not_reported_as_zero_packet_success() {
        let error = parse_tcpdump_output(false, false, Some(2), b"", b"tcpdump: bad filter")
            .expect_err("nonzero exit must not become a successful empty sample");

        assert_eq!(error.code, "PCAP_FAILED");
        assert!(error.message.contains("status 2"));
    }

    #[test]
    fn successful_tcpdump_output_counts_packets_and_rst_flags() {
        let result = parse_tcpdump_output(
            true,
            false,
            Some(0),
            b"12:00:00.000 IP 192.0.2.1.80 > 192.0.2.2.50000: Flags [R.]\n",
            b"1 packet captured\n",
        )
        .expect("a successful sample should be parsed");

        assert_eq!(result.packets, 1);
        assert_eq!(result.tcp_rst, 1);
    }

    #[test]
    fn quiet_sampling_window_can_return_a_valid_empty_result() {
        let result = parse_tcpdump_output(false, true, None, b"", b"")
            .expect("reaching the requested sample window is a valid terminal state");

        assert_eq!(result.mode, "tcpdump-counters");
        assert_eq!(result.packets, 0);
    }
}
