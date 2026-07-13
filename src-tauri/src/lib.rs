mod account_manager;
mod app_manager;
mod app_preferences;
mod app_updater;
mod bootstrap;
mod clean_space;
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
mod tray;
mod window_theme;

use account_manager::AccountManagerState;
use app_manager::AppManagerState;
use app_updater::UpdaterCache;
use bootstrap::{create_state as create_bootstrap_state, record_startup_issue};
use dev_cleaner::{CustomCleanupAbortFlag, ScanAbortFlag};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;
use terminology::state::TerminologyState;
use token_calculator::TokenCalculatorState;

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
        .plugin(tauri_plugin_notification::init())
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
            #[cfg(target_os = "macos")]
            tauri::async_runtime::spawn_blocking(|| {
                if let Err(error) = app_manager::installer::replace::recover_pending_replacements()
                {
                    eprintln!("[app-manager] update recovery failed: {error}");
                }
            });

            menu::setup_menu(app)?;
            tray::setup_tray(app)?;

            // 关闭按钮行为: 拦截 window close, 根据偏好决定 minimize_to_tray 或 quit
            if let Some(main_window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                let win = main_window.clone();
                win.clone().on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let behavior = app_preferences::storage::get_close_behavior(&app_handle)
                            .unwrap_or_else(|_| {
                                crate::app_preferences::types::BEHAVIOR_MINIMIZE_TO_TRAY.to_string()
                            });
                        if behavior == crate::app_preferences::types::BEHAVIOR_ALWAYS_ASK {
                            // 每次提醒: 阻止关闭, 弹出选择对话框
                            api.prevent_close();
                            let _ = win.emit("show-close-behavior-dialog", ());
                            return;
                        }
                        let has_pref = app_preferences::storage::has_close_behavior(&app_handle)
                            .unwrap_or(false);
                        if !has_pref {
                            // 首次关闭: 阻止关闭, 通知前端弹出选择对话框
                            api.prevent_close();
                            let _ = win.emit("show-close-behavior-dialog", ());
                            return;
                        }
                        match behavior.as_str() {
                            crate::app_preferences::types::BEHAVIOR_QUIT => {
                                // 允许窗口正常关闭, ExitRequested 会处理 session 持久化
                            }
                            _ => {
                                api.prevent_close();
                                let _ = win.hide();
                            }
                        }
                    }
                });
            }

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
            let bootstrap_state = app
                .state::<bootstrap::SharedBootstrapState>()
                .inner()
                .clone();
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
                )
                .unwrap_or_else(|error| {
                    eprintln!("[account_manager] startup TTL cleanup failed: {error}");
                    Vec::new()
                });
                if !cleared.is_empty() {
                    eprintln!(
                        "[account_manager] startup: cleared {} expired session(s)",
                        cleared.len()
                    );
                }
                match account_manager::session::restore_sessions_on_startup(&restore_handle, &state)
                    .await
                {
                    Ok(restored) => eprintln!(
                        "[account_manager] startup: restored and probed {restored} session(s)"
                    ),
                    Err(error) => {
                        eprintln!("[account_manager] startup session restore failed: {error}")
                    }
                }
            });

            // F.6.3 周期性清理 TTL 超时的 session（每 30 分钟一次）。
            // 任务随 runtime 退出自动取消；best-effort，失败仅打日志。
            let cleanup_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(1800));
                interval.tick().await; // 跳过首次立即触发（启动时已清理）
                loop {
                    interval.tick().await;
                    let state = cleanup_handle.state::<AccountManagerState>();
                    let cleared = account_manager::session::cleanup_expired_sessions(
                        &cleanup_handle,
                        &state,
                        chrono::Utc::now(),
                    )
                    .unwrap_or_else(|error| {
                        eprintln!("[account_manager] periodic TTL cleanup failed: {error}");
                        Vec::new()
                    });
                    if !cleared.is_empty() {
                        eprintln!(
                            "[account_manager] periodic: cleared {} expired session(s)",
                            cleared.len()
                        );
                    }
                }
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
                        match account_manager::session::persist_all_sessions_on_exit(
                            &handle, &state,
                        )
                        .await
                        {
                            Ok(persisted) => eprintln!(
                                "[account_manager] exit: persisted {persisted} session(s)"
                            ),
                            Err(error) => {
                                eprintln!("[account_manager] exit session flush failed: {error}")
                            }
                        }
                    });
                    sleep_inhibitor::commands::cleanup_on_exit();
                }
                _ => {}
            }
        });
}
