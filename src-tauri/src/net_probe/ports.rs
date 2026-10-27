//! Port scan — TCP connect degraded path (design-security §5.1). SYN needs pack.

use super::types::{PortSampleEvent, PortScanResult, ScanSessionEvent};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use crate::subprocess::{run_output_with_timeout, run_status_with_timeout, SubprocessErrorKind};
use std::net::IpAddr;
use std::process::{Command, Output};
use std::str::FromStr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::net::TcpStream;
use tokio::time::timeout;

pub const PORT_SAMPLE_EVENT: &str = "network-probe:port-sample";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

const MAX_PORTS: usize = 256;
const MAX_PORT_SPEC_BYTES: usize = 2048;
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

    let (session_id, abort_token) = super::session::new_session_with_abort_token();
    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "ports".into(),
            },
        );
    }

    // S-SEC-03: prefer nmap SYN when nmap is present; fall back to TCP connect.
    if nmap_available().await {
        if super::session::is_cancelled(&session_id) {
            super::session::clear_session(&session_id);
            return Ok(cancelled_port_scan(&target, ports.len(), session_id));
        }
        if let Ok(Some(result)) = try_nmap_syn(
            app,
            &target,
            &ports,
            session_id.clone(),
            abort_token.clone(),
        )
        .await
        {
            if super::session::is_cancelled(&session_id) {
                super::session::clear_session(&session_id);
                return Ok(cancelled_port_scan(&target, ports.len(), session_id));
            }
            super::session::clear_session(&session_id);
            return Ok(result);
        }
    }
    if super::session::is_cancelled(&session_id) {
        super::session::clear_session(&session_id);
        return Ok(cancelled_port_scan(&target, ports.len(), session_id));
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
            Some("TCP connect only; nmap SYN scan unavailable.".into())
        },
        command_hint,
    })
}

async fn probe_one(host: String, port: u16, timeout_ms: u64) -> PortSampleEvent {
    let started = Instant::now();
    match timeout(
        Duration::from_millis(timeout_ms),
        TcpStream::connect((host.as_str(), port)),
    )
    .await
    {
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

async fn nmap_available() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        let mut command = Command::new("nmap");
        command.arg("-V");
        run_status_with_timeout(&mut command, Duration::from_secs(2)).is_ok()
    })
    .await
    .unwrap_or(false)
}

/// Try `nmap -sS` first, then `-sT` if SYN is unavailable.
/// Returns Ok(None) to fall back to the built-in TCP connect scanner.
async fn try_nmap_syn<R: Runtime>(
    app: Option<&AppHandle<R>>,
    target: &str,
    ports: &[u16],
    session_id: String,
    abort_token: Arc<std::sync::atomic::AtomicBool>,
) -> AppResult<Option<PortScanResult>> {
    let port_arg = ports
        .iter()
        .map(|p| p.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let target_owned = target.to_string();
    let abort_for_block = abort_token.clone();

    let output = tauri::async_runtime::spawn_blocking(move || {
        // Prefer -sS (SYN); fall back to -sT (connect) without root.
        let run = |scan: &str| {
            let mut command = Command::new("nmap");
            command.args([
                "-Pn",
                scan,
                "--max-retries",
                "1",
                "--host-timeout",
                "30s",
                "-p",
                &port_arg,
                &target_owned,
            ]);
            run_output_with_timeout(
                &mut command,
                Duration::from_secs(35),
                Some(abort_for_block.clone()),
            )
        };
        match run("-sS") {
            Ok(out) if nmap_output_usable(&out) => Ok(Some(out)),
            Err(error) if error.kind == SubprocessErrorKind::Aborted => Err(error),
            Err(error) if error.kind == SubprocessErrorKind::Timeout => Ok(None),
            _ => match run("-sT") {
                Ok(out) => Ok(Some(out)),
                Err(error) if error.kind == SubprocessErrorKind::Aborted => Err(error),
                Err(_) => Ok(None),
            },
        }
    })
    .await
    .map_err(|e| AppError::task_failed(format!("nmap join: {e}")))?;

    let out = match output {
        Ok(Some(output)) => output,
        Ok(None) | Err(_) => return Ok(None),
    };
    let text = String::from_utf8_lossy(&out.stdout);
    if text.to_ascii_lowercase().contains("requires root")
        || text.to_ascii_lowercase().contains("not permitted")
        || text.is_empty()
    {
        return Ok(None);
    }

    let (samples, open_ports) = parse_nmap_output(&text);
    for sample in &samples {
        if let Some(app) = app {
            let _ = app.emit(PORT_SAMPLE_EVENT, sample);
        }
    }
    if samples.is_empty() {
        return Ok(None);
    }
    Ok(Some(PortScanResult {
        target: target.into(),
        mode: "nmap-syn-or-connect".into(),
        open_ports,
        samples,
        cancelled: false,
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

fn parse_nmap_output(text: &str) -> (Vec<PortSampleEvent>, Vec<u16>) {
    let mut samples = Vec::new();
    let mut open_ports = Vec::new();

    for line in text.lines() {
        let mut fields = line.split_whitespace();
        let Some(port_protocol) = fields.next() else {
            continue;
        };
        let Some((port_text, protocol)) = port_protocol.split_once('/') else {
            continue;
        };
        if protocol != "tcp" {
            continue;
        }
        let Ok(port) = port_text.parse::<u16>() else {
            continue;
        };
        let Some(state) = fields.next() else {
            continue;
        };
        let state = match state {
            "open" => "open",
            "closed" => "closed",
            "filtered" | "open|filtered" => "filtered",
            _ => continue,
        };

        // Without -sV, Nmap's SERVICE column is based on its port table. It is
        // only a candidate name, and a closed/filtered port did not confirm it.
        let service_hint = if state == "open" {
            fields.next().map(str::to_string)
        } else {
            None
        };
        samples.push(PortSampleEvent {
            port,
            state: state.into(),
            service_hint,
            rtt_ms: None,
        });
        if state == "open" {
            open_ports.push(port);
        }
    }

    open_ports.sort_unstable();
    (samples, open_ports)
}

fn cancelled_port_scan(target: &str, port_count: usize, session_id: String) -> PortScanResult {
    PortScanResult {
        target: target.into(),
        mode: "cancelled".into(),
        open_ports: Vec::new(),
        samples: Vec::new(),
        cancelled: true,
        session_id,
        message: Some("Port scan cancelled.".into()),
        command_hint: format!("scanPorts(local, '{target}', {port_count} ports) // scan cancelled"),
    }
}

fn nmap_output_usable(output: &Output) -> bool {
    (output.status.success() || !output.stdout.is_empty())
        && !String::from_utf8_lossy(&output.stderr)
            .to_ascii_lowercase()
            .contains("requires root")
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
    if spec.len() > MAX_PORT_SPEC_BYTES {
        return Err(AppError::invalid_input(format!(
            "Port specification is too long (max {MAX_PORT_SPEC_BYTES} bytes)"
        )));
    }

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
    if out.is_empty() {
        return Err(AppError::invalid_input("Port list is empty"));
    }
    out.sort_unstable();
    out.dedup();
    if out.len() > MAX_PORTS {
        return Err(AppError::invalid_input(format!(
            "Too many ports (max {MAX_PORTS})"
        )));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{parse_nmap_output, parse_port_range, probe_one, MAX_PORTS, MAX_PORT_SPEC_BYTES};

    #[tokio::test]
    async fn probe_one_connects_to_ipv6_loopback() {
        let listener = match tokio::net::TcpListener::bind("[::1]:0").await {
            Ok(listener) => listener,
            Err(_) => return, // IPv6 loopback may be disabled in the test environment.
        };
        let port = listener.local_addr().unwrap().port();

        let sample = probe_one("::1".into(), port, 800).await;

        assert_eq!(sample.state, "open");
    }

    #[test]
    fn parses_ranges_and_returns_unique_sorted_ports() {
        assert_eq!(
            parse_port_range("443,80,8000-8002,80").unwrap(),
            vec![80, 443, 8000, 8001, 8002]
        );
    }

    #[test]
    fn accepts_more_than_the_limit_of_duplicate_entries_after_deduplication() {
        let duplicate_entries = std::iter::repeat_n("80", MAX_PORTS + 1)
            .collect::<Vec<_>>()
            .join(",");

        assert_eq!(parse_port_range(&duplicate_entries).unwrap(), vec![80]);
    }

    #[test]
    fn rejects_invalid_and_oversized_port_specifications() {
        for input in ["", "abc", "80-", "0", "65536", "10-1", "1-257"] {
            assert!(parse_port_range(input).is_err(), "accepted {input:?}");
        }

        assert!(parse_port_range(&"1".repeat(MAX_PORT_SPEC_BYTES + 1)).is_err());
    }

    #[test]
    fn nmap_port_names_are_candidates_only_for_confirmed_open_ports() {
        let (samples, open_ports) = parse_nmap_output(
            "PORT     STATE          SERVICE\n22/tcp   closed         ssh\n80/tcp   open           http\n443/tcp  filtered       https\n8080/tcp open|filtered http-proxy\n",
        );

        assert_eq!(open_ports, vec![80]);
        assert_eq!(samples.len(), 4);
        assert_eq!(samples[0].state, "closed");
        assert_eq!(samples[0].service_hint, None);
        assert_eq!(samples[1].state, "open");
        assert_eq!(samples[1].service_hint.as_deref(), Some("http"));
        assert_eq!(samples[2].state, "filtered");
        assert_eq!(samples[2].service_hint, None);
        assert_eq!(samples[3].state, "filtered");
        assert_eq!(samples[3].service_hint, None);
    }
}
