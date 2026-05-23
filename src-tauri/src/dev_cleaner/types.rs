use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ProjectType {
    NodeJs,
    Python,
    Rust,
    Go,
    /// Indicator files for more than one language were found at the same path
    /// (e.g. a Python backend co-located with a Node frontend). The label
    /// signals "multi-language" without losing any of the per-language cleanup
    /// rules — `dedupe_projects` unions cleanup_paths across all detected
    /// indicators, so the actual cleanup behavior is the union of both.
    Mixed,
    General,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectInfo {
    pub path: String,
    pub name: String,
    pub total_size: u64,
    pub target_size: u64,
    pub last_modified: u64,
    pub dependencies_count: u32,
    pub project_type: ProjectType,
    pub cleanup_potential: u64,
    pub cleanup_paths: Vec<String>,
}

pub type ScanAbortFlag = Arc<AtomicBool>;

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub total_projects: u32,
    pub total_size: u64,
    pub total_cleanup_size: u64,
    pub projects: Vec<ProjectInfo>,
    pub scan_time_ms: u64,
    pub aborted: bool,
}

#[derive(Debug, Serialize)]
pub struct CleanupResult {
    pub success: bool,
    pub cleaned_size: u64,
    pub errors: Vec<String>,
}
