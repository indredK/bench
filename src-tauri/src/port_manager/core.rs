use super::types::{KillPidResult, KillTarget, PortProcessDetail, SystemInfo};

#[tauri::command]
pub fn query_port_processes(ports: Vec<u16>) -> Vec<PortProcessDetail> {
    super::processes::query_port_processes(ports)
}

#[tauri::command]
pub fn kill_processes(targets: Vec<KillTarget>) -> Vec<KillPidResult> {
    super::processes::kill_processes(targets)
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    super::system_info::collect_system_info()
}
