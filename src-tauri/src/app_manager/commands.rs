use super::installer::orchestrator::{install_update, InstallHandle};
use super::state::AppManagerState;
use super::types::{
    BatchItemResult, BatchOperationResult, InstallSource, OperationResult, ScanResult, UpdateInfo,
};
use super::{empty_scan_result, linux, locked_operation_result, macos, sources, windows};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{Emitter, Manager};

fn is_macos() -> bool {
    std::env::consts::OS == "macos"
}

fn is_windows() -> bool {
    std::env::consts::OS == "windows"
}

fn is_linux() -> bool {
    std::env::consts::OS == "linux"
}

fn cancelled_batch_item(app_id: &str) -> BatchItemResult {
    BatchItemResult {
        app_id: app_id.to_string(),
        app_name: String::new(),
        success: false,
        message: "Cancelled by user".to_string(),
        exit_code: None,
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BatchProgressEvent<'a> {
    action: &'a str,
    app_id: &'a str,
    success: bool,
    error_code: Option<&'a str>,
    index: usize,
    total: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BatchCancelledEvent<'a> {
    action: &'a str,
    app_id: &'a str,
    index: usize,
    total: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BatchFinishedEvent<'a> {
    action: &'a str,
    total: usize,
    succeeded: usize,
    failed: usize,
    cancelled: usize,
}

fn emit_silently<T: Serialize + Clone>(app: &tauri::AppHandle, event: &str, payload: T) {
    let _ = app.emit(event, payload);
}

fn try_start_batch_operation(
    state: &tauri::State<'_, AppManagerState>,
) -> Result<Arc<AtomicBool>, BatchOperationResult> {
    state
        .start_batch_operation()
        .map_err(|_| BatchOperationResult {
            total: 0,
            succeeded: 0,
            failed: 1,
            results: vec![BatchItemResult {
                app_id: String::new(),
                app_name: String::new(),
                success: false,
                message: "Another batch operation is already running".to_string(),
                exit_code: None,
            }],
        })
}

#[tauri::command]
pub async fn scan_installed_apps(app: tauri::AppHandle) -> AppResult<ScanResult> {
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppManagerState> = app_clone.state();
        let result = if is_macos() {
            macos::scan_installed_apps(state.clone(), &app_clone)
        } else if is_windows() {
            windows::scan_installed_apps()
        } else if is_linux() {
            linux::scan_installed_apps()
        } else {
            empty_scan_result()
        };

        state.cache_scan_result(result.clone());
        result
    })
    .await
    .map_err(|e| AppError::internal(format!("scan_installed_apps: {e}")))
}

#[tauri::command]
pub async fn get_app_icon_base64(install_path: String) -> AppResult<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || -> Option<String> {
        if is_macos() {
            macos::get_app_icon_base64(&install_path).ok()
        } else {
            None
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("get_app_icon_base64: {e}")))
}

#[tauri::command]
pub fn launch_app(app_path: String) -> AppResult<()> {
    let result = if is_macos() {
        macos::launch_app(app_path)
    } else if is_windows() {
        windows::launch_app(app_path)
    } else if is_linux() {
        linux::launch_app(app_path)
    } else {
        Err("Unsupported platform".into())
    };
    result.map_err(|e| AppError::internal(format!("launch_app: {e}")))
}

#[tauri::command]
pub fn reveal_app_in_finder(app_path: String) -> AppResult<()> {
    let result = if is_macos() {
        macos::reveal_app_in_finder(app_path)
    } else if is_windows() {
        windows::reveal_in_explorer(app_path)
    } else if is_linux() {
        linux::reveal_in_file_manager(app_path)
    } else {
        Err("Unsupported platform".into())
    };
    result.map_err(|e| AppError::internal(format!("reveal_app_in_finder: {e}")))
}

#[tauri::command]
pub fn authorize_mac_app(app_path: String) -> AppResult<OperationResult> {
    if !is_macos() {
        return Err(AppError::unsupported(
            "authorize_mac_app is only available on macOS",
        ));
    }
    macos::authorize_mac_app(app_path)
        .map_err(|e| AppError::internal(format!("authorize_mac_app: {e}")))
}

#[tauri::command]
pub async fn check_managed_app_updates(
    app_ids: Vec<String>,
    app: tauri::AppHandle,
) -> AppResult<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<String>> {
        let state: tauri::State<'_, AppManagerState> = app.state();
        state.mark_update_check();
        if is_macos() {
            macos::check_updates(app_ids, state).map_err(AppError::internal)
        } else if is_windows() {
            windows::check_updates(app_ids, state).map_err(AppError::internal)
        } else if is_linux() {
            linux::check_updates(app_ids, state).map_err(AppError::internal)
        } else {
            Ok(vec![])
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("check_managed_app_updates: {e}")))?
}

#[tauri::command]
pub fn upgrade_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
    app: tauri::AppHandle,
) -> AppResult<OperationResult> {
    let _guard = match state.try_lock_operation(&app_id) {
        Some(guard) => guard,
        None => return Ok(locked_operation_result()),
    };

    let result = if is_macos() {
        macos::upgrade_app(app_id.clone(), state.clone())
    } else if is_windows() {
        windows::upgrade_app(app_id.clone(), state.clone())
    } else if is_linux() {
        linux::upgrade_app(app_id.clone(), state.clone())
    } else {
        Err("Unsupported platform".into())
    };

    let _ = app;
    result.map_err(|e| AppError::internal(format!("upgrade_app: {e}")))
}

#[tauri::command]
pub fn uninstall_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
    app: tauri::AppHandle,
) -> AppResult<OperationResult> {
    let _guard = match state.try_lock_operation(&app_id) {
        Some(guard) => guard,
        None => return Ok(locked_operation_result()),
    };

    let result = if is_macos() {
        macos::uninstall_app(app_id.clone(), state.clone())
    } else if is_windows() {
        windows::uninstall_app(app_id.clone(), state.clone())
    } else if is_linux() {
        linux::uninstall_app(app_id.clone(), state.clone())
    } else {
        Err("Unsupported platform".into())
    };

    let _ = app;
    result.map_err(|e| AppError::internal(format!("uninstall_app: {e}")))
}

#[tauri::command]
pub fn batch_upgrade_apps(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
    app: tauri::AppHandle,
) -> BatchOperationResult {
    let mut results = Vec::new();
    let mut succeeded = 0usize;
    let mut failed = 0usize;
    let mut cancelled = 0usize;

    let cancel_flag = match try_start_batch_operation(&state) {
        Ok(flag) => flag,
        Err(result) => return result,
    };
    let total = app_ids.len();

    for (idx, app_id) in app_ids.iter().enumerate() {
        if cancel_flag.load(Ordering::Relaxed) {
            cancelled += 1;
            results.push(cancelled_batch_item(app_id));
            emit_silently(
                &app,
                "app-manager://batch-cancelled-item",
                BatchCancelledEvent {
                    action: "upgrade",
                    app_id,
                    index: idx,
                    total,
                },
            );
            continue;
        }
        let result = upgrade_app(app_id.clone(), state.clone(), app.clone());
        match result {
            Ok(r) => {
                if r.success {
                    succeeded += 1;
                } else {
                    failed += 1;
                }
                emit_silently(
                    &app,
                    "app-manager://batch-progress",
                    BatchProgressEvent {
                        action: "upgrade",
                        app_id,
                        success: r.success,
                        error_code: r.error_code.as_deref(),
                        index: idx,
                        total,
                    },
                );
                results.push(BatchItemResult {
                    app_id: app_id.clone(),
                    app_name: String::new(),
                    success: r.success,
                    message: r.message,
                    exit_code: r.exit_code,
                });
            }
            Err(e) => {
                failed += 1;
                emit_silently(
                    &app,
                    "app-manager://batch-progress",
                    BatchProgressEvent {
                        action: "upgrade",
                        app_id,
                        success: false,
                        error_code: Some("GENERIC_ERROR"),
                        index: idx,
                        total,
                    },
                );
                results.push(BatchItemResult {
                    app_id: app_id.clone(),
                    app_name: String::new(),
                    success: false,
                    message: e.message,
                    exit_code: None,
                });
            }
        }
    }

    state.clear_batch_operation();
    emit_silently(
        &app,
        "app-manager://batch-finished",
        BatchFinishedEvent {
            action: "upgrade",
            total,
            succeeded,
            failed: failed + cancelled,
            cancelled,
        },
    );

    BatchOperationResult {
        total,
        succeeded,
        failed: failed + cancelled,
        results,
    }
}

#[tauri::command]
pub fn batch_uninstall_apps(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
    app: tauri::AppHandle,
) -> BatchOperationResult {
    let mut results = Vec::new();
    let mut succeeded = 0usize;
    let mut failed = 0usize;
    let mut cancelled = 0usize;

    let cancel_flag = match try_start_batch_operation(&state) {
        Ok(flag) => flag,
        Err(result) => return result,
    };
    let total = app_ids.len();

    for (idx, app_id) in app_ids.iter().enumerate() {
        if cancel_flag.load(Ordering::Relaxed) {
            cancelled += 1;
            results.push(cancelled_batch_item(app_id));
            emit_silently(
                &app,
                "app-manager://batch-cancelled-item",
                BatchCancelledEvent {
                    action: "uninstall",
                    app_id,
                    index: idx,
                    total,
                },
            );
            continue;
        }
        let result = uninstall_app(app_id.clone(), state.clone(), app.clone());
        match result {
            Ok(r) => {
                if r.success {
                    succeeded += 1;
                } else {
                    failed += 1;
                }
                emit_silently(
                    &app,
                    "app-manager://batch-progress",
                    BatchProgressEvent {
                        action: "uninstall",
                        app_id,
                        success: r.success,
                        error_code: r.error_code.as_deref(),
                        index: idx,
                        total,
                    },
                );
                results.push(BatchItemResult {
                    app_id: app_id.clone(),
                    app_name: String::new(),
                    success: r.success,
                    message: r.message,
                    exit_code: r.exit_code,
                });
            }
            Err(e) => {
                failed += 1;
                emit_silently(
                    &app,
                    "app-manager://batch-progress",
                    BatchProgressEvent {
                        action: "uninstall",
                        app_id,
                        success: false,
                        error_code: Some("GENERIC_ERROR"),
                        index: idx,
                        total,
                    },
                );
                results.push(BatchItemResult {
                    app_id: app_id.clone(),
                    app_name: String::new(),
                    success: false,
                    message: e.message,
                    exit_code: None,
                });
            }
        }
    }

    state.clear_batch_operation();
    emit_silently(
        &app,
        "app-manager://batch-finished",
        BatchFinishedEvent {
            action: "uninstall",
            total,
            succeeded,
            failed: failed + cancelled,
            cancelled,
        },
    );

    BatchOperationResult {
        total,
        succeeded,
        failed: failed + cancelled,
        results,
    }
}

#[tauri::command]
pub fn install_app(
    app_id: String,
    install_source: InstallSource,
    state: tauri::State<'_, AppManagerState>,
    app: tauri::AppHandle,
) -> AppResult<OperationResult> {
    let _guard = match state.try_lock_operation(&app_id) {
        Some(guard) => guard,
        None => return Ok(locked_operation_result()),
    };

    let result = if is_macos() {
        macos::install_app(app_id.clone(), install_source, state.clone())
    } else if is_windows() {
        windows::install_app(app_id.clone(), install_source, state.clone())
    } else if is_linux() {
        linux::install_app(app_id.clone(), install_source, state.clone())
    } else {
        Err("Unsupported platform".into())
    };

    let _ = app;
    result.map_err(|e| AppError::internal(format!("install_app: {e}")))
}

#[tauri::command]
pub fn cancel_batch_operation(state: tauri::State<'_, AppManagerState>) -> bool {
    state.cancel_batch_operation()
}

const UPDATE_CACHE_TTL_MS: u64 = 5 * 60 * 1000;

#[tauri::command]
pub async fn check_all_app_updates(
    force_refresh: Option<bool>,
    app: tauri::AppHandle,
) -> AppResult<Vec<UpdateInfo>> {
    let force = force_refresh.unwrap_or(false);
    let state: tauri::State<'_, AppManagerState> = app.state();

    if !force {
        let last = state.get_last_update_check_time();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        if last != 0 && now.saturating_sub(last) < UPDATE_CACHE_TTL_MS {
            return Ok(state.get_cached_updates());
        }
    }

    if !is_macos() {
        state.cache_updates(Vec::new());
        return Ok(Vec::new());
    }

    let apps = {
        let guard = state.apps.lock().unwrap_or_else(|e| e.into_inner());
        guard.clone()
    };

    let registry = sources::SourceRegistry::default_macos();
    let updates = registry.check_all(&apps).await;
    state.cache_updates(updates.clone());
    Ok(updates)
}

#[tauri::command]
pub async fn open_in_mac_app_store(adam_id: String) -> AppResult<()> {
    if !is_macos() {
        return Err(AppError::unsupported("SU_MAS_OPEN_FAIL: not macOS"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        sources::mac_app_store::open_in_mac_app_store(&adam_id)
    })
    .await
    .map_err(|e| AppError::internal(format!("open_in_mac_app_store: {e}")))?
    .map_err(AppError::internal)
}

#[tauri::command]
pub async fn open_in_mac_app_store_updates() -> AppResult<()> {
    if !is_macos() {
        return Err(AppError::unsupported("SU_MAS_OPEN_FAIL: not macOS"));
    }
    tauri::async_runtime::spawn_blocking(sources::mac_app_store::open_mac_app_store_updates)
        .await
        .map_err(|e| AppError::internal(format!("open_in_mac_app_store_updates: {e}")))?
        .map_err(AppError::internal)
}

#[tauri::command]
pub async fn install_app_update(update: UpdateInfo, app: tauri::AppHandle) -> AppResult<()> {
    if !is_macos() {
        return Err(AppError::unsupported(
            "SU_PLATFORM_UNSUPPORTED: only macOS supports in-place updates",
        ));
    }

    let state: tauri::State<'_, AppManagerState> = app.state();

    let install_path = {
        let apps = state.apps.lock().unwrap_or_else(|e| e.into_inner());
        apps.iter()
            .find(|a| a.app_id == update.app_id)
            .map(|a| a.install_path.clone())
    };
    let install_path = install_path.ok_or_else(|| {
        AppError::not_found("SU_APP_NOT_FOUND: not in cached scan; run scan first")
    })?;

    let guard = state
        .try_lock_operation(&update.app_id)
        .ok_or_else(|| AppError::internal("LOCKED"))?;

    let handle = Arc::new(InstallHandle::new());
    {
        let mut map = state
            .install_state
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        map.insert(update.app_id.clone(), handle.clone());
    }

    let app_id = update.app_id.clone();
    let app_handle = app.clone();
    let install_state = state.install_state.clone();
    tauri::async_runtime::spawn(async move {
        let _guard = guard;
        install_update(app_handle.clone(), update, install_path, handle).await;
        let mut map = install_state.lock().unwrap_or_else(|e| e.into_inner());
        map.remove(&app_id);
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_app_update(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> AppResult<()> {
    let handle = {
        let map = state
            .install_state
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        map.get(&app_id).cloned()
    };
    if let Some(h) = handle {
        h.cancel.notify_waiters();
    }
    Ok(())
}

#[tauri::command]
pub async fn confirm_developer_id_change(
    app_id: String,
    approved: bool,
    app: tauri::AppHandle,
) -> AppResult<()> {
    let state: tauri::State<'_, AppManagerState> = app.state();
    let handle = {
        let map = state
            .install_state
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        map.get(&app_id).cloned()
    };
    let handle =
        handle.ok_or_else(|| AppError::not_found("SU_NOT_INSTALLING: no install in progress"))?;

    let mut slot = handle.dev_id_decision.lock().await;
    match slot.take() {
        Some(tx) => {
            let _ = tx.send(approved);
            Ok(())
        }
        None => Err(AppError::internal(
            "SU_NOT_AWAITING_CONFIRM: orchestrator is not waiting for a decision",
        )),
    }
}
