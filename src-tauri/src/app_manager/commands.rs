use super::state::{get_operation_history, AppManagerState};
use super::types::{
    BatchInstallItem, BatchItemResult, BatchOperationResult, InstallSource, OperationRecord,
    OperationResult, PlatformCapabilities, ScanResult,
};
use super::{linux, macos, windows};
use tauri::Manager;

fn is_macos() -> bool {
    std::env::consts::OS == "macos"
}

fn is_windows() -> bool {
    std::env::consts::OS == "windows"
}

fn is_linux() -> bool {
    std::env::consts::OS == "linux"
}

fn empty_scan_result() -> ScanResult {
    ScanResult {
        apps: vec![],
        total_count: 0,
        user_count: 0,
        system_count: 0,
        scan_time_ms: 0,
        managed_count: 0,
        platform_capabilities: PlatformCapabilities {
            brew_available: false,
            winget_available: false,
            flatpak_available: false,
            snap_available: false,
            apt_available: false,
        },
        last_scan_time: 0,
        last_update_check: 0,
    }
}

#[tauri::command]
pub async fn scan_installed_apps(app: tauri::AppHandle) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppManagerState> = app.state();
        let result = if is_macos() {
            macos::scan_installed_apps(state.clone())
        } else if is_windows() {
            windows::scan_installed_apps()
        } else if is_linux() {
            linux::scan_installed_apps()
        } else {
            empty_scan_result()
        };

        if !result.apps.is_empty() {
            state.cache_scan_result(result.clone());
        }
        result
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn launch_app(app_path: String) -> Result<(), String> {
    if is_macos() {
        macos::launch_app(app_path)
    } else if is_windows() {
        windows::launch_app(app_path)
    } else if is_linux() {
        linux::launch_app(app_path)
    } else {
        Err("Unsupported platform".into())
    }
}

#[tauri::command]
pub fn reveal_app_in_finder(app_path: String) -> Result<(), String> {
    if is_macos() {
        macos::reveal_app_in_finder(app_path)
    } else if is_windows() {
        windows::reveal_in_explorer(app_path)
    } else if is_linux() {
        linux::reveal_in_file_manager(app_path)
    } else {
        Err("Unsupported platform".into())
    }
}

#[tauri::command]
pub fn check_managed_app_updates(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> Vec<String> {
    state.mark_update_check();
    if is_macos() {
        macos::check_updates(app_ids, state)
    } else if is_windows() {
        windows::check_updates(app_ids, state)
    } else if is_linux() {
        linux::check_updates(app_ids, state)
    } else {
        vec![]
    }
}

#[tauri::command]
pub fn upgrade_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    if !state.acquire_op_lock(&app_id) {
        return Ok(OperationResult {
            success: false,
            message: "This application is currently being modified. Please wait.".into(),
            exit_code: None,
            error_code: Some("LOCKED".into()),
            permission_issue: false,
        });
    }

    let result = if is_macos() {
        macos::upgrade_app(app_id.clone(), state.clone())
    } else if is_windows() {
        windows::upgrade_app(app_id.clone(), state.clone())
    } else if is_linux() {
        linux::upgrade_app(app_id.clone(), state.clone())
    } else {
        Err("Unsupported platform".into())
    };

    state.release_op_lock(&app_id);
    result
}

#[tauri::command]
pub fn uninstall_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    if !state.acquire_op_lock(&app_id) {
        return Ok(OperationResult {
            success: false,
            message: "This application is currently being modified. Please wait.".into(),
            exit_code: None,
            error_code: Some("LOCKED".into()),
            permission_issue: false,
        });
    }

    let result = if is_macos() {
        macos::uninstall_app(app_id.clone(), state.clone())
    } else if is_windows() {
        windows::uninstall_app(app_id.clone(), state.clone())
    } else if is_linux() {
        linux::uninstall_app(app_id.clone(), state.clone())
    } else {
        Err("Unsupported platform".into())
    };

    state.release_op_lock(&app_id);
    result
}

#[tauri::command]
pub fn get_app_operation_history(app_id: Option<String>) -> Vec<OperationRecord> {
    get_operation_history(app_id)
}

#[tauri::command]
pub fn batch_upgrade_apps(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> BatchOperationResult {
    let mut results = Vec::new();
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    for app_id in &app_ids {
        let result = upgrade_app(app_id.clone(), state.clone());
        match result {
            Ok(r) => {
                let item = BatchItemResult {
                    app_id: app_id.clone(),
                    app_name: String::new(),
                    success: r.success,
                    message: r.message,
                    exit_code: r.exit_code,
                };
                if r.success {
                    succeeded += 1;
                } else {
                    failed += 1;
                }
                results.push(item);
            }
            Err(e) => {
                failed += 1;
                results.push(BatchItemResult {
                    app_id: app_id.clone(),
                    app_name: String::new(),
                    success: false,
                    message: e,
                    exit_code: None,
                });
            }
        }
    }

    BatchOperationResult {
        total: app_ids.len(),
        succeeded,
        failed,
        results,
    }
}

#[tauri::command]
pub fn batch_uninstall_apps(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> BatchOperationResult {
    let mut results = Vec::new();
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    for app_id in &app_ids {
        let result = uninstall_app(app_id.clone(), state.clone());
        match result {
            Ok(r) => {
                let item = BatchItemResult {
                    app_id: app_id.clone(),
                    app_name: String::new(),
                    success: r.success,
                    message: r.message,
                    exit_code: r.exit_code,
                };
                if r.success {
                    succeeded += 1;
                } else {
                    failed += 1;
                }
                results.push(item);
            }
            Err(e) => {
                failed += 1;
                results.push(BatchItemResult {
                    app_id: app_id.clone(),
                    app_name: String::new(),
                    success: false,
                    message: e,
                    exit_code: None,
                });
            }
        }
    }

    BatchOperationResult {
        total: app_ids.len(),
        succeeded,
        failed,
        results,
    }
}

#[tauri::command]
pub fn refresh_app_updates(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> Vec<String> {
    check_managed_app_updates(app_ids, state)
}

#[tauri::command]
pub fn install_app(
    app_id: String,
    install_source: InstallSource,
) -> Result<OperationResult, String> {
    if is_macos() {
        macos::install_app(app_id, install_source)
    } else if is_windows() {
        windows::install_app(app_id, install_source)
    } else if is_linux() {
        linux::install_app(app_id, install_source)
    } else {
        Err("Unsupported platform".into())
    }
}

#[tauri::command]
pub fn batch_install_apps(items: Vec<BatchInstallItem>) -> BatchOperationResult {
    let mut results = Vec::new();
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    for item in &items {
        let result = install_app(item.app_id.clone(), item.install_source.clone());
        match result {
            Ok(r) => {
                let item_result = BatchItemResult {
                    app_id: item.app_id.clone(),
                    app_name: String::new(),
                    success: r.success,
                    message: r.message,
                    exit_code: r.exit_code,
                };
                if r.success {
                    succeeded += 1;
                } else {
                    failed += 1;
                }
                results.push(item_result);
            }
            Err(e) => {
                failed += 1;
                results.push(BatchItemResult {
                    app_id: item.app_id.clone(),
                    app_name: String::new(),
                    success: false,
                    message: e,
                    exit_code: None,
                });
            }
        }
    }

    BatchOperationResult {
        total: items.len(),
        succeeded,
        failed,
        results,
    }
}
