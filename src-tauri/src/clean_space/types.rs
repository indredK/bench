//! Clean Space types / 存储空间清理模块类型
//!
//! DTO structures shared between commands and front-end.

use serde::{Deserialize, Serialize};

// RiskLevel / PriorityTier / CleanupProtectionKind / StorageItem / FolderScanResult
// 已迁移至 bench-capabilities（能力内核），此处 re-export 保证 crate 内引用不变。
pub use bench_capabilities::clean_space::{
    CleanupProtectionKind, FolderScanResult, PriorityTier, RiskLevel, StorageItem,
};

/// A storage category (e.g. Applications, Documents, Developer).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StorageCategory {
    pub id: String,
    pub name: String,
    pub color: String,
    pub total_bytes: u64,
    pub items: Vec<StorageItem>,
}

/// Top-level storage overview returned by `scan_storage_overview`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StorageOverview {
    pub disk_total_bytes: u64,
    pub categories: Vec<StorageCategory>,
}

/// A cleanup record persisted to disk.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CleanupRecord {
    pub id: String,
    pub timestamp: u64,
    pub title: String,
    pub scope: String,
    pub items: u32,
    pub freed_bytes: u64,
    pub high_risk_count: u32,
    pub status: String,
}

/// Input for a single cleanup item sent from front-end.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CleanupItemInput {
    pub id: String,
    pub category_id: String,
    pub command: String,
    pub path: String,
    pub size_bytes: u64,
}

/// Result of a category cleanup execution.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CategoryCleanupResult {
    pub success: bool,
    pub freed_bytes: u64,
    pub items_cleaned: u32,
    pub items_failed: u32,
    pub aborted: bool,
    pub results: Vec<CleanupItemResult>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CleanupItemStatus {
    Cleaned,
    Failed,
    Rejected,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct CleanupItemResult {
    pub id: String,
    pub status: CleanupItemStatus,
    pub freed_bytes: u64,
    pub error_code: Option<String>,
}
