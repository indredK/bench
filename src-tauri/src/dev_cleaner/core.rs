use super::types::{CleanupResult, ProjectInfo, ScanAbortFlag, ScanResult};
use std::sync::atomic::Ordering;

#[tauri::command]
pub fn stop_scan(flag: tauri::State<ScanAbortFlag>) {
    flag.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn scan_dev_projects(
    root_path: String,
    flag: tauri::State<'_, ScanAbortFlag>,
) -> Result<ScanResult, String> {
    flag.store(false, Ordering::SeqCst);
    super::scanner::scan_dev_projects(root_path, flag.inner().clone()).await
}

#[tauri::command]
pub fn cleanup_projects(
    projects: Vec<ProjectInfo>,
    flag: tauri::State<'_, ScanAbortFlag>,
) -> Result<CleanupResult, String> {
    // Reset the shared abort flag at the start of each cleanup so that a
    // prior `stop_scan` toggle from an unrelated cancelled scan does not
    // immediately cancel this run before any work begins.
    flag.store(false, Ordering::SeqCst);
    super::cleanup::cleanup_projects(projects, Some(flag.inner().clone()))
}
