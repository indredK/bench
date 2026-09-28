//! mDNS / DNS-SD browse + SSDP/UPnP discovery (read-only) — S-DIS-02.

use super::types::{LanServiceItem, LanServicesResult};
use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use mdns_sd::{
    DaemonEvent, DaemonStatus, Error as MdnsError, Receiver, ServiceDaemon, ServiceEvent,
};
use ssdp_client::{search as search_ssdp, SearchTarget};
use std::collections::{BTreeMap, BTreeSet};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use tokio::time::{sleep_until, timeout_at, Instant as TokioInstant};

const MDNS_SERVICE_ENUMERATION: &str = "_services._dns-sd._udp.local.";
const MDNS_ENUMERATION_WINDOW: Duration = Duration::from_millis(750);
const MDNS_SERVICE_BROWSE_WINDOW: Duration = Duration::from_millis(1500);
const MDNS_MAX_SERVICE_TYPES: usize = 64;
const MAX_SERVICE_RESULTS: usize = 512;

pub async fn browse_lan_services() -> AppResult<LanServicesResult> {
    let started = Instant::now();
    let command_hint =
        "browseLanServices(local) // mDNS PTR + SSDP M-SEARCH (read-only)".to_string();

    let (mdns_result, ssdp_result) = tokio::join!(browse_mdns(), browse_ssdp());
    let mut items = Vec::new();
    let mut seen = BTreeSet::new();

    match mdns_result {
        Ok(list) => append_unique_items(&mut items, &mut seen, list),
        Err(e) => items.push(LanServiceItem {
            protocol: "mdns".into(),
            name: "(mDNS error)".into(),
            service_type: None,
            host: None,
            port: None,
            detail: e.to_string(),
        }),
    }

    match ssdp_result {
        Ok(list) => append_unique_items(&mut items, &mut seen, list),
        Err(e) => items.push(LanServiceItem {
            protocol: "ssdp".into(),
            name: "(SSDP error)".into(),
            service_type: None,
            host: None,
            port: None,
            detail: e.to_string(),
        }),
    }

    Ok(LanServicesResult {
        items,
        message: None,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

fn append_unique_items(
    items: &mut Vec<LanServiceItem>,
    seen: &mut BTreeSet<String>,
    incoming: Vec<LanServiceItem>,
) {
    for item in incoming {
        let key = format!(
            "{}|{}|{}|{}|{}|{}",
            item.protocol,
            item.name.to_ascii_lowercase(),
            item.service_type
                .as_deref()
                .unwrap_or_default()
                .to_ascii_lowercase(),
            item.host
                .as_deref()
                .unwrap_or_default()
                .to_ascii_lowercase(),
            item.port.unwrap_or_default(),
            if item.protocol == "ssdp" {
                item.detail.to_ascii_lowercase()
            } else {
                String::new()
            },
        );
        if seen.insert(key) {
            items.push(item);
        }
    }
}

async fn browse_mdns() -> AppResult<Vec<LanServiceItem>> {
    let daemon = ServiceDaemon::new().map_err(|e| AppError::new("MDNS_DAEMON", e.to_string()))?;
    let monitor = match daemon.monitor() {
        Ok(receiver) => receiver,
        Err(error) => {
            let _ = shutdown_mdns(&daemon).await;
            return Err(AppError::new("MDNS_MONITOR", error.to_string()));
        }
    };
    let enumeration_receiver = match daemon.browse(MDNS_SERVICE_ENUMERATION) {
        Ok(receiver) => receiver,
        Err(error) => {
            let _ = shutdown_mdns(&daemon).await;
            return Err(AppError::new("MDNS_BROWSE", error.to_string()));
        }
    };

    let enumeration_deadline = TokioInstant::now() + MDNS_ENUMERATION_WINDOW;
    let mut service_types = BTreeSet::new();
    let mut daemon_error = None;
    loop {
        tokio::select! {
            event = monitor.recv_async() => match event {
                Ok(DaemonEvent::Error(error)) => {
                    daemon_error = Some(error.to_string());
                    break;
                }
                Ok(_) => {}
                Err(error) => {
                    daemon_error = Some(format!("mDNS daemon monitor closed: {error}"));
                    break;
                }
            },
            event = enumeration_receiver.recv_async() => match event {
                Ok(ServiceEvent::ServiceFound(_, service_type)) => {
                    if let Some(service_type) = normalize_mdns_service_type(&service_type) {
                        if service_types.len() < MDNS_MAX_SERVICE_TYPES || service_types.contains(&service_type) {
                            service_types.insert(service_type);
                        }
                    }
                }
                Ok(_) => {}
                Err(_) => break,
            },
            _ = sleep_until(enumeration_deadline) => break,
        }
    }

    let _ = daemon.stop_browse(MDNS_SERVICE_ENUMERATION);
    drop(enumeration_receiver);

    if let Some(error) = daemon_error.take() {
        let _ = shutdown_mdns(&daemon).await;
        return Err(AppError::new("MDNS_RUNTIME", error));
    }

    let mut browse_receivers = Vec::with_capacity(service_types.len());
    let mut first_browse_error = None;
    for service_type in service_types {
        match daemon.browse(&service_type) {
            Ok(receiver) => browse_receivers.push((service_type, receiver)),
            Err(error) => {
                first_browse_error.get_or_insert_with(|| error.to_string());
            }
        }
    }
    if browse_receivers.is_empty() && first_browse_error.is_some() {
        let _ = shutdown_mdns(&daemon).await;
        return Err(AppError::new(
            "MDNS_BROWSE",
            first_browse_error.unwrap_or_default(),
        ));
    }

    let mut items = BTreeMap::new();
    let mut truncated = false;
    if !browse_receivers.is_empty() {
        let (event_sender, mut event_receiver) = mpsc::channel(128);
        let mut event_forwarders = Vec::with_capacity(browse_receivers.len());
        for (_, receiver) in &browse_receivers {
            event_forwarders.push(forward_mdns_events(receiver.clone(), event_sender.clone()));
        }
        drop(event_sender);

        let service_deadline = TokioInstant::now() + MDNS_SERVICE_BROWSE_WINDOW;
        loop {
            tokio::select! {
                event = monitor.recv_async() => match event {
                    Ok(DaemonEvent::Error(error)) => {
                        daemon_error = Some(error.to_string());
                        break;
                    }
                    Ok(_) => {}
                    Err(error) => {
                        daemon_error = Some(format!("mDNS daemon monitor closed: {error}"));
                        break;
                    }
                },
                event = event_receiver.recv() => match event {
                    Some(event) => {
                        if record_mdns_event(&mut items, event) {
                            truncated = true;
                            break;
                        }
                    }
                    None => break,
                },
                _ = sleep_until(service_deadline) => break,
            }
        }

        for (service_type, _) in &browse_receivers {
            let _ = daemon.stop_browse(service_type);
        }
        drop(event_receiver);
        let shutdown_result = shutdown_mdns(&daemon).await;
        let forwarder_deadline = TokioInstant::now() + Duration::from_secs(1);
        for mut forwarder in event_forwarders {
            if timeout_at(forwarder_deadline, &mut forwarder)
                .await
                .is_err()
            {
                forwarder.abort();
                let _ = forwarder.await;
            }
        }
        shutdown_result?;
    } else {
        shutdown_mdns(&daemon).await?;
    }

    if truncated {
        items.insert("(mdns result limit)".into(), result_limit_item("mdns"));
    }

    if let Some(error) = first_browse_error {
        items.insert(
            "(mdns error)".into(),
            LanServiceItem {
                protocol: "mdns".into(),
                name: "(mDNS error)".into(),
                service_type: None,
                host: None,
                port: None,
                detail: error,
            },
        );
    }

    if let Some(error) = daemon_error {
        return Err(AppError::new("MDNS_RUNTIME", error));
    }
    Ok(items.into_values().collect())
}

fn normalize_mdns_service_type(service_type: &str) -> Option<String> {
    let service_type = service_type.strip_suffix('.')?;
    let normalized = format!("{}.", service_type.to_ascii_lowercase());
    if normalized.len() > 253
        || normalized == MDNS_SERVICE_ENUMERATION
        || !(normalized.ends_with("._tcp.local.") || normalized.ends_with("._udp.local."))
        || normalized.trim_end_matches('.').split('.').any(|label| {
            label.is_empty()
                || label.len() > 63
                || !label.is_ascii()
                || label
                    .bytes()
                    .any(|b| b.is_ascii_control() || b.is_ascii_whitespace())
        })
        || !normalized.starts_with('_')
    {
        return None;
    }
    Some(normalized)
}

fn forward_mdns_events(
    receiver: Receiver<ServiceEvent>,
    sender: mpsc::Sender<ServiceEvent>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        while let Ok(event) = receiver.recv_async().await {
            if sender.send(event).await.is_err() {
                break;
            }
        }
    })
}

fn record_mdns_event(items: &mut BTreeMap<String, LanServiceItem>, event: ServiceEvent) -> bool {
    match event {
        ServiceEvent::ServiceFound(service_type, fullname) => {
            let name = fullname.trim_end_matches('.').to_string();
            let key = name.to_ascii_lowercase();
            if items.len() >= MAX_SERVICE_RESULTS && !items.contains_key(&key) {
                return true;
            }
            items.entry(key).or_insert(LanServiceItem {
                protocol: "mdns".into(),
                name,
                service_type: Some(service_type),
                host: None,
                port: None,
                detail: String::new(),
            });
        }
        ServiceEvent::ServiceResolved(service) => {
            let name = service.fullname.trim_end_matches('.').to_string();
            let key = name.to_ascii_lowercase();
            if items.len() >= MAX_SERVICE_RESULTS && !items.contains_key(&key) {
                return true;
            }
            let mut addresses = service
                .addresses
                .iter()
                .map(ToString::to_string)
                .collect::<BTreeSet<_>>();
            let item = items.entry(key).or_insert_with(|| LanServiceItem {
                protocol: "mdns".into(),
                name: name.clone(),
                service_type: Some(service.ty_domain.clone()),
                host: None,
                port: None,
                detail: String::new(),
            });
            if !item.detail.is_empty() {
                let previous_addresses = &item.detail;
                addresses.extend(previous_addresses.split(", ").map(str::to_string));
            }
            item.service_type = Some(service.ty_domain);
            item.host = Some(service.host);
            item.port = Some(service.port);
            item.detail = addresses.into_iter().collect::<Vec<_>>().join(", ");
        }
        ServiceEvent::ServiceRemoved(_, fullname) => {
            items.remove(&fullname.trim_end_matches('.').to_ascii_lowercase());
        }
        _ => {}
    }
    false
}

fn result_limit_item(protocol: &str) -> LanServiceItem {
    LanServiceItem {
        protocol: protocol.into(),
        name: format!("({protocol} result limit)"),
        service_type: None,
        host: None,
        port: None,
        detail: "[RESULT_LIMIT]".into(),
    }
}

async fn shutdown_mdns(daemon: &ServiceDaemon) -> AppResult<()> {
    let deadline = TokioInstant::now() + Duration::from_secs(1);
    let receiver = loop {
        match daemon.shutdown() {
            Ok(receiver) => break receiver,
            Err(MdnsError::Again) if TokioInstant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            Err(error) => return Err(AppError::new("MDNS_SHUTDOWN", error.to_string())),
        }
    };
    match timeout_at(deadline, receiver.recv_async()).await {
        Ok(Ok(DaemonStatus::Shutdown)) => Ok(()),
        Ok(Ok(DaemonStatus::Running)) => Err(AppError::new(
            "MDNS_SHUTDOWN",
            "mDNS daemon remained running after shutdown was requested",
        )),
        Ok(Err(error)) => Err(AppError::new("MDNS_SHUTDOWN", error.to_string())),
        Ok(Ok(_)) => Err(AppError::new(
            "MDNS_SHUTDOWN",
            "mDNS daemon returned an unknown shutdown status",
        )),
        Err(_) => Err(AppError::new(
            "MDNS_SHUTDOWN_TIMEOUT",
            "mDNS daemon did not shut down within one second",
        )),
    }
}

async fn browse_ssdp() -> AppResult<Vec<LanServiceItem>> {
    let target = SearchTarget::All;
    let mut responses = search_ssdp(&target, Duration::from_secs(2), 2, None)
        .await
        .map_err(|e| AppError::new("SSDP_SEND", e.to_string()))?;
    let mut out = Vec::new();
    let mut seen = BTreeSet::new();
    let mut truncated = false;
    let deadline = TokioInstant::now() + Duration::from_secs(2);
    while TokioInstant::now() < deadline {
        match timeout_at(deadline, responses.next()).await {
            Ok(Some(Ok(response))) => {
                truncated = append_ssdp_result(
                    &mut out,
                    &mut seen,
                    response.server(),
                    &response.search_target().to_string(),
                    response.usn(),
                    response.location(),
                );
                if truncated {
                    break;
                }
            }
            Ok(Some(Err(_))) => continue,
            Ok(None) | Err(_) => break,
        }
    }
    if truncated {
        out.push(result_limit_item("ssdp"));
    }
    Ok(out)
}

fn append_ssdp_result(
    items: &mut Vec<LanServiceItem>,
    seen: &mut BTreeSet<String>,
    server: &str,
    service_type: &str,
    usn: &str,
    location: &str,
) -> bool {
    let key = format!(
        "{}|{}|{}|{}",
        server.to_ascii_lowercase(),
        service_type.to_ascii_lowercase(),
        usn.to_ascii_lowercase(),
        location.to_ascii_lowercase(),
    );
    if seen.contains(&key) {
        return false;
    }
    if items.len() >= MAX_SERVICE_RESULTS {
        return true;
    }
    seen.insert(key);

    let location_url = url::Url::parse(location)
        .ok()
        .filter(|parsed| matches!(parsed.scheme(), "http" | "https"));
    let host = location_url
        .as_ref()
        .and_then(url::Url::host_str)
        .map(str::to_string);
    let port = location_url
        .as_ref()
        .and_then(url::Url::port_or_known_default);
    items.push(LanServiceItem {
        protocol: "ssdp".into(),
        name: server.into(),
        service_type: Some(service_type.into()),
        host,
        port,
        detail: format!("LOCATION={location} (display only) · USN={usn}"),
    });
    false
}

#[cfg(test)]
mod tests {
    use super::{
        append_ssdp_result, append_unique_items, normalize_mdns_service_type, record_mdns_event,
        MAX_SERVICE_RESULTS, MDNS_SERVICE_ENUMERATION,
    };
    use crate::net_probe::types::LanServiceItem;
    use mdns_sd::ServiceEvent;
    use std::collections::{BTreeMap, BTreeSet};

    #[test]
    fn mdns_browse_reports_dns_sd_names_without_scanning_raw_packet_bytes() {
        let mut items = BTreeMap::new();
        assert!(!record_mdns_event(
            &mut items,
            ServiceEvent::ServiceFound(MDNS_SERVICE_ENUMERATION.into(), "_http._tcp.local.".into()),
        ));

        let item = items
            .values()
            .next()
            .expect("service type should be retained");
        assert_eq!(item.protocol, "mdns");
        assert_eq!(item.name, "_http._tcp.local");
        assert_eq!(item.service_type.as_deref(), Some(MDNS_SERVICE_ENUMERATION));
        assert_eq!(item.host, None);
        assert_eq!(item.port, None);
    }

    #[test]
    fn mdns_browse_ignores_lifecycle_events() {
        let mut items = BTreeMap::new();
        assert!(!record_mdns_event(
            &mut items,
            ServiceEvent::SearchStarted("_http._tcp.local.".into()),
        ));

        assert!(items.is_empty());
    }

    #[test]
    fn mdns_browse_caps_unique_service_instances_and_reports_truncation() {
        let mut items = BTreeMap::new();
        for index in 0..MAX_SERVICE_RESULTS {
            assert!(!record_mdns_event(
                &mut items,
                ServiceEvent::ServiceFound(
                    "_http._tcp.local.".into(),
                    format!("instance-{index}._http._tcp.local."),
                ),
            ));
        }
        assert!(record_mdns_event(
            &mut items,
            ServiceEvent::ServiceFound(
                "_http._tcp.local.".into(),
                "instance-over-limit._http._tcp.local.".into(),
            ),
        ));
        assert_eq!(items.len(), MAX_SERVICE_RESULTS);
    }

    #[test]
    fn mdns_enumeration_accepts_only_bounded_local_tcp_or_udp_service_types() {
        assert_eq!(
            normalize_mdns_service_type("_HTTP._TCP.local."),
            Some("_http._tcp.local.".into())
        );
        assert_eq!(
            normalize_mdns_service_type("_services._dns-sd._udp.local."),
            None
        );
        assert_eq!(normalize_mdns_service_type("_http._tcp.example.com."), None);
        assert_eq!(normalize_mdns_service_type("_http.._tcp.local."), None);
        assert_eq!(normalize_mdns_service_type("_http._tcp.local.."), None);
        assert_eq!(normalize_mdns_service_type(" _http._tcp.local."), None);
    }

    #[test]
    fn ssdp_result_limit_deduplicates_and_reports_truncation() {
        let mut items = Vec::new();
        let mut seen = BTreeSet::new();
        for index in 0..MAX_SERVICE_RESULTS {
            assert!(!append_ssdp_result(
                &mut items,
                &mut seen,
                "TestServer",
                "urn:schemas-upnp-org:device:MediaServer:1",
                &format!("uuid:{index}"),
                &format!("http://192.168.1.10:{}/device.xml", 1000 + index),
            ));
        }
        assert!(append_ssdp_result(
            &mut items,
            &mut seen,
            "TestServer",
            "urn:schemas-upnp-org:device:MediaServer:1",
            "uuid:over-limit",
            "http://192.168.1.10:9999/device.xml",
        ));
        assert!(!append_ssdp_result(
            &mut items,
            &mut seen,
            "TestServer",
            "urn:schemas-upnp-org:device:MediaServer:1",
            "uuid:0",
            "http://192.168.1.10:1000/device.xml",
        ));
        assert_eq!(items.len(), MAX_SERVICE_RESULTS);
    }

    #[test]
    fn ssdp_deduplication_keeps_distinct_services_from_the_same_device() {
        let item = |service_type: &str| LanServiceItem {
            protocol: "ssdp".into(),
            name: "Example UPnP device".into(),
            service_type: Some(service_type.into()),
            host: Some("192.168.1.20".into()),
            port: Some(1900),
            detail: "LOCATION=http://192.168.1.20/device.xml (display only)".into(),
        };
        let mut items = Vec::new();
        let mut seen = BTreeSet::new();

        append_unique_items(
            &mut items,
            &mut seen,
            vec![
                item("urn:schemas-upnp-org:service:ContentDirectory:1"),
                item("urn:schemas-upnp-org:service:ContentDirectory:1"),
                item("urn:schemas-upnp-org:service:ConnectionManager:1"),
            ],
        );

        assert_eq!(items.len(), 2);
        assert_ne!(items[0].service_type, items[1].service_type);
    }
}
