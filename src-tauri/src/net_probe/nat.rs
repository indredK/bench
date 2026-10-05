//! Multi-server STUN mapping observation (RFC 8489) — design-discover §3.3.

use super::types::NatProbeResult;
use crate::error::{AppError, AppResult};
use rtc_stun::message::Getter;
use rtc_stun::{
    addr::MappedAddress,
    message::{Message, TransactionId, BINDING_REQUEST, BINDING_SUCCESS, MESSAGE_HEADER_SIZE},
    xoraddr::XorMappedAddress,
};
use std::collections::BTreeSet;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::time::timeout;

const STUN_SERVERS: &[&str] = &[
    "stun.l.google.com:19302",
    "stun1.l.google.com:19302",
    "stun.cloudflare.com:3478",
];
const STUN_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_SERVER_ADDRESSES: usize = 2;

pub async fn probe_nat() -> AppResult<NatProbeResult> {
    let command_hint = "probeNat(local) // multi-STUN Binding (google/cloudflare)".to_string();
    let started = Instant::now();

    let mut mapped = BTreeSet::new();
    let mut observed = Vec::new();
    let mut details = Vec::new();
    let mut used = Vec::new();

    for server_name in STUN_SERVERS {
        used.push((*server_name).to_string());
        match probe_one(server_name).await {
            Ok(address) => {
                observed.push(((*server_name).to_string(), address.clone()));
                mapped.insert(address.clone());
                details.push(format!("{server_name} → {address}"));
            }
            Err(error) => details.push(format!("{server_name} → {error}")),
        }
    }

    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    let (nat_type, mapped_address, detail) = match mapped.len() {
        0 => (
            "blocked-or-timeout".into(),
            None,
            Some(format!(
                "No STUN server returned a valid mapped address; UDP may be blocked or timed out. {}",
                details.join("; ")
            )),
        ),
        1 => (
            "consistent-across-servers".into(),
            mapped.iter().next().cloned(),
            Some(format!(
                "The mapped address was consistent across {} responding STUN server(s). This does not identify a specific NAT type. {}",
                observed.len(),
                details.join("; ")
            )),
        ),
        _ => (
            "varied-across-servers".into(),
            None,
            Some(format!(
                "Different mapped addresses were observed across STUN servers; this alone does not identify a specific NAT type. {}",
                details.join("; ")
            )),
        ),
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

async fn probe_one(server_name: &str) -> AppResult<String> {
    let addresses = timeout(STUN_TIMEOUT, tokio::net::lookup_host(server_name))
        .await
        .map_err(|_| AppError::new("NAT_DNS", "STUN server lookup timed out"))?
        .map_err(|error| AppError::new("NAT_DNS", error.to_string()))?
        .collect::<Vec<_>>();

    if addresses.is_empty() {
        return Err(AppError::new(
            "NAT_DNS",
            format!("No address for {server_name}"),
        ));
    }

    let address_timeout = STUN_TIMEOUT / addresses.len().min(MAX_SERVER_ADDRESSES) as u32;
    let mut errors = Vec::new();
    for server in addresses.into_iter().take(MAX_SERVER_ADDRESSES) {
        match timeout(address_timeout, probe_address(server)).await {
            Ok(Ok(address)) => return Ok(address),
            Ok(Err(error)) => errors.push(error.to_string()),
            Err(_) => errors.push(format!("timed out waiting for {server}")),
        }
    }

    Err(AppError::new("NAT_TIMEOUT", errors.join("; ")))
}

async fn probe_address(server: SocketAddr) -> AppResult<String> {
    let bind_address = match server.ip() {
        IpAddr::V4(_) => SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), 0),
        IpAddr::V6(_) => SocketAddr::new(IpAddr::V6(Ipv6Addr::UNSPECIFIED), 0),
    };
    let socket = UdpSocket::bind(bind_address)
        .await
        .map_err(|error| AppError::new("NAT_BIND", error.to_string()))?;

    let transaction_id = TransactionId::new();
    let mut request = Message::new();
    request
        .build(&[Box::new(BINDING_REQUEST), Box::new(transaction_id)])
        .map_err(|error| AppError::new("NAT_SEND", error.to_string()))?;
    socket
        .send_to(&request.raw, server)
        .await
        .map_err(|error| AppError::new("NAT_SEND", error.to_string()))?;

    let mut buffer = vec![0u8; 65_535];
    loop {
        let (length, sender) = socket
            .recv_from(&mut buffer)
            .await
            .map_err(|error| AppError::new("NAT_RECV", error.to_string()))?;
        if sender != server {
            continue;
        }
        return parse_binding_response(&buffer[..length], transaction_id)
            .map_err(|error| AppError::new("NAT_RESPONSE", error));
    }
}

fn parse_binding_response(bytes: &[u8], expected_id: TransactionId) -> Result<String, String> {
    if bytes.len() < MESSAGE_HEADER_SIZE {
        return Err("STUN response is shorter than its header".into());
    }
    let declared_length = u16::from_be_bytes([bytes[2], bytes[3]]) as usize;
    if MESSAGE_HEADER_SIZE + declared_length != bytes.len() {
        return Err("STUN response length does not match its header".into());
    }

    let mut response = Message::new();
    response.raw.clear();
    response.raw.extend_from_slice(bytes);
    response
        .decode()
        .map_err(|error| format!("Invalid STUN response: {error}"))?;

    if response.typ != BINDING_SUCCESS {
        return Err(format!("Unexpected STUN response type: {}", response.typ));
    }
    if response.transaction_id != expected_id {
        return Err("STUN response transaction ID does not match the request".into());
    }

    let mut xor_mapped = XorMappedAddress::default();
    if xor_mapped.get_from(&response).is_ok() {
        return Ok(xor_mapped.to_string());
    }

    // MAPPED-ADDRESS is retained only for older RFC 3489-compatible servers.
    let mut mapped = MappedAddress::default();
    mapped
        .get_from(&response)
        .map_err(|error| format!("STUN response has no valid mapped address: {error}"))?;
    Ok(mapped.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::UdpSocket;

    fn success_response(id: TransactionId, ip: IpAddr, port: u16) -> Vec<u8> {
        let mut response = Message::new();
        response
            .build(&[
                Box::new(BINDING_SUCCESS),
                Box::new(id),
                Box::new(XorMappedAddress { ip, port }),
            ])
            .expect("build STUN success response");
        response.raw
    }

    #[test]
    fn parses_ipv4_xor_mapped_address() {
        let id = TransactionId([7; 12]);
        let packet = success_response(id, "203.0.113.9".parse().unwrap(), 45_678);
        assert_eq!(
            parse_binding_response(&packet, id).unwrap(),
            "203.0.113.9:45678"
        );
    }

    #[test]
    fn parses_ipv6_xor_mapped_address() {
        let id = TransactionId([8; 12]);
        let packet = success_response(id, "2001:db8::9".parse().unwrap(), 45_678);
        assert_eq!(
            parse_binding_response(&packet, id).unwrap(),
            "[2001:db8::9]:45678"
        );
    }

    #[test]
    fn rejects_wrong_transaction_id_and_trailing_bytes() {
        let id = TransactionId([9; 12]);
        let packet = success_response(id, "203.0.113.10".parse().unwrap(), 45_679);
        assert!(parse_binding_response(&packet, TransactionId([10; 12]))
            .unwrap_err()
            .contains("transaction ID"));

        let mut packet_with_trailing_bytes = packet;
        packet_with_trailing_bytes.push(0);
        assert!(parse_binding_response(&packet_with_trailing_bytes, id)
            .unwrap_err()
            .contains("length"));
    }

    #[tokio::test]
    async fn ignores_response_from_unexpected_udp_sender() {
        let server = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let spoof = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let server_address = server.local_addr().unwrap();

        let server_task = tokio::spawn(async move {
            let mut request = [0u8; 128];
            let (length, client_address) = server.recv_from(&mut request).await.unwrap();
            let mut decoded = Message::new();
            decoded.raw.clear();
            decoded.raw.extend_from_slice(&request[..length]);
            decoded.decode().unwrap();
            let response = success_response(
                decoded.transaction_id,
                "198.51.100.14".parse().unwrap(),
                40_000,
            );
            spoof.send_to(&response, client_address).await.unwrap();
            server.send_to(&response, client_address).await.unwrap();
        });

        let address = timeout(Duration::from_secs(1), probe_address(server_address))
            .await
            .expect("local STUN exchange should finish")
            .unwrap();
        assert_eq!(address, "198.51.100.14:40000");
        server_task.await.unwrap();
    }
}
