//! Self-hosted probe agent registry (S-DIS-05) — TLS endpoint + health check only.
//! Agents must expose a minimal HTTPS JSON API or WSS health endpoint; arbitrary shell is rejected.

use super::types::ProbeNode;
use crate::error::{AppError, AppResult};
use futures_util::{stream, StreamExt};
use reqwest_websocket::Upgrade;
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};
use url::Url;

const MAX_AGENT_REGISTRY_BYTES: u64 = 1024 * 1024;
const MAX_AGENT_LABEL_CHARS: usize = 80;
const MAX_AGENT_ENDPOINT_BYTES: usize = 2048;
const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_CONCURRENT_AGENT_HEALTH_CHECKS: usize = 8;

/// Serialize registry reads and updates within the current Bench process.
fn registry_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
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

/// Use a stable sibling file because atomic replacement changes the registry file inode.
fn registry_file_lock(path: &Path) -> AppResult<File> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::io("agent registry path has no parent"))?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("agents.json");
    let lock_path = parent.join(format!(".{name}.lock"));
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(lock_path)
        .map_err(|error| AppError::io(format!("open agent registry lock: {error}")))?;
    file.lock()
        .map_err(|error| AppError::io(format!("lock agent registry: {error}")))?;
    Ok(file)
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
    let _guard = registry_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    load_agents_from(&path)
}

fn load_agents_from(path: &Path) -> AppResult<Vec<AgentRecord>> {
    crate::persistence::ensure_file_size(path, MAX_AGENT_REGISTRY_BYTES)
        .map_err(|e| AppError::io(format!("check agent registry size: {e}")))?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path).map_err(|e| AppError::io(format!("read agents: {e}")))?;
    serde_json::from_str(&raw).map_err(|e| AppError::io(format!("parse agents: {e}")))
}

fn save_agents_to(path: &Path, agents: &[AgentRecord]) -> AppResult<()> {
    let json = serde_json::to_string_pretty(agents)
        .map_err(|e| AppError::io(format!("serialize agents: {e}")))?;
    if json.len() as u64 > MAX_AGENT_REGISTRY_BYTES {
        return Err(AppError::invalid_input("Agent registry exceeds size limit"));
    }
    crate::persistence::atomic_write(path, json.as_bytes())
        .map_err(|e| AppError::io(format!("write agents: {e}")))
}

fn mutate_agents_at<T>(
    path: &Path,
    mutate: impl FnOnce(&mut Vec<AgentRecord>) -> AppResult<T>,
) -> AppResult<T> {
    let _guard = registry_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let _file_guard = registry_file_lock(path)?;
    let mut agents = load_agents_from(path)?;
    let result = mutate(&mut agents)?;
    save_agents_to(path, &agents)?;
    Ok(result)
}

fn insert_agent_at(path: &Path, agent: AgentRecord) -> AppResult<AgentRecord> {
    mutate_agents_at(path, |agents| {
        if let Some(existing) = agents.iter().find(|existing| {
            if existing.label != agent.label {
                return false;
            }
            Url::parse(&existing.endpoint)
                .map(|url| url.to_string())
                .unwrap_or_else(|_| existing.endpoint.clone())
                == agent.endpoint
        }) {
            return Ok(existing.clone());
        }
        agents.push(agent.clone());
        Ok(agent)
    })
}

fn validate_label(label: &str) -> AppResult<String> {
    let label = label.trim();
    if label.is_empty()
        || label.chars().count() > MAX_AGENT_LABEL_CHARS
        || label.chars().any(char::is_control)
    {
        return Err(AppError::invalid_input(
            "Agent label must contain 1-80 printable characters",
        ));
    }
    Ok(label.to_string())
}

fn validate_endpoint(endpoint: &str) -> AppResult<Url> {
    if endpoint.trim().len() > MAX_AGENT_ENDPOINT_BYTES {
        return Err(AppError::invalid_input("Agent endpoint is too long"));
    }
    let url =
        Url::parse(endpoint.trim()).map_err(|_| AppError::invalid_input("Invalid agent URL"))?;
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
            "Agent endpoint must not contain credentials, query parameters, or fragments",
        ));
    }
    let host = url.host_str().unwrap_or("").trim_end_matches('.');
    if host.is_empty() {
        return Err(AppError::invalid_input(
            "Agent endpoint must include a host",
        ));
    }
    // Block known cloud metadata hosts; manually configured private agents remain valid.
    let blocked = ["169.254.169.254", "metadata.google.internal", "metadata"];
    if blocked.iter().any(|b| host.eq_ignore_ascii_case(b)) {
        return Err(AppError::invalid_input(
            "Agent endpoint blocked (SSRF guard)",
        ));
    }
    if matches!(
        url.host(),
        Some(url::Host::Ipv6(ip)) if ip.segments() == [0xfd00, 0x0ec2, 0, 0, 0, 0, 0, 0x0254]
    ) {
        return Err(AppError::invalid_input(
            "Agent endpoint blocked (SSRF guard)",
        ));
    }
    Ok(url)
}

fn http_health_url(endpoint: &Url) -> AppResult<Url> {
    let mut health_url = endpoint.clone();
    health_url
        .path_segments_mut()
        .map_err(|_| AppError::invalid_input("Invalid agent health URL"))?
        .pop_if_empty()
        .push("v1")
        .push("health");
    Ok(health_url)
}

async fn websocket_health_check(client: &reqwest::Client, endpoint: &str) -> bool {
    tokio::time::timeout(HEALTH_CHECK_TIMEOUT, async {
        let response = client.get(endpoint).upgrade().send().await.ok()?;
        let websocket = response.into_websocket().await.ok()?;
        drop(websocket);
        Some(())
    })
    .await
    .is_ok_and(|result| result.is_some())
}

fn health_check_client() -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .timeout(HEALTH_CHECK_TIMEOUT)
        .user_agent("Bench-NetworkProbe/1.0")
        .redirect(reqwest::redirect::Policy::none())
        .build()
}

pub async fn add_agent<R: Runtime>(
    app: &AppHandle<R>,
    label: String,
    endpoint: String,
) -> AppResult<ProbeNode> {
    let label = validate_label(&label)?;
    let url = validate_endpoint(&endpoint)?;
    let endpoint = url.to_string();
    let id = format!("agent-{}", uuid::Uuid::new_v4());
    let reachable = health_check(&url).await;
    let node = ProbeNode {
        id,
        kind: "remote-agent".into(),
        label: label.clone(),
        reachable,
        endpoint: Some(endpoint.clone()),
        region: None,
        capabilities: Some(vec!["dns".into(), "ping".into(), "http".into()]),
    };
    let path = agents_path(app)?;
    let saved = insert_agent_at(
        &path,
        AgentRecord {
            id: node.id.clone(),
            label,
            endpoint,
            token_hint: String::new(),
        },
    )?;
    let mut node = node;
    node.id = saved.id;
    Ok(node)
}

pub fn remove_agent(app: &AppHandle<impl Runtime>, agent_id: String) -> AppResult<()> {
    let path = agents_path(app)?;
    mutate_agents_at(&path, |agents| {
        let before = agents.len();
        agents.retain(|agent| agent.id != agent_id);
        if agents.len() == before {
            return Err(AppError::invalid_input("Unknown agent"));
        }
        Ok(())
    })
}

pub async fn agents_as_nodes(app: &AppHandle<impl Runtime>) -> AppResult<Vec<ProbeNode>> {
    let agents = load_agents(app)?;
    let client = health_check_client().ok();
    let nodes = refresh_agent_records(agents, move |agent: AgentRecord| {
        let client = client.clone();
        async move {
            match (client, validate_endpoint(&agent.endpoint)) {
                (Some(client), Ok(endpoint)) => health_check_with_client(&client, &endpoint).await,
                _ => false,
            }
        }
    })
    .await;
    Ok(nodes)
}

async fn refresh_agent_records<F, Fut>(agents: Vec<AgentRecord>, check: F) -> Vec<ProbeNode>
where
    F: Fn(AgentRecord) -> Fut + Clone,
    Fut: Future<Output = bool>,
{
    let count = agents.len();
    let mut refreshed = stream::iter(agents.into_iter().enumerate())
        .map(|(index, agent)| {
            let check = check.clone();
            async move {
                let reachable = check(agent.clone()).await;
                (index, agent_to_node(agent, reachable))
            }
        })
        .buffer_unordered(MAX_CONCURRENT_AGENT_HEALTH_CHECKS)
        .collect::<Vec<_>>()
        .await;
    refreshed.sort_unstable_by_key(|(index, _)| *index);
    let mut nodes = Vec::with_capacity(count);
    nodes.extend(refreshed.into_iter().map(|(_, node)| node));
    nodes
}

fn agent_to_node(agent: AgentRecord, reachable: bool) -> ProbeNode {
    ProbeNode {
        id: agent.id,
        kind: "remote-agent".into(),
        label: agent.label,
        reachable,
        endpoint: Some(agent.endpoint),
        region: None,
        capabilities: Some(vec!["dns".into(), "ping".into(), "http".into()]),
    }
}

async fn health_check(endpoint: &Url) -> bool {
    let client = match health_check_client() {
        Ok(c) => c,
        Err(_) => return false,
    };
    health_check_with_client(&client, endpoint).await
}

async fn health_check_with_client(client: &reqwest::Client, endpoint: &Url) -> bool {
    match endpoint.scheme() {
        "https" => {
            let Ok(health_url) = http_health_url(endpoint) else {
                return false;
            };
            matches!(
                client.get(health_url).send().await,
                Ok(response) if response.status().is_success()
            )
        }
        "wss" => websocket_health_check(client, endpoint.as_str()).await,
        _ => false,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::thread;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn validates_secure_agent_endpoints_and_rejects_embedded_credentials() {
        assert!(validate_endpoint("https://agent.example/base").is_ok());
        assert!(validate_endpoint("wss://agent.example/health").is_ok());
        assert!(validate_endpoint("http://agent.example").is_err());
        assert!(validate_endpoint("ws://agent.example").is_err());
        assert!(validate_endpoint("https://user:secret@agent.example").is_err());
        assert!(validate_endpoint("wss://agent.example/path?token=secret").is_err());
        assert!(validate_endpoint("https://metadata.google.internal").is_err());
    }

    #[test]
    fn appends_http_health_path_without_losing_agent_base_path() {
        let endpoint = Url::parse("https://agent.example/team/agent/").unwrap();
        assert_eq!(
            http_health_url(&endpoint).unwrap().as_str(),
            "https://agent.example/team/agent/v1/health"
        );
    }

    #[tokio::test]
    async fn accepts_a_websocket_endpoint_only_after_upgrade_handshake() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            tokio_tungstenite::accept_async(stream).await.unwrap();
        });
        let client = reqwest::Client::builder().no_proxy().build().unwrap();

        assert!(websocket_health_check(&client, &format!("ws://{address}/health")).await);
        server.await.unwrap();
    }

    #[tokio::test]
    async fn health_check_client_does_not_follow_redirects() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address: SocketAddr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = [0; 1024];
            let _ = stream.read(&mut request).await;
            stream
                .write_all(
                    format!(
                        "HTTP/1.1 302 Found\r\nLocation: http://{address}/metadata\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
        });

        let response = health_check_client()
            .unwrap()
            .get(format!("http://{address}/health"))
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), reqwest::StatusCode::FOUND);
        server.await.unwrap();
    }

    #[test]
    fn repeated_agent_registration_is_idempotent_after_endpoint_normalization() {
        let directory =
            std::env::temp_dir().join(format!("bench-agent-registry-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("agents.json");

        let first = insert_agent_at(
            &path,
            AgentRecord {
                id: "agent-first".into(),
                label: "Lab".into(),
                endpoint: "https://agent.example/".into(),
                token_hint: String::new(),
            },
        )
        .unwrap();
        let duplicate = insert_agent_at(
            &path,
            AgentRecord {
                id: "agent-second".into(),
                label: "Lab".into(),
                endpoint: "https://AGENT.example:443/".into(),
                token_hint: String::new(),
            },
        )
        .unwrap();

        assert_eq!(duplicate.id, first.id);
        assert_eq!(load_agents_from(&path).unwrap().len(), 1);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn concurrent_registry_updates_preserve_every_agent() {
        let directory =
            std::env::temp_dir().join(format!("bench-agent-registry-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("agents.json");
        let threads = (0..12)
            .map(|index| {
                let path = path.clone();
                thread::spawn(move || {
                    mutate_agents_at(&path, |agents| {
                        agents.push(AgentRecord {
                            id: format!("agent-{index}"),
                            label: format!("agent {index}"),
                            endpoint: format!("https://agent-{index}.example"),
                            token_hint: String::new(),
                        });
                        Ok(())
                    })
                    .unwrap();
                })
            })
            .collect::<Vec<_>>();
        for thread in threads {
            thread.join().unwrap();
        }

        assert_eq!(load_agents_from(&path).unwrap().len(), 12);
        fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn agent_health_refresh_is_bounded_and_preserves_registry_order() {
        let agents = (0..24)
            .map(|index| AgentRecord {
                id: format!("agent-{index}"),
                label: format!("agent {index}"),
                endpoint: format!("https://agent-{index}.example"),
                token_hint: String::new(),
            })
            .collect();
        let active = Arc::new(AtomicUsize::new(0));
        let max_active = Arc::new(AtomicUsize::new(0));

        let nodes = refresh_agent_records(agents, {
            let active = Arc::clone(&active);
            let max_active = Arc::clone(&max_active);
            move |_| {
                let active = Arc::clone(&active);
                let max_active = Arc::clone(&max_active);
                async move {
                    let current = active.fetch_add(1, Ordering::SeqCst) + 1;
                    max_active.fetch_max(current, Ordering::SeqCst);
                    tokio::time::sleep(Duration::from_millis(5)).await;
                    active.fetch_sub(1, Ordering::SeqCst);
                    true
                }
            }
        })
        .await;

        assert!(max_active.load(Ordering::SeqCst) <= MAX_CONCURRENT_AGENT_HEALTH_CHECKS);
        assert!(max_active.load(Ordering::SeqCst) > 1);
        assert!(nodes.iter().all(|node| node.reachable));
        assert_eq!(nodes[0].id, "agent-0");
        assert_eq!(nodes[23].id, "agent-23");
    }
}
