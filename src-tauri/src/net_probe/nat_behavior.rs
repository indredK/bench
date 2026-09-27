//! RFC 5780 NAT behavior discovery using explicitly configured STUN servers.

use super::types::NatBehaviorServerResult;
use crate::error::{AppError, AppResult};
use futures_util::future::join_all;
use hickory_resolver::{proto::rr::RData, TokioResolver};
use rtc_stun::addr::MappedAddress;
use rtc_stun::attributes::{
    AttrType, RawAttribute, ATTR_CHANGE_REQUEST, ATTR_OTHER_ADDRESS, ATTR_RESPONSE_ORIGIN,
};
use rtc_stun::message::{
    Message, Setter, TransactionId, BINDING_ERROR, BINDING_REQUEST, BINDING_SUCCESS,
};
use rtc_stun::xoraddr::XorMappedAddress;
use std::collections::BTreeMap;
use std::net::{IpAddr, SocketAddr};
use std::str::FromStr;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::time::{sleep, timeout};

const MAX_BEHAVIOR_SERVERS: usize = 3;
const MAX_SRV_TARGETS: usize = 3;
const MAX_ADDRESSES_PER_TARGET: usize = 2;
const DNS_TIMEOUT: Duration = Duration::from_secs(3);
const TRANSACTION_TIMEOUT: Duration = Duration::from_millis(1_500);
const TRANSACTION_PACING: Duration = Duration::from_millis(100);
const RECEIVE_BUFFER_SIZE: usize = 1500;

const CHANGE_PORT: u32 = 0x02;
const CHANGE_IP_AND_PORT: u32 = 0x06;

#[derive(Clone, Debug, Eq, PartialEq)]
struct ServerInput {
    label: String,
    target: ServerTarget,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum ServerTarget {
    ServiceDomain(String),
    Endpoint { host: String, port: u16 },
    Socket(SocketAddr),
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ServiceTarget {
    priority: u16,
    weight: u16,
    host: String,
    port: u16,
}

enum ConfiguredServer {
    Probe(String),
    Reject(String),
}

#[derive(Clone, Debug)]
struct BindingObservation {
    mapped: SocketAddr,
    other_address: Option<SocketAddr>,
    response_origin: Option<SocketAddr>,
}

struct FilteringOutcome {
    behavior: Option<&'static str>,
    status: &'static str,
    mapping_test_two: Option<BindingObservation>,
    mapping_test_two_attempted: bool,
    error_code: Option<&'static str>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum InitialFailure {
    Timeout,
    Rejected,
    InvalidResponse,
    Network,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ProbeFailure {
    Rejected,
    InvalidResponse,
    Network,
}

pub(super) async fn probe_behavior_servers(
    configured_servers: &[String],
) -> Vec<NatBehaviorServerResult> {
    if configured_servers.is_empty() {
        return Vec::new();
    }

    let mut seen = std::collections::HashSet::new();
    let mut requests = Vec::with_capacity(configured_servers.len().min(MAX_BEHAVIOR_SERVERS));
    let mut accepted_count = 0;
    for server in configured_servers {
        let label = server.trim().to_string();
        if label.is_empty() || !seen.insert(label.to_ascii_lowercase()) {
            continue;
        }
        if accepted_count == MAX_BEHAVIOR_SERVERS {
            requests.push(ConfiguredServer::Reject(label));
            continue;
        }
        accepted_count += 1;
        requests.push(ConfiguredServer::Probe(label));
    }

    join_all(requests.iter().map(|request| async move {
        match request {
            ConfiguredServer::Probe(server) => probe_configured_server(server).await,
            ConfiguredServer::Reject(server) => failure_result(
                server.clone(),
                "NAT_BEHAVIOR_SERVER_LIMIT",
                "server-limit",
                Instant::now(),
            ),
        }
    }))
    .await
}

async fn probe_configured_server(server: &str) -> NatBehaviorServerResult {
    let started = Instant::now();
    let parsed = match parse_server_input(server) {
        Ok(parsed) => parsed,
        Err(()) => {
            return failure_result(
                server.to_string(),
                "NAT_BEHAVIOR_INVALID_SERVER",
                "invalid-server",
                started,
            )
        }
    };

    let targets = match resolve_targets(&parsed.target).await {
        Ok(targets) => targets,
        Err(error) => {
            let status = configuration_error_status(&error.code);
            return failure_result(server.to_string(), &error.code, status, started);
        }
    };

    let mut last_failure = InitialFailure::Timeout;
    for target in targets
        .into_iter()
        .take(MAX_SRV_TARGETS * MAX_ADDRESSES_PER_TARGET)
    {
        match probe_endpoint(target).await {
            Ok(mut result) => {
                result.server = parsed.label;
                result.elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
                return result;
            }
            Err(InitialFailure::Timeout) => last_failure = InitialFailure::Timeout,
            Err(failure) => last_failure = failure,
        }
    }

    let (status, error_code) = match last_failure {
        InitialFailure::Timeout => ("timeout", "NAT_BEHAVIOR_TIMEOUT"),
        InitialFailure::Rejected => ("unsupported", "NAT_BEHAVIOR_REJECTED"),
        InitialFailure::InvalidResponse => ("incompatible", "NAT_BEHAVIOR_RESPONSE"),
        InitialFailure::Network => ("error", "NAT_BEHAVIOR_NETWORK"),
    };
    failure_result(server.to_string(), error_code, status, started)
}

fn parse_server_input(input: &str) -> Result<ServerInput, ()> {
    let input = input.trim();
    if input.is_empty()
        || input.len() > 260
        || input
            .chars()
            .any(|c| c.is_whitespace() || matches!(c, '/' | '\\' | '?' | '#'))
    {
        return Err(());
    }

    if let Ok(address) = SocketAddr::from_str(input) {
        if address.port() == 0 {
            return Err(());
        }
        return Ok(ServerInput {
            label: input.to_string(),
            target: ServerTarget::Socket(address),
        });
    }

    if let Some((host, port)) = input.rsplit_once(':') {
        if !host.contains(':') {
            let port = port.parse::<u16>().map_err(|_| ())?;
            if port == 0 || host.is_empty() {
                return Err(());
            }
            validate_domain(host)?;
            return Ok(ServerInput {
                label: input.to_string(),
                target: ServerTarget::Endpoint {
                    host: host.to_string(),
                    port,
                },
            });
        }
        return Err(());
    }

    let domain = input.trim_end_matches('.');
    validate_domain(domain)?;
    Ok(ServerInput {
        label: input.to_string(),
        target: ServerTarget::ServiceDomain(domain.to_string()),
    })
}

fn validate_domain(domain: &str) -> Result<(), ()> {
    let name = hickory_resolver::proto::rr::Name::from_ascii(domain).map_err(|_| ())?;
    if name.is_root() {
        return Err(());
    }
    Ok(())
}

async fn resolve_targets(target: &ServerTarget) -> AppResult<Vec<SocketAddr>> {
    match target {
        ServerTarget::Socket(address) => Ok(vec![*address]),
        ServerTarget::Endpoint { host, port } => resolve_host_port(host, *port).await,
        ServerTarget::ServiceDomain(domain) => {
            let resolver = TokioResolver::builder_tokio()
                .map_err(|error| AppError::new("NAT_BEHAVIOR_DNS", error.to_string()))?
                .build()
                .map_err(|error| AppError::new("NAT_BEHAVIOR_DNS", error.to_string()))?;
            let query = format!("_stun-behavior._udp.{domain}.");
            let lookup = timeout(DNS_TIMEOUT, resolver.srv_lookup(query.as_str()))
                .await
                .map_err(|_| {
                    AppError::new("NAT_BEHAVIOR_DNS_TIMEOUT", "STUN SRV lookup timed out")
                })?
                .map_err(|error| AppError::new("NAT_BEHAVIOR_SRV", error.to_string()))?;
            let mut records: Vec<ServiceTarget> = lookup
                .answers()
                .iter()
                .filter_map(|record| match &record.data {
                    RData::SRV(srv) if srv.port != 0 && !srv.target.is_root() => {
                        Some(ServiceTarget {
                            priority: srv.priority,
                            weight: srv.weight,
                            host: srv.target.to_utf8(),
                            port: srv.port,
                        })
                    }
                    _ => None,
                })
                .collect();
            if records.is_empty() {
                return Err(AppError::new(
                    "NAT_BEHAVIOR_SRV",
                    "No usable _stun-behavior._udp SRV records",
                ));
            }
            let ordered = order_srv_targets(&mut records);
            let mut addresses = Vec::new();
            let resolutions = join_all(
                ordered
                    .into_iter()
                    .take(MAX_SRV_TARGETS)
                    .map(
                        |target| async move { resolve_host_port(&target.host, target.port).await },
                    ),
            )
            .await;
            let mut dns_timed_out = false;
            let mut last_resolution_error = None;
            for resolution in resolutions {
                match resolution {
                    Ok(mut resolved) => {
                        addresses.extend(resolved.drain(..).take(MAX_ADDRESSES_PER_TARGET));
                    }
                    Err(error) => {
                        dns_timed_out |= error.code == "NAT_BEHAVIOR_DNS_TIMEOUT";
                        last_resolution_error = Some(error);
                    }
                }
            }
            if addresses.is_empty() {
                return Err(if dns_timed_out {
                    AppError::new(
                        "NAT_BEHAVIOR_DNS_TIMEOUT",
                        "STUN service target lookup timed out",
                    )
                } else {
                    last_resolution_error.unwrap_or_else(|| {
                        AppError::new(
                            "NAT_BEHAVIOR_DNS",
                            "No STUN service target resolved to an IP address",
                        )
                    })
                });
            }
            Ok(deduplicate_srv_addresses(addresses))
        }
    }
}

fn order_srv_targets(records: &mut [ServiceTarget]) -> Vec<ServiceTarget> {
    let mut priorities = BTreeMap::<u16, Vec<ServiceTarget>>::new();
    for record in records.iter().cloned() {
        priorities.entry(record.priority).or_default().push(record);
    }

    let mut ordered = Vec::with_capacity(records.len());
    for (_, mut group) in priorities {
        group.sort_by_key(|record| record.weight != 0);
        while !group.is_empty() {
            let total_weight: u32 = group.iter().map(|record| u32::from(record.weight)).sum();
            let index = if total_weight == 0 {
                rand::random_range(0..group.len())
            } else {
                let selected = rand::random_range(0..=total_weight);
                let mut running = 0_u32;
                group
                    .iter()
                    .position(|record| {
                        running += u32::from(record.weight);
                        running >= selected
                    })
                    .unwrap_or(0)
            };
            ordered.push(group.remove(index));
        }
    }
    ordered
}

fn deduplicate_srv_addresses(mut addresses: Vec<SocketAddr>) -> Vec<SocketAddr> {
    // `resolve_host_port` already prefers IPv4 within each SRV target. Preserve that target
    // order here so address-family preference cannot outrank an SRV priority.
    let mut seen = std::collections::HashSet::new();
    addresses.retain(|address| seen.insert(*address));
    addresses.truncate(MAX_SRV_TARGETS * MAX_ADDRESSES_PER_TARGET);
    addresses
}

async fn resolve_host_port(host: &str, port: u16) -> AppResult<Vec<SocketAddr>> {
    let resolved = timeout(DNS_TIMEOUT, tokio::net::lookup_host((host, port)))
        .await
        .map_err(|_| AppError::new("NAT_BEHAVIOR_DNS_TIMEOUT", "STUN host lookup timed out"))?
        .map_err(|error| AppError::new("NAT_BEHAVIOR_DNS", error.to_string()))?;
    let mut addresses: Vec<_> = resolved.collect();
    if addresses.is_empty() {
        return Err(AppError::new(
            "NAT_BEHAVIOR_DNS",
            "STUN server hostname returned no addresses",
        ));
    }
    prefer_socket_families(&mut addresses);
    Ok(addresses)
}

fn prefer_socket_families(addresses: &mut Vec<SocketAddr>) {
    addresses.sort_by_key(SocketAddr::is_ipv6);
    addresses.dedup_by_key(|address| address.is_ipv6());
}

async fn probe_endpoint(server: SocketAddr) -> Result<NatBehaviorServerResult, InitialFailure> {
    let socket = if server.is_ipv4() {
        UdpSocket::bind("0.0.0.0:0").await
    } else {
        UdpSocket::bind("[::]:0").await
    }
    .map_err(|_| InitialFailure::Network)?;
    let started = Instant::now();
    let first = match send_binding_request(&socket, server, server, None).await {
        Ok(Some(response)) => response,
        Ok(None) => return Err(InitialFailure::Timeout),
        Err(ProbeFailure::Rejected) => return Err(InitialFailure::Rejected),
        Err(ProbeFailure::InvalidResponse) => return Err(InitialFailure::InvalidResponse),
        Err(ProbeFailure::Network) => return Err(InitialFailure::Network),
    };

    let origin = first
        .response_origin
        .filter(|origin| *origin == server)
        .ok_or(InitialFailure::InvalidResponse)?;
    let other = first.other_address.ok_or(InitialFailure::Rejected)?;
    if !valid_alternate_address(origin, other) {
        return Err(InitialFailure::InvalidResponse);
    }

    // RFC 5780 requires the filtering checks before mapping checks because earlier probes can
    // create NAT state. Test IV also supplies mapping test II, so a successful observation is
    // retained and reused below rather than sending the same packet twice.
    sleep(TRANSACTION_PACING).await;
    let filtering = probe_filtering(&socket, origin, other).await;
    let mut error_code = filtering.error_code.map(str::to_string);
    let mapping_test_two = if filtering.mapping_test_two_attempted {
        filtering.mapping_test_two
    } else {
        sleep(TRANSACTION_PACING).await;
        let destination = alternate_primary_port(origin, other);
        match send_binding_request(&socket, destination, destination, None).await {
            Ok(response) => response,
            Err(failure) => {
                error_code.get_or_insert_with(|| failure_code(failure).to_string());
                None
            }
        }
    };

    let (mapping_behavior, mapping_status) = match mapping_test_two {
        None => {
            let status = if filtering.mapping_test_two_attempted
                && filtering.status == "alternate-unreachable"
            {
                "alternate-unreachable"
            } else if filtering.mapping_test_two_attempted {
                filtering.status
            } else {
                "inconclusive"
            };
            if error_code.is_none() && status == "alternate-unreachable" {
                error_code = Some("NAT_BEHAVIOR_ALT_UNREACHABLE".to_string());
            }
            (None, status)
        }
        Some(second) if second.mapped == first.mapped => {
            (Some("endpoint-independent"), "classified")
        }
        Some(second) => {
            sleep(TRANSACTION_PACING).await;
            match send_binding_request(&socket, other, other, None).await {
                Ok(Some(third)) => (
                    classify_mapping(first.mapped, second.mapped, Some(third.mapped)),
                    "classified",
                ),
                Ok(None) => {
                    error_code.get_or_insert_with(|| "NAT_BEHAVIOR_ALT_UNREACHABLE".to_string());
                    (None, "inconclusive")
                }
                Err(failure) => {
                    error_code.get_or_insert_with(|| failure_code(failure).to_string());
                    (None, "error")
                }
            }
        }
    };

    let status = if mapping_behavior.is_some() && filtering.behavior.is_some() {
        "complete"
    } else {
        "partial"
    };
    Ok(NatBehaviorServerResult {
        server: String::new(),
        endpoint: Some(server.to_string()),
        status: status.to_string(),
        mapping_behavior: mapping_behavior.map(str::to_string),
        filtering_behavior: filtering.behavior.map(str::to_string),
        mapped_address: Some(first.mapped.to_string()),
        mapping_status: mapping_status.to_string(),
        filtering_status: filtering.status.to_string(),
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        error_code,
    })
}

async fn probe_filtering(
    socket: &UdpSocket,
    origin: SocketAddr,
    other: SocketAddr,
) -> FilteringOutcome {
    sleep(TRANSACTION_PACING).await;
    match send_binding_request(socket, origin, other, Some(CHANGE_IP_AND_PORT)).await {
        Ok(Some(_)) => {
            return filtering_outcome(
                classify_filtering(true, false, false),
                "classified",
                None,
                false,
                None,
            )
        }
        Err(failure) => return filtering_failure(failure, false),
        Ok(None) => {}
    }

    sleep(TRANSACTION_PACING).await;
    match send_binding_request(
        socket,
        origin,
        with_port(origin, other.port()),
        Some(CHANGE_PORT),
    )
    .await
    {
        Ok(Some(_)) => {
            return filtering_outcome(
                classify_filtering(false, true, false),
                "classified",
                None,
                false,
                None,
            )
        }
        Err(failure) => return filtering_failure(failure, false),
        Ok(None) => {}
    }

    sleep(TRANSACTION_PACING).await;
    let destination = alternate_primary_port(origin, other);
    match send_binding_request(socket, destination, destination, None).await {
        Ok(Some(response)) => filtering_outcome(
            classify_filtering(false, false, true),
            "classified",
            Some(response),
            true,
            None,
        ),
        Ok(None) => filtering_outcome(
            None,
            "alternate-unreachable",
            None,
            true,
            Some("NAT_BEHAVIOR_ALT_UNREACHABLE"),
        ),
        Err(failure) => filtering_failure(failure, true),
    }
}

fn filtering_failure(failure: ProbeFailure, mapping_test_two_attempted: bool) -> FilteringOutcome {
    filtering_outcome(
        None,
        failure_stage_status(failure),
        None,
        mapping_test_two_attempted,
        Some(failure_code(failure)),
    )
}

fn filtering_outcome(
    behavior: Option<&'static str>,
    status: &'static str,
    mapping_test_two: Option<BindingObservation>,
    mapping_test_two_attempted: bool,
    error_code: Option<&'static str>,
) -> FilteringOutcome {
    FilteringOutcome {
        behavior,
        status,
        mapping_test_two,
        mapping_test_two_attempted,
        error_code,
    }
}

fn failure_code(failure: ProbeFailure) -> &'static str {
    match failure {
        ProbeFailure::Rejected => "NAT_BEHAVIOR_REJECTED",
        ProbeFailure::InvalidResponse => "NAT_BEHAVIOR_RESPONSE",
        ProbeFailure::Network => "NAT_BEHAVIOR_NETWORK",
    }
}

fn failure_stage_status(failure: ProbeFailure) -> &'static str {
    match failure {
        ProbeFailure::Rejected => "unsupported",
        ProbeFailure::InvalidResponse => "incompatible",
        ProbeFailure::Network => "error",
    }
}

fn classify_filtering(
    change_ip_and_port_response: bool,
    change_port_response: bool,
    alternate_primary_port_response: bool,
) -> Option<&'static str> {
    if change_ip_and_port_response {
        Some("endpoint-independent")
    } else if change_port_response {
        Some("address-dependent")
    } else if alternate_primary_port_response {
        Some("address-and-port-dependent")
    } else {
        None
    }
}

fn classify_mapping(
    first: SocketAddr,
    second: SocketAddr,
    third: Option<SocketAddr>,
) -> Option<&'static str> {
    if first == second {
        Some("endpoint-independent")
    } else {
        third.map(|third| {
            if second == third {
                "address-dependent"
            } else {
                "address-and-port-dependent"
            }
        })
    }
}

fn with_port(address: SocketAddr, port: u16) -> SocketAddr {
    SocketAddr::new(address.ip(), port)
}

fn alternate_primary_port(primary: SocketAddr, alternate: SocketAddr) -> SocketAddr {
    SocketAddr::new(alternate.ip(), primary.port())
}

fn valid_alternate_address(primary: SocketAddr, alternate: SocketAddr) -> bool {
    primary.is_ipv4() == alternate.is_ipv4()
        && primary.ip() != alternate.ip()
        && primary.port() != alternate.port()
        && is_public_unicast(alternate.ip())
}

fn is_public_unicast(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            !ip.is_unspecified()
                && !ip.is_loopback()
                && !ip.is_private()
                && !ip.is_link_local()
                && !ip.is_multicast()
                && !ip.is_broadcast()
                && is_public_ipv4_range(ip)
        }
        IpAddr::V6(ip) => {
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return is_public_unicast(IpAddr::V4(mapped));
            }
            let segments = ip.segments();
            !ip.is_unspecified()
                && !ip.is_loopback()
                && !ip.is_multicast()
                && !ip.is_unicast_link_local()
                && !ip.is_unique_local()
                && segments[0] & 0xE000 == 0x2000
                && !(segments[0] == 0x2001 && segments[1] <= 0x01ff)
                && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
                && !(segments[0] == 0x3fff && segments[1] & 0xf000 == 0)
                && segments[0] != 0x2002
        }
    }
}

fn is_public_ipv4_range(ip: std::net::Ipv4Addr) -> bool {
    let [first, second, third, _] = ip.octets();
    !(first == 0
        || first == 100 && (64..=127).contains(&second)
        || first == 192 && second == 0 && (third == 0 || third == 2)
        || first == 192 && second == 88 && third == 99
        || first == 198 && (second == 18 || second == 19)
        || first == 198 && second == 51 && third == 100
        || first == 203 && second == 0 && third == 113
        || first >= 240)
}

async fn send_binding_request(
    socket: &UdpSocket,
    destination: SocketAddr,
    expected_response_from: SocketAddr,
    change_request: Option<u32>,
) -> Result<Option<BindingObservation>, ProbeFailure> {
    let transaction_id = TransactionId::new();
    let request_bytes = build_binding_request(transaction_id, change_request)?;
    socket
        .send_to(&request_bytes, destination)
        .await
        .map_err(|_| ProbeFailure::Network)?;

    match timeout(
        TRANSACTION_TIMEOUT,
        receive_binding_response(socket, expected_response_from, transaction_id),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => Ok(None),
    }
}

fn build_binding_request(
    transaction_id: TransactionId,
    change_request: Option<u32>,
) -> Result<Vec<u8>, ProbeFailure> {
    let mut request = Message::new();
    let mut setters: Vec<Box<dyn Setter + '_>> =
        vec![Box::new(transaction_id), Box::new(BINDING_REQUEST)];
    if let Some(flags) = change_request {
        setters.push(Box::new(RawAttribute {
            typ: ATTR_CHANGE_REQUEST,
            length: 4,
            value: flags.to_be_bytes().to_vec(),
        }));
    }
    request
        .build(&setters)
        .map_err(|_| ProbeFailure::InvalidResponse)?;
    Ok(request.raw)
}

async fn receive_binding_response(
    socket: &UdpSocket,
    expected_response_from: SocketAddr,
    transaction_id: TransactionId,
) -> Result<Option<BindingObservation>, ProbeFailure> {
    let mut buffer = [0_u8; RECEIVE_BUFFER_SIZE];
    loop {
        let (length, source) = socket
            .recv_from(&mut buffer)
            .await
            .map_err(|_| ProbeFailure::Network)?;
        if source != expected_response_from {
            continue;
        }
        match decode_binding_response(&buffer[..length], transaction_id)? {
            Some(response) => {
                if response.response_origin != Some(source) {
                    return Err(ProbeFailure::InvalidResponse);
                }
                return Ok(Some(response));
            }
            None => continue,
        }
    }
}

fn decode_binding_response(
    bytes: &[u8],
    expected_transaction_id: TransactionId,
) -> Result<Option<BindingObservation>, ProbeFailure> {
    let mut response = Message::new();
    if response.unmarshal_binary(bytes).is_err()
        || response.transaction_id != expected_transaction_id
    {
        return Ok(None);
    }
    if response.typ == BINDING_ERROR {
        return Err(ProbeFailure::Rejected);
    }
    if response.typ != BINDING_SUCCESS {
        return Ok(None);
    }

    let mapped = read_xor_address(&response, rtc_stun::attributes::ATTR_XORMAPPED_ADDRESS)?;
    let other_address = read_optional_address(&response, ATTR_OTHER_ADDRESS)?;
    let response_origin = read_optional_address(&response, ATTR_RESPONSE_ORIGIN)?;
    Ok(Some(BindingObservation {
        mapped,
        other_address,
        response_origin,
    }))
}

fn read_xor_address(
    message: &Message,
    attribute_type: AttrType,
) -> Result<SocketAddr, ProbeFailure> {
    let value = message
        .get(attribute_type)
        .map_err(|_| ProbeFailure::InvalidResponse)?;
    validate_address_value(&value)?;
    let mut address = XorMappedAddress::default();
    address
        .get_from_as(message, attribute_type)
        .map_err(|_| ProbeFailure::InvalidResponse)?;
    Ok(SocketAddr::new(address.ip, address.port))
}

fn read_optional_address(
    message: &Message,
    attribute_type: AttrType,
) -> Result<Option<SocketAddr>, ProbeFailure> {
    let value = match message.get(attribute_type) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    validate_address_value(&value)?;
    let mut address = MappedAddress::default();
    address
        .get_from_as(message, attribute_type)
        .map_err(|_| ProbeFailure::InvalidResponse)?;
    Ok(Some(SocketAddr::new(address.ip, address.port)))
}

fn validate_address_value(value: &[u8]) -> Result<(), ProbeFailure> {
    if value.len() < 4 || value[0] != 0 {
        return Err(ProbeFailure::InvalidResponse);
    }
    let expected_length = match value[1] {
        1 => 8,
        2 => 20,
        _ => return Err(ProbeFailure::InvalidResponse),
    };
    if value.len() != expected_length {
        return Err(ProbeFailure::InvalidResponse);
    }
    Ok(())
}

fn failure_result(
    server: String,
    error_code: &str,
    status: &str,
    started: Instant,
) -> NatBehaviorServerResult {
    let sub_status = match status {
        "unsupported" => "unsupported",
        "incompatible" => "incompatible",
        "timeout" => "no-response",
        _ => "error",
    };
    NatBehaviorServerResult {
        server,
        endpoint: None,
        status: status.to_string(),
        mapping_behavior: None,
        filtering_behavior: None,
        mapped_address: None,
        mapping_status: sub_status.to_string(),
        filtering_status: sub_status.to_string(),
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        error_code: Some(error_code.to_string()),
    }
}

fn configuration_error_status(error_code: &str) -> &'static str {
    match error_code {
        "NAT_BEHAVIOR_DNS_TIMEOUT" => "dns-timeout",
        "NAT_BEHAVIOR_DNS" => "dns-error",
        "NAT_BEHAVIOR_SRV" => "srv-unavailable",
        "NAT_BEHAVIOR_INVALID_SERVER" => "invalid-server",
        "NAT_BEHAVIOR_SERVER_LIMIT" => "server-limit",
        _ => "error",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_service_domains_and_explicit_endpoints() {
        assert_eq!(
            parse_server_input("example.org").unwrap().target,
            ServerTarget::ServiceDomain("example.org".into())
        );
        assert_eq!(
            parse_server_input("example.org.").unwrap().target,
            ServerTarget::ServiceDomain("example.org".into())
        );
        assert_eq!(
            parse_server_input("stun.example.org:3478").unwrap().target,
            ServerTarget::Endpoint {
                host: "stun.example.org".into(),
                port: 3478
            }
        );
        assert_eq!(
            parse_server_input("192.0.2.10:3478").unwrap().target,
            ServerTarget::Socket("192.0.2.10:3478".parse().unwrap())
        );
        assert_eq!(
            parse_server_input("[2001:db8::10]:3478").unwrap().target,
            ServerTarget::Socket("[2001:db8::10]:3478".parse().unwrap())
        );
        assert!(parse_server_input("192.0.2.10:0").is_err());
        assert!(parse_server_input("[2001:db8::10]:0").is_err());
    }

    #[test]
    fn rejects_url_syntax_invalid_ports_and_unbounded_input() {
        for invalid in [
            "",
            "stun:example.org:3478",
            "https://example.org",
            "host:0",
            "host:abc",
            "bad host",
            &"a".repeat(254),
        ] {
            assert!(parse_server_input(invalid).is_err(), "accepted {invalid:?}");
        }
    }

    #[test]
    fn srv_targets_are_priority_ordered_and_weighted_without_dropping_records() {
        let mut targets = vec![
            ServiceTarget {
                priority: 20,
                weight: 0,
                host: "late.example".into(),
                port: 3478,
            },
            ServiceTarget {
                priority: 10,
                weight: 10,
                host: "primary.example".into(),
                port: 3478,
            },
            ServiceTarget {
                priority: 10,
                weight: 0,
                host: "backup.example".into(),
                port: 3478,
            },
        ];
        let ordered = order_srv_targets(&mut targets);
        assert_eq!(ordered.len(), 3);
        assert!(ordered.iter().take(2).all(|target| target.priority == 10));
        assert_eq!(ordered[2].priority, 20);
    }

    #[test]
    fn resolved_srv_addresses_keep_priority_order_while_deduplicating() {
        let high_priority_v6: SocketAddr = "[2001:4860:4860::8888]:3478".parse().unwrap();
        let low_priority_v4: SocketAddr = "8.8.8.8:3478".parse().unwrap();
        let fallback_v4: SocketAddr = "1.1.1.1:3478".parse().unwrap();

        let addresses = deduplicate_srv_addresses(vec![
            high_priority_v6,
            low_priority_v4,
            low_priority_v4,
            fallback_v4,
        ]);

        assert_eq!(
            addresses,
            vec![high_priority_v6, low_priority_v4, fallback_v4]
        );
    }

    #[test]
    fn refuses_private_or_non_alternate_server_addresses() {
        let primary: SocketAddr = "198.51.100.8:3478".parse().unwrap();
        assert!(!valid_alternate_address(
            primary,
            "10.0.0.2:3479".parse().unwrap()
        ));
        assert!(!valid_alternate_address(
            primary,
            "127.0.0.2:3479".parse().unwrap()
        ));
        assert!(!valid_alternate_address(
            primary,
            "198.51.100.8:3479".parse().unwrap()
        ));
        assert!(!valid_alternate_address(
            primary,
            "198.51.100.9:3478".parse().unwrap()
        ));
        assert!(!valid_alternate_address(
            primary,
            "203.0.113.8:3479".parse().unwrap()
        ));
        assert!(valid_alternate_address(
            primary,
            "8.8.8.8:3479".parse().unwrap()
        ));
        assert!(!is_public_unicast("100.64.0.1".parse().unwrap()));
        assert!(!is_public_unicast("198.18.0.1".parse().unwrap()));
        assert!(!is_public_unicast("2001:db8::1".parse().unwrap()));
        assert!(!is_public_unicast("3fff::1".parse().unwrap()));
        assert!(is_public_unicast("2001:4860:4860::8888".parse().unwrap()));
    }

    #[test]
    fn address_attribute_lengths_and_families_are_checked_before_library_decode() {
        assert!(validate_address_value(&[0, 1, 0, 1, 1, 2, 3, 4]).is_ok());
        assert!(validate_address_value(&[0, 2, 0, 1, 0, 0, 0, 0]).is_err());
        assert!(validate_address_value(&[0, 1, 0, 1, 1]).is_err());
        assert!(validate_address_value(&[0, 3, 0, 1, 1, 2, 3, 4]).is_err());
    }

    #[test]
    fn binding_requests_encode_rfc5780_change_request_flags() {
        for (flags, expected) in [(CHANGE_PORT, 0x02_u32), (CHANGE_IP_AND_PORT, 0x06_u32)] {
            let bytes = build_binding_request(TransactionId::new(), Some(flags)).unwrap();
            let mut request = Message::new();
            request.unmarshal_binary(&bytes).unwrap();
            let attribute = request.get(ATTR_CHANGE_REQUEST).unwrap();
            assert_eq!(u32::from_be_bytes(attribute.try_into().unwrap()), expected);
        }
    }

    #[tokio::test]
    async fn loopback_exchange_decodes_origin_and_change_request_packet() {
        let server = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let server_address = server.local_addr().unwrap();
        let client = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let mapped: SocketAddr = "203.0.113.8:41234".parse().unwrap();
        let other: SocketAddr = "127.0.0.2:3479".parse().unwrap();

        let server_task = tokio::spawn(async move {
            let mut buffer = [0_u8; 1500];
            for expected_flags in [None, Some(CHANGE_IP_AND_PORT)] {
                let (length, client_address) = server.recv_from(&mut buffer).await.unwrap();
                let mut request = Message::new();
                request.unmarshal_binary(&buffer[..length]).unwrap();
                assert_eq!(request.typ, BINDING_REQUEST);
                let flags = request
                    .get(ATTR_CHANGE_REQUEST)
                    .ok()
                    .map(|value| u32::from_be_bytes(value.try_into().unwrap()));
                assert_eq!(flags, expected_flags);
                let response =
                    binding_success_response(request.transaction_id, mapped, other, server_address);
                server.send_to(&response, client_address).await.unwrap();
            }
        });

        let initial = send_binding_request(&client, server_address, server_address, None)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(initial.mapped, mapped);
        assert_eq!(initial.other_address, Some(other));
        assert_eq!(initial.response_origin, Some(server_address));

        let changed = send_binding_request(
            &client,
            server_address,
            server_address,
            Some(CHANGE_IP_AND_PORT),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(changed.mapped, mapped);
        server_task.await.unwrap();
        assert!(!valid_alternate_address(server_address, other));
    }

    fn binding_success_response(
        transaction_id: TransactionId,
        mapped: SocketAddr,
        other_address: SocketAddr,
        response_origin: SocketAddr,
    ) -> Vec<u8> {
        let other_value = address_attribute_value(other_address);
        let origin_value = address_attribute_value(response_origin);
        let mut response = Message::new();
        response
            .build(&[
                Box::new(transaction_id),
                Box::new(BINDING_SUCCESS),
                Box::new(XorMappedAddress {
                    ip: mapped.ip(),
                    port: mapped.port(),
                }),
                Box::new(RawAttribute {
                    typ: ATTR_OTHER_ADDRESS,
                    length: other_value.len() as u16,
                    value: other_value,
                }),
                Box::new(RawAttribute {
                    typ: ATTR_RESPONSE_ORIGIN,
                    length: origin_value.len() as u16,
                    value: origin_value,
                }),
            ])
            .unwrap();
        response.raw
    }

    fn address_attribute_value(address: SocketAddr) -> Vec<u8> {
        let mut value = Vec::with_capacity(if address.is_ipv4() { 8 } else { 20 });
        value.extend_from_slice(&[0, if address.is_ipv4() { 1 } else { 2 }]);
        value.extend_from_slice(&address.port().to_be_bytes());
        match address.ip() {
            IpAddr::V4(ip) => value.extend_from_slice(&ip.octets()),
            IpAddr::V6(ip) => value.extend_from_slice(&ip.octets()),
        }
        value
    }

    #[test]
    fn alternate_endpoint_helpers_preserve_protocol_address_roles() {
        let primary: SocketAddr = "192.0.2.1:3478".parse().unwrap();
        let alternate: SocketAddr = "192.0.2.2:3479".parse().unwrap();
        assert_eq!(
            alternate_primary_port(primary, alternate),
            "192.0.2.2:3478".parse().unwrap()
        );
        assert_eq!(
            with_port(primary, alternate.port()),
            "192.0.2.1:3479".parse().unwrap()
        );
    }

    #[test]
    fn filtering_requires_the_fourth_check_before_reporting_address_and_port_dependent() {
        assert_eq!(
            classify_filtering(true, false, false),
            Some("endpoint-independent")
        );
        assert_eq!(
            classify_filtering(false, true, false),
            Some("address-dependent")
        );
        assert_eq!(
            classify_filtering(false, false, true),
            Some("address-and-port-dependent")
        );
        assert_eq!(classify_filtering(false, false, false), None);
    }

    #[test]
    fn mapping_classification_needs_alternate_address_and_port_observations() {
        let first: SocketAddr = "203.0.113.1:40000".parse().unwrap();
        let same_port_other_address: SocketAddr = "203.0.113.2:40000".parse().unwrap();
        let different_port: SocketAddr = "203.0.113.2:41000".parse().unwrap();
        let another_mapping: SocketAddr = "203.0.113.3:42000".parse().unwrap();

        assert_eq!(
            classify_mapping(first, first, None),
            Some("endpoint-independent")
        );
        assert_eq!(
            classify_mapping(
                first,
                same_port_other_address,
                Some(same_port_other_address)
            ),
            Some("address-dependent")
        );
        assert_eq!(
            classify_mapping(first, same_port_other_address, Some(another_mapping)),
            Some("address-and-port-dependent")
        );
        assert_eq!(
            classify_mapping(first, different_port, None),
            None,
            "one different mapping without the third observation is inconclusive"
        );
    }

    #[tokio::test]
    async fn invalid_sources_and_server_limit_keep_source_rows_in_order() {
        let results = probe_behavior_servers(&[
            "bad host 1".into(),
            "bad host 2".into(),
            "bad host 3".into(),
            "bad host 4".into(),
        ])
        .await;
        assert_eq!(results.len(), 4);
        assert_eq!(results[0].status, "invalid-server");
        assert_eq!(results[1].status, "invalid-server");
        assert_eq!(results[2].status, "invalid-server");
        assert_eq!(results[3].status, "server-limit");
    }
}
