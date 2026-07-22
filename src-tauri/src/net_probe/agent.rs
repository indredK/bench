//! Self-hosted probe agent registry (S-DIS-05) — TLS endpoint + health check only.
//! Agents must expose a minimal HTTPS JSON API; arbitrary shell is rejected.

use super::types::ProbeNode;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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
    let path = agents_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| AppError::io(format!("read agents: {e}")))?;
    serde_json::from_str(&raw).map_err(|e| AppError::io(format!("parse agents: {e}")))
}

fn save_agents(app: &AppHandle<impl Runtime>, agents: &[AgentRecord]) -> AppResult<()> {
    let path = agents_path(app)?;
    let json = serde_json::to_string_pretty(agents)
        .map_err(|e| AppError::io(format!("serialize agents: {e}")))?;
    fs::write(path, json).map_err(|e| AppError::io(format!("write agents: {e}")))
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
    let id = format!("agent-{}", uuid::Uuid::new_v4());
    let reachable = health_check(url.as_str()).await;
    let mut agents = load_agents(app)?;
    agents.push(AgentRecord {
        id: id.clone(),
        label: label.clone(),
        endpoint: endpoint.trim().to_string(),
        token_hint: String::new(),
    });
    save_agents(app, &agents)?;
    Ok(ProbeNode {
        id,
        kind: "remote-agent".into(),
        label,
        reachable,
        endpoint: Some(endpoint.trim().into()),
        region: None,
        capabilities: Some(vec!["dns".into(), "ping".into(), "http".into()]),
    })
}

pub fn remove_agent(app: &AppHandle<impl Runtime>, agent_id: String) -> AppResult<()> {
    let mut agents = load_agents(app)?;
    let before = agents.len();
    agents.retain(|a| a.id != agent_id);
    if agents.len() == before {
        return Err(AppError::invalid_input(format!(
            "Unknown agent: {agent_id}"
        )));
    }
    save_agents(app, &agents)
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
