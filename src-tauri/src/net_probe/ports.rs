//! Port scan — TCP connect degraded path (design-security §5.1). SYN needs pack.

use super::types::{PortSampleEvent, PortScanResult, ScanSessionEvent};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::net::IpAddr;
use std::process::{Command, Output};
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::net::TcpStream;
use tokio::time::{interval, timeout, Instant as TokioInstant, MissedTickBehavior};

pub const PORT_SAMPLE_EVENT: &str = "network-probe:port-sample";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

const MAX_PORTS: usize = 256;
const DEFAULT_TIMEOUT_MS: u64 = 800;
const CONCURRENCY: usize = 32;
const NMAP_TIMEOUT: Duration = Duration::from_secs(35);
const NMAP_CANCEL_POLL: Duration = Duration::from_millis(50);

pub async fn scan_ports_tcp<R: Runtime>(
    app: Option<&AppHandle<R>>,
    target: String,
    ports: Vec<u16>,
) -> AppResult<PortScanResult> {
    validate_host(&target)?;
    validate_scan_target(&target)?;

    let mut ports: Vec<u16> = ports.into_iter().filter(|p| *p > 0).collect();
    ports.sort_unstable();
    ports.dedup();
    if ports.is_empty() {
        return Err(AppError::invalid_input("Port list is empty"));
    }
    if ports.len() > MAX_PORTS {
        return Err(AppError::invalid_input(format!(
            "Too many ports (max {MAX_PORTS})"
        )));
    }

    let session = super::session::new_session();
    let session_id = session.id().to_owned();
    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "ports".into(),
            },
        );
    }

    // S-SEC-03: prefer nmap SYN when available; otherwise fall back to TCP connect.
    // Both paths share this session so cancellation can never restart as a new scan.
    if !super::session::is_cancelled(&session_id) {
        match try_nmap_syn(app, &target, &ports, &session_id).await {
            NmapProbeOutcome::Completed(Some(result))
                if !super::session::is_cancelled(&session_id) =>
            {
                return Ok(result);
            }
            NmapProbeOutcome::Cancelled => {
                return Ok(cancelled_port_scan(target, session_id, ports.len()));
            }
            NmapProbeOutcome::Completed(Some(_)) => {
                return Ok(cancelled_port_scan(target, session_id, ports.len()));
            }
            NmapProbeOutcome::Completed(None) | NmapProbeOutcome::Fallback => {}
        }
    }

    let command_hint = format!(
        "scanPorts(local, '{target}', {} ports) // degraded: tcp connect",
        ports.len()
    );

    let mut samples = Vec::new();
    let mut open_ports = Vec::new();
    let mut cancelled = false;

    for chunk in ports.chunks(CONCURRENCY) {
        if super::session::is_cancelled(&session_id) {
            cancelled = true;
            break;
        }
        let mut handles = Vec::new();
        for &port in chunk {
            let host = target.clone();
            handles.push(tokio::spawn(async move {
                probe_one(host, port, DEFAULT_TIMEOUT_MS).await
            }));
        }
        for handle in handles {
            if super::session::is_cancelled(&session_id) {
                cancelled = true;
                break;
            }
            match handle.await {
                Ok(sample) => {
                    if sample.state == "open" {
                        open_ports.push(sample.port);
                    }
                    if let Some(app) = app {
                        let _ = app.emit(PORT_SAMPLE_EVENT, &sample);
                    }
                    samples.push(sample);
                }
                Err(e) => {
                    samples.push(PortSampleEvent {
                        port: 0,
                        state: "error".into(),
                        service_hint: None,
                        rtt_ms: None,
                    });
                    let _ = e;
                }
            }
        }
        if cancelled {
            break;
        }
    }

    cancelled = cancelled || super::session::is_cancelled(&session_id);
    open_ports.sort_unstable();

    Ok(PortScanResult {
        target,
        mode: "tcp-connect".into(),
        open_ports,
        samples,
        cancelled,
        session_id,
        message: if cancelled {
            Some("Port scan cancelled.".into())
        } else {
            Some("Degraded mode: TCP connect only. Install adv-scanner / nmap for SYN.".into())
        },
        command_hint,
    })
}

async fn probe_one(host: String, port: u16, timeout_ms: u64) -> PortSampleEvent {
    let addr = format!("{host}:{port}");
    let started = Instant::now();
    match timeout(Duration::from_millis(timeout_ms), TcpStream::connect(addr)).await {
        Ok(Ok(_stream)) => PortSampleEvent {
            port,
            state: "open".into(),
            service_hint: service_hint(port),
            rtt_ms: Some(started.elapsed().as_secs_f64() * 1000.0),
        },
        Ok(Err(e)) if e.kind() == std::io::ErrorKind::ConnectionRefused => PortSampleEvent {
            port,
            state: "closed".into(),
            service_hint: None,
            rtt_ms: None,
        },
        Ok(Err(_)) => PortSampleEvent {
            port,
            state: "filtered".into(),
            service_hint: None,
            rtt_ms: None,
        },
        Err(_) => PortSampleEvent {
            port,
            state: "filtered".into(),
            service_hint: None,
            rtt_ms: None,
        },
    }
}

fn service_hint(port: u16) -> Option<String> {
    Some(
        match port {
            22 => "ssh",
            80 => "http",
            443 => "https",
            445 => "smb",
            3389 => "rdp",
            5432 => "postgres",
            3306 => "mysql",
            6379 => "redis",
            8080 => "http-alt",
            _ => return None,
        }
        .into(),
    )
}

/// Nmap is optional. A missing executable or failed scan falls back to built-in TCP connect.
/// Cancellation is terminal and must not fall through to another scanner.
enum NmapProbeOutcome {
    Completed(Option<PortScanResult>),
    Cancelled,
    Fallback,
}

async fn try_nmap_syn<R: Runtime>(
    app: Option<&AppHandle<R>>,
    target: &str,
    ports: &[u16],
    session_id: &str,
) -> NmapProbeOutcome {
    let port_arg = ports
        .iter()
        .map(|p| p.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let deadline = TokioInstant::now() + NMAP_TIMEOUT;
    let command = nmap_command("-sS", &port_arg, target);
    let output = match run_cancellable_command(command, session_id, deadline).await {
        NmapCommandOutcome::Completed(out) if nmap_requires_connect_scan(&out) => {
            let connect = nmap_command("-sT", &port_arg, target);
            match run_cancellable_command(connect, session_id, deadline).await {
                NmapCommandOutcome::Completed(out) => out,
                NmapCommandOutcome::Cancelled => return NmapProbeOutcome::Cancelled,
                NmapCommandOutcome::TimedOut | NmapCommandOutcome::Failed => {
                    return NmapProbeOutcome::Fallback;
                }
            }
        }
        NmapCommandOutcome::Completed(out) => out,
        NmapCommandOutcome::Cancelled => return NmapProbeOutcome::Cancelled,
        NmapCommandOutcome::TimedOut | NmapCommandOutcome::Failed => {
            return NmapProbeOutcome::Fallback;
        }
    };

    let text = String::from_utf8_lossy(&output.stdout);
    if text.to_ascii_lowercase().contains("requires root")
        || text.to_ascii_lowercase().contains("not permitted")
        || text.is_empty()
    {
        return NmapProbeOutcome::Fallback;
    }

    let mut samples = Vec::new();
    let mut open_ports = Vec::new();
    for line in text.lines() {
        let lower = line.to_ascii_lowercase();
        // e.g. "80/tcp open  http"
        if let Some((port_proto, rest)) = line.split_once(' ') {
            if let Some(port_str) = port_proto.split('/').next() {
                if let Ok(port) = port_str.parse::<u16>() {
                    let state = if lower.contains(" open") {
                        "open"
                    } else if lower.contains("closed") {
                        "closed"
                    } else if lower.contains("filtered") {
                        "filtered"
                    } else {
                        continue;
                    };
                    let sample = PortSampleEvent {
                        port,
                        state: state.into(),
                        service_hint: rest.split_whitespace().nth(1).map(str::to_string),
                        rtt_ms: None,
                    };
                    if state == "open" {
                        open_ports.push(port);
                    }
                    if let Some(app) = app {
                        let _ = app.emit(PORT_SAMPLE_EVENT, &sample);
                    }
                    samples.push(sample);
                }
            }
        }
    }
    if samples.is_empty() {
        return NmapProbeOutcome::Completed(None);
    }
    open_ports.sort_unstable();
    NmapProbeOutcome::Completed(Some(PortScanResult {
        target: target.into(),
        mode: "nmap-syn-or-connect".into(),
        open_ports,
        samples,
        cancelled: false,
        session_id: session_id.into(),
        message: Some(
            "nmap present: used -sS when permitted, otherwise -sT. No exploit scripts (-sC/-sV off)."
                .into(),
        ),
        command_hint: format!(
            "scanPorts(local, '{target}', {} ports) // nmap SYN/connect fallback",
            ports.len()
        ),
    }))
}

fn nmap_command(scan: &str, port_arg: &str, target: &str) -> Command {
    let mut command = Command::new("nmap");
    command.args([
        "-Pn",
        scan,
        "--max-retries",
        "1",
        "--host-timeout",
        "30s",
        "-p",
        port_arg,
        target,
    ]);
    command
}

fn nmap_requires_connect_scan(output: &Output) -> bool {
    let stdout = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
    let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
    [stdout.as_str(), stderr.as_str()].iter().any(|text| {
        text.contains("requires root")
            || text.contains("not permitted")
            || text.contains("operation not permitted")
    })
}

enum NmapCommandOutcome {
    Completed(Output),
    Cancelled,
    TimedOut,
    Failed,
}

struct CancelOnDrop(Arc<AtomicBool>);

impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

async fn run_cancellable_command(
    mut command: Command,
    session_id: &str,
    deadline: TokioInstant,
) -> NmapCommandOutcome {
    if super::session::is_cancelled(session_id) {
        return NmapCommandOutcome::Cancelled;
    }

    let cancel_flag = Arc::new(AtomicBool::new(false));
    let _cancel_on_drop = CancelOnDrop(cancel_flag.clone());
    let worker_cancel_flag = cancel_flag.clone();
    let remaining = deadline.saturating_duration_since(TokioInstant::now());
    let mut worker = tokio::task::spawn_blocking(move || {
        if worker_cancel_flag.load(Ordering::SeqCst) {
            return Err(crate::subprocess::SubprocessError {
                kind: crate::subprocess::SubprocessErrorKind::Aborted,
                exit_code: None,
            });
        }
        crate::subprocess::run_output_with_timeout(
            &mut command,
            remaining,
            Some(worker_cancel_flag),
        )
    });
    let mut cancel_poll = interval(NMAP_CANCEL_POLL);
    cancel_poll.set_missed_tick_behavior(MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            result = &mut worker => {
                if super::session::is_cancelled(session_id) {
                    return NmapCommandOutcome::Cancelled;
                }
                return match result {
                    Ok(Ok(output)) => NmapCommandOutcome::Completed(output),
                    Ok(Err(error)) if error.kind == crate::subprocess::SubprocessErrorKind::Timeout => {
                        NmapCommandOutcome::TimedOut
                    }
                    Ok(Err(error)) if error.kind == crate::subprocess::SubprocessErrorKind::Aborted => {
                        NmapCommandOutcome::Cancelled
                    }
                    Ok(Err(_)) | Err(_) => NmapCommandOutcome::Failed,
                };
            }
            _ = cancel_poll.tick() => {
                if super::session::is_cancelled(session_id) {
                    cancel_flag.store(true, Ordering::SeqCst);
                    let _ = worker.await;
                    return NmapCommandOutcome::Cancelled;
                }
            }
        }
    }
}

fn cancelled_port_scan(target: String, session_id: String, port_count: usize) -> PortScanResult {
    let command_hint = format!("scanPorts(local, '{target}', {port_count} ports) // cancelled");
    PortScanResult {
        target,
        mode: "cancelled".into(),
        open_ports: Vec::new(),
        samples: Vec::new(),
        cancelled: true,
        session_id,
        message: Some("Port scan cancelled.".into()),
        command_hint,
    }
}

fn validate_scan_target(target: &str) -> AppResult<()> {
    // Prefer RFC1918 / localhost; allow single public host with explicit user intent (FE confirms).
    if let Ok(ip) = IpAddr::from_str(target) {
        match ip {
            IpAddr::V4(v4) => {
                let o = v4.octets();
                let private = o[0] == 10
                    || (o[0] == 172 && (16..=31).contains(&o[1]))
                    || (o[0] == 192 && o[1] == 168)
                    || o[0] == 127
                    || o[0] == 169 && o[1] == 254;
                if !private {
                    // Allowed but marked — FE should have confirmed.
                }
            }
            IpAddr::V6(v6) => {
                if !v6.is_loopback() && !v6.is_unique_local() && !v6.is_unicast_link_local() {
                    // public v6 — allowed with FE confirm
                }
            }
        }
        return Ok(());
    }
    // Hostname: ok if validate_host passed.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn nmap_child_is_killed_when_its_scan_session_is_cancelled() {
        let session = super::super::session::new_session();
        let session_id = session.id().to_owned();
        let executable = std::env::current_exe().expect("test executable is available");
        let mut command = Command::new(executable);
        command
            .args([
                "--exact",
                "net_probe::ports::tests::nmap_child_fixture",
                "--nocapture",
            ])
            .env("BENCH_TEST_NMAP_CHILD_SLEEP", "1");

        let started = Instant::now();
        let cancel_id = session_id.clone();
        let cancel = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(150)).await;
            super::super::session::cancel_scan(&cancel_id);
        });
        let result = timeout(
            Duration::from_secs(3),
            run_cancellable_command(
                command,
                &session_id,
                TokioInstant::now() + Duration::from_secs(10),
            ),
        )
        .await
        .expect("cancelling nmap must not wait for its natural exit");
        cancel.await.expect("cancellation task completes");

        assert!(matches!(result, NmapCommandOutcome::Cancelled));
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn nmap_child_fixture() {
        if std::env::var_os("BENCH_TEST_NMAP_CHILD_SLEEP").is_some() {
            std::thread::sleep(Duration::from_secs(60));
        }
    }
}

/// Parse "80,443,8000-8010" into port list.
pub fn parse_port_range(spec: &str) -> AppResult<Vec<u16>> {
    let mut out = Vec::new();
    for part in spec.split([',', ' ']) {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if let Some((a, b)) = part.split_once('-') {
            let start: u16 = a
                .trim()
                .parse()
                .map_err(|_| AppError::invalid_input(format!("Bad port range: {part}")))?;
            let end: u16 = b
                .trim()
                .parse()
                .map_err(|_| AppError::invalid_input(format!("Bad port range: {part}")))?;
            if start == 0 || end == 0 || start > end {
                return Err(AppError::invalid_input(format!("Bad port range: {part}")));
            }
            if (end as u32) - (start as u32) + 1 > MAX_PORTS as u32 {
                return Err(AppError::invalid_input("Port range too large"));
            }
            for p in start..=end {
                out.push(p);
            }
        } else {
            let p: u16 = part
                .parse()
                .map_err(|_| AppError::invalid_input(format!("Bad port: {part}")))?;
            if p == 0 {
                return Err(AppError::invalid_input("Port must be 1..=65535"));
            }
            out.push(p);
        }
    }
    if out.len() > MAX_PORTS {
        return Err(AppError::invalid_input(format!(
            "Too many ports (max {MAX_PORTS})"
        )));
    }
    Ok(out)
}
