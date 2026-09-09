//! Folder Scan / 自定义文件夹扫描 —— 薄壳层。
//!
//! 实现已迁移至 `crates/bench-capabilities/src/clean_space.rs`（能力内核，
//! 与 bench-host / MCP / CLI 共享同一份实现）。保留原签名（`AppResult`），
//! 错误经 `From<CapError> for AppError` 转换（见 photo_triage/scan.rs）。

use crate::error::AppResult;

#[allow(unused_imports)]
pub use bench_capabilities::clean_space::{
    CleanupProtectionKind, FolderScanResult, PriorityTier, RiskLevel, StorageItem,
};

/// 扫描自定义文件夹并返回估算的可清理项（只读，不删除任何文件）。
pub fn scan_custom_folder(
    folder: &str,
    mtime_days: u32,
    include_subfolders: bool,
) -> AppResult<FolderScanResult> {
    bench_capabilities::clean_space::scan_custom_folder(folder, mtime_days, include_subfolders)
        .map_err(crate::error::AppError::from)
}
