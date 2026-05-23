use super::state::{CheckTicket, InFlightCheckResult, UpdaterCache};
use super::types::{
    AppUpdateDownloadEvent, AppUpdateInfo, AppUpdateInstallResult, APP_UPDATER_DOWNLOAD_EVENT,
};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_updater::{Update, Updater, UpdaterExt};

fn updater_error(context: &str, error: impl std::fmt::Display) -> String {
    format!("{context}: {error}")
}

#[tauri::command]
pub async fn check_for_app_update<R: Runtime>(
    app: AppHandle<R>,
    cache: tauri::State<'_, UpdaterCache>,
) -> Result<AppUpdateInfo, String> {
    let current_version = app.package_info().version.to_string();

    match cache.begin_check() {
        CheckTicket::Leader(leader) => {
            // Single-flight: this caller performs the real HTTP work; other
            // concurrent callers will subscribe to the same result via the
            // Follower path below (#050).
            let check_result: Result<Option<Update>, String> = async {
                let updater: Updater = app
                    .updater()
                    .map_err(|error| updater_error("failed to build updater", error))?;
                updater
                    .check()
                    .await
                    .map_err(|error| updater_error("failed to check for updates", error))
            }
            .await;

            let info_for_caller: AppUpdateInfo;
            let in_flight_payload: InFlightCheckResult;
            let return_value: Result<AppUpdateInfo, String>;

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

            // Store the Update handle (if any) so a follow-up install can skip
            // a redundant manifest fetch. On error we explicitly clear pending
            // so a previous handle from an earlier successful check doesn't
            // mask this failure.
            match check_result {
                Ok(opt) => cache.store(opt),
                Err(_) => cache.store(None),
            }

            cache.finish_check(leader, in_flight_payload);
            return_value
        }
        CheckTicket::Follower(mut rx) => {
            // Wait for the leader's published result, then read it from the
            // watch channel without doing any additional HTTP work.
            if rx.changed().await.is_err() {
                // Sender dropped without publishing — should not happen, but
                // fall back to a one-shot check to keep the UI responsive.
                let updater = app
                    .updater()
                    .map_err(|error| updater_error("failed to build updater", error))?;
                let update = updater
                    .check()
                    .await
                    .map_err(|error| updater_error("failed to check for updates", error))?;
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
                None => Err("update check finished without publishing a result".to_string()),
            }
        }
    }
}

#[tauri::command]
pub async fn download_and_install_app_update<R: Runtime>(
    app: AppHandle<R>,
    cache: tauri::State<'_, UpdaterCache>,
) -> Result<AppUpdateInstallResult, String> {
    let update: Update = match cache.take() {
        Some(update) => update,
        None => {
            // Fallback for callers that skip the explicit check step — keeps
            // the command usable on its own without forcing a stale manifest.
            let updater: Updater = app
                .updater()
                .map_err(|error| updater_error("failed to build updater", error))?;
            updater
                .check()
                .await
                .map_err(|error| {
                    updater_error("failed to check updates before install", error)
                })?
                .ok_or_else(|| "No update is currently available".to_string())?
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

                // Defensive (#049): saturating add + cap to declared total so
                // chunk-retry or upstream double-counting cannot wrap or push
                // the bar past 100%.
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

        // Race the install against an explicit cancel notification (#052).
        // `biased` lets cancel win when both are ready in the same poll.
        tokio::select! {
            biased;
            _ = cancel_signal.notified() => DownloadOutcome::Cancelled,
            install_result = install_future.as_mut() => match install_result {
                Ok(()) => DownloadOutcome::Success,
                Err(error) => {
                    DownloadOutcome::Failed(updater_error("failed to download and install update", &error))
                }
            },
        }
        // `install_future` is dropped at end of block, releasing the borrow
        // on `update` so the outer code can re-store it in the cache.
    };

    match outcome {
        DownloadOutcome::Success => Ok(AppUpdateInstallResult {
            installed: true,
            requires_restart: true,
        }),
        DownloadOutcome::Cancelled => {
            let _ = app.emit(APP_UPDATER_DOWNLOAD_EVENT, AppUpdateDownloadEvent::Cancelled);
            // Restore (#051): preserve the Update handle so the user can
            // retry the install without paying for another manifest fetch.
            cache.store(Some(update));
            Err("update download cancelled".to_string())
        }
        DownloadOutcome::Failed(message) => {
            let _ = app.emit(
                APP_UPDATER_DOWNLOAD_EVENT,
                AppUpdateDownloadEvent::Failed {
                    error: message.clone(),
                },
            );
            cache.store(Some(update));
            Err(message)
        }
    }
}

enum DownloadOutcome {
    Success,
    Cancelled,
    Failed(String),
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
