mod dev_cleaner;
mod port_manager;

use dev_cleaner::ScanAbortFlag;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(AtomicBool::new(false)) as ScanAbortFlag)
        .invoke_handler(tauri::generate_handler![
            port_manager::get_system_info,
            port_manager::query_port_processes,
            port_manager::kill_processes,
            dev_cleaner::scan_dev_projects,
            dev_cleaner::cleanup_projects,
            dev_cleaner::stop_scan,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
