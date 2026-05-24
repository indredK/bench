mod api_billing;
mod app_manager;
mod app_updater;
mod bootstrap;
mod commands;
mod dev_cleaner;
mod env_detector;
mod menu;
mod port_manager;
mod window_theme;

use api_billing::ApiBillingState;
use app_manager::AppManagerState;
use app_updater::UpdaterCache;
use bootstrap::create_state as create_bootstrap_state;
use dev_cleaner::ScanAbortFlag;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_manager_state = AppManagerState::new();
    let api_billing_state = ApiBillingState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Arc::new(AtomicBool::new(false)) as ScanAbortFlag)
        .manage(app_manager_state)
        .manage(api_billing_state)
        .manage(UpdaterCache::default())
        .manage(create_bootstrap_state())
        .setup(|app| {
            menu::setup_menu(app)?;
            let handle = app.handle().clone();
            let state = app.state::<ApiBillingState>();
            if let Err(e) = api_billing::init_state(&handle, &state) {
                eprintln!("[api_billing] init failed: {e}");
            }
            Ok(())
        })
        .invoke_handler(app_invoke_handler!())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
