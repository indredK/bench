use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeNode {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub reachable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProbeCapabilities {
    pub platform: String,
    pub privilege_level: String,
    pub tools: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInterfaceInfo {
    pub name: String,
    pub addrs: Vec<String>,
    pub is_loopback: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalNetworkSummary {
    pub interfaces: Vec<NetworkInterfaceInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_ipv4: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_ipv6: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gateway: Option<String>,
    pub dns_servers: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wifi_ssid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wifi_signal_dbm: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultRouteInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gateway: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interface: Option<String>,
    pub present: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpConnectResult {
    pub host: String,
    pub port: u16,
    /// ok | timeout | refused | unreachable | dns_failed | error
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtt_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostsOverride {
    pub address: String,
    pub names: Vec<String>,
    pub line: usize,
    pub suspicious: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirewallStatus {
    /// on | off | unsupported
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProbeDefaultsCatalog {
    pub schema_version: u32,
    pub dns_presets: Vec<DnsPreset>,
    pub reach_targets: Vec<ReachTarget>,
    pub captive_probes: Vec<CaptiveProbe>,
    pub public_ip_apis: Vec<PublicIpApi>,
    pub site_packs: HashMap<String, Vec<SitePreset>>,
    pub mtu_targets: Vec<MtuTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsPreset {
    pub id: String,
    pub address: String,
    pub region: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReachTarget {
    pub id: String,
    pub kind: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptiveProbe {
    pub id: String,
    pub url: String,
    pub expect_status: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicIpApi {
    pub id: String,
    pub url: String,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SitePreset {
    pub id: String,
    pub target: String,
    pub channel: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MtuTarget {
    pub id: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingSample {
    pub seq: u32,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtt_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingProbeResult {
    pub target: String,
    pub resolved_ip: String,
    pub packets_sent: u32,
    pub packets_received: u32,
    pub loss_percent: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_rtt_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_rtt_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_rtt_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stddev_rtt_ms: Option<f64>,
    pub samples: Vec<PingSample>,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsRecordItem {
    pub name: String,
    pub rr_type: String,
    pub ttl: u32,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsLookupResult {
    pub domain: String,
    pub rr_type: String,
    pub resolver: String,
    pub elapsed_ms: f64,
    pub records: Vec<DnsRecordItem>,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IcmpProbeDetail {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtt_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpProbeDetail {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttfb_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub final_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TlsLightDetail {
    pub present: bool,
    pub handshake_ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeTargetResult {
    pub input: String,
    /// host | url
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icmp: Option<IcmpProbeDetail>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http: Option<HttpProbeDetail>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<TlsLightDetail>,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteSampleResult {
    pub id: String,
    pub target: String,
    pub channel: String,
    pub ok: bool,
    #[serde(default)]
    pub degraded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icmp_rtt_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_ttfb_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SitesProbeResult {
    pub pack_id: String,
    pub results: Vec<SiteSampleResult>,
    pub session_id: String,
    pub cancelled: bool,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckItem {
    pub key: String,
    /// L0 | L1 | L2 | L3
    pub layer: String,
    /// pass | warn | fail | skip | error
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthOpinion {
    pub id: String,
    /// info | warn | critical
    pub severity: String,
    pub related_keys: Vec<String>,
    pub title_key: String,
    pub body_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthScanResult {
    pub items: Vec<HealthCheckItem>,
    pub opinions: Vec<HealthOpinion>,
    pub elapsed_ms: f64,
    pub session_id: String,
    pub cancelled: bool,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSessionEvent {
    pub session_id: String,
    /// health | traceroute
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FixResult {
    pub action: String,
    pub ok: bool,
    pub message: String,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptivePortalResult {
    /// open | captive | offline | unknown
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicIpInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asn: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyVpnStatus {
    pub proxy_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_detail: Option<String>,
    pub vpn_ifaces: Vec<String>,
    pub default_via_tunnel: bool,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TracerouteHop {
    pub ttl: u8,
    pub addrs: Vec<String>,
    pub loss_percent: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_rtt_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub best_rtt_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worst_rtt_ms: Option<f64>,
    pub sent: u32,
    pub recv: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asn: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub as_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TracerouteResult {
    pub target: String,
    pub resolved_ip: String,
    /// privileged | unprivileged | unavailable | cancelled
    pub privilege_mode: String,
    pub hops: Vec<TracerouteHop>,
    pub rounds: u32,
    pub elapsed_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub session_id: String,
    pub cancelled: bool,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ipv6DualStackCompare {
    pub ipv4_ok: bool,
    pub ipv6_ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipv4_rtt_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipv6_rtt_ms: Option<f64>,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ipv6StackResult {
    /// ok | partial | unavailable | fail
    pub status: String,
    pub link_local: Vec<String>,
    pub global: Vec<String>,
    pub aaaa_ok: bool,
    pub aaaa_addrs: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icmpv6_ok: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icmpv6_rtt_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_v6_ok: Option<bool>,
    pub dual_stack: Ipv6DualStackCompare,
    /// skip | partial | ok
    pub ndp_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ndp_detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub traceroute_note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub elapsed_ms: f64,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathMtuProbeStep {
    pub payload_bytes: u16,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathMtuResult {
    pub target: String,
    pub resolved_ip: String,
    /// ok | blackhole | fail | unsupported | degraded
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path_mtu: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_payload: Option<u16>,
    pub method: String,
    pub steps: Vec<PathMtuProbeStep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub elapsed_ms: f64,
    pub command_hint: String,
}
