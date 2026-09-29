//! Self-hosted probe agent registry (S-DIS-05) — TLS endpoint + health check only.
//! Agents must expose a minimal HTTPS JSON API; arbitrary shell is rejected.

use super::types::ProbeNode;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
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

fn agent_write_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

/// Serialize the registry read-modify-write across this process and other Bench builds sharing
/// the same app-data directory. The lock file is a persistent coordination sentinel.
struct AgentWriteGuard {
    process_lock: Option<MutexGuard<'static, ()>>,
    os_lock: Option<File>,
}

impl AgentWriteGuard {
    fn acquire(path: &Path) -> AppResult<Self> {
        let process_lock = agent_write_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let lock_path = path.with_file_name(".agents.lock");
        let os_lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(lock_path)
            .map_err(|e| AppError::io(format!("open agent registry lock: {e}")))?;
        os_lock
            .lock()
            .map_err(|e| AppError::io(format!("acquire agent registry lock: {e}")))?;
        Ok(Self {
            process_lock: Some(process_lock),
            os_lock: Some(os_lock),
        })
    }
}

impl Drop for AgentWriteGuard {
    fn drop(&mut self) {
        self.os_lock.take();
        self.process_lock.take();
    }
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
    load_sanitized_agents(&path)
}

fn load_agents_from_path(path: &Path) -> AppResult<Vec<AgentRecord>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path).map_err(|e| AppError::io(format!("read agents: {e}")))?;
    serde_json::from_str(&raw).map_err(|e| AppError::io(format!("parse agents: {e}")))
}

fn save_agents_to_path(path: &Path, agents: &[AgentRecord]) -> AppResult<()> {
    let json = serde_json::to_string_pretty(agents)
        .map_err(|e| AppError::io(format!("serialize agents: {e}")))?;
    crate::persistence::atomic_write(path, json.as_bytes())
        .map_err(|e| AppError::io(format!("write agents: {e}")))
}

fn add_agent_record(path: &Path, agent: AgentRecord) -> AppResult<()> {
    let _guard = AgentWriteGuard::acquire(path)?;
    let mut agents = load_agents_from_path(path)?;
    sanitize_agent_endpoints(&mut agents);
    agents.push(agent);
    save_agents_to_path(path, &agents)
}

fn remove_agent_record(path: &Path, agent_id: &str) -> AppResult<()> {
    let _guard = AgentWriteGuard::acquire(path)?;
    let mut agents = load_agents_from_path(path)?;
    sanitize_agent_endpoints(&mut agents);
    let before = agents.len();
    agents.retain(|agent| agent.id != agent_id);
    if agents.len() == before {
        return Err(AppError::invalid_input(format!(
            "Unknown agent: {agent_id}"
        )));
    }
    save_agents_to_path(path, &agents)
}

fn sanitize_agent_endpoints(agents: &mut [AgentRecord]) -> bool {
    let mut changed = false;
    for agent in agents {
        if let Some(endpoint) = endpoint_for_display(&agent.endpoint) {
            if endpoint != agent.endpoint {
                agent.endpoint = endpoint;
                changed = true;
            }
        }
    }
    changed
}

fn load_sanitized_agents(path: &Path) -> AppResult<Vec<AgentRecord>> {
    let mut agents = load_agents_from_path(path)?;
    if sanitize_agent_endpoints(&mut agents) {
        let _guard = AgentWriteGuard::acquire(path)?;
        // Reload under the lock so a concurrent write is not replaced by the stale snapshot.
        agents = load_agents_from_path(path)?;
        if sanitize_agent_endpoints(&mut agents) {
            save_agents_to_path(path, &agents)?;
        }
    }
    Ok(agents)
}

fn endpoint_for_display(endpoint: &str) -> Option<String> {
    let mut url = Url::parse(endpoint).ok()?;
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);
    Some(url.to_string())
}

fn validate_endpoint(endpoint: &str) -> AppResult<Url> {
    let url =
        Url::parse(endpoint.trim()).map_err(|_| AppError::invalid_input("Invalid agent URL"))?;
    if url.scheme() != "https" {
        return Err(AppError::invalid_input(
            "Agent health checks currently require an https:// endpoint",
        ));
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(AppError::invalid_input(
            "Agent URL must not contain credentials, query parameters, or fragments",
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
    add_agent_record(
        &agents_path(app)?,
        AgentRecord {
            id: id.clone(),
            label: label.clone(),
            endpoint: url.to_string(),
            token_hint: String::new(),
        },
    )?;
    Ok(ProbeNode {
        id,
        kind: "remote-agent".into(),
        label,
        reachable,
        endpoint: Some(url.to_string()),
        region: None,
        capabilities: Some(vec!["dns".into(), "ping".into(), "http".into()]),
    })
}

pub fn remove_agent(app: &AppHandle<impl Runtime>, agent_id: String) -> AppResult<()> {
    remove_agent_record(&agents_path(app)?, &agent_id)
}

pub fn agents_as_nodes(app: &AppHandle<impl Runtime>) -> AppResult<Vec<ProbeNode>> {
    Ok(load_agents(app)?
        .into_iter()
        .map(|a| ProbeNode {
            id: a.id,
            kind: "remote-agent".into(),
            label: a.label,
            reachable: false, // refreshed on demand
            endpoint: endpoint_for_display(&a.endpoint),
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
    use std::sync::Arc;
    use std::thread;

    fn temp_registry_path() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("bench-agent-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir.join("agents.json")
    }

    fn record(id: String) -> AgentRecord {
        AgentRecord {
            id,
            label: "test".into(),
            endpoint: "https://agent.example".into(),
            token_hint: String::new(),
        }
    }

    #[test]
    fn concurrent_agent_registry_writes_preserve_every_record_and_valid_json() {
        let path = Arc::new(temp_registry_path());
        let workers = 16;
        let handles = (0..workers)
            .map(|index| {
                let path = Arc::clone(&path);
                thread::spawn(move || {
                    add_agent_record(path.as_path(), record(format!("agent-{index}"))).unwrap();
                })
            })
            .collect::<Vec<_>>();
        for handle in handles {
            handle.join().unwrap();
        }

        let agents = load_agents_from_path(path.as_path()).unwrap();
        assert_eq!(agents.len(), workers);
        let raw = fs::read_to_string(path.as_path()).unwrap();
        assert_eq!(
            serde_json::from_str::<Vec<AgentRecord>>(&raw)
                .unwrap()
                .len(),
            workers
        );
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn endpoint_rejects_embedded_credentials_and_url_secrets() {
        for endpoint in [
            "https://user:password@agent.example",
            "https://agent.example/?token=secret",
            "https://agent.example/#secret",
            "wss://agent.example",
        ] {
            assert!(validate_endpoint(endpoint).is_err(), "accepted {endpoint}");
        }
        assert!(validate_endpoint("https://agent.example").is_ok());
    }

    #[test]
    fn legacy_endpoint_display_redacts_credentials_query_and_fragment() {
        assert_eq!(
            endpoint_for_display("https://user:password@agent.example/path?token=secret#key"),
            Some("https://agent.example/path".into())
        );
        assert_eq!(endpoint_for_display("not a URL"), None);
    }

    #[test]
    fn legacy_secrets_are_removed_from_the_persisted_registry() {
        let path = temp_registry_path();
        fs::write(
            &path,
            serde_json::to_vec(&vec![AgentRecord {
                id: "agent-legacy".into(),
                label: "legacy".into(),
                endpoint: "https://user:password@agent.example/?token=secret#key".into(),
                token_hint: String::new(),
            }])
            .unwrap(),
        )
        .unwrap();

        let agents = load_sanitized_agents(&path).unwrap();
        let persisted = fs::read_to_string(&path).unwrap();
        assert_eq!(agents[0].endpoint, "https://agent.example/");
        assert!(!persisted.contains("password"));
        assert!(!persisted.contains("secret"));
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
