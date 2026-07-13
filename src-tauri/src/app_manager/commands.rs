use super::installer::orchestrator::{install_update, InstallHandle};
use super::state::AppManagerState;
use super::types::{
    BatchItemResult, BatchOperationResult, InstallSource, InstallUpdateRequest, OperationResult,
    ProviderState, ProviderStatus, ScanResult, UpdateInfo, UpdateScanReport, UpdateSource,
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
            cancelled: 0,
            results: vec![BatchItemResult {
                app_id: String::new(),
                app_name: String::new(),
                success: false,
                message: "Another batch operation is already running".to_string(),
                exit_code: None,
            }],
        })
}

const MAX_BATCH_ITEMS: usize = 100;

fn normalize_batch_ids(app_ids: Vec<String>) -> Result<Vec<String>, String> {
    let mut seen = std::collections::HashSet::new();
    let normalized: Vec<String> = app_ids
        .into_iter()
        .filter(|app_id| !app_id.trim().is_empty() && seen.insert(app_id.clone()))
        .collect();
    if normalized.len() > MAX_BATCH_ITEMS {
        return Err(format!("BATCH_LIMIT_EXCEEDED:{MAX_BATCH_ITEMS}"));
    }
    Ok(normalized)
}

fn batch_task_failure(total: usize, app_ids: Vec<String>, message: String) -> BatchOperationResult {
    BatchOperationResult {
        total,
        succeeded: 0,
        failed: total.max(1),
        cancelled: 0,
        results: app_ids
            .into_iter()
            .map(|app_id| BatchItemResult {
                app_id,
                app_name: String::new(),
                success: false,
                message: message.clone(),
                exit_code: None,
            })
            .collect(),
    }
}

#[tauri::command]
pub async fn scan_installed_apps(app: tauri::AppHandle) -> AppResult<ScanResult> {
    let app_clone = app.clone();
    let task_id = uuid::Uuid::new_v4().to_string();
    let observed_revision = {
        let state: tauri::State<'_, AppManagerState> = app.state();
        state.inventory_revision()
    };
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppManagerState> = app_clone.state();
        let _scan_guard = state.scan_gate.lock().unwrap_or_else(|e| e.into_inner());
        if state.inventory_revision() > observed_revision {
            if let Some(snapshot) = state.get_cached_scan() {
                return snapshot;
            }
        }
        let previous_snapshot = state.get_cached_scan();
        state.begin_scan();
        let result = if is_macos() {
            macos::scan_installed_apps(
                state.clone(),
                &app_clone,
                &task_id,
                state.scan_cancel.as_ref(),
            )
        } else if is_windows() {
            windows::scan_installed_apps(state.scan_cancel.as_ref())
        } else if is_linux() {
            linux::scan_installed_apps()
        } else {
            empty_scan_result()
        };

        if state.scan_cancelled() {
            previous_snapshot.unwrap_or(result)
        } else {
            state.cache_scan_result(result)
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("scan_installed_apps: {e}")))
}

#[tauri::command]
pub fn cancel_app_inventory_scan(state: tauri::State<'_, AppManagerState>) -> bool {
    state.cancel_scan()
}

#[tauri::command]
pub async fn get_app_icon_base64(
    app_id: String,
    app: tauri::AppHandle,
) -> AppResult<Option<String>> {
    let entry = {
        let state: tauri::State<'_, AppManagerState> = app.state();
        state
            .find_app(&app_id)
            .ok_or_else(|| AppError::not_found("APP_NOT_FOUND"))?
    };
    tauri::async_runtime::spawn_blocking(move || -> Option<String> {
        if is_macos() {
            macos::get_app_icon_base64(&entry.install_path).ok()
        } else if is_windows() {
            windows::get_app_icon_base64(&entry).ok()
        } else {
            None
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("get_app_icon_base64: {e}")))
}

#[tauri::command]
pub async fn launch_app(app_id: String, app: tauri::AppHandle) -> AppResult<()> {
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppManagerState> = app_clone.state();
        let entry = state
            .find_app(&app_id)
            .ok_or_else(|| AppError::not_found("APP_NOT_FOUND"))?;
        if !entry.allowed_actions.launch {
            return Err(AppError::unsupported("APP_NOT_LAUNCHABLE"));
        }
        let result = if is_macos() {
            macos::launch_app(entry.install_path)
        } else if is_windows() {
            windows::launch_app(&entry)
        } else if is_linux() {
            linux::launch_app(entry.install_path)
        } else {
            Err("Unsupported platform".into())
        };
        result.map_err(|e| AppError::internal(format!("launch_app: {e}")))
    })
    .await
    .map_err(|e| AppError::internal(format!("launch_app task: {e}")))?
}

#[tauri::command]
pub async fn reveal_app_in_finder(app_id: String, app: tauri::AppHandle) -> AppResult<()> {
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppManagerState> = app_clone.state();
        let entry = state
            .find_app(&app_id)
            .ok_or_else(|| AppError::not_found("APP_NOT_FOUND"))?;
        if !entry.allowed_actions.reveal {
            return Err(AppError::unsupported("APP_NOT_REVEALABLE"));
        }
        let result = if is_macos() {
            macos::reveal_app_in_finder(entry.install_path)
        } else if is_windows() {
            windows::reveal_in_explorer(entry.install_path)
        } else if is_linux() {
            linux::reveal_in_file_manager(entry.install_path)
        } else {
            Err("Unsupported platform".into())
        };
        result.map_err(|e| AppError::internal(format!("reveal_app_in_finder: {e}")))
    })
    .await
    .map_err(|e| AppError::internal(format!("reveal_app task: {e}")))?
}

#[tauri::command]
pub fn authorize_mac_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> AppResult<OperationResult> {
    if !is_macos() {
        return Err(AppError::unsupported(
            "authorize_mac_app is only available on macOS",
        ));
    }
    let app_path = state
        .find_app(&app_id)
        .map(|entry| entry.install_path)
        .ok_or_else(|| AppError::not_found("APP_NOT_FOUND"))?;
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

fn upgrade_app_blocking(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
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

    result.map_err(|e| AppError::internal(format!("upgrade_app: {e}")))
}

#[tauri::command]
pub async fn upgrade_app(app_id: String, app: tauri::AppHandle) -> AppResult<OperationResult> {
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppManagerState> = app.state();
        upgrade_app_blocking(app_id, state)
    })
    .await
    .map_err(|error| AppError::internal(format!("upgrade_app task: {error}")))?
}

fn uninstall_app_blocking(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
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

    result.map_err(|e| AppError::internal(format!("uninstall_app: {e}")))
}

#[tauri::command]
pub async fn uninstall_app(app_id: String, app: tauri::AppHandle) -> AppResult<OperationResult> {
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppManagerState> = app.state();
        uninstall_app_blocking(app_id, state)
    })
    .await
    .map_err(|error| AppError::internal(format!("uninstall_app task: {error}")))?
}

fn batch_upgrade_apps_blocking(
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
        let result = upgrade_app_blocking(app_id.clone(), state.clone());
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
            failed,
            cancelled,
        },
    );

    BatchOperationResult {
        total,
        succeeded,
        failed,
        cancelled,
        results,
    }
}

#[tauri::command]
pub async fn batch_upgrade_apps(
    app_ids: Vec<String>,
    app: tauri::AppHandle,
) -> BatchOperationResult {
    let fallback_total = app_ids.len();
    let fallback_ids = app_ids.clone();
    let join_fallback_ids = fallback_ids.clone();
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let event_app = app_clone.clone();
        let state: tauri::State<'_, AppManagerState> = app_clone.state();
        match normalize_batch_ids(app_ids) {
            Ok(ids) => batch_upgrade_apps_blocking(ids, state, event_app),
            Err(error) => batch_task_failure(fallback_total, fallback_ids.clone(), error),
        }
    })
    .await
    .unwrap_or_else(|error| {
        batch_task_failure(fallback_total, join_fallback_ids, error.to_string())
    })
}

fn batch_uninstall_apps_blocking(
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
        let result = uninstall_app_blocking(app_id.clone(), state.clone());
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
            failed,
            cancelled,
        },
    );

    BatchOperationResult {
        total,
        succeeded,
        failed,
        cancelled,
        results,
    }
}

#[tauri::command]
pub async fn batch_uninstall_apps(
    app_ids: Vec<String>,
    app: tauri::AppHandle,
) -> BatchOperationResult {
    let fallback_total = app_ids.len();
    let fallback_ids = app_ids.clone();
    let join_fallback_ids = fallback_ids.clone();
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let event_app = app_clone.clone();
        let state: tauri::State<'_, AppManagerState> = app_clone.state();
        match normalize_batch_ids(app_ids) {
            Ok(ids) => batch_uninstall_apps_blocking(ids, state, event_app),
            Err(error) => batch_task_failure(fallback_total, fallback_ids.clone(), error),
        }
    })
    .await
    .unwrap_or_else(|error| {
        batch_task_failure(fallback_total, join_fallback_ids, error.to_string())
    })
}

fn install_app_blocking(
    app_id: String,
    install_source: InstallSource,
    state: tauri::State<'_, AppManagerState>,
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

    result.map_err(|e| AppError::internal(format!("install_app: {e}")))
}

#[tauri::command]
pub async fn install_app(
    app_id: String,
    install_source: InstallSource,
    app: tauri::AppHandle,
) -> AppResult<OperationResult> {
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppManagerState> = app.state();
        install_app_blocking(app_id, install_source, state)
    })
    .await
    .map_err(|error| AppError::internal(format!("install_app task: {error}")))?
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
) -> AppResult<UpdateScanReport> {
    let force = force_refresh.unwrap_or(false);
    let state: tauri::State<'_, AppManagerState> = app.state();

    let (is_leader, mut completion) = state.begin_update_check();
    if !is_leader {
        while !*completion.borrow() {
            if completion.changed().await.is_err() {
                break;
            }
        }
        let report = state.get_cached_update_report();
        return if report.checked_at > 0 {
            Ok(report)
        } else {
            Err(AppError::internal("UPDATE_CHECK_LEADER_FAILED"))
        };
    }

    if !force {
        let last = state.get_last_update_check_time();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        if last != 0 && now.saturating_sub(last) < UPDATE_CACHE_TTL_MS {
            let report = state.get_cached_update_report();
            state.finish_update_check();
            return Ok(report);
        }
    }

    let apps = {
        let guard = state.apps.lock().unwrap_or_else(|e| e.into_inner());
        guard.clone()
    };

    let inventory_revision = state.inventory_revision();
    let report_result: AppResult<UpdateScanReport> = if is_macos() {
        let registry = sources::SourceRegistry::default_macos();
        let checked = registry.check_all(&apps).await;
        Ok(build_update_report(
            checked.updates,
            checked.providers,
            inventory_revision,
        ))
    } else if is_windows() {
        match tauri::async_runtime::spawn_blocking(move || windows::check_all_updates(&apps)).await
        {
            Ok((updates, providers)) => {
                Ok(build_update_report(updates, providers, inventory_revision))
            }
            Err(error) => Err(AppError::internal(format!(
                "check windows updates: {error}"
            ))),
        }
    } else {
        Ok(build_update_report(
            Vec::new(),
            vec![ProviderStatus {
                provider: "platform".to_string(),
                state: ProviderState::Unsupported,
                error_code: Some("UPDATE_PLATFORM_UNSUPPORTED".to_string()),
            }],
            inventory_revision,
        ))
    };
    let outcome = report_result.map(|report| state.cache_update_report(report));
    state.finish_update_check();
    outcome
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
pub async fn install_app_update(
    request: InstallUpdateRequest,
    app: tauri::AppHandle,
) -> AppResult<()> {
    if !is_macos() {
        return Err(AppError::unsupported(
            "SU_PLATFORM_UNSUPPORTED: only macOS supports in-place updates",
        ));
    }

    let state: tauri::State<'_, AppManagerState> = app.state();

    if request.inventory_revision != state.inventory_revision() {
        return Err(AppError::invalid_input("SU_STALE_INVENTORY_REVISION"));
    }
    let update = state
        .find_cached_update(&request.update_id, request.inventory_revision)
        .ok_or_else(|| AppError::not_found("SU_UPDATE_NOT_FOUND_OR_STALE"))?;
    if !matches!(
        update.source,
        UpdateSource::Sparkle | UpdateSource::Electron | UpdateSource::Squirrel
    ) {
        return Err(AppError::unsupported("SU_SOURCE_NOT_INSTALLABLE"));
    }
    let download_url = update
        .download_url
        .as_deref()
        .ok_or_else(|| AppError::invalid_input("SU_NO_DOWNLOAD_URL"))?;
    let parsed = url::Url::parse(download_url)
        .map_err(|_| AppError::invalid_input("SU_INVALID_DOWNLOAD_URL"))?;
    if parsed.scheme() != "https" {
        return Err(AppError::invalid_input("SU_HTTPS_REQUIRED"));
    }

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

fn build_update_report(
    mut updates: Vec<UpdateInfo>,
    providers: Vec<ProviderStatus>,
    inventory_revision: u64,
) -> UpdateScanReport {
    use sha2::{Digest, Sha256};

    for update in &mut updates {
        update.inventory_revision = inventory_revision;
        let canonical = format!(
            "{}|{}|{}|{}|{}",
            update.app_id,
            update.source,
            update.current_version,
            update.latest_version,
            inventory_revision
        );
        let digest = Sha256::digest(canonical.as_bytes());
        update.update_id = format!(
            "update-v1-{}",
            digest[..16]
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        );
    }
    let complete = providers.iter().all(|provider| {
        provider.state == ProviderState::Ok
            || (provider.state == ProviderState::Unsupported
                && provider.error_code.as_deref() == Some("UPDATE_PROVIDER_NOT_APPLICABLE"))
    });
    UpdateScanReport {
        updates,
        providers,
        checked_at: 0,
        complete,
        inventory_revision,
    }
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
        h.request_cancel();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn update_candidate() -> UpdateInfo {
        UpdateInfo {
            update_id: String::new(),
            inventory_revision: 0,
            app_id: "app-v1-demo".to_string(),
            app_name: "Demo".to_string(),
            source: UpdateSource::Sparkle,
            current_version: "1.0.0".to_string(),
            latest_version: "1.1.0".to_string(),
            download_url: Some("https://example.com/Demo.zip".to_string()),
            adam_id: None,
            release_notes_url: None,
            release_notes_inline: None,
            size: None,
            source_meta: None,
            feed_url: None,
            ignored: false,
        }
    }

    #[test]
    fn canonical_update_id_is_bound_to_inventory_revision() {
        let first = build_update_report(vec![update_candidate()], Vec::new(), 3);
        let second = build_update_report(vec![update_candidate()], Vec::new(), 4);
        assert_ne!(first.updates[0].update_id, second.updates[0].update_id);
        assert_eq!(first.updates[0].inventory_revision, 3);
    }

    #[test]
    fn not_applicable_update_provider_does_not_make_scan_partial() {
        let report = build_update_report(
            Vec::new(),
            vec![ProviderStatus {
                provider: "sparkle".to_string(),
                state: ProviderState::Unsupported,
                error_code: Some("UPDATE_PROVIDER_NOT_APPLICABLE".to_string()),
            }],
            1,
        );
        assert!(report.complete);
    }

    #[test]
    fn batch_input_is_deduplicated_and_bounded() {
        assert_eq!(
            normalize_batch_ids(vec!["a".into(), "a".into(), "b".into()]).unwrap(),
            vec!["a".to_string(), "b".to_string()]
        );
        let too_many = (0..=MAX_BATCH_ITEMS)
            .map(|index| format!("app-{index}"))
            .collect();
        assert!(normalize_batch_ids(too_many).is_err());
    }
}
