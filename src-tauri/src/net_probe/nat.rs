//! NAT type via multi-STUN Binding (RFC 5389) — design-discover §3.3.

use super::types::NatProbeResult;
use crate::error::{AppError, AppResult};
use std::collections::BTreeSet;
use std::net::SocketAddr;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::time::timeout;

const STUN_SERVERS: &[&str] = &[
    "stun.l.google.com:19302",
    "stun1.l.google.com:19302",
    "stun.cloudflare.com:3478",
];
const MAGIC_COOKIE: u32 = 0x2112A442;

pub async fn probe_nat() -> AppResult<NatProbeResult> {
    let command_hint = "probeNat(local) // multi-STUN Binding (google/cloudflare)".to_string();
    let started = Instant::now();

    let sock = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| AppError::new("NAT_BIND", e.to_string()))?;

    let mut mapped = BTreeSet::new();
    let mut details = Vec::new();
    let mut used = Vec::new();

    for server_name in STUN_SERVERS {
        match probe_one(&sock, server_name).await {
            Ok(Some(addr)) => {
                used.push((*server_name).to_string());
                details.push(format!("{server_name} → {addr}"));
                mapped.insert(addr);
            }
            Ok(None) => {
                used.push((*server_name).to_string());
                details.push(format!("{server_name} → no mapped address"));
            }
            Err(e) => {
                used.push((*server_name).to_string());
                details.push(format!("{server_name} → {e}"));
            }
        }
    }

    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    let (nat_type, mapped_address, detail) = if mapped.is_empty() {
        (
            "blocked-or-timeout".into(),
            None,
            Some(format!(
                "All STUN servers failed/blocked. {}",
                details.join("; ")
            )),
        )
    } else if mapped.len() == 1 {
        let addr = mapped.iter().next().cloned();
        (
            "cone-or-mapped".into(),
            addr,
            Some(format!(
                "Consistent mapped address across {} server(s). {}",
                used.len(),
                details.join("; ")
            )),
        )
    } else {
        (
            "symmetric-or-varied".into(),
            mapped.iter().next().cloned(),
            Some(format!(
                "Mapped addresses differ across STUN servers (possible symmetric NAT): {}. {}",
                mapped.iter().cloned().collect::<Vec<_>>().join(" | "),
                details.join("; ")
            )),
        )
    };

    Ok(NatProbeResult {
        nat_type,
        mapped_address,
        stun_server: used.join(", "),
        detail,
        elapsed_ms,
        command_hint,
    })
}

async fn probe_one(sock: &UdpSocket, server_name: &str) -> AppResult<Option<String>> {
    let server: SocketAddr = tokio::net::lookup_host(server_name)
        .await
        .map_err(|e| AppError::new("NAT_DNS", e.to_string()))?
        .next()
        .ok_or_else(|| AppError::new("NAT_DNS", format!("No address for {server_name}")))?;

    let mut txn = [0u8; 12];
    getrandom_lite(&mut txn);
    let mut req = Vec::with_capacity(20);
    req.extend_from_slice(&0x0001u16.to_be_bytes());
    req.extend_from_slice(&0u16.to_be_bytes());
    req.extend_from_slice(&MAGIC_COOKIE.to_be_bytes());
    req.extend_from_slice(&txn);

    sock.send_to(&req, server)
        .await
        .map_err(|e| AppError::new("NAT_SEND", e.to_string()))?;

    let mut buf = [0u8; 512];
    match timeout(Duration::from_secs(3), sock.recv_from(&mut buf)).await {
        Ok(Ok((n, _))) => Ok(parse_xor_mapped(&buf[..n]).0),
        Ok(Err(e)) => Err(AppError::new("NAT_RECV", e.to_string())),
        Err(_) => Err(AppError::new("NAT_TIMEOUT", "STUN timed out")),
    }
}

fn parse_xor_mapped(msg: &[u8]) -> (Option<String>, String) {
    if msg.len() < 20 {
        return (None, "STUN response too short".into());
    }
    if msg[0] != 0x01 || msg[1] != 0x01 {
        return (
            None,
            format!("Unexpected STUN type {:02x}{:02x}", msg[0], msg[1]),
        );
    }
    let mut i = 20usize;
    while i + 4 <= msg.len() {
        let atype = u16::from_be_bytes([msg[i], msg[i + 1]]);
        let alen = u16::from_be_bytes([msg[i + 2], msg[i + 3]]) as usize;
        i += 4;
        if i + alen > msg.len() {
            break;
        }
        if (atype == 0x0020 || atype == 0x0001) && alen >= 8 {
            let family = msg[i + 1];
            let port_raw = u16::from_be_bytes([msg[i + 2], msg[i + 3]]);
            if family == 0x01 && alen >= 8 {
                let mut ip = [msg[i + 4], msg[i + 5], msg[i + 6], msg[i + 7]];
                let port = if atype == 0x0020 {
                    let xport = port_raw ^ ((MAGIC_COOKIE >> 16) as u16);
                    for (b, x) in ip.iter_mut().zip(MAGIC_COOKIE.to_be_bytes()) {
                        *b ^= x;
                    }
                    xport
                } else {
                    port_raw
                };
                let addr = format!("{}.{}.{}.{}:{port}", ip[0], ip[1], ip[2], ip[3]);
                return (Some(addr), "Parsed STUN mapped address".into());
            }
        }
        i += alen;
        let pad = (4 - (alen % 4)) % 4;
        i += pad;
    }
    (None, "No MAPPED-ADDRESS attribute found".into())
}

fn getrandom_lite(buf: &mut [u8]) {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    for (i, b) in buf.iter_mut().enumerate() {
        *b = ((nanos >> ((i % 8) * 8)) as u8).wrapping_add(i as u8);
    }
}
