use super::state::{CheckTicket, InFlightCheckResult, UpdaterCache};
use super::types::{
    AppUpdateDownloadEvent, AppUpdateInfo, AppUpdateInstallResult, APP_UPDATER_DOWNLOAD_EVENT,
};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_updater::{Update, Updater, UpdaterExt};

use crate::error::{AppError, AppResult};

#[derive(Clone, Copy)]
enum UpdaterOperation {
    Check,
    Install,
}

fn updater_error(operation: UpdaterOperation, error: impl std::fmt::Display) -> AppError {
    let raw = error.to_string();
    let message = raw.to_ascii_lowercase();
    let code = if message.contains("429")
        || message.contains("rate limit")
        || message.contains("too many requests")
    {
        "UPDATER_RATE_LIMITED"
    } else if message.contains("platforms` object")
        || message.contains("platforms object")
        || message.contains("platform not found")
        || message.contains("missing required updater platforms")
    {
        "UPDATER_PLATFORM_MISSING"
    } else if message.contains("404") || message.contains("not found") {
        "UPDATER_MANIFEST_NOT_FOUND"
    } else if message.contains("release json")
        || message.contains("release metadata")
        || message.contains("deserialize")
        || message.contains("invalid release")
        || message.contains("manifest")
        || message.contains("json")
    {
        "UPDATER_MANIFEST_INVALID"
    } else if message.contains("signature")
        || message.contains("minisign")
        || message.contains("public key")
    {
        "UPDATER_SIGNATURE_INVALID"
    } else if message.contains("no space")
        || message.contains("disk full")
        || message.contains("os error 28")
    {
        "UPDATER_DISK_FULL"
    } else if message.contains("permission denied")
        || message.contains("access is denied")
        || message.contains("operation not permitted")
        || message.contains("os error 13")
    {
        "UPDATER_PERMISSION_DENIED"
    } else if message.contains("network")
        || message.contains("offline")
        || message.contains("dns")
        || message.contains("timed out")
        || message.contains("timeout")
        || message.contains("connection")
        || message.contains("request for url")
        || message.contains("tls")
    {
        "UPDATER_NETWORK_UNAVAILABLE"
    } else {
        match operation {
            UpdaterOperation::Check => "UPDATER_CHECK_FAILED",
            UpdaterOperation::Install => "UPDATER_INSTALL_FAILED",
        }
    };
    let public_message = match operation {
        UpdaterOperation::Check => "Unable to check for updates",
        UpdaterOperation::Install => "Unable to download or install the update",
    };
    AppError::new(code, public_message)
}

#[tauri::command]
pub async fn check_for_app_update<R: Runtime>(
    app: AppHandle<R>,
    cache: tauri::State<'_, UpdaterCache>,
) -> AppResult<AppUpdateInfo> {
    let current_version = app.package_info().version.to_string();

    match cache.begin_check() {
        CheckTicket::Leader(leader) => {
            let check_result: AppResult<Option<Update>> = async {
                let updater: Updater = app
                    .updater()
                    .map_err(|error| updater_error(UpdaterOperation::Check, error))?;
                updater
                    .check()
                    .await
                    .map_err(|error| updater_error(UpdaterOperation::Check, error))
            }
            .await;

            let info_for_caller: AppUpdateInfo;
            let in_flight_payload: InFlightCheckResult;
            let return_value: AppResult<AppUpdateInfo>;

            match &check_result {
                Ok(Some(update)) => {
                    info_for_caller = AppUpdateInfo {
                        available: true,
                        current_version: current_version.clone(),
                        version: Some(update.version.to_string()),
                        date: update.date.map(|value| value.to_string()),
                        body: update.body.clone(),
                    };
                    in_flight_payload = InFlightCheckResult {
                        available: true,
                        version: info_for_caller.version.clone(),
                        date: info_for_caller.date.clone(),
                        body: info_for_caller.body.clone(),
                        error: None,
                    };
                    return_value = Ok(info_for_caller.clone());
                }
                Ok(None) => {
                    info_for_caller = AppUpdateInfo {
                        available: false,
                        current_version: current_version.clone(),
                        version: None,
                        date: None,
                        body: None,
                    };
                    in_flight_payload = InFlightCheckResult {
                        available: false,
                        version: None,
                        date: None,
                        body: None,
                        error: None,
                    };
                    return_value = Ok(info_for_caller.clone());
                }
                Err(error) => {
                    in_flight_payload = InFlightCheckResult {
                        available: false,
                        version: None,
                        date: None,
                        body: None,
                        error: Some(error.clone()),
                    };
                    return_value = Err(error.clone());
                }
            }

            match check_result {
                Ok(opt) => cache.store(opt),
                Err(_) => cache.store(None),
            }

            cache.finish_check(leader, in_flight_payload);
            return_value
        }
        CheckTicket::Follower(mut rx) => {
            if rx.changed().await.is_err() {
                let updater = app
                    .updater()
                    .map_err(|error| updater_error(UpdaterOperation::Check, error))?;
                let update = updater
                    .check()
                    .await
                    .map_err(|error| updater_error(UpdaterOperation::Check, error))?;
                return Ok(match update {
                    Some(u) => AppUpdateInfo {
                        available: true,
                        current_version,
                        version: Some(u.version.to_string()),
                        date: u.date.map(|v| v.to_string()),
                        body: u.body.clone(),
                    },
                    None => AppUpdateInfo {
                        available: false,
                        current_version,
                        version: None,
                        date: None,
                        body: None,
                    },
                });
            }
            let snapshot = rx.borrow().clone();
            match snapshot {
                Some(result) => {
                    if let Some(error) = result.error {
                        Err(error)
                    } else {
                        Ok(AppUpdateInfo {
                            available: result.available,
                            current_version,
                            version: result.version,
                            date: result.date,
                            body: result.body,
                        })
                    }
                }
                None => Err(AppError::internal(
                    "update check finished without publishing a result",
                )),
            }
        }
    }
}

#[tauri::command]
pub async fn download_and_install_app_update<R: Runtime>(
    app: AppHandle<R>,
    cache: tauri::State<'_, UpdaterCache>,
) -> AppResult<AppUpdateInstallResult> {
    let update: Update = match cache.take() {
        Some(update) => update,
        None => {
            let updater: Updater = app
                .updater()
                .map_err(|error| updater_error(UpdaterOperation::Install, error))?;
            updater
                .check()
                .await
                .map_err(|error| updater_error(UpdaterOperation::Install, error))?
                .ok_or_else(|| {
                    AppError::new(
                        "UPDATER_UPDATE_NOT_AVAILABLE",
                        "No update is currently available",
                    )
                })?
        }
    };

    let progress_handle: AppHandle<R> = app.clone();
    let finished_handle: AppHandle<R> = app.clone();
    let mut download_started = false;
    let mut downloaded_bytes: u64 = 0;
    let cancel_signal = cache.cancel_signal();

    let outcome = {
        let mut install_future = Box::pin(Update::download_and_install(
            &update,
            move |chunk_length: usize, content_length: Option<u64>| {
                if !download_started {
                    download_started = true;
                    downloaded_bytes = 0;
                    let _ = progress_handle.emit(
                        APP_UPDATER_DOWNLOAD_EVENT,
                        AppUpdateDownloadEvent::Started { content_length },
                    );
                }

                let raw = downloaded_bytes.saturating_add(chunk_length as u64);
                downloaded_bytes = match content_length {
                    Some(total) => raw.min(total),
                    None => raw,
                };

                let _ = progress_handle.emit(
                    APP_UPDATER_DOWNLOAD_EVENT,
                    AppUpdateDownloadEvent::Progress {
                        chunk_length,
                        downloaded_bytes,
                        content_length,
                    },
                );
            },
            move || {
                let _ = finished_handle
                    .emit(APP_UPDATER_DOWNLOAD_EVENT, AppUpdateDownloadEvent::Finished);
            },
        ));

        tokio::select! {
            biased;
            _ = cancel_signal.notified() => DownloadOutcome::Cancelled,
            install_result = install_future.as_mut() => match install_result {
                Ok(()) => DownloadOutcome::Success,
                Err(error) => {
                    DownloadOutcome::Failed(updater_error(UpdaterOperation::Install, &error))
                }
            },
        }
    };

    match outcome {
        DownloadOutcome::Success => Ok(AppUpdateInstallResult {
            installed: true,
            requires_restart: true,
        }),
        DownloadOutcome::Cancelled => {
            let _ = app.emit(
                APP_UPDATER_DOWNLOAD_EVENT,
                AppUpdateDownloadEvent::Cancelled,
            );
            cache.store(Some(update));
            Err(AppError::new(
                "UPDATER_CANCELLED",
                "Update download was cancelled",
            ))
        }
        DownloadOutcome::Failed(error) => {
            let _ = app.emit(
                APP_UPDATER_DOWNLOAD_EVENT,
                AppUpdateDownloadEvent::Failed {
                    error: error.message.clone(),
                },
            );
            cache.store(Some(update));
            Err(error)
        }
    }
}

enum DownloadOutcome {
    Success,
    Cancelled,
    Failed(AppError),
}

#[tauri::command]
pub fn cancel_app_update_download(cache: tauri::State<'_, UpdaterCache>) {
    cache.signal_cancel();
}

#[tauri::command]
pub fn restart_after_update<R: Runtime>(app: AppHandle<R>) {
    app.request_restart();
}

#[tauri::command]
pub fn get_current_app_version<R: Runtime>(app: AppHandle<R>) -> String {
    app.package_info().version.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_manifest_and_platform_failures() {
        assert_eq!(
            updater_error(
                UpdaterOperation::Check,
                "failed to deserialize release JSON"
            )
            .code,
            "UPDATER_MANIFEST_INVALID"
        );
        assert_eq!(
            updater_error(
                UpdaterOperation::Check,
                "target was not found in the response `platforms` object"
            )
            .code,
            "UPDATER_PLATFORM_MISSING"
        );
        assert_eq!(
            updater_error(UpdaterOperation::Check, "HTTP status 404").code,
            "UPDATER_MANIFEST_NOT_FOUND"
        );
    }

    #[test]
    fn classifies_network_signature_disk_and_permission_failures() {
        assert_eq!(
            updater_error(UpdaterOperation::Check, "network is offline").code,
            "UPDATER_NETWORK_UNAVAILABLE"
        );
        assert_eq!(
            updater_error(UpdaterOperation::Install, "minisign verification failed").code,
            "UPDATER_SIGNATURE_INVALID"
        );
        assert_eq!(
            updater_error(
                UpdaterOperation::Install,
                "No space left on device (os error 28)"
            )
            .code,
            "UPDATER_DISK_FULL"
        );
        assert_eq!(
            updater_error(UpdaterOperation::Install, "Permission denied (os error 13)").code,
            "UPDATER_PERMISSION_DENIED"
        );
    }

    #[test]
    fn does_not_expose_raw_updater_details() {
        let error = updater_error(
            UpdaterOperation::Check,
            "request failed for https://example.invalid/latest.json?token=secret",
        );
        assert!(!error.message.contains("secret"));
        assert!(!error.message.contains("https://"));
    }
}
