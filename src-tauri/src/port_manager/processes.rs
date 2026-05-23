use super::fingerprints::fingerprint_port_process;
use super::types::{KillPidResult, KillTarget, PortProcessDetail, ProcessNode};
use std::collections::HashMap;
use std::process::Command;
use sysinfo::System;

type ProcessSnapshot = HashMap<u32, (u32, String, String)>;

/// Stable error codes the frontend can branch on for UX. Strings are intentional
/// — frontends compare them as-is.
pub mod error_codes {
    pub const PID_GONE: &str = "PID_GONE";
    pub const PID_REUSED: &str = "PID_REUSED";
    pub const PERMISSION_DENIED: &str = "PERMISSION_DENIED";
    pub const SELF_KILL: &str = "SELF_KILL";
    pub const CHILD_KILL: &str = "CHILD_KILL";
}

pub(super) fn query_port_processes(ports: Vec<u16>) -> Vec<PortProcessDetail> {
    let all_processes = get_all_processes();
    let children_by_parent = build_children_index(&all_processes);

    ports
        .into_iter()
        .map(|port| {
            let pids = match find_pids_by_port(port) {
                Ok(pids) => pids,
                Err(e) => {
                    return PortProcessDetail {
                        port,
                        pids: vec![],
                        process_trees: vec![],
                        fingerprint: None,
                        error: Some(format!("Failed to query: {}", e)),
                    };
                }
            };

            if pids.is_empty() {
                return PortProcessDetail {
                    port,
                    pids: vec![],
                    process_trees: vec![],
                    fingerprint: None,
                    error: Some("No process found on this port".to_string()),
                };
            }

            let process_trees: Vec<ProcessNode> = pids
                .iter()
                .map(|pid| build_focused_tree(*pid, &all_processes, &children_by_parent))
                .collect();

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

pub(super) fn kill_processes(targets: Vec<KillTarget>) -> Vec<KillPidResult> {
    let all_processes = get_all_processes();
    targets
        .into_iter()
        .map(|target| kill_one(target, &all_processes))
        .collect()
}

fn kill_one(target: KillTarget, all_processes: &ProcessSnapshot) -> KillPidResult {
    let pid = target.pid;

    // Pre-kill identity check: catch PID reuse before sending a signal that
    // could harm an unrelated process that grabbed the same PID slot. Linux's
    // 32k default cap makes this realistic for any "scan and then act later"
    // workflow.
    if let Some(expected) = target.expected_name.as_deref().filter(|n| !n.is_empty()) {
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
    }

    match kill_process(pid, all_processes) {
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

fn kill_process(pid: u32, all_processes: &ProcessSnapshot) -> Result<(), (String, String)> {
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

    if cfg!(target_os = "windows") {
        let output = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output()
            .map_err(|e| (format!("Failed to run taskkill: {}", e), "SPAWN_FAILED".to_string()))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let trimmed = stderr.trim().to_string();
            Err((format!("taskkill error: {}", trimmed), classify_kill_error(&trimmed)))
        }
    } else {
        // SIGKILL doesn't propagate to children. Kill descendants from deepest to
        // shallowest first so they aren't reparented to PID 1 and left running.
        let descendants = collect_descendants(pid, all_processes);
        for child in descendants.iter().rev() {
            let _ = Command::new("kill")
                .args(["-9", &child.to_string()])
                .output();
        }

        let output = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map_err(|e| (format!("Failed to run kill: {}", e), "SPAWN_FAILED".to_string()))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let trimmed = stderr.trim().to_string();
            Err((format!("kill error: {}", trimmed), classify_kill_error(&trimmed)))
        }
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

/// Collect all descendant PIDs of `pid` in BFS order (shallowest first).
fn collect_descendants(pid: u32, all: &ProcessSnapshot) -> Vec<u32> {
    let mut children_map: HashMap<u32, Vec<u32>> = HashMap::new();
    for (&child_pid, info) in all.iter() {
        let ppid = info.0;
        if child_pid != ppid {
            children_map.entry(ppid).or_default().push(child_pid);
        }
    }

    let mut descendants = Vec::new();
    let mut queue = std::collections::VecDeque::from([pid]);
    let mut visited = std::collections::HashSet::new();
    visited.insert(pid);

    while let Some(current) = queue.pop_front() {
        if let Some(children) = children_map.get(&current) {
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
    loop {
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

fn find_pids_by_port(port: u16) -> Result<Vec<u32>, String> {
    if cfg!(target_os = "windows") {
        find_pids_by_port_windows(port)
    } else {
        find_pids_by_port_unix(port)
    }
}

fn find_pids_by_port_unix(port: u16) -> Result<Vec<u32>, String> {
    let output = Command::new("lsof")
        .args(["-ti", &format!(":{}", port)])
        .output()
        .map_err(|e| format!("Failed to run lsof: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    if stdout.trim().is_empty() {
        return Ok(Vec::new());
    }

    // A process dual-listening on IPv4 + IPv6 (Node default) can show the same
    // PID twice depending on the lsof build; keep insertion order but drop
    // repeats so downstream PID lists / fingerprints aren't duplicated (#055).
    let mut pids: Vec<u32> = Vec::new();
    for line in stdout.lines() {
        if let Ok(pid) = line.trim().parse::<u32>() {
            if !pids.contains(&pid) {
                pids.push(pid);
            }
        }
    }
    Ok(pids)
}

fn find_pids_by_port_windows(port: u16) -> Result<Vec<u32>, String> {
    let output = Command::new("netstat")
        .args(["-ano"])
        .output()
        .map_err(|e| format!("Failed to run netstat: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut pids: Vec<u32> = Vec::new();

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
        let local_port = local
            .rsplit(':')
            .next()
            .and_then(|s| s.parse::<u16>().ok());
        if local_port != Some(port) {
            continue;
        }

        let pid_str = if is_tcp {
            // TCP rows: Proto Local Foreign State PID
            if cols.len() < 5 {
                continue;
            }
            let foreign = cols[2];
            if !is_listening_foreign(foreign) {
                continue;
            }
            cols[4]
        } else {
            // UDP rows: Proto Local Foreign PID (no state column)
            cols[3]
        };

        if let Ok(pid) = pid_str.parse::<u32>() {
            if pid != 0 && !pids.contains(&pid) {
                pids.push(pid);
            }
        }
    }

    Ok(pids)
}

/// A TCP socket in LISTEN state has no peer; netstat prints the foreign
/// address as a zeroed/wildcard sentinel. Matching on these patterns is
/// locale-independent — Windows does not translate them.
fn is_listening_foreign(foreign: &str) -> bool {
    foreign == "0.0.0.0:0"
        || foreign == "[::]:0"
        || foreign == "*:*"
        || foreign.ends_with(":*")
}

fn get_all_processes() -> ProcessSnapshot {
    let mut sys = System::new_all();
    sys.refresh_all();
    sys.processes()
        .iter()
        .map(|(pid, p)| {
            let ppid = p.parent().map(|p| p.as_u32()).unwrap_or(0);
            let name = p.name().to_string_lossy().to_string();
            let cmd = p
                .cmd()
                .iter()
                .filter_map(|s| s.to_str())
                .collect::<Vec<_>>()
                .join(" ");
            (pid.as_u32(), (ppid, name, cmd))
        })
        .collect()
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

fn build_subtree_with_index(
    pid: u32,
    all: &ProcessSnapshot,
    children_by_parent: &HashMap<u32, Vec<u32>>,
) -> ProcessNode {
    let (ppid, name, command) =
        all.get(&pid)
            .cloned()
            .unwrap_or((0, "Unknown".to_string(), "Unknown".to_string()));

    let children: Vec<ProcessNode> = children_by_parent
        .get(&pid)
        .map(|kids| {
            kids.iter()
                .map(|&child| build_subtree_with_index(child, all, children_by_parent))
                .collect()
        })
        .unwrap_or_default();

    ProcessNode {
        pid,
        ppid,
        name,
        command,
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

fn build_focused_tree(
    pid: u32,
    all: &ProcessSnapshot,
    children_by_parent: &HashMap<u32, Vec<u32>>,
) -> ProcessNode {
    let parent_chain = get_parent_chain(pid, all, 64);
    let root_pid = parent_chain.last().copied().unwrap_or(pid);
    build_subtree_with_index(root_pid, all, children_by_parent)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

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
