use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize, Clone)]
pub struct EnvTool {
    pub name: String,
    pub version: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub install_time: String,
    pub available: bool,
    pub category: String,
    pub source: String,
    pub kind: String,
    pub status: String,
    pub detector: String,
    pub all_paths: Vec<String>,
    pub issue: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ScanDonePayload {
    pub tools: Vec<EnvTool>,
    pub unavailable: Vec<EnvTool>,
}

#[derive(Debug, Clone)]
pub(crate) struct CommandCandidate {
    pub(crate) name: String,
    pub(crate) path: PathBuf,
    pub(crate) dir_index: usize,
    pub(crate) extension_rank: usize,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ToolDetector {
    pub(crate) name: &'static str,
    pub(crate) aliases: &'static [&'static str],
    pub(crate) category: &'static str,
    pub(crate) version_args: &'static [&'static str],
}

#[derive(Debug)]
pub(crate) struct ToolClassification {
    pub(crate) category: String,
    pub(crate) source: String,
    pub(crate) kind: String,
    pub(crate) status: String,
    pub(crate) detector: String,
    pub(crate) issue: String,
}

#[derive(Debug)]
pub(crate) struct NodeBinInfo {
    pub(crate) package_name: String,
    pub(crate) declared_bins: Vec<NodeDeclaredBin>,
    pub(crate) matched_name: Option<String>,
}

#[derive(Debug)]
pub(crate) struct NodeDeclaredBin {
    pub(crate) name: String,
    pub(crate) relative_path: String,
}
