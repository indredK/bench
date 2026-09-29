//! Opt-in, single-host fingerprinting delegated to the user's installed Nmap.

use super::ports::validate_scan_target;
use super::session::{is_cancelled, SessionGuard};
use super::types::{
    NetworkFingerprintResult, OsFingerprintMatch, ScanSessionEvent, ServiceFingerprint,
};
use super::{packs, ports};
use crate::error::{AppError, AppResult};
use quick_xml::de::from_str;
use serde::Deserialize;
use std::process::Output;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::process::Command;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio::time::Instant;

const MAX_FINGERPRINT_PORTS: usize = 64;
const MAX_XML_BYTES: usize = 512 * 1024;
const SERVICE_TIMEOUT: Duration = Duration::from_secs(24);
const OS_TIMEOUT: Duration = Duration::from_secs(10);
const PROCESS_CANCEL_POLL: Duration = Duration::from_millis(100);
static FINGERPRINT_GATE: OnceLock<Arc<Semaphore>> = OnceLock::new();

enum NmapOutcome {
    Complete(Output),
    Cancelled,
    TimedOut,
}

struct AbortOnDrop(tokio::task::AbortHandle);

impl Drop for AbortOnDrop {
    fn drop(&mut self) {
        self.0.abort();
    }
}

pub async fn fingerprint_target<R: Runtime>(
    app: &AppHandle<R>,
    target: String,
    ports: Vec<u16>,
    include_os: bool,
) -> AppResult<NetworkFingerprintResult> {
    super::validate::validate_host(&target)?;
    validate_scan_target(&target)?;
    validate_single_host(&target)?;

    let mut ports: Vec<u16> = ports.into_iter().filter(|port| *port > 0).collect();
    ports.sort_unstable();
    ports.dedup();
    if ports.is_empty() || ports.len() > MAX_FINGERPRINT_PORTS {
        return Err(AppError::invalid_input(format!(
            "Fingerprinting requires 1..={MAX_FINGERPRINT_PORTS} ports"
        )));
    }

    let nmap = packs::nmap_binary()
        .ok_or_else(|| AppError::unsupported("Nmap is not installed or could not be started"))?;
    let _permit: OwnedSemaphorePermit = FINGERPRINT_GATE
        .get_or_init(|| Arc::new(Semaphore::new(1)))
        .clone()
        .try_acquire_owned()
        .map_err(|_| AppError::new("BUSY", "A fingerprint scan is already running"))?;
    let session_guard = SessionGuard::new();
    let session_id = session_guard.id().to_string();
    let _ = app.emit(
        ports::SCAN_SESSION_EVENT,
        &ScanSessionEvent {
            session_id: session_id.clone(),
            kind: "ports".into(),
        },
    );

    let port_arg = ports
        .iter()
        .map(u16::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let service_args = service_scan_args(&target, &port_arg);
    let service_output = match run_nmap(&nmap, service_args, &session_id, SERVICE_TIMEOUT).await? {
        NmapOutcome::Complete(output) => output,
        NmapOutcome::Cancelled => {
            return Ok(cancelled_result(target, session_id, include_os));
        }
        NmapOutcome::TimedOut => {
            return Err(AppError::task_failed("Service fingerprint scan timed out"));
        }
    };
    if !service_output.status.success() {
        return Err(AppError::task_failed(
            "Nmap could not complete the service fingerprint scan",
        ));
    }

    let document = parse_nmap_xml(&service_output.stdout)?;
    let services = document
        .hosts
        .iter()
        .flat_map(|host| host.ports.iter().flat_map(|ports| ports.ports.iter()))
        .filter(|port| port.state.state == "open" && port.protocol == "tcp")
        .filter_map(map_service)
        .collect();

    let mut result = NetworkFingerprintResult {
        target: target.clone(),
        services,
        os_status: if include_os {
            "unavailable".into()
        } else {
            "not-requested".into()
        },
        os_matches: Vec::new(),
        cancelled: false,
        session_id: session_id.clone(),
        command_hint: command_hint(&target, &port_arg, include_os),
    };

    if include_os {
        let os_args = os_scan_args(&target, &port_arg);
        match run_nmap(&nmap, os_args, &session_id, OS_TIMEOUT).await? {
            NmapOutcome::Cancelled => {
                result.cancelled = true;
                result.os_status = "cancelled".into();
            }
            NmapOutcome::TimedOut => {
                result.os_status = "unavailable".into();
            }
            NmapOutcome::Complete(output) if requires_privilege(&output) => {
                result.os_status = "permission-required".into();
            }
            NmapOutcome::Complete(output) if output.status.success() => {
                match parse_nmap_xml(&output.stdout) {
                    Ok(document) => {
                        result.os_matches = document
                            .hosts
                            .iter()
                            .filter_map(|host| host.os.as_ref())
                            .flat_map(|os| os.matches.iter())
                            .take(3)
                            .map(map_os_match)
                            .collect();
                        result.os_status = if result.os_matches.is_empty() {
                            "not-detected".into()
                        } else {
                            "detected".into()
                        };
                    }
                    Err(_) => result.os_status = "unavailable".into(),
                }
            }
            NmapOutcome::Complete(_) => result.os_status = "unavailable".into(),
        }
    }

    Ok(result)
}

fn cancelled_result(
    target: String,
    session_id: String,
    include_os: bool,
) -> NetworkFingerprintResult {
    NetworkFingerprintResult {
        target,
        services: Vec::new(),
        os_status: if include_os {
            "cancelled".into()
        } else {
            "not-requested".into()
        },
        os_matches: Vec::new(),
        cancelled: true,
        session_id,
        command_hint: "nmap fingerprint cancelled".into(),
    }
}

async fn run_nmap(
    nmap: &std::path::Path,
    args: Vec<String>,
    session_id: &str,
    timeout: Duration,
) -> AppResult<NmapOutcome> {
    let nmap = nmap.to_path_buf();
    let task = tokio::spawn(async move {
        Command::new(nmap)
            .args(args)
            .kill_on_drop(true)
            .output()
            .await
    });
    let _abort_on_drop = AbortOnDrop(task.abort_handle());
    let deadline = Instant::now() + timeout;
    tokio::pin!(task);

    loop {
        tokio::select! {
            result = &mut task => {
                let output = result
                    .map_err(|error| AppError::task_failed(format!("Nmap task failed: {error}")))?
                    .map_err(|_| AppError::task_failed("Nmap could not be started"))?;
                if output.stdout.len() > MAX_XML_BYTES || output.stderr.len() > MAX_XML_BYTES {
                    return Err(AppError::task_failed("Nmap output exceeded the safety limit"));
                }
                return Ok(NmapOutcome::Complete(output));
            }
            _ = tokio::time::sleep(PROCESS_CANCEL_POLL) => {
                if is_cancelled(session_id) {
                    task.abort();
                    return Ok(NmapOutcome::Cancelled);
                }
                if Instant::now() >= deadline {
                    task.abort();
                    return Ok(NmapOutcome::TimedOut);
                }
            }
        }
    }
}

fn service_scan_args(target: &str, ports: &str) -> Vec<String> {
    [
        "-Pn",
        "-n",
        "-sT",
        "-sV",
        "--version-light",
        "--max-retries",
        "1",
        "--host-timeout",
        "20s",
        "-p",
        ports,
        "-oX",
        "-",
        "--",
        target,
    ]
    .into_iter()
    .map(str::to_owned)
    .collect()
}

fn command_hint(target: &str, ports: &str, include_os: bool) -> String {
    let mut hint = format!(
        "nmap -Pn -n -sT -sV --version-light --max-retries 1 --host-timeout 20s -p {ports} -oX - -- {target}"
    );
    if include_os {
        hint.push_str(&format!(
            "\nnmap -Pn -n -O --osscan-limit --max-os-tries 1 --max-retries 1 --host-timeout 8s -p {ports} -oX - -- {target}"
        ));
    }
    hint
}

fn validate_single_host(target: &str) -> AppResult<()> {
    if target.parse::<std::net::IpAddr>().is_ok() {
        return Ok(());
    }

    // Nmap accepts shorthand ranges such as `192.168.1.1-20` as target specs. Those
    // characters can also pass ordinary DNS-label validation, so reject numeric range
    // syntax explicitly while preserving legitimate DNS names containing hyphens.
    if target.contains('-')
        && target
            .chars()
            .all(|character| character.is_ascii_digit() || matches!(character, '.' | '-'))
    {
        return Err(AppError::invalid_input(
            "Fingerprinting accepts one host or address only",
        ));
    }

    let host = target.strip_suffix('.').unwrap_or(target);
    let valid_domain = !host.is_empty()
        && host.len() <= 253
        && host.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '-')
        });

    if valid_domain {
        Ok(())
    } else {
        Err(AppError::invalid_input(
            "Fingerprinting accepts one host or address only",
        ))
    }
}

fn os_scan_args(target: &str, ports: &str) -> Vec<String> {
    [
        "-Pn",
        "-n",
        "-O",
        "--osscan-limit",
        "--max-os-tries",
        "1",
        "--max-retries",
        "1",
        "--host-timeout",
        "8s",
        "-p",
        ports,
        "-oX",
        "-",
        "--",
        target,
    ]
    .into_iter()
    .map(str::to_owned)
    .collect()
}

fn parse_nmap_xml(bytes: &[u8]) -> AppResult<NmapDocument> {
    if bytes.len() > MAX_XML_BYTES {
        return Err(AppError::task_failed("Nmap XML exceeded the safety limit"));
    }
    let xml = std::str::from_utf8(bytes)
        .map_err(|_| AppError::task_failed("Nmap returned invalid XML encoding"))?;
    from_str(xml).map_err(|_| AppError::task_failed("Nmap returned malformed XML"))
}

fn map_service(port: &NmapPort) -> Option<ServiceFingerprint> {
    let service = port.service.as_ref();
    let name = clean_field(service.map(|value| value.name.as_str()), 64)
        .unwrap_or_else(|| "unknown".into());
    let product = clean_field(service.and_then(|value| value.product.as_deref()), 128);
    let version = clean_field(service.and_then(|value| value.version.as_deref()), 128);
    let extra_info = clean_field(service.and_then(|value| value.extra_info.as_deref()), 128);
    let cpe = service
        .map(|value| {
            value
                .cpe
                .iter()
                .filter_map(|entry| clean_string(entry, 192))
                .take(8)
                .collect()
        })
        .unwrap_or_default();
    let risk_tags = classify_service_risks(&name);

    Some(ServiceFingerprint {
        port: port.port_id,
        protocol: port.protocol.clone(),
        name,
        product,
        version,
        extra_info,
        confidence: service
            .and_then(|value| value.confidence)
            .map(|confidence| confidence.saturating_mul(10).min(100)),
        cpe,
        risk_tags,
    })
}

fn map_os_match(os_match: &NmapOsMatch) -> OsFingerprintMatch {
    OsFingerprintMatch {
        name: clean_string(&os_match.name, 160).unwrap_or_else(|| "Unknown OS".into()),
        accuracy: os_match.accuracy.min(100),
        classes: os_match
            .classes
            .iter()
            .filter_map(|class| {
                let parts = [
                    class.vendor.as_deref(),
                    class.family.as_deref(),
                    class.generation.as_deref(),
                    class.device_type.as_deref(),
                ]
                .into_iter()
                .flatten()
                .filter_map(|part| clean_string(part, 64))
                .collect::<Vec<_>>();
                (!parts.is_empty()).then(|| parts.join(" · "))
            })
            .take(4)
            .collect(),
        cpe: os_match
            .cpe
            .iter()
            .chain(os_match.classes.iter().flat_map(|class| class.cpe.iter()))
            .filter_map(|entry| clean_string(entry, 192))
            .take(8)
            .collect(),
    }
}

fn clean_field(value: Option<&str>, max_chars: usize) -> Option<String> {
    value.and_then(|value| clean_string(value, max_chars))
}

fn clean_string(value: &str, max_chars: usize) -> Option<String> {
    let cleaned = value
        .chars()
        .filter(|character| !character.is_control())
        .take(max_chars)
        .collect::<String>();
    let cleaned = cleaned.trim();
    (!cleaned.is_empty()).then(|| cleaned.to_string())
}

fn classify_service_risks(service: &str) -> Vec<String> {
    let service = service.to_ascii_lowercase();
    let mut risks = Vec::new();
    if matches!(
        service.as_str(),
        "ftp" | "telnet" | "rlogin" | "rsh" | "pop3" | "imap"
    ) {
        risks.push("cleartext-protocol".into());
    }
    if matches!(service.as_str(), "ssh" | "rdp" | "vnc" | "ms-wbt-server") {
        risks.push("remote-admin-service".into());
    }
    if matches!(
        service.as_str(),
        "mysql" | "postgresql" | "ms-sql-s" | "redis" | "mongodb" | "memcached" | "elasticsearch"
    ) {
        risks.push("database-service".into());
    }
    risks
}

fn requires_privilege(output: &Output) -> bool {
    let diagnostic = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    )
    .to_ascii_lowercase();
    diagnostic.contains("requires root")
        || diagnostic.contains("root privileges")
        || diagnostic.contains("administrator privileges")
        || diagnostic.contains("must be run as root")
        || diagnostic.contains("requires elevated privileges")
}

#[derive(Debug, Default, Deserialize)]
struct NmapDocument {
    #[serde(rename = "host", default)]
    hosts: Vec<NmapHost>,
}

#[derive(Debug, Default, Deserialize)]
struct NmapHost {
    #[serde(default)]
    ports: Option<NmapPorts>,
    #[serde(default)]
    os: Option<NmapOs>,
}

#[derive(Debug, Default, Deserialize)]
struct NmapPorts {
    #[serde(rename = "port", default)]
    ports: Vec<NmapPort>,
}

#[derive(Debug, Deserialize)]
struct NmapPort {
    #[serde(rename = "@protocol")]
    protocol: String,
    #[serde(rename = "@portid")]
    port_id: u16,
    state: NmapPortState,
    #[serde(default)]
    service: Option<NmapService>,
}

#[derive(Debug, Deserialize)]
struct NmapPortState {
    #[serde(rename = "@state")]
    state: String,
}

#[derive(Debug, Default, Deserialize)]
struct NmapService {
    #[serde(rename = "@name", default)]
    name: String,
    #[serde(rename = "@product")]
    product: Option<String>,
    #[serde(rename = "@version")]
    version: Option<String>,
    #[serde(rename = "@extrainfo")]
    extra_info: Option<String>,
    #[serde(rename = "@conf")]
    confidence: Option<u8>,
    #[serde(rename = "cpe", default)]
    cpe: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
struct NmapOs {
    #[serde(rename = "osmatch", default)]
    matches: Vec<NmapOsMatch>,
}

#[derive(Debug, Default, Deserialize)]
struct NmapOsMatch {
    #[serde(rename = "@name", default)]
    name: String,
    #[serde(rename = "@accuracy", default)]
    accuracy: u8,
    #[serde(rename = "osclass", default)]
    classes: Vec<NmapOsClass>,
    #[serde(rename = "cpe", default)]
    cpe: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
struct NmapOsClass {
    #[serde(rename = "@type")]
    device_type: Option<String>,
    #[serde(rename = "@vendor")]
    vendor: Option<String>,
    #[serde(rename = "@osfamily")]
    family: Option<String>,
    #[serde(rename = "@osgen")]
    generation: Option<String>,
    #[serde(rename = "cpe", default)]
    cpe: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    const FINGERPRINT_XML: &str = r#"<?xml version="1.0"?>
<nmaprun>
  <host>
    <ports>
      <port protocol="tcp" portid="6379">
        <state state="open" reason="syn-ack"/>
        <service name="redis" product="Redis" version="7.2.4" method="probed" conf="10">
          <cpe>cpe:/a:redis:redis:7.2.4</cpe>
        </service>
      </port>
      <port protocol="tcp" portid="8080">
        <state state="open" reason="syn-ack"/>
        <service name="http" product="Bench test server" method="probed" conf="8"/>
      </port>
      <port protocol="tcp" portid="8081">
        <state state="closed" reason="conn-refused"/>
        <service name="http"/>
      </port>
    </ports>
    <os>
      <osmatch name="Linux 6.8" accuracy="97">
        <osclass type="general purpose" vendor="Linux" osfamily="Linux" osgen="6.X" accuracy="97"/>
        <cpe>cpe:/o:linux:linux_kernel:6</cpe>
      </osmatch>
    </os>
  </host>
</nmaprun>"#;

    #[test]
    fn parses_only_open_tcp_services_and_normalizes_confidence() {
        let document = parse_nmap_xml(FINGERPRINT_XML.as_bytes()).unwrap();
        let services = document
            .hosts
            .iter()
            .flat_map(|host| host.ports.iter().flat_map(|ports| ports.ports.iter()))
            .filter(|port| port.state.state == "open" && port.protocol == "tcp")
            .filter_map(map_service)
            .collect::<Vec<_>>();

        assert_eq!(services.len(), 2);
        assert_eq!(services[0].port, 6379);
        assert_eq!(services[0].confidence, Some(100));
        assert_eq!(services[0].cpe, ["cpe:/a:redis:redis:7.2.4"]);
        assert_eq!(services[0].risk_tags, ["database-service"]);
        assert!(services[1].risk_tags.is_empty());
    }

    #[test]
    fn maps_os_matches_as_guesses_with_bounded_accuracy() {
        let document = parse_nmap_xml(FINGERPRINT_XML.as_bytes()).unwrap();
        let os_match = &document.hosts[0].os.as_ref().unwrap().matches[0];
        let mapped = map_os_match(os_match);

        assert_eq!(mapped.name, "Linux 6.8");
        assert_eq!(mapped.accuracy, 97);
        assert!(mapped.classes[0].contains("Linux"));
        assert_eq!(mapped.cpe, ["cpe:/o:linux:linux_kernel:6"]);
    }

    #[test]
    fn service_detection_uses_low_intensity_xml_without_scripts() {
        let args = service_scan_args("127.0.0.1", "80,443");
        assert!(args.iter().any(|arg| arg == "--version-light"));
        assert!(args.windows(2).any(|pair| pair == ["-oX", "-"]));
        assert!(!args.iter().any(|arg| arg == "-sC" || arg == "-A"));
        assert!(!args.iter().any(|arg| arg.starts_with("--script")));
    }

    #[test]
    fn command_hint_matches_the_requested_scans() {
        let service_only = command_hint("127.0.0.1", "8080", false);
        assert!(service_only.contains("-sV --version-light"));
        assert!(!service_only.contains('\n'));

        let with_os = command_hint("127.0.0.1", "8080", true);
        assert!(with_os.contains("\nnmap -Pn -n -O --osscan-limit"));
    }

    #[test]
    fn flags_sensitive_services_without_asserting_a_vulnerability() {
        assert_eq!(classify_service_risks("telnet"), ["cleartext-protocol"]);
        assert_eq!(classify_service_risks("rdp"), ["remote-admin-service"]);
        assert_eq!(classify_service_risks("postgresql"), ["database-service"]);
        assert!(classify_service_risks("http").is_empty());
    }

    #[test]
    fn sanitizes_control_characters_and_caps_external_fields() {
        let value = format!("safe{}{}", '\u{0007}', "x".repeat(300));
        let cleaned = clean_string(&value, 128).unwrap();
        assert_eq!(cleaned.len(), 128);
        assert!(!cleaned.chars().any(char::is_control));
    }

    #[test]
    fn accepts_single_ip_or_dns_host_and_rejects_nmap_target_ranges() {
        assert!(validate_single_host("127.0.0.1").is_ok());
        assert!(validate_single_host("::1").is_ok());
        assert!(validate_single_host("bench-gateway.local").is_ok());
        assert!(validate_single_host("bench-gateway-1.example.test").is_ok());
        assert!(validate_single_host("192.168.1.1-20").is_err());
        assert!(validate_single_host("192.168.0-255.1").is_err());
        assert!(validate_single_host("192.168.1.0/24").is_err());
        assert!(validate_single_host("host-a,host-b").is_err());
    }
}
