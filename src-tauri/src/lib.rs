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
            // Session Manager: 启动后异步恢复 session
            // NOTE: ApiBillingState 未实现 Clone，不能在 setup 闭包内 clone 后移入 'static 任务。
            // 改为把 AppHandle（'static）移入任务，在任务内部通过 handle.state() 取引用。
            let restore_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = restore_handle.state::<ApiBillingState>();
                // F.6.3 启动时先清理 TTL 超时的 session(同步,在恢复之前)
                let cleared = api_billing::session::cleanup_expired_sessions(
                    &restore_handle,
                    &state,
                    chrono::Utc::now(),
                );
                if !cleared.is_empty() {
                    eprintln!(
                        "[api_billing] startup: cleared {} expired session(s)",
                        cleared.len()
                    );
                }
                api_billing::session::restore_sessions_on_startup(
                    &restore_handle,
                    &state,
                )
                .await;
            });
            Ok(())
        })
        .invoke_handler(app_invoke_handler!())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match event {
                tauri::RunEvent::Exit => {
                    sleep_inhibitor::commands::cleanup_on_exit();
                }
                tauri::RunEvent::ExitRequested { .. } => {
                    // Session Manager: 退出前持久化所有活跃 session
                    // NOTE: 同 setup，ApiBillingState 不可 Clone，改为在 block 内通过 handle 取引用。
                    let handle = app_handle.clone();
                    tauri::async_runtime::block_on(async move {
                        let state = handle.state::<ApiBillingState>();
                        api_billing::session::persist_all_sessions_on_exit(
                            &handle,
                            &state,
                        )
                        .await;
                        api_billing::session::cleanup_ephemeral(&state);
                    });
                    sleep_inhibitor::commands::cleanup_on_exit();
                }
                _ => {}
            }
        });
}
