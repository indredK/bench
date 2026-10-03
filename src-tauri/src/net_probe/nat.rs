//! NAT mapping observations via concurrent STUN Binding requests.

use super::types::NatProbeResult;
use crate::error::{AppError, AppResult};
use rtc_stun::addr::MappedAddress;
use rtc_stun::attributes::{ATTR_MAPPED_ADDRESS, ATTR_XORMAPPED_ADDRESS};
use rtc_stun::message::{
    Getter, Message, TransactionId, BINDING_REQUEST, BINDING_SUCCESS, MAGIC_COOKIE,
    MESSAGE_HEADER_SIZE,
};
use rtc_stun::xoraddr::XorMappedAddress;
use std::future::Future;
use std::net::SocketAddr;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::task::JoinSet;
use tokio::time::timeout;

const STUN_SERVERS: &[&str] = &[
    "stun.l.google.com:19302",
    "stun1.l.google.com:19302",
    "stun.cloudflare.com:3478",
];
const SERVER_PROBE_DEADLINE: Duration = Duration::from_secs(5);
const UDP_RESPONSE_DEADLINE: Duration = Duration::from_secs(3);

enum NatProbeTaskResult {
    Server(&'static str, AppResult<SocketAddr>),
    Rfc5780(super::nat_behavior::Rfc5780Result),
}

pub async fn probe_nat() -> AppResult<NatProbeResult> {
    let command_hint =
        "probeNat(local) // multi-STUN mapping + RFC 5780 behavior discovery".to_string();
    let started = Instant::now();

    let mut observations = Vec::new();
    let mut details = Vec::new();
    let mut attempted = Vec::new();

    // Separate sockets let all server probes run together without stealing each other's UDP replies.
    let mut probes = JoinSet::new();
    for &server_name in STUN_SERVERS {
        probes.spawn(async move {
            NatProbeTaskResult::Server(server_name, probe_one(server_name).await)
        });
    }
    probes.spawn(async { NatProbeTaskResult::Rfc5780(super::nat_behavior::probe().await) });

    let mut results = Vec::with_capacity(STUN_SERVERS.len());
    let mut behavior = None;
    while let Some(result) = probes.join_next().await {
        match result {
            Ok(NatProbeTaskResult::Server(server_name, result)) => {
                results.push((server_name, result))
            }
            Ok(NatProbeTaskResult::Rfc5780(result)) => behavior = Some(result),
            Err(error) => details.push(format!("STUN probe task failed: {error}")),
        }
    }
    results.sort_by(|left, right| left.0.cmp(right.0));

    for (server_name, result) in results {
        attempted.push(server_name.to_string());
        match result {
            Ok(addr) => {
                observations.push(addr);
                details.push(format!("{server_name} → {addr}"));
            }
            Err(error) => details.push(format!("{server_name} → {error}")),
        }
    }

    let behavior = behavior.unwrap_or_else(|| {
        super::nat_behavior::Rfc5780Result::inconclusive(
            "RFC 5780 probe task did not return a result".to_string(),
        )
    });
    details.push(behavior.detail.clone());

    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    let (nat_type, mapped_address) = classify_mappings(&observations);
    let detail = Some(format!(
        "{} valid STUN response(s) from {} configured server(s). Mapping comparisons are indicative only; they do not classify NAT filtering behavior. {}",
        observations.len(),
        attempted.len(),
        details.join("; ")
    ));

    Ok(NatProbeResult {
        nat_type: nat_type.to_string(),
        mapping_behavior: behavior.mapping_behavior,
        filtering_behavior: behavior.filtering_behavior,
        mapped_address: mapped_address.map(|addr| addr.to_string()),
        stun_server: attempted.join(", "),
        detail,
        elapsed_ms,
        command_hint,
    })
}

fn classify_mappings(observations: &[SocketAddr]) -> (&'static str, Option<SocketAddr>) {
    match observations {
        [] => ("blocked-or-timeout", None),
        [address] => ("insufficient-evidence", Some(*address)),
        [first, rest @ ..] => {
            if rest.iter().all(|address| address == first) {
                ("consistent-mapping", Some(*first))
            } else {
                ("mapping-varies", None)
            }
        }
    }
}

async fn probe_one(server_name: &'static str) -> AppResult<SocketAddr> {
    with_server_deadline(SERVER_PROBE_DEADLINE, probe_one_with_deadline(server_name)).await
}

async fn with_server_deadline<T, F>(deadline: Duration, future: F) -> AppResult<T>
where
    F: Future<Output = AppResult<T>>,
{
    timeout(deadline, future).await.map_err(|_| {
        AppError::new(
            "NAT_TIMEOUT",
            format!("STUN DNS lookup and probe exceeded the {deadline:?} server deadline"),
        )
    })?
}

async fn probe_one_with_deadline(server_name: &'static str) -> AppResult<SocketAddr> {
    let server = tokio::net::lookup_host(server_name)
        .await
        .map_err(|error| AppError::new("NAT_DNS", error.to_string()))?
        .find(SocketAddr::is_ipv4)
        .ok_or_else(|| AppError::new("NAT_DNS", format!("No IPv4 address for {server_name}")))?;

    let sock = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|error| AppError::new("NAT_BIND", error.to_string()))?;
    probe_server(&sock, server).await
}

async fn probe_server(sock: &UdpSocket, server: SocketAddr) -> AppResult<SocketAddr> {
    let transaction_id = TransactionId::new();
    let request = encode_binding_request(transaction_id)?;

    sock.send_to(&request, server)
        .await
        .map_err(|error| AppError::new("NAT_SEND", error.to_string()))?;

    let mut buf = [0u8; 512];
    let deadline = tokio::time::Instant::now() + UDP_RESPONSE_DEADLINE;
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err(AppError::new("NAT_TIMEOUT", "STUN timed out"));
        }
        match timeout(remaining, sock.recv_from(&mut buf)).await {
            Ok(Ok((length, source))) if source == server => {
                if let Some(address) = parse_binding_response(&buf[..length], &transaction_id) {
                    return Ok(address);
                }
            }
            Ok(Ok(_)) => continue,
            Ok(Err(error)) => return Err(AppError::new("NAT_RECV", error.to_string())),
            Err(_) => return Err(AppError::new("NAT_TIMEOUT", "STUN timed out")),
        }
    }
}

fn encode_binding_request(transaction_id: TransactionId) -> AppResult<Vec<u8>> {
    let mut request = Message::new();
    request
        .build(&[Box::new(transaction_id), Box::new(BINDING_REQUEST)])
        .map_err(|error| AppError::new("NAT_ENCODE", error.to_string()))?;
    Ok(request.raw)
}

fn parse_binding_response(
    msg: &[u8],
    expected_transaction_id: &TransactionId,
) -> Option<SocketAddr> {
    if msg.len() < MESSAGE_HEADER_SIZE || msg[0] & 0b1100_0000 != 0 {
        return None;
    }
    let declared_len = u16::from_be_bytes([msg[2], msg[3]]) as usize;
    if !declared_len.is_multiple_of(4)
        || declared_len != msg.len().checked_sub(MESSAGE_HEADER_SIZE)?
        || msg[4..8] != MAGIC_COOKIE.to_be_bytes()
    {
        return None;
    }

    let mut response = Message::new();
    response.raw = msg.to_vec();
    response.decode().ok()?;
    if response.typ != BINDING_SUCCESS || response.transaction_id != *expected_transaction_id {
        return None;
    }

    let xor_attributes: Vec<_> = response
        .attributes
        .0
        .iter()
        .filter(|attribute| attribute.typ == ATTR_XORMAPPED_ADDRESS)
        .collect();
    let mapped_attributes: Vec<_> = response
        .attributes
        .0
        .iter()
        .filter(|attribute| attribute.typ == ATTR_MAPPED_ADDRESS)
        .collect();
    if xor_attributes.len() > 1 || mapped_attributes.len() > 1 {
        return None;
    }
    for attribute in xor_attributes.iter().chain(mapped_attributes.iter()) {
        if !is_well_formed_address_value(&attribute.value) {
            return None;
        }
    }

    if !xor_attributes.is_empty() {
        let mut mapped = XorMappedAddress::default();
        mapped.get_from(&response).ok()?;
        Some(SocketAddr::new(mapped.ip, mapped.port))
    } else if !mapped_attributes.is_empty() {
        let mut mapped = MappedAddress::default();
        mapped.get_from(&response).ok()?;
        Some(SocketAddr::new(mapped.ip, mapped.port))
    } else {
        None
    }
}

pub(super) fn is_well_formed_address_value(value: &[u8]) -> bool {
    value.first() == Some(&0)
        && ((value.get(1) == Some(&1) && value.len() == 8)
            || (value.get(1) == Some(&2) && value.len() == 20))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::IpAddr;

    fn binding_response(
        transaction_id: &TransactionId,
        address: SocketAddr,
        xor_mapped: bool,
    ) -> Vec<u8> {
        let (family, ip_bytes) = match address.ip() {
            IpAddr::V4(ip) => (0x01, ip.octets().to_vec()),
            IpAddr::V6(ip) => (0x02, ip.octets().to_vec()),
        };
        let mut value = Vec::with_capacity(4 + ip_bytes.len());
        value.push(0);
        value.push(family);
        let port = if xor_mapped {
            address.port() ^ ((MAGIC_COOKIE >> 16) as u16)
        } else {
            address.port()
        };
        value.extend_from_slice(&port.to_be_bytes());
        for (index, octet) in ip_bytes.into_iter().enumerate() {
            let mask = if !xor_mapped {
                0
            } else if index < 4 {
                MAGIC_COOKIE.to_be_bytes()[index]
            } else {
                transaction_id.0[index - 4]
            };
            value.push(octet ^ mask);
        }

        let mut response = Vec::with_capacity(MESSAGE_HEADER_SIZE + 4 + value.len());
        response.extend_from_slice(&[0x01, 0x01]);
        response.extend_from_slice(&((4 + value.len()) as u16).to_be_bytes());
        response.extend_from_slice(&MAGIC_COOKIE.to_be_bytes());
        response.extend_from_slice(&transaction_id.0);
        response.extend_from_slice(&(if xor_mapped { 0x0020u16 } else { 0x0001u16 }).to_be_bytes());
        response.extend_from_slice(&(value.len() as u16).to_be_bytes());
        response.extend_from_slice(&value);
        response
    }

    #[test]
    fn encodes_a_binding_request_with_a_crypto_random_transaction_id() {
        let transaction_id = TransactionId::new();
        let request = encode_binding_request(transaction_id).unwrap();
        let mut decoded = Message::new();
        decoded.raw = request;
        decoded.decode().unwrap();

        assert_eq!(decoded.typ, BINDING_REQUEST);
        assert_eq!(decoded.transaction_id, transaction_id);
        assert!(decoded.attributes.0.is_empty());
    }

    #[test]
    fn parses_xor_mapped_ipv4_and_ipv6_and_legacy_mapped_addresses() {
        let transaction_id = TransactionId([7u8; 12]);
        for (address, xor_mapped) in [
            ("203.0.113.12:4567".parse().unwrap(), true),
            ("[2001:db8::12]:4567".parse().unwrap(), true),
            ("203.0.113.15:9999".parse().unwrap(), false),
        ] {
            let response = binding_response(&transaction_id, address, xor_mapped);
            assert_eq!(
                parse_binding_response(&response, &transaction_id),
                Some(address)
            );
        }
    }

    #[test]
    fn rejects_wrong_transactions_duplicate_or_malformed_mappings_and_trailing_bytes() {
        let transaction_id = TransactionId([7u8; 12]);
        let address = "203.0.113.12:4567".parse().unwrap();
        let valid = binding_response(&transaction_id, address, true);
        assert_eq!(
            parse_binding_response(&valid, &TransactionId([8u8; 12])),
            None
        );

        let mut duplicate = valid.clone();
        duplicate.extend_from_slice(&valid[MESSAGE_HEADER_SIZE..]);
        let duplicate_attributes_len = duplicate.len() - MESSAGE_HEADER_SIZE;
        duplicate[2..4].copy_from_slice(&(duplicate_attributes_len as u16).to_be_bytes());
        assert_eq!(parse_binding_response(&duplicate, &transaction_id), None);

        let mut malformed = valid.clone();
        malformed[25] = 0x02;
        assert_eq!(parse_binding_response(&malformed, &transaction_id), None);

        let mut trailing = valid;
        trailing.extend_from_slice(&[0, 0, 0, 0]);
        assert_eq!(parse_binding_response(&trailing, &transaction_id), None);
    }

    #[test]
    fn classifies_only_the_evidence_available_from_successful_servers() {
        let first: SocketAddr = "203.0.113.12:4567".parse().unwrap();
        let second: SocketAddr = "203.0.113.15:4567".parse().unwrap();

        assert_eq!(classify_mappings(&[]), ("blocked-or-timeout", None));
        assert_eq!(
            classify_mappings(&[first]),
            ("insufficient-evidence", Some(first))
        );
        assert_eq!(
            classify_mappings(&[first, first]),
            ("consistent-mapping", Some(first))
        );
        assert_eq!(
            classify_mappings(&[first, second]),
            ("mapping-varies", None)
        );
    }

    #[tokio::test]
    async fn applies_the_deadline_to_the_full_server_probe_future() {
        let result = with_server_deadline(
            Duration::from_millis(1),
            std::future::pending::<AppResult<SocketAddr>>(),
        )
        .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn probe_server_ignores_wrong_transactions_and_unexpected_sources() {
        let server = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let server_addr = server.local_addr().unwrap();
        let spoof = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let client = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let expected_address = "203.0.113.12:4567".parse().unwrap();

        let responder = tokio::spawn(async move {
            let mut request = [0u8; 64];
            let (length, client_addr) = server.recv_from(&mut request).await.unwrap();
            assert_eq!(length, MESSAGE_HEADER_SIZE);
            let transaction_id = TransactionId(request[8..20].try_into().unwrap());

            let wrong_transaction = binding_response(
                &TransactionId([3u8; 12]),
                "203.0.113.30:3000".parse().unwrap(),
                true,
            );
            server
                .send_to(&wrong_transaction, client_addr)
                .await
                .unwrap();

            let spoofed_response =
                binding_response(&transaction_id, "203.0.113.40:4000".parse().unwrap(), true);
            spoof.send_to(&spoofed_response, client_addr).await.unwrap();

            let valid_response = binding_response(&transaction_id, expected_address, true);
            server.send_to(&valid_response, client_addr).await.unwrap();
        });

        let actual = probe_server(&client, server_addr).await.unwrap();
        responder.await.unwrap();
        assert_eq!(actual, expected_address);
    }
}
