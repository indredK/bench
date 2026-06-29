use super::inventory::{collect_command_inventory, diagnose_command_inventory};
use super::paths::collect_search_dirs;
use super::types::ScanDonePayload;
use tauri::{AppHandle, Emitter};

const MAX_VERSION_PROBES: usize = 80;

#[tauri::command]
pub async fn detect_env_tools(app_handle: AppHandle) {
    tokio::task::spawn_blocking(move || {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            detect_env_tools_inner(app_handle);
        })) {
            Ok(()) => {}
            Err(_) => {
                eprintln!("[env_detector] panic caught, returning empty result");
            }
        }
    });
}

fn detect_env_tools_inner(app_handle: AppHandle) {
    let search_dirs = collect_search_dirs();
    let inventory = collect_command_inventory(&search_dirs);
    let (tools, unavailable) = diagnose_command_inventory(inventory, MAX_VERSION_PROBES);

    let _ = app_handle.emit("env-scan-done", ScanDonePayload { tools, unavailable });
}
