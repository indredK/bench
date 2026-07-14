//! Folder Scan / 自定义文件夹扫描
//!
//! Scans a user-selected folder and estimates cleanable items
//! based on rules (age, file type, size).

use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use super::types::{CleanupProtectionKind, FolderScanResult, PriorityTier, RiskLevel, StorageItem};
use crate::error::{AppError, AppResult};

const MAX_RESULTS: usize = 100;

/// Scan a custom folder and return estimated cleanable items.
///
/// Parameters:
/// - `folder`: absolute path to scan
/// - `mtime_days`: only include files older than N days
/// - `include_subfolders`: recurse into subdirectories
pub fn scan_custom_folder(
    folder: &str,
    mtime_days: u32,
    include_subfolders: bool,
) -> AppResult<FolderScanResult> {
    let path = Path::new(folder);
    if !path.is_absolute() {
        return Err(AppError::invalid_input("Folder path must be absolute"));
    }
    let root = path
        .canonicalize()
        .map_err(|_| AppError::not_found("Folder not found or inaccessible"))?;
    if !root.is_dir() {
        return Err(AppError::invalid_input("Selected path is not a folder"));
    }

    let min_age = Duration::from_secs(u64::from(mtime_days).saturating_mul(24 * 60 * 60));
    let now = SystemTime::now();
    let max_depth = if include_subfolders { usize::MAX } else { 1 };
    let mut largest = BinaryHeap::<Reverse<(u64, PathBuf)>>::new();

    for entry in walkdir::WalkDir::new(&root)
        .max_depth(max_depth)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        let Ok(age) = now.duration_since(modified) else {
            continue;
        };
        if age <= min_age {
            continue;
        }

        largest.push(Reverse((metadata.len(), entry.path().to_path_buf())));
        if largest.len() > MAX_RESULTS {
            largest.pop();
        }
    }

    let mut candidates: Vec<(u64, PathBuf)> = largest
        .into_iter()
        .map(|Reverse(candidate)| candidate)
        .collect();
    candidates.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| left.1.cmp(&right.1)));

    let mut total_bytes = 0_u64;
    let items = candidates
        .into_iter()
        .enumerate()
        .map(|(index, (size, file_path))| {
            total_bytes = total_bytes.saturating_add(size);
            let file_name = file_path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| file_path.to_string_lossy().to_string());

            StorageItem {
                id: format!("custom_{index}"),
                name: file_name,
                category_id: "custom_folder".into(),
                risk_level: RiskLevel::Safe,
                size_bytes: size,
                command: "remove_path".into(),
                is_cleanable: true,
                protection_kind: CleanupProtectionKind::None,
                protection_reason: String::new(),
                path: file_path.to_string_lossy().to_string(),
                files: String::new(),
                reason: format!("Older than {mtime_days} days"),
                priority: PriorityTier::P2,
                score: 0.0,
            }
        })
        .collect::<Vec<_>>();

    Ok(FolderScanResult {
        freed_bytes: total_bytes,
        item_count: items.len() as u32,
        items,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_relative_and_non_directory_paths() {
        assert_eq!(
            scan_custom_folder("relative", 0, true).unwrap_err().code,
            "INVALID_INPUT"
        );

        let file = std::env::temp_dir().join(format!(
            "bench-custom-scan-file-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&file, b"test").unwrap();
        assert_eq!(
            scan_custom_folder(&file.to_string_lossy(), 0, true)
                .unwrap_err()
                .code,
            "INVALID_INPUT"
        );
        fs::remove_file(file).unwrap();
    }
}
