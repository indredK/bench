//! mDNS / DNS-SD browse + SSDP/UPnP discovery (read-only) — S-DIS-02.

use super::types::{LanServiceItem, LanServicesResult};
use crate::error::{AppError, AppResult};
use std::collections::BTreeSet;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::time::{timeout, timeout_at, Instant as TokioInstant};

pub async fn browse_lan_services() -> AppResult<LanServicesResult> {
    let started = Instant::now();
    let command_hint =
        "browseLanServices(local) // mDNS PTR + SSDP M-SEARCH (read-only)".to_string();

    let mut items = Vec::new();
    let mut seen = BTreeSet::new();

    match browse_mdns().await {
        Ok(list) => {
            for it in list {
                let key = format!("{}|{}|{}", it.protocol, it.name, it.detail);
                if seen.insert(key) {
                    items.push(it);
                }
            }
        }
        Err(e) => items.push(LanServiceItem {
            protocol: "mdns".into(),
            name: "(mDNS error)".into(),
            service_type: None,
            host: None,
            port: None,
            detail: e.to_string(),
        }),
    }

    match browse_ssdp().await {
        Ok(list) => {
            for it in list {
                let key = format!("{}|{}|{}", it.protocol, it.name, it.detail);
                if seen.insert(key) {
                    items.push(it);
                }
            }
        }
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
        message: Some(
            "Read-only discovery. No UPnP Write / AddPortMapping actions are exposed.".into(),
        ),
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

async fn browse_mdns() -> AppResult<Vec<LanServiceItem>> {
    let sock = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| AppError::new("MDNS_BIND", e.to_string()))?;
    sock.set_broadcast(true).ok();
    // Query PTR for DNS-SD root
    let qname = "_services._dns-sd._udp.local";
    let packet = build_dns_ptr_query(qname);
    let dest = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::new(224, 0, 0, 251), 5353));
    sock.send_to(&packet, dest)
        .await
        .map_err(|e| AppError::new("MDNS_SEND", e.to_string()))?;

    let mut out = Vec::new();
    let deadline = TokioInstant::now() + Duration::from_millis(1200);
    let mut buf = [0u8; 1500];
    while TokioInstant::now() < deadline {
        match timeout_at(deadline, sock.recv_from(&mut buf)).await {
            Ok(Ok((n, from))) => {
                let text = String::from_utf8_lossy(&buf[..n]);
                // Best-effort: surface responder + any printable service labels.
                let labels = extract_printable_labels(&buf[..n]);
                if labels.is_empty() {
                    out.push(LanServiceItem {
                        protocol: "mdns".into(),
                        name: from.ip().to_string(),
                        service_type: Some("_services._dns-sd._udp.local".into()),
                        host: Some(from.ip().to_string()),
                        port: None,
                        detail: format!("response {} bytes", n),
                    });
                } else {
                    for lab in labels.into_iter().take(8) {
                        out.push(LanServiceItem {
                            protocol: "mdns".into(),
                            name: lab.clone(),
                            service_type: Some(qname.into()),
                            host: Some(from.ip().to_string()),
                            port: None,
                            detail: format!("label from {from}; raw_hint={}", truncate(&text, 80)),
                        });
                    }
                }
            }
            _ => break,
        }
    }
    Ok(out)
}

async fn browse_ssdp() -> AppResult<Vec<LanServiceItem>> {
    let sock = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| AppError::new("SSDP_BIND", e.to_string()))?;
    sock.set_broadcast(true).ok();
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
    let mut buf = [0u8; 2048];
    while TokioInstant::now() < deadline {
        match timeout_at(deadline, sock.recv_from(&mut buf)).await {
            Ok(Ok((n, from))) => {
                let text = String::from_utf8_lossy(&buf[..n]);
                let st = header_value(&text, "ST").unwrap_or_else(|| "ssdp:all".into());
                let server = header_value(&text, "SERVER").unwrap_or_else(|| from.ip().to_string());
                let location = header_value(&text, "LOCATION").unwrap_or_default();
                // Do NOT fetch LOCATION for write actions — only display.
                out.push(LanServiceItem {
                    protocol: "ssdp".into(),
                    name: server,
                    service_type: Some(st),
                    host: Some(from.ip().to_string()),
                    port: Some(1900),
                    detail: if location.is_empty() {
                        "no LOCATION".into()
                    } else {
                        format!("LOCATION={location} (display only)")
                    },
                });
            }
            _ => break,
        }
    }
    let _ = timeout(Duration::from_millis(1), async {}).await;
    Ok(out)
}

fn build_dns_ptr_query(name: &str) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&0x1200u16.to_be_bytes()); // id
    out.extend_from_slice(&0x0000u16.to_be_bytes()); // flags
    out.extend_from_slice(&1u16.to_be_bytes()); // qdcount
    out.extend_from_slice(&0u16.to_be_bytes());
    out.extend_from_slice(&0u16.to_be_bytes());
    out.extend_from_slice(&0u16.to_be_bytes());
    for label in name.split('.') {
        let b = label.as_bytes();
        out.push(b.len() as u8);
        out.extend_from_slice(b);
    }
    out.push(0);
    out.extend_from_slice(&12u16.to_be_bytes()); // PTR
    out.extend_from_slice(&1u16.to_be_bytes()); // IN
    out
}

fn extract_printable_labels(buf: &[u8]) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < buf.len() {
        let len = buf[i] as usize;
        if len == 0 || len > 63 || i + 1 + len > buf.len() {
            i += 1;
            continue;
        }
        let slice = &buf[i + 1..i + 1 + len];
        if slice
            .iter()
            .all(|c| c.is_ascii_graphic() || *c == b'_' || *c == b'-')
        {
            let s = String::from_utf8_lossy(slice).to_string();
            if s.contains('_') || s.ends_with("local") || s.len() > 3 {
                out.push(s);
            }
        }
        i += 1 + len;
    }
    out
}

fn header_value(msg: &str, key: &str) -> Option<String> {
    for line in msg.lines() {
        if let Some((k, v)) = line.split_once(':') {
            if k.eq_ignore_ascii_case(key) {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

fn truncate(s: &str, n: usize) -> String {
    let t: String = s.chars().take(n).collect();
    t.replace('\n', " ")
}
