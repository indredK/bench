use super::types::{
    CapabilityPackInfo, CapabilityPackInstallResult, CaptivePortalResult, DefaultRouteInfo,
    DefaultsOverride, DnsLookupResult, DnsSecCheckResult, FirewallStatus, FixResult,
    HealthScanResult, HostsOverride, Ipv6StackResult, LanDiscoveryResult, LanServicesResult,
    LocalNetworkSummary, MultiNodeDnsResult, NatProbeResult, NetworkProbeCapabilities,
    NetworkProbeDefaultsCatalog, NtpProbeResult, PathMtuResult, PcapDiagResult, PingProbeResult,
    PollutionReport, PortScanResult, ProbeNode, ProbeTargetResult, ProxyVpnStatus, PublicIpInfo,
    SitesProbeResult, SpeedSource, SpeedTestResult, TcpConnectResult, TracerouteResult, WhoisInfo,
};
use crate::error::{AppError, AppResult};
use tauri::AppHandle;

#[tauri::command]
pub async fn get_network_probe_capabilities(app: AppHandle) -> AppResult<NetworkProbeCapabilities> {
    Ok(super::packs::build_capabilities(Some(&app)))
}

#[tauri::command]
pub async fn list_probe_nodes(app: AppHandle) -> AppResult<Vec<ProbeNode>> {
    let agents = super::agent::agents_as_nodes(&app).unwrap_or_default();
    Ok(super::globalping::list_nodes_with_agents(&agents))
}

#[tauri::command]
pub async fn get_network_probe_defaults() -> AppResult<NetworkProbeDefaultsCatalog> {
    super::defaults::get_defaults()
}

#[tauri::command]
pub async fn network_probe_save_defaults_override(
    override_data: DefaultsOverride,
) -> AppResult<()> {
    super::defaults::save_defaults_override(override_data)
}

#[tauri::command]
pub async fn network_probe_reset_defaults() -> AppResult<()> {
    super::defaults::reset_defaults()
}

#[tauri::command]
pub async fn network_probe_list_capability_packs(
    app: AppHandle,
) -> AppResult<Vec<CapabilityPackInfo>> {
    super::packs::list_capability_packs(&app)
}

#[tauri::command]
pub async fn network_probe_install_capability_pack(
    app: AppHandle,
    pack_id: String,
) -> AppResult<CapabilityPackInstallResult> {
    super::packs::install_capability_pack(&app, pack_id).await
}

#[tauri::command]
pub async fn network_probe_install_capability_pack_verify_fail(
    app: AppHandle,
    pack_id: String,
) -> AppResult<CapabilityPackInstallResult> {
    super::packs::install_capability_pack_verify_fail(&app, pack_id).await
}

#[tauri::command]
pub async fn network_probe_uninstall_capability_pack(
    app: AppHandle,
    pack_id: String,
) -> AppResult<()> {
    super::packs::uninstall_capability_pack(&app, pack_id)
}

#[tauri::command]
pub async fn network_probe_list_speed_sources() -> AppResult<Vec<SpeedSource>> {
    Ok(super::speed::builtin_sources())
}

#[tauri::command]
pub async fn network_probe_run_speed_test(
    app: AppHandle,
    source_id: String,
) -> AppResult<SpeedTestResult> {
    super::speed::run_speed_test(Some(&app), source_id).await
}

#[tauri::command]
pub async fn network_probe_run_pollution_check(domain: String) -> AppResult<PollutionReport> {
    super::pollution::run_pollution_check(domain).await
}

#[tauri::command]
pub async fn network_probe_whois(query: String) -> AppResult<WhoisInfo> {
    super::whois::whois_lookup(query).await
}

#[tauri::command]
pub async fn network_probe_check_dnssec(domain: String) -> AppResult<DnsSecCheckResult> {
    super::dnssec::check_dnssec(domain).await
}

#[tauri::command]
pub async fn network_probe_scan_ports(
    app: AppHandle,
    target: String,
    ports: String,
) -> AppResult<PortScanResult> {
    let parsed = super::ports::parse_port_range(&ports)?;
    super::ports::scan_ports_tcp(Some(&app), target, parsed).await
}

#[tauri::command]
pub async fn network_probe_probe_nat() -> AppResult<NatProbeResult> {
    super::nat::probe_nat().await
}

#[tauri::command]
pub async fn network_probe_probe_ntp() -> AppResult<NtpProbeResult> {
    super::ntp::probe_ntp().await
}

#[tauri::command]
pub async fn network_probe_discover_lan(app: AppHandle) -> AppResult<LanDiscoveryResult> {
    super::discovery::discover_lan(Some(&app)).await
}

#[tauri::command]
pub async fn network_probe_browse_lan_services() -> AppResult<LanServicesResult> {
    super::lan_services::browse_lan_services().await
}

#[tauri::command]
pub async fn network_probe_run_pcap_diag(
    app: AppHandle,
    duration_secs: Option<u32>,
) -> AppResult<PcapDiagResult> {
    super::pcap_diag::run_pcap_diag(Some(&app), duration_secs.unwrap_or(5)).await
}

#[tauri::command]
pub async fn network_probe_compare_dns_multi(
    domain: String,
    locations: Option<Vec<String>>,
) -> AppResult<MultiNodeDnsResult> {
    super::globalping::compare_dns_multi(domain, locations.unwrap_or_default()).await
}

#[tauri::command]
pub async fn network_probe_add_agent(
    app: AppHandle,
    label: String,
    endpoint: String,
) -> AppResult<ProbeNode> {
    super::agent::add_agent(&app, label, endpoint).await
}

#[tauri::command]
pub async fn network_probe_remove_agent(app: AppHandle, agent_id: String) -> AppResult<()> {
    super::agent::remove_agent(&app, agent_id)
}

#[tauri::command]
pub async fn network_probe_reject_agent_action(action: String) -> AppResult<()> {
    super::agent::reject_arbitrary_agent_exec(&action)
}

#[tauri::command]
pub async fn get_local_network_summary() -> AppResult<LocalNetworkSummary> {
    tauri::async_runtime::spawn_blocking(super::summary::collect_local_summary)
        .await
        .map_err(|e| AppError::task_failed(format!("get_local_network_summary: {e}")))?
}

#[tauri::command]
pub async fn get_default_route() -> AppResult<DefaultRouteInfo> {
    tauri::async_runtime::spawn_blocking(super::summary::collect_default_route)
        .await
        .map_err(|e| AppError::task_failed(format!("get_default_route: {e}")))?
}

#[tauri::command]
pub async fn tcp_connect(
    host: String,
    port: u16,
    timeout_ms: Option<u64>,
) -> AppResult<TcpConnectResult> {
    super::tcp::tcp_connect(host, port, timeout_ms).await
}

/// ICMP ping probe (network-probe SSoT). Distinct from system_settings::ping_host.
#[tauri::command]
pub async fn network_probe_ping_host(
    app: AppHandle,
    target: String,
    count: Option<u32>,
    interval_ms: Option<u64>,
) -> AppResult<PingProbeResult> {
    super::ping::ping_host_streaming(&app, target, count, interval_ms).await
}

#[tauri::command]
pub async fn network_probe_dns_lookup(
    domain: String,
    rr_type: Option<String>,
    resolver: Option<String>,
) -> AppResult<DnsLookupResult> {
    super::dns::dns_lookup(domain, rr_type, resolver).await
}

#[tauri::command]
pub async fn network_probe_probe_target(input: String) -> AppResult<ProbeTargetResult> {
    super::probe::probe_target(input).await
}

#[tauri::command]
pub async fn network_probe_sites_probe(
    app: AppHandle,
    pack_id: String,
) -> AppResult<SitesProbeResult> {
    super::sites::sites_probe(Some(&app), pack_id).await
}

#[tauri::command]
pub async fn network_probe_sites_probe_custom(
    app: AppHandle,
    targets: Vec<String>,
) -> AppResult<SitesProbeResult> {
    super::sites::sites_probe_custom(Some(&app), targets).await
}

#[tauri::command]
pub async fn network_probe_run_health_scan(app: AppHandle) -> AppResult<HealthScanResult> {
    super::health::run_health_scan(Some(&app)).await
}

#[tauri::command]
pub async fn network_probe_cancel_scan(session_id: String) -> AppResult<()> {
    super::session::cancel_scan(session_id);
    Ok(())
}

#[tauri::command]
pub async fn network_probe_list_network_services() -> AppResult<Vec<String>> {
    tauri::async_runtime::spawn_blocking(super::fix::list_network_services)
        .await
        .map_err(|e| AppError::task_failed(format!("list_network_services: {e}")))?
}

#[tauri::command]
pub async fn network_probe_flush_dns() -> AppResult<FixResult> {
    tauri::async_runtime::spawn_blocking(super::fix::flush_dns)
        .await
        .map_err(|e| AppError::task_failed(format!("flush_dns: {e}")))?
}

#[tauri::command]
pub async fn network_probe_switch_dns(
    service: String,
    servers: Vec<String>,
) -> AppResult<FixResult> {
    tauri::async_runtime::spawn_blocking(move || super::fix::switch_dns(service, servers))
        .await
        .map_err(|e| AppError::task_failed(format!("switch_dns: {e}")))?
}

#[tauri::command]
pub async fn network_probe_renew_dhcp(service: String) -> AppResult<FixResult> {
    tauri::async_runtime::spawn_blocking(move || super::fix::renew_dhcp(service))
        .await
        .map_err(|e| AppError::task_failed(format!("renew_dhcp: {e}")))?
}

#[tauri::command]
pub async fn network_probe_reset_network_stack(service: String) -> AppResult<FixResult> {
    tauri::async_runtime::spawn_blocking(move || super::fix::reset_network_stack(service))
        .await
        .map_err(|e| AppError::task_failed(format!("reset_network_stack: {e}")))?
}

#[tauri::command]
pub async fn network_probe_detect_captive_portal() -> AppResult<CaptivePortalResult> {
    super::offline::detect_captive_portal().await
}

#[tauri::command]
pub async fn network_probe_get_public_ip_info() -> AppResult<PublicIpInfo> {
    super::offline::get_public_ip_info().await
}

#[tauri::command]
pub async fn network_probe_get_proxy_vpn_status() -> AppResult<ProxyVpnStatus> {
    tauri::async_runtime::spawn_blocking(super::offline::get_proxy_vpn_status)
        .await
        .map_err(|e| AppError::task_failed(format!("get_proxy_vpn_status: {e}")))?
}

#[tauri::command]
pub async fn network_probe_run_traceroute(
    app: AppHandle,
    target: String,
    max_ttl: Option<u8>,
    rounds: Option<u32>,
) -> AppResult<TracerouteResult> {
    super::traceroute::run_traceroute(Some(&app), target, max_ttl, rounds).await
}

#[tauri::command]
pub async fn network_probe_check_ipv6_stack() -> AppResult<Ipv6StackResult> {
    super::ipv6::check_ipv6_stack().await
}

#[tauri::command]
pub async fn network_probe_probe_path_mtu(target: String) -> AppResult<PathMtuResult> {
    super::mtu::probe_path_mtu(target).await
}

#[tauri::command]
pub async fn check_hosts_overrides() -> AppResult<Vec<HostsOverride>> {
    tauri::async_runtime::spawn_blocking(super::hosts::check_hosts_overrides)
        .await
        .map_err(|e| AppError::task_failed(format!("check_hosts_overrides: {e}")))?
}

#[tauri::command]
pub async fn get_firewall_status() -> AppResult<FirewallStatus> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "macos")]
        {
            match crate::system_settings::network::read_network_firewall_state() {
                Ok(enabled) => Ok(FirewallStatus {
                    status: if enabled { "on" } else { "off" }.into(),
                    detail: None,
                }),
                Err(e) => Ok(FirewallStatus {
                    status: "unsupported".into(),
                    detail: Some(e),
                }),
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            Ok(FirewallStatus {
                status: "unsupported".into(),
                detail: Some("Firewall status is only implemented on macOS for MVP".into()),
            })
        }
    })
    .await
    .map_err(|e| AppError::task_failed(format!("get_firewall_status: {e}")))?
}

#[tauri::command]
pub async fn open_system_network_settings() -> AppResult<()> {
    crate::system_settings::system_pane_registry::open_network_settings()
}
