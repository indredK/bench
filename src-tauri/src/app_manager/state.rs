use super::types::{AppInfo, OperationRecord, ScanResult, UpdateInfo};
use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

const OPERATION_HISTORY_CAP: usize = 100;

pub struct AppManagerState {
    pub apps: Mutex<Vec<AppInfo>>,
    /// Set of app_ids currently undergoing an operation (upgrade/uninstall)
    pub in_progress: Mutex<HashSet<String>>,
    /// Cache of the last scan result
    pub cached_result: Mutex<Option<ScanResult>>,
    /// Timestamp in ms of last scan
    pub last_scan_time: Mutex<u64>,
    /// Timestamp in ms of last update check
    pub last_update_check_time: Mutex<u64>,
    /// Cached list of discovered updates from the multi-source updater.
    pub updates: Mutex<Vec<UpdateInfo>>,
    /// Cancellation flag for the currently running batch operation (if any).
    pub batch_cancel: Mutex<Option<Arc<AtomicBool>>>,
    /// Recent operation records, capped at OPERATION_HISTORY_CAP entries.
    /// VecDeque keeps push_back / pop_front at O(1) so batch operations
    /// stay O(ops) instead of O(ops²).
    pub operation_history: Mutex<VecDeque<OperationRecord>>,
}

impl AppManagerState {
    pub fn new() -> Self {
        Self {
            apps: Mutex::new(Vec::new()),
            in_progress: Mutex::new(HashSet::new()),
            cached_result: Mutex::new(None),
            last_scan_time: Mutex::new(0),
            last_update_check_time: Mutex::new(0),
            updates: Mutex::new(Vec::new()),
            batch_cancel: Mutex::new(None),
            operation_history: Mutex::new(VecDeque::with_capacity(OPERATION_HISTORY_CAP + 1)),
        }
    }

    /// Replace the cached updates list with the result of a fresh scan and
    /// stamp the check time in one operation.
    pub fn cache_updates(&self, updates: Vec<UpdateInfo>) {
        *self.updates.lock().unwrap_or_else(|e| e.into_inner()) = updates;
        self.mark_update_check();
    }

    /// Snapshot of the cached updates list.
    pub fn get_cached_updates(&self) -> Vec<UpdateInfo> {
        self.updates
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    #[allow(dead_code)]
    pub fn refresh_apps(&self, apps: Vec<AppInfo>) {
        *self.apps.lock().unwrap_or_else(|e| e.into_inner()) = apps;
    }

    pub fn record_operation(&self, record: OperationRecord) {
        let mut history = self
            .operation_history
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if history.len() >= OPERATION_HISTORY_CAP {
            history.pop_front();
        }
        history.push_back(record);
    }

    pub fn get_operation_history(&self, app_id: Option<String>) -> Vec<OperationRecord> {
        let history = self
            .operation_history
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        match app_id {
            Some(id) => history.iter().filter(|r| r.app_id == id).cloned().collect(),
            None => history.iter().cloned().collect(),
        }
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

    /// Cache scan result and update timestamp.
    pub fn cache_scan_result(&self, result: ScanResult) {
        *self.apps.lock().unwrap_or_else(|e| e.into_inner()) = result.apps.clone();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        *self
            .cached_result
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = Some(result);
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
        *self
            .last_update_check_time
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = now;
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
    pub fn start_batch_operation(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        *self.batch_cancel.lock().unwrap_or_else(|e| e.into_inner()) = Some(flag.clone());
        flag
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
    use crate::app_manager::types::OperationRecord;

    fn record(app_id: &str) -> OperationRecord {
        OperationRecord::new("upgrade", app_id, app_id, true, "", None)
    }

    #[test]
    fn operation_history_caps_at_one_hundred_with_fifo_eviction() {
        let state = AppManagerState::new();
        for i in 0..150 {
            state.record_operation(record(&format!("app-{i}")));
        }
        let history = state.get_operation_history(None);
        assert_eq!(history.len(), OPERATION_HISTORY_CAP);
        // Earliest 50 should have been evicted; oldest remaining is app-50.
        assert_eq!(history.first().unwrap().app_id, "app-50");
        assert_eq!(history.last().unwrap().app_id, "app-149");
    }

    #[test]
    fn operation_history_filters_by_app_id() {
        let state = AppManagerState::new();
        state.record_operation(record("alpha"));
        state.record_operation(record("beta"));
        state.record_operation(record("alpha"));

        let alpha_only = state.get_operation_history(Some("alpha".into()));
        assert_eq!(alpha_only.len(), 2);
        assert!(alpha_only.iter().all(|r| r.app_id == "alpha"));
    }

    #[test]
    fn operation_history_is_isolated_per_state_instance() {
        let state_a = AppManagerState::new();
        let state_b = AppManagerState::new();
        state_a.record_operation(record("app-a"));
        assert_eq!(state_a.get_operation_history(None).len(), 1);
        assert_eq!(state_b.get_operation_history(None).len(), 0);
    }

    /// Regression: even if the mutex is poisoned by a panic in another thread,
    /// `record_operation` / `acquire_op_lock` / `cache_scan_result` recover the
    /// data instead of propagating the poison panic.
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
            let _g5 = state_clone.last_update_check_time.lock().unwrap();
            let _g6 = state_clone.batch_cancel.lock().unwrap();
            let _g7 = state_clone.operation_history.lock().unwrap();
            panic!("intentional poisoning");
        })
        .join();

        // None of the following should panic – they all use `unwrap_or_else(into_inner)`.
        assert!(state.acquire_op_lock("foo"));
        state.release_op_lock("foo");
        state.record_operation(record("post-panic"));
        let history = state.get_operation_history(None);
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].app_id, "post-panic");

        state.mark_update_check();
        let flag = state.start_batch_operation();
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
}
