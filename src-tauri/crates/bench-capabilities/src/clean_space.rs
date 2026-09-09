//! Clean Space 能力：自定义文件夹扫描（按年龄/大小估算可清理项）。
//!
//! 自 `src-tauri/src/clean_space/folder_scan.rs` 迁移（逻辑等价，错误类型换为
//! [`CapError`]）。只读扫描，不做任何删除 —— 删除类操作保留在 Bench GUI 内执行。

use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};

use crate::error::{CapError, CapResult};

const MAX_RESULTS: usize = 100;

/// 清理项风险等级（与主应用 `dev_cleaner::RiskLevel` 保持一致）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Safe,
    Low,
    Medium,
    High,
}

/// 前端打分算法分配的优先级层级。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PriorityTier {
    P1,
    P2,
    P3,
}

/// 扫描项不可直接清理的原因。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CleanupProtectionKind {
    None,
    AppBundle,
    AppState,
    CrossUserData,
    ReadOnlySystem,
    SystemCritical,
    UserData,
    MissingCleanupRule,
}

/// 单个可清理项。
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StorageItem {
    pub id: String,
    pub name: String,
    pub category_id: String,
    pub risk_level: RiskLevel,
    pub size_bytes: u64,
    pub command: String,
    pub is_cleanable: bool,
    pub protection_kind: CleanupProtectionKind,
    pub protection_reason: String,
    pub path: String,
    pub files: String,
    pub reason: String,
    pub priority: PriorityTier,
    pub score: f64,
}

/// 自定义文件夹扫描结果。
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderScanResult {
    pub freed_bytes: u64,
    pub item_count: u32,
    pub items: Vec<StorageItem>,
}

/// 扫描自定义文件夹并估算可清理项（只读）。
///
/// 参数：
/// - `folder`：绝对路径
/// - `mtime_days`：仅包含早于 N 天的文件
/// - `include_subfolders`：是否递归子目录
pub fn scan_custom_folder(
    folder: &str,
    mtime_days: u32,
    include_subfolders: bool,
) -> CapResult<FolderScanResult> {
    let path = Path::new(folder);
    if !path.is_absolute() {
        return Err(CapError::invalid_input("Folder path must be absolute"));
    }
    let root = path
        .canonicalize()
        .map_err(|_| CapError::not_found("Folder not found or inaccessible"))?;
    if !root.is_dir() {
        return Err(CapError::invalid_input("Selected path is not a folder"));
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

    #[test]
    fn rejects_relative_and_non_directory_paths() {
        assert_eq!(
            scan_custom_folder("relative", 0, true).unwrap_err().code,
            "INVALID_INPUT"
        );

        let file = std::env::temp_dir().join(format!(
            "cap-scan-file-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&file, b"test").unwrap();
        assert_eq!(
            scan_custom_folder(&file.to_string_lossy(), 0, true)
                .unwrap_err()
                .code,
            "INVALID_INPUT"
        );
        std::fs::remove_file(file).unwrap();
    }

    #[test]
    fn returns_empty_for_missing_folder() {
        let ghost = std::env::temp_dir().join("cap-scan-definitely-missing-dir");
        let _ = std::fs::remove_dir_all(&ghost);
        assert_eq!(
            scan_custom_folder(&ghost.to_string_lossy(), 0, true)
                .unwrap_err()
                .code,
            "NOT_FOUND"
        );
    }
}
