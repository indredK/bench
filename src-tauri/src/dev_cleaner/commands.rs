use super::types::{CleanupResult, ProjectInfo, ScanAbortFlag, ScanResult};
use crate::error::AppResult;
use std::sync::atomic::Ordering;

#[tauri::command]
pub fn stop_scan(flag: tauri::State<ScanAbortFlag>) {
    flag.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn scan_dev_projects(
    root_path: String,
    flag: tauri::State<'_, ScanAbortFlag>,
) -> AppResult<ScanResult> {
    flag.store(false, Ordering::SeqCst);
    super::scanner::scan_dev_projects(root_path, flag.inner().clone()).await
}

#[tauri::command]
pub fn cleanup_projects(
    projects: Vec<ProjectInfo>,
    flag: tauri::State<'_, ScanAbortFlag>,
) -> AppResult<CleanupResult> {
    flag.store(false, Ordering::SeqCst);
    super::cleanup::cleanup_projects(projects, Some(flag.inner().clone()))
}
