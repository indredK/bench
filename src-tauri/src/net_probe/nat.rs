//! NAT mapping observations via STUN Binding (RFC 8489).

use super::types::{NatProbeResult, NatProbeServerResult};
use crate::error::{AppError, AppResult};
use rtc_stun::message::Getter;
use rtc_stun::message::{Message, TransactionId, BINDING_REQUEST, BINDING_SUCCESS};
use rtc_stun::xoraddr::XorMappedAddress;
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
const STUN_TIMEOUT: Duration = Duration::from_secs(3);

pub async fn probe_nat(behavior_servers: Vec<String>) -> AppResult<NatProbeResult> {
    let command_hint = "probeNat(local) // multi-STUN Binding + optional RFC 5780".to_string();
    let started = Instant::now();

    let (server_results, behavior_results) = tokio::join!(
        probe_mapping_servers(),
        super::nat_behavior::probe_behavior_servers(&behavior_servers),
    );
    let (nat_type, mapped_address) = classify_mappings(&server_results);

    Ok(NatProbeResult {
        nat_type: nat_type.into(),
        mapped_address,
        stun_server: server_results
            .iter()
            .map(|server| server.server.as_str())
            .collect::<Vec<_>>()
            .join(", "),
        server_results,
        behavior_results,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

async fn probe_mapping_servers() -> Vec<NatProbeServerResult> {
    // Reuse one socket per address family so requests to different servers use a stable local
    // endpoint. IPv4 is preferred when a server publishes both address families.
    let mut socket_v4: Option<UdpSocket> = None;
    let mut socket_v6: Option<UdpSocket> = None;
    let mut server_results = Vec::with_capacity(STUN_SERVERS.len());

    for server_name in STUN_SERVERS {
        let server_started = Instant::now();
        let result = probe_server(server_name, &mut socket_v4, &mut socket_v6).await;

        server_results.push(match result {
            Ok(mapped_address) => NatProbeServerResult {
                server: (*server_name).to_string(),
                status: "mapped".into(),
                mapped_address: Some(mapped_address),
                elapsed_ms: server_started.elapsed().as_secs_f64() * 1000.0,
                error_code: None,
            },
            Err(error) if error.code == "NAT_TIMEOUT" => NatProbeServerResult {
                server: (*server_name).to_string(),
                status: "timeout".into(),
                mapped_address: None,
                elapsed_ms: server_started.elapsed().as_secs_f64() * 1000.0,
                error_code: Some(error.code),
            },
            Err(error) if error.code == "NAT_NO_MAPPING" => NatProbeServerResult {
                server: (*server_name).to_string(),
                status: "no-mapping".into(),
                mapped_address: None,
                elapsed_ms: server_started.elapsed().as_secs_f64() * 1000.0,
                error_code: Some(error.code),
            },
            Err(error) => NatProbeServerResult {
                server: (*server_name).to_string(),
                status: "error".into(),
                mapped_address: None,
                elapsed_ms: server_started.elapsed().as_secs_f64() * 1000.0,
                error_code: Some(error.code),
            },
        });
    }
    server_results
}

fn classify_mappings(results: &[NatProbeServerResult]) -> (&'static str, Option<String>) {
    let mapped_addresses: BTreeSet<_> = results
        .iter()
        .filter(|server| server.status == "mapped")
        .filter_map(|server| server.mapped_address.as_ref())
        .cloned()
        .collect();
    let responding_servers = results
        .iter()
        .filter(|server| server.status == "mapped")
        .count();

    match mapped_addresses.len() {
        0 if results.iter().any(|server| server.status == "no-mapping") => ("no-mapping", None),
        0 => ("blocked-or-timeout", None),
        1 if responding_servers == 1 => ("mapped-address", mapped_addresses.iter().next().cloned()),
        1 => (
            "consistent-mapping",
            mapped_addresses.iter().next().cloned(),
        ),
        // There is no representative address when servers disagree. Keep each observation in
        // `server_results` instead of selecting an arbitrary value for the summary field.
        _ => ("varying-mapping", None),
    }
}

async fn resolve_servers(server_name: &str) -> AppResult<Vec<SocketAddr>> {
    let mut addresses: Vec<_> = tokio::net::lookup_host(server_name)
        .await
        .map_err(|e| AppError::new("NAT_DNS", e.to_string()))?
        .collect();
    if addresses.is_empty() {
        return Err(AppError::new(
            "NAT_DNS",
            format!("No address for {server_name}"),
        ));
    }
    prefer_socket_families(&mut addresses);
    Ok(addresses)
}

fn prefer_socket_families(addresses: &mut Vec<SocketAddr>) {
    addresses.sort_by_key(SocketAddr::is_ipv6);
    addresses.dedup_by_key(|address| address.is_ipv6());
}

async fn probe_server(
    server_name: &str,
    socket_v4: &mut Option<UdpSocket>,
    socket_v6: &mut Option<UdpSocket>,
) -> AppResult<String> {
    let deadline = Instant::now() + STUN_TIMEOUT;
    let addresses = timeout(STUN_TIMEOUT, resolve_servers(server_name))
        .await
        .map_err(|_| AppError::new("NAT_DNS_TIMEOUT", "STUN server lookup timed out"))??;
    let mut last_error = None;

    for (index, server) in addresses.iter().copied().enumerate() {
        if server.is_ipv4() && socket_v4.is_none() {
            match UdpSocket::bind("0.0.0.0:0").await {
                Ok(socket) => *socket_v4 = Some(socket),
                Err(error) => last_error = Some(AppError::new("NAT_BIND_V4", error.to_string())),
            }
        } else if server.is_ipv6() && socket_v6.is_none() {
            match UdpSocket::bind("[::]:0").await {
                Ok(socket) => *socket_v6 = Some(socket),
                Err(error) => last_error = Some(AppError::new("NAT_BIND_V6", error.to_string())),
            }
        }

        let Some(socket) = (if server.is_ipv4() {
            socket_v4.as_ref()
        } else {
            socket_v6.as_ref()
        }) else {
            // Keep trying another address family when binding this one fails.
            continue;
        };

        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        let attempts_left = (addresses.len() - index) as u32;
        match probe_one(socket, server, remaining / attempts_left).await {
            Ok(mapped_address) => return Ok(mapped_address),
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error.unwrap_or_else(|| AppError::new("NAT_TIMEOUT", "STUN timed out")))
}

async fn probe_one(
    socket: &UdpSocket,
    server: SocketAddr,
    request_timeout: Duration,
) -> AppResult<String> {
    let transaction_id = TransactionId::new();
    let mut request = Message::new();
    request
        .build(&[Box::new(transaction_id), Box::new(BINDING_REQUEST)])
        .map_err(|e| AppError::new("NAT_STUN_ENCODE", e.to_string()))?;

    socket
        .send_to(&request.raw, server)
        .await
        .map_err(|e| AppError::new("NAT_SEND", e.to_string()))?;

    match timeout(
        request_timeout,
        receive_binding_response(socket, server, transaction_id),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => Err(AppError::new("NAT_TIMEOUT", "STUN timed out")),
    }
}

async fn receive_binding_response(
    socket: &UdpSocket,
    server: SocketAddr,
    transaction_id: TransactionId,
) -> AppResult<String> {
    let mut buf = [0u8; 1500];
    loop {
        let (n, source) = socket
            .recv_from(&mut buf)
            .await
            .map_err(|e| AppError::new("NAT_RECV", e.to_string()))?;
        if source != server {
            continue;
        }

        match decode_binding_response(&buf[..n], transaction_id)? {
            Some(mapped_address) => return Ok(mapped_address),
            None => continue,
        }
    }
}

fn decode_binding_response(
    bytes: &[u8],
    expected_transaction_id: TransactionId,
) -> AppResult<Option<String>> {
    let mut response = Message::new();
    if response.unmarshal_binary(bytes).is_err()
        || response.transaction_id != expected_transaction_id
    {
        // Ignore malformed and stale/unsolicited datagrams until the active request times out.
        return Ok(None);
    }
    if response.typ != BINDING_SUCCESS {
        return Err(AppError::new(
            "NAT_STUN_RESPONSE",
            "STUN returned a non-success Binding response",
        ));
    }

    let mut mapped = XorMappedAddress::default();
    mapped
        .get_from(&response)
        .map_err(|e| AppError::new("NAT_NO_MAPPING", e.to_string()))?;
    Ok(Some(mapped.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rtc_stun::message::BINDING_ERROR;
    use rtc_stun::xoraddr::XorMappedAddress;

    fn binding_response(transaction_id: TransactionId, mapped: SocketAddr) -> Vec<u8> {
        let mut message = Message::new();
        message
            .build(&[
                Box::new(transaction_id),
                Box::new(BINDING_SUCCESS),
                Box::new(XorMappedAddress {
                    ip: mapped.ip(),
                    port: mapped.port(),
                }),
            ])
            .expect("valid test response");
        message.raw
    }

    #[test]
    fn decodes_ipv4_and_ipv6_xor_mapped_addresses() {
        let transaction_id = TransactionId::new();
        let ipv4: SocketAddr = "203.0.113.9:54321".parse().unwrap();
        let ipv6: SocketAddr = "[2001:db8::9]:54321".parse().unwrap();

        assert_eq!(
            decode_binding_response(&binding_response(transaction_id, ipv4), transaction_id)
                .unwrap(),
            Some(ipv4.to_string())
        );
        assert_eq!(
            decode_binding_response(&binding_response(transaction_id, ipv6), transaction_id)
                .unwrap(),
            Some(ipv6.to_string())
        );
    }

    #[test]
    fn ignores_wrong_transaction_and_malformed_datagrams() {
        let expected = TransactionId::new();
        let stale = TransactionId::new();
        let mapped: SocketAddr = "203.0.113.9:54321".parse().unwrap();

        assert_eq!(
            decode_binding_response(&binding_response(stale, mapped), expected).unwrap(),
            None
        );
        assert_eq!(decode_binding_response(&[1, 2, 3], expected).unwrap(), None);
    }

    #[test]
    fn rejects_non_success_response_for_active_transaction() {
        let transaction_id = TransactionId::new();
        let mut message = Message::new();
        message
            .build(&[Box::new(transaction_id), Box::new(BINDING_ERROR)])
            .unwrap();

        let error = decode_binding_response(&message.raw, transaction_id).unwrap_err();
        assert_eq!(error.code, "NAT_STUN_RESPONSE");
    }

    #[tokio::test]
    async fn accepts_only_the_resolved_server_response() {
        let server = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let spoof = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let client = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let server_addr = server.local_addr().unwrap();
        let mapped: SocketAddr = "203.0.113.9:54321".parse().unwrap();

        tokio::spawn(async move {
            let mut request_bytes = [0; 1500];
            let (n, client_addr) = server.recv_from(&mut request_bytes).await.unwrap();
            let mut request = Message::new();
            request.unmarshal_binary(&request_bytes[..n]).unwrap();

            let stale_response = binding_response(TransactionId::new(), mapped);
            spoof.send_to(&stale_response, client_addr).await.unwrap();
            server.send_to(&stale_response, client_addr).await.unwrap();

            let valid_response = binding_response(request.transaction_id, mapped);
            server.send_to(&valid_response, client_addr).await.unwrap();
        });

        let result = timeout(
            Duration::from_secs(1),
            probe_one(&client, server_addr, Duration::from_millis(500)),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(result, mapped.to_string());
    }

    fn server_result(status: &str, mapped_address: Option<&str>) -> NatProbeServerResult {
        NatProbeServerResult {
            server: "stun.example:3478".into(),
            status: status.into(),
            mapped_address: mapped_address.map(str::to_owned),
            elapsed_ms: 0.0,
            error_code: None,
        }
    }

    #[test]
    fn classification_counts_only_successful_mapping_responses() {
        let (kind, address) = classify_mappings(&[
            server_result("mapped", Some("203.0.113.9:54321")),
            server_result("timeout", None),
            server_result("error", None),
        ]);
        assert_eq!(kind, "mapped-address");
        assert_eq!(address.as_deref(), Some("203.0.113.9:54321"));

        let (kind, address) = classify_mappings(&[
            server_result("mapped", Some("203.0.113.9:54321")),
            server_result("mapped", Some("203.0.113.9:54321")),
            server_result("timeout", None),
        ]);
        assert_eq!(kind, "consistent-mapping");
        assert_eq!(address.as_deref(), Some("203.0.113.9:54321"));
    }

    #[test]
    fn classification_does_not_call_cross_server_variation_symmetric_nat() {
        let (kind, address) = classify_mappings(&[
            server_result("mapped", Some("203.0.113.9:54321")),
            server_result("mapped", Some("198.51.100.3:31234")),
        ]);
        assert_eq!(kind, "varying-mapping");
        assert_eq!(address, None);
    }

    #[test]
    fn classification_reports_missing_mapping_separately_from_timeouts() {
        assert_eq!(
            classify_mappings(&[
                server_result("no-mapping", None),
                server_result("timeout", None),
            ])
            .0,
            "no-mapping"
        );
        assert_eq!(
            classify_mappings(&[server_result("timeout", None)]).0,
            "blocked-or-timeout"
        );
    }

    #[test]
    fn address_selection_prefers_ipv4_but_keeps_ipv6_fallback() {
        let mut addresses = vec![
            "[2001:db8::1]:3478".parse().unwrap(),
            "192.0.2.1:3478".parse().unwrap(),
            "192.0.2.2:3478".parse().unwrap(),
            "[2001:db8::2]:3478".parse().unwrap(),
        ];

        prefer_socket_families(&mut addresses);

        assert_eq!(addresses.len(), 2);
        assert!(addresses[0].is_ipv4());
        assert!(addresses[1].is_ipv6());
    }
}
