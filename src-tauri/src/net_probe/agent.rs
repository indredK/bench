//! Self-hosted probe agent registry (S-DIS-05) — TLS endpoint + health check only.
//! Agents must expose a minimal HTTPS JSON API; arbitrary shell is rejected.

use super::types::{AgentMeasurementResult, GlobalpingProbeResult, ProbeNode};
use crate::error::{AppError, AppResult};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use futures_util::StreamExt;
use hmac::digest::KeyInit;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Runtime};
use url::{Host, Url};

const AGENT_PROTOCOL: &str = "bench-probe-agent.v1";
const AGENT_MAX_TARGET_LEN: usize = 2048;
const AGENT_MAX_RESPONSE_BYTES: usize = 64 * 1024;
const AGENT_REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const AGENT_HEALTH_TIMEOUT: Duration = Duration::from_secs(3);
const AGENT_MAX_REGISTRATIONS: usize = 10;
const AGENT_MAX_HEALTH_CHECKS: usize = 5;
const AGENT_MAX_MEASUREMENTS: usize = 3;
const AGENT_ALLOWED_TOOLS: [&str; 3] = ["dns", "ping", "http"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecord {
    pub id: String,
    pub label: String,
    pub endpoint: String,
    #[serde(default)]
    pub token_hint: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentMeasurementRequest<'a> {
    protocol: &'static str,
    request_id: &'a str,
    measurement_type: &'a str,
    target: &'a str,
    timeout_ms: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentMeasurementResponse {
    protocol: String,
    request_id: String,
    status: String,
    #[serde(default)]
    result: Option<AgentMeasurementPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentMeasurementPayload {
    #[serde(default)]
    answers: Vec<String>,
    #[serde(default)]
    dns_rcode: Option<String>,
    #[serde(default)]
    avg_rtt_ms: Option<f64>,
    #[serde(default)]
    packet_loss_percent: Option<f64>,
    #[serde(default)]
    packets_sent: Option<u32>,
    #[serde(default)]
    packets_received: Option<u32>,
    #[serde(default)]
    http_status_code: Option<u16>,
    #[serde(default)]
    total_time_ms: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentHealthResponse {
    protocol: String,
    status: String,
}

fn agent_write_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn agent_measurement_slots() -> &'static tokio::sync::Semaphore {
    static SLOTS: OnceLock<tokio::sync::Semaphore> = OnceLock::new();
    SLOTS.get_or_init(|| tokio::sync::Semaphore::new(AGENT_MAX_MEASUREMENTS))
}

fn try_acquire_agent_measurement_slot() -> AppResult<tokio::sync::SemaphorePermit<'static>> {
    agent_measurement_slots().try_acquire().map_err(|_| {
        AppError::new(
            "AGENT_BUSY",
            "At most three self-hosted agent measurements can run at a time.",
        )
    })
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

#[cfg(test)]
fn add_agent_record(path: &Path, agent: AgentRecord) -> AppResult<()> {
    let _guard = AgentWriteGuard::acquire(path)?;
    let mut agents = load_agents_from_path(path)?;
    sanitize_agent_endpoints(&mut agents);
    if agents.len() >= AGENT_MAX_REGISTRATIONS {
        return Err(AppError::invalid_input(format!(
            "At most {AGENT_MAX_REGISTRATIONS} self-hosted probe agents can be registered."
        )));
    }
    agents.push(agent);
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
    if endpoint.trim().len() > AGENT_MAX_TARGET_LEN {
        return Err(AppError::invalid_input("Agent URL is too long"));
    }
    let url =
        Url::parse(endpoint.trim()).map_err(|_| AppError::invalid_input("Invalid agent URL"))?;
    if url.scheme() != "https" {
        return Err(AppError::invalid_input(
            "Agent health checks currently require an https:// endpoint",
        ));
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || has_url_authority_userinfo(endpoint.trim())
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(AppError::invalid_input(
            "Agent URL must not contain credentials, query parameters, or fragments",
        ));
    }
    let host = url.host_str().unwrap_or("");
    if is_blocked_agent_endpoint_host(host) {
        return Err(AppError::invalid_input(
            "Agent endpoint blocked (SSRF guard)",
        ));
    }
    Ok(url)
}

fn has_url_authority_userinfo(value: &str) -> bool {
    value
        .split_once("://")
        .and_then(|(_, remainder)| remainder.split(['/', '?', '#']).next())
        .is_some_and(|authority| authority.contains('@'))
}

pub async fn add_agent<R: Runtime>(
    app: &AppHandle<R>,
    label: String,
    endpoint: String,
    token: String,
) -> AppResult<ProbeNode> {
    let url = validate_endpoint(&endpoint)?;
    validate_agent_token(&token)?;
    let label = validate_agent_label(&label)?;
    let id = format!("agent-{}", uuid::Uuid::new_v4());
    let app_handle = app.clone();
    let app_identifier = app.config().identifier.clone();
    let record = AgentRecord {
        id: id.clone(),
        label: label.clone(),
        endpoint: url.to_string(),
        token_hint: String::new(),
    };
    let token = token.trim().to_owned();
    let health_token = token.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = agents_path(&app_handle)?;
        save_agent_and_token(&path, &app_identifier, record, &token)
    })
    .await
    .map_err(|_| AppError::task_failed("save self-hosted agent credentials"))??;
    let reachable = health_check(url.clone(), &id, health_token).await;
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

pub async fn remove_agent(app: &AppHandle<impl Runtime>, agent_id: String) -> AppResult<()> {
    let app_handle = app.clone();
    let app_identifier = app.config().identifier.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = agents_path(&app_handle)?;
        remove_agent_and_token(&path, &app_identifier, &agent_id)
    })
    .await
    .map_err(|_| AppError::task_failed("remove self-hosted agent credentials"))?
}

pub async fn set_agent_token<R: Runtime>(
    app: &AppHandle<R>,
    agent_id: String,
    token: String,
) -> AppResult<()> {
    validate_agent_token(&token)?;
    let app_handle = app.clone();
    let app_identifier = app.config().identifier.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = agents_path(&app_handle)?;
        let _guard = AgentWriteGuard::acquire(&path)?;
        let agents = load_agents_from_path(&path)?;
        if !agents.iter().any(|agent| agent.id == agent_id) {
            return Err(AppError::not_found("Self-hosted probe agent not found."));
        }
        agent_token_entry(&app_identifier, &agent_id)?
            .set_password(token.trim())
            .map_err(|_| token_storage_error())
    })
    .await
    .map_err(|_| AppError::task_failed("save self-hosted agent credentials"))?
}

pub async fn run_agent_measurement<R: Runtime>(
    app: &AppHandle<R>,
    agent_id: String,
    measurement_type: String,
    target: String,
) -> AppResult<AgentMeasurementResult> {
    let _permit = try_acquire_agent_measurement_slot()?;
    let app_handle = app.clone();
    let app_identifier = app.config().identifier.clone();
    let (agent, token) = tauri::async_runtime::spawn_blocking(move || {
        let path = agents_path(&app_handle)?;
        let agents = load_sanitized_agents(&path)?;
        let agent = agents
            .into_iter()
            .find(|agent| agent.id == agent_id)
            .ok_or_else(|| AppError::not_found("Self-hosted probe agent not found."))?;
        let token = agent_token_entry(&app_identifier, &agent.id)?
            .get_password()
            .map_err(|_| token_storage_error())?;
        Ok::<_, AppError>((agent, token))
    })
    .await
    .map_err(|_| AppError::task_failed("load self-hosted agent credentials"))??;

    execute_agent_measurement(agent, token, measurement_type, target).await
}

pub async fn agents_as_nodes<R: Runtime>(app: &AppHandle<R>) -> AppResult<Vec<ProbeNode>> {
    let app_handle = app.clone();
    let app_identifier = app.config().identifier.clone();
    let credentials = tauri::async_runtime::spawn_blocking(move || {
        let path = agents_path(&app_handle)?;
        let agents = load_sanitized_agents(&path)?;
        Ok::<_, AppError>(
            agents
                .into_iter()
                .map(|agent| {
                    let token = agent_token_entry(&app_identifier, &agent.id)
                        .and_then(|entry| entry.get_password().map_err(|_| token_storage_error()))
                        .ok();
                    (agent, token)
                })
                .collect::<Vec<_>>(),
        )
    })
    .await
    .map_err(|_| AppError::task_failed("load self-hosted agent credentials"))??;

    let mut nodes = futures_util::stream::iter(credentials.into_iter().enumerate().map(
        |(index, (agent, token))| async move {
            let reachable = if let Some(token) = token {
                match Url::parse(&agent.endpoint) {
                    Ok(endpoint) => health_check(endpoint, &agent.id, token).await,
                    Err(_) => false,
                }
            } else {
                false
            };
            (
                index,
                ProbeNode {
                    id: agent.id,
                    kind: "remote-agent".into(),
                    label: agent.label,
                    reachable,
                    endpoint: endpoint_for_display(&agent.endpoint),
                    region: None,
                    capabilities: Some(vec!["dns".into(), "ping".into(), "http".into()]),
                },
            )
        },
    ))
    .buffer_unordered(AGENT_MAX_HEALTH_CHECKS)
    .collect::<Vec<_>>()
    .await;
    nodes.sort_by_key(|(index, _)| *index);
    Ok(nodes.into_iter().map(|(_, node)| node).collect())
}

async fn health_check(endpoint: Url, agent_id: &str, token: String) -> bool {
    let Ok(endpoint) = validate_endpoint(endpoint.as_str()) else {
        return false;
    };
    let client = match reqwest::Client::builder()
        .timeout(AGENT_HEALTH_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    let Ok(health) = agent_endpoint(&endpoint, &["v1", "health"]) else {
        return false;
    };
    let Ok(headers) = signed_headers("GET", health.path(), agent_id, &token, &[]) else {
        return false;
    };
    let Ok(response) = client.get(health).headers(headers).send().await else {
        return false;
    };
    if !response.status().is_success() {
        return false;
    }
    let Ok(bytes) = read_limited_body(response, 16 * 1024).await else {
        return false;
    };
    matches!(
        serde_json::from_slice::<AgentHealthResponse>(&bytes),
        Ok(health) if health.protocol == AGENT_PROTOCOL && health.status == "ok"
    )
}

fn save_agent_and_token(
    path: &Path,
    app_identifier: &str,
    agent: AgentRecord,
    token: &str,
) -> AppResult<()> {
    let entry = agent_token_entry(app_identifier, &agent.id)?;
    let _guard = AgentWriteGuard::acquire(path)?;
    let mut agents = load_agents_from_path(path)?;
    sanitize_agent_endpoints(&mut agents);
    if agents.len() >= AGENT_MAX_REGISTRATIONS {
        return Err(AppError::invalid_input(format!(
            "At most {AGENT_MAX_REGISTRATIONS} self-hosted probe agents can be registered."
        )));
    }
    let previous_agents = agents.clone();
    agents.push(agent);
    save_agents_to_path(path, &agents)?;
    if entry.set_password(token).is_err() {
        let _ = entry.delete_credential();
        let _ = save_agents_to_path(path, &previous_agents);
        return Err(token_storage_error());
    }
    Ok(())
}

fn remove_agent_and_token(path: &Path, app_identifier: &str, agent_id: &str) -> AppResult<()> {
    let entry = agent_token_entry(app_identifier, agent_id)?;
    let _guard = AgentWriteGuard::acquire(path)?;
    let mut agents = load_agents_from_path(path)?;
    sanitize_agent_endpoints(&mut agents);
    let Some(index) = agents.iter().position(|agent| agent.id == agent_id) else {
        return Err(AppError::not_found("Self-hosted probe agent not found."));
    };
    let previous_agents = agents.clone();
    agents.remove(index);
    save_agents_to_path(path, &agents)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => {
            // Keep registry and secure-store state recoverable if Keychain refuses deletion.
            let _ = save_agents_to_path(path, &previous_agents);
            Err(token_storage_error())
        }
    }
}

fn validate_agent_token(token: &str) -> AppResult<()> {
    let token = token.trim();
    if token.is_empty()
        || token.len() > 2048
        || !token.is_ascii()
        || token
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        return Err(AppError::invalid_input(
            "The agent token format is invalid.",
        ));
    }
    Ok(())
}

fn validate_agent_label(label: &str) -> AppResult<String> {
    let label = label.trim();
    if label.is_empty() || label.chars().count() > 80 || label.chars().any(char::is_control) {
        return Err(AppError::invalid_input(
            "Agent labels must contain 1 to 80 printable characters.",
        ));
    }
    Ok(label.to_owned())
}

fn agent_token_entry(app_identifier: &str, agent_id: &str) -> AppResult<keyring::Entry> {
    if app_identifier.is_empty()
        || app_identifier.len() > 255
        || app_identifier
            .chars()
            .any(|character| !(character.is_ascii_alphanumeric() || ".-_".contains(character)))
        || !valid_agent_id(agent_id)
    {
        return Err(token_storage_error());
    }
    let service = format!("{app_identifier}.network-probe.agent");
    let account = format!("agent-token.v1:{agent_id}");
    keyring::Entry::new(&service, &account).map_err(|_| token_storage_error())
}

fn valid_agent_id(agent_id: &str) -> bool {
    agent_id.strip_prefix("agent-").is_some_and(|suffix| {
        suffix.len() == 36
            && suffix
                .chars()
                .all(|character| character.is_ascii_hexdigit() || character == '-')
    })
}

fn token_storage_error() -> AppError {
    AppError::new(
        "AGENT_TOKEN_STORAGE",
        "Could not access the system secure credential store.",
    )
}

fn signed_headers(
    method: &str,
    path: &str,
    agent_id: &str,
    token: &str,
    body: &[u8],
) -> AppResult<reqwest::header::HeaderMap> {
    validate_agent_token(token)?;
    if !valid_agent_id(agent_id) || !path.starts_with('/') || path.contains(['\r', '\n']) {
        return Err(AppError::invalid_input(
            "Invalid self-hosted agent request.",
        ));
    }
    let timestamp = chrono::Utc::now().timestamp().to_string();
    let nonce = uuid::Uuid::new_v4().to_string();
    let body_hash = URL_SAFE_NO_PAD.encode(Sha256::digest(body));
    let signing_input = agent_signing_input(method, path, agent_id, &timestamp, &nonce, &body_hash);
    let mut mac = Hmac::<Sha256>::new_from_slice(token.trim().as_bytes())
        .map_err(|_| AppError::internal("Could not sign self-hosted agent request."))?;
    mac.update(signing_input.as_bytes());
    let signature = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "x-bench-agent-id",
        reqwest::header::HeaderValue::from_str(agent_id)
            .map_err(|_| AppError::invalid_input("Invalid self-hosted agent ID."))?,
    );
    headers.insert(
        "x-bench-timestamp",
        reqwest::header::HeaderValue::from_str(&timestamp)
            .map_err(|_| AppError::internal("Could not sign self-hosted agent request."))?,
    );
    headers.insert(
        "x-bench-nonce",
        reqwest::header::HeaderValue::from_str(&nonce)
            .map_err(|_| AppError::internal("Could not sign self-hosted agent request."))?,
    );
    headers.insert(
        "x-bench-signature",
        reqwest::header::HeaderValue::from_str(&signature)
            .map_err(|_| AppError::internal("Could not sign self-hosted agent request."))?,
    );
    Ok(headers)
}

fn agent_signing_input(
    method: &str,
    path: &str,
    agent_id: &str,
    timestamp: &str,
    nonce: &str,
    body_hash: &str,
) -> String {
    format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method.to_ascii_uppercase(),
        path,
        agent_id,
        timestamp,
        nonce,
        body_hash
    )
}

fn agent_endpoint(base: &Url, path: &[&str]) -> AppResult<Url> {
    let mut url = base.clone();
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| AppError::invalid_input("Invalid self-hosted agent URL."))?;
        segments.pop_if_empty();
        for segment in path {
            segments.push(segment);
        }
    }
    Ok(url)
}

struct ValidatedAgentTarget {
    request_target: String,
    display_target: String,
}

fn validate_agent_target(measurement_type: &str, target: &str) -> AppResult<ValidatedAgentTarget> {
    let target = target.trim();
    if target.is_empty()
        || target.chars().count() > AGENT_MAX_TARGET_LEN
        || target.chars().any(char::is_control)
    {
        return Err(AppError::invalid_input(
            "The measurement target is invalid.",
        ));
    }
    match measurement_type {
        "dns" | "ping" => {
            if target
                .chars()
                .any(|character| character.is_whitespace() || "/\\?#@%,".contains(character))
            {
                return Err(AppError::invalid_input(
                    "Enter one hostname or IP address for the agent measurement.",
                ));
            }
            let host = Host::parse(target)
                .map_err(|_| AppError::invalid_input("Enter one valid hostname or IP address."))?;
            let host = host.to_string();
            if is_blocked_agent_target_host(&host) {
                return Err(AppError::invalid_input(
                    "Cloud metadata and link-local targets are blocked for remote agents.",
                ));
            }
            Ok(ValidatedAgentTarget {
                request_target: host.clone(),
                display_target: host,
            })
        }
        "http" => {
            let mut url = Url::parse(target)
                .map_err(|_| AppError::invalid_input("Enter a valid HTTP or HTTPS URL."))?;
            if !matches!(url.scheme(), "http" | "https")
                || !url.username().is_empty()
                || url.password().is_some()
                || has_url_authority_userinfo(target)
                || url.fragment().is_some()
            {
                return Err(AppError::invalid_input(
                    "Use an HTTP or HTTPS URL without credentials or a fragment.",
                ));
            }
            let host = url
                .host_str()
                .ok_or_else(|| AppError::invalid_input("Enter a valid HTTP or HTTPS URL."))?;
            if is_blocked_agent_target_host(host) {
                return Err(AppError::invalid_input(
                    "Cloud metadata and link-local targets are blocked for remote agents.",
                ));
            }
            let request_target = url.to_string();
            url.set_query(None);
            Ok(ValidatedAgentTarget {
                request_target,
                display_target: url.to_string(),
            })
        }
        _ => Err(AppError::invalid_input(
            "Unsupported self-hosted agent measurement type.",
        )),
    }
}

fn is_blocked_agent_target_host(host: &str) -> bool {
    let normalized = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if is_blocked_agent_endpoint_host(&normalized)
        || normalized == "localhost"
        || normalized.ends_with(".localhost")
    {
        return true;
    }
    if let Ok(address) = normalized.parse::<std::net::IpAddr>() {
        return match address {
            std::net::IpAddr::V4(ip) => ip.octets()[0] == 127,
            std::net::IpAddr::V6(ip) => {
                ip.is_loopback()
                    || ip
                        .to_ipv4_mapped()
                        .is_some_and(|mapped| mapped.octets()[0] == 127)
            }
        };
    }
    false
}

fn is_blocked_agent_endpoint_host(host: &str) -> bool {
    let normalized = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if [
        "metadata",
        "metadata.google.internal",
        "instance-data.ec2.internal",
    ]
    .contains(&normalized.as_str())
    {
        return true;
    }
    if let Ok(address) = normalized.parse::<std::net::IpAddr>() {
        return match address {
            std::net::IpAddr::V4(ip) => ip.octets()[0] == 169 && ip.octets()[1] == 254,
            std::net::IpAddr::V6(ip) => {
                ip.is_unicast_link_local()
                    || ip.to_ipv4_mapped().is_some_and(|mapped| {
                        mapped.octets()[0] == 169 && mapped.octets()[1] == 254
                    })
            }
        };
    }
    false
}

async fn read_limited_body(response: reqwest::Response, limit: usize) -> AppResult<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|size| size > limit as u64)
    {
        return Err(agent_response_error());
    }
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| agent_response_error())?;
        if body.len().saturating_add(chunk.len()) > limit {
            return Err(agent_response_error());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

async fn execute_agent_measurement(
    agent: AgentRecord,
    token: String,
    measurement_type: String,
    target: String,
) -> AppResult<AgentMeasurementResult> {
    reject_arbitrary_agent_exec(&measurement_type)?;
    let validated_target = validate_agent_target(&measurement_type, &target)?;
    let endpoint = validate_endpoint(&agent.endpoint)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::to_vec(&AgentMeasurementRequest {
        protocol: AGENT_PROTOCOL,
        request_id: &request_id,
        measurement_type: &measurement_type,
        target: &validated_target.request_target,
        timeout_ms: AGENT_REQUEST_TIMEOUT.as_millis() as u64,
    })
    .map_err(|_| AppError::internal("Could not encode self-hosted agent request."))?;
    let endpoint = agent_endpoint(&endpoint, &["v1", "measurements"])?;
    let headers = signed_headers("POST", endpoint.path(), &agent.id, &token, &body)?;
    let started = Instant::now();
    let client = reqwest::Client::builder()
        .connect_timeout(AGENT_HEALTH_TIMEOUT)
        .timeout(AGENT_REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|_| agent_client_error())?;
    let response = client
        .post(endpoint)
        .headers(headers)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body)
        .send()
        .await
        .map_err(|_| agent_client_error())?;
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let retry_after_seconds = parse_retry_after_seconds(response.headers());
        return Ok(AgentMeasurementResult {
            node_id: agent.id.clone(),
            measurement_type,
            target: validated_target.display_target,
            status: "rate-limited".into(),
            probe: failed_agent_probe(&agent, "rate-limited"),
            elapsed_ms,
            retry_after_seconds,
        });
    }
    if !response.status().is_success() {
        return Err(agent_client_error());
    }
    let response_bytes = read_limited_body(response, AGENT_MAX_RESPONSE_BYTES).await?;
    let response = serde_json::from_slice::<AgentMeasurementResponse>(&response_bytes)
        .map_err(|_| agent_response_error())?;
    if response.protocol != AGENT_PROTOCOL || response.request_id != request_id {
        return Err(agent_response_error());
    }
    if response.status != "complete" {
        return Err(AppError::new(
            "AGENT_MEASUREMENT_FAILED",
            "The self-hosted probe agent did not complete the measurement.",
        ));
    }
    let payload = response.result.ok_or_else(agent_response_error)?;
    let probe = sanitize_agent_payload(&measurement_type, &agent, payload)?;
    Ok(AgentMeasurementResult {
        node_id: agent.id,
        measurement_type,
        target: validated_target.display_target,
        status: "complete".into(),
        probe,
        elapsed_ms,
        retry_after_seconds: None,
    })
}

fn failed_agent_probe(agent: &AgentRecord, status: &str) -> GlobalpingProbeResult {
    GlobalpingProbeResult {
        id: agent.id.clone(),
        label: agent.label.clone(),
        status: "failed".into(),
        summary: Some(status.to_owned()),
        detail: None,
        answers: Vec::new(),
        dns_rcode: None,
        avg_rtt_ms: None,
        packet_loss_percent: None,
        packets_sent: None,
        packets_received: None,
        http_status_code: None,
        total_time_ms: None,
        failure_source: Some("agent".into()),
    }
}

fn sanitize_agent_payload(
    measurement_type: &str,
    agent: &AgentRecord,
    payload: AgentMeasurementPayload,
) -> AppResult<GlobalpingProbeResult> {
    let answers: Vec<String> = payload
        .answers
        .into_iter()
        .filter(|answer| !answer.chars().any(char::is_control))
        .take(64)
        .map(|answer| answer.chars().take(255).collect())
        .collect();
    let dns_rcode = payload.dns_rcode.filter(|rcode| {
        !rcode.is_empty()
            && rcode.len() <= 16
            && rcode
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
    });
    let avg_rtt_ms = bounded_metric(payload.avg_rtt_ms, 0.0, 600_000.0);
    let packet_loss_percent = bounded_metric(payload.packet_loss_percent, 0.0, 100.0);
    let total_time_ms = bounded_metric(payload.total_time_ms, 0.0, 600_000.0);
    if payload.packets_sent.is_some_and(|count| count > 3)
        || payload
            .packets_received
            .is_some_and(|count| count > payload.packets_sent.unwrap_or(3))
        || payload
            .http_status_code
            .is_some_and(|status| !(100..=599).contains(&status))
    {
        return Err(agent_response_error());
    }
    let has_measurement_data = match measurement_type {
        "dns" => !answers.is_empty() || dns_rcode.is_some(),
        "ping" => {
            payload.packets_sent.is_some_and(|sent| sent > 0) && payload.packets_received.is_some()
        }
        "http" => payload.http_status_code.is_some() || total_time_ms.is_some(),
        _ => false,
    };
    if !has_measurement_data {
        return Err(agent_response_error());
    }
    Ok(GlobalpingProbeResult {
        id: agent.id.clone(),
        label: agent.label.clone(),
        status: "finished".into(),
        summary: None,
        detail: None,
        answers,
        dns_rcode,
        avg_rtt_ms,
        packet_loss_percent,
        packets_sent: payload.packets_sent,
        packets_received: payload.packets_received,
        http_status_code: payload.http_status_code,
        total_time_ms,
        failure_source: None,
    })
}

fn bounded_metric(value: Option<f64>, minimum: f64, maximum: f64) -> Option<f64> {
    value.filter(|number| number.is_finite() && *number >= minimum && *number <= maximum)
}

fn parse_retry_after_seconds(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    headers
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(|seconds| seconds.min(3600))
}

fn agent_client_error() -> AppError {
    AppError::new(
        "AGENT_CLIENT",
        "Could not complete the self-hosted probe agent request.",
    )
}

fn agent_response_error() -> AppError {
    AppError::new(
        "AGENT_RESPONSE",
        "The self-hosted probe agent returned an invalid response.",
    )
}

/// Reject non-whitelist agent actions (S-DIS-05 negative).
pub fn reject_arbitrary_agent_exec(action: &str) -> AppResult<()> {
    if AGENT_ALLOWED_TOOLS.contains(&action) || action == "health" {
        Ok(())
    } else {
        Err(AppError::invalid_input(
            "Agent action is not in the whitelist (no shell or arbitrary execution).",
        ))
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
        let workers = AGENT_MAX_REGISTRATIONS;
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
    fn agent_registry_enforces_its_limit_under_the_write_lock() {
        let path = temp_registry_path();
        for index in 0..AGENT_MAX_REGISTRATIONS {
            add_agent_record(&path, record(format!("agent-{index}"))).unwrap();
        }

        let error = add_agent_record(&path, record("agent-over-limit".into())).unwrap_err();
        assert_eq!(error.code, "INVALID_INPUT");
        assert_eq!(
            load_agents_from_path(&path).unwrap().len(),
            AGENT_MAX_REGISTRATIONS
        );
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn endpoint_rejects_embedded_credentials_and_url_secrets() {
        for endpoint in [
            "https://user:password@agent.example",
            "https://agent.example/?token=secret",
            "https://agent.example/#secret",
            "https://@agent.example",
            "wss://agent.example",
            "https://metadata.google.internal.",
            "https://169.254.0.1",
            "https://[fe80::1]",
        ] {
            assert!(validate_endpoint(endpoint).is_err(), "accepted {endpoint}");
        }
        assert!(
            validate_endpoint(&format!("https://{}", "a".repeat(AGENT_MAX_TARGET_LEN))).is_err()
        );
        assert!(validate_endpoint("https://agent.example").is_ok());
        assert!(validate_endpoint("https://127.0.0.1:8443").is_ok());
    }

    #[test]
    fn agent_labels_validate_user_visible_character_count() {
        assert_eq!(validate_agent_label("  实验室  ").unwrap(), "实验室");
        assert!(validate_agent_label("").is_err());
        assert!(validate_agent_label(&"名".repeat(80)).is_ok());
        assert!(validate_agent_label(&"名".repeat(81)).is_err());
        assert!(validate_agent_label("valid\ninvalid").is_err());
    }

    #[test]
    fn hmac_headers_sign_method_path_timestamp_nonce_and_body_hash_without_exposing_token() {
        let token = "agent-shared-secret";
        let body = br#"{"measurementType":"dns","target":"example.com"}"#;
        let headers = signed_headers(
            "post",
            "/api/v1/measurements",
            "agent-123e4567-e89b-12d3-a456-426614174000",
            token,
            body,
        )
        .unwrap();
        let timestamp = headers.get("x-bench-timestamp").unwrap().to_str().unwrap();
        let nonce = headers.get("x-bench-nonce").unwrap().to_str().unwrap();
        let signature = URL_SAFE_NO_PAD
            .decode(headers.get("x-bench-signature").unwrap())
            .unwrap();
        let body_hash = URL_SAFE_NO_PAD.encode(Sha256::digest(body));
        let input = agent_signing_input(
            "POST",
            "/api/v1/measurements",
            "agent-123e4567-e89b-12d3-a456-426614174000",
            timestamp,
            nonce,
            &body_hash,
        );
        let mut mac = Hmac::<Sha256>::new_from_slice(token.as_bytes()).unwrap();
        mac.update(input.as_bytes());
        mac.verify_slice(&signature).unwrap();

        let changed_body_hash = URL_SAFE_NO_PAD.encode(Sha256::digest(b"changed"));
        let changed_input = agent_signing_input(
            "POST",
            "/api/v1/measurements",
            "agent-123e4567-e89b-12d3-a456-426614174000",
            timestamp,
            nonce,
            &changed_body_hash,
        );
        let mut changed_mac = Hmac::<Sha256>::new_from_slice(token.as_bytes()).unwrap();
        changed_mac.update(changed_input.as_bytes());
        assert!(changed_mac.verify_slice(&signature).is_err());
        let changed_agent_input = agent_signing_input(
            "POST",
            "/api/v1/measurements",
            "agent-123e4567-e89b-12d3-a456-426614174001",
            timestamp,
            nonce,
            &body_hash,
        );
        let mut changed_agent_mac = Hmac::<Sha256>::new_from_slice(token.as_bytes()).unwrap();
        changed_agent_mac.update(changed_agent_input.as_bytes());
        assert!(changed_agent_mac.verify_slice(&signature).is_err());
        assert!(!format!("{headers:?}").contains(token));
        assert_eq!(
            headers.get("x-bench-agent-id").unwrap(),
            "agent-123e4567-e89b-12d3-a456-426614174000"
        );
    }

    #[test]
    fn measurement_targets_reject_metadata_link_local_and_shell_actions() {
        for target in [
            "169.254.169.254",
            "2852039166",
            "metadata.google.internal.",
            concat!("[fe80", "::1]"),
            "http://[::ffff:a9fe:a9fe]/",
            "localhost",
            "api.localhost",
            "127.42.0.1",
            "http://[::1]/",
            "http://0251.0376.0251.0376/",
        ] {
            assert!(
                validate_agent_target(
                    if target.starts_with("http") {
                        "http"
                    } else {
                        "ping"
                    },
                    target
                )
                .is_err(),
                "accepted {target}"
            );
        }
        assert!(validate_agent_target("http", "https://example.com/status?key=private").is_ok());
        assert_eq!(
            validate_agent_target("http", "https://example.com/status?key=private")
                .unwrap()
                .display_target,
            "https://example.com/status"
        );
        assert!(validate_agent_target("http", "http://@example.com").is_err());
        assert!(reject_arbitrary_agent_exec("dns").is_ok());
        assert!(reject_arbitrary_agent_exec("ping").is_ok());
        assert!(reject_arbitrary_agent_exec("http").is_ok());
        assert!(reject_arbitrary_agent_exec("shell").is_err());
        assert!(reject_arbitrary_agent_exec("health").is_ok());
    }

    #[test]
    fn agent_measurement_payload_is_bounded_and_invalid_counters_are_rejected() {
        let agent = record("agent-123e4567-e89b-12d3-a456-426614174000".into());
        let result = sanitize_agent_payload(
            "dns",
            &agent,
            AgentMeasurementPayload {
                answers: vec!["1.1.1.1".into(), "bad\nanswer".into()],
                dns_rcode: Some("NOERROR".into()),
                avg_rtt_ms: Some(f64::NAN),
                packet_loss_percent: Some(101.0),
                packets_sent: Some(3),
                packets_received: Some(3),
                http_status_code: Some(204),
                total_time_ms: Some(52.0),
            },
        )
        .unwrap();
        assert_eq!(result.answers, vec!["1.1.1.1"]);
        assert_eq!(result.dns_rcode.as_deref(), Some("NOERROR"));
        assert_eq!(result.avg_rtt_ms, None);
        assert_eq!(result.packet_loss_percent, None);
        assert_eq!(result.http_status_code, Some(204));
        assert_eq!(result.total_time_ms, Some(52.0));

        let invalid = sanitize_agent_payload(
            "ping",
            &agent,
            AgentMeasurementPayload {
                answers: Vec::new(),
                dns_rcode: None,
                avg_rtt_ms: None,
                packet_loss_percent: None,
                packets_sent: Some(2),
                packets_received: Some(3),
                http_status_code: None,
                total_time_ms: None,
            },
        );
        assert!(invalid.is_err());
    }

    #[test]
    fn agent_response_requires_data_for_the_requested_measurement_type() {
        let agent = record("agent-123e4567-e89b-12d3-a456-426614174000".into());
        let empty_payload = || AgentMeasurementPayload {
            answers: Vec::new(),
            dns_rcode: None,
            avg_rtt_ms: None,
            packet_loss_percent: None,
            packets_sent: None,
            packets_received: None,
            http_status_code: None,
            total_time_ms: None,
        };

        for measurement_type in ["dns", "ping", "http"] {
            assert!(
                sanitize_agent_payload(measurement_type, &agent, empty_payload()).is_err(),
                "accepted empty {measurement_type} result"
            );
        }
    }

    #[test]
    fn self_hosted_agent_measurements_have_a_backend_concurrency_cap() {
        let permits = (0..AGENT_MAX_MEASUREMENTS)
            .map(|_| try_acquire_agent_measurement_slot().unwrap())
            .collect::<Vec<_>>();
        let error = try_acquire_agent_measurement_slot().unwrap_err();
        assert_eq!(error.code, "AGENT_BUSY");
        drop(permits);
        assert!(try_acquire_agent_measurement_slot().is_ok());
    }

    #[test]
    fn retry_after_is_parsed_as_bounded_seconds() {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(reqwest::header::RETRY_AFTER, " 17 ".parse().unwrap());
        assert_eq!(parse_retry_after_seconds(&headers), Some(17));
        headers.insert(reqwest::header::RETRY_AFTER, "999999".parse().unwrap());
        assert_eq!(parse_retry_after_seconds(&headers), Some(3600));
        headers.insert(reqwest::header::RETRY_AFTER, "later".parse().unwrap());
        assert_eq!(parse_retry_after_seconds(&headers), None);
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
