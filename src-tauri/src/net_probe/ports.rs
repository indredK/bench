//! Port scan — nmap when detected, with a built-in TCP connect fallback.

use super::types::{PortSampleEvent, PortScanResult, ScanSessionEvent};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::ffi::OsStr;
use std::net::IpAddr;
use std::process::{Output, Stdio};
use std::str::FromStr;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::net::TcpStream;
use tokio::process::Command;
use tokio::sync::watch;
use tokio::task::JoinSet;
use tokio::time::timeout;

pub const PORT_SAMPLE_EVENT: &str = "network-probe:port-sample";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

const MAX_PORTS: usize = 256;
const DEFAULT_TIMEOUT_MS: u64 = 800;
const CONCURRENCY: usize = 32;

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

    let session = super::session::new_cancellable_session();
    let session_id = session.id.clone();
    let mut cancellation = session.cancellation.clone();
    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "ports".into(),
            },
        );
    }

    let tcp_command_hint = format!(
        "scanPorts(local, '{target}', {} ports) // degraded: tcp connect",
        ports.len()
    );

    // S-SEC-03: prefer the mature nmap implementation when it is available.
    // Run it as a cancellable child process; cancellation must not fall through
    // into a second, uncancelled TCP scan.
    if let Some(nmap_result) =
        try_nmap_syn(app, &target, &ports, &session_id, &mut cancellation).await
    {
        return Ok(nmap_result);
    }

    if *cancellation.borrow() || super::session::is_cancelled(&session_id) {
        return Ok(cancelled_scan_result(target, session_id, tcp_command_hint));
    }

    let mut samples = Vec::new();
    let mut open_ports = Vec::new();
    let mut cancelled = false;

    for chunk in ports.chunks(CONCURRENCY) {
        if *cancellation.borrow() || super::session::is_cancelled(&session_id) {
            cancelled = true;
            break;
        }
        let mut tasks = JoinSet::new();
        for &port in chunk {
            let host = target.clone();
            tasks.spawn(async move { probe_one(host, port, DEFAULT_TIMEOUT_MS).await });
        }
        while !tasks.is_empty() {
            tokio::select! {
                biased;
                _ = wait_for_cancellation(&mut cancellation) => {
                    cancelled = true;
                    tasks.abort_all();
                    break;
                }
                joined = tasks.join_next() => {
                    match joined {
                        Some(Ok(sample)) => {
                            if sample.state == "open" {
                                open_ports.push(sample.port);
                            }
                            if let Some(app) = app {
                                let _ = app.emit(PORT_SAMPLE_EVENT, &sample);
                            }
                            samples.push(sample);
                        }
                        Some(Err(_)) => {
                            samples.push(PortSampleEvent {
                                port: 0,
                                state: "error".into(),
                                service_hint: None,
                                rtt_ms: None,
                            });
                        }
                        None => break,
                    }
                }
            }
        }
        while tasks.join_next().await.is_some() {}
        if cancelled {
            break;
        }
    }

    cancelled = cancelled || *cancellation.borrow() || super::session::is_cancelled(&session_id);
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
            Some("Degraded mode: TCP connect only. nmap was not detected.".into())
        },
        command_hint: tcp_command_hint,
    })
}

fn cancelled_scan_result(
    target: String,
    session_id: String,
    command_hint: String,
) -> PortScanResult {
    PortScanResult {
        target,
        mode: "cancelled".into(),
        open_ports: Vec::new(),
        samples: Vec::new(),
        cancelled: true,
        session_id,
        message: None,
        command_hint,
    }
}

async fn wait_for_cancellation(cancellation: &mut watch::Receiver<bool>) {
    if *cancellation.borrow() {
        return;
    }
    let _ = cancellation.changed().await;
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

/// Prefer nmap SYN when permitted, then its unprivileged connect mode.
/// Returns `None` only when nmap cannot provide a useful result and TCP fallback is safe.
async fn try_nmap_syn<R: Runtime>(
    app: Option<&AppHandle<R>>,
    target: &str,
    ports: &[u16],
    session_id: &str,
    cancellation: &mut watch::Receiver<bool>,
) -> Option<PortScanResult> {
    let port_arg = ports
        .iter()
        .map(|p| p.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let args = |scan: &str| {
        [
            "-Pn".to_string(),
            scan.to_string(),
            "--max-retries".to_string(),
            "1".to_string(),
            "--host-timeout".to_string(),
            "30s".to_string(),
            "-p".to_string(),
            port_arg.clone(),
            target.to_string(),
        ]
    };

    // Prefer -sS; if it is not permitted, retry with nmap's unprivileged -sT.
    let syn_output =
        match run_program_cancellable(OsStr::new("nmap"), &args("-sS"), cancellation).await {
            CancellableOutput::Cancelled => {
                return Some(cancelled_scan_result(
                    target.to_string(),
                    session_id.to_string(),
                    format!(
                        "scanPorts(local, '{target}', {} ports) // cancelled nmap scan",
                        ports.len()
                    ),
                ));
            }
            CancellableOutput::Unavailable => return None,
            CancellableOutput::Completed(output) => output,
        };

    let syn_stderr = String::from_utf8_lossy(&syn_output.stderr).to_ascii_lowercase();
    let syn_stdout = String::from_utf8_lossy(&syn_output.stdout).to_ascii_lowercase();
    let requires_connect_scan = syn_stdout.is_empty()
        || syn_stderr.contains("requires root")
        || syn_stderr.contains("not permitted")
        || syn_stdout.contains("requires root")
        || syn_stdout.contains("not permitted");
    let out = if requires_connect_scan {
        match run_program_cancellable(OsStr::new("nmap"), &args("-sT"), cancellation).await {
            CancellableOutput::Cancelled => {
                return Some(cancelled_scan_result(
                    target.to_string(),
                    session_id.to_string(),
                    format!(
                        "scanPorts(local, '{target}', {} ports) // cancelled nmap scan",
                        ports.len()
                    ),
                ));
            }
            CancellableOutput::Unavailable => return None,
            CancellableOutput::Completed(output) => output,
        }
    } else {
        syn_output
    };

    if *cancellation.borrow() || super::session::is_cancelled(session_id) {
        return Some(cancelled_scan_result(
            target.to_string(),
            session_id.to_string(),
            format!(
                "scanPorts(local, '{target}', {} ports) // cancelled nmap scan",
                ports.len()
            ),
        ));
    }

    let text = String::from_utf8_lossy(&out.stdout);
    let lower_text = text.to_ascii_lowercase();
    if lower_text.contains("requires root")
        || lower_text.contains("not permitted")
        || text.trim().is_empty()
    {
        return None;
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
        return None;
    }
    open_ports.sort_unstable();
    Some(PortScanResult {
        target: target.into(),
        mode: "nmap-syn-or-connect".into(),
        open_ports,
        samples,
        cancelled: false,
        session_id: session_id.to_string(),
        message: Some(
            "nmap present: used -sS when permitted, otherwise -sT. No exploit scripts (-sC/-sV off)."
                .into(),
        ),
        command_hint: format!(
            "scanPorts(local, '{target}', {} ports) // nmap SYN/connect fallback",
            ports.len()
        ),
    })
}

enum CancellableOutput {
    Completed(Output),
    Cancelled,
    Unavailable,
}

async fn run_program_cancellable(
    program: &OsStr,
    args: &[String],
    cancellation: &mut watch::Receiver<bool>,
) -> CancellableOutput {
    if *cancellation.borrow() {
        return CancellableOutput::Cancelled;
    }

    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    tokio::select! {
        biased;
        _ = wait_for_cancellation(cancellation) => CancellableOutput::Cancelled,
        output = command.output() => match output {
            Ok(output) => CancellableOutput::Completed(output),
            Err(_) => CancellableOutput::Unavailable,
        },
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::process::Command as StdCommand;
    use std::time::Instant;
    use tokio::time::sleep;

    fn process_exists(pid: &str) -> bool {
        StdCommand::new("kill")
            .args(["-0", pid])
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[tokio::test]
    async fn cancelling_external_scan_kills_the_child_without_waiting_for_its_timeout() {
        let directory =
            std::env::temp_dir().join(format!("bench-port-cancel-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).expect("create test directory");
        let pid_file = directory.join("pid");
        let mock_program = directory.join("mock-nmap");
        fs::write(
            &mock_program,
            format!(
                "#!/bin/sh\nprintf '%s' \"$$\" > '{}'\nexec /bin/sleep 15\n",
                pid_file.display()
            ),
        )
        .expect("write mock program");
        let mut permissions = fs::metadata(&mock_program)
            .expect("read mock permissions")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&mock_program, permissions).expect("make mock executable");

        let session = super::super::session::new_cancellable_session();
        let mut cancellation = session.cancellation.clone();
        let program = mock_program.clone();
        let scan = tokio::spawn(async move {
            run_program_cancellable(program.as_os_str(), &[], &mut cancellation).await
        });

        let pid = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if let Ok(pid) = fs::read_to_string(&pid_file) {
                    break pid;
                }
                sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("mock scan should start");

        let started = Instant::now();
        super::super::session::cancel_scan(session.id.clone());
        let output = tokio::time::timeout(Duration::from_secs(2), scan)
            .await
            .expect("cancellation should not wait for the child timeout")
            .expect("scan task should finish");
        assert!(matches!(output, CancellableOutput::Cancelled));
        assert!(started.elapsed() < Duration::from_secs(2));

        let child_exited = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if !process_exists(pid.trim()) {
                    break true;
                }
                sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap_or(false);
        if !child_exited {
            let _ = StdCommand::new("kill")
                .args(["-KILL", pid.trim()])
                .stderr(Stdio::null())
                .status();
        }
        let _ = fs::remove_dir_all(&directory);
        assert!(child_exited, "cancelled external scan child must be reaped");
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
