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

// ── Custom Cleanup Types ──

/// Risk level for a cleanup command. Used for programmatic judgments
/// (e.g. showing a destructive-action confirm dialog) so the front-end
/// does not have to pattern-match on localized display strings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Safe,
    Low,
    Medium,
    High,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CleanupCommandDef {
    pub id: String,
    pub name: String,
    pub command: String,
    pub environment: String,
    pub description: String,
    /// Human-readable risk detail. May be localized; display only.
    pub risk: String,
    /// Canonical risk level for programmatic judgments.
    pub risk_level: RiskLevel,
}

#[derive(Debug, Serialize, Clone)]
pub struct CustomCleanupProgress {
    pub command_id: String,
    pub command_name: String,
    pub status: String,
    pub output: String,
    pub freed_bytes: u64,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CustomCleanupFinalResult {
    pub success: bool,
    pub total_freed_bytes: u64,
    pub commands_executed: u32,
    pub commands_failed: u32,
    pub details: Vec<CustomCleanupProgress>,
    pub aborted: bool,
}

pub struct CustomCleanupAbortFlag(pub Arc<AtomicBool>);
