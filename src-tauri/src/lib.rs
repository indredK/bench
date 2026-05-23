mod app_manager;
mod app_updater;
mod commands;
mod dev_cleaner;
mod env_detector;
mod menu;
mod port_manager;

use app_manager::AppManagerState;
use app_updater::UpdaterCache;
use dev_cleaner::ScanAbortFlag;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_manager_state = AppManagerState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Arc::new(AtomicBool::new(false)) as ScanAbortFlag)
        .manage(app_manager_state)
        .manage(UpdaterCache::default())
        .setup(menu::setup_menu)
        .invoke_handler(app_invoke_handler!())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
