use super::probe::probe_http_target;
use super::types::{CaptivePortalResult, ProxyVpnStatus, PublicIpInfo};
use crate::error::AppResult;
use std::process::Command;

pub async fn detect_captive_portal() -> AppResult<CaptivePortalResult> {
    let probes = [
        (
            "apple",
            "http://captive.apple.com/hotspot-detect.html",
            200u16,
        ),
        (
            "gstatic",
            "http://connectivitycheck.gstatic.com/generate_204",
            204u16,
        ),
    ];

    let mut details = Vec::new();
    let mut captive_hits = 0usize;
    let mut ok_hits = 0usize;
    let mut fail_hits = 0usize;

    for (id, url, expect) in probes {
        let (http, _) = probe_http_target(url).await;
        match http {
            Some(h) if h.ok && h.status == Some(expect) => {
                ok_hits += 1;
                details.push(format!("{id}: ok status={}", expect));
            }
            Some(h) if h.status == Some(301) || h.status == Some(302) || h.status == Some(307) => {
                captive_hits += 1;
                details.push(format!(
                    "{id}: redirect status={} final={}",
                    h.status.unwrap_or(0),
                    h.final_url.unwrap_or_default()
                ));
            }
            Some(h) => {
                fail_hits += 1;
                details.push(format!(
                    "{id}: status={:?} err={}",
                    h.status,
                    h.error.unwrap_or_default()
                ));
            }
            None => {
                fail_hits += 1;
                details.push(format!("{id}: no response"));
            }
        }
    }

    let (status, message) = if captive_hits > 0 && ok_hits == 0 {
        (
            "captive",
            "Likely captive portal (redirected connectivity probes)".to_string(),
        )
    } else if ok_hits > 0 {
        (
            "open",
            "Connectivity probes matched expected responses".to_string(),
        )
    } else if fail_hits == probes.len() {
        (
            "offline",
            "All captive probes failed — likely offline / no route".to_string(),
        )
    } else {
        ("unknown", "Mixed captive probe results".to_string())
    };

    Ok(CaptivePortalResult {
        status: status.into(),
        detail: Some(format!("{message}; {}", details.join("; "))),
        command_hint: "detectCaptivePortal(local)".into(),
    })
}

pub async fn get_public_ip_info() -> AppResult<PublicIpInfo> {
    let apis = [
        ("ipify", "https://api.ipify.org?format=json"),
        ("ifconfig-me", "https://ifconfig.me/ip"),
        ("seeip", "https://ip.seeip.org/jsonip"),
    ];

    for (id, url) in apis {
        let (http, _) = probe_http_target(url).await;
        let Some(h) = http else { continue };
        if !h.ok {
            continue;
        }
        // Body was drained in probe_http — re-fetch for content.
        if let Ok(client) = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .user_agent("Bench-NetworkProbe/1.0")
            .build()
        {
            if let Ok(resp) = client.get(url).send().await {
                if let Ok(text) = resp.text().await {
                    let ip = extract_ip(&text);
                    if let Some(ip) = ip {
                        let mut info = PublicIpInfo {
                            ip: Some(ip.clone()),
                            source: Some(id.into()),
                            asn: None,
                            org: None,
                            detail: Some(text.chars().take(120).collect()),
                            command_hint: "getPublicIpInfo(local)".into(),
                        };
                        if let Ok(addr) = ip.parse::<std::net::IpAddr>() {
                            if let Some(asn) = super::asn::lookup_asn(addr).await {
                                info.asn = Some(format!("AS{}", asn.asn));
                                info.org = asn.as_name.or(asn.prefix);
                            }
                        }
                        return Ok(info);
                    }
                }
            }
        }
    }

    Ok(PublicIpInfo {
        ip: None,
        source: None,
        asn: None,
        org: None,
        detail: Some("All public IP APIs failed".into()),
        command_hint: "getPublicIpInfo(local)".into(),
    })
}

fn extract_ip(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(ip) = v.get("ip").and_then(|x| x.as_str()) {
            return Some(ip.to_string());
        }
    }
    let candidate = trimmed.lines().next()?.trim();
    if candidate.parse::<std::net::IpAddr>().is_ok() {
        Some(candidate.to_string())
    } else {
        None
    }
}

pub fn get_proxy_vpn_status() -> AppResult<ProxyVpnStatus> {
    #[cfg(target_os = "macos")]
    {
        let mut proxy_enabled = false;
        let mut proxy_detail = String::new();
        if let Ok(output) = Command::new("scutil").args(["--proxy"]).output() {
            let text = String::from_utf8_lossy(&output.stdout);
            let http = text.contains("HTTPEnable : 1");
            let https = text.contains("HTTPSEnable : 1");
            let socks = text.contains("SOCKSEnable : 1");
            let pac = text.contains("ProxyAutoConfigEnable : 1");
            proxy_enabled = http || https || socks || pac;
            proxy_detail = format!("HTTP={http} HTTPS={https} SOCKS={socks} PAC={pac}");
        }

        let mut vpn_ifaces = Vec::new();
        if let Ok(ifaces) = if_addrs::get_if_addrs() {
            for iface in ifaces {
                let n = iface.name.to_ascii_lowercase();
                if (n.starts_with("utun")
                    || n.starts_with("ipsec")
                    || n.starts_with("ppp")
                    || n.starts_with("wg"))
                    && !vpn_ifaces.contains(&iface.name)
                {
                    vpn_ifaces.push(iface.name);
                }
            }
        }

        let mut default_via_tunnel = false;
        if let Ok(route) = super::summary::collect_default_route() {
            if let Some(iface) = route.interface {
                let lower = iface.to_ascii_lowercase();
                default_via_tunnel = lower.starts_with("utun")
                    || lower.starts_with("ipsec")
                    || lower.starts_with("ppp")
                    || lower.starts_with("wg");
            }
        }

        Ok(ProxyVpnStatus {
            proxy_enabled,
            proxy_detail: Some(proxy_detail),
            vpn_ifaces,
            default_via_tunnel,
            command_hint: "getProxyVpnStatus(local)".into(),
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(ProxyVpnStatus {
            proxy_enabled: false,
            proxy_detail: Some("Proxy/VPN status only implemented on macOS for MVP".into()),
            vpn_ifaces: vec![],
            default_via_tunnel: false,
            command_hint: "getProxyVpnStatus(local)".into(),
        })
    }
}
