//! mDNS / DNS-SD browse + SSDP/UPnP discovery (read-only) — S-DIS-02.

use super::types::{LanServiceIssue, LanServiceItem, LanServiceProtocol, LanServicesResult};
use crate::error::{AppError, AppResult};
use futures_util::{stream::select_all, StreamExt};
use mdns_sd::{DaemonEvent, ServiceDaemon, ServiceEvent};
use ssdp_client::{SearchResponse, SearchTarget};
use std::collections::{BTreeMap, BTreeSet};
use std::time::{Duration, Instant};
use tokio::time::{sleep_until, timeout, timeout_at, Instant as TokioInstant};
use url::Url;

const MDNS_ENUMERATION_TYPE: &str = "_services._dns-sd._udp.local.";
const MDNS_ENUMERATION_WINDOW: Duration = Duration::from_millis(450);
const MDNS_RESOLUTION_WINDOW: Duration = Duration::from_millis(1_600);
const SSDP_RESPONSE_WINDOW: Duration = Duration::from_millis(2_800);
const SSDP_ABSOLUTE_DEADLINE: Duration = Duration::from_secs(3);
const MAX_MDNS_SERVICE_TYPES: usize = 16;
const MAX_DISCOVERED_SERVICES: usize = 256;
const MAX_SSDP_RESPONSES: usize = 1_024;
const MAX_INVALID_SSDP_RESPONSES: usize = 32;
const MAX_TXT_PROPERTIES: usize = 8;
const MAX_TEXT_CHARS: usize = 160;
const MAX_LOCATION_CHARS: usize = 320;

#[derive(Default)]
struct DiscoveryOutcome {
    items: Vec<LanServiceItem>,
    issue_code: Option<String>,
}

pub async fn browse_lan_services() -> AppResult<LanServicesResult> {
    let started = Instant::now();
    let (mdns, ssdp) = tokio::join!(browse_mdns(), browse_ssdp());
    let mut items = Vec::with_capacity(mdns.items.len() + ssdp.items.len());
    let mut issues = Vec::new();

    if let Some(code) = mdns.issue_code {
        issues.push(LanServiceIssue {
            protocol: LanServiceProtocol::Mdns,
            code,
        });
    }
    if let Some(code) = ssdp.issue_code {
        issues.push(LanServiceIssue {
            protocol: LanServiceProtocol::Ssdp,
            code,
        });
    }

    let mut seen = BTreeSet::new();
    for item in mdns.items.into_iter().chain(ssdp.items) {
        let key = format!(
            "{}|{}|{}|{}",
            item.protocol.as_str(),
            item.service_type.as_deref().unwrap_or_default(),
            item.name,
            item.uuid.as_deref().unwrap_or_default()
        );
        if seen.insert(key) {
            items.push(item);
        }
    }

    Ok(LanServicesResult {
        items,
        issues,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
    })
}

async fn browse_mdns() -> DiscoveryOutcome {
    let mut outcome = DiscoveryOutcome::default();
    let mut daemon = match BrowseDaemon::new() {
        Ok(daemon) => daemon,
        Err(error) => {
            outcome.issue_code = Some(error.code);
            return outcome;
        }
    };
    let monitor = match daemon.daemon.monitor() {
        Ok(receiver) => receiver,
        Err(error) => {
            outcome.issue_code = Some("MDNS_MONITOR".into());
            daemon.shutdown().await;
            let _ = error;
            return outcome;
        }
    };
    let enumeration = match daemon.browse(MDNS_ENUMERATION_TYPE) {
        Ok(receiver) => receiver,
        Err(error) => {
            outcome.issue_code = Some(error.code);
            daemon.shutdown().await;
            return outcome;
        }
    };

    let enum_deadline = TokioInstant::now() + MDNS_ENUMERATION_WINDOW;
    let mut service_types = BTreeSet::new();
    loop {
        tokio::select! {
            _ = sleep_until(enum_deadline) => break,
            event = monitor.recv_async() => {
                match event {
                    Ok(DaemonEvent::Error(_)) => {
                        outcome.issue_code.get_or_insert_with(|| "MDNS_DAEMON".into());
                        break;
                    }
                    Ok(_) => {}
                    Err(_) => {
                        outcome.issue_code.get_or_insert_with(|| "MDNS_MONITOR".into());
                        break;
                    }
                }
            }
            event = enumeration.recv_async() => {
                match event {
                    Ok(ServiceEvent::ServiceFound(_, fullname))
                        if is_service_type(&fullname)
                            && fullname != MDNS_ENUMERATION_TYPE
                            && service_types.len() < MAX_MDNS_SERVICE_TYPES =>
                    {
                        service_types.insert(fullname);
                    }
                    Ok(ServiceEvent::SearchStopped(_)) | Err(_) => break,
                    Ok(_) => {}
                }
            }
        }
    }
    daemon.stop_browse(MDNS_ENUMERATION_TYPE);

    let mut streams = Vec::with_capacity(service_types.len());
    for service_type in service_types {
        match daemon.browse(&service_type) {
            Ok(receiver) => {
                let event_stream = receiver
                    .into_stream()
                    .map(move |event| (service_type.clone(), event))
                    .boxed();
                streams.push(event_stream);
            }
            Err(error) => {
                outcome.issue_code.get_or_insert(error.code);
            }
        }
    }

    let mut event_streams = select_all(streams);
    let deadline = TokioInstant::now() + MDNS_RESOLUTION_WINDOW;
    let mut resolved = BTreeMap::<String, LanServiceItem>::new();
    loop {
        if event_streams.is_empty() {
            break;
        }
        tokio::select! {
            _ = sleep_until(deadline) => break,
            event = monitor.recv_async() => {
                match event {
                    Ok(DaemonEvent::Error(_)) => {
                        outcome.issue_code.get_or_insert_with(|| "MDNS_DAEMON".into());
                        break;
                    }
                    Ok(_) => {}
                    Err(_) => {
                        outcome.issue_code.get_or_insert_with(|| "MDNS_MONITOR".into());
                        break;
                    }
                }
            }
            event = event_streams.next() => {
                match event {
                    Some((service_type, ServiceEvent::ServiceResolved(service))) => {
                        let key = format!("{service_type}|{}", service.fullname);
                        if resolved.len() < MAX_DISCOVERED_SERVICES || resolved.contains_key(&key) {
                            resolved.insert(key, mdns_item(&service));
                        }
                    }
                    Some((service_type, ServiceEvent::ServiceRemoved(_, fullname))) => {
                        resolved.remove(&format!("{service_type}|{fullname}"));
                    }
                    Some(_) => {}
                    None => break,
                }
            }
        }
    }
    outcome.items = resolved.into_values().collect();
    daemon.shutdown().await;
    outcome
}

struct BrowseDaemon {
    daemon: ServiceDaemon,
    active_browses: BTreeSet<String>,
    shutdown_requested: bool,
}

impl BrowseDaemon {
    fn new() -> Result<Self, AppError> {
        let daemon =
            ServiceDaemon::new().map_err(|error| AppError::new("MDNS_START", error.to_string()))?;
        Ok(Self {
            daemon,
            active_browses: BTreeSet::new(),
            shutdown_requested: false,
        })
    }

    fn browse(&mut self, service_type: &str) -> Result<mdns_sd::Receiver<ServiceEvent>, AppError> {
        let receiver = self
            .daemon
            .browse(service_type)
            .map_err(|error| AppError::new("MDNS_BROWSE", error.to_string()))?;
        self.active_browses.insert(service_type.to_string());
        Ok(receiver)
    }

    fn stop_browse(&mut self, service_type: &str) {
        if self.active_browses.remove(service_type) {
            let _ = self.daemon.stop_browse(service_type);
        }
    }

    async fn shutdown(&mut self) {
        for service_type in std::mem::take(&mut self.active_browses) {
            let _ = self.daemon.stop_browse(&service_type);
        }
        if let Ok(status) = self.daemon.shutdown() {
            self.shutdown_requested = true;
            let _ = timeout(Duration::from_millis(250), status.recv_async()).await;
        }
    }
}

impl Drop for BrowseDaemon {
    fn drop(&mut self) {
        if !self.shutdown_requested {
            for service_type in std::mem::take(&mut self.active_browses) {
                let _ = self.daemon.stop_browse(&service_type);
            }
            let _ = self.daemon.shutdown();
        }
    }
}

async fn browse_ssdp() -> DiscoveryOutcome {
    let mut outcome = DiscoveryOutcome::default();
    let mut responses = match timeout(
        Duration::from_secs(1),
        ssdp_client::search(&SearchTarget::All, SSDP_RESPONSE_WINDOW, 2, None),
    )
    .await
    {
        Ok(Ok(responses)) => responses,
        Ok(Err(_)) => {
            outcome.issue_code = Some("SSDP_SEARCH".into());
            return outcome;
        }
        Err(_) => {
            outcome.issue_code = Some("SSDP_START_TIMEOUT".into());
            return outcome;
        }
    };

    let deadline = TokioInstant::now() + SSDP_ABSOLUTE_DEADLINE;
    let mut devices = BTreeMap::<String, (bool, LanServiceItem)>::new();
    let mut responses_seen = 0;
    let mut invalid_responses_seen = 0;
    while devices.len() < MAX_DISCOVERED_SERVICES && responses_seen < MAX_SSDP_RESPONSES {
        let response = match timeout_at(deadline, responses.next()).await {
            Ok(Some(Ok(response))) => {
                responses_seen += 1;
                response
            }
            Ok(Some(Err(_))) => {
                responses_seen += 1;
                invalid_responses_seen += 1;
                if invalid_responses_seen >= MAX_INVALID_SSDP_RESPONSES {
                    break;
                }
                continue;
            }
            Ok(None) | Err(_) => break,
        };
        let item = ssdp_item(&response);
        let identity = ssdp_identity(response.usn(), item.location.as_deref());
        let is_root_device = response
            .usn()
            .to_ascii_lowercase()
            .contains("::upnp:rootdevice");
        match devices.entry(identity) {
            std::collections::btree_map::Entry::Vacant(entry) => {
                entry.insert((is_root_device, item));
            }
            std::collections::btree_map::Entry::Occupied(mut entry) => {
                if is_root_device && !entry.get().0 {
                    entry.insert((true, item));
                }
            }
        }
    }
    if responses_seen >= MAX_SSDP_RESPONSES {
        outcome.issue_code = Some("SSDP_RESPONSE_LIMIT".into());
    } else if invalid_responses_seen > 0 {
        outcome.issue_code = Some("SSDP_INVALID_RESPONSE".into());
    }
    outcome.items = devices.into_values().map(|(_, item)| item).collect();
    outcome
}

fn mdns_item(service: &mdns_sd::ResolvedService) -> LanServiceItem {
    let txt_properties = service
        .txt_properties
        .iter()
        .take(MAX_TXT_PROPERTIES)
        .map(|property| {
            let value = property.val_str();
            let text = if value.is_empty() {
                property.key().to_string()
            } else {
                format!("{}={value}", property.key())
            };
            clean_untrusted_text(&text, MAX_TEXT_CHARS)
        })
        .collect::<Vec<_>>();

    LanServiceItem {
        protocol: LanServiceProtocol::Mdns,
        name: clean_untrusted_text(&service.fullname, MAX_TEXT_CHARS),
        service_type: Some(clean_untrusted_text(&service.ty_domain, MAX_TEXT_CHARS)),
        host: Some(clean_untrusted_text(&service.host, MAX_TEXT_CHARS)),
        port: Some(service.port),
        uuid: None,
        location: None,
        txt_properties: (!txt_properties.is_empty()).then_some(txt_properties),
    }
}

fn ssdp_item(response: &SearchResponse) -> LanServiceItem {
    let location = safe_location(response.location());
    let uuid = ssdp_uuid(response.usn());
    let name = clean_untrusted_text(response.server(), MAX_TEXT_CHARS);

    LanServiceItem {
        protocol: LanServiceProtocol::Ssdp,
        name,
        service_type: Some(clean_untrusted_text(
            &response.search_target().to_string(),
            MAX_TEXT_CHARS,
        )),
        host: location.as_ref().map(|info| info.host.clone()),
        port: location.as_ref().and_then(|info| info.port),
        uuid,
        location: location.map(|info| info.display),
        txt_properties: None,
    }
}

struct SafeLocation {
    host: String,
    port: Option<u16>,
    display: String,
}

fn safe_location(raw: &str) -> Option<SafeLocation> {
    let mut url = Url::parse(raw.trim()).ok()?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return None;
    }

    let host = clean_untrusted_text(url.host_str()?, MAX_TEXT_CHARS);
    let port = url.port_or_known_default();
    let had_redacted_parts = !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some();
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);

    let mut display = clean_untrusted_text(url.as_str(), MAX_LOCATION_CHARS);
    if had_redacted_parts {
        display.push_str(" …");
    }
    Some(SafeLocation {
        host,
        port,
        display,
    })
}

fn ssdp_uuid(usn: &str) -> Option<String> {
    let uuid = usn.split("::").next()?.trim();
    if uuid.len() > 128 || !uuid.to_ascii_lowercase().starts_with("uuid:") {
        return None;
    }
    Some(clean_untrusted_text(uuid, 128))
}

fn ssdp_identity(usn: &str, location: Option<&str>) -> String {
    if let Some(uuid) = ssdp_uuid(usn) {
        return format!("uuid:{}", uuid.to_ascii_lowercase());
    }
    if let Some(location) = location {
        return format!("location:{location}");
    }
    format!(
        "usn:{}",
        clean_untrusted_text(usn, 128).to_ascii_lowercase()
    )
}

fn is_service_type(value: &str) -> bool {
    value.len() <= 255
        && !value.chars().any(char::is_control)
        && value != MDNS_ENUMERATION_TYPE
        && (value.ends_with("._tcp.local.") || value.ends_with("._udp.local."))
}

fn clean_untrusted_text(value: &str, max_chars: usize) -> String {
    value
        .chars()
        .filter(|character| !character.is_control())
        .take(max_chars)
        .collect::<String>()
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_enumerated_service_types_before_browsing() {
        assert!(is_service_type("_http._tcp.local."));
        assert!(is_service_type("_ipp._sub._http._tcp.local."));
        assert!(!is_service_type("_services._dns-sd._udp.local."));
        assert!(!is_service_type("_bad._tcp.example.com."));
        assert!(!is_service_type("_bad\n._tcp.local."));
    }

    #[test]
    fn redacts_credentials_query_and_fragment_from_ssdp_location() {
        let location =
            safe_location("http://user:secret@192.168.1.10:8080/device.xml?token=private#section")
                .expect("valid HTTP location");

        assert_eq!(location.host, "192.168.1.10");
        assert_eq!(location.port, Some(8080));
        assert_eq!(location.display, "http://192.168.1.10:8080/device.xml …");
        assert!(!location.display.contains("secret"));
        assert!(!location.display.contains("private"));
    }

    #[test]
    fn rejects_non_http_ssdp_locations_without_resolving_or_fetching_them() {
        assert!(safe_location("file:///etc/passwd").is_none());
        assert!(safe_location("javascript:alert(1)").is_none());
    }

    #[test]
    fn deduplicates_ssdp_service_responses_by_uuid() {
        assert_eq!(
            ssdp_identity(
                "uuid:ABC-123::urn:schemas-upnp-org:service:ContentDirectory:1",
                None,
            ),
            ssdp_identity("uuid:abc-123::upnp:rootdevice", None)
        );
    }

    #[test]
    fn strips_control_characters_and_caps_untrusted_names() {
        assert_eq!(
            clean_untrusted_text("Router\r\nInjected: yes", 40),
            "RouterInjected: yes"
        );
        assert_eq!(clean_untrusted_text("abcdef", 3), "abc");
    }
}
