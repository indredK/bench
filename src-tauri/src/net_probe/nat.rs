//! STUN mapping observations (RFC 8489 Binding); this does not classify NAT behavior.

use std::{collections::BTreeSet, net::SocketAddr, time::Duration};

use bytecodec::{DecodeExt, EncodeExt};
use stun_codec::{
    rfc5389::{
        attributes::{MappedAddress, XorMappedAddress},
        methods, Attribute,
    },
    Message, MessageClass, MessageDecoder, MessageEncoder, TransactionId,
};
use tokio::{net::UdpSocket, time::timeout};

use super::types::{NatMappingObservation, NatProbeResult};
use crate::error::{AppError, AppResult};

const STUN_SERVERS: &[&str] = &[
    "stun.l.google.com:19302",
    "stun1.l.google.com:19302",
    "stun.cloudflare.com:3478",
];
const MAX_ADDRESSES_PER_SERVER: usize = 4;
const STUN_TIMEOUT: Duration = Duration::from_secs(3);
const SERVER_QUERY_BUDGET: Duration = Duration::from_secs(6);
const MAX_STUN_DATAGRAM_BYTES: usize = 2048;

pub async fn probe_nat() -> AppResult<NatProbeResult> {
    let command_hint = "probeNat(local) // STUN Binding mapping observations".to_string();
    let started = std::time::Instant::now();
    let mut observations = Vec::with_capacity(STUN_SERVERS.len());

    for server in STUN_SERVERS {
        match probe_one(server).await {
            Ok(address) => observations.push(NatMappingObservation {
                server: (*server).to_string(),
                status: "mapped".into(),
                mapped_address: Some(address.to_string()),
            }),
            Err(error) => observations.push(NatMappingObservation {
                server: (*server).to_string(),
                status: observation_status(&error.code).into(),
                mapped_address: None,
            }),
        }
    }

    Ok(NatProbeResult {
        observations,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

fn observation_status(error_code: &str) -> &'static str {
    match error_code {
        "NAT_TIMEOUT" | "NAT_DNS_TIMEOUT" => "timeout",
        _ => "unavailable",
    }
}

async fn probe_one(server_name: &str) -> AppResult<SocketAddr> {
    let deadline = tokio::time::Instant::now() + SERVER_QUERY_BUDGET;
    let resolved = timeout(
        deadline.saturating_duration_since(tokio::time::Instant::now()),
        tokio::net::lookup_host(server_name),
    )
    .await
    .map_err(|_| AppError::new("NAT_DNS_TIMEOUT", "STUN server DNS lookup timed out"))?
    .map_err(|error| AppError::new("NAT_DNS", error.to_string()))?;
    let addresses: BTreeSet<_> = resolved.take(MAX_ADDRESSES_PER_SERVER).collect();
    if addresses.is_empty() {
        return Err(AppError::new(
            "NAT_DNS",
            format!("no addresses for STUN server {server_name}"),
        ));
    }

    let mut last_error = None;
    for address in addresses {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err(AppError::new("NAT_TIMEOUT", "STUN server query timed out"));
        }
        match timeout(remaining, probe_address(address)).await {
            Ok(Ok(mapped)) => return Ok(mapped),
            Ok(Err(error)) => last_error = Some(error),
            Err(_) => return Err(AppError::new("NAT_TIMEOUT", "STUN server query timed out")),
        }
    }
    Err(last_error.unwrap_or_else(|| AppError::new("NAT_DNS", "no STUN server address")))
}

async fn probe_address(server: SocketAddr) -> AppResult<SocketAddr> {
    let bind_address = if server.is_ipv4() {
        "0.0.0.0:0"
    } else {
        "[::]:0"
    };
    let socket = UdpSocket::bind(bind_address)
        .await
        .map_err(|error| AppError::new("NAT_BIND", error.to_string()))?;

    // RFC 8489 requires a uniformly random 96-bit transaction ID. `rand` is already a direct
    // dependency and uses the platform CSPRNG for this value.
    let transaction_id = TransactionId::new(rand::random());
    let request =
        Message::<Attribute>::new(MessageClass::Request, methods::BINDING, transaction_id);
    let request_bytes = MessageEncoder::new()
        .encode_into_bytes(request)
        .map_err(|error| AppError::internal(format!("encode STUN Binding request: {error}")))?;
    socket
        .send_to(&request_bytes, server)
        .await
        .map_err(|error| AppError::new("NAT_SEND", error.to_string()))?;

    let deadline = tokio::time::Instant::now() + STUN_TIMEOUT;
    let mut buffer = [0u8; MAX_STUN_DATAGRAM_BYTES];
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err(AppError::new("NAT_TIMEOUT", "STUN timed out"));
        }
        let (length, source) = timeout(remaining, socket.recv_from(&mut buffer))
            .await
            .map_err(|_| AppError::new("NAT_TIMEOUT", "STUN timed out"))?
            .map_err(|error| AppError::new("NAT_RECV", error.to_string()))?;

        // Ignore unrelated datagrams and stale/spoofed replies. Each server query owns its socket,
        // so a late response can never be mistaken for the next server's transaction.
        if source != server {
            continue;
        }
        if let Some(mapped) = parse_binding_response(&buffer[..length], &transaction_id) {
            return Ok(mapped);
        }
    }
}

fn parse_binding_response(datagram: &[u8], expected_id: &TransactionId) -> Option<SocketAddr> {
    let mut decoder = MessageDecoder::<Attribute>::new();
    let message = decoder
        .decode_from_bytes(datagram)
        .ok()?
        .map_err(|_| ())
        .ok()?;
    if message.class() != MessageClass::SuccessResponse
        || message.method() != methods::BINDING
        || message.transaction_id() != *expected_id
    {
        return None;
    }

    message
        .get_attribute::<XorMappedAddress>()
        .map(XorMappedAddress::address)
        .or_else(|| {
            message
                .get_attribute::<MappedAddress>()
                .map(MappedAddress::address)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn response_bytes(transaction_id: TransactionId, address: SocketAddr) -> Vec<u8> {
        let mut response = Message::<Attribute>::new(
            MessageClass::SuccessResponse,
            methods::BINDING,
            transaction_id,
        );
        response.add_attribute(XorMappedAddress::new(address));
        MessageEncoder::new()
            .encode_into_bytes(response)
            .expect("encode Binding response")
    }

    #[test]
    fn decodes_ipv4_and_ipv6_mapped_addresses() {
        let transaction_id = TransactionId::new([7; 12]);
        for address in [
            "203.0.113.4:4567".parse().expect("IPv4 socket address"),
            "[2001:db8::4]:4567".parse().expect("IPv6 socket address"),
        ] {
            let response = response_bytes(transaction_id.clone(), address);
            assert_eq!(
                parse_binding_response(&response, &transaction_id),
                Some(address)
            );
        }
    }

    #[test]
    fn rejects_wrong_transaction_id_and_malformed_packets() {
        let expected_id = TransactionId::new([1; 12]);
        let wrong_id = TransactionId::new([2; 12]);
        let response = response_bytes(wrong_id, "203.0.113.4:4567".parse().unwrap());
        assert_eq!(parse_binding_response(&response, &expected_id), None);
        assert_eq!(parse_binding_response(&[0; 19], &expected_id), None);
    }

    #[test]
    fn classifies_dns_and_query_timeouts_consistently() {
        assert_eq!(observation_status("NAT_DNS_TIMEOUT"), "timeout");
        assert_eq!(observation_status("NAT_TIMEOUT"), "timeout");
        assert_eq!(observation_status("NAT_DNS"), "unavailable");
    }

    #[tokio::test]
    async fn query_ignores_mismatched_transaction_before_accepting_valid_reply() {
        let server = UdpSocket::bind("127.0.0.1:0")
            .await
            .expect("bind test server");
        let server_address = server.local_addr().expect("server address");
        let mapped: SocketAddr = "198.51.100.8:4567".parse().expect("mapped address");
        let responder = tokio::spawn(async move {
            let mut request_bytes = [0u8; MAX_STUN_DATAGRAM_BYTES];
            let (length, peer) = server
                .recv_from(&mut request_bytes)
                .await
                .expect("receive request");
            let mut decoder = MessageDecoder::<Attribute>::new();
            let request = decoder
                .decode_from_bytes(&request_bytes[..length])
                .expect("decode request")
                .expect("complete request");
            let transaction_id = request.transaction_id();
            let wrong_id = TransactionId::new([9; 12]);
            server
                .send_to(&response_bytes(wrong_id, mapped), peer)
                .await
                .expect("send mismatched response");
            server
                .send_to(&response_bytes(transaction_id, mapped), peer)
                .await
                .expect("send valid response");
        });

        assert_eq!(probe_address(server_address).await.unwrap(), mapped);
        responder.await.expect("test server completed");
    }
}
