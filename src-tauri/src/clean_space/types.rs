//! Clean Space types / 存储空间清理模块类型
//!
//! DTO structures shared between commands and front-end.

use serde::{Deserialize, Serialize};

/// Risk level for a cleanup item. Mirrors `dev_cleaner::RiskLevel` for
/// cross-module consistency.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Safe,
    Low,
    Medium,
    High,
}

/// Priority tier assigned by front-end scoring algorithm.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PriorityTier {
    P1,
    P2,
    P3,
}

/// Why a scanned item is not directly cleanable from Clean Space.
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

/// A single cleanable item within a category.
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

/// Result of a custom folder scan.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderScanResult {
    pub freed_bytes: u64,
    pub item_count: u32,
    pub items: Vec<StorageItem>,
}
