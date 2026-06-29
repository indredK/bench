use super::types::{KillPidResult, KillTarget, PortProcessDetail};

#[tauri::command]
pub async fn query_port_processes(ports: Vec<u16>) -> Vec<PortProcessDetail> {
    tokio::task::spawn_blocking(move || {
        super::processes::query_port_processes(ports)
    })
    .await
    .expect("query_port_processes: spawn_blocking failed")
}

#[tauri::command]
pub async fn kill_processes(targets: Vec<KillTarget>) -> Vec<KillPidResult> {
    tokio::task::spawn_blocking(move || {
        super::processes::kill_processes(targets)
    })
    .await
    .expect("kill_processes: spawn_blocking failed")
}
