mod account_manager;
mod app_manager;
mod app_updater;
mod bootstrap;
mod commands;
mod dev_cleaner;
mod env_detector;
mod error;
mod file_ops;
mod menu;
mod port_manager;
mod sleep_inhibitor;
mod system_settings;
mod terminology;
mod token_calculator;
mod window_theme;

use account_manager::AccountManagerState;
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
    let account_manager_state = AccountManagerState::new();
    let token_calculator_state = TokenCalculatorState::new();
    let terminology_state = TerminologyState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Arc::new(AtomicBool::new(false)) as ScanAbortFlag)
        .manage(CustomCleanupAbortFlag(Arc::new(AtomicBool::new(false))))
        .manage(app_manager_state)
        .manage(account_manager_state)
        .manage(token_calculator_state)
        .manage(terminology_state)
        .manage(UpdaterCache::default())
        .manage(create_bootstrap_state())
        .setup(|app| {
            menu::setup_menu(app)?;

            // 外部登录代理: best-effort 运行时注册 bench-auth:// scheme。
            // macOS 打包后由 Info.plist(CFBundleURLTypes) 注册；此调用主要服务于
            // Linux/Windows 及开发环境，失败不阻塞启动。
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register("bench-auth") {
                    eprintln!("[deep-link] register bench-auth failed (non-fatal): {e:?}");
                }
            }

            let handle = app.handle().clone();
            let bootstrap_state = app.state::<bootstrap::SharedBootstrapState>().inner().clone();
            let state = app.state::<AccountManagerState>();
            if let Err(e) = account_manager::init_state(&handle, &state) {
                let message = e.to_string();
                eprintln!("[account_manager] init failed: {message}");
                state.set_init_error(message.clone());
                record_startup_issue(&bootstrap_state, "account-manager", message);
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
            // NOTE: AccountManagerState 未实现 Clone，不能在 setup 闭包内 clone 后移入 'static 任务。
            // 改为把 AppHandle（'static）移入任务，在任务内部通过 handle.state() 取引用。
            let restore_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = restore_handle.state::<AccountManagerState>();
                // F.6.3 启动时先清理 TTL 超时的 session(同步,在恢复之前)
                let cleared = account_manager::session::cleanup_expired_sessions(
                    &restore_handle,
                    &state,
                    chrono::Utc::now(),
                );
                if !cleared.is_empty() {
                    eprintln!(
                        "[account_manager] startup: cleared {} expired session(s)",
                        cleared.len()
                    );
                }
                account_manager::session::restore_sessions_on_startup(
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
                    // NOTE: 同 setup，AccountManagerState 不可 Clone，改为在 block 内通过 handle 取引用。
                    let handle = app_handle.clone();
                    tauri::async_runtime::block_on(async move {
                        let state = handle.state::<AccountManagerState>();
                        account_manager::session::persist_all_sessions_on_exit(
                            &handle,
                            &state,
                        )
                        .await;
                        account_manager::session::cleanup_ephemeral(&state);
                    });
                    sleep_inhibitor::commands::cleanup_on_exit();
                }
                _ => {}
            }
        });
}
