use serde::{Deserialize, Serialize};

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
}

#[derive(Debug, Serialize)]
pub struct ProcessNode {
    pub pid: u32,
    pub ppid: u32,
    pub name: String,
    pub command: String,
    pub children: Vec<ProcessNode>,
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
