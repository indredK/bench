//! Clean Space Commands / 存储空间清理 IPC 命令
//!
//! 7 Tauri commands registered in the global handler.
//! Heavy I/O commands use `async` + `spawn_blocking` to avoid blocking
//! the Tauri async runtime (and thus the UI event loop).

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::AppHandle;

use super::types::{
    CategoryCleanupResult, CleanupItemInput, CleanupItemResult, CleanupItemStatus, CleanupRecord,
    FolderScanResult, StorageItem, StorageOverview,
};
use super::{folder_scan, records, system_settings, system_storage};
use crate::error::{AppError, AppResult};
use crate::subprocess::{run_status_with_timeout, SubprocessError, SubprocessErrorKind};

const MAX_CLEANUP_ITEMS: usize = 500;
const MAX_CLEANUP_ID_BYTES: usize = 256;
const MAX_CLEANUP_PATH_BYTES: usize = 4 * 1024;
const FIND_CLEANUP_TIMEOUT: Duration = Duration::from_secs(120);
const DOCKER_PRUNE_TIMEOUT: Duration = Duration::from_secs(300);

#[tauri::command]
pub async fn scan_storage_overview() -> AppResult<StorageOverview> {
    tauri::async_runtime::spawn_blocking(system_storage::scan_overview)
        .await
        .unwrap_or_else(|e| Err(crate::error::AppError::io(format!("spawn error: {}", e))))
}

/// Streaming scan: emits `clean-space:scan-category` events per category
/// as they complete, instead of waiting for the full scan.
#[tauri::command]
pub async fn scan_storage_stream(app: AppHandle) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || system_storage::scan_overview_stream(app))
        .await
        .unwrap_or_else(|e| Err(crate::error::AppError::io(format!("spawn error: {}", e))))
}

#[tauri::command]
pub async fn get_category_items(category_id: String) -> AppResult<Vec<StorageItem>> {
    tauri::async_runtime::spawn_blocking(move || system_storage::get_category_items(&category_id))
        .await
        .unwrap_or_else(|e| Err(crate::error::AppError::io(format!("spawn error: {}", e))))
}

#[tauri::command]
pub async fn execute_category_cleanup(
    items: Vec<CleanupItemInput>,
) -> AppResult<CategoryCleanupResult> {
    validate_cleanup_batch(&items)?;
    tauri::async_runtime::spawn_blocking(move || run_cleanup_items(&items))
        .await
        .unwrap_or_else(|e| Err(crate::error::AppError::io(format!("spawn error: {}", e))))
}

fn validate_cleanup_batch(items: &[CleanupItemInput]) -> AppResult<()> {
    if items.len() > MAX_CLEANUP_ITEMS {
        return Err(AppError::invalid_input(format!(
            "cleanup batch exceeds {MAX_CLEANUP_ITEMS} items"
        )));
    }
    let mut ids = HashSet::with_capacity(items.len());
    for item in items {
        if item.id.is_empty() || item.id.len() > MAX_CLEANUP_ID_BYTES {
            return Err(AppError::invalid_input(
                "cleanup item id has an invalid length",
            ));
        }
        if item.path.len() > MAX_CLEANUP_PATH_BYTES {
            return Err(AppError::invalid_input(format!(
                "cleanup item path exceeds {MAX_CLEANUP_PATH_BYTES} bytes"
            )));
        }
        if !ids.insert(item.id.as_str()) {
            return Err(AppError::invalid_input(format!(
                "duplicate cleanup item id: {}",
                item.id
            )));
        }
    }
    Ok(())
}

fn run_cleanup_items(items: &[CleanupItemInput]) -> AppResult<CategoryCleanupResult> {
    let mut freed_bytes: u64 = 0;
    let mut cleaned: u32 = 0;
    let mut failed: u32 = 0;
    let mut results = Vec::with_capacity(items.len());

    for item in items {
        let action = match cleanup_action_for_item(item) {
            Ok(action) => action,
            Err(error) => {
                eprintln!(
                    "[clean-space] rejected cleanup item {}: {}",
                    item.id, error.code
                );
                failed = failed.saturating_add(1);
                results.push(CleanupItemResult {
                    id: item.id.clone(),
                    status: CleanupItemStatus::Rejected,
                    freed_bytes: 0,
                    error_code: Some(error.code),
                });
                continue;
            }
        };
        let before = action.measure_bytes();
        match action.execute() {
            Ok(()) => {
                let after = action.measure_bytes();
                let freed = before.saturating_sub(after);
                freed_bytes = freed_bytes.saturating_add(freed);
                cleaned = cleaned.saturating_add(1);
                results.push(CleanupItemResult {
                    id: item.id.clone(),
                    status: CleanupItemStatus::Cleaned,
                    freed_bytes: freed,
                    error_code: None,
                });
                eprintln!(
                    "[clean-space] cleaned item {}: freed {} bytes",
                    item.id, freed
                );
            }
            Err(error) => {
                eprintln!(
                    "[clean-space] cleanup failed for item {}: {}",
                    item.id, error.code
                );
                failed = failed.saturating_add(1);
                results.push(CleanupItemResult {
                    id: item.id.clone(),
                    status: CleanupItemStatus::Failed,
                    freed_bytes: 0,
                    error_code: Some(error.code),
                });
            }
        }
    }

    Ok(CategoryCleanupResult {
        success: failed == 0,
        freed_bytes,
        items_cleaned: cleaned,
        items_failed: failed,
        aborted: false,
        results,
    })
}

enum CleanupAction {
    RemovePath(PathBuf),
    RemoveChildren(PathBuf),
    RemoveChildrenExcept {
        root: PathBuf,
        protected_children: Vec<PathBuf>,
    },
    DeleteOldLogs(PathBuf),
    DockerPrune,
}

impl CleanupAction {
    fn measure_bytes(&self) -> u64 {
        match self {
            CleanupAction::RemovePath(path)
            | CleanupAction::RemoveChildren(path)
            | CleanupAction::DeleteOldLogs(path) => {
                system_storage::du_size_bytes(path.to_string_lossy().as_ref())
            }
            CleanupAction::RemoveChildrenExcept { root, .. } => {
                system_storage::du_size_bytes(root.to_string_lossy().as_ref())
            }
            CleanupAction::DockerPrune => 0,
        }
    }

    fn execute(&self) -> AppResult<()> {
        match self {
            CleanupAction::RemovePath(path) => remove_path(path),
            CleanupAction::RemoveChildren(path) => remove_children(path),
            CleanupAction::RemoveChildrenExcept {
                root,
                protected_children,
            } => remove_children_except(root, protected_children),
            CleanupAction::DeleteOldLogs(path) => delete_old_logs(path),
            CleanupAction::DockerPrune => docker_prune(),
        }
    }
}

fn cleanup_action_for_item(item: &CleanupItemInput) -> AppResult<CleanupAction> {
    if !matches!(
        item.category_id.as_str(),
        "downloads" | "system_data" | "developer" | "custom_folder"
    ) {
        return Err(AppError::forbidden_path(format!(
            "Category '{}' is informational or protected and cannot be cleaned",
            item.category_id
        )));
    }
    let home = dirs::home_dir().ok_or_else(|| AppError::not_found("Home directory not found"))?;
    let home = canonicalize_existing_path(&home)?;

    match item.category_id.as_str() {
        "downloads" if item.id.starts_with("dl_") => {
            let path = canonicalize_cleanup_item_path(item)?;
            let downloads = canonicalize_existing_path(home.join("Downloads"))?;
            require_direct_child(&path, &downloads)?;
            Ok(CleanupAction::RemovePath(path))
        }
        "system_data" => cleanup_system_data_action(item, &home),
        "developer" => cleanup_developer_action(item, &home),
        "custom_folder" => {
            let path = canonicalize_cleanup_item_path(item)?;
            require_inside(&path, &home)?;
            reject_protected_custom_path(&path, &home)?;
            Ok(CleanupAction::RemovePath(path))
        }
        _ => Err(AppError::forbidden_path("Unsupported cleanup item")),
    }
}

fn cleanup_system_data_action(item: &CleanupItemInput, home: &Path) -> AppResult<CleanupAction> {
    let path = canonicalize_cleanup_item_path(item)?;
    let caches = canonicalize_existing_path(home.join("Library/Caches"))?;
    let logs = canonicalize_existing_path(home.join("Library/Logs"))?;
    let trash = canonicalize_existing_path(home.join(".Trash"))?;

    match item.id.as_str() {
        "sys_caches" => {
            require_same_path(&path, &caches)?;
            let protected_children = protected_cache_children(home);
            Ok(CleanupAction::RemoveChildrenExcept {
                root: caches,
                protected_children,
            })
        }
        "sys_logs" => {
            require_same_path(&path, &logs)?;
            Ok(CleanupAction::DeleteOldLogs(logs))
        }
        "sys_trash" => {
            require_same_path(&path, &trash)?;
            Ok(CleanupAction::RemoveChildren(trash))
        }
        _ => Err(AppError::forbidden_path("Unknown system data cleanup item")),
    }
}

fn cleanup_developer_action(item: &CleanupItemInput, home: &Path) -> AppResult<CleanupAction> {
    match item.id.as_str() {
        "xcode_derived" => {
            let path = canonicalize_cleanup_item_path(item)?;
            let derived =
                canonicalize_existing_path(home.join("Library/Developer/Xcode/DerivedData"))?;
            require_same_path(&path, &derived)?;
            Ok(CleanupAction::RemoveChildren(derived))
        }
        "docker_data" => Ok(CleanupAction::DockerPrune),
        _ => Err(AppError::forbidden_path("Unknown developer cleanup item")),
    }
}

fn canonicalize_cleanup_item_path(item: &CleanupItemInput) -> AppResult<PathBuf> {
    if item.path.trim().is_empty() {
        return Err(AppError::forbidden_path("Cleanup item path is empty"));
    }
    canonicalize_existing_path(Path::new(&item.path))
}

fn canonicalize_existing_path(path: impl AsRef<Path>) -> AppResult<PathBuf> {
    let path = path.as_ref();
    path.canonicalize().map_err(|e| {
        AppError::not_found(format!(
            "Path not found or inaccessible: {} ({})",
            path.display(),
            e
        ))
    })
}

fn require_same_path(path: &Path, allowed: &Path) -> AppResult<()> {
    if path == allowed {
        Ok(())
    } else {
        Err(AppError::forbidden_path(format!(
            "Path '{}' does not match allowed cleanup root '{}'",
            path.display(),
            allowed.display()
        )))
    }
}

fn require_inside(path: &Path, root: &Path) -> AppResult<()> {
    if path.starts_with(root) {
        Ok(())
    } else {
        Err(AppError::forbidden_path(format!(
            "Path '{}' is outside allowed root '{}'",
            path.display(),
            root.display()
        )))
    }
}

fn require_direct_child(path: &Path, root: &Path) -> AppResult<()> {
    require_inside(path, root)?;
    if path.parent() == Some(root) {
        Ok(())
    } else {
        Err(AppError::forbidden_path(format!(
            "Path '{}' is not a direct child of '{}'",
            path.display(),
            root.display()
        )))
    }
}

fn reject_protected_custom_path(path: &Path, home: &Path) -> AppResult<()> {
    let protected_roots = [
        PathBuf::from("/"),
        PathBuf::from("/Applications"),
        PathBuf::from("/Library"),
        PathBuf::from("/System"),
        PathBuf::from("/bin"),
        PathBuf::from("/etc"),
        PathBuf::from("/opt"),
        PathBuf::from("/private"),
        PathBuf::from("/sbin"),
        PathBuf::from("/usr"),
        home.join("Library/Application Support"),
        home.join("Library/Containers"),
        home.join("Library/Group Containers"),
        home.join("Library/Keychains"),
    ];

    for root in protected_roots {
        if let Ok(root) = root.canonicalize() {
            let root_is_filesystem_root = root.parent().is_none();
            let blocked = if root_is_filesystem_root {
                path == root
            } else {
                path == root || path.starts_with(&root)
            };
            if blocked {
                return Err(AppError::forbidden_path(format!(
                    "Path '{}' is protected and cannot be cleaned by custom folder rules",
                    path.display()
                )));
            }
        }
    }
    Ok(())
}

fn remove_path(path: &Path) -> AppResult<()> {
    let meta = fs::symlink_metadata(path)?;
    if meta.is_dir() && !meta.file_type().is_symlink() {
        fs::remove_dir_all(path)?;
    } else {
        fs::remove_file(path)?;
    }
    Ok(())
}

fn remove_children(path: &Path) -> AppResult<()> {
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        remove_path(&entry.path())?;
    }
    Ok(())
}

fn remove_children_except(path: &Path, protected_children: &[PathBuf]) -> AppResult<()> {
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let entry_path = entry.path();
        let canonical_entry = entry_path.canonicalize().unwrap_or(entry_path.clone());
        if protected_children.iter().any(|protected| {
            canonical_entry == *protected || canonical_entry.starts_with(protected)
        }) {
            eprintln!("[clean-space] skipped protected cache child");
            continue;
        }
        remove_path(&entry_path)?;
    }
    Ok(())
}

fn protected_cache_children(home: &Path) -> Vec<PathBuf> {
    [home.join("Library/Caches/Yarn")]
        .into_iter()
        .filter_map(|path| path.canonicalize().ok())
        .collect()
}

fn delete_old_logs(path: &Path) -> AppResult<()> {
    run_cleanup_process(
        Command::new("find")
            .arg(path)
            .args(["-type", "f", "-name", "*.log", "-mtime", "+30", "-delete"]),
        FIND_CLEANUP_TIMEOUT,
        "old log cleanup",
    )
}

fn docker_prune() -> AppResult<()> {
    run_cleanup_process(
        Command::new("docker").args(["system", "prune", "-af"]),
        DOCKER_PRUNE_TIMEOUT,
        "Docker cleanup",
    )
}

fn run_cleanup_process(command: &mut Command, timeout: Duration, operation: &str) -> AppResult<()> {
    run_status_with_timeout(command, timeout)
        .map(|_| ())
        .map_err(|error| cleanup_process_error(operation, error))
}

fn cleanup_process_error(operation: &str, error: SubprocessError) -> AppError {
    let (code, reason) = match error.kind {
        SubprocessErrorKind::Spawn => ("CLEANUP_PROCESS_SPAWN_FAILED", "could not start".into()),
        SubprocessErrorKind::Exit => (
            "CLEANUP_PROCESS_FAILED",
            error
                .exit_code
                .map(|code| format!("exited unsuccessfully with code {code}"))
                .unwrap_or_else(|| "exited unsuccessfully".to_string()),
        ),
        SubprocessErrorKind::Timeout => ("CLEANUP_PROCESS_TIMEOUT", "timed out".into()),
        SubprocessErrorKind::Wait => ("CLEANUP_PROCESS_FAILED", "could not be monitored".into()),
    };
    AppError::new(code, format!("{operation} {reason}"))
}

#[tauri::command]
pub async fn scan_custom_folder(
    folder: String,
    mtime_days: Option<u32>,
    include_subfolders: Option<bool>,
) -> AppResult<FolderScanResult> {
    let days = mtime_days.unwrap_or(30);
    let subs = include_subfolders.unwrap_or(true);
    tauri::async_runtime::spawn_blocking(move || {
        folder_scan::scan_custom_folder(&folder, days, subs)
    })
    .await
    .unwrap_or_else(|e| Err(crate::error::AppError::io(format!("spawn error: {}", e))))
}

#[tauri::command]
pub fn open_system_storage_settings() -> AppResult<()> {
    system_settings::open_system_storage_settings()
}

#[tauri::command]
pub fn get_cleanup_records() -> AppResult<Vec<CleanupRecord>> {
    records::get_records()
}

#[tauri::command]
pub fn add_cleanup_record(record: CleanupRecord) -> AppResult<()> {
    records::add_record(record)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, category_id: &str, path: &str) -> CleanupItemInput {
        CleanupItemInput {
            id: id.into(),
            category_id: category_id.into(),
            command: String::new(),
            path: path.into(),
            size_bytes: 1024,
        }
    }

    #[test]
    fn cleanup_batch_rejects_duplicate_ids() {
        let items = vec![
            item("same", "documents", "/tmp/a"),
            item("same", "documents", "/tmp/b"),
        ];
        let error = validate_cleanup_batch(&items).unwrap_err();
        assert_eq!(error.code, "INVALID_INPUT");
    }

    #[test]
    fn cleanup_batch_rejects_excessive_item_count() {
        let items = (0..=MAX_CLEANUP_ITEMS)
            .map(|index| item(&format!("item-{index}"), "documents", "/tmp/a"))
            .collect::<Vec<_>>();
        let error = validate_cleanup_batch(&items).unwrap_err();
        assert_eq!(error.code, "INVALID_INPUT");
    }

    #[test]
    fn cleanup_process_timeout_maps_to_a_stable_error_code() {
        let error = cleanup_process_error(
            "test cleanup",
            SubprocessError {
                kind: SubprocessErrorKind::Timeout,
                exit_code: None,
            },
        );
        assert_eq!(error.code, "CLEANUP_PROCESS_TIMEOUT");
        assert!(!error.message.contains('/'));
    }

    #[test]
    fn rejected_items_are_not_counted_as_cleaned_or_freed() {
        let result = run_cleanup_items(&[item("protected", "documents", "/tmp/a")])
            .expect("structured result");
        assert!(!result.success);
        assert_eq!(result.items_cleaned, 0);
        assert_eq!(result.items_failed, 1);
        assert_eq!(result.freed_bytes, 0);
        assert_eq!(result.results.len(), 1);
        assert_eq!(result.results[0].status, CleanupItemStatus::Rejected);
        assert_eq!(
            result.results[0].error_code.as_deref(),
            Some("FORBIDDEN_PATH")
        );
    }

    #[test]
    fn direct_child_check_rejects_nested_and_sibling_paths() {
        let root = Path::new("/Users/test/Downloads");
        assert!(require_direct_child(Path::new("/Users/test/Downloads/file.zip"), root).is_ok());
        assert!(
            require_direct_child(Path::new("/Users/test/Downloads/nested/file.zip"), root).is_err()
        );
        assert!(
            require_direct_child(Path::new("/Users/test/Downloads-old/file.zip"), root).is_err()
        );
    }

    #[cfg(unix)]
    #[test]
    fn remove_path_unlinks_symlink_without_following_target() {
        use std::os::unix::fs::symlink;
        use std::time::{SystemTime, UNIX_EPOCH};

        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("bench-clean-space-{suffix}"));
        let target = root.join("outside.txt");
        let link = root.join("link.txt");
        fs::create_dir_all(&root).expect("temp dir");
        fs::write(&target, "keep").expect("target");
        symlink(&target, &link).expect("symlink");

        remove_path(&link).expect("unlink");
        assert!(!link.exists());
        assert!(target.exists());
        fs::remove_dir_all(root).expect("cleanup temp dir");
    }
}
