use super::projects::{dedupe_projects, detect_project, detect_skip_dir_project};
use super::rules::{is_child_of_skip_dir, is_cleanup_dir_name};
use super::types::{ProjectType, ScanAbortFlag, ScanResult};
use std::path::Path;
use std::sync::atomic::Ordering;
use walkdir::WalkDir;

pub(super) async fn scan_dev_projects(
    root_path: String,
    abort: ScanAbortFlag,
) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let start_time = std::time::Instant::now();
        let mut raw_projects = Vec::new();
        let mut aborted = false;
        let root_path_ref = Path::new(&root_path);

        for entry in WalkDir::new(&root_path)
            .same_file_system(true)
            .into_iter()
            .filter_entry(|e| !is_child_of_skip_dir(e, root_path_ref))
            .filter_map(|e| e.ok())
        {
            if abort.load(Ordering::SeqCst) {
                aborted = true;
                break;
            }

            let path = entry.path();
            let file_name = path.file_name().unwrap_or_default().to_string_lossy();

            if let Some(pt) = ProjectType::from_indicator(&file_name) {
                if let Some(parent) = path.parent() {
                    if let Ok(project) = detect_project(parent, pt, Some(&abort)) {
                        raw_projects.push(project);
                    }
                }
            } else if entry.file_type().is_dir() && is_cleanup_dir_name(&file_name) {
                if let Ok(project) = detect_skip_dir_project(path, &file_name, Some(&abort)) {
                    raw_projects.push(project);
                }
            }

            if abort.load(Ordering::SeqCst) {
                aborted = true;
                break;
            }
        }

        let projects = dedupe_projects(raw_projects, Some(&abort));
        let total_size = projects.iter().map(|project| project.total_size).sum();
        let total_cleanup_size = projects
            .iter()
            .map(|project| project.cleanup_potential)
            .sum();
        let scan_time_ms = start_time.elapsed().as_millis() as u64;

        Ok(ScanResult {
            total_projects: projects.len() as u32,
            total_size,
            total_cleanup_size,
            projects,
            scan_time_ms,
            aborted,
        })
    })
    .await
    .map_err(|e| format!("Scan task panicked: {}", e))?
}
