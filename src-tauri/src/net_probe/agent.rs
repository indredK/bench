//! Self-hosted probe agent registry (S-DIS-05) — TLS endpoint + health check only.
//! Agents must expose a minimal HTTPS JSON API; arbitrary shell is rejected.

use super::types::ProbeNode;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager, Runtime};
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecord {
    pub id: String,
    pub label: String,
    pub endpoint: String,
    #[serde(default)]
    pub token_hint: String,
}

/// Serialize registry read-modify-write operations within the single Bench process.
fn registry_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
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

fn load_agents_file(path: &Path) -> AppResult<Vec<AgentRecord>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path).map_err(|e| AppError::io(format!("read agents: {e}")))?;
    serde_json::from_str(&raw).map_err(|e| AppError::io(format!("parse agents: {e}")))
}

fn mutate_agents_file<T>(
    path: &Path,
    update: impl FnOnce(&mut Vec<AgentRecord>) -> AppResult<T>,
) -> AppResult<T> {
    let _guard = registry_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut agents = load_agents_file(path)?;
    let result = update(&mut agents)?;
    let json = serde_json::to_string_pretty(&agents)
        .map_err(|e| AppError::io(format!("serialize agents: {e}")))?;
    crate::persistence::atomic_write(path, json.as_bytes())
        .map_err(|e| AppError::io(format!("write agents: {e}")))?;
    Ok(result)
}

pub fn load_agents(app: &AppHandle<impl Runtime>) -> AppResult<Vec<AgentRecord>> {
    load_agents_file(&agents_path(app)?)
}

fn validate_endpoint(endpoint: &str) -> AppResult<Url> {
    let url =
        Url::parse(endpoint.trim()).map_err(|_| AppError::invalid_input("Invalid agent URL"))?;
    if url.scheme() != "https" && url.scheme() != "wss" {
        return Err(AppError::invalid_input(
            "Agent endpoint must be https:// or wss:// (no plaintext)",
        ));
    }
    let host = url.host_str().unwrap_or("");
    // SSRF: block cloud metadata & localhost-ish unless explicitly loopback for lab.
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
    let url = validate_endpoint(&endpoint)?;
    let reachable = health_check(url.as_str()).await;
    let endpoint = url.to_string();
    mutate_agents_file(&agents_path(app)?, |agents| {
        Ok(upsert_agent(agents, label, endpoint, reachable))
    })
}

pub fn remove_agent(app: &AppHandle<impl Runtime>, agent_id: String) -> AppResult<()> {
    mutate_agents_file(&agents_path(app)?, |agents| {
        agents.retain(|agent| agent.id != agent_id);
        Ok(())
    })
}

fn upsert_agent(
    agents: &mut Vec<AgentRecord>,
    label: String,
    endpoint: String,
    reachable: bool,
) -> ProbeNode {
    let normalized_endpoint = Url::parse(&endpoint).ok();
    if let Some(existing) = agents.iter().find(|agent| {
        normalized_endpoint.as_ref().is_some_and(|endpoint| {
            Url::parse(&agent.endpoint).is_ok_and(|saved| &saved == endpoint)
        })
    }) {
        return agent_node(existing, reachable);
    }

    let record = AgentRecord {
        id: format!("agent-{}", uuid::Uuid::new_v4()),
        label,
        endpoint,
        token_hint: String::new(),
    };
    let node = agent_node(&record, reachable);
    agents.push(record);
    node
}

fn agent_node(agent: &AgentRecord, reachable: bool) -> ProbeNode {
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

pub fn agents_as_nodes(app: &AppHandle<impl Runtime>) -> AppResult<Vec<ProbeNode>> {
    Ok(load_agents(app)?
        .into_iter()
        .map(|a| ProbeNode {
            id: a.id,
            kind: "remote-agent".into(),
            label: a.label,
            reachable: false, // refreshed on demand
            endpoint: Some(a.endpoint),
            region: None,
            capabilities: Some(vec!["dns".into(), "ping".into(), "http".into()]),
        })
        .collect())
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};
    use std::thread;
    use std::time::Duration;

    fn registry_path() -> (PathBuf, PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("bench-agent-registry-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("agents.json");
        (dir, path)
    }

    fn record(id: usize) -> AgentRecord {
        AgentRecord {
            id: format!("agent-{id}"),
            label: format!("Agent {id}"),
            endpoint: format!("https://agent-{id}.example.test"),
            token_hint: String::new(),
        }
    }

    #[test]
    fn concurrent_registry_updates_keep_every_agent() {
        let (dir, path) = registry_path();
        let workers = 16;
        let barrier = Arc::new(Barrier::new(workers));
        let handles = (0..workers)
            .map(|index| {
                let path = path.clone();
                let barrier = Arc::clone(&barrier);
                thread::spawn(move || {
                    barrier.wait();
                    mutate_agents_file(&path, |agents| {
                        thread::sleep(Duration::from_millis(2));
                        agents.push(record(index));
                        Ok(())
                    })
                    .unwrap();
                })
            })
            .collect::<Vec<_>>();
        for handle in handles {
            handle.join().unwrap();
        }

        assert_eq!(load_agents_file(&path).unwrap().len(), workers);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn adding_the_same_normalized_endpoint_is_idempotent() {
        let mut agents = Vec::new();
        let endpoint = validate_endpoint("https://agent.example.test/").unwrap();
        let first = upsert_agent(&mut agents, "Agent".into(), endpoint.to_string(), true);
        let duplicate = upsert_agent(
            &mut agents,
            "Other label".into(),
            validate_endpoint("https://agent.example.test")
                .unwrap()
                .to_string(),
            true,
        );

        assert_eq!(agents.len(), 1);
        assert_eq!(first.id, duplicate.id);
        assert_eq!(duplicate.label, "Agent");
    }

    #[test]
    fn removing_a_missing_agent_is_idempotent() {
        let (dir, path) = registry_path();
        let result = mutate_agents_file(&path, |agents| {
            agents.retain(|agent| agent.id != "missing-agent");
            Ok(())
        });

        assert!(result.is_ok());
        assert!(load_agents_file(&path).unwrap().is_empty());
        fs::remove_dir_all(dir).unwrap();
    }
}
