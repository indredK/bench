use super::fingerprints::fingerprint_port_process;
use super::types::{
    KillPidResult, KillTarget, PortProcessDetail, ProcessChildrenPage, ProcessNode,
    PROCESS_TREE_CHILD_PAGE_SIZE,
};
use crate::error::{AppError, AppResult};
use crate::subprocess::{output_may_be_truncated, run_output_with_timeout, SubprocessErrorKind};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;
use sysinfo::System;

type ProcessSnapshot = HashMap<u32, (u32, String, String)>;
type ProcessIdentityCache = HashMap<u32, Option<String>>;

#[derive(Clone)]
struct ProcessMetadata {
    start_time: u64,
    name: String,
    executable: Option<PathBuf>,
}

type ProcessMetadataSnapshot = HashMap<u32, ProcessMetadata>;

const PORT_QUERY_COMMAND_TIMEOUT: Duration = Duration::from_secs(10);
#[cfg(target_os = "windows")]
const PROCESS_TREE_KILL_COMMAND_TIMEOUT: Duration = Duration::from_secs(10);

/// Stable error codes the frontend can branch on for UX. Strings are intentional
/// — frontends compare them as-is.
pub mod error_codes {
    pub const PID_GONE: &str = "PID_GONE";
    pub const PID_REUSED: &str = "PID_REUSED";
    pub const PERMISSION_DENIED: &str = "PERMISSION_DENIED";
    pub const SELF_KILL: &str = "SELF_KILL";
    pub const CHILD_KILL: &str = "CHILD_KILL";
    #[cfg(not(target_os = "windows"))]
    pub const CHILD_KILL_FAILED: &str = "CHILD_KILL_FAILED";
    pub const INVALID_PID: &str = "INVALID_PID";
    pub const IDENTITY_UNAVAILABLE: &str = "IDENTITY_UNAVAILABLE";
}

pub(super) fn query_port_processes(ports: Vec<u16>) -> Vec<PortProcessDetail> {
    if ports.is_empty() {
        return Vec::new();
    }

    let (all_processes, process_metadata) = get_all_processes();
    let children_by_parent = build_children_index(&all_processes);
    let pids_by_port = find_pids_by_ports(&ports);
    let mut identity_cache = ProcessIdentityCache::new();

    ports
        .into_iter()
        .map(|port| {
            let pids = match &pids_by_port {
                Ok(by_port) => by_port.get(&port).cloned().unwrap_or_default(),
                Err(error) => {
                    return PortProcessDetail {
                        port,
                        pids: vec![],
                        process_trees: vec![],
                        fingerprint: None,
                        error: Some(format!("Failed to query: {}", error)),
                    };
                }
            };

            if pids.is_empty() {
                // 空闲不是错误：`error` 一旦置位，前端就只能把它当查询失败或
                // 把两种情况一起折叠掉。空 pids 已经表达了「没有进程占用」。
                return PortProcessDetail {
                    port,
                    pids: vec![],
                    process_trees: vec![],
                    fingerprint: None,
                    error: None,
                };
            }

            let mut process_trees = build_focused_trees(&pids, &all_processes, &children_by_parent);
            for tree in &mut process_trees {
                attach_process_identities(tree, &process_metadata, &mut identity_cache);
            }

            let fingerprint = fingerprint_port_process(port, &pids, &all_processes);

            PortProcessDetail {
                port,
                pids,
                process_trees,
                fingerprint,
                error: None,
            }
        })
        .collect()
}

pub(super) fn query_process_children(
    pid: u32,
    expected_ppid: u32,
    expected_name: String,
    expected_identity: Option<String>,
    after_pid: Option<u32>,
) -> AppResult<ProcessChildrenPage> {
    if pid == 0 {
        return Err(AppError::invalid_input(
            "PID 0 is not a valid process target",
        ));
    }
    if expected_name.trim().is_empty() || expected_name.len() > 512 {
        return Err(AppError::invalid_input("Process name is invalid"));
    }
    let (all_processes, metadata) = get_all_processes();
    let Some((actual_ppid, actual_name, _)) = all_processes.get(&pid) else {
        return Err(process_tree_stale_error());
    };
    if *actual_ppid != expected_ppid || actual_name != &expected_name {
        return Err(process_tree_stale_error());
    }

    if let Some(expected_identity) = expected_identity.as_deref() {
        let current_identity = metadata
            .get(&pid)
            .and_then(|entry| identity_for_process(pid, entry));
        if current_identity.as_deref() != Some(expected_identity) {
            return Err(process_tree_stale_error());
        }
    }

    let children_by_parent = build_children_index(&all_processes);
    let mut page = build_process_children_page(pid, after_pid, &all_processes, &children_by_parent);
    let mut identity_cache = ProcessIdentityCache::new();
    for child in &mut page.children {
        attach_process_identities(child, &metadata, &mut identity_cache);
    }
    Ok(page)
}

fn build_process_children_page(
    parent_pid: u32,
    after_pid: Option<u32>,
    all: &ProcessSnapshot,
    children_by_parent: &HashMap<u32, Vec<u32>>,
) -> ProcessChildrenPage {
    let child_pids = children_by_parent
        .get(&parent_pid)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let start = after_pid
        .map(|cursor| child_pids.partition_point(|pid| *pid <= cursor))
        .unwrap_or(0);
    let end = start
        .saturating_add(PROCESS_TREE_CHILD_PAGE_SIZE)
        .min(child_pids.len());
    let children = child_pids[start..end]
        .iter()
        .map(|child_pid| build_shallow_node(*child_pid, all, children_by_parent))
        .collect::<Vec<_>>();
    let next_after_pid = (end < child_pids.len())
        .then(|| children.last().map(|child| child.pid))
        .flatten();

    ProcessChildrenPage {
        parent_pid,
        children,
        next_after_pid,
    }
}

fn process_tree_stale_error() -> AppError {
    AppError::new(
        "PROCESS_TREE_STALE",
        "The process changed since the scan. Rescan the port to refresh its process tree.",
    )
}

pub(super) fn kill_processes(targets: Vec<KillTarget>) -> Vec<KillPidResult> {
    let (all_processes, process_metadata) = get_all_processes();
    // The Unix kill path needs a child index to terminate descendants. Build it
    // once per batch instead of rescanning the full process snapshot per PID.
    let children_by_parent = if cfg!(target_os = "windows") {
        HashMap::new()
    } else {
        build_children_index(&all_processes)
    };
    targets
        .into_iter()
        .map(|target| {
            // Re-read the native creation time immediately before validating and
            // acting on this target. Only requested port owners incur the OS call.
            let current_identity = process_metadata
                .get(&target.pid)
                .and_then(|metadata| identity_for_process(target.pid, metadata));
            kill_one(
                target,
                &all_processes,
                &process_metadata,
                current_identity.as_deref(),
                &children_by_parent,
            )
        })
        .collect()
}

/// Drop duplicate targets while preserving order, and reject contradictory
/// scan-time identities before any process is touched.
pub(super) fn deduplicate_kill_targets(targets: Vec<KillTarget>) -> AppResult<Vec<KillTarget>> {
    let mut positions = HashMap::<u32, usize>::new();
    let mut unique: Vec<KillTarget> = Vec::new();

    for mut target in targets {
        target.expected_name = target
            .expected_name
            .take()
            .map(|name| name.trim().to_string())
            .filter(|name| !name.is_empty());
        target.expected_identity = target
            .expected_identity
            .take()
            .map(|identity| identity.trim().to_ascii_lowercase())
            .filter(|identity| {
                identity.len() == 64 && identity.bytes().all(|byte| byte.is_ascii_hexdigit())
            });

        if let Some(&position) = positions.get(&target.pid) {
            let existing = &unique[position];
            let same_name = match (
                existing.expected_name.as_deref(),
                target.expected_name.as_deref(),
            ) {
                (Some(left), Some(right)) => left.eq_ignore_ascii_case(right),
                (None, None) => true,
                _ => false,
            };
            let same_process_identity = existing.expected_identity == target.expected_identity;
            let same_identity = same_name && same_process_identity;
            if !same_identity {
                return Err(AppError::invalid_input(format!(
                    "PID {} was submitted with conflicting scan-time identities",
                    target.pid
                )));
            }
            continue;
        }

        if unique.len() == super::types::MAX_KILL_TARGETS {
            return Err(AppError::invalid_input(format!(
                "A kill request may contain at most {} unique process targets",
                super::types::MAX_KILL_TARGETS
            )));
        }

        positions.insert(target.pid, unique.len());
        unique.push(target);
    }

    Ok(unique)
}

fn kill_one(
    target: KillTarget,
    all_processes: &ProcessSnapshot,
    process_metadata: &ProcessMetadataSnapshot,
    current_identity: Option<&str>,
    children_by_parent: &HashMap<u32, Vec<u32>>,
) -> KillPidResult {
    let pid = target.pid;

    if pid == 0 {
        return KillPidResult {
            pid,
            success: false,
            message: "PID 0 is not a valid process target".to_string(),
            error_code: Some(error_codes::INVALID_PID.to_string()),
        };
    }

    let Some(expected) = target
        .expected_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
    else {
        return KillPidResult {
            pid,
            success: false,
            message: format!("PID {} has no scan-time process identity", pid),
            error_code: Some(error_codes::IDENTITY_UNAVAILABLE.to_string()),
        };
    };

    // Pre-kill identity check: catch PID reuse before sending a signal that
    // could harm an unrelated process that grabbed the same PID slot. Linux's
    // 32k default cap makes this realistic for any "scan and then act later"
    // workflow.
    match all_processes.get(&pid).map(|(_, name, _)| name.as_str()) {
        None => {
            return KillPidResult {
                pid,
                success: false,
                message: format!("PID {} no longer exists", pid),
                error_code: Some(error_codes::PID_GONE.to_string()),
            };
        }
        Some(actual) if !actual.eq_ignore_ascii_case(expected) => {
            return KillPidResult {
                pid,
                success: false,
                message: format!(
                    "PID {} now belongs to '{}' (was '{}') — refusing to kill",
                    pid, actual, expected
                ),
                error_code: Some(error_codes::PID_REUSED.to_string()),
            };
        }
        Some(_) => {}
    }

    let Some(expected_identity) = target
        .expected_identity
        .as_deref()
        .filter(|identity| identity.len() == 64)
    else {
        return KillPidResult {
            pid,
            success: false,
            message: format!("PID {} has no scan-time process identity token", pid),
            error_code: Some(error_codes::IDENTITY_UNAVAILABLE.to_string()),
        };
    };

    if let Err(code) = validate_process_identity(expected_identity, current_identity) {
        let message = match code {
            error_codes::PID_REUSED => {
                format!(
                    "PID {} process identity changed since scan — refusing to kill",
                    pid
                )
            }
            _ => format!("PID {} process identity is unavailable", pid),
        };
        return KillPidResult {
            pid,
            success: false,
            message,
            error_code: Some(code.to_string()),
        };
    }

    match kill_process(
        pid,
        expected_identity,
        all_processes,
        process_metadata,
        children_by_parent,
    ) {
        Ok(()) => KillPidResult {
            pid,
            success: true,
            message: "Successfully terminated".to_string(),
            error_code: None,
        },
        Err((message, error_code)) => KillPidResult {
            pid,
            success: false,
            message,
            error_code: Some(error_code),
        },
    }
}

fn kill_process(
    pid: u32,
    expected_identity: &str,
    all_processes: &ProcessSnapshot,
    process_metadata: &ProcessMetadataSnapshot,
    children_by_parent: &HashMap<u32, Vec<u32>>,
) -> Result<(), (String, String)> {
    if pid == 0 {
        return Err((
            "PID 0 is not a valid process target".to_string(),
            error_codes::INVALID_PID.to_string(),
        ));
    }

    let current_pid = std::process::id();
    if pid == current_pid {
        return Err((
            "Cannot kill the Port Manager process itself".to_string(),
            error_codes::SELF_KILL.to_string(),
        ));
    }
    if is_descendant_of(pid, current_pid, all_processes) {
        return Err((
            "Cannot kill a child process of Port Manager".to_string(),
            error_codes::CHILD_KILL.to_string(),
        ));
    }

    #[cfg(target_os = "windows")]
    {
        recheck_target_identity(pid, expected_identity, process_metadata)?;
        let output = run_output_with_timeout(
            Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]),
            PROCESS_TREE_KILL_COMMAND_TIMEOUT,
            None,
        )
        .map_err(|error| {
            let message = match error.kind {
                SubprocessErrorKind::Spawn => "Failed to run taskkill".to_string(),
                SubprocessErrorKind::Timeout => {
                    "taskkill timed out; rescan to verify process state".to_string()
                }
                _ => "taskkill could not be completed".to_string(),
            };
            let code = if error.kind == SubprocessErrorKind::Spawn {
                "SPAWN_FAILED"
            } else {
                "KILL_FAILED"
            };
            (message, code.to_string())
        })?;
        if output_may_be_truncated(&output) {
            return Err((
                "taskkill returned oversized output; rescan to verify process state".to_string(),
                "KILL_FAILED".to_string(),
            ));
        }

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let trimmed = stderr.trim().to_string();
            Err((
                format!("taskkill error: {}", trimmed),
                classify_kill_error(&trimmed),
            ))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // SIGKILL doesn't propagate to children. Kill descendants from deepest to
        // shallowest first so they aren't reparented to PID 1 and left running.
        let descendants = collect_descendants(pid, children_by_parent);
        let descendant_identities = descendants
            .iter()
            .map(|&child_pid| {
                (
                    child_pid,
                    process_metadata
                        .get(&child_pid)
                        .and_then(|metadata| identity_for_process(child_pid, metadata)),
                )
            })
            .collect::<HashMap<_, _>>();
        let child_failures = kill_unix_descendants(
            &descendants,
            &descendant_identities,
            |child_pid| {
                process_metadata
                    .get(&child_pid)
                    .and_then(|metadata| identity_for_process(child_pid, metadata))
            },
            signal_unix_process,
        );
        recheck_target_identity(pid, expected_identity, process_metadata)?;
        finish_unix_target_kill(pid, signal_unix_process(pid), &child_failures)
    }
}

fn validate_process_identity(
    expected_identity: &str,
    actual_identity: Option<&str>,
) -> Result<(), &'static str> {
    match actual_identity {
        None => Err(error_codes::IDENTITY_UNAVAILABLE),
        Some(actual) if actual != expected_identity => Err(error_codes::PID_REUSED),
        Some(_) => Ok(()),
    }
}

fn recheck_target_identity(
    pid: u32,
    expected_identity: &str,
    process_metadata: &ProcessMetadataSnapshot,
) -> Result<(), (String, String)> {
    let current_identity = process_metadata
        .get(&pid)
        .and_then(|metadata| identity_for_process(pid, metadata));
    validate_process_identity(expected_identity, current_identity.as_deref()).map_err(|code| {
        let message = match code {
            error_codes::PID_REUSED => {
                format!("PID {pid} changed identity immediately before termination")
            }
            _ => format!("PID {pid} identity is unavailable immediately before termination"),
        };
        (message, code.to_string())
    })
}

#[cfg(not(target_os = "windows"))]
fn signal_unix_process(pid: u32) -> std::io::Result<()> {
    let pid = libc::pid_t::try_from(pid).map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "PID is out of range")
    })?;
    let result = unsafe { libc::kill(pid, libc::SIGKILL) };
    if result == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(not(target_os = "windows"))]
fn kill_unix_descendants<I, F>(
    descendants: &[u32],
    expected_identities: &HashMap<u32, Option<String>>,
    mut current_identity: I,
    mut signal: F,
) -> Vec<(u32, String)>
where
    I: FnMut(u32) -> Option<String>,
    F: FnMut(u32) -> std::io::Result<()>,
{
    let mut failures = Vec::new();
    for &pid in descendants.iter().rev() {
        let Some(Some(expected)) = expected_identities.get(&pid) else {
            failures.push((
                pid,
                "process identity was unavailable at scan time; refusing to kill".to_string(),
            ));
            continue;
        };
        match current_identity(pid) {
            None => {
                failures.push((
                    pid,
                    "process identity is unavailable; refusing to kill".to_string(),
                ));
                continue;
            }
            Some(actual) if actual != *expected => {
                failures.push((
                    pid,
                    "process identity changed since scan; refusing to kill".to_string(),
                ));
                continue;
            }
            Some(_) => {}
        }

        if let Err(error) = signal(pid) {
            if error.raw_os_error() != Some(libc::ESRCH) {
                failures.push((pid, error.to_string()));
            }
        }
    }
    failures
}

#[cfg(not(target_os = "windows"))]
fn append_child_kill_failures(message: &mut String, failures: &[(u32, String)]) {
    if failures.is_empty() {
        return;
    }
    let details = failures
        .iter()
        .map(|(pid, error)| format!("PID {pid}: {error}"))
        .collect::<Vec<_>>()
        .join("; ");
    message.push_str(&format!(". Descendant termination errors: {details}"));
}

#[cfg(not(target_os = "windows"))]
fn finish_unix_target_kill(
    pid: u32,
    result: std::io::Result<()>,
    child_failures: &[(u32, String)],
) -> Result<(), (String, String)> {
    if let Err(error) = result {
        let mut message = format!("Failed to terminate PID {pid}: {error}");
        append_child_kill_failures(&mut message, child_failures);
        let code = if error.raw_os_error() == Some(libc::ESRCH) {
            error_codes::PID_GONE.to_string()
        } else {
            classify_kill_error(&error.to_string())
        };
        return Err((message, code));
    }

    if child_failures.is_empty() {
        Ok(())
    } else {
        let mut message = format!("PID {pid} was terminated, but some descendants remain");
        append_child_kill_failures(&mut message, child_failures);
        Err((message, error_codes::CHILD_KILL_FAILED.to_string()))
    }
}

/// Map raw stderr from kill/taskkill to a stable error code. Matches the
/// lower-cased English + localized strings we've observed in practice — when
/// in doubt we fall through to a generic code so the frontend still receives
/// the raw message for display.
fn classify_kill_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("permission denied")
        || lower.contains("operation not permitted")
        || lower.contains("access is denied")
        || lower.contains("拒绝访问")
        || stderr.contains("拒絕存取")
    {
        return error_codes::PERMISSION_DENIED.to_string();
    }
    "KILL_FAILED".to_string()
}

/// Collect all descendant PIDs of `pid` in BFS order (shallowest first) from
/// the request's prebuilt child index.
fn collect_descendants(pid: u32, children_by_parent: &HashMap<u32, Vec<u32>>) -> Vec<u32> {
    let mut descendants = Vec::new();
    let mut queue = std::collections::VecDeque::from([pid]);
    let mut visited = std::collections::HashSet::new();
    visited.insert(pid);

    while let Some(current) = queue.pop_front() {
        if let Some(children) = children_by_parent.get(&current) {
            for &child in children {
                if visited.insert(child) {
                    descendants.push(child);
                    queue.push_back(child);
                }
            }
        }
    }

    descendants
}

fn is_descendant_of(pid: u32, parent_pid: u32, all_processes: &ProcessSnapshot) -> bool {
    let mut current = pid;
    let mut visited = std::collections::HashSet::new();
    loop {
        if !visited.insert(current) {
            // A malformed or raced process snapshot must never hang a kill request.
            return false;
        }
        if let Some(&(ppid, _, _)) = all_processes.get(&current) {
            if ppid == parent_pid {
                return true;
            }
            if ppid == 0 || ppid == 1 || ppid == current {
                return false;
            }
            current = ppid;
        } else {
            return false;
        }
    }
}

fn find_pids_by_ports(ports: &[u16]) -> Result<HashMap<u16, Vec<u32>>, String> {
    if cfg!(target_os = "windows") {
        find_pids_by_ports_windows(ports)
    } else {
        find_pids_by_ports_unix(ports)
    }
}

fn find_pids_by_ports_unix(ports: &[u16]) -> Result<HashMap<u16, Vec<u32>>, String> {
    let query_ports = unique_ports(ports);
    if query_ports.is_empty() {
        return Ok(HashMap::new());
    }
    let requested: std::collections::HashSet<u16> = query_ports.iter().copied().collect();
    let port_list = query_ports
        .iter()
        .map(u16::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let output = run_output_with_timeout(
        Command::new("lsof")
            .args(["-nP", "-FpcfnPT0", "-Ts", &format!("-i:{}", port_list)])
            .env("LC_ALL", "C")
            .env("LANG", "C"),
        PORT_QUERY_COMMAND_TIMEOUT,
        None,
    )
    .map_err(|error| match error.kind {
        SubprocessErrorKind::Spawn => "Failed to run lsof".to_string(),
        SubprocessErrorKind::Timeout => "lsof timed out while querying ports".to_string(),
        _ => "lsof could not be completed".to_string(),
    })?;
    if output_may_be_truncated(&output) {
        return Err("lsof output exceeded the 1 MiB capture limit".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    parse_lsof_socket_pids(&stdout, &stderr, output.status.success(), &requested)
}

#[derive(Default)]
struct LsofSocketRecord {
    pid: Option<u32>,
    protocol: Option<String>,
    name: Option<String>,
    state: Option<String>,
}

fn parse_lsof_socket_pids(
    stdout: &str,
    stderr: &str,
    success: bool,
    requested_ports: &std::collections::HashSet<u16>,
) -> Result<HashMap<u16, Vec<u32>>, String> {
    if !success && !stderr.trim().is_empty() {
        return Err(format!("lsof failed: {}", stderr.trim()));
    }

    let mut pids_by_port = HashMap::<u16, Vec<u32>>::new();
    let mut current_pid = None;
    let mut current_socket: Option<LsofSocketRecord> = None;

    for raw_field in stdout.split('\0') {
        let field = raw_field.trim_start_matches('\n');
        let Some((kind, value)) = field.split_at_checked(1) else {
            continue;
        };
        let value = value.trim_end_matches('\n');

        match kind {
            "p" => {
                record_lsof_socket(&mut pids_by_port, current_socket.take(), requested_ports)?;
                let pid = value
                    .parse::<u32>()
                    .map_err(|_| format!("lsof returned an invalid PID: {value}"))?;
                current_pid = (pid != 0).then_some(pid);
            }
            "f" => {
                record_lsof_socket(&mut pids_by_port, current_socket.take(), requested_ports)?;
                current_socket = Some(LsofSocketRecord {
                    pid: current_pid,
                    ..LsofSocketRecord::default()
                });
            }
            "P" => {
                if let Some(socket) = current_socket.as_mut() {
                    socket.protocol = Some(value.to_ascii_uppercase());
                }
            }
            "n" => {
                if let Some(socket) = current_socket.as_mut() {
                    socket.name = Some(value.to_string());
                }
            }
            "T" => {
                if let Some(socket) = current_socket.as_mut() {
                    socket.state = value.strip_prefix("ST=").map(str::to_ascii_uppercase);
                }
            }
            _ => {}
        }
    }

    record_lsof_socket(&mut pids_by_port, current_socket, requested_ports)?;
    Ok(pids_by_port)
}

fn record_lsof_socket(
    pids_by_port: &mut HashMap<u16, Vec<u32>>,
    socket: Option<LsofSocketRecord>,
    requested_ports: &std::collections::HashSet<u16>,
) -> Result<(), String> {
    let Some(socket) = socket else {
        return Ok(());
    };
    let Some(protocol) = socket.protocol.as_deref() else {
        return Err("lsof returned a socket without a protocol".to_string());
    };
    let Some(name) = socket.name.as_deref() else {
        return Err("lsof returned a socket without a local address".to_string());
    };

    // `lsof -i :port` matches either end of a connection. Only inspect the
    // local endpoint before `->`; otherwise a client connected to remote :443
    // is falsely presented as the owner of local port 443.
    let local_endpoint = name.split("->").next().unwrap_or_default();
    let local_port = parse_lsof_endpoint_port(local_endpoint).ok_or_else(|| {
        format!("lsof returned an invalid local socket address: {local_endpoint}")
    })?;
    if !requested_ports.contains(&local_port) {
        return Ok(());
    }

    let is_tcp_listener = if protocol == "TCP" {
        match socket.state.as_deref() {
            Some("LISTEN" | "LISTENING") => true,
            Some(_) => false,
            None => return Err("lsof returned a TCP socket without state".to_string()),
        }
    } else {
        false
    };
    let is_bound_udp = protocol == "UDP";
    if !is_tcp_listener && !is_bound_udp {
        return Ok(());
    }

    let pid = socket
        .pid
        .ok_or_else(|| "lsof returned a socket without a PID".to_string())?;
    let pids = pids_by_port.entry(local_port).or_default();
    if !pids.contains(&pid) {
        pids.push(pid);
    }
    Ok(())
}

fn parse_lsof_endpoint_port(endpoint: &str) -> Option<u16> {
    let port_suffix = endpoint.rsplit(':').next()?;
    let numeric_port = port_suffix
        .chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>();
    (!numeric_port.is_empty())
        .then(|| numeric_port.parse::<u16>().ok())
        .flatten()
}

fn find_pids_by_ports_windows(ports: &[u16]) -> Result<HashMap<u16, Vec<u32>>, String> {
    let output = run_output_with_timeout(
        Command::new("netstat")
            .args(["-ano"])
            .env("LC_ALL", "C")
            .env("LANG", "C"),
        PORT_QUERY_COMMAND_TIMEOUT,
        None,
    )
    .map_err(|error| match error.kind {
        SubprocessErrorKind::Spawn => "Failed to run netstat".to_string(),
        SubprocessErrorKind::Timeout => "netstat timed out while querying ports".to_string(),
        _ => "netstat could not be completed".to_string(),
    })?;
    if output_may_be_truncated(&output) {
        return Err("netstat output exceeded the 1 MiB capture limit".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    parse_netstat_pids(&stdout, &stderr, output.status.success(), ports)
}

fn parse_netstat_pids(
    stdout: &str,
    stderr: &str,
    success: bool,
    ports: &[u16],
) -> Result<HashMap<u16, Vec<u32>>, String> {
    if !success {
        let stderr = stderr.trim();
        return Err(if stderr.is_empty() {
            "netstat command failed".to_string()
        } else {
            format!("netstat failed: {stderr}")
        });
    }

    let requested_ports: std::collections::HashSet<u16> = ports.iter().copied().collect();
    let mut pids_by_port = HashMap::<u16, Vec<u32>>::new();

    // Locale-independent parser. Headers like "协议 / 本地地址 / 状态" on Chinese
    // Windows used to break a header-based parser, and the TCP state column
    // itself can be localized ("正在监听"). We instead require:
    //   - first column is the ASCII keyword TCP/UDP (Windows keeps these
    //     untranslated even in localized builds we've observed)
    //   - local address local port equals the target port
    //   - for TCP, the foreign address is the IPv4/IPv6 sentinel for a
    //     listening socket (0.0.0.0:0 / [::]:0 / *:*) — this is what
    //     identifies LISTENING regardless of the printed state string
    // UDP rows have no state column so we always take them.
    for line in stdout.lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 4 {
            continue;
        }
        let proto = cols[0];
        let is_tcp = proto.eq_ignore_ascii_case("TCP");
        let is_udp = proto.eq_ignore_ascii_case("UDP");
        if !is_tcp && !is_udp {
            continue;
        }

        let local = cols[1];
        let local_port = local.rsplit(':').next().and_then(|s| s.parse::<u16>().ok());
        let Some(local_port) = local_port.filter(|port| requested_ports.contains(port)) else {
            continue;
        };

        let pid_str = if is_tcp {
            // TCP rows: Proto Local Foreign State PID
            let foreign = cols[2];
            if !is_listening_foreign(foreign) {
                continue;
            }
            if cols.len() < 5 {
                return Err("netstat returned an incomplete TCP listener row".to_string());
            }
            cols[4]
        } else {
            // UDP rows: Proto Local Foreign PID (no state column)
            cols[3]
        };

        let pid = pid_str
            .parse::<u32>()
            .map_err(|_| format!("netstat returned an invalid PID: {pid_str}"))?;
        if pid != 0 {
            let pids = pids_by_port.entry(local_port).or_default();
            if !pids.contains(&pid) {
                pids.push(pid);
            }
        }
    }

    Ok(pids_by_port)
}

fn unique_ports(ports: &[u16]) -> Vec<u16> {
    let mut unique = Vec::with_capacity(ports.len());
    for &port in ports {
        if !unique.contains(&port) {
            unique.push(port);
        }
    }
    unique
}

/// A TCP socket in LISTEN state has no peer; netstat prints the foreign
/// address as a zeroed/wildcard sentinel. Matching on these patterns is
/// locale-independent — Windows does not translate them.
fn is_listening_foreign(foreign: &str) -> bool {
    foreign == "0.0.0.0:0" || foreign == "[::]:0" || foreign == "*:*" || foreign.ends_with(":*")
}

fn get_all_processes() -> (ProcessSnapshot, ProcessMetadataSnapshot) {
    let sys = System::new_all();
    let mut metadata = HashMap::with_capacity(sys.processes().len());
    let processes = sys
        .processes()
        .iter()
        .map(|(pid, p)| {
            let pid = pid.as_u32();
            let ppid = p.parent().map(|p| p.as_u32()).unwrap_or(0);
            let name = p.name().to_string_lossy().to_string();
            let cmd = p
                .cmd()
                .iter()
                .filter_map(|s| s.to_str())
                .collect::<Vec<_>>()
                .join(" ");
            metadata.insert(
                pid,
                ProcessMetadata {
                    start_time: p.start_time(),
                    name: name.clone(),
                    executable: p.exe().map(PathBuf::from),
                },
            );
            (pid, (ppid, name, cmd))
        })
        .collect();
    (processes, metadata)
}

fn identity_for_process(pid: u32, metadata: &ProcessMetadata) -> Option<String> {
    let executable = metadata.executable.as_deref()?;
    let creation_time = process_creation_time(pid)?;
    identity_for_creation(pid, metadata, executable, creation_time)
}

fn identity_for_creation(
    pid: u32,
    metadata: &ProcessMetadata,
    executable: &std::path::Path,
    (clock, creation_time, unix_start_time): (u8, u128, Option<u64>),
) -> Option<String> {
    if unix_start_time.is_some_and(|start_time| start_time != metadata.start_time) {
        return None;
    }
    process_identity_at(pid, &metadata.name, executable, clock, creation_time)
}

/// Hash a high-resolution, OS-reported process creation value into an opaque
/// token. `clock` identifies the native time source so values from different
/// platforms cannot accidentally compare equal.
fn process_identity_at(
    pid: u32,
    name: &str,
    executable: &std::path::Path,
    clock: u8,
    creation_time: u128,
) -> Option<String> {
    if creation_time == 0 {
        return None;
    }
    let executable = executable.to_string_lossy();
    if executable.is_empty() {
        return None;
    }

    let mut hasher = Sha256::new();
    hasher.update(b"bench-port-manager-process-identity-v2\0");
    hasher.update(pid.to_be_bytes());
    hasher.update([clock]);
    hasher.update(creation_time.to_be_bytes());
    hasher.update((name.len() as u64).to_be_bytes());
    hasher.update(name.as_bytes());
    hasher.update((executable.len() as u64).to_be_bytes());
    hasher.update(executable.as_bytes());
    let digest = hasher.finalize();
    let hex = b"0123456789abcdef";
    let mut identity = String::with_capacity(digest.len() * 2);
    for byte in digest {
        identity.push(hex[(byte >> 4) as usize] as char);
        identity.push(hex[(byte & 0x0f) as usize] as char);
    }
    Some(identity)
}

/// Return (clock source, precise creation timestamp, Unix start time if the OS
/// API can cross-check sysinfo's process snapshot). Failure deliberately makes
/// the process ineligible for Kill instead of falling back to second-resolution
/// metadata.
#[cfg(target_os = "macos")]
fn process_creation_time(pid: u32) -> Option<(u8, u128, Option<u64>)> {
    let pid = libc::pid_t::try_from(pid).ok()?;
    let mut info = unsafe { std::mem::zeroed::<libc::proc_bsdinfo>() };
    let read = unsafe {
        libc::proc_pidinfo(
            pid,
            libc::PROC_PIDTBSDINFO,
            0,
            &mut info as *mut _ as *mut _,
            std::mem::size_of::<libc::proc_bsdinfo>() as libc::c_int,
        )
    };
    if read != std::mem::size_of::<libc::proc_bsdinfo>() as libc::c_int
        || info.pbi_start_tvsec == 0
        || info.pbi_start_tvusec >= 1_000_000
    {
        return None;
    }
    let precise = u128::from(info.pbi_start_tvsec) * 1_000_000 + u128::from(info.pbi_start_tvusec);
    Some((1, precise, Some(info.pbi_start_tvsec)))
}

#[cfg(target_os = "windows")]
fn process_creation_time(pid: u32) -> Option<(u8, u128, Option<u64>)> {
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME};
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let mut creation = unsafe { std::mem::zeroed::<FILETIME>() };
    let mut exit = unsafe { std::mem::zeroed::<FILETIME>() };
    let mut kernel = unsafe { std::mem::zeroed::<FILETIME>() };
    let mut user = unsafe { std::mem::zeroed::<FILETIME>() };
    let succeeded =
        unsafe { GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user) };
    unsafe { CloseHandle(handle) };
    if succeeded == 0 {
        return None;
    }

    let precise = (u64::from(creation.dwHighDateTime) << 32) | u64::from(creation.dwLowDateTime);
    const WINDOWS_TO_UNIX_EPOCH_SECONDS: u64 = 11_644_473_600;
    let unix_start = precise
        .checked_div(10_000_000)?
        .checked_sub(WINDOWS_TO_UNIX_EPOCH_SECONDS)?;
    Some((2, u128::from(precise), Some(unix_start)))
}

#[cfg(target_os = "linux")]
fn process_creation_time(pid: u32) -> Option<(u8, u128, Option<u64>)> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // `comm` is parenthesized and may itself contain spaces or `)`, so split
    // after the final close paren; field 22 (starttime) is index 19 thereafter.
    let close = stat.rfind(')')?;
    let start_ticks = stat
        .get(close + 1..)?
        .split_whitespace()
        .nth(19)?
        .parse::<u64>()
        .ok()?;
    if start_ticks == 0 {
        return None;
    }
    let boot_time = std::fs::read_to_string("/proc/stat")?
        .lines()
        .find_map(|line| line.strip_prefix("btime ")?.parse::<u64>().ok())?;
    let ticks_per_second = unsafe { libc::sysconf(libc::_SC_CLK_TCK) };
    if ticks_per_second <= 0 {
        return None;
    }
    let unix_start = boot_time.checked_add(start_ticks / ticks_per_second as u64)?;
    Some((3, u128::from(start_ticks), Some(unix_start)))
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn process_creation_time(_pid: u32) -> Option<(u8, u128, Option<u64>)> {
    None
}

fn attach_process_identities(
    node: &mut ProcessNode,
    metadata: &ProcessMetadataSnapshot,
    cache: &mut ProcessIdentityCache,
) {
    let identity = cache.entry(node.pid).or_insert_with(|| {
        metadata
            .get(&node.pid)
            .and_then(|entry| identity_for_process(node.pid, entry))
    });
    node.identity = identity.clone();
    for child in &mut node.children {
        attach_process_identities(child, metadata, cache);
    }
}

#[cfg(test)]
fn build_subtree(pid: u32, all: &ProcessSnapshot) -> ProcessNode {
    let children_by_parent = build_children_index(all);
    build_subtree_with_index(pid, all, &children_by_parent)
}

/// Index processes by parent PID so subsequent subtree queries are O(N) in the
/// number of visited nodes rather than O(N²) (each level previously full-scanned
/// `all`). On developer machines with 500+ running processes the old form
/// spent >100 ms here (#058).
fn build_children_index(all: &ProcessSnapshot) -> HashMap<u32, Vec<u32>> {
    let mut by_parent: HashMap<u32, Vec<u32>> = HashMap::new();
    for (&pid, info) in all.iter() {
        let ppid = info.0;
        if ppid != pid {
            by_parent.entry(ppid).or_default().push(pid);
        }
    }
    for kids in by_parent.values_mut() {
        kids.sort_unstable();
    }
    by_parent
}

#[cfg(test)]
fn build_subtree_with_index(
    pid: u32,
    all: &ProcessSnapshot,
    children_by_parent: &HashMap<u32, Vec<u32>>,
) -> ProcessNode {
    let mut visited = std::collections::HashSet::new();
    build_subtree_with_visited(pid, all, children_by_parent, &mut visited)
}

#[cfg(test)]
fn build_subtree_with_visited(
    pid: u32,
    all: &ProcessSnapshot,
    children_by_parent: &HashMap<u32, Vec<u32>>,
    visited: &mut std::collections::HashSet<u32>,
) -> ProcessNode {
    let (ppid, name, command) =
        all.get(&pid)
            .cloned()
            .unwrap_or((0, "Unknown".to_string(), "Unknown".to_string()));
    visited.insert(pid);

    let mut children = Vec::new();
    if let Some(kids) = children_by_parent.get(&pid) {
        for &child in kids {
            if !visited.contains(&child) {
                children.push(build_subtree_with_visited(
                    child,
                    all,
                    children_by_parent,
                    visited,
                ));
            }
        }
    }

    ProcessNode {
        pid,
        ppid,
        name,
        command,
        identity: None,
        has_children: children_by_parent
            .get(&pid)
            .is_some_and(|children| !children.is_empty()),
        children,
    }
}

fn get_parent_chain(pid: u32, all: &ProcessSnapshot, max_depth: usize) -> Vec<u32> {
    let mut chain = Vec::new();
    let mut current = pid;
    for _ in 0..max_depth {
        if let Some(&(ppid, _, _)) = all.get(&current) {
            if ppid == 0 || ppid == current || ppid == 1 || chain.contains(&ppid) {
                break;
            }
            chain.push(ppid);
            current = ppid;
        } else {
            break;
        }
    }
    chain
}

#[cfg(test)]
fn build_focused_tree(
    pid: u32,
    all: &ProcessSnapshot,
    children_by_parent: &HashMap<u32, Vec<u32>>,
) -> ProcessNode {
    build_focused_trees(&[pid], all, children_by_parent)
        .into_iter()
        .next()
        .unwrap_or_else(|| build_shallow_node(pid, all, children_by_parent))
}

fn build_focused_trees(
    owner_pids: &[u32],
    all: &ProcessSnapshot,
    children_by_parent: &HashMap<u32, Vec<u32>>,
) -> Vec<ProcessNode> {
    let mut roots = HashSet::new();
    let mut focused_children = HashMap::<u32, HashSet<u32>>::new();
    let mut missing_owners = Vec::new();

    for &owner_pid in owner_pids {
        if !all.contains_key(&owner_pid) {
            missing_owners.push(owner_pid);
            continue;
        }

        let mut path = Vec::new();
        for ancestor in get_parent_chain(owner_pid, all, 64).into_iter().rev() {
            if ancestor == owner_pid || path.contains(&ancestor) {
                break;
            }
            path.push(ancestor);
        }
        path.push(owner_pid);

        if let Some(&root_pid) = path.first() {
            roots.insert(root_pid);
            for pair in path.windows(2) {
                focused_children.entry(pair[0]).or_default().insert(pair[1]);
            }
        }
    }

    let mut ordered_roots = roots.into_iter().collect::<Vec<_>>();
    ordered_roots.sort_unstable();
    let mut trees = ordered_roots
        .into_iter()
        .map(|root_pid| {
            build_focused_node(
                root_pid,
                all,
                children_by_parent,
                &focused_children,
                &mut HashSet::new(),
            )
        })
        .collect::<Vec<_>>();

    missing_owners.sort_unstable();
    missing_owners.dedup();
    trees.extend(missing_owners.into_iter().map(|pid| ProcessNode {
        pid,
        ppid: 0,
        name: "Unknown".to_string(),
        command: "Unknown".to_string(),
        identity: None,
        has_children: false,
        children: Vec::new(),
    }));
    trees
}

fn build_focused_node(
    pid: u32,
    all: &ProcessSnapshot,
    children_by_parent: &HashMap<u32, Vec<u32>>,
    focused_children: &HashMap<u32, HashSet<u32>>,
    visited: &mut HashSet<u32>,
) -> ProcessNode {
    visited.insert(pid);
    let mut node = build_shallow_node(pid, all, children_by_parent);
    if let Some(children) = focused_children.get(&pid) {
        let mut ordered_children = children.iter().copied().collect::<Vec<_>>();
        ordered_children.sort_unstable();
        for child in ordered_children {
            if visited.contains(&child) {
                continue;
            }
            node.children.push(build_focused_node(
                child,
                all,
                children_by_parent,
                focused_children,
                visited,
            ));
        }
    }
    node
}

fn build_shallow_node(
    pid: u32,
    all: &ProcessSnapshot,
    children_by_parent: &HashMap<u32, Vec<u32>>,
) -> ProcessNode {
    let (ppid, name, command) =
        all.get(&pid)
            .cloned()
            .unwrap_or((0, "Unknown".to_string(), "Unknown".to_string()));
    ProcessNode {
        pid,
        ppid,
        name,
        command,
        identity: None,
        has_children: children_by_parent
            .get(&pid)
            .is_some_and(|children| !children.is_empty()),
        children: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn kill_target(pid: u32, expected_name: Option<&str>) -> KillTarget {
        KillTarget {
            pid,
            expected_name: expected_name.map(str::to_string),
            expected_identity: expected_name.map(|_| "a".repeat(64)),
        }
    }

    #[test]
    fn kill_target_deduplication_preserves_order_and_ignores_case() {
        let targets = deduplicate_kill_targets(vec![
            kill_target(42, Some("Node")),
            kill_target(42, Some("node")),
            kill_target(43, Some("vite")),
        ])
        .unwrap();

        assert_eq!(targets.len(), 2);
        assert_eq!(targets[0].pid, 42);
        assert_eq!(targets[1].pid, 43);
    }

    #[test]
    fn kill_target_deduplication_rejects_conflicting_identities() {
        let error = deduplicate_kill_targets(vec![
            kill_target(42, Some("node")),
            kill_target(42, Some("ssh")),
        ])
        .unwrap_err();

        assert_eq!(error.code, "INVALID_INPUT");
    }

    #[test]
    fn kill_target_deduplication_rejects_same_name_with_different_identity_tokens() {
        let original = kill_target(42, Some("node"));
        let mut reused = kill_target(42, Some("node"));
        reused.expected_identity = Some("b".repeat(64));

        assert_eq!(
            deduplicate_kill_targets(vec![original, reused])
                .unwrap_err()
                .code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn kill_target_deduplication_enforces_limit_after_removing_duplicates() {
        let mut targets = (1..=super::super::types::MAX_KILL_TARGETS as u32)
            .map(|pid| kill_target(pid, Some("node")))
            .collect::<Vec<_>>();
        targets.push(kill_target(1, Some("NODE")));
        assert_eq!(
            deduplicate_kill_targets(targets).unwrap().len(),
            super::super::types::MAX_KILL_TARGETS
        );

        let too_many = (1..=super::super::types::MAX_KILL_TARGETS as u32 + 1)
            .map(|pid| kill_target(pid, Some("node")))
            .collect();
        assert_eq!(
            deduplicate_kill_targets(too_many).unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn kill_one_rejects_zero_pid_before_running_a_system_command() {
        let result = kill_one(
            kill_target(0, None),
            &HashMap::new(),
            &HashMap::new(),
            None,
            &HashMap::new(),
        );
        assert!(!result.success);
        assert_eq!(result.error_code.as_deref(), Some(error_codes::INVALID_PID));
    }

    #[test]
    fn kill_one_requires_scan_time_identity() {
        let mut processes = HashMap::new();
        processes.insert(42, (1, "node".to_string(), "node server.js".to_string()));

        let result = kill_one(
            kill_target(42, None),
            &processes,
            &HashMap::new(),
            None,
            &HashMap::new(),
        );
        assert!(!result.success);
        assert_eq!(
            result.error_code.as_deref(),
            Some(error_codes::IDENTITY_UNAVAILABLE)
        );
    }

    #[test]
    fn kill_one_rejects_missing_scan_identity_token() {
        let mut processes = HashMap::new();
        processes.insert(42, (1, "node".to_string(), "node server.js".to_string()));
        let mut target = kill_target(42, Some("node"));
        target.expected_identity = None;

        let result = kill_one(target, &processes, &HashMap::new(), None, &HashMap::new());

        assert!(!result.success);
        assert_eq!(
            result.error_code.as_deref(),
            Some(error_codes::IDENTITY_UNAVAILABLE)
        );
    }

    #[test]
    fn kill_one_requires_current_identity_even_when_name_matches() {
        let mut processes = HashMap::new();
        processes.insert(42, (1, "node".to_string(), "node server.js".to_string()));

        let result = kill_one(
            kill_target(42, Some("node")),
            &processes,
            &HashMap::new(),
            None,
            &HashMap::new(),
        );

        assert!(!result.success);
        assert_eq!(
            result.error_code.as_deref(),
            Some(error_codes::IDENTITY_UNAVAILABLE)
        );
    }

    #[test]
    fn kill_one_rejects_same_name_pid_reuse_when_identity_changes() {
        let mut processes = HashMap::new();
        processes.insert(42, (1, "node".to_string(), "node server.js".to_string()));
        let current_identity = "b".repeat(64);

        let result = kill_one(
            kill_target(42, Some("node")),
            &processes,
            &HashMap::new(),
            Some(&current_identity),
            &HashMap::new(),
        );

        assert!(!result.success);
        assert_eq!(result.error_code.as_deref(), Some(error_codes::PID_REUSED));
    }

    #[test]
    fn process_identity_validation_fails_closed_and_compares_exact_tokens() {
        assert_eq!(
            validate_process_identity("scan", None),
            Err(error_codes::IDENTITY_UNAVAILABLE)
        );
        assert_eq!(
            validate_process_identity("scan", Some("reused")),
            Err(error_codes::PID_REUSED)
        );
        assert_eq!(validate_process_identity("scan", Some("scan")), Ok(()));
    }

    #[test]
    fn process_identity_binds_pid_creation_time_and_executable() {
        let executable = std::path::Path::new("/usr/bin/node");
        let first = process_identity_at(42, "node", executable, 1, 1_800_000_000_123_456).unwrap();

        assert_eq!(
            process_identity_at(42, "node", executable, 1, 1_800_000_000_123_456).as_deref(),
            Some(first.as_str())
        );
        assert_ne!(
            process_identity_at(42, "node", executable, 1, 1_800_000_000_123_457).as_deref(),
            Some(first.as_str())
        );
        assert_ne!(
            process_identity_at(
                42,
                "node",
                std::path::Path::new("/usr/bin/other"),
                1,
                1_800_000_000_123_456,
            )
            .as_deref(),
            Some(first.as_str())
        );
        assert_ne!(
            process_identity_at(43, "node", executable, 1, 1_800_000_000_123_456).as_deref(),
            Some(first.as_str())
        );
        assert_ne!(
            process_identity_at(42, "node", executable, 2, 1_800_000_000_123_456).as_deref(),
            Some(first.as_str())
        );
        assert!(process_identity_at(42, "node", executable, 1, 0).is_none());
    }

    #[test]
    fn process_identity_requires_native_creation_time_to_match_snapshot() {
        let metadata = ProcessMetadata {
            start_time: 1_800_000_000,
            name: "node".to_string(),
            executable: Some(PathBuf::from("/usr/bin/node")),
        };
        let executable = metadata.executable.as_deref().unwrap();

        assert!(identity_for_creation(
            42,
            &metadata,
            executable,
            (1, 1_800_000_000_123_456, Some(1_800_000_000)),
        )
        .is_some());
        assert!(identity_for_creation(
            42,
            &metadata,
            executable,
            (1, 1_800_000_001_123_456, Some(1_800_000_001)),
        )
        .is_none());
    }

    #[test]
    fn test_is_descendant_of_direct_child() {
        let mut processes = HashMap::new();
        processes.insert(100, (50, "parent".to_string(), "/bin/parent".to_string()));
        processes.insert(50, (1, "grandparent".to_string(), "/sbin/init".to_string()));

        assert!(is_descendant_of(100, 50, &processes));
    }

    #[test]
    fn test_is_descendant_of_grandchild() {
        let mut processes = HashMap::new();
        processes.insert(200, (100, "child".to_string(), "/bin/child".to_string()));
        processes.insert(100, (50, "parent".to_string(), "/bin/parent".to_string()));
        processes.insert(50, (1, "init".to_string(), "/sbin/init".to_string()));

        assert!(is_descendant_of(200, 50, &processes));
    }

    #[test]
    fn test_is_descendant_of_not_related() {
        let mut processes = HashMap::new();
        processes.insert(100, (50, "a".to_string(), "/bin/a".to_string()));
        processes.insert(200, (150, "b".to_string(), "/bin/b".to_string()));

        assert!(!is_descendant_of(100, 200, &processes));
    }

    #[test]
    fn test_is_descendant_of_self() {
        let mut processes = HashMap::new();
        processes.insert(100, (50, "self".to_string(), "/bin/self".to_string()));

        assert!(!is_descendant_of(100, 100, &processes));
    }

    #[test]
    fn test_is_descendant_of_missing_pid() {
        let processes: HashMap<u32, (u32, String, String)> = HashMap::new();
        assert!(!is_descendant_of(999, 1, &processes));
    }

    #[test]
    fn test_is_descendant_of_root_process() {
        let mut processes = HashMap::new();
        processes.insert(100, (0, "orphan".to_string(), "/bin/orphan".to_string()));

        assert!(!is_descendant_of(100, 1, &processes));
    }

    #[test]
    fn test_is_descendant_of_cycle_terminates_and_returns_false() {
        let mut processes = HashMap::new();
        processes.insert(100, (200, "a".to_string(), "/bin/a".to_string()));
        processes.insert(200, (100, "b".to_string(), "/bin/b".to_string()));

        assert!(!is_descendant_of(100, 999, &processes));
    }

    #[test]
    fn test_collect_descendants_uses_index_and_terminates_on_cycles() {
        let mut processes = HashMap::new();
        processes.insert(10, (1, "root".to_string(), "root".to_string()));
        processes.insert(11, (10, "left".to_string(), "left".to_string()));
        processes.insert(12, (10, "right".to_string(), "right".to_string()));
        processes.insert(13, (11, "leaf-left".to_string(), "leaf-left".to_string()));
        processes.insert(14, (12, "leaf-right".to_string(), "leaf-right".to_string()));
        // Simulate a malformed/raced snapshot cycle.
        processes.insert(10, (13, "root".to_string(), "root".to_string()));

        let children_by_parent = build_children_index(&processes);

        assert_eq!(
            collect_descendants(10, &children_by_parent),
            vec![11, 12, 13, 14]
        );
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn unix_descendant_kill_reports_failures_and_ignores_processes_that_exited() {
        let mut signaled = Vec::new();
        let expected = HashMap::from([
            (11, Some("identity-11".to_string())),
            (12, Some("identity-12".to_string())),
            (13, Some("identity-13".to_string())),
        ]);
        let failures = kill_unix_descendants(
            &[11, 12, 13],
            &expected,
            |pid| Some(format!("identity-{pid}")),
            |pid| {
                signaled.push(pid);
                match pid {
                    13 => Err(std::io::Error::from_raw_os_error(libc::ESRCH)),
                    12 => Err(std::io::Error::from_raw_os_error(libc::EPERM)),
                    _ => Ok(()),
                }
            },
        );

        assert_eq!(signaled, vec![13, 12, 11]);
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].0, 12);

        let result = finish_unix_target_kill(10, Ok(()), &failures).unwrap_err();
        assert_eq!(result.1, error_codes::CHILD_KILL_FAILED);
        assert!(result.0.contains("PID 10 was terminated"));
        assert!(result.0.contains("PID 12"));
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn unix_descendant_kill_refuses_reused_or_unidentified_processes() {
        let expected = HashMap::from([
            (11, Some("identity-before".to_string())),
            (12, Some("identity-12".to_string())),
            (13, None),
            (14, Some("identity-14".to_string())),
        ]);
        let mut signaled = Vec::new();
        let failures = kill_unix_descendants(
            &[11, 12, 13, 14],
            &expected,
            |pid| match pid {
                11 => Some("identity-after-reuse".to_string()),
                12 => None,
                13 => Some("identity-13".to_string()),
                _ => Some("identity-14".to_string()),
            },
            |pid| {
                signaled.push(pid);
                Ok(())
            },
        );

        assert_eq!(signaled, vec![14]);
        assert_eq!(failures.len(), 3);
        assert!(failures
            .iter()
            .any(|(pid, message)| { *pid == 11 && message.contains("identity changed") }));
        assert!(failures
            .iter()
            .any(|(pid, message)| { *pid == 12 && message.contains("unavailable") }));
        assert!(failures
            .iter()
            .any(|(pid, message)| { *pid == 13 && message.contains("unavailable at scan time") }));
    }

    #[test]
    fn test_build_subtree_breaks_parent_cycle() {
        let mut processes = HashMap::new();
        processes.insert(100, (200, "a".to_string(), "/bin/a".to_string()));
        processes.insert(200, (100, "b".to_string(), "/bin/b".to_string()));
        let children_by_parent = build_children_index(&processes);

        let tree = build_subtree_with_index(100, &processes, &children_by_parent);
        assert_eq!(tree.pid, 100);
        assert_eq!(tree.children.len(), 1);
        assert_eq!(tree.children[0].pid, 200);
        assert!(tree.children[0].children.is_empty());
    }

    #[test]
    fn test_lsof_permission_error_is_not_treated_as_free_port() {
        let result = parse_lsof_socket_pids(
            "",
            "lsof: permission denied",
            false,
            &std::collections::HashSet::from([8080]),
        );
        assert!(result.unwrap_err().contains("permission denied"));
    }

    #[test]
    fn test_lsof_uses_local_listener_or_udp_port_only() {
        let output = concat!(
            "p42\0cnode\0f3u\0PTCP\0n*:8080\0TST=LISTEN\0\n",
            "f4u\0PTCP\0n[::]:8080\0TST=LISTEN\0\n",
            "p99\0ccurl\0f5u\0PTCP\0n192.0.2.5:51000->198.51.100.8:8080\0TST=ESTABLISHED\0\n",
            "p77\0cnode\0f6u\0PTCP\0n127.0.0.1:8080->198.51.100.8:443\0TST=ESTABLISHED\0\n",
            "p66\0ccurl\0f7u\0PUDP\0n*:5354->198.51.100.8:8080\0\n",
            "p55\0cnode\0f8u\0PUDP\0n*:5353\0\n",
        );
        let requested = std::collections::HashSet::from([8080, 5353]);

        assert_eq!(
            parse_lsof_socket_pids(output, "", true, &requested).unwrap(),
            HashMap::from([(8080, vec![42]), (5353, vec![55])])
        );
    }

    #[test]
    fn test_lsof_no_match_and_invalid_matching_pid() {
        let requested = std::collections::HashSet::from([8080]);
        assert!(parse_lsof_socket_pids("", "", false, &requested)
            .unwrap()
            .is_empty());
        let malformed = "pnope\0f3u\0PTCP\0n*:8080\0TST=LISTEN\n";
        assert_eq!(
            parse_lsof_socket_pids(malformed, "", true, &requested).unwrap_err(),
            "lsof returned an invalid PID: nope"
        );
    }

    #[test]
    fn test_lsof_parses_ipv6_and_numeric_port_with_state_suffix() {
        assert_eq!(
            parse_lsof_endpoint_port("[fe80::1%en0]:8443 (LISTEN)"),
            Some(8443)
        );
        assert_eq!(parse_lsof_endpoint_port("*:0"), Some(0));
        assert_eq!(parse_lsof_endpoint_port("*:https"), None);
    }

    #[test]
    fn test_netstat_failure_is_not_treated_as_free_port() {
        assert_eq!(
            parse_netstat_pids("", "", false, &[8080]).unwrap_err(),
            "netstat command failed"
        );
        assert_eq!(
            parse_netstat_pids("", "Access is denied", false, &[8080]).unwrap_err(),
            "netstat failed: Access is denied"
        );
    }

    #[test]
    fn test_netstat_parses_listening_tcp_and_udp_without_duplicate_pids() {
        let output = "Proto Local Address Foreign Address State PID\n\
            TCP 0.0.0.0:8080 0.0.0.0:0 LISTENING 42\n\
            TCP [::]:8080 [::]:0 LISTENING 42\n\
            TCP 127.0.0.1:8080 127.0.0.1:50000 ESTABLISHED 99\n\
            UDP 0.0.0.0:8080 *:* 50\n";

        assert_eq!(
            parse_netstat_pids(output, "", true, &[8080]).unwrap(),
            HashMap::from([(8080, vec![42, 50])])
        );
        assert!(parse_netstat_pids(output, "", true, &[9090])
            .unwrap()
            .is_empty());

        let both_ports = parse_netstat_pids(output, "", true, &[8080, 9090]).unwrap();
        assert_eq!(both_ports.get(&8080), Some(&vec![42, 50]));
        assert!(!both_ports.contains_key(&9090));
    }

    #[test]
    fn test_netstat_malformed_matching_pid_is_reported() {
        let output = "TCP 0.0.0.0:8080 0.0.0.0:0 LISTENING unknown\n";
        assert_eq!(
            parse_netstat_pids(output, "", true, &[8080]).unwrap_err(),
            "netstat returned an invalid PID: unknown"
        );
    }

    #[test]
    fn test_netstat_incomplete_matching_listener_is_reported() {
        let output = "TCP 0.0.0.0:8080 0.0.0.0:0 LISTENING\n";
        assert_eq!(
            parse_netstat_pids(output, "", true, &[8080]).unwrap_err(),
            "netstat returned an incomplete TCP listener row"
        );
    }

    #[test]
    fn test_build_subtree_single_node() {
        let mut processes = HashMap::new();
        processes.insert(42, (1, "myapp".to_string(), "/usr/bin/myapp".to_string()));

        let node = build_subtree(42, &processes);
        assert_eq!(node.pid, 42);
        assert_eq!(node.ppid, 1);
        assert_eq!(node.name, "myapp");
        assert_eq!(node.command, "/usr/bin/myapp");
        assert!(node.children.is_empty());
    }

    #[test]
    fn test_build_subtree_with_children() {
        let mut processes = HashMap::new();
        processes.insert(1, (0, "init".to_string(), "/sbin/init".to_string()));
        processes.insert(100, (1, "parent".to_string(), "/bin/parent".to_string()));
        processes.insert(101, (100, "child1".to_string(), "/bin/child1".to_string()));
        processes.insert(102, (100, "child2".to_string(), "/bin/child2".to_string()));

        let node = build_subtree(1, &processes);
        assert_eq!(node.pid, 1);
        assert_eq!(node.children.len(), 1);

        let parent = &node.children[0];
        assert_eq!(parent.pid, 100);
        assert_eq!(parent.children.len(), 2);
        assert_eq!(parent.children[0].pid, 101);
        assert_eq!(parent.children[1].pid, 102);
    }

    #[test]
    fn test_build_subtree_missing_pid() {
        let processes: HashMap<u32, (u32, String, String)> = HashMap::new();
        let node = build_subtree(999, &processes);
        assert_eq!(node.pid, 999);
        assert_eq!(node.name, "Unknown");
        assert!(node.children.is_empty());
    }

    #[test]
    fn test_get_parent_chain_normal() {
        let mut processes = HashMap::new();
        processes.insert(200, (100, "child".to_string(), "/bin/child".to_string()));
        processes.insert(100, (50, "parent".to_string(), "/bin/parent".to_string()));
        processes.insert(50, (1, "grandparent".to_string(), "/sbin/init".to_string()));

        let chain = get_parent_chain(200, &processes, 10);
        assert_eq!(chain, vec![100, 50]);
    }

    #[test]
    fn test_get_parent_chain_max_depth() {
        let mut processes = HashMap::new();
        processes.insert(5, (4, "p5".to_string(), "/bin/p5".to_string()));
        processes.insert(4, (3, "p4".to_string(), "/bin/p4".to_string()));
        processes.insert(3, (2, "p3".to_string(), "/bin/p3".to_string()));
        processes.insert(2, (1, "p2".to_string(), "/bin/p2".to_string()));
        processes.insert(1, (0, "p1".to_string(), "/bin/p1".to_string()));

        let chain = get_parent_chain(5, &processes, 2);
        assert_eq!(chain.len(), 2);
        assert_eq!(chain, vec![4, 3]);
    }

    #[test]
    fn test_get_parent_chain_missing() {
        let processes: HashMap<u32, (u32, String, String)> = HashMap::new();
        let chain = get_parent_chain(999, &processes, 10);
        assert!(chain.is_empty());
    }

    #[test]
    fn test_get_parent_chain_circular_prevention() {
        let mut processes = HashMap::new();
        processes.insert(100, (200, "a".to_string(), "/bin/a".to_string()));
        processes.insert(200, (100, "b".to_string(), "/bin/b".to_string()));

        let chain = get_parent_chain(100, &processes, 10);
        assert_eq!(chain.len(), 2);
        assert_eq!(chain[0], 200);
        assert_eq!(chain[1], 100);
    }

    #[test]
    fn test_build_focused_tree_finds_root() {
        let mut processes = HashMap::new();
        processes.insert(1, (0, "init".to_string(), "/sbin/init".to_string()));
        processes.insert(50, (1, "service".to_string(), "/bin/service".to_string()));
        processes.insert(100, (50, "worker".to_string(), "/bin/worker".to_string()));

        let index = build_children_index(&processes);
        let node = build_focused_tree(100, &processes, &index);
        assert_eq!(node.pid, 50);
        assert_eq!(node.children.len(), 1);
        assert_eq!(node.children[0].pid, 100);
        assert!(node.has_children);
        assert!(!node.children[0].has_children);
    }

    #[test]
    fn focused_trees_keep_owner_paths_and_omit_unexpanded_branches() {
        let mut processes = HashMap::new();
        processes.insert(1, (0, "init".to_string(), "/sbin/init".to_string()));
        processes.insert(50, (1, "service".to_string(), "/bin/service".to_string()));
        processes.insert(
            51,
            (1, "unrelated".to_string(), "/bin/unrelated".to_string()),
        );
        processes.insert(
            100,
            (50, "worker-a".to_string(), "/bin/worker-a".to_string()),
        );
        processes.insert(
            101,
            (50, "unexpanded".to_string(), "/bin/unexpanded".to_string()),
        );
        processes.insert(
            102,
            (50, "worker-b".to_string(), "/bin/worker-b".to_string()),
        );

        let index = build_children_index(&processes);
        let trees = build_focused_trees(&[100, 102], &processes, &index);

        assert_eq!(trees.len(), 1);
        assert_eq!(trees[0].pid, 50);
        assert_eq!(
            trees[0]
                .children
                .iter()
                .map(|node| node.pid)
                .collect::<Vec<_>>(),
            vec![100, 102]
        );
        assert!(trees[0].has_children);
        assert!(!trees[0].children[0].has_children);
    }

    #[test]
    fn process_children_pages_are_bounded_and_report_pid_cursor() {
        let mut processes = HashMap::new();
        processes.insert(10, (1, "parent".to_string(), "/bin/parent".to_string()));
        for pid in 1001..=1205 {
            processes.insert(
                pid,
                (10, format!("child-{pid}"), format!("/bin/child-{pid}")),
            );
        }
        processes.insert(
            1206,
            (
                1001,
                "grandchild".to_string(),
                "/bin/grandchild".to_string(),
            ),
        );
        let index = build_children_index(&processes);

        let first = build_process_children_page(10, None, &processes, &index);
        assert_eq!(first.children.len(), PROCESS_TREE_CHILD_PAGE_SIZE);
        assert_eq!(first.children[0].pid, 1001);
        assert!(first.children[0].has_children);
        assert_eq!(first.next_after_pid, Some(1100));

        let last = build_process_children_page(10, Some(1200), &processes, &index);
        assert_eq!(last.children.len(), 5);
        assert_eq!(last.next_after_pid, None);
    }

    #[test]
    fn process_children_pid_cursor_survives_removed_earlier_children() {
        let mut first_snapshot = HashMap::new();
        first_snapshot.insert(10, (1, "parent".to_string(), "/bin/parent".to_string()));
        for pid in 1001..=1205 {
            first_snapshot.insert(
                pid,
                (10, format!("child-{pid}"), format!("/bin/child-{pid}")),
            );
        }
        let first_index = build_children_index(&first_snapshot);
        let first = build_process_children_page(10, None, &first_snapshot, &first_index);
        assert_eq!(first.next_after_pid, Some(1100));

        let mut next_snapshot = first_snapshot;
        for pid in 1001..=1010 {
            next_snapshot.remove(&pid);
        }
        let next_index = build_children_index(&next_snapshot);
        let next =
            build_process_children_page(10, first.next_after_pid, &next_snapshot, &next_index);

        assert_eq!(next.children.first().map(|child| child.pid), Some(1101));
        assert_eq!(next.children.len(), PROCESS_TREE_CHILD_PAGE_SIZE);
        assert_eq!(next.next_after_pid, Some(1200));
    }

    #[test]
    fn test_build_focused_tree_already_root() {
        let mut processes = HashMap::new();
        processes.insert(1, (0, "init".to_string(), "/sbin/init".to_string()));

        let index = build_children_index(&processes);
        let node = build_focused_tree(1, &processes, &index);
        assert_eq!(node.pid, 1);
    }

    #[test]
    fn test_build_children_index_groups_siblings() {
        let mut processes = HashMap::new();
        processes.insert(1, (0, "init".to_string(), "/sbin/init".to_string()));
        processes.insert(10, (1, "a".to_string(), "/bin/a".to_string()));
        processes.insert(11, (1, "b".to_string(), "/bin/b".to_string()));
        processes.insert(12, (1, "c".to_string(), "/bin/c".to_string()));

        let idx = build_children_index(&processes);
        assert_eq!(idx.get(&1).map(Vec::len), Some(3));
        let kids = idx.get(&1).unwrap();
        assert!(kids.windows(2).all(|w| w[0] < w[1])); // sorted
    }

    #[test]
    fn test_build_children_index_skips_self_loop() {
        let mut processes = HashMap::new();
        // PID == PPID (root or unusual init layout) — must not appear as its own child.
        processes.insert(1, (1, "init".to_string(), "/sbin/init".to_string()));
        let idx = build_children_index(&processes);
        assert!(!idx.contains_key(&1));
    }
}
