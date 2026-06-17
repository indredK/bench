use super::installer::orchestrator::{install_update, InstallHandle};
use super::state::AppManagerState;
use super::types::{
    BatchInstallItem, BatchItemResult, BatchOperationResult, InstallSource, OperationResult,
    ScanResult, UpdateInfo,
};
use super::{empty_scan_result, linux, locked_operation_result, macos, sources, windows};
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
    state.start_batch_operation().map_err(|_| BatchOperationResult {
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

        // Always cache: an empty scan after the user removed every managed app
        // must replace the prior cache so subsequent update checks don't query
        // for apps that no longer exist.
        state.cache_scan_result(result.clone());
        result
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_app_icon_base64(install_path: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if is_macos() {
            Ok(macos::get_app_icon_base64(&install_path).ok())
        } else {
            Ok(None)
        }
    })
    .await
    .map_err(|e| e.to_string())?
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
pub async fn check_managed_app_updates(
    app_ids: Vec<String>,
    app: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppManagerState> = app.state();
        state.mark_update_check();
        if is_macos() {
            macos::check_updates(app_ids, state)
        } else if is_windows() {
            windows::check_updates(app_ids, state)
        } else if is_linux() {
            linux::check_updates(app_ids, state)
        } else {
            Ok(vec![])
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn upgrade_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    if !state.acquire_op_lock(&app_id) {
        return Ok(locked_operation_result());
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
        return Ok(locked_operation_result());
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
        let result = upgrade_app(app_id.clone(), state.clone());
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
                    message: e,
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
        let result = uninstall_app(app_id.clone(), state.clone());
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
                    message: e,
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
pub async fn refresh_app_updates(
    app_ids: Vec<String>,
    app: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    check_managed_app_updates(app_ids, app).await
}

#[tauri::command]
pub fn install_app(
    app_id: String,
    install_source: InstallSource,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    if !state.acquire_op_lock(&app_id) {
        return Ok(locked_operation_result());
    }

    let result = if is_macos() {
        macos::install_app(app_id.clone(), install_source, state.clone())
    } else if is_windows() {
        windows::install_app(app_id.clone(), install_source, state.clone())
    } else if is_linux() {
        linux::install_app(app_id.clone(), install_source, state.clone())
    } else {
        Err("Unsupported platform".into())
    };

    state.release_op_lock(&app_id);
    result
}

#[tauri::command]
pub fn batch_install_apps(
    items: Vec<BatchInstallItem>,
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
    let total = items.len();

    for (idx, item) in items.iter().enumerate() {
        if cancel_flag.load(Ordering::Relaxed) {
            cancelled += 1;
            results.push(cancelled_batch_item(&item.app_id));
            emit_silently(
                &app,
                "app-manager://batch-cancelled-item",
                BatchCancelledEvent {
                    action: "install",
                    app_id: &item.app_id,
                    index: idx,
                    total,
                },
            );
            continue;
        }
        let result = install_app(
            item.app_id.clone(),
            item.install_source.clone(),
            state.clone(),
        );
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
                        action: "install",
                        app_id: &item.app_id,
                        success: r.success,
                        error_code: r.error_code.as_deref(),
                        index: idx,
                        total,
                    },
                );
                results.push(BatchItemResult {
                    app_id: item.app_id.clone(),
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
                        action: "install",
                        app_id: &item.app_id,
                        success: false,
                        error_code: Some("GENERIC_ERROR"),
                        index: idx,
                        total,
                    },
                );
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

    state.clear_batch_operation();
    emit_silently(
        &app,
        "app-manager://batch-finished",
        BatchFinishedEvent {
            action: "install",
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
pub fn cancel_batch_operation(state: tauri::State<'_, AppManagerState>) -> bool {
    state.cancel_batch_operation()
}

/// Cache TTL for `check_all_app_updates`: 5 minutes.
/// A second invocation within this window returns the cached list instead of
/// re-scanning, matching what's promised in the planning doc (AC-2.2).
const UPDATE_CACHE_TTL_MS: u64 = 5 * 60 * 1000;

#[tauri::command]
pub async fn check_all_app_updates(
    force_refresh: Option<bool>,
    app: tauri::AppHandle,
) -> Result<Vec<UpdateInfo>, String> {
    let force = force_refresh.unwrap_or(false);
    let state: tauri::State<'_, AppManagerState> = app.state();

    // Honor cache TTL unless caller asked for a refresh.
    if !force {
        let last = *state
            .last_update_check_time
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        if last != 0 && now.saturating_sub(last) < UPDATE_CACHE_TTL_MS {
            return Ok(state.get_cached_updates());
        }
    }

    if !is_macos() {
        // v1.0 ships macOS only — Windows/Linux just return an empty list.
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
pub async fn open_in_mac_app_store(adam_id: String) -> Result<(), String> {
    if !is_macos() {
        return Err("SU_MAS_OPEN_FAIL: not macOS".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        sources::mac_app_store::open_in_mac_app_store(&adam_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_in_mac_app_store_updates() -> Result<(), String> {
    if !is_macos() {
        return Err("SU_MAS_OPEN_FAIL: not macOS".into());
    }
    tauri::async_runtime::spawn_blocking(sources::mac_app_store::open_mac_app_store_updates)
        .await
        .map_err(|e| e.to_string())?
}

/// v1.2: kick off an in-place install of an update. Returns immediately; the
/// orchestrator emits `app-update-install:progress` and `app-update-install:finished`
/// events as it runs.
#[tauri::command]
pub async fn install_app_update(update: UpdateInfo, app: tauri::AppHandle) -> Result<(), String> {
    if !is_macos() {
        return Err("SU_PLATFORM_UNSUPPORTED: only macOS supports in-place updates".into());
    }

    let state: tauri::State<'_, AppManagerState> = app.state();

    let install_path = {
        let apps = state.apps.lock().unwrap_or_else(|e| e.into_inner());
        apps.iter()
            .find(|a| a.app_id == update.app_id)
            .map(|a| a.install_path.clone())
    };
    let install_path = install_path
        .ok_or_else(|| "SU_APP_NOT_FOUND: not in cached scan; run scan first".to_string())?;

    if !state.acquire_op_lock(&update.app_id) {
        return Err("LOCKED".to_string());
    }

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
    tauri::async_runtime::spawn(async move {
        install_update(app_handle.clone(), update, install_path, handle).await;
        let state: tauri::State<'_, AppManagerState> = app_handle.state();
        state.release_op_lock(&app_id);
        let mut map = state
            .install_state
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        map.remove(&app_id);
    });

    Ok(())
}

/// Cancel an in-flight install. Returns Ok even when there's no install in
/// progress so the frontend can call this idempotently.
#[tauri::command]
pub fn cancel_app_update(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<(), String> {
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

/// Frontend's response to the `DeveloperIdChanged` phase. `approved=true`
/// resumes the install; `false` rejects it and the orchestrator fails with
/// `SU_DEV_ID_DENIED`.
#[tauri::command]
pub async fn confirm_developer_id_change(
    app_id: String,
    approved: bool,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let state: tauri::State<'_, AppManagerState> = app.state();
    let handle = {
        let map = state
            .install_state
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        map.get(&app_id).cloned()
    };
    let handle = handle.ok_or_else(|| "SU_NOT_INSTALLING: no install in progress".to_string())?;

    let mut slot = handle.dev_id_decision.lock().await;
    match slot.take() {
        Some(tx) => {
            let _ = tx.send(approved);
            Ok(())
        }
        None => Err("SU_NOT_AWAITING_CONFIRM: orchestrator is not waiting for a decision".into()),
    }
}
