//! RFC 5780 NAT mapping and filtering behavior discovery.
//!
//! The probe deliberately reports inconclusive when the server or network path
//! cannot provide the evidence needed for a classification.

use rtc_stun::addr::{MappedAddress, OtherAddress};
use rtc_stun::attributes::{
    ATTR_CHANGE_REQUEST, ATTR_MAPPED_ADDRESS, ATTR_OTHER_ADDRESS, ATTR_XORMAPPED_ADDRESS,
};
use rtc_stun::error_code::{ErrorCodeAttribute, CODE_UNKNOWN_ATTRIBUTE};
use rtc_stun::message::{
    Getter, Message, TransactionId, BINDING_ERROR, BINDING_REQUEST, BINDING_SUCCESS, MAGIC_COOKIE,
    MESSAGE_HEADER_SIZE,
};
use rtc_stun::xoraddr::XorMappedAddress;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket as StdUdpSocket};
use std::time::Duration;
use tokio::net::UdpSocket;
use tokio::time::{timeout, Instant};

const RFC5780_SERVER: &str = "stun.voipgate.com:3478";
const RFC5780_TOTAL_DEADLINE: Duration = Duration::from_secs(9);
const RFC5780_RESPONSE_DEADLINE: Duration = Duration::from_millis(1_500);

const ENDPOINT_INDEPENDENT: &str = "endpoint-independent";
const ADDRESS_DEPENDENT: &str = "address-dependent";
const ADDRESS_AND_PORT_DEPENDENT: &str = "address-and-port-dependent";
const NO_NAT: &str = "no-nat";
const UNSUPPORTED: &str = "unsupported";
const INCONCLUSIVE: &str = "inconclusive";

#[derive(Debug)]
pub(super) struct Rfc5780Result {
    pub mapping_behavior: String,
    pub filtering_behavior: String,
    pub detail: String,
}

#[derive(Debug)]
struct BindingResponse {
    mapped_address: SocketAddr,
    other_address: Option<SocketAddr>,
}

#[derive(Debug)]
enum ProbeFailure {
    Timeout,
    Unsupported,
    ChangeRequestIgnored,
    Failed(String),
}

pub(super) async fn probe() -> Rfc5780Result {
    match timeout(RFC5780_TOTAL_DEADLINE, probe_inner()).await {
        Ok(Ok(result)) => result,
        Ok(Err(error)) => Rfc5780Result::inconclusive(error),
        Err(_) => Rfc5780Result::inconclusive(format!(
            "RFC 5780 probe exceeded the {RFC5780_TOTAL_DEADLINE:?} total deadline"
        )),
    }
}

impl Rfc5780Result {
    pub(super) fn inconclusive(detail: String) -> Self {
        Self {
            mapping_behavior: INCONCLUSIVE.to_string(),
            filtering_behavior: INCONCLUSIVE.to_string(),
            detail,
        }
    }
}

async fn probe_inner() -> Result<Rfc5780Result, String> {
    let primary = tokio::net::lookup_host(RFC5780_SERVER)
        .await
        .map_err(|error| format!("Could not resolve {RFC5780_SERVER}: {error}"))?
        .find(SocketAddr::is_ipv4)
        .ok_or_else(|| format!("No IPv4 address for {RFC5780_SERVER}"))?;

    let std::net::IpAddr::V4(primary_ip) = primary.ip() else {
        return Err(format!("{RFC5780_SERVER} resolved to a non-IPv4 address"));
    };
    if !is_public_ipv4(primary_ip) {
        return Err(format!(
            "{RFC5780_SERVER} resolved to a non-public IPv4 address; probe skipped"
        ));
    }

    let local_ip = route_ipv4(primary)?;
    let mapping_socket = bind_probe_socket(local_ip).await?;
    let local_endpoint = mapping_socket
        .local_addr()
        .map_err(|error| format!("Could not inspect local UDP socket: {error}"))?;

    let initial = match send_binding(&mapping_socket, primary, primary, None).await {
        Ok(response) => response,
        Err(error) => {
            let (status, note) = failure_status(&error);
            return Ok(Rfc5780Result {
                mapping_behavior: status.to_string(),
                filtering_behavior: status.to_string(),
                detail: format!("RFC 5780 initial binding test failed: {note}"),
            });
        }
    };

    let Some(other_address) = initial.other_address else {
        return Ok(Rfc5780Result {
            mapping_behavior: UNSUPPORTED.to_string(),
            filtering_behavior: UNSUPPORTED.to_string(),
            detail: format!(
                "{RFC5780_SERVER} returned a valid STUN mapping but no OTHER-ADDRESS; RFC 5780 behavior discovery is unsupported by this server"
            ),
        });
    };
    if !is_valid_other_address(primary, other_address) {
        return Ok(Rfc5780Result {
            mapping_behavior: UNSUPPORTED.to_string(),
            filtering_behavior: UNSUPPORTED.to_string(),
            detail: format!(
                "{RFC5780_SERVER} returned an invalid or non-public OTHER-ADDRESS; alternate probes were skipped"
            ),
        });
    }

    let (mapping_behavior, mapping_detail) = probe_mapping(
        &mapping_socket,
        primary,
        local_endpoint,
        &initial,
        other_address,
    )
    .await;

    // Filtering tests need a fresh source port that has not sent to either
    // alternate server endpoint. Reusing the mapping socket would open those
    // filtering holes and could make the result falsely permissive.
    let filtering_socket = match bind_probe_socket(local_ip).await {
        Ok(socket) => socket,
        Err(error) => {
            return Ok(Rfc5780Result {
                mapping_behavior,
                filtering_behavior: INCONCLUSIVE.to_string(),
                detail: format!("{mapping_detail}; could not bind filtering socket: {error}"),
            });
        }
    };
    let filtering_local = match filtering_socket.local_addr() {
        Ok(address) => address,
        Err(error) => {
            return Ok(Rfc5780Result {
                mapping_behavior,
                filtering_behavior: INCONCLUSIVE.to_string(),
                detail: format!("{mapping_detail}; could not inspect filtering socket: {error}"),
            });
        }
    };
    let filtering_behavior = match send_binding(&filtering_socket, primary, primary, None).await {
        Ok(response) => match response.other_address {
            Some(filtering_other) if is_valid_other_address(primary, filtering_other) => {
                let (behavior, detail) =
                    probe_filtering(&filtering_socket, primary, filtering_other).await;
                (behavior, detail)
            }
            Some(_) => (
                UNSUPPORTED.to_string(),
                "Filtering test returned an invalid or non-public OTHER-ADDRESS".to_string(),
            ),
            None => (
                UNSUPPORTED.to_string(),
                "Filtering test response omitted OTHER-ADDRESS".to_string(),
            ),
        },
        Err(error) => {
            let (status, detail) = failure_status(&error);
            (status.to_string(), format!("Filtering test: {detail}"))
        }
    };

    Ok(Rfc5780Result {
        mapping_behavior,
        filtering_behavior: filtering_behavior.0,
        detail: format!(
            "RFC 5780 server {RFC5780_SERVER}; mapping socket {local_endpoint}; filtering socket {filtering_local}; {mapping_detail}; {}",
            filtering_behavior.1
        ),
    })
}

async fn bind_probe_socket(local_ip: Ipv4Addr) -> Result<UdpSocket, String> {
    UdpSocket::bind(SocketAddrV4::new(local_ip, 0))
        .await
        .map_err(|error| format!("Could not bind RFC 5780 UDP socket: {error}"))
}

fn route_ipv4(primary: SocketAddr) -> Result<Ipv4Addr, String> {
    let route_socket = StdUdpSocket::bind("0.0.0.0:0")
        .map_err(|error| format!("Could not create route-discovery socket: {error}"))?;
    route_socket
        .connect(primary)
        .map_err(|error| format!("Could not select a route to {primary}: {error}"))?;
    match route_socket
        .local_addr()
        .map_err(|error| format!("Could not inspect route-discovery socket: {error}"))?
        .ip()
    {
        std::net::IpAddr::V4(ip) if !ip.is_unspecified() => Ok(ip),
        _ => Err("No local IPv4 route is available for RFC 5780".to_string()),
    }
}

async fn probe_mapping(
    socket: &UdpSocket,
    primary: SocketAddr,
    local_endpoint: SocketAddr,
    initial: &BindingResponse,
    other_address: SocketAddr,
) -> (String, String) {
    if initial.mapped_address == local_endpoint {
        return (
            NO_NAT.to_string(),
            "The STUN mapped endpoint matches the local socket endpoint".to_string(),
        );
    }

    let alternate_ip_primary_port = SocketAddr::new(other_address.ip(), primary.port());
    let second = match send_binding(
        socket,
        alternate_ip_primary_port,
        alternate_ip_primary_port,
        None,
    )
    .await
    {
        Ok(response) => response,
        Err(error) => {
            let (status, note) = failure_status(&error);
            return (
                status.to_string(),
                format!("Mapping test II did not produce a usable response: {note}"),
            );
        }
    };

    if second.mapped_address == initial.mapped_address {
        return (
            ENDPOINT_INDEPENDENT.to_string(),
            "Mapping tests I and II returned the same mapped endpoint".to_string(),
        );
    }

    let third = match send_binding(socket, other_address, other_address, None).await {
        Ok(response) => response,
        Err(error) => {
            let (status, note) = failure_status(&error);
            return (
                status.to_string(),
                format!("Mapping test III did not produce a usable response: {note}"),
            );
        }
    };

    if third.mapped_address == second.mapped_address {
        (
            ADDRESS_DEPENDENT.to_string(),
            "Mapping tests II and III returned the same mapped endpoint".to_string(),
        )
    } else {
        (
            ADDRESS_AND_PORT_DEPENDENT.to_string(),
            "Mapping tests II and III returned different mapped endpoints".to_string(),
        )
    }
}

async fn probe_filtering(
    socket: &UdpSocket,
    primary: SocketAddr,
    other_address: SocketAddr,
) -> (String, String) {
    match send_binding(socket, primary, other_address, Some(0x0000_0006)).await {
        Ok(_) => {
            return (
                ENDPOINT_INDEPENDENT.to_string(),
                "A response from the alternate IP and port passed the filtering test".to_string(),
            )
        }
        Err(ProbeFailure::Unsupported) => {
            return (
                UNSUPPORTED.to_string(),
                "The server rejected CHANGE-REQUEST (420 Unknown Attribute)".to_string(),
            )
        }
        Err(ProbeFailure::ChangeRequestIgnored) => {
            return (
                UNSUPPORTED.to_string(),
                "The server ignored CHANGE-REQUEST and replied from the primary endpoint"
                    .to_string(),
            )
        }
        Err(ProbeFailure::Failed(error)) => {
            return (
                INCONCLUSIVE.to_string(),
                format!("Filtering test II failed: {error}"),
            )
        }
        Err(ProbeFailure::Timeout) => {}
    }

    let alternate_ip_primary_port = SocketAddr::new(primary.ip(), other_address.port());
    match send_binding(
        socket,
        primary,
        alternate_ip_primary_port,
        Some(0x0000_0002),
    )
    .await
    {
        Ok(_) => (
            ADDRESS_DEPENDENT.to_string(),
            "Only a response from the primary IP and alternate port passed the filtering test".to_string(),
        ),
        Err(ProbeFailure::Unsupported) => (
            UNSUPPORTED.to_string(),
            "The server rejected CHANGE-REQUEST (420 Unknown Attribute)".to_string(),
        ),
        Err(ProbeFailure::ChangeRequestIgnored) => (
            UNSUPPORTED.to_string(),
            "The server ignored CHANGE-REQUEST and replied from the primary endpoint".to_string(),
        ),
        Err(ProbeFailure::Failed(error)) => (
            INCONCLUSIVE.to_string(),
            format!("Filtering test III failed: {error}"),
        ),
        Err(ProbeFailure::Timeout) => (
            ADDRESS_AND_PORT_DEPENDENT.to_string(),
            "No response arrived from either alternate source; RFC 5780 classifies this as address-and-port-dependent filtering, subject to server/path reachability".to_string(),
        ),
    }
}

async fn send_binding(
    socket: &UdpSocket,
    destination: SocketAddr,
    expected_source: SocketAddr,
    change_request: Option<u32>,
) -> Result<BindingResponse, ProbeFailure> {
    send_binding_with_deadline(
        socket,
        destination,
        expected_source,
        change_request,
        RFC5780_RESPONSE_DEADLINE,
    )
    .await
}

async fn send_binding_with_deadline(
    socket: &UdpSocket,
    destination: SocketAddr,
    expected_source: SocketAddr,
    change_request: Option<u32>,
    response_deadline: Duration,
) -> Result<BindingResponse, ProbeFailure> {
    let transaction_id = TransactionId::new();
    let request = encode_request(transaction_id, change_request).map_err(ProbeFailure::Failed)?;
    socket
        .send_to(&request, destination)
        .await
        .map_err(|error| ProbeFailure::Failed(format!("Could not send STUN request: {error}")))?;

    let mut buffer = [0u8; 1024];
    let deadline = Instant::now() + response_deadline;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(ProbeFailure::Timeout);
        }
        match timeout(remaining, socket.recv_from(&mut buffer)).await {
            Ok(Ok((length, source))) if source == expected_source || source == destination => {
                if let Some(response) = parse_response(&buffer[..length], &transaction_id) {
                    match response {
                        Err(error) => return Err(error),
                        Ok(response) if source == expected_source => return Ok(response),
                        Ok(_) if change_request.is_some() && source == destination => {
                            return Err(ProbeFailure::ChangeRequestIgnored)
                        }
                        Ok(_) => continue,
                    }
                }
            }
            Ok(Ok(_)) => continue,
            Ok(Err(error)) => {
                return Err(ProbeFailure::Failed(format!(
                    "Could not receive STUN response: {error}"
                )))
            }
            Err(_) => return Err(ProbeFailure::Timeout),
        }
    }
}

fn encode_request(
    transaction_id: TransactionId,
    change_request: Option<u32>,
) -> Result<Vec<u8>, String> {
    let mut request = Message::new();
    request
        .build(&[Box::new(transaction_id), Box::new(BINDING_REQUEST)])
        .map_err(|error| error.to_string())?;
    if let Some(flags) = change_request {
        request.add(ATTR_CHANGE_REQUEST, &flags.to_be_bytes());
    }
    Ok(request.raw)
}

fn parse_response(
    packet: &[u8],
    expected_transaction_id: &TransactionId,
) -> Option<Result<BindingResponse, ProbeFailure>> {
    if packet.len() < MESSAGE_HEADER_SIZE || packet[0] & 0b1100_0000 != 0 {
        return None;
    }
    let declared_len = u16::from_be_bytes([packet[2], packet[3]]) as usize;
    if !declared_len.is_multiple_of(4)
        || declared_len != packet.len().checked_sub(MESSAGE_HEADER_SIZE)?
        || packet[4..8] != MAGIC_COOKIE.to_be_bytes()
    {
        return None;
    }

    let mut response = Message::new();
    response.raw = packet.to_vec();
    response.decode().ok()?;
    if response.transaction_id != *expected_transaction_id {
        return None;
    }

    if response.typ == BINDING_ERROR {
        let mut error_code = ErrorCodeAttribute::default();
        if error_code.get_from(&response).is_err() {
            return Some(Err(ProbeFailure::Failed(
                "Malformed STUN error response".to_string(),
            )));
        }
        if error_code.code == CODE_UNKNOWN_ATTRIBUTE {
            return Some(Err(ProbeFailure::Unsupported));
        }
        return Some(Err(ProbeFailure::Failed(format!(
            "STUN server returned error {}",
            error_code.code.0
        ))));
    }
    if response.typ != BINDING_SUCCESS {
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
    let other_attributes: Vec<_> = response
        .attributes
        .0
        .iter()
        .filter(|attribute| attribute.typ == ATTR_OTHER_ADDRESS)
        .collect();
    if xor_attributes.len() != 1 || mapped_attributes.len() > 1 || other_attributes.len() > 1 {
        return Some(Err(ProbeFailure::Failed(
            "RFC 5780 response omitted or duplicated a required address attribute".to_string(),
        )));
    }
    for attribute in xor_attributes
        .iter()
        .chain(mapped_attributes.iter())
        .chain(other_attributes.iter())
    {
        if !super::nat::is_well_formed_address_value(&attribute.value) {
            return Some(Err(ProbeFailure::Failed(
                "RFC 5780 response contains a malformed address attribute".to_string(),
            )));
        }
    }

    let mut xor_mapped = XorMappedAddress::default();
    if xor_mapped.get_from(&response).is_err() {
        return Some(Err(ProbeFailure::Failed(
            "Could not decode STUN mapped address".to_string(),
        )));
    }
    let mapped_address = SocketAddr::new(xor_mapped.ip, xor_mapped.port);
    if !mapped_attributes.is_empty() {
        let mut mapped = MappedAddress::default();
        if mapped.get_from(&response).is_err() {
            return Some(Err(ProbeFailure::Failed(
                "Could not decode optional MAPPED-ADDRESS".to_string(),
            )));
        }
        if mapped_address != SocketAddr::new(mapped.ip, mapped.port) {
            return Some(Err(ProbeFailure::Failed(
                "MAPPED-ADDRESS and XOR-MAPPED-ADDRESS disagree".to_string(),
            )));
        }
    }

    let other_address = if other_attributes.is_empty() {
        None
    } else {
        let mut other = OtherAddress::default();
        if other.get_from_as(&response, ATTR_OTHER_ADDRESS).is_err() {
            return Some(Err(ProbeFailure::Failed(
                "Could not decode OTHER-ADDRESS".to_string(),
            )));
        }
        Some(SocketAddr::new(other.ip, other.port))
    };

    Some(Ok(BindingResponse {
        mapped_address,
        other_address,
    }))
}

fn failure_status(error: &ProbeFailure) -> (&'static str, String) {
    match error {
        ProbeFailure::Timeout => (
            INCONCLUSIVE,
            "STUN response timed out; timeout alone does not prove filtering".to_string(),
        ),
        ProbeFailure::Unsupported => (
            UNSUPPORTED,
            "STUN server rejected an RFC 5780 attribute".to_string(),
        ),
        ProbeFailure::ChangeRequestIgnored => (
            UNSUPPORTED,
            "STUN server ignored CHANGE-REQUEST and replied from the primary endpoint".to_string(),
        ),
        ProbeFailure::Failed(message) => (INCONCLUSIVE, message.clone()),
    }
}

fn is_valid_other_address(primary: SocketAddr, other: SocketAddr) -> bool {
    if primary.port() == 0
        || other.port() == 0
        || primary.ip() == other.ip()
        || primary.port() == other.port()
    {
        return false;
    }
    match other.ip() {
        std::net::IpAddr::V4(ip) => is_public_ipv4(ip),
        std::net::IpAddr::V6(_) => false,
    }
}

fn is_public_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(ip.is_unspecified()
        || ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_multicast()
        || ip.is_broadcast()
        || a == 0
        || (a == 100 && (64..=127).contains(&b)) // Shared address space (RFC 6598).
        || (a == 192 && b == 0 && c == 0) // IETF protocol assignments.
        || (a == 192 && b == 0 && c == 2) // Documentation (RFC 5737).
        || (a == 192 && b == 88 && c == 99) // Deprecated 6to4 relay anycast.
        || (a == 198 && (b == 18 || b == 19)) // Benchmarking (RFC 2544).
        || (a == 198 && b == 51 && c == 100) // Documentation (RFC 5737).
        || (a == 203 && b == 0 && c == 113) // Documentation (RFC 5737).
        || a >= 240)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rtc_stun::message::Setter;

    fn success_response(
        transaction_id: TransactionId,
        mapped_endpoint: SocketAddr,
        other_address: Option<SocketAddr>,
    ) -> Vec<u8> {
        success_response_with_legacy_mapping(transaction_id, mapped_endpoint, other_address, true)
    }

    fn success_response_with_legacy_mapping(
        transaction_id: TransactionId,
        mapped_endpoint: SocketAddr,
        other_address: Option<SocketAddr>,
        include_legacy_mapping: bool,
    ) -> Vec<u8> {
        let mut response = Message::new();
        response
            .build(&[Box::new(transaction_id), Box::new(BINDING_SUCCESS)])
            .unwrap();

        if include_legacy_mapping {
            let mapped = MappedAddress {
                ip: mapped_endpoint.ip(),
                port: mapped_endpoint.port(),
            };
            mapped.add_to(&mut response).unwrap();
        }
        XorMappedAddress {
            ip: mapped_endpoint.ip(),
            port: mapped_endpoint.port(),
        }
        .add_to(&mut response)
        .unwrap();
        if let Some(other_address) = other_address {
            OtherAddress {
                ip: other_address.ip(),
                port: other_address.port(),
            }
            .add_to_as(&mut response, ATTR_OTHER_ADDRESS)
            .unwrap();
        }
        response.raw
    }

    #[test]
    fn accepts_rfc8489_success_response_without_legacy_mapped_address() {
        let transaction_id = TransactionId([7; 12]);
        let mapped_endpoint = "203.0.113.20:40000".parse().unwrap();
        let other_address = "198.51.100.20:3479".parse().unwrap();
        let packet = success_response_with_legacy_mapping(
            transaction_id,
            mapped_endpoint,
            Some(other_address),
            false,
        );

        let parsed = parse_response(&packet, &transaction_id)
            .expect("valid STUN success response")
            .expect("valid RFC 5780 response");

        assert_eq!(parsed.mapped_address, mapped_endpoint);
        assert_eq!(parsed.other_address, Some(other_address));
    }

    #[test]
    fn change_request_flags_are_encoded_in_network_order() {
        let transaction_id = TransactionId([7; 12]);
        let packet = encode_request(transaction_id, Some(0x0000_0006)).unwrap();
        let mut message = Message::new();
        message.raw = packet;
        message.decode().unwrap();

        assert_eq!(
            message.get(ATTR_CHANGE_REQUEST).unwrap().as_slice(),
            &[0, 0, 0, 6]
        );
    }

    #[test]
    fn rejects_private_and_benchmarking_alternate_addresses() {
        let primary = "203.0.113.10:3478".parse().unwrap();
        for address in [
            "10.0.0.1:3478",
            "100.64.0.1:3478",
            "127.0.0.1:3478",
            "169.254.1.1:3478",
            "192.0.2.1:3478",
            "198.18.0.1:3478",
            "198.51.100.1:3478",
            "203.0.113.1:3478",
            "224.0.0.1:3478",
        ] {
            let address = address.parse().unwrap();
            assert!(!is_valid_other_address(primary, address), "{address}");
        }
    }

    #[test]
    fn rejects_server_alternate_address_with_same_ip() {
        let primary = "192.0.2.10:3478".parse().unwrap();
        let alternate = "192.0.2.10:3479".parse().unwrap();
        assert!(!is_valid_other_address(primary, alternate));
    }

    #[tokio::test]
    async fn accepts_change_request_response_only_from_alternate_source() {
        let primary = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let alternate = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let client = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let primary_address = primary.local_addr().unwrap();
        let alternate_address = alternate.local_addr().unwrap();

        let server = tokio::spawn(async move {
            let mut request_bytes = [0u8; 256];
            let (length, client_address) = primary.recv_from(&mut request_bytes).await.unwrap();
            let mut request = Message::new();
            request.raw = request_bytes[..length].to_vec();
            request.decode().unwrap();
            assert_eq!(
                request.get(ATTR_CHANGE_REQUEST).unwrap().as_slice(),
                &[0, 0, 0, 6]
            );

            let response = success_response(
                request.transaction_id,
                "203.0.113.9:40000".parse().unwrap(),
                Some(alternate_address),
            );
            alternate.send_to(&response, client_address).await.unwrap();
        });

        let response = send_binding(
            &client,
            primary_address,
            alternate_address,
            Some(0x0000_0006),
        )
        .await
        .unwrap();
        assert_eq!(response.other_address, Some(alternate_address));
        server.await.unwrap();
    }

    #[tokio::test]
    async fn classifies_success_response_from_primary_as_unsupported_for_change_request() {
        let primary = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let alternate = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let client = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let primary_address = primary.local_addr().unwrap();
        let alternate_address = alternate.local_addr().unwrap();

        let server = tokio::spawn(async move {
            let mut request_bytes = [0u8; 256];
            let (length, client_address) = primary.recv_from(&mut request_bytes).await.unwrap();
            let mut request = Message::new();
            request.raw = request_bytes[..length].to_vec();
            request.decode().unwrap();
            let response = success_response(
                request.transaction_id,
                "203.0.113.9:40000".parse().unwrap(),
                None,
            );
            primary.send_to(&response, client_address).await.unwrap();
        });

        let (behavior, detail) = probe_filtering(&client, primary_address, alternate_address).await;
        assert_eq!(behavior, UNSUPPORTED);
        assert!(detail.contains("ignored CHANGE-REQUEST"));
        server.await.unwrap();
    }
}
