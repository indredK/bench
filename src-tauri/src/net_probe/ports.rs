//! Port scan — TCP connect degraded path (design-security §5.1). SYN needs pack.

use super::types::{PortSampleEvent, PortScanResult, ScanSessionEvent};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::net::IpAddr;
use std::str::FromStr;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::net::TcpStream;
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

    // S-SEC-03: prefer nmap SYN when nmap is present; fall back to TCP connect.
    if nmap_available() {
        if let Ok(Some(syn)) = try_nmap_syn(app, &target, &ports).await {
            return Ok(syn);
        }
    }

    let session_id = super::session::new_session_id();
    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "ports".into(),
            },
        );
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
    super::session::clear_session(&session_id);
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

fn nmap_available() -> bool {
    std::process::Command::new("nmap")
        .arg("-V")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Try unprivileged TCP SYN-ish via `nmap -sT` (connect) first; if root-capable `-sS` works use that.
/// Returns Ok(None) to fall back to built-in TCP connect scanner.
async fn try_nmap_syn<R: Runtime>(
    app: Option<&AppHandle<R>>,
    target: &str,
    ports: &[u16],
) -> AppResult<Option<PortScanResult>> {
    let session_id = super::session::new_session_id();
    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "ports".into(),
            },
        );
    }
    let port_arg = ports
        .iter()
        .map(|p| p.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let target_owned = target.to_string();
    let session_for_block = session_id.clone();

    let output = tauri::async_runtime::spawn_blocking(move || {
        // Prefer -sS (SYN); fall back to -sT (connect) without root.
        let run = |scan: &str| {
            std::process::Command::new("nmap")
                .args([
                    "-Pn",
                    scan,
                    "--max-retries",
                    "1",
                    "--host-timeout",
                    "30s",
                    "-p",
                    &port_arg,
                    &target_owned,
                ])
                .output()
        };
        match run("-sS") {
            Ok(out)
                if (out.status.success() || !out.stdout.is_empty())
                    && !String::from_utf8_lossy(&out.stderr)
                        .to_ascii_lowercase()
                        .contains("requires root") =>
            {
                Ok(out)
            }
            _ => run("-sT").map_err(|e| AppError::io(format!("nmap: {e}"))),
        }
    })
    .await
    .map_err(|e| AppError::task_failed(format!("nmap join: {e}")))?;

    let cancelled = super::session::is_cancelled(&session_for_block);
    super::session::clear_session(&session_for_block);

    let out = match output {
        Ok(o) => o,
        Err(_) => return Ok(None),
    };
    let text = String::from_utf8_lossy(&out.stdout);
    if text.to_ascii_lowercase().contains("requires root")
        || text.to_ascii_lowercase().contains("not permitted")
        || text.is_empty()
    {
        return Ok(None);
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
        return Ok(None);
    }
    open_ports.sort_unstable();
    Ok(Some(PortScanResult {
        target: target.into(),
        mode: "nmap-syn-or-connect".into(),
        open_ports,
        samples,
        cancelled,
        session_id,
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
