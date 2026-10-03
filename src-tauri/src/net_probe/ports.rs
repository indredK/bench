//! Port scan — optional installed Nmap with bounded TCP connect fallback (design-security §5.1).

use super::nmap_xml::parse_nmap_xml;
use super::types::{PortOsFingerprint, PortSampleEvent, PortScanResult, ScanSessionEvent};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::io::Read;
use std::net::{IpAddr, SocketAddr};
use std::process::{Command, Stdio};
use std::str::FromStr;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::net::TcpStream;
use tokio::time::timeout;

pub const PORT_SAMPLE_EVENT: &str = "network-probe:port-sample";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

const MAX_PORTS: usize = 256;
const MAX_PORT_SPEC_BYTES: usize = 4096;
const DEFAULT_TIMEOUT_MS: u64 = 800;
const CONCURRENCY: usize = 32;
const NMAP_TIMEOUT: Duration = Duration::from_secs(35);
const TARGET_RESOLUTION_TIMEOUT: Duration = Duration::from_secs(3);
const NMAP_STDOUT_LIMIT: usize = 1024 * 1024;
const NMAP_STDERR_LIMIT: usize = 128 * 1024;

pub async fn scan_ports_tcp<R: Runtime>(
    app: Option<&AppHandle<R>>,
    target: String,
    ports: Vec<u16>,
    fingerprint: bool,
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
    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "ports".into(),
            },
        );
    }

    let resolved_target = match resolve_scan_target(&target, &session_id).await {
        Ok(Some(address)) => address,
        Ok(None) => {
            super::session::clear_session(&session_id);
            return Ok(cancelled_port_result(
                target,
                fingerprint,
                session_id,
                "scanPorts // cancelled during target lookup".into(),
            ));
        }
        Err(error) => {
            super::session::clear_session(&session_id);
            return Err(error);
        }
    };
    if super::session::is_cancelled(&session_id) {
        super::session::clear_session(&session_id);
        return Ok(cancelled_port_result(
            target,
            fingerprint,
            session_id,
            "scanPorts // cancelled before scanning".into(),
        ));
    }

    // Prefer the installed Nmap scanner; retain one session ID if it falls back
    // so cancellation remains attached to the scan while the engine changes.
    if let Ok(Some(result)) = try_nmap(
        app,
        &target,
        resolved_target,
        &ports,
        fingerprint,
        &session_id,
    )
    .await
    {
        super::session::clear_session(&session_id);
        return Ok(result);
    }

    let command_hint = format!(
        "scanPorts(local, '{target}', {} ports) // degraded: tcp-connect; resolved {resolved_target}",
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
            let address = resolved_target;
            handles.push((
                port,
                tokio::spawn(async move { probe_one(address, port, DEFAULT_TIMEOUT_MS).await }),
            ));
        }
        for (port, handle) in handles {
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
                    let sample = PortSampleEvent {
                        port,
                        state: "error".into(),
                        service_hint: None,
                        service_method: None,
                        service_product: None,
                        service_version: None,
                        risk_tags: Vec::new(),
                        rtt_ms: None,
                    };
                    if let Some(app) = app {
                        let _ = app.emit(PORT_SAMPLE_EVENT, &sample);
                    }
                    samples.push(sample);
                    let _ = e;
                }
            }
            cancelled = cancelled || super::session::is_cancelled(&session_id);
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
        fingerprint_status: if cancelled && fingerprint {
            "cancelled".into()
        } else if !fingerprint {
            "not-requested".into()
        } else {
            "unavailable".into()
        },
        os_fingerprint: None,
        cancelled,
        session_id,
        message: None,
        command_hint,
    })
}

fn cancelled_port_result(
    target: String,
    fingerprint: bool,
    session_id: String,
    command_hint: String,
) -> PortScanResult {
    PortScanResult {
        target,
        mode: "tcp-connect".into(),
        open_ports: Vec::new(),
        samples: Vec::new(),
        fingerprint_status: if fingerprint {
            "cancelled".into()
        } else {
            "not-requested".into()
        },
        os_fingerprint: None,
        cancelled: true,
        session_id,
        message: None,
        command_hint,
    }
}

async fn resolve_scan_target(target: &str, session_id: &str) -> AppResult<Option<IpAddr>> {
    if super::session::is_cancelled(session_id) {
        return Ok(None);
    }
    if let Ok(address) = IpAddr::from_str(target) {
        return Ok(Some(address));
    }

    let lookup = tokio::net::lookup_host((target, 0));
    tokio::pin!(lookup);
    let deadline = tokio::time::sleep(TARGET_RESOLUTION_TIMEOUT);
    tokio::pin!(deadline);
    let mut cancellation_poll = tokio::time::interval(Duration::from_millis(50));

    loop {
        tokio::select! {
            result = &mut lookup => {
                let mut addresses = result.map_err(|_| {
                    AppError::new("TARGET_RESOLUTION_FAILED", "Could not resolve target hostname")
                })?;
                return addresses
                    .next()
                    .map(|address| Some(address.ip()))
                    .ok_or_else(|| {
                        AppError::new("TARGET_RESOLUTION_FAILED", "Target hostname returned no addresses")
                    });
            }
            _ = &mut deadline => {
                return Err(AppError::new(
                    "TARGET_RESOLUTION_FAILED",
                    "Target hostname resolution timed out",
                ));
            }
            _ = cancellation_poll.tick() => {
                if super::session::is_cancelled(session_id) {
                    return Ok(None);
                }
            }
        }
    }
}

async fn probe_one(address: IpAddr, port: u16, timeout_ms: u64) -> PortSampleEvent {
    let started = Instant::now();
    let service = service_hint(port);
    match timeout(
        Duration::from_millis(timeout_ms),
        TcpStream::connect(SocketAddr::new(address, port)),
    )
    .await
    {
        Ok(Ok(_stream)) => PortSampleEvent {
            port,
            state: "open".into(),
            service_hint: service.clone(),
            service_method: service.as_ref().map(|_| "well-known-port".into()),
            service_product: None,
            service_version: None,
            risk_tags: service_risk_tags(service.as_deref(), false),
            rtt_ms: Some(started.elapsed().as_secs_f64() * 1000.0),
        },
        Ok(Err(e)) if e.kind() == std::io::ErrorKind::ConnectionRefused => PortSampleEvent {
            port,
            state: "closed".into(),
            service_hint: None,
            service_method: None,
            service_product: None,
            service_version: None,
            risk_tags: Vec::new(),
            rtt_ms: None,
        },
        Ok(Err(_)) => PortSampleEvent {
            port,
            state: "filtered".into(),
            service_hint: None,
            service_method: None,
            service_product: None,
            service_version: None,
            risk_tags: Vec::new(),
            rtt_ms: None,
        },
        Err(_) => PortSampleEvent {
            port,
            state: "filtered".into(),
            service_hint: None,
            service_method: None,
            service_product: None,
            service_version: None,
            risk_tags: Vec::new(),
            rtt_ms: None,
        },
    }
}

fn service_hint(port: u16) -> Option<String> {
    Some(
        match port {
            21 => "ftp",
            22 => "ssh",
            23 => "telnet",
            80 => "http",
            443 => "https",
            445 => "smb",
            3389 => "rdp",
            5432 => "postgres",
            3306 => "mysql",
            6379 => "redis",
            8080 => "http-alt",
            5900 => "vnc",
            9200 => "elasticsearch",
            11211 => "memcached",
            27017 => "mongodb",
            _ => return None,
        }
        .into(),
    )
}

fn service_risk_tags(service: Option<&str>, tls_tunnel: bool) -> Vec<String> {
    let service = service.unwrap_or_default().to_ascii_lowercase();
    let mut tags = Vec::new();
    if !tls_tunnel
        && matches!(
            service.as_str(),
            "http" | "http-alt" | "http-proxy" | "telnet" | "ftp"
        )
    {
        tags.push("cleartext-protocol".into());
    }
    if matches!(service.as_str(), "ssh" | "rdp" | "ms-wbt-server" | "vnc") {
        tags.push("remote-admin".into());
    }
    if matches!(
        service.as_str(),
        "redis"
            | "mysql"
            | "postgresql"
            | "postgres"
            | "mongodb"
            | "elasticsearch"
            | "memcached"
            | "ms-sql-s"
            | "oracle-tns"
            | "cassandra"
    ) {
        tags.push("data-service".into());
    }
    if matches!(
        service.as_str(),
        "smb" | "microsoft-ds" | "netbios-ssn" | "cifs"
    ) {
        tags.push("file-sharing".into());
    }
    tags
}

fn nmap_risk_tags(state: &str, service: Option<&str>, tls_tunnel: bool) -> Vec<String> {
    if state == "open" {
        service_risk_tags(service, tls_tunnel)
    } else {
        Vec::new()
    }
}

struct NmapInvocation {
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    exit_success: bool,
    cancelled: bool,
    timed_out: bool,
    output_truncated: bool,
}

fn read_bounded(mut reader: impl Read, limit: usize) -> std::io::Result<(Vec<u8>, bool)> {
    let mut output = Vec::with_capacity(limit.min(16 * 1024));
    let mut chunk = [0_u8; 8192];
    let mut truncated = false;
    loop {
        let read = reader.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        let remaining = limit.saturating_sub(output.len());
        let kept = read.min(remaining);
        output.extend_from_slice(&chunk[..kept]);
        truncated |= kept < read;
    }
    Ok((output, truncated))
}

fn run_nmap_process(mut command: Command, session_id: &str) -> std::io::Result<NmapInvocation> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn()?;
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(std::io::Error::other("Nmap stdout pipe unavailable"));
        }
    };
    let stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(std::io::Error::other("Nmap stderr pipe unavailable"));
        }
    };
    let stdout_reader = std::thread::spawn(move || read_bounded(stdout, NMAP_STDOUT_LIMIT));
    let stderr_reader = std::thread::spawn(move || read_bounded(stderr, NMAP_STDERR_LIMIT));
    let started = Instant::now();
    let mut cancelled = false;
    let mut timed_out = false;
    let mut exit_success = false;

    loop {
        if super::session::is_cancelled(session_id) {
            cancelled = true;
            let _ = child.kill();
            let _ = child.wait();
            break;
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                exit_success = status.success();
                break;
            }
            Ok(None) => {}
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(error);
            }
        }
        if started.elapsed() >= NMAP_TIMEOUT {
            timed_out = true;
            let _ = child.kill();
            let _ = child.wait();
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    let (stdout, stdout_truncated) = stdout_reader
        .join()
        .map_err(|_| std::io::Error::other("Nmap stdout reader failed"))??;
    let (stderr, stderr_truncated) = stderr_reader
        .join()
        .map_err(|_| std::io::Error::other("Nmap stderr reader failed"))??;

    Ok(NmapInvocation {
        stdout,
        stderr,
        exit_success,
        cancelled,
        timed_out,
        output_truncated: stdout_truncated || stderr_truncated,
    })
}

/// Use installed Nmap without shell interpolation. Service probes and OS detection
/// run only when the user explicitly opts in; no NSE scripts are enabled. The child
/// has a hard timeout, bounded output capture, and is killed when cancelled.
/// Returns Ok(None) to fall back to the built-in TCP connect scanner.
async fn try_nmap<R: Runtime>(
    app: Option<&AppHandle<R>>,
    target: &str,
    resolved_target: IpAddr,
    ports: &[u16],
    fingerprint: bool,
    session_id: &str,
) -> AppResult<Option<PortScanResult>> {
    let port_arg = ports
        .iter()
        .map(|p| p.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let resolved_target = resolved_target.to_string();
    let target_owned = resolved_target.clone();
    let session_for_block = session_id.to_string();

    let output = tauri::async_runtime::spawn_blocking(move || {
        let run = |scan: &str, version: bool, os: bool| {
            let mut command = Command::new("nmap");
            if IpAddr::from_str(&target_owned).is_ok_and(|address| address.is_ipv6()) {
                command.arg("-6");
            }
            command.args([
                "-Pn",
                "-n",
                scan,
                "--max-retries",
                "1",
                "--max-parallelism",
                "16",
                "--max-rate",
                "50",
                "--host-timeout",
                "30s",
            ]);
            if version {
                command.args(["-sV", "--version-light"]);
            }
            if os {
                command.args(["-O", "--osscan-limit", "--max-os-tries", "1"]);
            }
            command.args(["-p", &port_arg, &target_owned, "-oX", "-"]);
            run_nmap_process(command, &session_for_block)
        };
        let first = run("-sS", fingerprint, fingerprint);
        match first {
            Ok(invocation) if invocation.cancelled || invocation.timed_out => {
                Ok((invocation, fingerprint, "nmap-syn"))
            }
            Ok(invocation) if !nmap_requires_raw_privileges(&invocation) => {
                Ok((invocation, fingerprint, "nmap-syn"))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Err(AppError::io(format!("nmap unavailable: {error}")))
            }
            Ok(_) | Err(_) => run("-sT", fingerprint, false)
                .map(|invocation| (invocation, false, "nmap-connect"))
                .map_err(|e| AppError::io(format!("nmap: {e}"))),
        }
    })
    .await
    .map_err(|e| AppError::task_failed(format!("nmap join: {e}")))?;

    let cancelled = super::session::is_cancelled(session_id);

    let (invocation, os_detection_attempted, mode) = match output {
        Ok(o) => o,
        Err(_) => return Ok(None),
    };
    if invocation.cancelled || cancelled {
        return Ok(Some(PortScanResult {
            target: target.into(),
            mode: mode.into(),
            open_ports: Vec::new(),
            samples: Vec::new(),
            fingerprint_status: if fingerprint {
                "cancelled".into()
            } else {
                "not-requested".into()
            },
            os_fingerprint: None,
            cancelled: true,
            session_id: session_id.to_string(),
            message: None,
            command_hint: format!(
                "scanPorts(local, '{target}', {} ports) // cancelled; resolved {resolved_target}",
                ports.len(),
            ),
        }));
    }
    if invocation.timed_out || invocation.output_truncated {
        return Ok(None);
    }
    if !invocation.exit_success {
        return Ok(None);
    }
    let text = String::from_utf8_lossy(&invocation.stdout);
    if text.is_empty() || nmap_requires_raw_privileges(&invocation) {
        return Ok(None);
    }

    let parsed = match parse_nmap_xml(&text) {
        Ok(parsed) => parsed,
        Err(_) => return Ok(None),
    };
    let requested_ports: std::collections::HashSet<u16> = ports.iter().copied().collect();
    let mut samples: Vec<PortSampleEvent> = parsed
        .ports
        .into_iter()
        .filter(|port| requested_ports.contains(&port.port))
        .map(|port| {
            let port_guess = service_hint(port.port);
            let nmap_service = port.service_name.filter(|name| !name.is_empty());
            let service = nmap_service.clone().or_else(|| port_guess.clone());
            let service_method = if fingerprint
                && (port.service_method.as_deref() == Some("probed")
                    || port.product.is_some()
                    || port.version.is_some())
            {
                Some("nmap-version".into())
            } else if nmap_service.is_some() {
                Some("nmap-services".into())
            } else if port_guess.is_some() {
                Some("well-known-port".into())
            } else {
                None
            };
            let risk_tags = nmap_risk_tags(
                &port.state,
                service.as_deref(),
                port.tunnel
                    .as_deref()
                    .is_some_and(|tunnel| tunnel.eq_ignore_ascii_case("ssl")),
            );
            PortSampleEvent {
                port: port.port,
                state: port.state,
                service_hint: service,
                service_method,
                service_product: fingerprint.then_some(port.product).flatten(),
                service_version: fingerprint.then_some(port.version).flatten(),
                risk_tags,
                rtt_ms: None,
            }
        })
        .collect();
    if samples.is_empty() && parsed.os_match.is_none() {
        return Ok(None);
    }
    samples.sort_by_key(|sample| sample.port);
    for sample in &samples {
        if let Some(app) = app {
            let _ = app.emit(PORT_SAMPLE_EVENT, sample);
        }
    }
    let mut open_ports: Vec<u16> = samples
        .iter()
        .filter(|sample| sample.state == "open")
        .map(|sample| sample.port)
        .collect();
    let has_service_fingerprint = samples
        .iter()
        .any(|sample| sample.service_method.as_deref() == Some("nmap-version"));
    let os_fingerprint = if os_detection_attempted {
        parsed.os_match.map(|os_match| PortOsFingerprint {
            name: os_match.name,
            accuracy: os_match.accuracy,
        })
    } else {
        None
    };
    let fingerprint_status = if !fingerprint {
        "not-requested"
    } else if os_fingerprint.is_some() && has_service_fingerprint {
        "complete"
    } else if os_fingerprint.is_some() || has_service_fingerprint {
        "partial"
    } else {
        "inconclusive"
    };
    open_ports.sort_unstable();
    Ok(Some(PortScanResult {
        target: target.into(),
        mode: mode.into(),
        open_ports,
        samples,
        fingerprint_status: fingerprint_status.into(),
        os_fingerprint,
        cancelled,
        session_id: session_id.to_string(),
        message: None,
        command_hint: format!(
            "scanPorts(local, '{target}', {} ports) // nmap{}; resolved {resolved_target}",
            ports.len(),
            match mode {
                "nmap-syn" if fingerprint => " -sS/-sV/-O opt-in",
                "nmap-connect" if fingerprint => " -sT/-sV; OS probe unavailable",
                "nmap-syn" => " -sS",
                _ => " -sT fallback",
            },
        ),
    }))
}

fn nmap_requires_raw_privileges(output: &NmapInvocation) -> bool {
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
    .to_ascii_lowercase();
    [
        "requires root",
        "requires root privileges",
        "not permitted",
        "raw socket",
    ]
    .iter()
    .any(|marker| combined.contains(marker))
}

fn validate_scan_target(target: &str) -> AppResult<()> {
    if IpAddr::from_str(target).is_ok() {
        return Ok(());
    }

    // Nmap accepts CIDR ranges, comma-separated targets, and address ranges.
    // This panel promises one host, so accept only a single IP literal or DNS name.
    if looks_like_nmap_ipv4_range(target) {
        return Err(AppError::invalid_input(
            "Target must be one IP address or DNS hostname; ranges and CIDRs are not supported",
        ));
    }

    match url::Host::parse(target) {
        Ok(url::Host::Domain(domain))
            if !domain.is_empty() && domain.len() <= 253 && !domain.contains('/') =>
        {
            Ok(())
        }
        _ => Err(AppError::invalid_input(
            "Target must be one IP address or DNS hostname; ranges and CIDRs are not supported",
        )),
    }
}

fn looks_like_nmap_ipv4_range(target: &str) -> bool {
    let octets: Vec<_> = target.split('.').collect();
    if octets.len() != 4 || !target.contains('-') {
        return false;
    }

    octets.iter().all(|octet| {
        let mut bounds = octet.split('-');
        let first = bounds.next().unwrap_or_default();
        let second = bounds.next();
        let valid_octet = |part: &str| part.parse::<u16>().is_ok_and(|value| value <= 255);

        valid_octet(first) && second.is_none_or(valid_octet) && bounds.next().is_none()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_target_allows_a_single_ip_or_hostname_only() {
        assert!(validate_scan_target("127.0.0.1").is_ok());
        assert!(validate_scan_target("2001:db8::1").is_ok());
        assert!(validate_scan_target("scan.example.com").is_ok());
        assert!(validate_scan_target("192.168.1.0/24").is_err());
        assert!(validate_scan_target("192.168.1.1-254").is_err());
        assert!(validate_scan_target("192.168.1-2.1").is_err());
        assert!(validate_scan_target("127.0.0.1,10.0.0.1").is_err());
        assert!(validate_scan_target("scan.example-domain.com").is_ok());
    }

    #[tokio::test]
    async fn resolves_literal_without_dns_and_stops_when_cancelled() {
        let session_id = super::super::session::new_session_id();
        assert_eq!(
            resolve_scan_target("127.0.0.1", &session_id).await.unwrap(),
            Some(IpAddr::V4(std::net::Ipv4Addr::LOCALHOST))
        );

        super::super::session::cancel_scan(session_id.clone());
        assert!(resolve_scan_target("localhost", &session_id)
            .await
            .unwrap()
            .is_none());
        super::super::session::clear_session(&session_id);
    }

    #[tokio::test]
    async fn resolves_a_hostname_to_one_address_for_the_whole_scan() {
        let session_id = super::super::session::new_session_id();
        let address = resolve_scan_target("localhost", &session_id)
            .await
            .expect("localhost lookup should succeed")
            .expect("one address should be selected");
        assert!(address.is_loopback());
        super::super::session::clear_session(&session_id);
    }

    #[test]
    fn service_risk_labels_are_advisory_and_respect_tls_tunnels() {
        assert_eq!(
            service_risk_tags(Some("HTTP"), false),
            vec!["cleartext-protocol"]
        );
        assert!(service_risk_tags(Some("http"), true).is_empty());
        assert_eq!(
            service_risk_tags(Some("Redis"), false),
            vec!["data-service"]
        );
        assert_eq!(service_risk_tags(Some("smb"), false), vec!["file-sharing"]);
    }

    #[test]
    fn nmap_risk_labels_only_apply_to_open_ports() {
        assert_eq!(
            nmap_risk_tags("open", Some("redis"), false),
            vec!["data-service"]
        );
        assert!(nmap_risk_tags("closed", Some("redis"), false).is_empty());
        assert!(nmap_risk_tags("filtered", Some("http"), false).is_empty());
    }
}

/// Parse "80,443,8000-8010" into a bounded, deduplicated port list.
pub fn parse_port_range(spec: &str) -> AppResult<Vec<u16>> {
    if spec.len() > MAX_PORT_SPEC_BYTES {
        return Err(AppError::invalid_input("Port specification is too long"));
    }

    let mut ports = std::collections::HashSet::new();
    for part in spec.split([',', ' ']) {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if let Some((a, b)) = part.split_once('-') {
            let start = parse_port_number(a.trim())
                .ok_or_else(|| AppError::invalid_input(format!("Bad port range: {part}")))?;
            let end = parse_port_number(b.trim())
                .ok_or_else(|| AppError::invalid_input(format!("Bad port range: {part}")))?;
            if start == 0 || end == 0 || start > end {
                return Err(AppError::invalid_input(format!("Bad port range: {part}")));
            }
            for p in start..=end {
                ports.insert(p);
                if ports.len() > MAX_PORTS {
                    return Err(AppError::invalid_input(format!(
                        "Too many unique ports (max {MAX_PORTS})"
                    )));
                }
            }
        } else {
            let p = parse_port_number(part)
                .ok_or_else(|| AppError::invalid_input(format!("Bad port: {part}")))?;
            if p == 0 {
                return Err(AppError::invalid_input("Port must be 1..=65535"));
            }
            ports.insert(p);
            if ports.len() > MAX_PORTS {
                return Err(AppError::invalid_input(format!(
                    "Too many unique ports (max {MAX_PORTS})"
                )));
            }
        }
    }

    let mut out: Vec<_> = ports.into_iter().collect();
    out.sort_unstable();
    Ok(out)
}

fn parse_port_number(value: &str) -> Option<u16> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    value.parse().ok()
}

#[cfg(test)]
mod port_range_tests {
    use super::*;

    #[test]
    fn port_range_deduplicates_overlapping_items_before_counting() {
        assert_eq!(
            parse_port_range("80,80,81-83,82").unwrap(),
            vec![80, 81, 82, 83]
        );
    }

    #[test]
    fn port_range_rejects_too_many_unique_ports_and_oversized_specs() {
        assert!(parse_port_range("1-257").is_err());
        assert!(parse_port_range("80-bad").is_err());
        assert!(parse_port_range("+80").is_err());
        assert!(parse_port_range("80-+82").is_err());
        assert!(parse_port_range("0").is_err());
        assert!(parse_port_range("82-81").is_err());
        assert!(parse_port_range(&"1".repeat(MAX_PORT_SPEC_BYTES + 1)).is_err());
        assert_eq!(parse_port_range("1-256,1-256").unwrap().len(), MAX_PORTS);
    }
}
