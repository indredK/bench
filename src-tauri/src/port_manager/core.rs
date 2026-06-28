use super::types::{KillPidResult, KillTarget, PortProcessDetail};

#[tauri::command]
pub fn query_port_processes(ports: Vec<u16>) -> Vec<PortProcessDetail> {
    super::processes::query_port_processes(ports)
}

#[tauri::command]
pub fn kill_processes(targets: Vec<KillTarget>) -> Vec<KillPidResult> {
    super::processes::kill_processes(targets)
}
