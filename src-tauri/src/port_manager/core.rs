use super::types::{KillPidResult, PortProcessDetail, SystemInfo};

#[tauri::command]
pub fn query_port_processes(ports: Vec<u16>) -> Vec<PortProcessDetail> {
    super::processes::query_port_processes(ports)
}

#[tauri::command]
pub fn kill_processes(pids: Vec<u32>) -> Vec<KillPidResult> {
    super::processes::kill_processes(pids)
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    super::system_info::collect_system_info()
}
