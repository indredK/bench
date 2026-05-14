use serde::Serialize;
use std::process::Command;
use sysinfo::System;

#[derive(Debug, Serialize)]
pub struct KillResult {
    pub port: u16,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub hostname: String,
    pub cpu_brand: String,
    pub cpu_cores: u32,
    pub total_memory: u64,
    pub available_memory: u64,
    pub used_memory: u64,
    pub memory_usage_percent: f32,
}

#[tauri::command]
fn kill_ports(ports: Vec<u16>) -> Vec<KillResult> {
    ports.into_iter().map(|port| kill_port(port)).collect()
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_memory = sys.total_memory();
    let available_memory = sys.available_memory();
    let used_memory = total_memory - available_memory;
    let memory_usage_percent = if total_memory > 0 {
        (used_memory as f32 / total_memory as f32) * 100.0
    } else {
        0.0
    };

    SystemInfo {
        os_name: System::long_os_version().unwrap_or_else(|| "Unknown".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
        kernel_version: System::kernel_version().unwrap_or_else(|| "Unknown".to_string()),
        hostname: System::host_name().unwrap_or_else(|| "Unknown".to_string()),
        cpu_brand: sys.cpus().first().map(|cpu| cpu.brand().to_string()).unwrap_or_else(|| "Unknown".to_string()),
        cpu_cores: sys.cpus().len() as u32,
        total_memory,
        available_memory,
        used_memory,
        memory_usage_percent,
    }
}

fn kill_port(port: u16) -> KillResult {
    let pids = match find_pids_by_port(port) {
        Ok(pids) => pids,
        Err(e) => {
            return KillResult {
                port,
                success: false,
                message: format!("Failed to query: {}", e),
            };
        }
    };

    if pids.is_empty() {
        return KillResult {
            port,
            success: false,
            message: "No process found on this port".to_string(),
        };
    }

    let mut killed = Vec::new();
    let mut failed = Vec::new();

    for pid in &pids {
        match kill_process(*pid) {
            Ok(()) => killed.push(pid),
            Err(e) => failed.push((pid, e)),
        }
    }

    if failed.is_empty() {
        KillResult {
            port,
            success: true,
            message: format!(
                "Successfully terminated (PID: {})",
                killed
                    .iter()
                    .map(|p| p.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
        }
    } else if killed.is_empty() {
        let errors: Vec<String> = failed
            .iter()
            .map(|(pid, e)| format!("PID {}: {}", pid, e))
            .collect();
        KillResult {
            port,
            success: false,
            message: format!("Failed to terminate: {}", errors.join("; ")),
        }
    } else {
        let killed_str: Vec<String> = killed.iter().map(|p| p.to_string()).collect();
        let failed_str: Vec<String> = failed
            .iter()
            .map(|(pid, e)| format!("PID {}: {}", pid, e))
            .collect();
        KillResult {
            port,
            success: false,
            message: format!(
                "Killed PID: {}. Failed: {}",
                killed_str.join(", "),
                failed_str.join("; ")
            ),
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

    let pids: Result<Vec<u32>, _> = stdout
        .lines()
        .map(|line| {
            line.trim()
                .parse::<u32>()
                .map_err(|e| format!("Failed to parse PID '{}': {}", line.trim(), e))
        })
        .collect();

    pids
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
        if line.contains(&port_str) && line.contains("LISTENING") {
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

fn kill_process(pid: u32) -> Result<(), String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![kill_ports, get_system_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}