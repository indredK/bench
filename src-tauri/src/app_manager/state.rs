use super::installer::orchestrator::InstallHandle;
use super::types::{AppInfo, ScanResult, UpdateInfo, UpdateScanReport};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Clone, Default)]
pub struct UpdateCacheState {
    pub report: UpdateScanReport,
}

#[derive(Clone)]
pub struct AppManagerState {
    pub apps: Arc<Mutex<Vec<AppInfo>>>,
    /// Set of app_ids currently undergoing an operation (upgrade/uninstall)
    pub in_progress: Arc<Mutex<HashSet<String>>>,
    /// Cache of the last scan result
    pub cached_result: Arc<Mutex<Option<ScanResult>>>,
    /// Timestamp in ms of last scan
    pub last_scan_time: Arc<Mutex<u64>>,
    pub inventory_revision: Arc<AtomicU64>,
    pub scan_gate: Arc<Mutex<()>>,
    pub scan_cancel: Arc<AtomicBool>,
    /// Cached list of discovered updates plus the timestamp of that cache.
    pub update_cache: Arc<Mutex<UpdateCacheState>>,
    /// Single-flight gate for update discovery. Followers subscribe to the
    /// active watch channel and reuse the canonical report when it completes.
    pub update_flight: Arc<Mutex<Option<tokio::sync::watch::Sender<bool>>>>,
    /// Cancellation flag for the currently running batch operation (if any).
    pub batch_cancel: Arc<Mutex<Option<Arc<AtomicBool>>>>,
    /// Per-app-id orchestrator handles for in-flight `install_app_update`
    /// calls. Removed when the install ends (success or failure).
    pub install_state: Arc<Mutex<HashMap<String, Arc<InstallHandle>>>>,
}

pub struct OperationGuard {
    state: AppManagerState,
    app_id: String,
}

impl Drop for OperationGuard {
    fn drop(&mut self) {
        self.state.release_op_lock(&self.app_id);
    }
}

impl AppManagerState {
    pub fn new() -> Self {
        Self {
            apps: Arc::new(Mutex::new(Vec::new())),
            in_progress: Arc::new(Mutex::new(HashSet::new())),
            cached_result: Arc::new(Mutex::new(None)),
            last_scan_time: Arc::new(Mutex::new(0)),
            inventory_revision: Arc::new(AtomicU64::new(0)),
            scan_gate: Arc::new(Mutex::new(())),
            scan_cancel: Arc::new(AtomicBool::new(false)),
            update_cache: Arc::new(Mutex::new(UpdateCacheState::default())),
            update_flight: Arc::new(Mutex::new(None)),
            batch_cancel: Arc::new(Mutex::new(None)),
            install_state: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Replace the cached updates list with the result of a fresh scan and
    /// stamp the check time in one operation.
    pub fn cache_update_report(&self, mut report: UpdateScanReport) -> UpdateScanReport {
        report.checked_at = current_unix_millis();
        let mut guard = self.update_cache.lock().unwrap_or_else(|e| e.into_inner());
        guard.report = report.clone();
        report
    }

    /// Snapshot of the cached updates list.
    pub fn get_cached_update_report(&self) -> UpdateScanReport {
        self.update_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .report
            .clone()
    }

    pub fn get_last_update_check_time(&self) -> u64 {
        self.update_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .report
            .checked_at
    }

    pub fn begin_update_check(&self) -> (bool, tokio::sync::watch::Receiver<bool>) {
        let mut guard = self.update_flight.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(sender) = guard.as_ref() {
            return (false, sender.subscribe());
        }
        let (sender, receiver) = tokio::sync::watch::channel(false);
        *guard = Some(sender);
        (true, receiver)
    }

    pub fn finish_update_check(&self) {
        let sender = self
            .update_flight
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take();
        if let Some(sender) = sender {
            let _ = sender.send(true);
        }
    }

    #[allow(dead_code)]
    pub fn refresh_apps(&self, apps: Vec<AppInfo>) {
        *self.apps.lock().unwrap_or_else(|e| e.into_inner()) = apps;
    }

    /// Try to acquire a lock on an app_id for an operation. Returns false if already locked.
    pub fn acquire_op_lock(&self, app_id: &str) -> bool {
        let mut guard = self.in_progress.lock().unwrap_or_else(|e| e.into_inner());
        guard.insert(app_id.to_string())
    }

    /// Release the operation lock on an app_id.
    pub fn release_op_lock(&self, app_id: &str) {
        let mut guard = self.in_progress.lock().unwrap_or_else(|e| e.into_inner());
        guard.remove(app_id);
    }

    pub fn try_lock_operation(&self, app_id: &str) -> Option<OperationGuard> {
        self.acquire_op_lock(app_id).then(|| OperationGuard {
            state: self.clone(),
            app_id: app_id.to_string(),
        })
    }

    /// Cache scan result and update timestamp.
    pub fn cache_scan_result(&self, mut result: ScanResult) -> ScanResult {
        let revision = self.inventory_revision.fetch_add(1, Ordering::SeqCst) + 1;
        result.revision = revision;
        *self.apps.lock().unwrap_or_else(|e| e.into_inner()) = result.apps.clone();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        *self.cached_result.lock().unwrap_or_else(|e| e.into_inner()) = Some(result.clone());
        *self
            .last_scan_time
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = now;
        result
    }

    pub fn inventory_revision(&self) -> u64 {
        self.inventory_revision.load(Ordering::Acquire)
    }

    pub fn begin_scan(&self) {
        self.scan_cancel.store(false, Ordering::Release);
    }

    pub fn cancel_scan(&self) -> bool {
        !self.scan_cancel.swap(true, Ordering::AcqRel)
    }

    pub fn scan_cancelled(&self) -> bool {
        self.scan_cancel.load(Ordering::Acquire)
    }

    pub fn find_app(&self, app_id: &str) -> Option<AppInfo> {
        self.apps
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .find(|app| app.app_id == app_id)
            .cloned()
    }

    pub fn find_cached_update(
        &self,
        update_id: &str,
        inventory_revision: u64,
    ) -> Option<UpdateInfo> {
        let cache = self.update_cache.lock().unwrap_or_else(|e| e.into_inner());
        if cache.report.inventory_revision != inventory_revision {
            return None;
        }
        cache
            .report
            .updates
            .iter()
            .find(|update| update.update_id == update_id)
            .cloned()
    }

    /// Update last update check timestamp.
    pub fn mark_update_check(&self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        self.update_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .report
            .checked_at = now;
    }

    /// Get cached scan if available.
    #[allow(dead_code)]
    pub fn get_cached_scan(&self) -> Option<ScanResult> {
        self.cached_result
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Start a new batch operation: install a fresh cancellation flag and
    /// return an Arc clone for the loop to check on each iteration.
    pub fn start_batch_operation(&self) -> Result<Arc<AtomicBool>, ()> {
        let mut guard = self.batch_cancel.lock().unwrap_or_else(|e| e.into_inner());
        if guard.is_some() {
            return Err(());
        }
        let flag = Arc::new(AtomicBool::new(false));
        *guard = Some(flag.clone());
        Ok(flag)
    }

    /// Signal cancellation on the currently running batch (no-op if idle).
    pub fn cancel_batch_operation(&self) -> bool {
        let guard = self.batch_cancel.lock().unwrap_or_else(|e| e.into_inner());
        match guard.as_ref() {
            Some(flag) => {
                flag.store(true, Ordering::Relaxed);
                true
            }
            None => false,
        }
    }

    /// Clear the cancellation flag after the batch loop finishes.
    pub fn clear_batch_operation(&self) {
        *self.batch_cancel.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression: even if the mutex is poisoned by a panic in another thread,
    /// `acquire_op_lock` / `cache_scan_result` recover the data instead of
    /// propagating the poison panic.
    #[test]
    fn state_recovers_from_poisoned_mutex() {
        use std::sync::Arc;
        use std::thread;

        let state = Arc::new(AppManagerState::new());
        let state_clone = state.clone();

        // Poison every mutex deliberately by panicking while holding each one.
        let _ = thread::spawn(move || {
            let _g1 = state_clone.apps.lock().unwrap();
            let _g2 = state_clone.in_progress.lock().unwrap();
            let _g3 = state_clone.cached_result.lock().unwrap();
            let _g4 = state_clone.last_scan_time.lock().unwrap();
            let _g5 = state_clone.update_cache.lock().unwrap();
            let _g6 = state_clone.update_flight.lock().unwrap();
            let _g7 = state_clone.batch_cancel.lock().unwrap();
            panic!("intentional poisoning");
        })
        .join();

        // None of the following should panic – they all use `unwrap_or_else(into_inner)`.
        assert!(state.acquire_op_lock("foo"));
        state.release_op_lock("foo");
        state.mark_update_check();
        let flag = state
            .start_batch_operation()
            .expect("first batch should start");
        assert!(state.cancel_batch_operation());
        assert!(flag.load(std::sync::atomic::Ordering::Relaxed));
        state.clear_batch_operation();
    }

    /// Regression: install/upgrade/uninstall paths must serialize per-app-id
    /// via `acquire_op_lock` so concurrent commands on the same app return
    /// LOCKED instead of racing the package manager.
    #[test]
    fn acquire_op_lock_is_exclusive_per_app_id() {
        let state = AppManagerState::new();
        assert!(state.acquire_op_lock("a"));
        // Re-acquiring the same id while still held is rejected.
        assert!(!state.acquire_op_lock("a"));
        // A different id is still free.
        assert!(state.acquire_op_lock("b"));
        // Releasing restores availability.
        state.release_op_lock("a");
        assert!(state.acquire_op_lock("a"));
    }

    #[test]
    fn operation_guard_releases_lock_on_drop_and_panic() {
        let state = AppManagerState::new();

        {
            let _guard = state.try_lock_operation("a").expect("guard");
            assert!(!state.acquire_op_lock("a"));
        }
        assert!(state.acquire_op_lock("a"));
        state.release_op_lock("a");

        let panic_result = std::panic::catch_unwind({
            let state = state.clone();
            move || {
                let _guard = state.try_lock_operation("panic-app").expect("guard");
                panic!("boom");
            }
        });
        assert!(panic_result.is_err());
        assert!(state.acquire_op_lock("panic-app"));
    }

    #[test]
    fn cache_updates_commits_updates_and_timestamp_together() {
        let state = AppManagerState::new();
        state.cache_update_report(UpdateScanReport::default());
        let guard = state.update_cache.lock().unwrap_or_else(|e| e.into_inner());
        assert!(guard.report.checked_at > 0);
        assert!(guard.report.updates.is_empty());
    }

    #[tokio::test]
    async fn update_check_gate_coalesces_followers() {
        let state = AppManagerState::new();
        let (leader, _) = state.begin_update_check();
        assert!(leader);
        let (leader, mut follower) = state.begin_update_check();
        assert!(!leader);
        state.finish_update_check();
        follower.changed().await.expect("completion signal");
        assert!(*follower.borrow());
        assert!(state.begin_update_check().0);
    }

    #[test]
    fn start_batch_operation_rejects_overlapping_batches() {
        let state = AppManagerState::new();
        assert!(state.start_batch_operation().is_ok());
        assert!(state.start_batch_operation().is_err());
        assert!(state.cancel_batch_operation());
        state.clear_batch_operation();
        assert!(state.start_batch_operation().is_ok());
    }

    #[test]
    fn cached_update_lookup_rejects_stale_inventory_revision() {
        let state = AppManagerState::new();
        state.cache_update_report(UpdateScanReport {
            updates: vec![UpdateInfo {
                update_id: "update-v1-demo".to_string(),
                inventory_revision: 7,
                app_id: "app-v1-demo".to_string(),
                app_name: "Demo".to_string(),
                source: crate::app_manager::types::UpdateSource::Sparkle,
                current_version: "1.0.0".to_string(),
                latest_version: "1.1.0".to_string(),
                download_url: Some("https://example.com/demo.zip".to_string()),
                adam_id: None,
                release_notes_url: None,
                release_notes_inline: None,
                size: None,
                source_meta: None,
                feed_url: None,
                ignored: false,
            }],
            providers: Vec::new(),
            checked_at: 0,
            complete: true,
            inventory_revision: 7,
        });
        assert!(state.find_cached_update("update-v1-demo", 7).is_some());
        assert!(state.find_cached_update("update-v1-demo", 6).is_none());
    }
}

fn current_unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
