//! mDNS / DNS-SD browse + SSDP/UPnP discovery (read-only) — S-DIS-02.

use super::types::{LanServiceFailure, LanServiceItem, LanServicesResult};
use crate::error::{AppError, AppResult};
use mdns_sd::{DaemonEvent, Receiver, ServiceDaemon, ServiceEvent};
use std::collections::{BTreeMap, BTreeSet};
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::time::{sleep, timeout_at, Instant as TokioInstant};

const MDNS_ENUMERATION_TYPE: &str = "_services._dns-sd._udp.local.";
const MDNS_ENUMERATION_WINDOW: Duration = Duration::from_millis(1200);
const MDNS_SERVICE_WINDOW: Duration = Duration::from_millis(1800);
const MDNS_POLL_INTERVAL: Duration = Duration::from_millis(20);
const MAX_DISCOVERED_SERVICE_TYPES: usize = 64;
const MAX_MDNS_SERVICES: usize = 100;
const MAX_SSDP_SERVICES: usize = 100;
const MAX_LAN_SERVICE_ITEMS: usize = MAX_MDNS_SERVICES + MAX_SSDP_SERVICES;
const MAX_TXT_PROPERTIES: usize = 8;
const MAX_MDNS_ADDRESSES: usize = 8;
const MAX_TXT_PROPERTY_CHARS: usize = 160;
const MAX_SSDP_PACKET_BYTES: usize = 2048;
const MAX_SSDP_HEADERS: usize = 32;
const MAX_SSDP_HEADER_CHARS: usize = 512;
const MAX_SSDP_LABEL_CHARS: usize = 180;
static LAN_SERVICE_SCAN_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub async fn browse_lan_services() -> AppResult<LanServicesResult> {
    // Avoid overlapping multicast daemons and duplicate packets when IPC is invoked twice.
    let _scan_guard = LAN_SERVICE_SCAN_LOCK.lock().await;
    let started = Instant::now();
    let command_hint = "browseLanServices(local) // DNS-SD + SSDP M-SEARCH (read-only)".to_string();

    let mut items = Vec::new();
    let mut failures = Vec::new();
    let mut seen = BTreeSet::new();
    let mut truncated = false;

    let (mdns_result, ssdp_result) = tokio::join!(browse_mdns(), browse_ssdp());

    match mdns_result {
        Ok((list, mdns_truncated)) => {
            truncated |= mdns_truncated;
            for it in list {
                if items.len() == MAX_LAN_SERVICE_ITEMS {
                    truncated = true;
                    break;
                }
                if seen.insert(service_dedupe_key(&it)) {
                    items.push(it);
                }
            }
        }
        Err(e) => failures.push(LanServiceFailure {
            protocol: "mdns".into(),
            code: e.code,
            message: e.message,
        }),
    }

    match ssdp_result {
        Ok((list, ssdp_truncated)) => {
            truncated |= ssdp_truncated;
            for it in list {
                if items.len() == MAX_LAN_SERVICE_ITEMS {
                    truncated = true;
                    break;
                }
                if seen.insert(service_dedupe_key(&it)) {
                    items.push(it);
                }
            }
        }
        Err(e) => failures.push(LanServiceFailure {
            protocol: "ssdp".into(),
            code: e.code,
            message: e.message,
        }),
    }

    Ok(LanServicesResult {
        items,
        failures,
        truncated,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

async fn browse_mdns() -> AppResult<(Vec<LanServiceItem>, bool)> {
    let mut session = MdnsSession::new()?;
    let daemon = &session.daemon;
    let monitor = daemon
        .monitor()
        .map_err(|e| AppError::new("MDNS_BIND", e.to_string()))?;
    let enumeration = daemon
        .browse(MDNS_ENUMERATION_TYPE)
        .map_err(|e| AppError::new("MDNS_SEND", e.to_string()))?;

    // The meta-query advertises actual service types as PTR targets. Browse each
    // returned type through mdns-sd so it resolves SRV, TXT and address records.
    let mut service_types = BTreeMap::<String, String>::new();
    let mut truncated = false;
    let enumeration_deadline = TokioInstant::now() + MDNS_ENUMERATION_WINDOW;
    while TokioInstant::now() < enumeration_deadline {
        check_mdns_monitor(&monitor)?;
        match timeout_at(enumeration_deadline, enumeration.recv_async()).await {
            Ok(Ok(ServiceEvent::ServiceFound(_, fullname))) => {
                if is_dns_sd_service_type(&fullname) {
                    let key = fullname.to_ascii_lowercase();
                    if service_types.contains_key(&key) {
                        continue;
                    }
                    if service_types.len() >= MAX_DISCOVERED_SERVICE_TYPES {
                        truncated = true;
                        break;
                    }
                    service_types.insert(key, fullname);
                }
            }
            Ok(Ok(_)) => {}
            Ok(Err(error)) => return Err(AppError::new("MDNS_RUNTIME", error.to_string())),
            Err(_) => break,
        }
    }

    let mut browses = BTreeMap::<String, Receiver<ServiceEvent>>::new();
    for (key, service_type) in &service_types {
        let receiver = daemon
            .browse(service_type)
            .map_err(|e| AppError::new("MDNS_SEND", e.to_string()))?;
        browses.insert(key.clone(), receiver);
    }

    let service_deadline = TokioInstant::now() + MDNS_SERVICE_WINDOW;
    let mut services = BTreeMap::<String, LanServiceItem>::new();
    let mut service_limit_reached = false;
    while TokioInstant::now() < service_deadline
        && services.len() <= MAX_MDNS_SERVICES
        && !service_limit_reached
    {
        check_mdns_monitor(&monitor)?;

        for receiver in browses.values_mut() {
            for _ in 0..32 {
                match receiver.try_recv() {
                    Ok(ServiceEvent::ServiceResolved(service)) => {
                        let key = format!(
                            "{}|{}",
                            service.ty_domain.to_ascii_lowercase(),
                            service.fullname.to_ascii_lowercase()
                        );
                        if services.contains_key(&key) {
                            continue;
                        }
                        let (item, details_truncated) = service_to_item(*service);
                        truncated |= details_truncated;
                        let Some(item) = item else {
                            continue;
                        };
                        if services.len() == MAX_MDNS_SERVICES {
                            truncated = true;
                            service_limit_reached = true;
                            break;
                        }
                        services.insert(key, item);
                    }
                    Ok(_) => {}
                    Err(_) => break,
                }
            }
            if service_limit_reached {
                break;
            }
        }

        if !service_limit_reached {
            sleep(MDNS_POLL_INTERVAL).await;
        }
    }
    check_mdns_monitor(&monitor)?;

    // A bounded shutdown avoids leaving a daemon thread/socket behind for every scan.
    session.shutdown().await;

    Ok((services.into_values().collect(), truncated))
}

struct MdnsSession {
    daemon: ServiceDaemon,
    shutdown_requested: bool,
}

impl MdnsSession {
    fn new() -> AppResult<Self> {
        let daemon = ServiceDaemon::new().map_err(|e| AppError::new("MDNS_BIND", e.to_string()))?;
        Ok(Self {
            daemon,
            shutdown_requested: false,
        })
    }

    async fn shutdown(&mut self) {
        if self.shutdown_requested {
            return;
        }

        if let Ok(status) = self.daemon.shutdown() {
            self.shutdown_requested = true;
            let _ = timeout_at(
                TokioInstant::now() + Duration::from_millis(500),
                status.recv_async(),
            )
            .await;
        }
    }
}

impl Drop for MdnsSession {
    fn drop(&mut self) {
        if !self.shutdown_requested {
            let _ = self.daemon.shutdown();
        }
    }
}

async fn browse_ssdp() -> AppResult<(Vec<LanServiceItem>, bool)> {
    let sock = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| AppError::new("SSDP_BIND", e.to_string()))?;
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
        .map_err(|e| AppError::new("SSDP_SEND", e.to_string()))?;

    let mut out = Vec::new();
    let deadline = TokioInstant::now() + Duration::from_millis(2000);
    let mut buf = [0u8; MAX_SSDP_PACKET_BYTES];
    let mut seen = BTreeSet::new();
    let mut truncated = false;
    while TokioInstant::now() < deadline && out.len() <= MAX_SSDP_SERVICES {
        match timeout_at(deadline, sock.recv_from(&mut buf)).await {
            Ok(Ok((n, from))) => {
                if n == MAX_SSDP_PACKET_BYTES {
                    truncated = true;
                    continue;
                }
                let (parsed_item, details_truncated) = parse_ssdp_response(&buf[..n], from);
                truncated |= details_truncated;
                let Some(item) = parsed_item else {
                    continue;
                };
                let dedupe_key = service_dedupe_key(&item);
                if !seen.insert(dedupe_key) {
                    continue;
                }
                if out.len() == MAX_SSDP_SERVICES {
                    truncated = true;
                    break;
                }
                out.push(item);
            }
            _ => break,
        }
    }
    Ok((out, truncated))
}

fn check_mdns_monitor(monitor: &Receiver<DaemonEvent>) -> AppResult<()> {
    for _ in 0..128 {
        match monitor.try_recv() {
            Ok(DaemonEvent::Error(error)) => {
                return Err(AppError::new("MDNS_RUNTIME", error.to_string()));
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    Ok(())
}

fn is_dns_sd_service_type(name: &str) -> bool {
    if !name.is_ascii() || name.len() > 255 {
        return false;
    }

    ["._tcp.local.", "._udp.local."].iter().any(|suffix| {
        name.get(name.len().saturating_sub(suffix.len())..)
            .is_some_and(|candidate| candidate.eq_ignore_ascii_case(suffix))
            && name
                .get(..name.len() - suffix.len())
                .is_some_and(|service_label| {
                    service_label.starts_with('_')
                        && service_label.len() > 1
                        && !service_label[1..].contains('.')
                })
    })
}

fn is_loopback_interface_name(name: &str) -> bool {
    let normalized = name.to_ascii_lowercase();
    normalized == "lo"
        || normalized == "lo0"
        || normalized.starts_with("loopback")
        || normalized.starts_with("software loopback")
}

fn is_loopback_address(address: &mdns_sd::ScopedIp) -> bool {
    if address.is_loopback() {
        return true;
    }

    match address {
        mdns_sd::ScopedIp::V4(address) => {
            let interfaces = address.interface_ids();
            !interfaces.is_empty()
                && interfaces
                    .iter()
                    .all(|interface| is_loopback_interface_name(&interface.name))
        }
        mdns_sd::ScopedIp::V6(address) => is_loopback_interface_name(&address.scope_id().name),
        _ => false,
    }
}

fn parse_ssdp_response(packet: &[u8], from: SocketAddr) -> (Option<LanServiceItem>, bool) {
    let mut headers = [httparse::EMPTY_HEADER; MAX_SSDP_HEADERS];
    let mut response = httparse::Response::new(&mut headers);
    let mut truncated = false;
    match response.parse(packet) {
        Ok(httparse::Status::Complete(_)) => {}
        Ok(httparse::Status::Partial) => return (None, false),
        Err(httparse::Error::TooManyHeaders) => return (None, true),
        Err(_) => return (None, false),
    }
    if response.code != Some(200) {
        return (None, false);
    }

    let get = |key: &str| -> (Option<String>, bool) {
        let Some(header) = response
            .headers
            .iter()
            .find(|header| header.name.eq_ignore_ascii_case(key))
        else {
            return (None, false);
        };
        let Ok(value) = std::str::from_utf8(header.value) else {
            return (None, false);
        };
        let cleaned: String = value
            .chars()
            .filter(|character| !character.is_control())
            .collect();
        let (cleaned, was_truncated) = truncate_with_flag(&cleaned, MAX_SSDP_HEADER_CHARS);
        let cleaned = cleaned.trim().to_string();
        ((!cleaned.is_empty()).then_some(cleaned), was_truncated)
    };

    // An SSDP response without its required search target and unique service
    // name is not a discovered service. Ignore malformed or unrelated packets.
    let (service_type, st_truncated) = get("ST");
    let (usn, usn_truncated) = get("USN");
    truncated |= st_truncated || usn_truncated;
    let (Some(service_type), Some(usn)) = (service_type, usn) else {
        return (None, truncated);
    };
    let (server, server_truncated) = get("SERVER");
    let (location, location_truncated) = get("LOCATION");
    truncated |= server_truncated || location_truncated;
    let server = server.unwrap_or_else(|| from.ip().to_string());
    let (name, name_truncated) = truncate_with_flag(&server, MAX_SSDP_LABEL_CHARS);
    let (service_type, type_truncated) = truncate_with_flag(&service_type, MAX_SSDP_LABEL_CHARS);
    let (usn, usn_field_truncated) = truncate_with_flag(&usn, MAX_SSDP_HEADER_CHARS);
    truncated |= name_truncated || type_truncated || usn_field_truncated;
    let item = LanServiceItem {
        protocol: "ssdp".into(),
        name,
        service_type: Some(service_type),
        host: Some(from.ip().to_string()),
        port: Some(from.port()),
        txt_properties: Vec::new(),
        addresses: Vec::new(),
        usn: Some(usn),
        location,
    };
    (Some(item), truncated)
}

fn service_to_item(service: mdns_sd::ResolvedService) -> (Option<LanServiceItem>, bool) {
    let suffix = service.ty_domain.as_str();
    let name = service_name(&service.fullname, suffix);

    let mut addresses: Vec<_> = service
        .addresses
        .iter()
        .filter(|address| !is_loopback_address(address))
        .map(ToString::to_string)
        .collect();
    addresses.sort();
    let mut truncated = addresses.len() > MAX_MDNS_ADDRESSES;
    addresses.truncate(MAX_MDNS_ADDRESSES);
    if addresses.is_empty() {
        return (None, truncated);
    }

    truncated |= service.txt_properties.len() > MAX_TXT_PROPERTIES;
    let txt_properties = service
        .txt_properties
        .iter()
        .take(MAX_TXT_PROPERTIES)
        .map(|property| {
            let (value, was_truncated) =
                truncate_with_flag(&property.to_string(), MAX_TXT_PROPERTY_CHARS);
            truncated |= was_truncated;
            value
        })
        .collect();

    (
        Some(LanServiceItem {
            protocol: "mdns".into(),
            name,
            service_type: Some(service.ty_domain),
            host: Some(service.host),
            port: Some(service.port),
            txt_properties,
            addresses,
            usn: None,
            location: None,
        }),
        truncated,
    )
}

fn service_name(fullname: &str, service_type: &str) -> String {
    if fullname.len() >= service_type.len() {
        let prefix_len = fullname.len() - service_type.len();
        if let (Some(prefix), Some(suffix)) =
            (fullname.get(..prefix_len), fullname.get(prefix_len..))
        {
            if suffix.eq_ignore_ascii_case(service_type) {
                return prefix.trim_end_matches('.').to_string();
            }
        }
    }

    fullname.to_string()
}

fn service_dedupe_key(item: &LanServiceItem) -> String {
    if item.protocol == "ssdp" {
        if let Some(usn) = &item.usn {
            return format!("ssdp|{}", usn.to_ascii_lowercase());
        }
        return format!(
            "ssdp|{}|{}|{}",
            item.host
                .as_deref()
                .unwrap_or_default()
                .to_ascii_lowercase(),
            item.service_type
                .as_deref()
                .unwrap_or_default()
                .to_ascii_lowercase(),
            item.name.to_ascii_lowercase()
        );
    }

    format!(
        "{}|{}|{}",
        item.protocol.to_ascii_lowercase(),
        item.service_type
            .as_deref()
            .unwrap_or_default()
            .to_ascii_lowercase(),
        item.name.to_ascii_lowercase()
    )
}

fn truncate_with_flag(s: &str, n: usize) -> (String, bool) {
    let mut chars = s.chars();
    let t: String = chars.by_ref().take(n).collect();
    (t.replace('\n', " "), chars.next().is_some())
}

#[cfg(test)]
mod tests {
    use super::{
        is_dns_sd_service_type, is_loopback_address, is_loopback_interface_name,
        parse_ssdp_response, service_dedupe_key, truncate_with_flag,
    };
    use crate::net_probe::types::LanServiceItem;
    use mdns_sd::{InterfaceId, ScopedIp, ScopedIpV4};
    use std::net::{IpAddr, Ipv4Addr, SocketAddr};

    const ROOT_DEVICE_USN: &str = concat!("uuid:device-a:", ":upnp:rootdevice");

    #[test]
    fn accepts_enumerated_tcp_and_udp_service_types() {
        assert!(is_dns_sd_service_type("_http._tcp.local."));
        assert!(is_dns_sd_service_type("_ipp._tcp.local."));
        assert!(is_dns_sd_service_type("_custom._udp.local."));
        assert!(is_dns_sd_service_type("_HTTP._TCP.LOCAL."));
    }

    #[test]
    fn rejects_meta_root_and_service_instance_names() {
        assert!(!is_dns_sd_service_type("_services._dns-sd._udp.local."));
        assert!(!is_dns_sd_service_type("My Printer._ipp._tcp.local."));
        assert!(!is_dns_sd_service_type("_http._tcp.example.com."));
        assert!(!is_dns_sd_service_type(
            "_http._tcp.local.".repeat(30).as_str()
        ));
    }

    #[test]
    fn filters_loopback_addresses_and_loopback_interfaces() {
        let loopback_ip = ScopedIp::from(IpAddr::V4(Ipv4Addr::LOCALHOST));
        let loopback_interface = ScopedIp::V4(ScopedIpV4::new(
            Ipv4Addr::new(192, 168, 1, 20),
            InterfaceId {
                name: "lo0".into(),
                index: 1,
            },
        ));
        let lan_interface = ScopedIp::V4(ScopedIpV4::new(
            Ipv4Addr::new(192, 168, 1, 20),
            InterfaceId {
                name: "en0".into(),
                index: 4,
            },
        ));

        assert!(is_loopback_address(&loopback_ip));
        assert!(is_loopback_address(&loopback_interface));
        assert!(!is_loopback_address(&lan_interface));
        assert!(is_loopback_interface_name("lo0"));
        assert!(is_loopback_interface_name("lo"));
        assert!(is_loopback_interface_name("Software Loopback Interface 1"));
        assert!(!is_loopback_interface_name("en0"));
    }

    #[test]
    fn ssdp_dedupe_prefers_uuid_usn() {
        let first = LanServiceItem {
            protocol: "ssdp".into(),
            name: "Device A".into(),
            service_type: Some("upnp:rootdevice".into()),
            host: Some("192.168.1.2".into()),
            port: Some(1900),
            txt_properties: Vec::new(),
            addresses: Vec::new(),
            usn: Some(ROOT_DEVICE_USN.into()),
            location: Some("http://192.168.1.2/desc.xml".into()),
        };
        let mut duplicate = first.clone();
        duplicate.location = Some("http://192.168.1.2/other.xml".into());

        assert_eq!(service_dedupe_key(&first), service_dedupe_key(&duplicate));
    }

    #[test]
    fn ssdp_parser_accepts_only_success_responses_with_identity_and_uses_peer_port() {
        let peer = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 2)), 49152);
        let packet = format!(
            "HTTP/1.1 200 OK\r\nST: upnp:rootdevice\r\nUSN: {ROOT_DEVICE_USN}\r\nSERVER: Vendor/1.0\r\nLOCATION: http://192.168.1.2:1400/root.xml\r\n\r\n"
        );

        let (service, truncated) = parse_ssdp_response(packet.as_bytes(), peer);
        let service = service.expect("valid SSDP response");
        assert!(!truncated);
        assert_eq!(service.protocol, "ssdp");
        assert_eq!(service.service_type.as_deref(), Some("upnp:rootdevice"));
        assert_eq!(service.host.as_deref(), Some("192.168.1.2"));
        assert_eq!(service.port, Some(49152));
        assert_eq!(service.usn.as_deref(), Some(ROOT_DEVICE_USN));
        assert_eq!(
            service.location.as_deref(),
            Some("http://192.168.1.2:1400/root.xml")
        );
    }

    #[test]
    fn ssdp_parser_ignores_non_success_and_missing_identity_responses() {
        let peer = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 1900);
        assert!(parse_ssdp_response(
            b"HTTP/1.1 404 Not Found\r\nST: upnp:rootdevice\r\nUSN: uuid:device-a\r\n\r\n",
            peer
        )
        .0
        .is_none());
        assert!(
            parse_ssdp_response(b"HTTP/1.1 200 OK\r\nSERVER: Vendor/1.0\r\n\r\n", peer)
                .0
                .is_none()
        );
    }

    #[test]
    fn ssdp_parser_reports_truncated_visible_headers() {
        let peer = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 2)), 49152);
        let long_type = "x".repeat(600);
        let packet = format!(
            "HTTP/1.1 200 OK\r\nST: {long_type}\r\nUSN: uuid:device-a\r\nSERVER: Vendor/1.0\r\n\r\n"
        );

        let (service, truncated) = parse_ssdp_response(packet.as_bytes(), peer);
        let service = service.expect("valid SSDP response");
        assert!(truncated);
        assert_eq!(service.service_type.as_deref().unwrap().len(), 180);
    }

    #[test]
    fn bounded_text_reports_truncation_without_splitting_unicode() {
        assert_eq!(truncate_with_flag("abcd", 4), ("abcd".into(), false));
        assert_eq!(truncate_with_flag("中文a", 2), ("中文".into(), true));
    }
}
