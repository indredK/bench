use super::types::{HealthCheckItem, HealthScanResult, LocalNetworkSummary, ScanSessionEvent};
use crate::error::AppResult;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Runtime};

pub const HEALTH_ITEM_EVENT: &str = "network-probe:health-item";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

pub async fn run_health_scan<R: Runtime>(
    app: Option<&AppHandle<R>>,
) -> AppResult<HealthScanResult> {
    let started = Instant::now();
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
    let hosts = tauri::async_runtime::spawn_blocking(super::hosts::check_hosts_overrides)
        .await
        .ok()
        .and_then(|r| r.ok())
        .unwrap_or_default();
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
    let proxy_vpn = tauri::async_runtime::spawn_blocking(collect_proxy_vpn)
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
        push_or_stop!(check_dns_resolve_name().await);
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
        let item = check_reach_public_ip().await;
        reach_ip = Some(item.clone());
        push_or_stop!(item);
    }
    if !cancelled {
        let item = check_reach_public_name().await;
        reach_name = Some(item.clone());
        push_or_stop!(item);
    }
    if !cancelled {
        if let (Some(gw), Some(ip), Some(name)) = (&reach_gw, &reach_ip, &reach_name) {
            push_or_stop!(synthesize_dns_vs_ip(gw, ip, name));
        }
    }
    if !cancelled {
        push_or_stop!(check_captive().await);
    }
    if !cancelled {
        push_or_stop!(check_public_egress().await);
    }
    if !cancelled {
        push_or_stop!(check_mtu().await);
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

async fn check_dns_resolve_name() -> HealthCheckItem {
    let hint = "dnsLookup(local, 'cloudflare.com', {rrType:'A'})".to_string();
    match super::dns::dns_lookup("cloudflare.com".into(), Some("A".into()), None).await {
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
            Some("Empty A answer for cloudflare.com".into()),
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

fn check_hosts_override(hosts: &[super::types::HostsOverride]) -> HealthCheckItem {
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
    proxy_enabled: bool,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    proxy_detail: String,
    /// HTTP(S)/SOCKS proxy points at loopback (local client like Clash / MacPacket).
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    proxy_loopback: bool,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    proxy_endpoint: Option<String>,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    vpn_ifaces: Vec<String>,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    default_via_tunnel: bool,
}

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

fn is_loopback_host(host: &str) -> bool {
    matches!(
        host.trim().to_ascii_lowercase().as_str(),
        "127.0.0.1" | "::1" | "localhost"
    )
}

fn collect_proxy_vpn() -> ProxyVpnInfo {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let mut info = ProxyVpnInfo::default();
        if let Ok(output) = Command::new("scutil").args(["--proxy"]).output() {
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
        if let Ok(ifaces) = if_addrs::get_if_addrs() {
            for iface in ifaces {
                if super::summary::is_tunnel_iface(&iface.name)
                    && !info.vpn_ifaces.contains(&iface.name)
                {
                    info.vpn_ifaces.push(iface.name);
                }
            }
        }
        if let Ok(route) = super::summary::collect_default_route() {
            if let Some(iface) = route.interface {
                info.default_via_tunnel = super::summary::is_tunnel_iface(&iface);
            }
        }
        info
    }
    #[cfg(not(target_os = "macos"))]
    {
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
        if info.proxy_enabled {
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

async fn check_reach_public_ip() -> HealthCheckItem {
    let target = "1.1.1.1";
    let hint = format!("pingHost(local, '{target}', {{count:1}})");
    match super::ping::ping_host(target.into(), Some(1), Some(200)).await {
        Ok(r) if r.packets_received > 0 => item(
            "reach.public_ip",
            "L3",
            "pass",
            Some(format!("rtt≈{:.1}ms", r.avg_rtt_ms.unwrap_or(0.0))),
            Some(hint),
        ),
        Ok(r) => item(
            "reach.public_ip",
            "L3",
            "fail",
            Some(format!("loss={:.0}%", r.loss_percent)),
            Some(hint),
        ),
        Err(e) => item(
            "reach.public_ip",
            "L3",
            "fail",
            Some(e.to_string()),
            Some(hint),
        ),
    }
}

async fn check_reach_public_name() -> HealthCheckItem {
    // Prefer HTTP on domain so we still get signal when ICMP is blocked.
    // Under Fake-IP, ICMP only hits the local TUN — never treat that as Internet OK.
    let hint = "probeTarget(local, 'https://cloudflare.com') / ping cloudflare.com".to_string();
    let fake = super::fake_ip::host_resolves_to_fake_ip("cloudflare.com").await;
    if fake.is_none() {
        let ping = super::ping::ping_host("cloudflare.com".into(), Some(1), Some(200)).await;
        if let Ok(r) = &ping {
            if r.packets_received > 0 {
                return item(
                    "reach.public_name",
                    "L3",
                    "pass",
                    Some(format!("ICMP ok rtt≈{:.1}ms", r.avg_rtt_ms.unwrap_or(0.0))),
                    Some(hint),
                );
            }
        }
    }
    let (http, _) = super::probe::probe_http_target("https://cloudflare.com").await;
    match http {
        Some(h) if h.ok => {
            let mut detail = format!(
                "HTTP {} TTFB≈{:.0}ms",
                h.status.unwrap_or(0),
                h.ttfb_ms.unwrap_or(0.0)
            );
            if let Some(ip) = fake {
                detail.push_str(&format!(" (Fake-IP {ip}; ICMP skipped)"));
            }
            item("reach.public_name", "L3", "pass", Some(detail), Some(hint))
        }
        Some(h) => item(
            "reach.public_name",
            "L3",
            "fail",
            h.error.or_else(|| Some("HTTP failed".into())),
            Some(hint),
        ),
        None => item(
            "reach.public_name",
            "L3",
            "fail",
            Some(if fake.is_some() {
                "HTTP failed under Fake-IP (ICMP not authoritative)".into()
            } else {
                "ICMP and HTTP both failed".into()
            }),
            Some(hint),
        ),
    }
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

async fn check_captive() -> HealthCheckItem {
    let hint = "detectCaptivePortal(local) via captive.apple.com".to_string();
    let (http, _) =
        super::probe::probe_http_target("http://captive.apple.com/hotspot-detect.html").await;
    match http {
        Some(h) if h.ok && h.status == Some(200) => {
            let final_url = h.final_url.unwrap_or_default();
            if final_url.contains("captive.apple.com") || final_url.is_empty() {
                item(
                    "reach.captive",
                    "L3",
                    "pass",
                    Some("No captive portal detected (apple probe)".into()),
                    Some(hint),
                )
            } else {
                item(
                    "reach.captive",
                    "L3",
                    "warn",
                    Some(format!("Unexpected redirect to {final_url}")),
                    Some(hint),
                )
            }
        }
        Some(h) if h.status == Some(302) || h.status == Some(301) => item(
            "reach.captive",
            "L3",
            "fail",
            Some(format!(
                "Possible captive portal (HTTP {})",
                h.status.unwrap_or(0)
            )),
            Some(hint),
        ),
        Some(h) => item(
            "reach.captive",
            "L3",
            "warn",
            h.error.or_else(|| {
                Some(format!(
                    "Unexpected status {}",
                    h.status
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| "?".into())
                ))
            }),
            Some(hint),
        ),
        None => item(
            "reach.captive",
            "L3",
            "skip",
            Some("Captive probe unavailable".into()),
            Some(hint),
        ),
    }
}

async fn check_public_egress() -> HealthCheckItem {
    let hint = "getPublicIpInfo(local) via api.ipify.org".to_string();
    let (http, _) = super::probe::probe_http_target("https://api.ipify.org?format=json").await;
    match http {
        Some(h) if h.ok => item(
            "reach.public_egress",
            "L3",
            "pass",
            Some(format!(
                "Egress API reachable (HTTP {}, TTFB≈{:.0}ms)",
                h.status.unwrap_or(0),
                h.ttfb_ms.unwrap_or(0.0)
            )),
            Some(hint),
        ),
        Some(h) => item(
            "reach.public_egress",
            "L3",
            "fail",
            h.error.or_else(|| Some("Egress API failed".into())),
            Some(hint),
        ),
        None => item(
            "reach.public_egress",
            "L3",
            "skip",
            Some("Egress probe unavailable".into()),
            Some(hint),
        ),
    }
}

async fn check_mtu() -> HealthCheckItem {
    let hint = "probePathMtu(local, '1.1.1.1')";
    match super::mtu::probe_path_mtu_health().await {
        Ok(r) => {
            let status = match r.status.as_str() {
                "ok" => "pass",
                "blackhole" => "warn",
                "unsupported" => "skip",
                "degraded" => "warn",
                _ => "fail",
            };
            let detail = match (r.path_mtu, r.message) {
                (Some(mtu), Some(msg)) => format!("pathMtu={mtu}; {msg}"),
                (Some(mtu), None) => format!("pathMtu={mtu}"),
                (None, Some(msg)) => msg,
                (None, None) => r.status,
            };
            item("reach.mtu", "L3", status, Some(detail), Some(hint.into()))
        }
        Err(e) => item(
            "reach.mtu",
            "L3",
            "error",
            Some(e.to_string()),
            Some(hint.into()),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hi(key: &str, status: &str, detail: &str) -> HealthCheckItem {
        item(key, "L3", status, Some(detail.into()), None)
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
}
