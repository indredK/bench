//! Self-hosted probe agent registry (S-DIS-05) — TLS endpoint + health check only.
//! Agents must expose an HTTPS health API or a WSS Ping/Pong endpoint; arbitrary shell is rejected.

use super::types::ProbeNode;
use crate::error::{AppError, AppResult};
use futures_util::{stream, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};
use tokio::net::{lookup_host, TcpStream};
use tokio_tungstenite::{
    client_async_tls_with_config,
    tungstenite::{protocol::WebSocketConfig, Message},
};
use url::{Host, Url};

// Agent registry commands can arrive concurrently (for example, a double-click in the UI).
// Keep read/modify/write operations serialized; the file itself is replaced atomically below.
static AGENT_REGISTRY_LOCK: Mutex<()> = Mutex::new(());

const MAX_CONCURRENT_AGENT_HEALTH_CHECKS: usize = 8;
const MAX_AGENT_REGISTRY_ENTRIES: usize = 256;
const MAX_AGENT_REGISTRY_BYTES: usize = 1024 * 1024;
const MAX_AGENT_LABEL_CHARACTERS: usize = 80;
const AGENT_HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const AGENT_WEBSOCKET_MESSAGE_LIMIT: usize = 4 * 1024;

fn lock_agent_registry() -> MutexGuard<'static, ()> {
    // The mutex protects no in-memory data, only the transaction boundary around a file.
    // Recovering a poisoned guard is safe because each persisted write is atomic.
    AGENT_REGISTRY_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecord {
    pub id: String,
    pub label: String,
    pub endpoint: String,
    #[serde(default)]
    pub token_hint: String,
}

fn agents_path(app: &AppHandle<impl Runtime>) -> AppResult<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::io(format!("app_data_dir: {e}")))?;
    let dir = base.join("network-probe");
    fs::create_dir_all(&dir).map_err(|e| AppError::io(format!("create dir: {e}")))?;
    Ok(dir.join("agents.json"))
}

pub fn load_agents(app: &AppHandle<impl Runtime>) -> AppResult<Vec<AgentRecord>> {
    let _guard = lock_agent_registry();
    load_agents_unlocked(app)
}

fn load_agents_unlocked(app: &AppHandle<impl Runtime>) -> AppResult<Vec<AgentRecord>> {
    let path = agents_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let file = fs::File::open(&path).map_err(|e| AppError::io(format!("read agents: {e}")))?;
    let mut bytes = Vec::with_capacity(MAX_AGENT_REGISTRY_BYTES + 1);
    file.take((MAX_AGENT_REGISTRY_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| AppError::io(format!("read agents: {e}")))?;
    parse_agent_registry(&bytes)
}

fn save_agents_unlocked(app: &AppHandle<impl Runtime>, agents: &[AgentRecord]) -> AppResult<()> {
    validate_agent_registry_count(agents.len())?;
    let path = agents_path(app)?;
    let json = serde_json::to_string_pretty(agents)
        .map_err(|e| AppError::io(format!("serialize agents: {e}")))?;
    if json.len() > MAX_AGENT_REGISTRY_BYTES {
        return Err(AppError::new(
            "AGENT_REGISTRY_TOO_LARGE",
            "Agent registry exceeds the 1 MiB storage limit",
        ));
    }
    crate::persistence::atomic_write(&path, json.as_bytes())
        .map_err(|e| AppError::io(format!("write agents: {e}")))
}

fn parse_agent_registry(bytes: &[u8]) -> AppResult<Vec<AgentRecord>> {
    if bytes.len() > MAX_AGENT_REGISTRY_BYTES {
        return Err(AppError::new(
            "AGENT_REGISTRY_TOO_LARGE",
            "Agent registry exceeds the 1 MiB storage limit",
        ));
    }
    let raw = std::str::from_utf8(bytes)
        .map_err(|e| AppError::io(format!("parse agents as UTF-8: {e}")))?;
    let agents: Vec<AgentRecord> =
        serde_json::from_str(raw).map_err(|e| AppError::io(format!("parse agents: {e}")))?;
    validate_agent_registry_count(agents.len())?;
    Ok(agents)
}

fn validate_agent_registry_count(count: usize) -> AppResult<()> {
    if count > MAX_AGENT_REGISTRY_ENTRIES {
        return Err(AppError::new(
            "AGENT_REGISTRY_ENTRY_LIMIT_EXCEEDED",
            format!("Agent registry supports at most {MAX_AGENT_REGISTRY_ENTRIES} entries"),
        ));
    }
    Ok(())
}

fn validate_endpoint(endpoint: &str) -> AppResult<Url> {
    let endpoint = endpoint.trim();
    if endpoint.len() > 2048 {
        return Err(AppError::invalid_input(
            "Agent endpoint must not exceed 2048 bytes",
        ));
    }
    let url = Url::parse(endpoint).map_err(|_| AppError::invalid_input("Invalid agent URL"))?;
    if url.scheme() != "https" && url.scheme() != "wss" {
        return Err(AppError::invalid_input(
            "Agent endpoint must be https:// or wss:// (no plaintext)",
        ));
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(AppError::invalid_input(
            "Agent endpoint must not embed credentials, query parameters, or fragments",
        ));
    }
    if is_cloud_metadata_host(&url) {
        return Err(AppError::new(
            "SSRF_BLOCKED",
            "Agent endpoint targets a cloud metadata service",
        ));
    }
    Ok(url)
}

fn validate_agent_label(label: &str) -> AppResult<String> {
    let label = label.trim();
    if label.is_empty() {
        return Err(AppError::invalid_input("Agent label cannot be empty"));
    }
    if label.chars().count() > MAX_AGENT_LABEL_CHARACTERS {
        return Err(AppError::invalid_input(
            "Agent label must not exceed 80 characters",
        ));
    }
    if label.chars().any(char::is_control) {
        return Err(AppError::invalid_input(
            "Agent label must not contain control characters",
        ));
    }
    Ok(label.to_string())
}

fn is_cloud_metadata_host(url: &Url) -> bool {
    match url.host() {
        Some(Host::Ipv4(address)) => is_cloud_metadata_ip(IpAddr::V4(address)),
        Some(Host::Ipv6(address)) => is_cloud_metadata_ip(IpAddr::V6(address)),
        Some(Host::Domain(host)) => {
            let host = host.trim_end_matches('.');
            host.eq_ignore_ascii_case("metadata")
                || host.eq_ignore_ascii_case("metadata.goog")
                || host.to_ascii_lowercase().ends_with(".metadata.goog")
                || host.eq_ignore_ascii_case("metadata.google.internal")
                || host
                    .to_ascii_lowercase()
                    .ends_with(".metadata.google.internal")
        }
        None => false,
    }
}

fn is_cloud_metadata_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => address == std::net::Ipv4Addr::new(169, 254, 169, 254),
        IpAddr::V6(address) => {
            address == std::net::Ipv6Addr::new(0xfd00, 0x0ec2, 0, 0, 0, 0, 0, 0x0254)
                || address == std::net::Ipv6Addr::new(0xfd20, 0x00ce, 0, 0, 0, 0, 0, 0x0254)
                || address
                    .to_ipv4_mapped()
                    .is_some_and(|mapped| mapped == std::net::Ipv4Addr::new(169, 254, 169, 254))
        }
    }
}

async fn resolve_endpoint_addresses(endpoint: &Url) -> AppResult<Option<Vec<SocketAddr>>> {
    let Some(port) = endpoint.port_or_known_default() else {
        return Ok(None);
    };
    let Some(host) = endpoint.host() else {
        return Ok(None);
    };
    let mut addresses = match host {
        Host::Ipv4(address) => vec![SocketAddr::new(IpAddr::V4(address), port)],
        Host::Ipv6(address) => vec![SocketAddr::new(IpAddr::V6(address), port)],
        Host::Domain(host) => match lookup_host((host, port)).await {
            Ok(addresses) => addresses.collect(),
            Err(_) => return Ok(None),
        },
    };
    validate_resolved_addresses(&mut addresses)?;
    Ok((!addresses.is_empty()).then_some(addresses))
}

fn validate_resolved_addresses(addresses: &mut Vec<SocketAddr>) -> AppResult<()> {
    addresses.sort_unstable();
    addresses.dedup();
    if contains_cloud_metadata_address(addresses) {
        return Err(AppError::new(
            "SSRF_BLOCKED",
            "Agent endpoint resolves to a cloud metadata service",
        ));
    }
    Ok(())
}

fn contains_cloud_metadata_address(addresses: &[SocketAddr]) -> bool {
    addresses
        .iter()
        .any(|address| is_cloud_metadata_ip(address.ip()))
}

pub async fn add_agent<R: Runtime>(
    app: &AppHandle<R>,
    label: String,
    endpoint: String,
) -> AppResult<ProbeNode> {
    let label = validate_agent_label(&label)?;
    let url = validate_endpoint(&endpoint)?;
    let endpoint = url.to_string();

    // Fail quickly at capacity rather than spending up to the health-check timeout.
    // Do not hold the registry lock across the network await; the capacity is checked
    // again by upsert after health_check to handle concurrent registrations safely.
    {
        let _guard = lock_agent_registry();
        let agents = load_agents_unlocked(app)?;
        ensure_agent_capacity(&agents, &label, &url)?;
    }

    let reachable = health_check(url.as_str()).await?;
    let _guard = lock_agent_registry();
    let mut agents = load_agents_unlocked(app)?;
    let candidate = AgentRecord {
        id: format!("agent-{}", uuid::Uuid::new_v4()),
        label,
        endpoint,
        token_hint: String::new(),
    };
    let (agent, inserted) = upsert_agent_record(&mut agents, candidate, &url)?;
    let node = agent_to_node(agent, reachable);
    if inserted {
        save_agents_unlocked(app, &agents)?;
    }
    Ok(node)
}

pub fn remove_agent(app: &AppHandle<impl Runtime>, agent_id: String) -> AppResult<()> {
    let _guard = lock_agent_registry();
    let mut agents = load_agents_unlocked(app)?;
    let before = agents.len();
    agents.retain(|a| a.id != agent_id);
    if agents.len() == before {
        return Err(AppError::invalid_input(format!(
            "Unknown agent: {agent_id}"
        )));
    }
    save_agents_unlocked(app, &agents)
}

pub async fn agents_as_nodes<R: Runtime + 'static>(
    app: &AppHandle<R>,
) -> AppResult<Vec<ProbeNode>> {
    let agents = load_agents(app)?;
    Ok(stream::iter(agents.into_iter().map(|agent| async move {
        let reachable = health_check(&agent.endpoint).await.unwrap_or(false);
        agent_to_node(&agent, reachable)
    }))
    .buffered(MAX_CONCURRENT_AGENT_HEALTH_CHECKS)
    .collect::<Vec<_>>()
    .await)
}

fn upsert_agent_record<'a>(
    agents: &'a mut Vec<AgentRecord>,
    candidate: AgentRecord,
    endpoint: &Url,
) -> AppResult<(&'a AgentRecord, bool)> {
    let existing_index = find_duplicate_agent(agents, &candidate.label, endpoint);
    if let Some(index) = existing_index {
        return Ok((&agents[index], false));
    }
    ensure_agent_capacity(agents, &candidate.label, endpoint)?;

    agents.push(candidate);
    agents
        .last()
        .map(|agent| (agent, true))
        .ok_or_else(|| AppError::internal("Agent registry insertion invariant failed"))
}

fn find_duplicate_agent(agents: &[AgentRecord], label: &str, endpoint: &Url) -> Option<usize> {
    agents.iter().position(|agent| {
        agent.label.trim() == label.trim()
            && Url::parse(agent.endpoint.trim()).is_ok_and(|stored| stored == *endpoint)
    })
}

fn ensure_agent_capacity(agents: &[AgentRecord], label: &str, endpoint: &Url) -> AppResult<()> {
    if find_duplicate_agent(agents, label, endpoint).is_some() {
        return Ok(());
    }
    if agents.len() >= MAX_AGENT_REGISTRY_ENTRIES {
        return Err(AppError::new(
            "AGENT_LIMIT_REACHED",
            format!("Agent registry supports at most {MAX_AGENT_REGISTRY_ENTRIES} entries"),
        ));
    }
    Ok(())
}

fn agent_to_node(agent: &AgentRecord, reachable: bool) -> ProbeNode {
    ProbeNode {
        id: agent.id.clone(),
        kind: "remote-agent".into(),
        label: agent.label.clone(),
        reachable,
        endpoint: Some(agent.endpoint.clone()),
        region: None,
        // The current agent protocol only checks endpoint health. Do not advertise
        // probe tools until remote execution and capability negotiation exist.
        capabilities: None,
    }
}

async fn health_check(endpoint: &str) -> AppResult<bool> {
    // Registry contents may come from an older app version or be edited outside the UI.
    // Reapply the same transport and SSRF rules before every outbound health check.
    let endpoint = validate_endpoint(endpoint)?;
    let health_endpoint = health_endpoint(&endpoint);
    let check = async move {
        let Some(addresses) = resolve_endpoint_addresses(&health_endpoint).await? else {
            return Ok(false);
        };
        let scheme = health_endpoint.scheme().to_string();
        Ok(match scheme.as_str() {
            "https" => http_health_check(health_endpoint, addresses).await,
            "wss" => websocket_health_check(health_endpoint, addresses).await,
            _ => false,
        })
    };
    match tokio::time::timeout(AGENT_HEALTH_CHECK_TIMEOUT, check).await {
        Ok(result) => result,
        Err(_) => Ok(false),
    }
}

fn health_endpoint(endpoint: &Url) -> Url {
    let mut health_endpoint = endpoint.clone();
    let base_path = endpoint.path().trim_end_matches('/');
    health_endpoint.set_path(&format!("{base_path}/v1/health"));
    health_endpoint
}

async fn http_health_check(endpoint: Url, addresses: Vec<SocketAddr>) -> bool {
    let mut builder = reqwest::Client::builder()
        .timeout(AGENT_HEALTH_CHECK_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Bench-NetworkProbe/1.0")
        // Agent checks use the exact DNS result validated above. A system proxy
        // could resolve the hostname again on its own and defeat that pin.
        .no_proxy();
    if let Some(Host::Domain(host)) = endpoint.host() {
        builder = builder.resolve_to_addrs(host, &addresses);
    }
    let client = match builder.build() {
        Ok(client) => client,
        Err(_) => return false,
    };
    matches!(
        client.get(endpoint).send().await,
        Ok(response) if response.status().is_success()
    )
}

async fn websocket_health_check(endpoint: Url, addresses: Vec<SocketAddr>) -> bool {
    // reqwest enables multiple rustls providers through feature unification.
    // Select one explicitly so the WSS path cannot stall while choosing a provider.
    let _ = rustls::crypto::ring::default_provider().install_default();

    let check = async move {
        // Connect the socket to the exact addresses checked above while letting
        // the WebSocket TLS layer retain the original host for SNI/certificate checks.
        let stream = TcpStream::connect(addresses.as_slice()).await.ok()?;
        let (socket, _) = client_async_tls_with_config(
            endpoint.as_str(),
            stream,
            Some(agent_websocket_config()),
            None,
        )
        .await
        .ok()?;
        Some(websocket_ping_pong(socket).await)
    };

    let mut check_task = tokio::spawn(check);
    match tokio::time::timeout(AGENT_HEALTH_CHECK_TIMEOUT, &mut check_task).await {
        Ok(Ok(Some(true))) => true,
        _ => {
            check_task.abort();
            false
        }
    }
}

fn agent_websocket_config() -> WebSocketConfig {
    WebSocketConfig::default()
        .read_buffer_size(AGENT_WEBSOCKET_MESSAGE_LIMIT)
        .write_buffer_size(AGENT_WEBSOCKET_MESSAGE_LIMIT)
        .max_write_buffer_size(AGENT_WEBSOCKET_MESSAGE_LIMIT * 4)
        .max_message_size(Some(AGENT_WEBSOCKET_MESSAGE_LIMIT))
        .max_frame_size(Some(AGENT_WEBSOCKET_MESSAGE_LIMIT))
}

async fn websocket_ping_pong<S>(mut socket: tokio_tungstenite::WebSocketStream<S>) -> bool
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    const PING_PAYLOAD: &[u8] = b"bench-health";

    if socket
        .send(Message::Ping(PING_PAYLOAD.to_vec().into()))
        .await
        .is_err()
    {
        return false;
    }

    while let Some(message) = socket.next().await {
        match message {
            Ok(Message::Pong(payload)) if payload.as_ref() == PING_PAYLOAD => {
                let _ = socket.send(Message::Close(None)).await;
                return true;
            }
            Ok(Message::Close(_)) | Err(_) => return false,
            _ => {}
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::{
        agent_to_node, health_check, health_endpoint, parse_agent_registry, upsert_agent_record,
        validate_agent_label, validate_endpoint, websocket_ping_pong, AgentRecord,
        MAX_AGENT_REGISTRY_BYTES, MAX_AGENT_REGISTRY_ENTRIES,
    };
    use std::time::Duration;
    use url::Url;

    #[test]
    fn adding_the_same_label_and_normalized_endpoint_is_idempotent() {
        let existing = AgentRecord {
            id: "agent-existing".into(),
            label: "Lab node".into(),
            endpoint: "https://agent.example:8443/".into(),
            token_hint: String::new(),
        };
        let mut agents = vec![existing.clone()];
        let candidate = AgentRecord {
            id: "agent-duplicate".into(),
            label: " Lab node ".into(),
            endpoint: "https://AGENT.example:8443".into(),
            token_hint: String::new(),
        };
        let endpoint = Url::parse("https://agent.example:8443/").unwrap();

        let (stored, inserted) = upsert_agent_record(&mut agents, candidate, &endpoint)
            .expect("agent should be returned");

        assert!(!inserted);
        assert_eq!(stored.id, "agent-existing");
        assert_eq!(agents.len(), 1);
    }

    #[test]
    fn same_endpoint_with_a_different_label_remains_a_distinct_registration() {
        let existing = AgentRecord {
            id: "agent-existing".into(),
            label: "Primary".into(),
            endpoint: "https://agent.example:8443/".into(),
            token_hint: String::new(),
        };
        let mut agents = vec![existing];
        let candidate = AgentRecord {
            id: "agent-alias".into(),
            label: "Backup label".into(),
            endpoint: "https://agent.example:8443".into(),
            token_hint: String::new(),
        };
        let endpoint = Url::parse("https://agent.example:8443/").unwrap();

        let (stored, inserted) = upsert_agent_record(&mut agents, candidate, &endpoint)
            .expect("agent should be returned");

        assert!(inserted);
        assert_eq!(stored.id, "agent-alias");
        assert_eq!(agents.len(), 2);
    }

    #[test]
    fn agent_registry_rejects_files_over_the_read_limit_before_parsing() {
        let oversized = vec![b' '; MAX_AGENT_REGISTRY_BYTES + 1];

        assert_eq!(
            parse_agent_registry(&oversized).unwrap_err().code,
            "AGENT_REGISTRY_TOO_LARGE"
        );
    }

    #[test]
    fn agent_registry_rejects_more_than_the_supported_entry_limit() {
        let records = (0..=MAX_AGENT_REGISTRY_ENTRIES)
            .map(|index| AgentRecord {
                id: format!("agent-{index}"),
                label: format!("Agent {index}"),
                endpoint: format!("https://agent-{index}.example"),
                token_hint: String::new(),
            })
            .collect::<Vec<_>>();
        let bytes = serde_json::to_vec(&records).unwrap();

        assert_eq!(
            parse_agent_registry(&bytes).unwrap_err().code,
            "AGENT_REGISTRY_ENTRY_LIMIT_EXCEEDED"
        );
    }

    #[test]
    fn adding_a_new_agent_respects_the_entry_limit_but_duplicates_stay_idempotent() {
        let mut agents = (0..MAX_AGENT_REGISTRY_ENTRIES)
            .map(|index| AgentRecord {
                id: format!("agent-{index}"),
                label: format!("Agent {index}"),
                endpoint: format!("https://agent-{index}.example"),
                token_hint: String::new(),
            })
            .collect::<Vec<_>>();
        let duplicate = agents[0].clone();
        let duplicate_url = Url::parse(&duplicate.endpoint).unwrap();
        assert!(
            !upsert_agent_record(&mut agents, duplicate, &duplicate_url)
                .unwrap()
                .1
        );

        let candidate = AgentRecord {
            id: "agent-over-limit".into(),
            label: "Over limit".into(),
            endpoint: "https://over-limit.example".into(),
            token_hint: String::new(),
        };
        let endpoint = Url::parse(&candidate.endpoint).unwrap();
        assert_eq!(
            upsert_agent_record(&mut agents, candidate, &endpoint)
                .unwrap_err()
                .code,
            "AGENT_LIMIT_REACHED"
        );
    }

    #[test]
    fn agent_label_is_trimmed_and_limited_to_80_characters() {
        assert_eq!(validate_agent_label(" Lab node ").unwrap(), "Lab node");
        assert_eq!(
            validate_agent_label(&"界".repeat(81)).unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn agent_label_rejects_control_characters() {
        assert_eq!(
            validate_agent_label("lab\nnode").unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn health_only_agent_does_not_advertise_unimplemented_probe_capabilities() {
        let agent = AgentRecord {
            id: "agent-health-only".into(),
            label: "Health only".into(),
            endpoint: "wss://agent.example.test".into(),
            token_hint: String::new(),
        };

        let node = agent_to_node(&agent, true);

        assert_eq!(node.kind, "remote-agent");
        assert!(node.reachable);
        assert_eq!(node.capabilities, None);
    }

    #[test]
    fn agent_health_endpoint_accepts_tls_transports_and_rejects_plaintext_or_url_secrets() {
        assert_eq!(
            validate_endpoint("wss://agent.example:8443")
                .unwrap()
                .scheme(),
            "wss"
        );
        assert!(validate_endpoint("https://agent.example:8443").is_ok());
        assert!(validate_endpoint("ws://agent.example:8443").is_err());
        assert!(validate_endpoint("http://agent.example:8443").is_err());
        assert!(validate_endpoint("https://user:secret@agent.example:8443").is_err());
        assert!(validate_endpoint("wss://agent.example:8443?token=secret").is_err());
        assert!(validate_endpoint("https://192.168.1.10:8443").is_ok());
    }

    #[test]
    fn agent_endpoint_blocks_ipv4_ipv6_and_named_cloud_metadata_hosts() {
        for endpoint in [
            "https://169.254.169.254/latest/meta-data/",
            "https://[fd00:ec2::254]/latest/meta-data/",
            "https://[fd20:ce::254]/computeMetadata/v1",
            "https://[::ffff:a9fe:a9fe]/latest/meta-data/",
            "https://metadata.goog/",
            "https://probe.metadata.goog/",
            "wss://metadata.google.internal/",
            "https://probe.metadata.google.internal/",
        ] {
            assert!(
                validate_endpoint(endpoint).is_err(),
                "cloud metadata host must be rejected: {endpoint}"
            );
        }
    }

    #[test]
    fn resolved_endpoint_rejects_metadata_address_even_with_safe_alternatives() {
        use super::validate_resolved_addresses;
        use std::net::SocketAddr;

        let mut safe_only = vec![SocketAddr::from(([192, 168, 1, 10], 8443))];
        let mut mixed = vec![
            SocketAddr::from(([192, 168, 1, 10], 8443)),
            SocketAddr::from(([169, 254, 169, 254], 8443)),
        ];
        let mut mixed_google_ipv6 = vec![
            SocketAddr::from(([192, 168, 1, 10], 8443)),
            SocketAddr::new("fd20:ce::254".parse().unwrap(), 8443),
        ];

        assert!(validate_resolved_addresses(&mut safe_only).is_ok());
        assert_eq!(
            validate_resolved_addresses(&mut mixed).unwrap_err().code,
            "SSRF_BLOCKED"
        );
        assert_eq!(
            validate_resolved_addresses(&mut mixed_google_ipv6)
                .unwrap_err()
                .code,
            "SSRF_BLOCKED"
        );
    }

    #[test]
    fn direct_cloud_metadata_endpoint_has_stable_ssrf_error_code() {
        let error = validate_endpoint("https://169.254.169.254/latest/meta-data/").unwrap_err();

        assert_eq!(error.code, "SSRF_BLOCKED");
    }

    #[tokio::test]
    async fn health_check_propagates_cloud_metadata_block_instead_of_unreachable() {
        let error = super::health_check("https://169.254.169.254/latest/meta-data/")
            .await
            .unwrap_err();

        assert_eq!(error.code, "SSRF_BLOCKED");
    }

    #[test]
    fn wss_health_endpoint_preserves_agent_base_path() {
        let endpoint = Url::parse("wss://agent.example.test/probe/").unwrap();

        assert_eq!(
            health_endpoint(&endpoint).as_str(),
            "wss://agent.example.test/probe/v1/health"
        );
    }

    #[test]
    fn https_health_endpoint_preserves_encoded_agent_base_path() {
        let endpoint = Url::parse("https://agent.example.test/base%20path").unwrap();

        assert_eq!(
            health_endpoint(&endpoint).as_str(),
            "https://agent.example.test/base%20path/v1/health"
        );
    }

    #[tokio::test]
    async fn health_check_rejects_legacy_or_tampered_endpoints_before_network_io() {
        for endpoint in [
            "http://127.0.0.1:9",
            "wss://qa-user:qa-password@127.0.0.1:9",
            "wss://127.0.0.1:9?token=secret",
            "https://169.254.169.254/latest/meta-data/",
            "https://[fd00:ec2::254]/latest/meta-data/",
            "https://[fd20:ce::254]/computeMetadata/v1",
            "https://metadata.goog/",
        ] {
            assert!(
                !super::health_check(endpoint).await.unwrap_or(false),
                "health check must reject invalid stored endpoint: {endpoint}"
            );
        }
    }

    #[tokio::test]
    async fn wss_health_check_times_out_when_tls_handshake_stalls() {
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (_socket, _) = listener.accept().await.unwrap();
            std::future::pending::<()>().await;
        });

        let result = tokio::time::timeout(
            Duration::from_secs(7),
            health_check(&format!("wss://{address}")),
        )
        .await;

        server.abort();
        assert!(
            matches!(result, Ok(Ok(false))),
            "a stalled WSS handshake must be bounded"
        );
    }

    #[tokio::test]
    async fn wss_health_check_accepts_only_a_matching_pong() {
        use futures_util::{SinkExt, StreamExt};
        use tokio::io::duplex;
        use tokio_tungstenite::{
            tungstenite::protocol::Role, tungstenite::Message, WebSocketStream,
        };

        let (client_io, server_io) = duplex(1024);
        let client = WebSocketStream::from_raw_socket(client_io, Role::Client, None).await;
        let mut server = WebSocketStream::from_raw_socket(server_io, Role::Server, None).await;
        let server_task = tokio::spawn(async move {
            let Some(Ok(Message::Ping(payload))) = server.next().await else {
                return false;
            };
            if server
                .send(Message::Pong(b"wrong-health-token".to_vec().into()))
                .await
                .is_err()
            {
                return false;
            }
            if server.send(Message::Pong(payload)).await.is_err() {
                return false;
            }
            matches!(server.next().await, Some(Ok(Message::Close(_))))
        });

        assert!(websocket_ping_pong(client).await);
        assert!(server_task.await.unwrap());
    }

    #[tokio::test]
    async fn wss_health_check_rejects_close_without_matching_pong() {
        use futures_util::{SinkExt, StreamExt};
        use tokio::io::duplex;
        use tokio_tungstenite::{
            tungstenite::protocol::Role, tungstenite::Message, WebSocketStream,
        };

        let (client_io, server_io) = duplex(1024);
        let client = WebSocketStream::from_raw_socket(client_io, Role::Client, None).await;
        let mut server = WebSocketStream::from_raw_socket(server_io, Role::Server, None).await;
        let server_task = tokio::spawn(async move {
            if !matches!(server.next().await, Some(Ok(Message::Ping(_)))) {
                return false;
            }
            server.send(Message::Close(None)).await.is_ok()
        });

        assert!(!websocket_ping_pong(client).await);
        assert!(server_task.await.unwrap());
    }

    #[tokio::test]
    async fn wss_health_check_rejects_oversized_unrelated_messages() {
        use futures_util::{SinkExt, StreamExt};
        use tokio::io::duplex;
        use tokio_tungstenite::{
            tungstenite::protocol::Role, tungstenite::Message, WebSocketStream,
        };

        let (client_io, server_io) = duplex(16 * 1024);
        let client = WebSocketStream::from_raw_socket(
            client_io,
            Role::Client,
            Some(super::agent_websocket_config()),
        )
        .await;
        let mut server = WebSocketStream::from_raw_socket(server_io, Role::Server, None).await;
        let server_task = tokio::spawn(async move {
            if !matches!(server.next().await, Some(Ok(Message::Ping(_)))) {
                return false;
            }
            server
                .send(Message::Binary(
                    vec![b'x'; super::AGENT_WEBSOCKET_MESSAGE_LIMIT + 1].into(),
                ))
                .await
                .is_ok()
        });

        assert!(!websocket_ping_pong(client).await);
        assert!(server_task.await.unwrap());
    }
}

/// Reject non-whitelist agent actions (S-DIS-05 negative).
pub fn reject_arbitrary_agent_exec(action: &str) -> AppResult<()> {
    let allowed = ["dns", "ping", "http", "health"];
    if allowed.contains(&action) {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "Agent action '{action}' is not in the whitelist (no shell / arbitrary exec)"
        )))
    }
}
