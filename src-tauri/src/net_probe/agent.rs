//! Self-hosted probe agent registry (S-DIS-05) — TLS endpoint + health check only.
//! Agents must expose a minimal HTTPS JSON API; arbitrary shell is rejected.

use super::types::ProbeNode;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager, Runtime};
use url::Url;

// Agent registry commands can arrive concurrently (for example, a double-click in the UI).
// Keep read/modify/write operations serialized; the file itself is replaced atomically below.
static AGENT_REGISTRY_LOCK: Mutex<()> = Mutex::new(());

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
    let url =
        Url::parse(endpoint.trim()).map_err(|_| AppError::invalid_input("Invalid agent URL"))?;
    if url.scheme() != "https" {
        return Err(AppError::invalid_input("Agent endpoint must use https://"));
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

pub fn agents_as_nodes(app: &AppHandle<impl Runtime>) -> AppResult<Vec<ProbeNode>> {
    Ok(load_agents(app)?
        .into_iter()
        .map(|agent| agent_to_node(&agent, false)) // refreshed on demand
        .collect())
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
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    let health = endpoint.trim_end_matches('/').to_string() + "/v1/health";
    matches!(
        client.get(&health).send().await,
        Ok(r) if r.status().is_success()
    )
}

#[cfg(test)]
mod tests {
    use super::{upsert_agent_record, validate_endpoint, AgentRecord};
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
    fn agent_health_endpoint_rejects_websocket_urls_until_the_protocol_is_supported() {
        assert!(validate_endpoint("wss://agent.example:8443").is_err());
        assert!(validate_endpoint("https://agent.example:8443").is_ok());
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
