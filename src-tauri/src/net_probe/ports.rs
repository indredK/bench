//! Port scan — TCP connect degraded path (design-security §5.1). SYN needs pack.

use super::types::{PortSampleEvent, PortScanResult, ScanSessionEvent};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::net::IpAddr;
use std::process::Output;
use std::str::FromStr;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::net::TcpStream;
use tokio::task::JoinSet;
use tokio::time::timeout;

pub const PORT_SAMPLE_EVENT: &str = "network-probe:port-sample";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

const MAX_PORTS: usize = 256;
const DEFAULT_TIMEOUT_MS: u64 = 800;
const CONCURRENCY: usize = 32;
const NMAP_CANCEL_POLL_INTERVAL: Duration = Duration::from_millis(50);

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

    let session_id = super::session::new_session_id();
    let _session_guard = super::session::SessionGuard::new(&session_id);
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
    // Keep one session alive across both implementations so Cancel also applies
    // after an unsuccessful Nmap attempt.
    let nmap_present = run_nmap_command("nmap", &["-V".into()], &session_id)
        .await
        .is_ok_and(|output| output.is_some_and(|version| version.status.success()));
    if nmap_present {
        if let Ok(Some(mut nmap_result)) =
            try_nmap_syn(app, &target, &ports, &session_id, "nmap").await
        {
            if super::session::finish_session(&session_id) {
                discard_partial_result(&mut nmap_result);
            }
            return Ok(nmap_result);
        }
    }

    if super::session::is_cancelled(&session_id) {
        super::session::finish_session(&session_id);
        return Ok(cancelled_port_scan_result(
            &target,
            &ports,
            &session_id,
            "tcp-connect",
        ));
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
        let mut handles = JoinSet::new();
        for &port in chunk {
            let host = target.clone();
            handles.spawn(async move { probe_one(host, port, DEFAULT_TIMEOUT_MS).await });
        }
        while !handles.is_empty() {
            tokio::select! {
                joined = handles.join_next() => {
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
                        Some(Err(e)) => {
                            samples.push(PortSampleEvent {
                                port: 0,
                                state: "error".into(),
                                service_hint: None,
                                rtt_ms: None,
                            });
                            let _ = e;
                        }
                        None => break,
                    }
                }
                _ = tokio::time::sleep(NMAP_CANCEL_POLL_INTERVAL) => {
                    if super::session::is_cancelled(&session_id) {
                        cancelled = true;
                        handles.abort_all();
                        while handles.join_next().await.is_some() {}
                    }
                }
            }
            if cancelled {
                break;
            }
        }
        if cancelled {
            break;
        }
    }

    let cancellation_requested = super::session::finish_session(&session_id);
    cancelled |= cancellation_requested;
    if cancelled {
        samples.clear();
        open_ports.clear();
    }
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

/// Try Nmap SYN when permitted, then fall back to TCP connect without root.
/// Returns Ok(None) to fall back to built-in TCP connect scanner.
async fn try_nmap_syn<R: Runtime>(
    app: Option<&AppHandle<R>>,
    target: &str,
    ports: &[u16],
    session_id: &str,
    nmap_program: &str,
) -> AppResult<Option<PortScanResult>> {
    let port_arg = ports
        .iter()
        .map(|p| p.to_string())
        .collect::<Vec<_>>()
        .join(",");
    // Prefer -sS (SYN); fall back to -sT (connect) without root.
    // Each child is cancellable; checking only after `Command::output()` returned
    // left Nmap running for up to its 30-second host timeout after Cancel.
    let syn_args = nmap_args("-sS", &port_arg, target);
    let syn_output = run_nmap_command(nmap_program, &syn_args, session_id).await;

    let output = match syn_output {
        Ok(Some(out))
            if (out.status.success() || !out.stdout.is_empty())
                && !String::from_utf8_lossy(&out.stderr)
                    .to_ascii_lowercase()
                    .contains("requires root") =>
        {
            Some(out)
        }
        _ => {
            if super::session::is_cancelled(session_id) {
                None
            } else {
                let tcp_args = nmap_args("-sT", &port_arg, target);
                run_nmap_command(nmap_program, &tcp_args, session_id)
                    .await
                    .ok()
                    .flatten()
            }
        }
    };

    let out = match output {
        Some(output) => output,
        None => return Ok(None),
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

fn nmap_args(scan_type: &str, port_arg: &str, target: &str) -> Vec<String> {
    let mut args = Vec::with_capacity(10);
    if matches!(target.parse::<IpAddr>(), Ok(IpAddr::V6(_))) {
        args.push("-6".into());
    }
    args.extend(
        [
            "-Pn",
            scan_type,
            "--max-retries",
            "1",
            "--host-timeout",
            "30s",
            "-p",
            port_arg,
            target,
        ]
        .into_iter()
        .map(str::to_string),
    );
    args
}

fn cancelled_port_scan_result(
    target: &str,
    ports: &[u16],
    session_id: &str,
    mode: &str,
) -> PortScanResult {
    PortScanResult {
        target: target.to_string(),
        mode: mode.into(),
        open_ports: Vec::new(),
        samples: Vec::new(),
        cancelled: true,
        session_id: session_id.to_string(),
        message: Some("Port scan cancelled.".into()),
        command_hint: format!(
            "scanPorts(local, '{target}', {} ports) // nmap scan cancelled",
            ports.len()
        ),
    }
}

fn discard_partial_result(result: &mut PortScanResult) {
    result.open_ports.clear();
    result.samples.clear();
    result.cancelled = true;
    result.message = Some("Port scan cancelled.".into());
}

async fn run_nmap_command(
    program: &str,
    args: &[String],
    session_id: &str,
) -> AppResult<Option<Output>> {
    if super::session::is_cancelled(session_id) {
        return Ok(None);
    }

    let mut command = tokio::process::Command::new(program);
    command.args(args);
    command.kill_on_drop(true);

    let output = command.output();
    tokio::pin!(output);
    loop {
        tokio::select! {
            result = &mut output => {
                return result
                    .map(Some)
                    .map_err(|error| AppError::io(format!("nmap: {error}")));
            }
            _ = tokio::time::sleep(NMAP_CANCEL_POLL_INTERVAL) => {
                if super::session::is_cancelled(session_id) {
                    // Dropping this output future terminates the child because
                    // `kill_on_drop(true)` was set before the command started.
                    return Ok(None);
                }
            }
        }
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

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;
    use std::process::{Command, Stdio};

    struct TestDir(PathBuf);

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[tokio::test]
    async fn cancelling_nmap_terminates_child_without_waiting_for_scan_timeout() {
        let directory =
            std::env::temp_dir().join(format!("bench-nmap-cancel-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).expect("create fixture directory");
        let _cleanup = TestDir(directory.clone());
        let pid_file = directory.join("pid");
        let program = directory.join("nmap-fixture");
        fs::write(
            &program,
            format!(
                "#!/bin/sh\nprintf '%s\\n' \"$$\" > '{}'\nexec /bin/sleep 30\n",
                pid_file.display()
            ),
        )
        .expect("write fixture command");
        let mut permissions = fs::metadata(&program)
            .expect("read fixture command metadata")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&program, permissions).expect("make fixture executable");

        let session_id = super::super::session::new_session_id();
        let task_session_id = session_id.clone();
        let program = program.to_string_lossy().into_owned();
        let scan =
            tokio::spawn(async move { run_nmap_command(&program, &[], &task_session_id).await });

        tokio::time::timeout(Duration::from_secs(2), async {
            while !pid_file.exists() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("fixture child should start");

        let child_pid = fs::read_to_string(&pid_file).expect("read fixture child PID");
        super::super::session::cancel_scan(session_id.clone());
        let output = tokio::time::timeout(Duration::from_secs(2), scan)
            .await
            .expect("cancel should return promptly")
            .expect("scan task should not panic")
            .expect("cancellation is not an I/O error");
        assert!(
            output.is_none(),
            "cancelled process must not return results"
        );

        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let status = Command::new("/bin/kill")
                    .args(["-0", child_pid.trim()])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .expect("check whether the fixture child is still alive");
                if !status.success() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("cancel should terminate the child process");
        super::super::session::clear_session(&session_id);
    }

    #[tokio::test]
    async fn nmap_fallback_keeps_the_same_session_cancellable() {
        let directory =
            std::env::temp_dir().join(format!("bench-nmap-fallback-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).expect("create fixture directory");
        let _cleanup = TestDir(directory.clone());
        let pid_file = directory.join("pid");
        let program = directory.join("nmap-fixture");
        fs::write(
            &program,
            format!(
                r#"#!/bin/sh
if [ "$2" = "-sS" ]; then echo 'requires root' >&2; exit 1; fi
printf '%s\n' "$$" > "{}"
exec /bin/sleep 30
"#,
                pid_file.display()
            ),
        )
        .expect("write fixture command");
        let mut permissions = fs::metadata(&program)
            .expect("read fixture command metadata")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&program, permissions).expect("make fixture executable");

        let session_id = super::super::session::new_session_id();
        let task_session_id = session_id.clone();
        let program = program.to_string_lossy().into_owned();
        let scan = tokio::spawn(async move {
            try_nmap_syn::<tauri::Wry>(None, "127.0.0.1", &[22], &task_session_id, &program).await
        });

        tokio::time::timeout(Duration::from_secs(2), async {
            while !pid_file.exists() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("TCP fallback process should start");

        super::super::session::cancel_scan(session_id.clone());
        let result = tokio::time::timeout(Duration::from_secs(2), scan)
            .await
            .expect("cancel should stop the Nmap fallback promptly")
            .expect("scan task should not panic")
            .expect("cancellation is not an I/O error");

        assert!(
            result.is_none(),
            "cancelled fallback must not return results"
        );
        assert!(super::super::session::finish_session(&session_id));
    }
}

#[cfg(test)]
mod ipv6_tests {
    use super::probe_one;
    use std::time::Duration;
    use tokio::net::TcpListener;
    use tokio::time::timeout;

    #[tokio::test]
    async fn tcp_connect_uses_ipv6_socket_address_for_ipv6_literal() {
        let listener = TcpListener::bind("[::1]:0")
            .await
            .expect("bind an IPv6 loopback listener");
        let port = listener
            .local_addr()
            .expect("read IPv6 loopback listener address")
            .port();
        let accept = tokio::spawn(async move {
            timeout(Duration::from_secs(2), listener.accept())
                .await
                .expect("scanner should connect to the open IPv6 port")
                .expect("accept the scanner connection")
        });

        let sample = probe_one("::1".into(), port, 1_000).await;

        assert_eq!(sample.state, "open");
        let _ = accept.await.expect("listener task should not panic");
    }
}

#[cfg(test)]
mod nmap_args_tests {
    use super::nmap_args;

    #[test]
    fn nmap_scans_ipv6_literals_with_ipv6_enabled() {
        let args = nmap_args("-sS", "443", "::1");

        assert_eq!(args.first().map(String::as_str), Some("-6"));
    }

    #[test]
    fn nmap_keeps_ipv4_and_hostnames_on_the_default_address_family() {
        for target in ["127.0.0.1", "example.com"] {
            let args = nmap_args("-sS", "443", target);

            assert!(!args.iter().any(|arg| arg == "-6"), "{target}");
        }
    }
}
