use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct SleepConfig {
    pub prevent_sleep: bool,
    pub prevent_display: bool,
    pub auto_disable_on_exit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct SleepState {
    pub enabled: bool,
    pub since: Option<i64>,
    pub config: SleepConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginItem {
    pub name: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchService {
    pub name: String,
    pub path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TccPermission {
    pub service: String,
    pub allowed: Vec<String>,
    pub denied: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PingResult {
    pub host: String,
    pub packets_sent: u32,
    pub packets_received: u32,
    pub min_rtt: f64,
    pub avg_rtt: f64,
    pub max_rtt: f64,
    pub loss_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsRecord {
    pub record_type: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortCheckResult {
    pub host: String,
    pub port: u16,
    pub open: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TracerouteHop {
    pub hop: u32,
    pub host: Option<String>,
    pub rtt: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpInfo {
    pub local_ip: String,
    pub external_ip: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiInfo {
    pub ssid: String,
    pub signal_strength: Option<i32>,
    pub channel: Option<String>,
    pub frequency: Option<String>,
    pub security: Option<String>,
}
