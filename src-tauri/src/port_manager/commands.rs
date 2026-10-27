use super::types::{KillPidResult, KillTarget, PortProcessDetail, ProcessChildrenPage};
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn query_port_processes(ports: Vec<u16>) -> AppResult<Vec<PortProcessDetail>> {
    validate_query_ports(&ports)?;
    tokio::task::spawn_blocking(move || super::processes::query_port_processes(ports))
        .await
        .map_err(|e| AppError::task_failed(format!("query_port_processes: {e}")))
}

#[tauri::command]
pub async fn query_process_children(
    pid: u32,
    expected_ppid: u32,
    expected_name: String,
    expected_identity: Option<String>,
    after_pid: Option<u32>,
) -> AppResult<ProcessChildrenPage> {
    tokio::task::spawn_blocking(move || {
        super::processes::query_process_children(
            pid,
            expected_ppid,
            expected_name,
            expected_identity,
            after_pid,
        )
    })
    .await
    .map_err(|e| AppError::task_failed(format!("query_process_children: {e}")))?
}

fn validate_query_ports(ports: &[u16]) -> AppResult<()> {
    if ports.len() > super::types::MAX_QUERY_PORTS {
        return Err(AppError::invalid_input(format!(
            "A port query may contain at most {} ports",
            super::types::MAX_QUERY_PORTS
        )));
    }
    if ports.contains(&0) {
        return Err(AppError::invalid_input(
            "Port 0 is not a valid query target".to_string(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn kill_processes(targets: Vec<KillTarget>) -> AppResult<Vec<KillPidResult>> {
    let targets = super::processes::deduplicate_kill_targets(targets)?;
    if targets.len() > super::types::MAX_KILL_TARGETS {
        return Err(AppError::invalid_input(format!(
            "A kill request may contain at most {} unique process targets",
            super::types::MAX_KILL_TARGETS
        )));
    }
    tokio::task::spawn_blocking(move || super::processes::kill_processes(targets))
        .await
        .map_err(|e| AppError::task_failed(format!("kill_processes: {e}")))
}

#[cfg(test)]
mod tests {
    use super::validate_query_ports;

    #[test]
    fn query_ports_reject_zero_and_oversized_batches() {
        assert_eq!(
            validate_query_ports(&[0]).unwrap_err().code,
            "INVALID_INPUT"
        );

        let too_many = vec![80; super::super::types::MAX_QUERY_PORTS + 1];
        assert_eq!(
            validate_query_ports(&too_many).unwrap_err().code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn query_ports_accept_empty_and_valid_targets() {
        assert!(validate_query_ports(&[]).is_ok());
        assert!(validate_query_ports(&[80, 443, 8080]).is_ok());
    }
}
