use super::types::{AppInfo, OperationRecord, ScanResult};
use std::collections::HashSet;
use std::sync::Mutex;

static OPERATION_HISTORY: std::sync::LazyLock<Mutex<Vec<OperationRecord>>> =
    std::sync::LazyLock::new(|| Mutex::new(Vec::new()));

pub fn record_operation(record: OperationRecord) {
    if let Ok(mut history) = OPERATION_HISTORY.lock() {
        history.push(record);
        if history.len() > 100 {
            history.remove(0);
        }
    }
}

pub fn get_operation_history(app_id: Option<String>) -> Vec<OperationRecord> {
    if let Ok(history) = OPERATION_HISTORY.lock() {
        let all: Vec<OperationRecord> = history.clone();
        if let Some(ref id) = app_id {
            all.into_iter().filter(|r| &r.app_id == id).collect()
        } else {
            all
        }
    } else {
        Vec::new()
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
}

impl AppManagerState {
    pub fn new() -> Self {
        Self {
            apps: Mutex::new(Vec::new()),
            in_progress: Mutex::new(HashSet::new()),
            cached_result: Mutex::new(None),
            last_scan_time: Mutex::new(0),
            last_update_check_time: Mutex::new(0),
        }
    }

    #[allow(dead_code)]
    pub fn refresh_apps(&self, apps: Vec<AppInfo>) {
        if let Ok(mut guard) = self.apps.lock() {
            *guard = apps;
        }
    }

    /// Try to acquire a lock on an app_id for an operation. Returns false if already locked.
    pub fn acquire_op_lock(&self, app_id: &str) -> bool {
        if let Ok(mut guard) = self.in_progress.lock() {
            guard.insert(app_id.to_string())
        } else {
            false
        }
    }

    /// Release the operation lock on an app_id.
    pub fn release_op_lock(&self, app_id: &str) {
        if let Ok(mut guard) = self.in_progress.lock() {
            guard.remove(app_id);
        }
    }

    /// Cache scan result and update timestamp.
    pub fn cache_scan_result(&self, result: ScanResult) {
        if let Ok(mut apps) = self.apps.lock() {
            *apps = result.apps.clone();
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        if let Ok(mut c) = self.cached_result.lock() {
            *c = Some(result);
        }
        if let Ok(mut t) = self.last_scan_time.lock() {
            *t = now;
        }
    }

    /// Update last update check timestamp.
    pub fn mark_update_check(&self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        if let Ok(mut t) = self.last_update_check_time.lock() {
            *t = now;
        }
    }

    /// Get cached scan if available.
    #[allow(dead_code)]
    pub fn get_cached_scan(&self) -> Option<ScanResult> {
        if let Ok(c) = self.cached_result.lock() {
            c.clone()
        } else {
            None
        }
    }
}
