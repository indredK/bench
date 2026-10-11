//! Self-hosted probe agent registry (S-DIS-05) — TLS endpoint + health check only.
//! Agents must expose an HTTPS health API or a WSS Ping/Pong endpoint; arbitrary shell is rejected.

use super::types::ProbeNode;
use crate::error::{AppError, AppResult};
use futures_util::{stream, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};
use tokio_tungstenite::tungstenite::Message;
use url::Url;

// Agent registry commands can arrive concurrently (for example, a double-click in the UI).
// Keep read/modify/write operations serialized; the file itself is replaced atomically below.
static AGENT_REGISTRY_LOCK: Mutex<()> = Mutex::new(());

const MAX_CONCURRENT_AGENT_HEALTH_CHECKS: usize = 8;
const AGENT_HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(5);

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
    let raw = fs::read_to_string(&path).map_err(|e| AppError::io(format!("read agents: {e}")))?;
    serde_json::from_str(&raw).map_err(|e| AppError::io(format!("parse agents: {e}")))
}

fn save_agents_unlocked(app: &AppHandle<impl Runtime>, agents: &[AgentRecord]) -> AppResult<()> {
    let path = agents_path(app)?;
    let json = serde_json::to_string_pretty(agents)
        .map_err(|e| AppError::io(format!("serialize agents: {e}")))?;
    crate::persistence::atomic_write(&path, json.as_bytes())
        .map_err(|e| AppError::io(format!("write agents: {e}")))
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
    let host = url.host_str().unwrap_or("");
    // Block known cloud metadata hosts; private/LAN endpoints remain valid for self-hosted agents.
    let blocked = ["169.254.169.254", "metadata.google.internal", "metadata"];
    if blocked.iter().any(|b| host.eq_ignore_ascii_case(b)) {
        return Err(AppError::invalid_input(
            "Agent endpoint blocked (SSRF guard)",
        ));
    }
    Ok(url)
}

pub async fn add_agent<R: Runtime>(
    app: &AppHandle<R>,
    label: String,
    endpoint: String,
) -> AppResult<ProbeNode> {
    let label = label.trim().to_string();
    if label.is_empty() {
        return Err(AppError::invalid_input("Agent label cannot be empty"));
    }
    let url = validate_endpoint(&endpoint)?;
    let endpoint = url.to_string();
    let reachable = health_check(url.as_str()).await;
    let _guard = lock_agent_registry();
    let mut agents = load_agents_unlocked(app)?;
    let candidate = AgentRecord {
        id: format!("agent-{}", uuid::Uuid::new_v4()),
        label,
        endpoint,
        token_hint: String::new(),
    };
    let (agent, inserted) = upsert_agent_record(&mut agents, candidate, &url);
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
        let reachable = health_check(&agent.endpoint).await;
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
) -> (&'a AgentRecord, bool) {
    let existing_index = agents.iter().position(|agent| {
        agent.label.trim() == candidate.label.trim()
            && Url::parse(agent.endpoint.trim()).is_ok_and(|stored| stored == *endpoint)
    });
    if let Some(index) = existing_index {
        return (&agents[index], false);
    }

    agents.push(candidate);
    (agents.last().expect("agent was just inserted"), true)
}

fn agent_to_node(agent: &AgentRecord, reachable: bool) -> ProbeNode {
    ProbeNode {
        id: agent.id.clone(),
        kind: "remote-agent".into(),
        label: agent.label.clone(),
        reachable,
        endpoint: Some(agent.endpoint.clone()),
        region: None,
        capabilities: Some(vec!["dns".into(), "ping".into(), "http".into()]),
    }
}

async fn health_check(endpoint: &str) -> bool {
    // Registry contents may come from an older app version or be edited outside the UI.
    // Reapply the same transport and SSRF rules before every outbound health check.
    let Ok(endpoint) = validate_endpoint(endpoint) else {
        return false;
    };
    let health_endpoint = health_endpoint(&endpoint);
    match endpoint.scheme() {
        "https" => http_health_check(health_endpoint.as_str()).await,
        "wss" => websocket_health_check(health_endpoint).await,
        _ => false,
    }
}

fn health_endpoint(endpoint: &Url) -> Url {
    let mut health_endpoint = endpoint.clone();
    let base_path = endpoint.path().trim_end_matches('/');
    health_endpoint.set_path(&format!("{base_path}/v1/health"));
    health_endpoint
}

async fn http_health_check(endpoint: &str) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(AGENT_HEALTH_CHECK_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
    {
        Ok(client) => client,
        Err(_) => return false,
    };
    matches!(
        client.get(endpoint).send().await,
        Ok(response) if response.status().is_success()
    )
}

async fn websocket_health_check(endpoint: Url) -> bool {
    const PING_PAYLOAD: &[u8] = b"bench-health";

    // reqwest enables multiple rustls providers through feature unification.
    // Select one explicitly so the WSS path cannot stall while choosing a provider.
    let _ = rustls::crypto::ring::default_provider().install_default();

    let check = async move {
        let (mut socket, _) = tokio_tungstenite::connect_async(endpoint.as_str())
            .await
            .ok()?;
        socket
            .send(Message::Ping(PING_PAYLOAD.to_vec().into()))
            .await
            .ok()?;

        while let Some(message) = socket.next().await {
            match message.ok()? {
                Message::Pong(payload) if payload.as_ref() == PING_PAYLOAD => {
                    let _ = socket.send(Message::Close(None)).await;
                    return Some(true);
                }
                Message::Close(_) => return Some(false),
                _ => {}
            }
        }
        Some(false)
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

#[cfg(test)]
mod tests {
    use super::{
        health_check, health_endpoint, upsert_agent_record, validate_endpoint, AgentRecord,
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

        let (stored, inserted) = upsert_agent_record(&mut agents, candidate, &endpoint);

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

        let (stored, inserted) = upsert_agent_record(&mut agents, candidate, &endpoint);

        assert!(inserted);
        assert_eq!(stored.id, "agent-alias");
        assert_eq!(agents.len(), 2);
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
        ] {
            assert!(
                !super::health_check(endpoint).await,
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
        assert_eq!(result, Ok(false), "a stalled WSS handshake must be bounded");
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
