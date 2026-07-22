use super::types::{DefaultRouteInfo, LocalNetworkSummary, NetworkInterfaceInfo};
use crate::error::{AppError, AppResult};
use std::process::Command;

pub fn collect_local_summary() -> AppResult<LocalNetworkSummary> {
    let ifaces = if_addrs::get_if_addrs().map_err(|e| AppError::io(format!("if_addrs: {e}")))?;

    let mut interfaces: Vec<NetworkInterfaceInfo> = Vec::new();
    let mut primary_ipv4 = None;
    let mut primary_ipv6 = None;

    for iface in ifaces {
        let is_loopback = iface.is_loopback();
        let addr = iface.ip().to_string();
        let name = iface.name.clone();

        if let Some(existing) = interfaces.iter_mut().find(|i| i.name == name) {
            existing.addrs.push(addr.clone());
        } else {
            interfaces.push(NetworkInterfaceInfo {
                name: name.clone(),
                addrs: vec![addr.clone()],
                is_loopback,
            });
        }

        if !is_loopback {
            match iface.addr {
                if_addrs::IfAddr::V4(_) if primary_ipv4.is_none() => {
                    primary_ipv4 = Some(addr);
                }
                if_addrs::IfAddr::V6(_) if primary_ipv6.is_none() && !addr.starts_with("fe80:") => {
                    primary_ipv6 = Some(addr);
                }
                _ => {}
            }
        }
    }

    let route = collect_default_route().unwrap_or(DefaultRouteInfo {
        gateway: None,
        interface: None,
        present: false,
    });

    let dns_servers = collect_dns_servers();
    let (wifi_ssid, wifi_signal_dbm) = collect_wifi_info();

    Ok(LocalNetworkSummary {
        interfaces,
        primary_ipv4,
        primary_ipv6,
        gateway: route.gateway,
        dns_servers,
        wifi_ssid,
        wifi_signal_dbm,
    })
}

pub fn collect_default_route() -> AppResult<DefaultRouteInfo> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("route")
            .args(["-n", "get", "default"])
            .output()
            .map_err(|e| AppError::io(format!("route: {e}")))?;
        let text = String::from_utf8_lossy(&output.stdout);
        let mut gateway = None;
        let mut interface = None;
        for line in text.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("gateway:") {
                let g = rest.trim();
                if !g.is_empty() {
                    gateway = Some(g.to_string());
                }
            }
            if let Some(rest) = line.strip_prefix("interface:") {
                let i = rest.trim();
                if !i.is_empty() {
                    interface = Some(i.to_string());
                }
            }
        }
        let present = gateway.is_some();
        Ok(DefaultRouteInfo {
            gateway,
            interface,
            present,
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(AppError::unsupported(
            "Default route probe is only implemented on macOS for MVP",
        ))
    }
}

fn collect_dns_servers() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("scutil").args(["--dns"]).output();
        let Ok(output) = output else {
            return Vec::new();
        };
        let text = String::from_utf8_lossy(&output.stdout);
        let mut servers = Vec::new();
        for line in text.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("nameserver[") {
                if let Some((_, value)) = rest.split_once(':') {
                    let ip = value.trim();
                    if !ip.is_empty() && !servers.contains(&ip.to_string()) {
                        servers.push(ip.to_string());
                    }
                }
            }
            // Prefer the first resolver block only (usually the active one).
            if line.starts_with("resolver #2") && !servers.is_empty() {
                break;
            }
        }
        servers
    }
    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

fn collect_wifi_info() -> (Option<String>, Option<i32>) {
    #[cfg(target_os = "macos")]
    {
        let airport = "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport";
        let output = Command::new(airport).args(["-I"]).output();
        let Ok(output) = output else {
            return (None, None);
        };
        let text = String::from_utf8_lossy(&output.stdout);
        let mut ssid = None;
        let mut signal = None;
        for line in text.lines() {
            let parts: Vec<&str> = line.splitn(2, ':').collect();
            if parts.len() != 2 {
                continue;
            }
            let key = parts[0].trim();
            let val = parts[1].trim();
            match key {
                "SSID" => ssid = Some(val.to_string()),
                "agrCtlRSSI" => signal = val.parse().ok(),
                _ => {}
            }
        }
        (ssid, signal)
    }
    #[cfg(not(target_os = "macos"))]
    {
        (None, None)
    }
}
