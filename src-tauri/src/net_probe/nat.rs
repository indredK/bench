//! NAT mapping consistency via multi-STUN Binding (design-discover §3.3).

use super::types::NatProbeResult;
use crate::error::{AppError, AppResult};
use std::collections::BTreeSet;
use std::net::SocketAddr;
use std::time::{Duration, Instant};
use stun_proto::agent::StunAgent;
use stun_proto::types::attribute::XorMappedAddress;
use stun_proto::types::message::{
    Message, MessageClass, MessageWrite, MessageWriteVec, TransactionId, BINDING,
};
use stun_proto::types::TransportType;
use stun_proto::Instant as StunInstant;
use tokio::net::UdpSocket;
use tokio::time::timeout;

const STUN_SERVERS: &[&str] = &[
    "stun.l.google.com:19302",
    "stun1.l.google.com:19302",
    "stun.cloudflare.com:3478",
];
const STUN_TIMEOUT: Duration = Duration::from_secs(3);

pub async fn probe_nat() -> AppResult<NatProbeResult> {
    let command_hint = "probeNat(local) // multi-STUN Binding (google/cloudflare)".to_string();
    let started = Instant::now();
    let mut resolved = Vec::with_capacity(STUN_SERVERS.len());
    let mut details = Vec::with_capacity(STUN_SERVERS.len());

    for server_name in STUN_SERVERS {
        match tokio::net::lookup_host(server_name).await {
            Ok(addresses) => {
                let addresses = addresses.collect::<Vec<_>>();
                if addresses.is_empty() {
                    details.push(format!("{server_name} → no address"));
                } else {
                    resolved.push((*server_name, addresses));
                }
            }
            Err(error) => details.push(format!("{server_name} → DNS: {error}")),
        }
    }

    // Use one socket and source port for every server in a family. Rebinding per server would
    // change the local endpoint and make the mapping comparison meaningless.
    let use_ipv4 = resolved
        .iter()
        .flat_map(|(_, addresses)| addresses)
        .any(SocketAddr::is_ipv4);
    let bind_address = if use_ipv4 { "0.0.0.0:0" } else { "[::]:0" };
    let socket = UdpSocket::bind(bind_address)
        .await
        .map_err(|error| AppError::new("NAT_BIND", error.to_string()))?;

    let mut mapped = BTreeSet::new();
    let mut used = Vec::new();
    let mut success_count = 0;
    for (server_name, addresses) in resolved {
        let server = addresses
            .into_iter()
            .find(|address| address.is_ipv4() == use_ipv4);
        let Some(server) = server else {
            details.push(format!("{server_name} → no address for selected IP family"));
            continue;
        };

        used.push(server_name.to_string());
        match probe_one(&socket, server).await {
            Ok(address) => {
                success_count += 1;
                details.push(format!("{server_name} → {address}"));
                mapped.insert(address);
            }
            Err(error) => details.push(format!("{server_name} → {error}")),
        }
    }

    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    let nat_type = mapping_status(success_count, mapped.len());
    let mapped_address = mapped.iter().next().map(ToString::to_string);
    let detail = match nat_type {
        "blocked-or-timeout" => Some(format!(
            "No STUN server returned a usable mapped address. {}",
            details.join("; ")
        )),
        "mapping-insufficient" => Some(format!(
            "Only {success_count} STUN server returned a usable mapped address, so mappings could not be compared. {}",
            details.join("; ")
        )),
        "mapping-consistent" => Some(format!(
            "Mapped address was consistent across {success_count} server(s). A Binding-only probe cannot determine the full NAT type. {}",
            details.join("; ")
        )),
        _ => Some(format!(
            "Mapped addresses differ across STUN servers; this may indicate destination-dependent mapping, but server load balancing can also cause variation: {}. {}",
            mapped
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(" | "),
            details.join("; ")
        )),
    };

    Ok(NatProbeResult {
        nat_type: nat_type.into(),
        mapped_address,
        stun_server: used.join(", "),
        detail,
        elapsed_ms,
        command_hint,
    })
}

fn mapping_status(success_count: usize, distinct_mapping_count: usize) -> &'static str {
    if success_count == 0 {
        "blocked-or-timeout"
    } else if success_count < 2 {
        "mapping-insufficient"
    } else if distinct_mapping_count == 1 {
        "mapping-consistent"
    } else {
        "mapping-varies"
    }
}

async fn probe_one(sock: &UdpSocket, server: SocketAddr) -> AppResult<SocketAddr> {
    sock.connect(server)
        .await
        .map_err(|error| AppError::new("NAT_CONNECT", error.to_string()))?;

    let request_bytes = Message::builder_request(BINDING, MessageWriteVec::new()).finish();
    let request = Message::from_bytes(&request_bytes)
        .map_err(|error| AppError::new("NAT_REQUEST", error.to_string()))?;
    let transaction_id = request.transaction_id();
    let mut agent = StunAgent::builder(
        TransportType::Udp,
        sock.local_addr()
            .map_err(|error| AppError::new("NAT_BIND", error.to_string()))?,
    )
    .remote_addr(server)
    .build();
    let transmission = agent
        .send_request(request_bytes, server, StunInstant::ZERO)
        .map_err(|error| AppError::new("NAT_REQUEST", error.to_string()))?;
    let packet = transmission.data.as_ref().to_vec();
    drop(transmission);
    sock.send(&packet)
        .await
        .map_err(|error| AppError::new("NAT_SEND", error.to_string()))?;

    let mut buffer = [0u8; 512];
    match timeout(STUN_TIMEOUT, async {
        loop {
            let length = sock.recv(&mut buffer).await?;
            if let Ok(response) = Message::from_bytes(&buffer[..length]) {
                if response.has_method(BINDING)
                    && response.class() == MessageClass::Success
                    && parse_binding_response(&buffer[..length], transaction_id).is_ok()
                    && agent.handle_stun_message_with_time(&response, server, StunInstant::ZERO)
                {
                    return parse_binding_response(&buffer[..length], transaction_id)
                        .map_err(std::io::Error::other);
                }
            }
        }
    })
    .await
    {
        Ok(Ok(address)) => Ok(address),
        Ok(Err(error)) => Err(AppError::new("NAT_RECV", error.to_string())),
        Err(_) => Err(AppError::new("NAT_TIMEOUT", "STUN timed out")),
    }
}

fn parse_binding_response(
    bytes: &[u8],
    expected_transaction_id: TransactionId,
) -> Result<SocketAddr, String> {
    let response = Message::from_bytes(bytes).map_err(|error| error.to_string())?;
    if !response.has_method(BINDING) || response.class() != MessageClass::Success {
        return Err("Unexpected STUN response type".into());
    }
    if response.transaction_id() != expected_transaction_id {
        return Err("STUN transaction ID did not match request".into());
    }
    response
        .attribute::<XorMappedAddress>()
        .map(|attribute| attribute.addr(expected_transaction_id))
        .map_err(|error| format!("Invalid STUN mapped-address attribute: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use stun_proto::types::attribute::XorMappedAddress;
    use stun_proto::types::message::MessageWriteExt;

    #[test]
    fn parses_ipv4_and_ipv6_mapped_addresses() {
        for address in [
            "203.0.113.4:53124".parse().unwrap(),
            "[2001:db8::4]:53124".parse().unwrap(),
        ] {
            let request = Message::builder_request(BINDING, MessageWriteVec::new()).finish();
            let request = Message::from_bytes(&request).unwrap();
            let transaction_id = request.transaction_id();
            let mut response = Message::builder_success(&request, MessageWriteVec::new());
            response
                .add_attribute(&XorMappedAddress::new(address, transaction_id))
                .unwrap();

            assert_eq!(
                parse_binding_response(&response.finish(), transaction_id),
                Ok(address)
            );
        }
    }

    #[test]
    fn rejects_response_with_wrong_transaction_id() {
        let request = Message::builder_request(BINDING, MessageWriteVec::new()).finish();
        let request = Message::from_bytes(&request).unwrap();
        let transaction_id = request.transaction_id();
        let mut response = Message::builder_success(&request, MessageWriteVec::new());
        response
            .add_attribute(&XorMappedAddress::new(
                "203.0.113.4:53124".parse().unwrap(),
                transaction_id,
            ))
            .unwrap();

        assert!(parse_binding_response(&response.finish(), TransactionId::generate()).is_err());
    }

    #[test]
    fn rejects_malformed_response() {
        assert!(parse_binding_response(&[0x01, 0x01, 0x00], TransactionId::generate()).is_err());
    }

    #[test]
    fn one_server_response_is_not_reported_as_consistent() {
        assert_eq!(mapping_status(1, 1), "mapping-insufficient");
    }

    #[test]
    fn mapping_status_requires_two_successes_and_distinguishes_variation() {
        assert_eq!(mapping_status(0, 0), "blocked-or-timeout");
        assert_eq!(mapping_status(2, 1), "mapping-consistent");
        assert_eq!(mapping_status(2, 2), "mapping-varies");
    }
}
