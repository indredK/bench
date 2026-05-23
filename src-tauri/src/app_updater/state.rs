use std::sync::Mutex;
use tauri_plugin_updater::Update;

/// Caches the `Update` handle returned by the most recent `check_for_app_update`
/// so `download_and_install_app_update` can reuse it instead of issuing a second
/// HTTP request to the update manifest. Reusing the cached handle also prevents
/// a race where the manifest publishes a new version between the user's
/// "check" and "install" clicks and the downloaded version diverges from the
/// version shown in the UI.
#[derive(Default)]
pub struct UpdaterCache {
    pending: Mutex<Option<Update>>,
}

impl UpdaterCache {
    pub fn store(&self, update: Option<Update>) {
        let mut guard = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        *guard = update;
    }

    pub fn take(&self) -> Option<Update> {
        let mut guard = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        guard.take()
    }
}
