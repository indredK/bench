use super::types::{
    HealthCheckItem, HealthScanResult, LocalNetworkSummary, MtuTarget, NetworkProbeDefaultsCatalog,
    PublicIpApi, ReachTarget, ScanSessionEvent,
};
use crate::error::AppResult;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Runtime};

pub const HEALTH_ITEM_EVENT: &str = "network-probe:health-item";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

pub async fn run_health_scan<R: Runtime>(
    app: Option<&AppHandle<R>>,
) -> AppResult<HealthScanResult> {
    let started = Instant::now();
    let defaults = super::defaults::get_defaults()?;
    let reach_ip_targets = configured_reach_targets(&defaults, "pub-ip-v4", "ipv4");
    let reach_name_targets = configured_reach_targets(&defaults, "pub-name", "name");
    let session_id = super::session::new_session_id();
    let command_hint = format!("startHealthScan(local) // sessionId={session_id}");
    let mut items = Vec::new();
    let mut cancelled = false;

    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "health".into(),
            },
        );
    }

    let summary = tauri::async_runtime::spawn_blocking(super::summary::collect_local_summary)
        .await
        .ok()
        .and_then(|r| r.ok());
    let route = tauri::async_runtime::spawn_blocking(super::summary::collect_default_route)
        .await
        .ok()
        .and_then(|r| r.ok());
    // 读不到 ≠ 没有改写：必须保留「未判定」，否则下面的 `unwrap_or_default()`
    // 会让一次失败被体检报成绿色通过。
    let hosts: Option<Vec<super::types::HostsOverride>> =
        tauri::async_runtime::spawn_blocking(super::hosts::check_hosts_overrides)
            .await
            .ok()
            .and_then(|r| r.ok());
    let firewall = tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "macos")]
        {
            match crate::system_settings::network::read_network_firewall_state() {
                Ok(enabled) => Some(if enabled { "on" } else { "off" }.to_string()),
                Err(_) => None,
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            None
        }
    })
    .await
    .ok()
    .flatten();
    let proxy_route = route.clone();
    let proxy_vpn = tauri::async_runtime::spawn_blocking(move || collect_proxy_vpn(proxy_route))
        .await
        .ok()
        .unwrap_or_default();

    macro_rules! push_or_stop {
        ($item:expr) => {{
            if super::session::is_cancelled(&session_id) {
                cancelled = true;
            } else {
                push(&mut items, app, $item).await;
            }
        }};
    }

    // —— L0 ——
    push_or_stop!(check_link_iface(summary.as_ref()));
    if !cancelled {
        push_or_stop!(check_wifi_or_wired(summary.as_ref()));
    }

    // —— L1 ——
    if !cancelled {
        push_or_stop!(check_addr_ipv4(summary.as_ref()));
    }
    if !cancelled {
        push_or_stop!(check_addr_ipv6(summary.as_ref()));
    }
    if !cancelled {
        push_or_stop!(check_dhcp_or_static());
    }
    if !cancelled {
        push_or_stop!(check_route_default(route.as_ref(), summary.as_ref()));
    }
    if !cancelled {
        push_or_stop!(check_dns_servers(summary.as_ref()));
    }
    if !cancelled {
        push_or_stop!(
            check_dns_resolve_name(configured_reach_target(
                &defaults,
                "dns-resolve-name",
                "name"
            ))
            .await
        );
    }
    if !cancelled {
        push_or_stop!(check_dns_fake_ip(summary.as_ref(), &proxy_vpn).await);
    }
    if !cancelled {
        push_or_stop!(check_hosts_override(&hosts));
    }
    if !cancelled {
        push_or_stop!(check_proxy_system(&proxy_vpn));
    }
    if !cancelled {
        push_or_stop!(check_vpn_tunnel(&proxy_vpn, summary.as_ref()));
    }
    if !cancelled {
        push_or_stop!(check_firewall(&firewall));
    }

    // —— L2 ——
    if !cancelled {
        push_or_stop!(check_svc_network());
    }

    // —— L3 reach ——
    let gw = summary
        .as_ref()
        .and_then(|s| s.gateway.clone())
        .or_else(|| route.as_ref().and_then(|r| r.gateway.clone()));
    let route_iface = route.as_ref().and_then(|r| r.interface.clone());
    let mut reach_gw = None;
    let mut reach_ip = None;
    let mut reach_name = None;
    if !cancelled {
        let item = check_reach_gateway(gw.as_deref(), route_iface.as_deref()).await;
        reach_gw = Some(item.clone());
        push_or_stop!(item);
    }
    if !cancelled {
        let item = check_reach_public_ip(&reach_ip_targets).await;
        reach_ip = Some(item.clone());
        push_or_stop!(item);
    }
    if !cancelled {
        let item = check_reach_public_name(&reach_name_targets).await;
        reach_name = Some(item.clone());
        push_or_stop!(item);
    }
    if !cancelled {
        if let (Some(gw), Some(ip), Some(name)) = (&reach_gw, &reach_ip, &reach_name) {
            push_or_stop!(synthesize_dns_vs_ip(gw, ip, name));
        }
    }
    if !cancelled {
        push_or_stop!(check_captive(&defaults.captive_probes).await);
    }
    if !cancelled {
        push_or_stop!(check_public_egress(&defaults.public_ip_apis).await);
    }
    if !cancelled {
        push_or_stop!(check_mtu(defaults.mtu_targets.first()).await);
    }

    let opinions = if cancelled {
        Vec::new()
    } else {
        super::advisor::build_opinions(&items)
    };
    super::session::clear_session(&session_id);
    Ok(HealthScanResult {
        items,
        opinions,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        session_id,
        cancelled,
        command_hint,
    })
}

async fn push<R: Runtime>(
    items: &mut Vec<HealthCheckItem>,
    app: Option<&AppHandle<R>>,
    item: HealthCheckItem,
) {
    if let Some(app) = app {
        let _ = app.emit(HEALTH_ITEM_EVENT, &item);
    }
    items.push(item);
}

fn item(
    key: &str,
    layer: &str,
    status: &str,
    detail: impl Into<Option<String>>,
    hint: impl Into<Option<String>>,
) -> HealthCheckItem {
    HealthCheckItem {
        key: key.into(),
        layer: layer.into(),
        status: status.into(),
        detail: detail.into(),
        command_hint: hint.into(),
    }
}

fn check_link_iface(summary: Option<&LocalNetworkSummary>) -> HealthCheckItem {
    let Some(s) = summary else {
        return item(
            "link.iface",
            "L0",
            "error",
            Some("Failed to read interfaces".into()),
            Some("getLocalNetworkSummary()".into()),
        );
    };
    let active = s.interfaces.iter().filter(|i| !i.is_loopback).count();
    if active == 0 {
        item(
            "link.iface",
            "L0",
            "fail",
            Some("No active non-loopback interface".into()),
            Some("getLocalNetworkSummary()".into()),
        )
    } else {
        item(
            "link.iface",
            "L0",
            "pass",
            Some(format!("{active} active interface(s)")),
            Some("getLocalNetworkSummary()".into()),
        )
    }
}

fn check_wifi_or_wired(summary: Option<&LocalNetworkSummary>) -> HealthCheckItem {
    let Some(s) = summary else {
        return item(
            "link.wifi_or_wired",
            "L0",
            "skip",
            Some("No summary".into()),
            None,
        );
    };
    if let Some(ssid) = &s.wifi_ssid {
        let signal = s
            .wifi_signal_dbm
            .map(|db| format!(", {db} dBm"))
            .unwrap_or_default();
        item(
            "link.wifi_or_wired",
            "L0",
            "pass",
            Some(format!("Wi‑Fi SSID={ssid}{signal}")),
            Some("getLocalNetworkSummary()".into()),
        )
    } else {
        let has_en = s
            .interfaces
            .iter()
            .any(|i| !i.is_loopback && (i.name.starts_with("en") || i.name.starts_with("eth")));
        if has_en {
            item(
                "link.wifi_or_wired",
                "L0",
                "pass",
                Some("Wired or Wi‑Fi without readable SSID".into()),
                Some("getLocalNetworkSummary()".into()),
            )
        } else {
            item(
                "link.wifi_or_wired",
                "L0",
                "warn",
                Some("Medium type unclear".into()),
                Some("getLocalNetworkSummary()".into()),
            )
        }
    }
}

fn check_addr_ipv4(summary: Option<&LocalNetworkSummary>) -> HealthCheckItem {
    let Some(s) = summary else {
        return item("addr.ipv4", "L1", "error", Some("No summary".into()), None);
    };
    match &s.primary_ipv4 {
        None => item(
            "addr.ipv4",
            "L1",
            "fail",
            Some("No IPv4 address".into()),
            Some("getLocalNetworkSummary()".into()),
        ),
        Some(ip) if ip.starts_with("169.254.") => item(
            "addr.ipv4",
            "L1",
            "fail",
            Some(format!("APIPA only: {ip}")),
            Some("getLocalNetworkSummary()".into()),
        ),
        Some(ip) => item(
            "addr.ipv4",
            "L1",
            "pass",
            Some(ip.clone()),
            Some("getLocalNetworkSummary()".into()),
        ),
    }
}

fn check_addr_ipv6(summary: Option<&LocalNetworkSummary>) -> HealthCheckItem {
    let Some(s) = summary else {
        return item("addr.ipv6", "L1", "skip", Some("No summary".into()), None);
    };
    match &s.primary_ipv6 {
        Some(ip) => item(
            "addr.ipv6",
            "L1",
            "pass",
            Some(ip.clone()),
            Some("getLocalNetworkSummary()".into()),
        ),
        None => item(
            "addr.ipv6",
            "L1",
            "warn",
            Some("No global IPv6 address".into()),
            Some("getLocalNetworkSummary()".into()),
        ),
    }
}

fn check_dhcp_or_static() -> HealthCheckItem {
    #[cfg(target_os = "macos")]
    {
        item(
            "addr.dhcp_or_static",
            "L1",
            "skip",
            Some("DHCP vs static not fully readable without iface selection".into()),
            Some("ipconfig getpacket <iface>".into()),
        )
    }
    #[cfg(not(target_os = "macos"))]
    {
        item(
            "addr.dhcp_or_static",
            "L1",
            "skip",
            Some("Not implemented on this platform".into()),
            None,
        )
    }
}

fn check_route_default(
    route: Option<&super::types::DefaultRouteInfo>,
    summary: Option<&LocalNetworkSummary>,
) -> HealthCheckItem {
    let present = route.map(|r| r.present).unwrap_or(false)
        || summary.and_then(|s| s.gateway.as_ref()).is_some();
    let gw = route
        .and_then(|r| r.gateway.clone())
        .or_else(|| summary.and_then(|s| s.gateway.clone()));
    let iface = route.and_then(|r| r.interface.clone());
    if present {
        let mut parts = Vec::new();
        if let Some(g) = gw {
            parts.push(format!("gateway={g}"));
        }
        if let Some(i) = iface {
            parts.push(format!("iface={i}"));
            if super::summary::is_tunnel_iface(&i)
                && route.and_then(|r| r.gateway.as_ref()).is_none()
            {
                parts.push("VPN/tunnel default (no next-hop IP)".into());
            }
        }
        item(
            "route.default",
            "L1",
            "pass",
            Some(if parts.is_empty() {
                "default route present".into()
            } else {
                parts.join("; ")
            }),
            Some("getDefaultRoute()".into()),
        )
    } else {
        item(
            "route.default",
            "L1",
            "fail",
            Some("No default route".into()),
            Some("getDefaultRoute()".into()),
        )
    }
}

fn check_dns_servers(summary: Option<&LocalNetworkSummary>) -> HealthCheckItem {
    let Some(s) = summary else {
        return item(
            "dns.servers",
            "L1",
            "error",
            Some("No summary".into()),
            None,
        );
    };
    if s.dns_servers.is_empty() {
        item(
            "dns.servers",
            "L1",
            "fail",
            Some("DNS server list empty".into()),
            Some("getLocalNetworkSummary()".into()),
        )
    } else {
        item(
            "dns.servers",
            "L1",
            "pass",
            Some(s.dns_servers.join(", ")),
            Some("getLocalNetworkSummary()".into()),
        )
    }
}

fn configured_reach_target<'a>(
    defaults: &'a NetworkProbeDefaultsCatalog,
    preferred_id: &str,
    kind: &str,
) -> Option<&'a ReachTarget> {
    configured_reach_targets(defaults, preferred_id, kind)
        .into_iter()
        .next()
}

fn configured_reach_targets<'a>(
    defaults: &'a NetworkProbeDefaultsCatalog,
    preferred_id: &str,
    kind: &str,
) -> Vec<&'a ReachTarget> {
    let mut targets = defaults
        .reach_targets
        .iter()
        .filter(|target| target.kind == kind)
        .collect::<Vec<_>>();
    targets.sort_by_key(|target| target.id != preferred_id);
    targets
}

async fn check_dns_resolve_name(target: Option<&ReachTarget>) -> HealthCheckItem {
    let Some(target) = target else {
        return item(
            "dns.resolve_name",
            "L1",
            "skip",
            Some("No DNS resolution target is configured".into()),
            None,
        );
    };
    let hostname = target.target.as_str();
    let hint = format!("dnsLookup(local, '{hostname}', {{rrType:'A'}})");
    match super::dns::dns_lookup(hostname.into(), Some("A".into()), None).await {
        Ok(r) if !r.records.is_empty() => item(
            "dns.resolve_name",
            "L1",
            "pass",
            Some(format!(
                "{} record(s) in {:.0}ms",
                r.records.len(),
                r.elapsed_ms
            )),
            Some(hint),
        ),
        Ok(_) => item(
            "dns.resolve_name",
            "L1",
            "fail",
            Some(format!("Empty A answer for {hostname}")),
            Some(hint),
        ),
        Err(e) => item(
            "dns.resolve_name",
            "L1",
            "fail",
            Some(e.to_string()),
            Some(hint),
        ),
    }
}

fn check_hosts_override(hosts: &Option<Vec<super::types::HostsOverride>>) -> HealthCheckItem {
    let Some(hosts) = hosts.as_ref() else {
        return item(
            "hosts.override",
            "L1",
            "skip",
            Some("/etc/hosts could not be read; override check not evaluated".into()),
            Some("checkHostsOverrides()".into()),
        );
    };
    let suspicious: Vec<_> = hosts.iter().filter(|h| h.suspicious).collect();
    if suspicious.is_empty() {
        item(
            "hosts.override",
            "L1",
            "pass",
            Some(format!("{} hosts entries, none suspicious", hosts.len())),
            Some("checkHostsOverrides()".into()),
        )
    } else {
        let detail = suspicious
            .iter()
            .take(3)
            .map(|h| format!("{} -> {}", h.address, h.names.join(",")))
            .collect::<Vec<_>>()
            .join("; ");
        item(
            "hosts.override",
            "L1",
            "fail",
            Some(format!("{} suspicious: {detail}", suspicious.len())),
            Some("checkHostsOverrides()".into()),
        )
    }
}

#[derive(Default, Clone)]
struct ProxyVpnInfo {
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    proxy_status_known: bool,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    proxy_enabled: bool,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    proxy_detail: String,
    /// HTTP(S)/SOCKS proxy points at loopback (local client like Clash / MacPacket).
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    proxy_loopback: bool,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    proxy_endpoint: Option<String>,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    vpn_interfaces_known: bool,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    vpn_ifaces: Vec<String>,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    default_route_known: bool,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    default_via_tunnel: bool,
}

#[cfg(target_os = "macos")]
fn scutil_proxy_value(text: &str, key: &str) -> Option<String> {
    let prefix = format!("{key} : ");
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix(&prefix) {
            let v = rest.trim();
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn is_loopback_host(host: &str) -> bool {
    matches!(
        host.trim().to_ascii_lowercase().as_str(),
        "127.0.0.1" | "::1" | "localhost"
    )
}

fn collect_proxy_vpn(route: Option<super::types::DefaultRouteInfo>) -> ProxyVpnInfo {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let mut info = ProxyVpnInfo::default();
        match super::summary::run_system_network_command(
            "scutil --proxy",
            Command::new("/usr/sbin/scutil").args(["--proxy"]),
        ) {
            Ok(output)
                if output.status.success()
                    && output.stdout.iter().any(|byte| !byte.is_ascii_whitespace()) =>
            {
                info.proxy_status_known = true;
                let text = String::from_utf8_lossy(&output.stdout);
                let http = text.contains("HTTPEnable : 1");
                let https = text.contains("HTTPSEnable : 1");
                let socks = text.contains("SOCKSEnable : 1");
                let pac = text.contains("ProxyAutoConfigEnable : 1");
                info.proxy_enabled = http || https || socks || pac;

                let http_host = scutil_proxy_value(&text, "HTTPProxy");
                let https_host = scutil_proxy_value(&text, "HTTPSProxy");
                let socks_host = scutil_proxy_value(&text, "SOCKSProxy");
                let http_port = scutil_proxy_value(&text, "HTTPPort");
                let https_port = scutil_proxy_value(&text, "HTTPSPort");
                let socks_port = scutil_proxy_value(&text, "SOCKSPort");

                let endpoint = if https && https_host.is_some() {
                    Some(format!(
                        "{}:{}",
                        https_host.as_deref().unwrap_or("?"),
                        https_port.as_deref().unwrap_or("?")
                    ))
                } else if http && http_host.is_some() {
                    Some(format!(
                        "{}:{}",
                        http_host.as_deref().unwrap_or("?"),
                        http_port.as_deref().unwrap_or("?")
                    ))
                } else if socks && socks_host.is_some() {
                    Some(format!(
                        "socks://{}:{}",
                        socks_host.as_deref().unwrap_or("?"),
                        socks_port.as_deref().unwrap_or("?")
                    ))
                } else {
                    None
                };
                info.proxy_loopback = [
                    http_host.as_deref(),
                    https_host.as_deref(),
                    socks_host.as_deref(),
                ]
                .into_iter()
                .flatten()
                .any(is_loopback_host);
                info.proxy_endpoint = endpoint;
                info.proxy_detail = match &info.proxy_endpoint {
                    Some(ep) if info.proxy_loopback => {
                        format!("HTTP={http} HTTPS={https} SOCKS={socks} PAC={pac}; local={ep}")
                    }
                    Some(ep) => {
                        format!("HTTP={http} HTTPS={https} SOCKS={socks} PAC={pac}; endpoint={ep}")
                    }
                    None => format!("HTTP={http} HTTPS={https} SOCKS={socks} PAC={pac}"),
                };
            }
            Ok(_) | Err(_) => {}
        }
        if let Ok(ifaces) = if_addrs::get_if_addrs() {
            info.vpn_interfaces_known = true;
            for iface in ifaces {
                if super::summary::is_tunnel_iface(&iface.name)
                    && !info.vpn_ifaces.contains(&iface.name)
                {
                    info.vpn_ifaces.push(iface.name);
                }
            }
        }
        if let Some(route) = route {
            info.default_route_known = true;
            if let Some(iface) = route.interface {
                info.default_via_tunnel = super::summary::is_tunnel_iface(&iface);
            }
        }
        info
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = route;
        ProxyVpnInfo::default()
    }
}

fn check_proxy_system(info: &ProxyVpnInfo) -> HealthCheckItem {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = info;
        item(
            "proxy.system",
            "L1",
            "skip",
            Some("Proxy probe only implemented on macOS for MVP".into()),
            None,
        )
    }
    #[cfg(target_os = "macos")]
    {
        if !info.proxy_status_known {
            item(
                "proxy.system",
                "L1",
                "error",
                None,
                Some("scutil --proxy".into()),
            )
        } else if info.proxy_enabled {
            let detail = if info.proxy_loopback {
                format!(
                    "Local system proxy ({}); real site latency is via this client, not ICMP",
                    info.proxy_detail
                )
            } else {
                format!("System proxy enabled ({})", info.proxy_detail)
            };
            item(
                "proxy.system",
                "L1",
                "warn",
                Some(detail),
                Some("scutil --proxy".into()),
            )
        } else {
            item(
                "proxy.system",
                "L1",
                "pass",
                Some(format!("No system proxy ({})", info.proxy_detail)),
                Some("scutil --proxy".into()),
            )
        }
    }
}

async fn check_dns_fake_ip(
    summary: Option<&LocalNetworkSummary>,
    proxy: &ProxyVpnInfo,
) -> HealthCheckItem {
    let hint =
        "system lookup (getaddrinfo) for github.com/cloudflare.com + iface 198.18/15".to_string();
    let mut hits: Vec<String> = Vec::new();

    if let Some(s) = summary {
        for iface in &s.interfaces {
            for addr in &iface.addrs {
                if super::fake_ip::is_fake_ip_str(addr) {
                    hits.push(format!("{addr}@{}", iface.name));
                }
            }
        }
    }

    for host in ["github.com", "cloudflare.com", "www.apple.com"] {
        if let Some(ip) = super::fake_ip::host_resolves_to_fake_ip(host).await {
            hits.push(format!("{host}->{ip}"));
        }
    }

    if hits.is_empty() {
        return item(
            "dns.fake_ip",
            "L1",
            "pass",
            Some("No Fake-IP (198.18/15) answers or TUN pool addrs".into()),
            Some(hint),
        );
    }

    let mut detail = format!(
        "Fake-IP / enhanced mode likely: {} — ICMP RTT to these names is local TUN, not Internet",
        hits.into_iter().take(6).collect::<Vec<_>>().join("; ")
    );
    if proxy.proxy_loopback {
        if let Some(ep) = &proxy.proxy_endpoint {
            detail.push_str(&format!("; local proxy {ep}"));
        } else {
            detail.push_str("; local system proxy on");
        }
    }
    item("dns.fake_ip", "L1", "warn", Some(detail), Some(hint))
}

fn check_vpn_tunnel(
    info: &ProxyVpnInfo,
    _summary: Option<&LocalNetworkSummary>,
) -> HealthCheckItem {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (info, _summary);
        item(
            "vpn.tunnel",
            "L1",
            "skip",
            Some("VPN probe only implemented on macOS for MVP".into()),
            None,
        )
    }
    #[cfg(target_os = "macos")]
    {
        if info.default_via_tunnel {
            item(
                "vpn.tunnel",
                "L1",
                "warn",
                Some(format!(
                    "Default route via tunnel; ifaces={}",
                    info.vpn_ifaces.join(",")
                )),
                Some("getDefaultRoute() + if_addrs".into()),
            )
        } else if !info.vpn_ifaces.is_empty() {
            item(
                "vpn.tunnel",
                "L1",
                "warn",
                Some(format!(
                    "VPN-like ifaces present: {}",
                    info.vpn_ifaces.join(",")
                )),
                Some("if_addrs".into()),
            )
        } else if !info.vpn_interfaces_known || !info.default_route_known {
            item(
                "vpn.tunnel",
                "L1",
                "error",
                None,
                Some("if_addrs + getDefaultRoute()".into()),
            )
        } else {
            item(
                "vpn.tunnel",
                "L1",
                "pass",
                Some("No VPN-like tunnel detected".into()),
                Some("if_addrs".into()),
            )
        }
    }
}

fn check_firewall(status: &Option<String>) -> HealthCheckItem {
    match status {
        Some(s) => item(
            "firewall.status",
            "L1",
            "pass",
            Some(format!("firewall={s}")),
            Some("getFirewallStatus()".into()),
        ),
        None => item(
            "firewall.status",
            "L1",
            "skip",
            Some("Firewall status unavailable".into()),
            Some("getFirewallStatus()".into()),
        ),
    }
}

fn check_svc_network() -> HealthCheckItem {
    item(
        "svc.network",
        "L2",
        "skip",
        Some("Platform network service health not probed in MVP".into()),
        None,
    )
}

async fn check_reach_gateway(gateway: Option<&str>, route_iface: Option<&str>) -> HealthCheckItem {
    if let Some(gw) = gateway {
        let hint = format!("pingHost(local, '{gw}', {{count:1}})");
        return match super::ping::ping_host(gw.to_string(), Some(1), Some(200)).await {
            Ok(r) if r.packets_received > 0 => item(
                "reach.gateway",
                "L3",
                "pass",
                Some(format!("rtt≈{:.1}ms", r.avg_rtt_ms.unwrap_or(0.0))),
                Some(hint),
            ),
            Ok(r) => item(
                "reach.gateway",
                "L3",
                "fail",
                Some(format!("loss={:.0}%", r.loss_percent)),
                Some(hint),
            ),
            Err(e) => item(
                "reach.gateway",
                "L3",
                "fail",
                Some(e.to_string()),
                Some(hint),
            ),
        };
    }

    // VPN/utun defaults often have interface but no next-hop IP — not a missing LAN gateway.
    if let Some(iface) = route_iface.filter(|i| super::summary::is_tunnel_iface(i)) {
        return item(
            "reach.gateway",
            "L3",
            "skip",
            Some(format!(
                "Default via tunnel iface {iface}; no IPv4 next-hop to ICMP"
            )),
            Some("getDefaultRoute()".into()),
        );
    }

    item(
        "reach.gateway",
        "L3",
        "fail",
        Some("No gateway to ping".into()),
        Some("pingHost(local, <gateway>)".into()),
    )
}

async fn check_reach_public_ip(targets: &[&ReachTarget]) -> HealthCheckItem {
    if targets.is_empty() {
        return item(
            "reach.public_ip",
            "L3",
            "skip",
            Some("No public IPv4 reachability target is configured".into()),
            None,
        );
    }
    let mut failures = Vec::new();
    for target in targets {
        let host = target.target.as_str();
        let hint = format!("pingHost(local, '{host}', {{count:1}})");
        match super::ping::ping_host(host.into(), Some(1), Some(200)).await {
            Ok(result) if result.packets_received > 0 => {
                return item(
                    "reach.public_ip",
                    "L3",
                    "pass",
                    Some(format!(
                        "{} reachable; rtt≈{:.1}ms",
                        target.id,
                        result.avg_rtt_ms.unwrap_or(0.0)
                    )),
                    Some(hint),
                );
            }
            Ok(result) => failures.push(format!("{} loss={:.0}%", target.id, result.loss_percent)),
            Err(error) => failures.push(format!("{}: {error}", target.id)),
        }
    }
    item(
        "reach.public_ip",
        "L3",
        "fail",
        Some(format!(
            "All configured IPv4 targets failed: {}",
            failures.join("; ")
        )),
        Some("pingHost(local, <configured IPv4 targets>)".into()),
    )
}

async fn check_reach_public_name(targets: &[&ReachTarget]) -> HealthCheckItem {
    if targets.is_empty() {
        return item(
            "reach.public_name",
            "L3",
            "skip",
            Some("No public hostname reachability target is configured".into()),
            None,
        );
    }
    let mut failures = Vec::new();
    for target in targets {
        let hostname = target.target.as_str();
        // Prefer HTTP on domain so we still get signal when ICMP is blocked.
        // Under Fake-IP, ICMP only hits the local TUN — never treat that as Internet OK.
        let hint = format!("probeTarget(local, '{hostname}') / ping {hostname}");
        let fake = super::fake_ip::host_resolves_to_fake_ip(hostname).await;
        if fake.is_none() {
            match super::ping::ping_host(hostname.into(), Some(1), Some(200)).await {
                Ok(result) if result.packets_received > 0 => {
                    return item(
                        "reach.public_name",
                        "L3",
                        "pass",
                        Some(format!(
                            "{} ICMP ok rtt≈{:.1}ms",
                            target.id,
                            result.avg_rtt_ms.unwrap_or(0.0)
                        )),
                        Some(hint),
                    );
                }
                Ok(result) => failures.push(format!(
                    "{} ICMP loss={:.0}%",
                    target.id, result.loss_percent
                )),
                Err(error) => failures.push(format!("{} ICMP: {error}", target.id)),
            }
        }
        let (http, _) = super::probe::probe_http_target(hostname).await;
        match http {
            Some(h) if h.ok => {
                let mut detail = format!(
                    "{} HTTP {} TTFB≈{:.0}ms",
                    target.id,
                    h.status.unwrap_or(0),
                    h.ttfb_ms.unwrap_or(0.0)
                );
                if let Some(ip) = fake {
                    detail.push_str(&format!(" (Fake-IP {ip}; ICMP skipped)"));
                }
                return item("reach.public_name", "L3", "pass", Some(detail), Some(hint));
            }
            Some(h) => failures.push(format!(
                "{} HTTP: {}",
                target.id,
                h.error
                    .unwrap_or_else(|| format!("HTTP {}", h.status.unwrap_or(0)))
            )),
            None => failures.push(format!("{} HTTP: no response", target.id)),
        }
    }
    item(
        "reach.public_name",
        "L3",
        "fail",
        Some(format!(
            "All configured host targets failed: {}",
            failures.join("; ")
        )),
        Some("probeTarget(local, <configured host targets>)".into()),
    )
}

fn synthesize_dns_vs_ip(
    gw: &HealthCheckItem,
    ip: &HealthCheckItem,
    name: &HealthCheckItem,
) -> HealthCheckItem {
    let g = gw.status.as_str();
    let p = ip.status.as_str();
    let n = name.status.as_str();
    // Treat gateway skip (e.g. VPN utun without next-hop) as non-LAN-failure for synthesis.
    let g_ok = g == "pass" || g == "skip";
    let (status, detail) = match (g_ok, g, p, n) {
        (false, "fail", _, _) => (
            "fail",
            "Gateway unreachable → LAN / gateway / link issue".to_string(),
        ),
        (true, _, "fail", "fail") | (true, _, "fail", _) => (
            "fail",
            "Public IP unreachable → uplink / ISP / firewall".to_string(),
        ),
        (true, _, "pass", "fail") => (
            "fail",
            "DNS or hosts problem (IP ok, name fail)".to_string(),
        ),
        (true, _, "pass", "pass") => (
            "pass",
            if g == "skip" {
                "Public path OK (gateway ICMP skipped — tunnel default)".to_string()
            } else {
                "Basic reachability OK (gateway + IP + name)".to_string()
            },
        ),
        _ => ("warn", format!("Mixed signals gw={g} ip={p} name={n}")),
    };
    item(
        "diff.dns_vs_ip",
        "L3",
        status,
        Some(detail),
        Some("synthetic (reach.gateway + reach.public_ip + reach.public_name)".into()),
    )
}

async fn check_captive(probes: &[super::types::CaptiveProbe]) -> HealthCheckItem {
    let result = super::offline::detect_captive_portal_with_probes(probes).await;
    let status = match result.status.as_str() {
        "open" => "pass",
        "captive" => "fail",
        "offline" => "skip",
        _ => "warn",
    };
    item(
        "reach.captive",
        "L3",
        status,
        result.detail,
        Some(result.command_hint),
    )
}

async fn check_public_egress(apis: &[PublicIpApi]) -> HealthCheckItem {
    if apis.is_empty() {
        return item(
            "reach.public_egress",
            "L3",
            "skip",
            Some("No public IP API is configured".into()),
            None,
        );
    }
    let client = match super::offline::public_ip_client() {
        Ok(client) => client,
        Err(error) => {
            return item(
                "reach.public_egress",
                "L3",
                "error",
                Some(error.to_string()),
                Some("getPublicIpInfo(local)".into()),
            );
        }
    };
    let mut failures = Vec::new();
    for api in apis {
        match super::offline::fetch_public_ip_api(&client, api).await {
            Ok(result) => {
                return item(
                    "reach.public_egress",
                    "L3",
                    "pass",
                    Some(format!(
                        "{} returned a valid IP (HTTP {}, TTFB≈{:.0}ms)",
                        api.id, result.status, result.elapsed_ms
                    )),
                    Some(format!("getPublicIpInfo(local) via {}", api.id)),
                );
            }
            Err(error) => failures.push(format!("{}: {error}", api.id)),
        }
    }
    item(
        "reach.public_egress",
        "L3",
        "fail",
        Some(format!(
            "All public IP APIs failed: {}",
            failures.join("; ")
        )),
        Some("getPublicIpInfo(local)".into()),
    )
}

async fn check_mtu(target: Option<&MtuTarget>) -> HealthCheckItem {
    let Some(target) = target else {
        return item(
            "reach.mtu",
            "L3",
            "skip",
            Some("No path MTU target is configured".into()),
            None,
        );
    };
    let hint = format!("probePathMtu(local, '{}')", target.target);
    match super::mtu::probe_path_mtu_health(target.target.clone()).await {
        Ok(r) => {
            let status = match r.status.as_str() {
                "ok" => "pass",
                "blackhole" => "warn",
                "unsupported" => "skip",
                "degraded" => "warn",
                _ => "fail",
            };
            let detail = if r.status == "unsupported" {
                None
            } else {
                match (r.path_mtu, r.message) {
                    (Some(mtu), Some(msg)) => Some(format!("pathMtu={mtu}; {msg}")),
                    (Some(mtu), None) => Some(format!("pathMtu={mtu}")),
                    (None, Some(msg)) => Some(msg),
                    (None, None) => Some(r.status),
                }
            };
            item("reach.mtu", "L3", status, detail, Some(hint))
        }
        Err(e) => item("reach.mtu", "L3", "error", Some(e.to_string()), Some(hint)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hi(key: &str, status: &str, detail: &str) -> HealthCheckItem {
        item(key, "L3", status, Some(detail.into()), None)
    }

    #[test]
    fn configured_reach_target_prefers_the_named_target_then_falls_back_by_kind() {
        let defaults = NetworkProbeDefaultsCatalog {
            schema_version: 1,
            dns_presets: vec![],
            reach_targets: vec![
                ReachTarget {
                    id: "alternate".into(),
                    kind: "name".into(),
                    target: "example.org".into(),
                },
                ReachTarget {
                    id: "dns-resolve-name".into(),
                    kind: "name".into(),
                    target: "resolver.example.org".into(),
                },
            ],
            captive_probes: vec![],
            public_ip_apis: vec![],
            site_packs: Default::default(),
            mtu_targets: vec![],
        };

        assert_eq!(
            configured_reach_target(&defaults, "dns-resolve-name", "name")
                .map(|target| target.target.as_str()),
            Some("resolver.example.org")
        );
        assert_eq!(
            configured_reach_target(&defaults, "missing", "name")
                .map(|target| target.target.as_str()),
            Some("example.org")
        );
        assert!(configured_reach_target(&defaults, "missing", "ipv4").is_none());
    }

    #[test]
    fn route_default_pass_when_tunnel_iface_only() {
        let route = super::super::types::DefaultRouteInfo {
            gateway: None,
            interface: Some("utun4".into()),
            present: true,
        };
        let r = check_route_default(Some(&route), None);
        assert_eq!(r.status, "pass");
        assert!(r.detail.as_deref().unwrap_or("").contains("utun4"));
    }

    #[test]
    fn route_default_fail_when_absent() {
        let route = super::super::types::DefaultRouteInfo {
            gateway: None,
            interface: None,
            present: false,
        };
        let r = check_route_default(Some(&route), None);
        assert_eq!(r.status, "fail");
    }

    #[test]
    fn dns_vs_ip_tunnel_skip_plus_public_ok_is_pass() {
        let r = synthesize_dns_vs_ip(
            &hi("reach.gateway", "skip", "tunnel"),
            &hi("reach.public_ip", "pass", "ok"),
            &hi("reach.public_name", "pass", "ok"),
        );
        assert_eq!(r.status, "pass");
        assert!(!r.detail.as_deref().unwrap_or("").contains("LAN"));
    }

    #[test]
    fn dns_vs_ip_gateway_fail_still_lan() {
        let r = synthesize_dns_vs_ip(
            &hi("reach.gateway", "fail", "No gateway"),
            &hi("reach.public_ip", "pass", "ok"),
            &hi("reach.public_name", "pass", "ok"),
        );
        assert_eq!(r.status, "fail");
        assert!(r.detail.as_deref().unwrap_or("").contains("LAN"));
    }

    #[test]
    fn proxy_system_does_not_report_a_failed_read_as_no_proxy() {
        let result = check_proxy_system(&ProxyVpnInfo::default());
        #[cfg(target_os = "macos")]
        assert_eq!(result.status, "error");
        #[cfg(not(target_os = "macos"))]
        assert_eq!(result.status, "skip");
    }

    #[test]
    fn proxy_system_result_is_independent_from_vpn_probe_failures() {
        let result = check_proxy_system(&ProxyVpnInfo {
            proxy_status_known: true,
            vpn_interfaces_known: false,
            default_route_known: false,
            ..ProxyVpnInfo::default()
        });
        #[cfg(target_os = "macos")]
        {
            assert_eq!(result.key, "proxy.system");
            assert_eq!(result.status, "pass");
        }
        #[cfg(not(target_os = "macos"))]
        assert_eq!(result.status, "skip");
    }

    #[test]
    fn vpn_tunnel_does_not_report_failed_interface_or_route_reads_as_clear() {
        let result = check_vpn_tunnel(&ProxyVpnInfo::default(), None);
        #[cfg(target_os = "macos")]
        assert_eq!(result.status, "error");
        #[cfg(not(target_os = "macos"))]
        assert_eq!(result.status, "skip");
    }
}
