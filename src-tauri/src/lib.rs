mod app_manager;
mod dev_cleaner;
mod env_detector;
mod port_manager;

use app_manager::AppManagerState;
use dev_cleaner::ScanAbortFlag;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_manager_state = AppManagerState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(AtomicBool::new(false)) as ScanAbortFlag)
        .manage(app_manager_state)
        .invoke_handler(tauri::generate_handler![
            app_manager::scan_installed_apps,
            app_manager::launch_app,
            app_manager::reveal_app_in_finder,
            app_manager::check_managed_app_updates,
            app_manager::upgrade_app,
            app_manager::uninstall_app,
            app_manager::get_app_operation_history,
            app_manager::batch_upgrade_apps,
            app_manager::batch_uninstall_apps,
            app_manager::refresh_app_updates,
            port_manager::get_system_info,
            port_manager::query_port_processes,
            port_manager::kill_processes,
            dev_cleaner::scan_dev_projects,
            dev_cleaner::cleanup_projects,
            dev_cleaner::stop_scan,
            env_detector::detect_env_tools,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
