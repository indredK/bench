use super::types::{
    CaptivePortalResult, DefaultRouteInfo, DnsLookupResult, FirewallStatus, FixResult,
    HealthScanResult, HostsOverride, Ipv6StackResult, LocalNetworkSummary,
    NetworkProbeCapabilities, NetworkProbeDefaultsCatalog, PathMtuResult, PingProbeResult,
    ProbeNode, ProbeTargetResult, ProxyVpnStatus, PublicIpInfo, SitesProbeResult, TcpConnectResult,
    TracerouteResult,
};
use crate::error::{AppError, AppResult};
use std::collections::HashMap;
use tauri::AppHandle;

#[tauri::command]
pub async fn get_network_probe_capabilities() -> AppResult<NetworkProbeCapabilities> {
    Ok(build_capabilities())
}

#[tauri::command]
pub async fn list_probe_nodes() -> AppResult<Vec<ProbeNode>> {
    Ok(vec![ProbeNode {
        id: "local".into(),
        kind: "local".into(),
        label: "This Mac".into(),
        reachable: true,
        endpoint: None,
        region: None,
        capabilities: None,
    }])
}

#[tauri::command]
pub async fn get_network_probe_defaults() -> AppResult<NetworkProbeDefaultsCatalog> {
    super::defaults::get_defaults()
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
    target: String,
    count: Option<u32>,
    interval_ms: Option<u64>,
) -> AppResult<PingProbeResult> {
    super::ping::ping_host(target, count, interval_ms).await
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

fn build_capabilities() -> NetworkProbeCapabilities {
    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "unsupported"
    };

    let mut tools = HashMap::new();
    let s = |v: &str| v.to_string();
    tools.insert("summary".into(), s("supported"));
    tools.insert("defaultRoute".into(), s("supported"));
    tools.insert("tcpConnect".into(), s("supported"));
    tools.insert("hosts".into(), s("supported"));
    tools.insert(
        "firewall".into(),
        if cfg!(target_os = "macos") {
            s("supported")
        } else {
            s("unsupported")
        },
    );
    tools.insert("openNetworkSettings".into(), s("supported"));
    tools.insert("defaults".into(), s("supported"));
    tools.insert("ping".into(), s("supported"));
    tools.insert("dnsLookup".into(), s("supported"));
    tools.insert("probeTarget".into(), s("supported"));
    tools.insert("sitesProbe".into(), s("supported"));
    tools.insert("healthScan".into(), s("supported"));
    tools.insert("flushDns".into(), s("supported"));
    tools.insert("switchDns".into(), s("supported"));
    tools.insert("renewDhcp".into(), s("supported"));
    tools.insert("detectCaptive".into(), s("supported"));
    tools.insert("publicIp".into(), s("supported"));
    tools.insert("proxyVpn".into(), s("supported"));
    tools.insert(
        "traceroute".into(),
        if cfg!(target_os = "macos") || cfg!(target_os = "windows") || cfg!(target_os = "linux") {
            s("supported")
        } else {
            s("unsupported")
        },
    );
    tools.insert(
        "resetNetworkStack".into(),
        if cfg!(target_os = "macos") {
            s("supported")
        } else {
            s("unsupported")
        },
    );
    tools.insert(
        "checkIpv6".into(),
        if cfg!(target_os = "macos") {
            s("supported")
        } else {
            s("partial")
        },
    );
    tools.insert(
        "pathMtu".into(),
        if cfg!(target_os = "macos") {
            s("supported")
        } else {
            s("unsupported")
        },
    );
    // Post-MVP / pack-gated tools must appear in the matrix (never hardcode all-green in UI).
    tools.insert("speedTest".into(), s("unsupported"));
    tools.insert("portScan".into(), s("missing_pack"));
    tools.insert("pcap".into(), s("missing_pack"));
    tools.insert("arp".into(), s("missing_pack"));
    tools.insert("globalping".into(), s("missing_pack"));

    NetworkProbeCapabilities {
        platform: platform.into(),
        // Desktop app runs without elevation by default; privileged ICMP may degrade.
        privilege_level: "none".into(),
        tools,
    }
}
