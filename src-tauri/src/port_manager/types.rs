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
pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub hostname: String,
    pub cpu_brand: String,
    pub cpu_cores: u32,
    pub total_memory: u64,
    pub available_memory: u64,
    pub used_memory: u64,
    pub memory_usage_percent: f32,
    pub uptime_seconds: u64,
    pub arch: String,
    pub model_name: String,
    pub distribution: String,
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
