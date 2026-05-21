use super::fingerprints::fingerprint_port_process;
use super::types::{KillPidResult, PortProcessDetail, ProcessNode};
use std::collections::HashMap;
use std::process::Command;

type ProcessSnapshot = HashMap<u32, (u32, String, String)>;

pub(super) fn query_port_processes(ports: Vec<u16>) -> Vec<PortProcessDetail> {
    let all_processes = get_all_processes();

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
                .map(|pid| build_focused_tree(*pid, &all_processes))
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

pub(super) fn kill_processes(pids: Vec<u32>) -> Vec<KillPidResult> {
    let all_processes = get_all_processes();
    pids.into_iter()
        .map(|pid| match kill_process(pid, &all_processes) {
            Ok(()) => KillPidResult {
                pid,
                success: true,
                message: "Successfully terminated".to_string(),
            },
            Err(e) => KillPidResult {
                pid,
                success: false,
                message: e,
            },
        })
        .collect()
}

fn kill_process(pid: u32, all_processes: &ProcessSnapshot) -> Result<(), String> {
    let current_pid = std::process::id();
    if pid == current_pid {
        return Err("Cannot kill the Port Manager process itself".to_string());
    }
    if is_descendant_of(pid, current_pid, all_processes) {
        return Err("Cannot kill a child process of Port Manager".to_string());
    }

    if cfg!(target_os = "windows") {
        let output = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output()
            .map_err(|e| format!("Failed to run taskkill: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("taskkill error: {}", stderr.trim()))
        }
    } else {
        let output = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map_err(|e| format!("Failed to run kill: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("kill error: {}", stderr.trim()))
        }
    }
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

    stdout
        .lines()
        .map(|line| {
            line.trim()
                .parse::<u32>()
                .map_err(|e| format!("Failed to parse PID '{}': {}", line.trim(), e))
        })
        .collect()
}

fn find_pids_by_port_windows(port: u16) -> Result<Vec<u32>, String> {
    let output = Command::new("netstat")
        .args(["-ano"])
        .output()
        .map_err(|e| format!("Failed to run netstat: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let port_str = format!(":{}", port);
    let mut pids: Vec<u32> = Vec::new();

    for line in stdout.lines() {
        if line.contains(&port_str) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(pid_str) = parts.last() {
                if let Ok(pid) = pid_str.parse::<u32>() {
                    if pid != 0 && !pids.contains(&pid) {
                        pids.push(pid);
                    }
                }
            }
        }
    }

    Ok(pids)
}

fn get_all_processes() -> ProcessSnapshot {
    let mut processes = HashMap::new();

    if cfg!(target_os = "windows") {
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Csv -NoTypeInformation",
            ])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                let line = line.trim();
                if line.is_empty() || !line.starts_with('"') {
                    continue;
                }
                let parts: Vec<&str> = line
                    .split(',')
                    .map(|s| s.trim_matches('"').trim())
                    .collect();
                if parts.len() >= 4 {
                    if let (Ok(pid), Ok(ppid)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>())
                    {
                        let name = parts[2].to_string();
                        let cmd = parts[3..].join(",");
                        processes.insert(pid, (ppid, name, cmd));
                    }
                }
            }
        }
    } else if let Ok(output) = Command::new("ps")
        .args(["-eo", "pid,ppid,comm,args"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().skip(1) {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                if let (Ok(pid), Ok(ppid)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                    let command = parts[3..].join(" ");
                    processes.insert(pid, (ppid, parts[2].to_string(), command));
                }
            }
        }
    }

    processes
}

fn build_subtree(pid: u32, all: &ProcessSnapshot) -> ProcessNode {
    let (ppid, name, command) =
        all.get(&pid)
            .cloned()
            .unwrap_or((0, "Unknown".to_string(), "Unknown".to_string()));

    let mut children: Vec<ProcessNode> = all
        .iter()
        .filter(|(&child_pid, child_info)| child_info.0 == pid && child_pid != pid)
        .map(|(&child_pid, _)| build_subtree(child_pid, all))
        .collect();

    children.sort_by_key(|c| c.pid);

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

fn build_focused_tree(pid: u32, all: &ProcessSnapshot) -> ProcessNode {
    let parent_chain = get_parent_chain(pid, all, 10);
    let root_pid = parent_chain.last().copied().unwrap_or(pid);
    build_subtree(root_pid, all)
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

        let node = build_focused_tree(100, &processes);
        assert_eq!(node.pid, 50);
        assert_eq!(node.children.len(), 1);
        assert_eq!(node.children[0].pid, 100);
    }

    #[test]
    fn test_build_focused_tree_already_root() {
        let mut processes = HashMap::new();
        processes.insert(1, (0, "init".to_string(), "/sbin/init".to_string()));

        let node = build_focused_tree(1, &processes);
        assert_eq!(node.pid, 1);
    }
}
