use super::installer::orchestrator::InstallHandle;
use super::types::{AppInfo, ScanResult, UpdateInfo};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Clone, Default)]
pub struct UpdateCacheState {
    pub updates: Vec<UpdateInfo>,
    pub last_check_time: u64,
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
    /// Cached list of discovered updates plus the timestamp of that cache.
    pub update_cache: Arc<Mutex<UpdateCacheState>>,
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
            update_cache: Arc::new(Mutex::new(UpdateCacheState::default())),
            batch_cancel: Arc::new(Mutex::new(None)),
            install_state: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Replace the cached updates list with the result of a fresh scan and
    /// stamp the check time in one operation.
    pub fn cache_updates(&self, updates: Vec<UpdateInfo>) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let mut guard = self.update_cache.lock().unwrap_or_else(|e| e.into_inner());
        guard.updates = updates;
        guard.last_check_time = now;
    }

    /// Snapshot of the cached updates list.
    pub fn get_cached_updates(&self) -> Vec<UpdateInfo> {
        self.update_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .updates
            .clone()
    }

    pub fn get_last_update_check_time(&self) -> u64 {
        self.update_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .last_check_time
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
    pub fn cache_scan_result(&self, result: ScanResult) {
        *self.apps.lock().unwrap_or_else(|e| e.into_inner()) = result.apps.clone();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        *self.cached_result.lock().unwrap_or_else(|e| e.into_inner()) = Some(result);
        *self
            .last_scan_time
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = now;
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
            .last_check_time = now;
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
            let _g6 = state_clone.batch_cancel.lock().unwrap();
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
        state.cache_updates(vec![]);
        let guard = state.update_cache.lock().unwrap_or_else(|e| e.into_inner());
        assert!(guard.last_check_time > 0);
        assert!(guard.updates.is_empty());
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
}
