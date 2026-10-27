//! Port scan — nmap when detected, with a built-in TCP connect fallback.

use super::types::{
    PortFingerprint, PortOsMatch, PortSampleEvent, PortScanResult, PortServiceFingerprint,
    ScanSessionEvent,
};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::ffi::OsStr;
use std::net::IpAddr;
use std::process::{Output, Stdio};
use std::str::FromStr;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::io::{AsyncRead, AsyncReadExt};
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
const PROBE_INTERVAL_MS: u64 = 50;
const MAX_FINGERPRINT_XML_BYTES: usize = 2 * 1024 * 1024;
const MAX_FINGERPRINT_STDERR_BYTES: usize = 64 * 1024;

pub async fn scan_ports_tcp<R: Runtime>(
    app: Option<&AppHandle<R>>,
    target: String,
    ports: Vec<u16>,
    fingerprint: bool,
    high_risk_confirmed: bool,
) -> AppResult<PortScanResult> {
    validate_host(&target)?;
    validate_single_host_target(&target)?;

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
    validate_high_risk_scan_confirmation(&target, ports.len(), high_risk_confirmed)?;

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

    if fingerprint {
        return try_nmap_fingerprint(app, &target, &ports, &session_id, &mut cancellation).await;
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
    let mut last_probe_started = None;

    for chunk in ports.chunks(CONCURRENCY) {
        if *cancellation.borrow() || super::session::is_cancelled(&session_id) {
            cancelled = true;
            break;
        }
        let mut tasks = JoinSet::new();
        let mut cancelled_while_dispatching = false;
        for &port in chunk {
            if !wait_for_probe_slot(&mut last_probe_started, &mut cancellation, &session_id).await {
                cancelled_while_dispatching = true;
                tasks.abort_all();
                break;
            }
            let host = target.clone();
            tasks.spawn(async move { probe_one(host, port, DEFAULT_TIMEOUT_MS).await });
        }
        if cancelled_while_dispatching {
            while tasks.join_next().await.is_some() {}
            cancelled = true;
            break;
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
        fingerprint: None,
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
        fingerprint: None,
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

async fn wait_for_probe_slot(
    last_probe_started: &mut Option<tokio::time::Instant>,
    cancellation: &mut watch::Receiver<bool>,
    session_id: &str,
) -> bool {
    if *cancellation.borrow() || super::session::is_cancelled(session_id) {
        return false;
    }

    if let Some(last_started) = last_probe_started.as_ref() {
        let interval = Duration::from_millis(PROBE_INTERVAL_MS);
        let remaining = interval.saturating_sub(last_started.elapsed());
        if !remaining.is_zero() {
            tokio::select! {
                biased;
                _ = wait_for_cancellation(cancellation) => return false,
                _ = tokio::time::sleep(remaining) => {}
            }
        }
    }

    if *cancellation.borrow() || super::session::is_cancelled(session_id) {
        return false;
    }
    *last_probe_started = Some(tokio::time::Instant::now());
    true
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
        let mut args = vec!["-Pn".to_string(), scan.to_string()];
        append_nmap_scan_limits(&mut args);
        args.extend(["-p".to_string(), port_arg.clone(), target.to_string()]);
        args
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
        fingerprint: None,
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

async fn try_nmap_fingerprint<R: Runtime>(
    app: Option<&AppHandle<R>>,
    target: &str,
    ports: &[u16],
    session_id: &str,
    cancellation: &mut watch::Receiver<bool>,
) -> AppResult<PortScanResult> {
    let port_arg = ports
        .iter()
        .map(u16::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let args =
        |scan: &str, detect_os: bool| fingerprint_nmap_args(scan, &port_arg, target, detect_os);
    let command_hint = format!(
        "scanPorts(local, '{target}', {} ports, fingerprint=true)",
        ports.len()
    );
    let syn_output = match run_program_cancellable_bounded(
        OsStr::new("nmap"),
        &args("-sS", true),
        cancellation,
        MAX_FINGERPRINT_XML_BYTES,
        MAX_FINGERPRINT_STDERR_BYTES,
    )
    .await
    {
        BoundedCancellableOutput::Cancelled => {
            return Ok(cancelled_scan_result(
                target.to_string(),
                session_id.to_string(),
                command_hint,
            ));
        }
        BoundedCancellableOutput::Unavailable => {
            return Err(AppError::unsupported(
                "Service and OS fingerprinting requires an available nmap installation.",
            ));
        }
        BoundedCancellableOutput::Completed(output) => output,
    };

    if syn_output.stdout_exceeded_limit || syn_output.stderr_exceeded_limit {
        return Err(AppError::internal(
            "nmap fingerprint output exceeded the supported size limit.",
        ));
    }

    let requires_connect_scan = requires_unprivileged_connect_fallback(
        syn_output.output.status.success(),
        &syn_output.output.stdout,
        &syn_output.output.stderr,
    );
    let output = if requires_connect_scan {
        match run_program_cancellable_bounded(
            OsStr::new("nmap"),
            // OS detection needs raw-packet privileges. Once SYN mode proves
            // those privileges are unavailable, preserve service results with
            // an unprivileged connect scan instead of retrying `-O` and
            // losing the whole fingerprint result.
            &args("-sT", false),
            cancellation,
            MAX_FINGERPRINT_XML_BYTES,
            MAX_FINGERPRINT_STDERR_BYTES,
        )
        .await
        {
            BoundedCancellableOutput::Cancelled => {
                return Ok(cancelled_scan_result(
                    target.to_string(),
                    session_id.to_string(),
                    command_hint,
                ));
            }
            BoundedCancellableOutput::Unavailable => {
                return Err(AppError::unsupported(
                    "Service and OS fingerprinting requires an available nmap installation.",
                ));
            }
            BoundedCancellableOutput::Completed(output) => output,
        }
    } else {
        syn_output
    };

    if output.stdout_exceeded_limit || output.stderr_exceeded_limit {
        return Err(AppError::internal(
            "nmap fingerprint output exceeded the supported size limit.",
        ));
    }

    if *cancellation.borrow() || super::session::is_cancelled(session_id) {
        return Ok(cancelled_scan_result(
            target.to_string(),
            session_id.to_string(),
            command_hint,
        ));
    }
    if !output.output.status.success() {
        return Err(AppError::internal(
            "nmap could not complete service and OS fingerprinting. Check the target and local permissions, then retry.",
        ));
    }
    let xml = String::from_utf8_lossy(&output.output.stdout);
    let (samples, open_ports, fingerprint) = parse_nmap_fingerprint_xml(&xml)?;
    for sample in &samples {
        if let Some(app) = app {
            let _ = app.emit(PORT_SAMPLE_EVENT, sample);
        }
    }

    Ok(PortScanResult {
        target: target.into(),
        mode: "nmap-fingerprint-syn-or-connect".into(),
        open_ports,
        samples,
        fingerprint: Some(fingerprint),
        cancelled: false,
        session_id: session_id.to_string(),
        message: Some(
            "Service detection used light probes; OS matches depend on available ports and privileges. No NSE scripts were run.".into(),
        ),
        command_hint,
    })
}

fn fingerprint_nmap_args(scan: &str, ports: &str, target: &str, detect_os: bool) -> Vec<String> {
    let mut args = vec![
        "-Pn".to_string(),
        // Nmap uses Polite timing to keep version detection serial. The
        // explicit scan delay below paces port and OS probes, but Nmap's
        // service scanner controls its own per-probe timing.
        "-T2".to_string(),
        scan.to_string(),
        "-sV".to_string(),
        "--version-light".to_string(),
    ];
    if detect_os {
        args.extend([
            "-O".to_string(),
            "--osscan-limit".to_string(),
            "--max-os-tries".to_string(),
            "1".to_string(),
        ]);
    }
    append_nmap_scan_limits(&mut args);
    args.extend([
        "-p".to_string(),
        ports.to_string(),
        "-oX".to_string(),
        "-".to_string(),
        target.to_string(),
    ]);
    args
}

fn append_nmap_scan_limits(args: &mut Vec<String>) {
    args.extend([
        "--max-retries".to_string(),
        "1".to_string(),
        "--host-timeout".to_string(),
        "30s".to_string(),
        "--scan-delay".to_string(),
        format!("{PROBE_INTERVAL_MS}ms"),
    ]);
}

fn requires_unprivileged_connect_fallback(
    status_success: bool,
    stdout: &[u8],
    stderr: &[u8],
) -> bool {
    if status_success {
        return false;
    }

    let stdout = String::from_utf8_lossy(stdout).to_ascii_lowercase();
    let stderr = String::from_utf8_lossy(stderr).to_ascii_lowercase();
    let diagnostic = if stdout.contains("<nmaprun") {
        stderr
    } else {
        format!("{stderr}\n{stdout}")
    };
    [
        "requires root",
        "root privileges",
        "raw packet privileges",
        "raw socket",
        "operation not permitted",
        "not permitted",
        "permission denied",
    ]
    .iter()
    .any(|marker| diagnostic.contains(marker))
}

#[derive(Default)]
struct XmlPort {
    port: u16,
    protocol: String,
    state: String,
    service_name: Option<String>,
    encrypted_tunnel: bool,
    product: Option<String>,
    version: Option<String>,
    extra_info: Option<String>,
    confidence: Option<u8>,
}

#[derive(Default)]
struct XmlOsMatch {
    name: Option<String>,
    accuracy: Option<u8>,
    class_name: Option<String>,
}

fn parse_nmap_fingerprint_xml(
    xml: &str,
) -> AppResult<(Vec<PortSampleEvent>, Vec<u16>, PortFingerprint)> {
    use quick_xml::events::{BytesStart, Event};
    use quick_xml::Reader;
    use std::collections::BTreeMap;

    if xml.len() > MAX_FINGERPRINT_XML_BYTES {
        return Err(AppError::internal("nmap fingerprint output is too large."));
    }

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut current_port: Option<XmlPort> = None;
    let mut current_os_match: Option<XmlOsMatch> = None;
    let mut samples = BTreeMap::<u16, PortSampleEvent>::new();
    let mut services = BTreeMap::<u16, PortServiceFingerprint>::new();
    let mut os_matches = Vec::<PortOsMatch>::new();
    let mut element_stack = Vec::<String>::new();
    let mut root_seen = false;

    fn attr(
        event: &BytesStart<'_>,
        name: &str,
        xml_version: quick_xml::XmlVersion,
    ) -> AppResult<Option<String>> {
        for attribute in event.attributes().with_checks(true) {
            let attribute = attribute
                .map_err(|_| AppError::internal("nmap returned malformed XML attributes."))?;
            if attribute.key.as_ref() == name {
                return attribute
                    .normalized_value(xml_version)
                    .map(|value| Some(value.into_owned()))
                    .map_err(|_| AppError::internal("nmap returned malformed XML text."));
            }
        }
        Ok(None)
    }

    fn safe_field(value: Option<String>) -> Option<String> {
        let value = value?;
        let cleaned = value
            .chars()
            .filter(|character| !character.is_control())
            .take(96)
            .collect::<String>();
        let cleaned = cleaned.trim().to_string();
        (!cleaned.is_empty()).then_some(cleaned)
    }

    fn parse_confidence(value: Option<String>) -> Option<u8> {
        value?.parse::<u8>().ok().map(|value| value.min(100))
    }

    fn finish_port(
        port: XmlPort,
        samples: &mut BTreeMap<u16, PortSampleEvent>,
        services: &mut BTreeMap<u16, PortServiceFingerprint>,
    ) {
        if port.port == 0 || !port.protocol.eq_ignore_ascii_case("tcp") {
            return;
        }
        let state = match port.state.as_str() {
            "open" => "open",
            "closed" => "closed",
            "filtered" | "open|filtered" | "closed|filtered" => "filtered",
            _ => return,
        };
        samples.insert(
            port.port,
            PortSampleEvent {
                port: port.port,
                state: state.into(),
                service_hint: port
                    .service_name
                    .clone()
                    .or_else(|| service_hint(port.port)),
                rtt_ms: None,
            },
        );
        if state != "open" {
            return;
        }
        let risk_tags = service_risk_tags(
            port.port,
            port.service_name.as_deref(),
            port.encrypted_tunnel,
        );
        if port.service_name.is_some()
            || port.product.is_some()
            || port.version.is_some()
            || port.extra_info.is_some()
            || !risk_tags.is_empty()
        {
            services.insert(
                port.port,
                PortServiceFingerprint {
                    port: port.port,
                    service_name: port.service_name,
                    product: port.product,
                    version: port.version,
                    extra_info: port.extra_info,
                    confidence: port.confidence,
                    risk_tags,
                },
            );
        }
    }

    fn finish_os_match(candidate: XmlOsMatch, matches: &mut Vec<PortOsMatch>) {
        let Some(name) = candidate.name.or(candidate.class_name) else {
            return;
        };
        let Some(accuracy) = candidate.accuracy else {
            return;
        };
        if matches.iter().any(|item| item.name == name) {
            return;
        }
        matches.push(PortOsMatch { name, accuracy });
    }

    loop {
        let event = reader
            .read_event()
            .map_err(|_| AppError::internal("nmap returned invalid fingerprint XML."))?;
        match event {
            Event::Start(element) => {
                let element_name = element.name().as_ref().to_string();
                if element_stack.is_empty() {
                    if root_seen || element_name != "nmaprun" {
                        return Err(AppError::internal("nmap returned invalid fingerprint XML."));
                    }
                    root_seen = true;
                }
                element_stack.push(element_name);
                match element.name().as_ref() {
                    "port" => {
                        let port = attr(&element, "portid", quick_xml::XmlVersion::default())?
                            .and_then(|value| value.parse::<u16>().ok())
                            .unwrap_or(0);
                        let protocol =
                            attr(&element, "protocol", quick_xml::XmlVersion::default())?
                                .unwrap_or_default();
                        current_port = Some(XmlPort {
                            port,
                            protocol,
                            ..XmlPort::default()
                        });
                    }
                    "state" => {
                        if let Some(port) = current_port.as_mut() {
                            port.state = attr(&element, "state", quick_xml::XmlVersion::default())?
                                .unwrap_or_default();
                        }
                    }
                    "service" => {
                        if let Some(port) = current_port.as_mut() {
                            port.service_name = safe_field(attr(
                                &element,
                                "name",
                                quick_xml::XmlVersion::default(),
                            )?);
                            port.encrypted_tunnel =
                                attr(&element, "tunnel", quick_xml::XmlVersion::default())?
                                    .is_some_and(|tunnel| tunnel.eq_ignore_ascii_case("ssl"));
                            port.product = safe_field(attr(
                                &element,
                                "product",
                                quick_xml::XmlVersion::default(),
                            )?);
                            port.version = safe_field(attr(
                                &element,
                                "version",
                                quick_xml::XmlVersion::default(),
                            )?);
                            port.extra_info = safe_field(attr(
                                &element,
                                "extrainfo",
                                quick_xml::XmlVersion::default(),
                            )?);
                            port.confidence = parse_confidence(attr(
                                &element,
                                "conf",
                                quick_xml::XmlVersion::default(),
                            )?);
                        }
                    }
                    "osmatch" => {
                        current_os_match = Some(XmlOsMatch {
                            name: safe_field(attr(
                                &element,
                                "name",
                                quick_xml::XmlVersion::default(),
                            )?),
                            accuracy: parse_confidence(attr(
                                &element,
                                "accuracy",
                                quick_xml::XmlVersion::default(),
                            )?),
                            ..XmlOsMatch::default()
                        });
                    }
                    "osclass" => {
                        if let Some(os_match) = current_os_match.as_mut() {
                            let vendor = safe_field(attr(
                                &element,
                                "vendor",
                                quick_xml::XmlVersion::default(),
                            )?);
                            let family = safe_field(attr(
                                &element,
                                "osfamily",
                                quick_xml::XmlVersion::default(),
                            )?);
                            let generation = safe_field(attr(
                                &element,
                                "osgen",
                                quick_xml::XmlVersion::default(),
                            )?);
                            os_match.class_name = [vendor, family, generation]
                                .into_iter()
                                .flatten()
                                .reduce(|left, right| format!("{left} {right}"));
                        }
                    }
                    _ => {}
                }
            }
            Event::Empty(element) => {
                if element_stack.is_empty() {
                    if root_seen || element.name().as_ref() != "nmaprun" {
                        return Err(AppError::internal("nmap returned invalid fingerprint XML."));
                    }
                    root_seen = true;
                }
                match element.name().as_ref() {
                    "port" => {
                        let port = attr(&element, "portid", quick_xml::XmlVersion::default())?
                            .and_then(|value| value.parse::<u16>().ok())
                            .unwrap_or(0);
                        finish_port(
                            XmlPort {
                                port,
                                protocol: attr(
                                    &element,
                                    "protocol",
                                    quick_xml::XmlVersion::default(),
                                )?
                                .unwrap_or_default(),
                                ..XmlPort::default()
                            },
                            &mut samples,
                            &mut services,
                        );
                    }
                    "state" => {
                        if let Some(port) = current_port.as_mut() {
                            port.state = attr(&element, "state", quick_xml::XmlVersion::default())?
                                .unwrap_or_default();
                        }
                    }
                    "service" => {
                        if let Some(port) = current_port.as_mut() {
                            port.service_name = safe_field(attr(
                                &element,
                                "name",
                                quick_xml::XmlVersion::default(),
                            )?);
                            port.encrypted_tunnel =
                                attr(&element, "tunnel", quick_xml::XmlVersion::default())?
                                    .is_some_and(|tunnel| tunnel.eq_ignore_ascii_case("ssl"));
                            port.product = safe_field(attr(
                                &element,
                                "product",
                                quick_xml::XmlVersion::default(),
                            )?);
                            port.version = safe_field(attr(
                                &element,
                                "version",
                                quick_xml::XmlVersion::default(),
                            )?);
                            port.extra_info = safe_field(attr(
                                &element,
                                "extrainfo",
                                quick_xml::XmlVersion::default(),
                            )?);
                            port.confidence = parse_confidence(attr(
                                &element,
                                "conf",
                                quick_xml::XmlVersion::default(),
                            )?);
                        }
                    }
                    "osmatch" => finish_os_match(
                        XmlOsMatch {
                            name: safe_field(attr(
                                &element,
                                "name",
                                quick_xml::XmlVersion::default(),
                            )?),
                            accuracy: parse_confidence(attr(
                                &element,
                                "accuracy",
                                quick_xml::XmlVersion::default(),
                            )?),
                            ..XmlOsMatch::default()
                        },
                        &mut os_matches,
                    ),
                    "osclass" => {
                        if let Some(os_match) = current_os_match.as_mut() {
                            let vendor = safe_field(attr(
                                &element,
                                "vendor",
                                quick_xml::XmlVersion::default(),
                            )?);
                            let family = safe_field(attr(
                                &element,
                                "osfamily",
                                quick_xml::XmlVersion::default(),
                            )?);
                            let generation = safe_field(attr(
                                &element,
                                "osgen",
                                quick_xml::XmlVersion::default(),
                            )?);
                            os_match.class_name = [vendor, family, generation]
                                .into_iter()
                                .flatten()
                                .reduce(|left, right| format!("{left} {right}"));
                        }
                    }
                    _ => {}
                }
            }
            Event::End(element) => {
                let tag = element.name();
                let name = tag.as_ref();
                if element_stack.pop().as_deref() != Some(name) {
                    return Err(AppError::internal("nmap returned invalid fingerprint XML."));
                }
                match name {
                    "port" => {
                        if let Some(port) = current_port.take() {
                            finish_port(port, &mut samples, &mut services);
                        }
                    }
                    "osmatch" => {
                        if let Some(candidate) = current_os_match.take() {
                            finish_os_match(candidate, &mut os_matches);
                        }
                    }
                    _ => {}
                }
            }
            Event::Eof => {
                if !root_seen || !element_stack.is_empty() {
                    return Err(AppError::internal(
                        "nmap returned incomplete fingerprint XML.",
                    ));
                }
                break;
            }
            _ => {}
        }
    }

    os_matches.sort_by_key(|candidate| std::cmp::Reverse(candidate.accuracy));
    os_matches.truncate(3);
    let open_ports = samples
        .values()
        .filter(|sample| sample.state == "open")
        .map(|sample| sample.port)
        .collect();
    Ok((
        samples.into_values().collect(),
        open_ports,
        PortFingerprint {
            services: services.into_values().collect(),
            os_matches,
        },
    ))
}

fn service_risk_tags(port: u16, service_name: Option<&str>, encrypted_tunnel: bool) -> Vec<String> {
    let service = service_name.unwrap_or_default().to_ascii_lowercase();
    let has = |names: &[&str]| names.iter().any(|name| service == *name);
    let use_port_hint = service.is_empty() || matches!(service.as_str(), "unknown" | "tcpwrapped");
    let mut tags = Vec::new();
    if (use_port_hint && matches!(port, 22 | 23 | 3389 | 5900 | 5985 | 5986))
        || has(&["ssh", "telnet", "rdp", "vnc", "winrm"])
    {
        tags.push("remote_admin".to_string());
    }
    if (use_port_hint && matches!(port, 21 | 139 | 445 | 2049))
        || has(&["ftp", "microsoft-ds", "netbios-ssn", "nfs", "smb"])
    {
        tags.push("file_sharing".to_string());
    }
    if (use_port_hint && matches!(port, 1433 | 1521 | 3306 | 5432 | 6379 | 9200 | 27017))
        || has(&[
            "mysql",
            "postgresql",
            "postgres",
            "ms-sql-s",
            "oracle",
            "redis",
            "mongodb",
            "elasticsearch",
        ])
    {
        tags.push("database".to_string());
    }
    if !encrypted_tunnel
        && !service.starts_with("ssl/")
        && ((use_port_hint && matches!(port, 21 | 23 | 25 | 80 | 110 | 143 | 8080))
            || has(&[
                "ftp",
                "telnet",
                "http",
                "http-alt",
                "http-proxy",
                "pop3",
                "imap",
                "smtp",
            ]))
    {
        tags.push("plaintext_protocol".to_string());
    }
    tags
}

enum CancellableOutput {
    Completed(Output),
    Cancelled,
    Unavailable,
}

struct BoundedOutput {
    output: Output,
    stdout_exceeded_limit: bool,
    stderr_exceeded_limit: bool,
}

enum BoundedCancellableOutput {
    Completed(BoundedOutput),
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

async fn read_capped_async(
    mut reader: impl AsyncRead + Unpin,
    limit: usize,
) -> std::io::Result<(Vec<u8>, bool)> {
    let mut captured = Vec::with_capacity(limit.min(16 * 1024));
    let mut buffer = [0_u8; 8192];
    let mut exceeded_limit = false;
    loop {
        let count = reader.read(&mut buffer).await?;
        if count == 0 {
            break;
        }
        let remaining = limit.saturating_sub(captured.len());
        let retained = count.min(remaining);
        captured.extend_from_slice(&buffer[..retained]);
        exceeded_limit |= retained < count;
    }
    Ok((captured, exceeded_limit))
}

async fn run_program_cancellable_bounded(
    program: &OsStr,
    args: &[String],
    cancellation: &mut watch::Receiver<bool>,
    stdout_limit: usize,
    stderr_limit: usize,
) -> BoundedCancellableOutput {
    if *cancellation.borrow() {
        return BoundedCancellableOutput::Cancelled;
    }

    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(_) => return BoundedCancellableOutput::Unavailable,
    };
    let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
        return BoundedCancellableOutput::Unavailable;
    };

    tokio::select! {
        biased;
        _ = wait_for_cancellation(cancellation) => BoundedCancellableOutput::Cancelled,
        result = async {
            let (status, (stdout, stderr)) = tokio::try_join!(
                child.wait(),
                async {
                    tokio::try_join!(
                        read_capped_async(stdout, stdout_limit),
                        read_capped_async(stderr, stderr_limit),
                    )
                }
            )?;
            Ok::<_, std::io::Error>((status, stdout, stderr))
        } => match result {
            Ok((
                status,
                (stdout, stdout_exceeded_limit),
                (stderr, stderr_exceeded_limit),
            )) => {
                BoundedCancellableOutput::Completed(BoundedOutput {
                    output: Output { status, stdout, stderr },
                    stdout_exceeded_limit,
                    stderr_exceeded_limit,
                })
            }
            Err(_) => BoundedCancellableOutput::Unavailable,
        }
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
            run_program_cancellable_bounded(program.as_os_str(), &[], &mut cancellation, 1024, 1024)
                .await
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
        assert!(matches!(output, BoundedCancellableOutput::Cancelled));
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

    #[tokio::test]
    async fn fingerprint_output_capture_is_bounded_and_drains_excess() {
        let session = super::super::session::new_cancellable_session();
        let mut cancellation = session.cancellation.clone();
        let args = vec![
            "-c".to_string(),
            "printf 'abcdefgh'; printf 'stderr' >&2".to_string(),
        ];
        let output =
            run_program_cancellable_bounded(OsStr::new("sh"), &args, &mut cancellation, 4, 3).await;

        let BoundedCancellableOutput::Completed(output) = output else {
            panic!("bounded command should finish");
        };
        assert!(output.output.status.success());
        assert_eq!(output.output.stdout, b"abcd");
        assert!(output.stdout_exceeded_limit);
        assert_eq!(output.output.stderr, b"std");
        assert!(output.stderr_exceeded_limit);
    }
}

fn is_high_risk_scan_target(target: &str) -> bool {
    if target.eq_ignore_ascii_case("localhost") {
        return false;
    }
    match IpAddr::from_str(target) {
        Ok(IpAddr::V4(ip)) => !(ip.is_private() || ip.is_loopback() || ip.is_link_local()),
        Ok(IpAddr::V6(ip)) => {
            !(ip.is_loopback() || ip.is_unique_local() || ip.is_unicast_link_local())
        }
        // DNS names can resolve to public addresses. Do not resolve here: DNS is mutable and
        // resolution would create a second, racy interpretation of the scan target.
        Err(_) => true,
    }
}

fn validate_single_host_target(target: &str) -> AppResult<()> {
    if IpAddr::from_str(target).is_ok() {
        return Ok(());
    }

    // `url::Host::parse` is intentionally permissive and may treat a CIDR
    // suffix or Nmap target-list delimiters as part of a domain. Reject those
    // target-expression characters before taking the hostname path.
    if target
        .chars()
        .any(|character| matches!(character, '/' | ',' | '*' | '?' | '!'))
    {
        return Err(single_host_target_required());
    }

    // Nmap accepts IPv4 octet ranges as target expressions. Keep those and
    // non-canonical numeric IPv4 spellings out of the hostname path.
    let without_trailing_dot = target.strip_suffix('.').unwrap_or(target);
    let labels: Vec<_> = without_trailing_dot.split('.').collect();
    let is_numeric_ipv4_expression = labels.len() == 4
        && labels.iter().all(|label| {
            let Some((start, end)) = label.split_once('-') else {
                return !label.is_empty() && label.chars().all(|c| c.is_ascii_digit());
            };
            !start.is_empty()
                && !end.is_empty()
                && start.chars().all(|c| c.is_ascii_digit())
                && end.chars().all(|c| c.is_ascii_digit())
                && !end.contains('-')
        });

    if is_numeric_ipv4_expression {
        return Err(single_host_target_required());
    }

    match url::Host::parse(target) {
        Ok(url::Host::Domain(_)) => Ok(()),
        _ => Err(single_host_target_required()),
    }
}

fn single_host_target_required() -> AppError {
    AppError::new(
        "PORT_SCAN_SINGLE_HOST_REQUIRED",
        "Port scanning accepts one IP address or hostname. CIDR ranges and target lists are not supported.",
    )
}

fn validate_high_risk_scan_confirmation(
    target: &str,
    port_count: usize,
    confirmed: bool,
) -> AppResult<()> {
    if (is_high_risk_scan_target(target) || port_count > 64) && !confirmed {
        return Err(AppError::new(
            "HIGH_RISK_CONFIRMATION_REQUIRED",
            "This target or port range requires explicit confirmation.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod high_risk_confirmation_tests {
    use super::*;
    use std::net::Ipv6Addr;

    #[test]
    fn classifies_local_and_public_scan_targets_conservatively() {
        let unique_local = Ipv6Addr::new(0xfd00, 0, 0, 0, 0, 0, 0, 1).to_string();
        let link_local = Ipv6Addr::new(0xfe80, 0, 0, 0, 0, 0, 0, 1).to_string();
        for target in [
            "localhost",
            "LOCALHOST",
            "127.0.0.1",
            "10.1.2.3",
            "172.31.1.2",
            "192.168.1.2",
            "169.254.1.2",
            "::1",
            unique_local.as_str(),
            link_local.as_str(),
        ] {
            assert!(
                !is_high_risk_scan_target(target),
                "{target} should be local"
            );
        }

        for target in [
            "8.8.8.8",
            "172.32.1.2",
            "100.64.0.1",
            "2001:4860:4860::8888",
            "example.com",
        ] {
            assert!(
                is_high_risk_scan_target(target),
                "{target} should require confirmation"
            );
        }
    }

    #[test]
    fn requires_confirmation_for_public_targets_or_more_than_64_ports() {
        assert!(validate_high_risk_scan_confirmation("127.0.0.1", 64, false).is_ok());
        let error = validate_high_risk_scan_confirmation("127.0.0.1", 65, false)
            .expect_err("large local ranges require explicit confirmation");
        assert_eq!(error.code, "HIGH_RISK_CONFIRMATION_REQUIRED");
        assert!(validate_high_risk_scan_confirmation("8.8.8.8", 1, false).is_err());
        assert!(validate_high_risk_scan_confirmation("example.com", 1, false).is_err());
        assert!(validate_high_risk_scan_confirmation("8.8.8.8", 1, true).is_ok());
        assert!(validate_high_risk_scan_confirmation("127.0.0.1", 65, true).is_ok());
    }
}

#[cfg(test)]
mod single_host_target_tests {
    use super::*;

    #[test]
    fn accepts_single_ip_and_hostname_targets() {
        for target in [
            "127.0.0.1",
            "2001:db8::1",
            "localhost",
            "router.local",
            "example.com.",
        ] {
            assert!(
                validate_single_host_target(target).is_ok(),
                "{target} should be accepted as one host"
            );
        }
    }

    #[test]
    fn rejects_cidrs_target_lists_wildcards_and_ipv4_ranges() {
        for target in [
            "192.168.0.0/24",
            "2001:db8::/64",
            "example.com,example.net",
            "192.168.0.1,192.168.0.2",
            "192.168.1.1-254",
            "192.168.1-2.3.4",
            "192.168.0.*",
        ] {
            let error = validate_single_host_target(target)
                .expect_err("multi-host target syntax must be rejected");
            assert_eq!(error.code, "PORT_SCAN_SINGLE_HOST_REQUIRED", "{target}");
        }
    }
}

#[cfg(test)]
mod fingerprint_tests {
    use super::*;

    #[test]
    fn parses_service_and_os_matches_with_exposure_categories() {
        let xml = r#"<?xml version="1.0"?>
<nmaprun><host><ports>
  <port protocol="tcp" portid="22"><state state="open"/><service name="ssh" product="OpenSSH &amp; Server" version="9.9" conf="98"/></port>
  <port protocol="tcp" portid="80"><state state="open"/><service name="http" product="Bench Web" version="1.2" conf="90"/></port>
  <port protocol="tcp" portid="443"><state state="closed"/></port>
</ports><os><osmatch name="Linux 6.x" accuracy="98"><osclass vendor="Linux" osfamily="Linux" osgen="6.X" type="general purpose" accuracy="98"/></osmatch>
<osmatch name="Linux 5.x" accuracy="86"/></os></host></nmaprun>"#;

        let (samples, open_ports, fingerprint) =
            parse_nmap_fingerprint_xml(xml).expect("parse valid nmap XML");
        assert_eq!(open_ports, vec![22, 80]);
        assert_eq!(samples.len(), 3);
        assert_eq!(samples[0].service_hint.as_deref(), Some("ssh"));
        assert_eq!(fingerprint.services.len(), 2);
        assert_eq!(
            fingerprint.services[0].product.as_deref(),
            Some("OpenSSH & Server")
        );
        assert_eq!(fingerprint.services[0].risk_tags, vec!["remote_admin"]);
        assert_eq!(
            fingerprint.services[1].risk_tags,
            vec!["plaintext_protocol"]
        );
        assert_eq!(fingerprint.os_matches.len(), 2);
        assert_eq!(fingerprint.os_matches[0].name, "Linux 6.x");
        assert_eq!(fingerprint.os_matches[0].accuracy, 98);
    }

    #[test]
    fn bounds_and_cleans_untrusted_service_metadata() {
        let xml = format!(
            "<nmaprun><host><ports><port protocol=\"tcp\" portid=\"8080\"><state state=\"open\"/><service name=\"http\" product=\"{}\"/></port></ports></host></nmaprun>",
            format!("{}\nEXTRA", "x".repeat(150))
        );
        let (_, _, fingerprint) = parse_nmap_fingerprint_xml(&xml).expect("parse bounded fields");
        let product = fingerprint.services[0].product.as_deref().unwrap();
        assert_eq!(product.len(), 96);
        assert!(!product.chars().any(char::is_control));
    }

    #[test]
    fn rejects_malformed_or_oversized_xml() {
        assert!(parse_nmap_fingerprint_xml("<nmaprun><host>").is_err());
        assert!(parse_nmap_fingerprint_xml("<nmaprun><host></nmaprun></host>").is_err());
        assert!(parse_nmap_fingerprint_xml("<other><host/></other>").is_err());
        assert!(parse_nmap_fingerprint_xml(&"x".repeat(MAX_FINGERPRINT_XML_BYTES + 1)).is_err());
    }

    #[test]
    fn fingerprint_args_use_xml_and_light_probes_without_scripts_or_shell() {
        let target = "127.0.0.1; echo unsafe";
        let syn_args = fingerprint_nmap_args("-sS", "22,80", target, true);
        let connect_args = fingerprint_nmap_args("-sT", "22,80", target, false);
        assert_eq!(syn_args.last().map(String::as_str), Some(target));
        assert_eq!(connect_args.last().map(String::as_str), Some(target));
        assert!(syn_args.windows(2).any(|pair| pair == ["-oX", "-"]));
        assert!(connect_args.windows(2).any(|pair| pair == ["-oX", "-"]));
        assert!(syn_args.iter().any(|arg| arg == "--version-light"));
        assert!(connect_args.iter().any(|arg| arg == "--version-light"));
        assert!(syn_args.iter().any(|arg| arg == "-O"));
        assert!(syn_args.iter().any(|arg| arg == "--osscan-limit"));
        assert!(syn_args
            .windows(2)
            .any(|pair| pair == ["--host-timeout", "30s"]));
        assert!(syn_args
            .windows(2)
            .any(|pair| pair == ["--max-retries", "1"]));
        assert!(syn_args
            .windows(2)
            .any(|pair| pair == ["--scan-delay", "50ms"]));
        assert!(syn_args.iter().any(|arg| arg == "-T2"));
        assert!(connect_args
            .windows(2)
            .any(|pair| pair == ["--scan-delay", "50ms"]));
        assert!(connect_args.iter().any(|arg| arg == "-T2"));
        assert!(!syn_args.iter().any(|arg| arg == "--max-parallelism"));
        assert!(!connect_args.iter().any(|arg| arg == "--max-parallelism"));
        assert!(!connect_args.iter().any(|arg| arg == "-O"));
        assert!(!connect_args.iter().any(|arg| arg == "--osscan-limit"));
        assert!(!syn_args
            .iter()
            .any(|arg| arg == "-sC" || arg == "-A" || arg.starts_with("--script")));
        assert!(!connect_args
            .iter()
            .any(|arg| arg == "-sC" || arg == "-A" || arg.starts_with("--script")));
    }

    #[test]
    fn only_privilege_failures_trigger_connect_fallback() {
        assert!(requires_unprivileged_connect_fallback(
            false,
            b"",
            b"You requested a scan type which requires root privileges."
        ));
        assert!(requires_unprivileged_connect_fallback(
            false,
            b"",
            b"Couldn't open a raw socket: Operation not permitted"
        ));
        assert!(requires_unprivileged_connect_fallback(
            false,
            b"Nmap requires root to use raw packet privileges",
            b""
        ));
        assert!(!requires_unprivileged_connect_fallback(
            false,
            b"",
            b"Failed to resolve target hostname"
        ));
        assert!(!requires_unprivileged_connect_fallback(false, b"", b""));
        assert!(!requires_unprivileged_connect_fallback(
            true,
            b"<nmaprun><host/></nmaprun>",
            b""
        ));
        // A target-controlled service banner in otherwise valid XML cannot
        // impersonate a privilege diagnostic.
        assert!(!requires_unprivileged_connect_fallback(
            false,
            b"<nmaprun><service product=\"Operation not permitted\"/></nmaprun>",
            b""
        ));
    }

    #[tokio::test]
    async fn built_in_probe_dispatch_waits_between_target_probes() {
        let session = super::super::session::new_cancellable_session();
        let mut cancellation = session.cancellation.clone();
        let mut last_probe_started = None;

        assert!(wait_for_probe_slot(&mut last_probe_started, &mut cancellation, &session.id).await);
        let first_started = last_probe_started.expect("first probe is scheduled");
        assert!(wait_for_probe_slot(&mut last_probe_started, &mut cancellation, &session.id).await);
        let second_started = last_probe_started.expect("second probe is scheduled");

        assert!(second_started.duration_since(first_started) >= Duration::from_millis(50));
    }

    #[tokio::test]
    async fn cancellation_during_probe_spacing_prevents_the_next_probe() {
        let session = super::super::session::new_cancellable_session();
        let mut cancellation = session.cancellation.clone();
        let mut last_probe_started = None;
        assert!(wait_for_probe_slot(&mut last_probe_started, &mut cancellation, &session.id).await);

        let cancel_session_id = session.id.clone();
        let cancel_task = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(5)).await;
            super::super::session::cancel_scan(cancel_session_id);
        });
        assert!(
            !wait_for_probe_slot(&mut last_probe_started, &mut cancellation, &session.id).await
        );
        cancel_task.await.expect("cancellation should finish");
    }

    #[test]
    fn risk_tags_are_categories_not_severity_levels() {
        assert_eq!(
            service_risk_tags(23, Some("telnet"), false),
            vec!["remote_admin", "plaintext_protocol"]
        );
        assert_eq!(
            service_risk_tags(9306, Some("mysql"), false),
            vec!["database"]
        );
        assert_eq!(
            service_risk_tags(80, Some("https"), false),
            Vec::<String>::new()
        );
        assert_eq!(
            service_risk_tags(8080, Some("http"), true),
            Vec::<String>::new()
        );
        assert_eq!(
            service_risk_tags(3306, Some("ssh"), false),
            vec!["remote_admin"]
        );
        assert_eq!(
            service_risk_tags(23, None, false),
            vec!["remote_admin", "plaintext_protocol"]
        );
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
