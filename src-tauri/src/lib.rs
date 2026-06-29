mod api_billing;
mod app_manager;
mod app_updater;
mod bootstrap;
mod commands;
mod dev_cleaner;
mod env_detector;
mod file_ops;
mod menu;
mod port_manager;
mod sleep_inhibitor;
mod system_settings;
mod terminology;
mod token_calculator;
mod window_theme;

use api_billing::ApiBillingState;
use app_manager::AppManagerState;
use app_updater::UpdaterCache;
use bootstrap::{create_state as create_bootstrap_state, record_startup_issue};
use dev_cleaner::{CustomCleanupAbortFlag, ScanAbortFlag};
use token_calculator::TokenCalculatorState;
use terminology::state::TerminologyState;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_manager_state = AppManagerState::new();
    let api_billing_state = ApiBillingState::new();
    let token_calculator_state = TokenCalculatorState::new();
    let terminology_state = TerminologyState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Arc::new(AtomicBool::new(false)) as ScanAbortFlag)
        .manage(CustomCleanupAbortFlag(Arc::new(AtomicBool::new(false))))
        .manage(app_manager_state)
        .manage(api_billing_state)
        .manage(token_calculator_state)
        .manage(terminology_state)
        .manage(UpdaterCache::default())
        .manage(create_bootstrap_state())
        .setup(|app| {
            menu::setup_menu(app)?;
            let handle = app.handle().clone();
            let bootstrap_state = app.state::<bootstrap::SharedBootstrapState>().inner().clone();
            let state = app.state::<ApiBillingState>();
            if let Err(e) = api_billing::init_state(&handle, &state) {
                let message = e.to_string();
                eprintln!("[api_billing] init failed: {message}");
                state.set_init_error(message.clone());
                record_startup_issue(&bootstrap_state, "api-billing", message);
            }
            let tc_state = app.state::<TokenCalculatorState>();
            if let Err(e) = token_calculator::init_state(&handle, &tc_state) {
                let message = e.to_string();
                eprintln!("[token_calculator] init failed: {message}");
                tc_state.set_init_error(message.clone());
                record_startup_issue(&bootstrap_state, "token-calculator", message);
            }
            let terminology_state = app.state::<TerminologyState>();
            if let Err(e) = terminology::storage::init_state(&handle, &terminology_state) {
                let message = e.to_string();
                eprintln!("[terminology] init failed: {message}");
                terminology_state.set_init_error(message.clone());
                record_startup_issue(&bootstrap_state, "terminology", message);
            }
            Ok(())
        })
        .invoke_handler(app_invoke_handler!())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            // Kill our own caffeinate process when the app exits so the
            // system-level sleep prevention state we report stays accurate
            // and other apps (OnlySwitch, Amphetamine, ...) don't see a
            // stale assertion from an already-closed Bench.
            if let tauri::RunEvent::Exit = event {
                sleep_inhibitor::commands::cleanup_on_exit();
            }
        });
}
