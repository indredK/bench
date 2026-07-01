use super::types::{KillPidResult, KillTarget, PortProcessDetail};
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn query_port_processes(ports: Vec<u16>) -> AppResult<Vec<PortProcessDetail>> {
    tokio::task::spawn_blocking(move || super::processes::query_port_processes(ports))
        .await
        .map_err(|e| AppError::task_failed(format!("query_port_processes: {e}")))
}

#[tauri::command]
pub async fn kill_processes(targets: Vec<KillTarget>) -> AppResult<Vec<KillPidResult>> {
    tokio::task::spawn_blocking(move || super::processes::kill_processes(targets))
        .await
        .map_err(|e| AppError::task_failed(format!("kill_processes: {e}")))
}
