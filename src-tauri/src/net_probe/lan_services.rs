//! mDNS / DNS-SD browse + SSDP/UPnP discovery (read-only) — S-DIS-02.

use super::types::{LanServiceItem, LanServicesProtocolError, LanServicesResult};
use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use mdns_sd::{ServiceDaemon, ServiceEvent};
use ssdp_client::SearchTarget;
use std::collections::BTreeSet;
use std::time::{Duration, Instant};
use tokio::task::JoinSet;
use tokio::time::{timeout_at, Instant as TokioInstant};

const MAX_ITEMS_PER_PROTOCOL: usize = 256;
const MAX_MDNS_SERVICE_TYPES: usize = 32;
const MDNS_META_SERVICE_TYPE: &str = "_services._dns-sd._udp.local.";
const MDNS_TYPE_WINDOW: Duration = Duration::from_millis(900);
const MDNS_SERVICE_WINDOW: Duration = Duration::from_millis(1200);
const SSDP_WINDOW: Duration = Duration::from_secs(2);
const MAX_DETAIL_CHARS: usize = 768;

pub async fn browse_lan_services() -> AppResult<LanServicesResult> {
    let started = Instant::now();
    let command_hint =
        "browseLanServices(local) // mDNS/DNS-SD + SSDP discovery (read-only)".to_string();

    let mut items = Vec::new();
    let mut errors = Vec::new();
    let mut truncated = false;
    match browse_mdns().await {
        Ok((list, was_truncated)) => {
            truncated |= was_truncated;
            items.extend(list);
        }
        Err(error) => errors.push(protocol_error("mdns", error)),
    }

    match browse_ssdp().await {
        Ok((list, was_truncated)) => {
            truncated |= was_truncated;
            items.extend(list);
        }
        Err(error) => errors.push(protocol_error("ssdp", error)),
    }

    Ok(LanServicesResult {
        items,
        errors,
        truncated,
        // The UI already shows a localized read-only notice.
        message: None,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

async fn browse_mdns() -> AppResult<(Vec<LanServiceItem>, bool)> {
    let daemon =
        ServiceDaemon::new().map_err(|error| AppError::new("MDNS_START", error.to_string()))?;
    let result = browse_mdns_with_daemon(&daemon).await;
    let _ = daemon.shutdown();
    result
}

async fn browse_ssdp() -> AppResult<(Vec<LanServiceItem>, bool)> {
    let target = SearchTarget::All;
    let mut responses = ssdp_client::search(&target, SSDP_WINDOW, 2, None)
        .await
        .map_err(|error| AppError::new("SSDP_SEARCH", error.to_string()))?;
    let deadline = TokioInstant::now() + SSDP_WINDOW + Duration::from_millis(250);
    let mut out = Vec::new();
    let mut truncated = false;
    let mut seen_usn = BTreeSet::new();
    loop {
        match timeout_at(deadline, responses.next()).await {
            Ok(Some(Ok(response))) => {
                let usn = sanitize_network_text(response.usn(), 256);
                let location = sanitize_network_text(response.location(), 256);
                let server = sanitize_network_text(response.server(), 128);
                let search_target =
                    sanitize_network_text(&response.search_target().to_string(), 256);
                let Some(name) = ssdp_display_name(&server, &usn, &search_target) else {
                    continue;
                };
                let dedup_key = if !usn.is_empty() {
                    usn.to_ascii_lowercase()
                } else {
                    if search_target.is_empty() && location.is_empty() {
                        continue;
                    }
                    format!("{}|{}", search_target.to_ascii_lowercase(), location)
                };
                if !seen_usn.insert(dedup_key) {
                    continue;
                }

                let parsed_location = url::Url::parse(&location).ok().filter(|url| {
                    matches!(url.scheme(), "http" | "https") && url.host_str().is_some()
                });
                let item = LanServiceItem {
                    protocol: "ssdp".into(),
                    name,
                    service_type: if search_target.is_empty() {
                        None
                    } else {
                        Some(search_target)
                    },
                    host: parsed_location
                        .as_ref()
                        .and_then(url::Url::host_str)
                        .map(str::to_string),
                    port: parsed_location
                        .as_ref()
                        .and_then(url::Url::port_or_known_default),
                    // LOCATION is untrusted device data. Display it only; never fetch it.
                    detail: sanitize_network_text(
                        &format!("USN={usn}; LOCATION={location}"),
                        MAX_DETAIL_CHARS,
                    ),
                };
                if out.len() < MAX_ITEMS_PER_PROTOCOL {
                    out.push(item);
                } else {
                    truncated = true;
                    break;
                }
            }
            Ok(Some(Err(_))) => continue,
            Ok(None) | Err(_) => break,
        }
    }

    Ok((out, truncated))
}

async fn browse_mdns_with_daemon(daemon: &ServiceDaemon) -> AppResult<(Vec<LanServiceItem>, bool)> {
    let meta_receiver = daemon
        .browse(MDNS_META_SERVICE_TYPE)
        .map_err(|error| AppError::new("MDNS_BROWSE", error.to_string()))?;
    let meta_deadline = TokioInstant::now() + MDNS_TYPE_WINDOW;
    let mut service_types = BTreeSet::new();
    let mut truncated = false;

    loop {
        match timeout_at(meta_deadline, meta_receiver.recv_async()).await {
            Ok(Ok(ServiceEvent::ServiceFound(_, full_name))) => {
                insert_service_type(&mut service_types, full_name, &mut truncated);
            }
            Ok(Ok(ServiceEvent::ServiceResolved(service))) => {
                insert_service_type(
                    &mut service_types,
                    service.get_fullname().to_string(),
                    &mut truncated,
                );
            }
            Ok(Ok(_)) => {}
            Ok(Err(_)) | Err(_) => break,
        }
    }

    let mut receivers = Vec::new();
    for service_type in &service_types {
        match daemon.browse(service_type) {
            Ok(receiver) => receivers.push(receiver),
            Err(_) => truncated = true,
        }
    }

    let service_deadline = TokioInstant::now() + MDNS_SERVICE_WINDOW;
    let mut tasks = JoinSet::new();
    for receiver in receivers {
        tasks.spawn(async move {
            let mut items = Vec::new();
            loop {
                if items.len() >= MAX_ITEMS_PER_PROTOCOL {
                    return (items, true);
                }
                match timeout_at(service_deadline, receiver.recv_async()).await {
                    Ok(Ok(ServiceEvent::ServiceResolved(service))) => {
                        items.push(mdns_service_item(&service));
                    }
                    Ok(Ok(_)) => {}
                    Ok(Err(_)) | Err(_) => return (items, false),
                }
            }
        });
    }

    let mut out = Vec::new();
    let mut seen = BTreeSet::new();
    while let Some(result) = tasks.join_next().await {
        let Ok((items, type_truncated)) = result else {
            truncated = true;
            continue;
        };
        truncated |= type_truncated;
        for item in items {
            if out.len() < MAX_ITEMS_PER_PROTOCOL && seen.insert(item.name.clone()) {
                push_bounded(&mut out, item, &mut truncated);
            } else if out.len() >= MAX_ITEMS_PER_PROTOCOL {
                truncated = true;
                break;
            }
        }
    }

    Ok((out, truncated))
}

fn insert_service_type(
    service_types: &mut BTreeSet<String>,
    service_type: String,
    truncated: &mut bool,
) {
    if !is_valid_mdns_service_type(&service_type) || service_types.contains(&service_type) {
        return;
    }
    if service_types.len() >= MAX_MDNS_SERVICE_TYPES {
        *truncated = true;
        return;
    }
    service_types.insert(service_type);
}

fn mdns_service_item(service: &mdns_sd::ResolvedService) -> LanServiceItem {
    let mut addresses = service
        .addresses
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    addresses.sort();
    let txt = service
        .txt_properties
        .iter()
        .take(16)
        .map(|property| sanitize_network_text(&property.to_string(), 96))
        .collect::<Vec<_>>()
        .join(", ");
    let mut details = vec![format!(
        "host={}",
        sanitize_network_text(&service.host, 253)
    )];
    if !addresses.is_empty() {
        details.push(format!("addresses={}", addresses.join(", ")));
    }
    if !txt.is_empty() {
        details.push(format!("TXT={txt}"));
    }

    LanServiceItem {
        protocol: "mdns".into(),
        name: sanitize_network_text(service.get_fullname(), 253),
        service_type: Some(sanitize_network_text(&service.ty_domain, 253)),
        host: addresses
            .first()
            .cloned()
            .or_else(|| Some(sanitize_network_text(&service.host, 253))),
        port: Some(service.port),
        detail: sanitize_network_text(&details.join(" · "), MAX_DETAIL_CHARS),
    }
}

fn is_valid_mdns_service_type(service_type: &str) -> bool {
    service_type != MDNS_META_SERVICE_TYPE
        && service_type.len() <= 253
        && service_type.is_ascii()
        && (service_type.ends_with("._tcp.local.") || service_type.ends_with("._udp.local."))
        && service_type
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.'))
}

fn ssdp_display_name(server: &str, usn: &str, search_target: &str) -> Option<String> {
    [server, usn, search_target]
        .into_iter()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(str::to_owned)
}

fn sanitize_network_text(text: &str, max_chars: usize) -> String {
    text.chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .take(max_chars)
        .collect()
}

fn protocol_error(protocol: &str, error: AppError) -> LanServicesProtocolError {
    LanServicesProtocolError {
        protocol: protocol.to_string(),
        code: sanitize_network_text(&error.code, 64),
        message: sanitize_network_text(&error.message, MAX_DETAIL_CHARS),
    }
}

fn push_bounded(
    items: &mut Vec<LanServiceItem>,
    item: LanServiceItem,
    truncated: &mut bool,
) -> bool {
    if items.len() >= MAX_ITEMS_PER_PROTOCOL {
        *truncated = true;
        return false;
    }
    items.push(item);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "requires macOS dns-sd and SSDP fixtures on the local multicast interface"]
    async fn discovers_mdns_and_ssdp_fixtures_over_real_multicast() {
        let result = browse_lan_services().await.unwrap();
        let mdns_fixture = result
            .items
            .iter()
            .find(|item| item.protocol == "mdns" && item.name.contains("Bench LAN Fixture"))
            .expect("the local Bonjour fixture should be discovered");

        assert_eq!(
            mdns_fixture.service_type.as_deref(),
            Some("_bench-test._tcp.local.")
        );
        assert_eq!(mdns_fixture.port, Some(54321));
        assert!(mdns_fixture.detail.contains("kind=fixture"));

        let ssdp_fixtures = result
            .items
            .iter()
            .filter(|item| item.protocol == "ssdp" && item.detail.contains("uuid:bench-test"))
            .collect::<Vec<_>>();
        assert_eq!(ssdp_fixtures.len(), 1, "duplicate USNs should be collapsed");
        assert_eq!(ssdp_fixtures[0].name, "BenchTest/1.0 UPnP/1.1");
        assert_eq!(
            ssdp_fixtures[0].service_type.as_deref(),
            Some("upnp:rootdevice")
        );
        assert_eq!(ssdp_fixtures[0].host.as_deref(), Some("192.0.2.1"));
        assert_eq!(ssdp_fixtures[0].port, Some(6543));
    }

    #[test]
    fn bounds_protocol_results_and_reports_omitted_items() {
        let mut items = Vec::new();
        let mut truncated = false;
        for index in 0..=MAX_ITEMS_PER_PROTOCOL {
            push_bounded(
                &mut items,
                LanServiceItem {
                    protocol: "ssdp".into(),
                    name: format!("device-{index}"),
                    service_type: None,
                    host: None,
                    port: None,
                    detail: String::new(),
                },
                &mut truncated,
            );
        }

        assert_eq!(items.len(), MAX_ITEMS_PER_PROTOCOL);
        assert!(truncated);
        assert_eq!(
            items.last().map(|item| item.name.as_str()),
            Some("device-255")
        );
    }

    #[test]
    fn rejects_invalid_service_types_from_mdns_responses() {
        assert!(is_valid_mdns_service_type("_http._tcp.local."));
        assert!(is_valid_mdns_service_type("_printer._sub._ipp._tcp.local."));
        assert!(!is_valid_mdns_service_type("_services._dns-sd._udp.local."));
        assert!(!is_valid_mdns_service_type("_http._tcp.example.com."));
        assert!(!is_valid_mdns_service_type("_http._tcp.local.\nInjected"));
    }

    #[test]
    fn sanitizes_control_characters_and_bounds_untrusted_service_text() {
        assert_eq!(sanitize_network_text("server\r\nnext", 64), "server  next");
        assert_eq!(sanitize_network_text("abcd", 3), "abc");
    }

    #[test]
    fn ssdp_location_metadata_only_accepts_http_urls() {
        let parsed = url::Url::parse("http://192.168.1.1:8080/device.xml")
            .ok()
            .filter(|url| matches!(url.scheme(), "http" | "https") && url.host_str().is_some());
        assert_eq!(
            parsed.as_ref().and_then(url::Url::host_str),
            Some("192.168.1.1")
        );
        assert_eq!(
            parsed.as_ref().and_then(url::Url::port_or_known_default),
            Some(8080)
        );

        let rejected = url::Url::parse("file:///etc/passwd")
            .ok()
            .filter(|url| matches!(url.scheme(), "http" | "https") && url.host_str().is_some());
        assert!(rejected.is_none());
    }

    #[test]
    fn ssdp_name_falls_back_to_identity_when_server_header_is_missing() {
        assert_eq!(
            ssdp_display_name("", "uuid:device", "upnp:rootdevice").as_deref(),
            Some("uuid:device")
        );
        assert_eq!(
            ssdp_display_name("", "", "upnp:rootdevice").as_deref(),
            Some("upnp:rootdevice")
        );
        assert_eq!(ssdp_display_name("", "", ""), None);
    }
}
