#[macro_export]
macro_rules! app_invoke_handler {
    () => {
        tauri::generate_handler![
            $crate::app_manager::scan_installed_apps,
            $crate::app_manager::launch_app,
            $crate::app_manager::reveal_app_in_finder,
            $crate::app_manager::check_managed_app_updates,
            $crate::app_manager::upgrade_app,
            $crate::app_manager::uninstall_app,
            $crate::app_manager::get_app_operation_history,
            $crate::app_manager::batch_upgrade_apps,
            $crate::app_manager::batch_uninstall_apps,
            $crate::app_manager::refresh_app_updates,
            $crate::app_manager::install_app,
            $crate::app_manager::batch_install_apps,
            $crate::port_manager::get_system_info,
            $crate::port_manager::query_port_processes,
            $crate::port_manager::kill_processes,
            $crate::dev_cleaner::scan_dev_projects,
            $crate::dev_cleaner::cleanup_projects,
            $crate::dev_cleaner::stop_scan,
            $crate::env_detector::detect_env_tools,
        ]
    };
}
