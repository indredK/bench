//! mDNS / DNS-SD browse + SSDP/UPnP discovery (read-only) — S-DIS-02.

use super::types::{
    LanServiceItem, LanServicesProgressEvent, LanServicesProgressPhase, LanServicesResult,
    ScanSessionEvent,
};
use crate::error::{AppError, AppResult};
use mdns_sd::{Error as MdnsError, Receiver, ServiceDaemon, ServiceEvent};
use std::collections::{BTreeMap, BTreeSet};
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::net::UdpSocket;
use tokio::time::timeout_at;

const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";
const LAN_SERVICES_PROGRESS_EVENT: &str = "network-probe:lan-services-progress";
const MDNS_META_SERVICE_TYPE: &str = "_services._dns-sd._udp.local.";
const MDNS_WINDOW: Duration = Duration::from_millis(1_200);
const SSDP_WINDOW: Duration = Duration::from_millis(2_000);
const CANCEL_POLL_INTERVAL: Duration = Duration::from_millis(40);
const MAX_SERVICE_TYPES: usize = 64;
const MAX_SERVICES: usize = 256;
const MAX_DETAIL_CHARS: usize = 2_048;

struct ScanSessionGuard(String);

impl Drop for ScanSessionGuard {
    fn drop(&mut self) {
        super::session::clear_session(&self.0);
    }
}

struct MdnsDaemonGuard {
    daemon: ServiceDaemon,
    shutdown_requested: bool,
}

impl MdnsDaemonGuard {
    fn new(daemon: ServiceDaemon) -> Self {
        Self {
            daemon,
            shutdown_requested: false,
        }
    }

    fn daemon(&self) -> &ServiceDaemon {
        &self.daemon
    }

    async fn shutdown(&mut self) {
        self.shutdown_requested = shutdown_mdns(&self.daemon).await;
    }
}

impl Drop for MdnsDaemonGuard {
    fn drop(&mut self) {
        if self.shutdown_requested {
            return;
        }

        // ServiceDaemon owns a detached worker thread and dropping its handle
        // does not stop that thread. Queue Exit if this async command is aborted
        // or unwinds before reaching the normal shutdown path.
        for _ in 0..10 {
            match self.daemon.shutdown() {
                Ok(_) | Err(MdnsError::DaemonShutdown) => return,
                Err(MdnsError::Again) => std::thread::sleep(Duration::from_millis(1)),
                Err(_) => return,
            }
        }
    }
}

pub async fn browse_lan_services<R: Runtime>(
    app: Option<&AppHandle<R>>,
) -> AppResult<LanServicesResult> {
    let started = Instant::now();
    let (session_id, abort) = super::session::new_session_with_abort_token();
    let _session_guard = ScanSessionGuard(session_id.clone());
    let command_hint =
        format!("browseLanServices(local) // mDNS + SSDP (read-only); sessionId={session_id}");

    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "lanServices".into(),
            },
        );
    }

    let mut items = Vec::new();
    let mut seen = BTreeSet::new();
    emit_progress(app, &session_id, LanServicesProgressPhase::Preparing, 0);

    if !abort.load(Ordering::SeqCst) {
        emit_progress(app, &session_id, LanServicesProgressPhase::Mdns, 0);
        match browse_mdns(&abort, app, &session_id, &mut seen, &mut items).await {
            Ok(()) => {}
            Err(error) if !abort.load(Ordering::SeqCst) => {
                items.push(protocol_error("mdns", error));
            }
            Err(_) => {}
        }
    }

    if !abort.load(Ordering::SeqCst) && items.len() < MAX_SERVICES {
        emit_progress(app, &session_id, LanServicesProgressPhase::Ssdp, seen.len());
        match browse_ssdp(&abort, app, &session_id, &mut seen, &mut items).await {
            Ok(()) => {}
            Err(error) if !abort.load(Ordering::SeqCst) => {
                items.push(protocol_error("ssdp", error));
            }
            Err(_) => {}
        }
    }

    let cancelled = abort.load(Ordering::SeqCst);
    Ok(LanServicesResult {
        items,
        cancelled,
        session_id,
        message: Some(if cancelled {
            "Read-only discovery cancelled; completed results are retained.".into()
        } else {
            "Read-only discovery. No UPnP Write / AddPortMapping actions are exposed.".into()
        }),
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

fn emit_progress<R: Runtime>(
    app: Option<&AppHandle<R>>,
    session_id: &str,
    phase: LanServicesProgressPhase,
    discovered_services: usize,
) {
    if let Some(app) = app {
        let _ = app.emit(
            LAN_SERVICES_PROGRESS_EVENT,
            &LanServicesProgressEvent {
                session_id: session_id.to_string(),
                phase,
                discovered_services,
            },
        );
    }
}

async fn browse_mdns<R: Runtime>(
    abort: &AtomicBool,
    app: Option<&AppHandle<R>>,
    session_id: &str,
    seen: &mut BTreeSet<String>,
    items: &mut Vec<LanServiceItem>,
) -> AppResult<()> {
    let daemon =
        ServiceDaemon::new().map_err(|error| AppError::new("MDNS_START", error.to_string()))?;
    let mut daemon = MdnsDaemonGuard::new(daemon);
    let meta_receiver = match daemon.daemon().browse(MDNS_META_SERVICE_TYPE) {
        Ok(receiver) => receiver,
        Err(error) => {
            daemon.shutdown().await;
            return Err(AppError::new("MDNS_BROWSE", error.to_string()));
        }
    };

    let mut receivers: BTreeMap<String, Receiver<ServiceEvent>> = BTreeMap::new();
    let mut service_types = BTreeSet::new();
    let deadline = tokio::time::Instant::now() + MDNS_WINDOW;

    while tokio::time::Instant::now() < deadline
        && !abort.load(Ordering::SeqCst)
        && items.len() < MAX_SERVICES
    {
        while let Ok(event) = meta_receiver.try_recv() {
            if let ServiceEvent::ServiceFound(service_type, _) = event {
                if !service_types.contains(&service_type) && service_types.len() < MAX_SERVICE_TYPES
                {
                    match browse_mdns_type(daemon.daemon(), &service_type, abort, deadline).await {
                        Ok(Some(receiver)) => {
                            service_types.insert(service_type.clone());
                            receivers.insert(service_type, receiver);
                        }
                        Ok(None) => break,
                        Err(error) => {
                            daemon.shutdown().await;
                            return Err(error);
                        }
                    }
                }
            }
        }

        for receiver in receivers.values() {
            while let Ok(event) = receiver.try_recv() {
                if let ServiceEvent::ServiceResolved(service) = event {
                    let key = format!("mdns|{}", service.fullname.to_ascii_lowercase());
                    if seen.insert(key) {
                        items.push(mdns_service_item(&service));
                        emit_progress(app, session_id, LanServicesProgressPhase::Mdns, seen.len());
                    }
                    if items.len() >= MAX_SERVICES {
                        break;
                    }
                }
            }
        }

        tokio::time::sleep(CANCEL_POLL_INTERVAL).await;
    }

    daemon.shutdown().await;
    Ok(())
}

async fn browse_mdns_type(
    daemon: &ServiceDaemon,
    service_type: &str,
    abort: &AtomicBool,
    deadline: tokio::time::Instant,
) -> AppResult<Option<Receiver<ServiceEvent>>> {
    loop {
        if abort.load(Ordering::SeqCst) || tokio::time::Instant::now() >= deadline {
            return Ok(None);
        }
        match daemon.browse(service_type) {
            Ok(receiver) => return Ok(Some(receiver)),
            Err(MdnsError::Again) => {
                tokio::time::sleep(CANCEL_POLL_INTERVAL.min(Duration::from_millis(10))).await;
            }
            Err(error) => return Err(AppError::new("MDNS_BROWSE", error.to_string())),
        }
    }
}

async fn shutdown_mdns(daemon: &ServiceDaemon) -> bool {
    for _ in 0..10 {
        match daemon.shutdown() {
            Ok(receiver) => {
                let _ =
                    tokio::time::timeout(Duration::from_millis(250), receiver.recv_async()).await;
                return true;
            }
            Err(MdnsError::Again) => {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            Err(MdnsError::DaemonShutdown) => return true,
            Err(_) => return false,
        }
    }
    false
}

fn mdns_service_item(service: &mdns_sd::ResolvedService) -> LanServiceItem {
    let mut properties = service
        .get_properties()
        .iter()
        .take(24)
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(", ");
    if service.get_properties().len() > 24 {
        properties.push_str(", …");
    }
    let detail = if properties.is_empty() {
        format!("host={}", service.get_hostname())
    } else {
        format!("host={} · TXT={properties}", service.get_hostname())
    };

    LanServiceItem {
        protocol: "mdns".into(),
        name: mdns_display_name(service.get_fullname(), &service.ty_domain),
        service_type: Some(service.ty_domain.clone()),
        host: Some(service.get_hostname().trim_end_matches('.').to_string()),
        port: Some(service.get_port()),
        detail: truncate(&detail, MAX_DETAIL_CHARS),
    }
}

fn mdns_display_name(fullname: &str, service_type: &str) -> String {
    fullname
        .strip_suffix(service_type)
        .unwrap_or(fullname)
        .trim_end_matches('.')
        .to_string()
}

async fn browse_ssdp<R: Runtime>(
    abort: &AtomicBool,
    app: Option<&AppHandle<R>>,
    session_id: &str,
    seen: &mut BTreeSet<String>,
    items: &mut Vec<LanServiceItem>,
) -> AppResult<()> {
    let sock = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|error| AppError::new("SSDP_BIND", error.to_string()))?;
    sock.set_broadcast(true)
        .map_err(|error| AppError::new("SSDP_BROADCAST", error.to_string()))?;
    let payload = concat!(
        "M-SEARCH * HTTP/1.1\r\n",
        "HOST: 239.255.255.250:1900\r\n",
        "MAN: \"ssdp:discover\"\r\n",
        "MX: 2\r\n",
        "ST: ssdp:all\r\n",
        "\r\n"
    );
    let dest = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::new(239, 255, 255, 250), 1900));
    sock.send_to(payload.as_bytes(), dest)
        .await
        .map_err(|error| AppError::new("SSDP_SEND", error.to_string()))?;

    let deadline = tokio::time::Instant::now() + SSDP_WINDOW;
    let mut buf = [0u8; 4_096];
    while tokio::time::Instant::now() < deadline
        && !abort.load(Ordering::SeqCst)
        && items.len() < MAX_SERVICES
    {
        let receive_deadline = (tokio::time::Instant::now() + CANCEL_POLL_INTERVAL).min(deadline);
        match timeout_at(receive_deadline, sock.recv_from(&mut buf)).await {
            Ok(Ok((size, responder))) => {
                let response = String::from_utf8_lossy(&buf[..size]);
                if let Some((key, item)) = parse_ssdp_response(&response, responder) {
                    if seen.insert(key) {
                        items.push(item);
                        emit_progress(app, session_id, LanServicesProgressPhase::Ssdp, seen.len());
                    }
                }
            }
            Ok(Err(error)) => return Err(AppError::new("SSDP_RECEIVE", error.to_string())),
            Err(_) => {}
        }
    }
    Ok(())
}

fn parse_ssdp_response(response: &str, responder: SocketAddr) -> Option<(String, LanServiceItem)> {
    let mut status_parts = response.lines().next()?.split_ascii_whitespace();
    if !matches!(status_parts.next(), Some("HTTP/1.0" | "HTTP/1.1"))
        || status_parts.next() != Some("200")
    {
        return None;
    }
    let st = header_value(response, "ST");
    let usn = header_value(response, "USN");
    let location = header_value(response, "LOCATION");
    if st.is_none() && usn.is_none() && location.is_none() {
        return None;
    }
    let st = st.unwrap_or_else(|| "ssdp:all".into());
    let usn = usn.unwrap_or_default();
    let server = header_value(response, "SERVER").unwrap_or_else(|| responder.ip().to_string());
    let location = location.unwrap_or_default();
    let key = if usn.is_empty() {
        format!("ssdp|{}|{st}|{location}", responder.ip())
    } else {
        format!("ssdp|{}", usn.to_ascii_lowercase())
    };
    let detail = match (usn.is_empty(), location.is_empty()) {
        (false, false) => format!("USN={usn}; LOCATION={location} (display only)"),
        (false, true) => format!("USN={usn}; no LOCATION"),
        (true, false) => format!("LOCATION={location} (display only)"),
        (true, true) => "no USN or LOCATION".into(),
    };
    Some((
        key,
        LanServiceItem {
            protocol: "ssdp".into(),
            name: truncate(&server, 256),
            service_type: Some(truncate(&st, 256)),
            host: Some(responder.ip().to_string()),
            port: Some(responder.port()),
            detail: truncate(&detail, MAX_DETAIL_CHARS),
        },
    ))
}

fn protocol_error(protocol: &str, error: AppError) -> LanServiceItem {
    LanServiceItem {
        protocol: protocol.into(),
        name: format!("({protocol} error)"),
        service_type: None,
        host: None,
        port: None,
        detail: error.to_string(),
    }
}

fn header_value(message: &str, key: &str) -> Option<String> {
    message.lines().find_map(|line| {
        let (header, value) = line.split_once(':')?;
        header
            .trim()
            .eq_ignore_ascii_case(key)
            .then(|| value.trim().to_string())
    })
}

fn truncate(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let truncated = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

#[cfg(test)]
mod tests {
    use super::{header_value, mdns_display_name, parse_ssdp_response};
    use std::net::{IpAddr, Ipv4Addr, SocketAddr};

    #[test]
    fn ssdp_headers_are_case_insensitive_and_deduplicate_by_usn() {
        let responder = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 8)), 1900);
        let response = concat!(
            "HTTP/1.1 200 OK\r\n",
            "sT: upnp:rootdevice\r\n",
            "uSn: uuid:device-1::upnp:rootdevice\r\n",
            "sErVeR: Test Device\r\n",
            "location: http://192.168.1.8:80/device.xml\r\n\r\n"
        );

        assert_eq!(
            header_value(response, "ST").as_deref(),
            Some("upnp:rootdevice")
        );
        let (first_key, first) = parse_ssdp_response(response, responder).unwrap();
        let (second_key, _) = parse_ssdp_response(response, responder).unwrap();
        assert_eq!(first_key, second_key);
        assert_eq!(first.name, "Test Device");
        assert_eq!(first.service_type.as_deref(), Some("upnp:rootdevice"));
        assert_eq!(first.host.as_deref(), Some("192.168.1.8"));
        assert!(first.detail.contains("display only"));
    }

    #[test]
    fn ssdp_fallback_identity_uses_responder_type_and_location() {
        let responder = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 9)), 1900);
        let first = parse_ssdp_response(
            "HTTP/1.1 200 OK\r\nST: urn:test\r\nLOCATION: http://192.168.1.9/info\r\n\r\n",
            responder,
        )
        .unwrap();
        let second = parse_ssdp_response(
            "HTTP/1.1 200 OK\r\nST: urn:other\r\nLOCATION: http://192.168.1.9/info\r\n\r\n",
            responder,
        )
        .unwrap();

        assert_ne!(first.0, second.0);
        assert_eq!(first.1.port, Some(1900));
    }

    #[test]
    fn ssdp_parser_ignores_non_success_datagrams() {
        let responder = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 9)), 1900);
        assert!(parse_ssdp_response("arbitrary UDP payload", responder).is_none());
        assert!(parse_ssdp_response("HTTP/1.1 500 Error\r\nST: urn:test\r\n", responder).is_none());
        assert!(
            parse_ssdp_response("HTTP/1.1 200 OK\r\nServer: unrelated\r\n", responder).is_none()
        );
    }

    #[test]
    fn mdns_display_name_removes_the_repeated_service_type() {
        assert_eq!(
            mdns_display_name("Office Printer._ipp._tcp.local.", "_ipp._tcp.local."),
            "Office Printer"
        );
    }
}
