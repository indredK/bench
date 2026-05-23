use super::types::{AppInfo, OperationRecord, ScanResult};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

static OPERATION_HISTORY: std::sync::LazyLock<Mutex<Vec<OperationRecord>>> =
    std::sync::LazyLock::new(|| Mutex::new(Vec::new()));

pub fn record_operation(record: OperationRecord) {
    let mut history = OPERATION_HISTORY.lock().unwrap_or_else(|e| e.into_inner());
    history.push(record);
    if history.len() > 100 {
        history.remove(0);
    }
}

pub fn get_operation_history(app_id: Option<String>) -> Vec<OperationRecord> {
    let history = OPERATION_HISTORY.lock().unwrap_or_else(|e| e.into_inner());
    let all: Vec<OperationRecord> = history.clone();
    if let Some(ref id) = app_id {
        all.into_iter().filter(|r| &r.app_id == id).collect()
    } else {
        all
    }
}

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
    /// Cancellation flag for the currently running batch operation (if any).
    pub batch_cancel: Mutex<Option<Arc<AtomicBool>>>,
}

impl AppManagerState {
    pub fn new() -> Self {
        Self {
            apps: Mutex::new(Vec::new()),
            in_progress: Mutex::new(HashSet::new()),
            cached_result: Mutex::new(None),
            last_scan_time: Mutex::new(0),
            last_update_check_time: Mutex::new(0),
            batch_cancel: Mutex::new(None),
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
