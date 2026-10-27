use serde::{Deserialize, Serialize};

pub const MAX_KILL_TARGETS: usize = 100;
pub const MAX_QUERY_PORTS: usize = 100;
pub const PROCESS_TREE_CHILD_PAGE_SIZE: usize = 100;

#[derive(Debug, Serialize)]
pub struct KillPidResult {
    pub pid: u32,
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct KillTarget {
    pub pid: u32,
    pub expected_name: Option<String>,
    pub expected_identity: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProcessNode {
    pub pid: u32,
    pub ppid: u32,
    pub name: String,
    pub command: String,
    pub identity: Option<String>,
    pub has_children: bool,
    pub children: Vec<ProcessNode>,
}

#[derive(Debug, Serialize)]
pub struct ProcessChildrenPage {
    pub parent_pid: u32,
    pub children: Vec<ProcessNode>,
    pub next_after_pid: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct ProcessFingerprint {
    pub category: String,
    pub name: String,
    pub icon: String,
}

#[derive(Debug, Serialize)]
pub struct PortProcessDetail {
    pub port: u16,
    pub pids: Vec<u32>,
    pub process_trees: Vec<ProcessNode>,
    pub fingerprint: Option<ProcessFingerprint>,
    pub error: Option<String>,
}
