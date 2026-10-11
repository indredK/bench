//! Self-hosted probe agent registry (S-DIS-05) — TLS endpoint + health check only.
//! Agents must expose a minimal HTTPS JSON API or WSS health endpoint; arbitrary shell is rejected.

use super::types::ProbeNode;
use crate::error::{AppError, AppResult};
use futures_util::{stream, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};
use tokio_tungstenite::tungstenite::Message;
use url::Url;

const MAX_AGENT_REGISTRY_BYTES: u64 = 1024 * 1024;
const MAX_AGENT_LABEL_CHARS: usize = 80;
const MAX_CONCURRENT_AGENT_HEALTH_CHECKS: usize = 8;
const AGENT_HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(5);

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

fn load_agents_file(path: &Path) -> AppResult<Vec<AgentRecord>> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(AppError::io(format!("open agents: {error}"))),
    };
    let mut bytes = Vec::new();
    file.take(MAX_AGENT_REGISTRY_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| AppError::io(format!("read agents: {error}")))?;
    if bytes.len() as u64 > MAX_AGENT_REGISTRY_BYTES {
        return Err(AppError::io(format!(
            "agent registry exceeds the {MAX_AGENT_REGISTRY_BYTES}-byte limit"
        )));
    }
    let raw = String::from_utf8(bytes)
        .map_err(|error| AppError::io(format!("agent registry is not UTF-8: {error}")))?;
    serde_json::from_str(&raw).map_err(|e| AppError::io(format!("parse agents: {e}")))
}

fn validate_label(label: &str) -> AppResult<String> {
    let label = label.trim();
    if label.is_empty()
        || label.chars().count() > MAX_AGENT_LABEL_CHARS
        || label.chars().any(char::is_control)
    {
        return Err(AppError::invalid_input(format!(
            "Agent label must contain 1 to {MAX_AGENT_LABEL_CHARS} non-control characters"
        )));
    }
    Ok(label.to_owned())
}

fn mutate_agents_file<T>(
    path: &Path,
    update: impl FnOnce(&mut Vec<AgentRecord>) -> AppResult<T>,
) -> AppResult<T> {
    let _guard = registry_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let _file_guard = registry_file_lock(path)?;
    let mut agents = load_agents_file(path)?;
    let result = update(&mut agents)?;
    let json = serde_json::to_string_pretty(&agents)
        .map_err(|e| AppError::io(format!("serialize agents: {e}")))?;
    if json.len() as u64 > MAX_AGENT_REGISTRY_BYTES {
        return Err(AppError::invalid_input(format!(
            "Agent registry exceeds the {MAX_AGENT_REGISTRY_BYTES}-byte limit"
        )));
    }
    crate::persistence::atomic_write(path, json.as_bytes())
        .map_err(|e| AppError::io(format!("write agents: {e}")))?;
    Ok(result)
}

pub fn load_agents(app: &AppHandle<impl Runtime>) -> AppResult<Vec<AgentRecord>> {
    load_agents_file(&agents_path(app)?)
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
    // SSRF: block cloud metadata & localhost-ish unless explicitly loopback for lab.
    let blocked = ["169.254.169.254", "metadata.google.internal", "metadata"];
    if blocked.iter().any(|b| host.eq_ignore_ascii_case(b)) {
        return Err(AppError::invalid_input(
            "Agent endpoint blocked (SSRF guard)",
        ));
    }
    Ok(url)
}

pub async fn add_agent<R: Runtime + 'static>(
    app: &AppHandle<R>,
    label: String,
    endpoint: String,
) -> AppResult<ProbeNode> {
    let label = validate_label(&label)?;
    let url = validate_endpoint(&endpoint)?;
    let reachable = health_check(url.as_str()).await;
    let endpoint = url.to_string();
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        mutate_agents_file(&agents_path(&app)?, |agents| {
            Ok(upsert_agent(agents, label, endpoint, reachable))
        })
    })
    .await
    .map_err(|error| AppError::task_failed(format!("add_agent registry update: {error}")))?
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

pub async fn agents_as_nodes<R: Runtime + 'static>(
    app: &AppHandle<R>,
) -> AppResult<Vec<ProbeNode>> {
    let app = app.clone();
    let agents = tauri::async_runtime::spawn_blocking(move || load_agents(&app))
        .await
        .map_err(|error| AppError::task_failed(format!("list agent registry: {error}")))??;

    Ok(stream::iter(agents.into_iter().map(|agent| async move {
        let reachable = health_check(&agent.endpoint).await;
        agent_node(&agent, reachable)
    }))
    .buffered(MAX_CONCURRENT_AGENT_HEALTH_CHECKS)
    .collect::<Vec<_>>()
    .await)
}

async fn health_check(endpoint: &str) -> bool {
    let Ok(endpoint) = Url::parse(endpoint) else {
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
        Ok(c) => c,
        Err(_) => return false,
    };
    matches!(
        client.get(endpoint).send().await,
        Ok(r) if r.status().is_success()
    )
}

async fn websocket_health_check(endpoint: Url) -> bool {
    const PING_PAYLOAD: &[u8] = b"bench-health";

    // reqwest/updater enable both ring and aws-lc through Cargo feature unification.
    // Rustls cannot infer a provider in that case; select ring before constructing a
    // WebSocket TLS stream so the command returns a controlled health result.
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

    // Keep the deadline on the command task as well as around the connection task.
    // This ensures a stuck resolver/TLS handshake cannot leave the UI's add/refresh
    // action pending if the connection future stalls while being polled.
    let mut check_task = tokio::spawn(check);
    match tokio::time::timeout(AGENT_HEALTH_CHECK_TIMEOUT, &mut check_task).await {
        Ok(Ok(Some(true))) => true,
        _ => {
            check_task.abort();
            false
        }
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
    use std::process::Command;
    use std::sync::{Arc, Barrier};
    use std::thread;
    use std::time::{Duration, Instant};

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

    fn wait_for_file(path: &Path, timeout: Duration) {
        let deadline = Instant::now() + timeout;
        while !path.exists() {
            assert!(Instant::now() < deadline, "timed out waiting for {path:?}");
            thread::sleep(Duration::from_millis(5));
        }
    }

    #[test]
    fn registry_update_worker() {
        let Ok(directory) = std::env::var("BENCH_AGENT_REGISTRY_TEST_DIR") else {
            return;
        };
        let directory = PathBuf::from(directory);
        let label = std::env::var("BENCH_AGENT_REGISTRY_TEST_LABEL").unwrap();
        let start = directory.join(format!("start-{label}"));
        let entered = directory.join(format!("entered-{label}"));
        let done = directory.join(format!("done-{label}"));
        fs::write(directory.join(format!("ready-{label}")), b"ready").unwrap();
        wait_for_file(&start, Duration::from_secs(10));

        let id = if label == "first" { 1 } else { 2 };
        mutate_agents_file(&directory.join("agents.json"), |agents| {
            fs::write(&entered, b"entered").unwrap();
            if label == "first" {
                thread::sleep(Duration::from_millis(750));
            }
            agents.push(record(id));
            Ok(())
        })
        .unwrap();
        fs::write(done, b"done").unwrap();
    }

    #[test]
    fn concurrent_process_updates_are_serialized() {
        let (dir, path) = registry_path();
        let executable = std::env::current_exe().unwrap();
        let spawn_worker = |label: &str| {
            Command::new(&executable)
                .arg("registry_update_worker")
                .arg("--nocapture")
                .env("BENCH_AGENT_REGISTRY_TEST_DIR", &dir)
                .env("BENCH_AGENT_REGISTRY_TEST_LABEL", label)
                .spawn()
                .unwrap()
        };
        let mut first = spawn_worker("first");
        let mut second = spawn_worker("second");

        for label in ["first", "second"] {
            wait_for_file(&dir.join(format!("ready-{label}")), Duration::from_secs(10));
        }
        fs::write(dir.join("start-first"), b"start").unwrap();
        wait_for_file(&dir.join("entered-first"), Duration::from_secs(10));
        fs::write(dir.join("start-second"), b"start").unwrap();

        let second_entered_before_first_finished = {
            let deadline = Instant::now() + Duration::from_millis(500);
            while !dir.join("entered-second").exists()
                && !dir.join("done-first").exists()
                && Instant::now() < deadline
            {
                thread::sleep(Duration::from_millis(5));
            }
            dir.join("entered-second").exists() && !dir.join("done-first").exists()
        };

        wait_for_file(&dir.join("done-first"), Duration::from_secs(10));
        wait_for_file(&dir.join("done-second"), Duration::from_secs(10));
        assert!(first.wait().unwrap().success());
        assert!(second.wait().unwrap().success());
        assert!(
            !second_entered_before_first_finished,
            "a second process entered the read-modify-write section before the first released it"
        );

        let agents = load_agents_file(&path).unwrap();
        assert_eq!(agents.len(), 2);
        assert!(agents.iter().any(|agent| agent.id == "agent-1"));
        assert!(agents.iter().any(|agent| agent.id == "agent-2"));
        fs::remove_dir_all(dir).unwrap();
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
    fn wss_health_endpoint_preserves_agent_base_path() {
        let endpoint = Url::parse("wss://agent.example.test/probe/").unwrap();

        assert_eq!(
            health_endpoint(&endpoint).as_str(),
            "wss://agent.example.test/probe/v1/health"
        );
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

    #[test]
    fn wss_is_supported_but_plaintext_and_embedded_credentials_are_rejected() {
        assert_eq!(
            validate_endpoint("wss://agent.example.test/probe")
                .unwrap()
                .scheme(),
            "wss"
        );
        assert!(validate_endpoint("ws://agent.example.test/probe").is_err());
        assert!(validate_endpoint("http://agent.example.test/probe").is_err());
        assert!(validate_endpoint("https://user:secret@agent.example.test").is_err());
        assert!(validate_endpoint("https://agent.example.test?token=secret").is_err());
    }

    #[test]
    fn agent_labels_are_trimmed_bounded_and_control_free() {
        assert_eq!(validate_label("  Lab  ").unwrap(), "Lab");
        assert!(validate_label(" \n ").is_err());
        assert!(validate_label(&"x".repeat(MAX_AGENT_LABEL_CHARS + 1)).is_err());
        assert!(validate_label("Lab\nNode").is_err());
    }

    #[test]
    fn health_endpoint_appends_to_encoded_base_path_without_rewriting_it() {
        let endpoint = Url::parse("https://agent.example.test/base%20path").unwrap();

        assert_eq!(
            health_endpoint(&endpoint).as_str(),
            "https://agent.example.test/base%20path/v1/health"
        );
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

    #[test]
    fn oversized_registry_is_rejected_before_deserialization() {
        let (dir, path) = registry_path();
        fs::write(&path, vec![b'x'; MAX_AGENT_REGISTRY_BYTES as usize + 1]).unwrap();

        assert!(load_agents_file(&path).is_err());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn oversized_updates_do_not_replace_the_registry() {
        let (dir, path) = registry_path();
        let result = mutate_agents_file(&path, |agents| {
            let mut oversized = record(1);
            oversized.label = "x".repeat(MAX_AGENT_REGISTRY_BYTES as usize);
            agents.push(oversized);
            Ok(())
        });

        assert!(result.is_err());
        assert!(!path.exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
