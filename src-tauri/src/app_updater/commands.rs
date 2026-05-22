use super::types::{
    AppUpdateDownloadEvent, AppUpdateInfo, AppUpdateInstallResult, APP_UPDATER_DOWNLOAD_EVENT,
};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_updater::{Update, Updater, UpdaterExt};

fn updater_error(context: &str, error: impl std::fmt::Display) -> String {
    format!("{context}: {error}")
}

#[tauri::command]
pub async fn check_for_app_update<R: Runtime>(app: AppHandle<R>) -> Result<AppUpdateInfo, String> {
    let current_version = app.package_info().version.to_string();
    let updater: Updater = app
        .updater()
        .map_err(|error| updater_error("failed to build updater", error))?;
    let update: Option<Update> = updater
        .check()
        .await
        .map_err(|error| updater_error("failed to check for updates", error))?;

    Ok(match update {
        Some(update) => AppUpdateInfo {
            available: true,
            current_version,
            version: Some(update.version.to_string()),
            date: update.date.map(|value| value.to_string()),
            body: update.body,
        },
        None => AppUpdateInfo {
            available: false,
            current_version,
            version: None,
            date: None,
            body: None,
        },
    })
}

#[tauri::command]
pub async fn download_and_install_app_update<R: Runtime>(
    app: AppHandle<R>,
) -> Result<AppUpdateInstallResult, String> {
    let updater: Updater = app
        .updater()
        .map_err(|error| updater_error("failed to build updater", error))?;

    let update: Option<Update> = updater
        .check()
        .await
        .map_err(|error| updater_error("failed to re-check updates before install", error))?;

    let update: Update = update.ok_or_else(|| "No update is currently available".to_string())?;

    let progress_handle: AppHandle<R> = app.clone();
    let finished_handle: AppHandle<R> = app.clone();
    let mut download_started = false;
    let mut downloaded_bytes: u64 = 0;
    let install_future = Update::download_and_install(
        &update,
        move |chunk_length: usize, content_length: Option<u64>| {
            if !download_started {
                download_started = true;
                let _ = progress_handle.emit(
                    APP_UPDATER_DOWNLOAD_EVENT,
                    AppUpdateDownloadEvent::Started { content_length },
                );
            }

            downloaded_bytes += chunk_length as u64;
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
            let _ = finished_handle.emit(APP_UPDATER_DOWNLOAD_EVENT, AppUpdateDownloadEvent::Finished);
        },
    );
    install_future
        .await
        .map_err(|error| updater_error("failed to download and install update", error))?;

    Ok(AppUpdateInstallResult {
        installed: true,
        requires_restart: true,
    })
}

#[tauri::command]
pub fn restart_after_update<R: Runtime>(app: AppHandle<R>) {
    app.request_restart();
}

#[tauri::command]
pub fn get_current_app_version<R: Runtime>(app: AppHandle<R>) -> String {
    app.package_info().version.to_string()
}
