use super::types::{KillPidResult, KillTarget, PortProcessDetail};

#[tauri::command]
pub async fn query_port_processes(ports: Vec<u16>) -> Result<Vec<PortProcessDetail>, String> {
    tokio::task::spawn_blocking(move || super::processes::query_port_processes(ports))
        .await
        .map_err(|e| format!("query_port_processes: blocking task failed: {e}"))
}

#[tauri::command]
pub async fn kill_processes(targets: Vec<KillTarget>) -> Result<Vec<KillPidResult>, String> {
    tokio::task::spawn_blocking(move || super::processes::kill_processes(targets))
        .await
        .map_err(|e| format!("kill_processes: blocking task failed: {e}"))
}
