//! Folder Scan / 自定义文件夹扫描
//!
//! Scans a user-selected folder and estimates cleanable items
//! based on rules (age, file type, size).

use std::path::Path;
use std::process::Command;

use super::shell_util::shell_escape;
use super::types::{CleanupProtectionKind, FolderScanResult, PriorityTier, RiskLevel, StorageItem};
use crate::error::AppResult;

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
    if !path.exists() {
        return Err(crate::error::AppError::not_found(format!(
            "Folder not found: {}",
            folder
        )));
    }

    let depth_flag = if include_subfolders {
        ""
    } else {
        "-maxdepth 1"
    };
    let cmd = format!(
        "find {} {} -type f -mtime +{} -exec du -skx {{}} + 2>/dev/null | sort -rn | head -100",
        shell_escape(folder),
        depth_flag,
        mtime_days,
    );

    let output = Command::new("sh")
        .args(["-c", &cmd])
        .output()
        .map_err(|e| crate::error::AppError::io(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut items = Vec::new();
    let mut total_bytes: u64 = 0;

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            if let Ok(kb) = parts[0].parse::<u64>() {
                let size = kb * 1024;
                let file_path = parts[1..].join(" ");
                let file_name = Path::new(&file_path)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| file_path.clone());

                total_bytes += size;
                items.push(StorageItem {
                    id: format!("custom_{}", items.len()),
                    name: file_name,
                    category_id: "custom_folder".into(),
                    risk_level: RiskLevel::Safe,
                    size_bytes: size,
                    command: format!("rm -f {}", shell_escape(&file_path)),
                    is_cleanable: true,
                    protection_kind: CleanupProtectionKind::None,
                    protection_reason: String::new(),
                    path: file_path,
                    files: String::new(),
                    reason: format!("Older than {} days", mtime_days),
                    priority: PriorityTier::P2,
                    score: 0.0,
                });
            }
        }
    }

    Ok(FolderScanResult {
        freed_bytes: total_bytes,
        item_count: items.len() as u32,
        items,
    })
}
