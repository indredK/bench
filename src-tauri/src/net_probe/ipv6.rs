use super::types::{Ipv6DualStackCompare, Ipv6StackResult};
use crate::error::AppResult;
use std::net::IpAddr;
use std::process::Command;
use std::time::Instant;

const IPV6_REACH_TARGET: &str = "2606:4700:4700::1111";
const IPV4_REACH_TARGET: &str = "1.1.1.1";
const AAAA_NAME: &str = "cloudflare.com";
const HTTP_V6_URL: &str = "https://ipv6.google.com/generate_204";

pub async fn check_ipv6_stack() -> AppResult<Ipv6StackResult> {
    let started = Instant::now();
    let command_hint = "checkIpv6Stack(local)".to_string();

    let (link_local, global) = collect_local_ipv6();
    let (aaaa_ok, aaaa_addrs) = lookup_aaaa(AAAA_NAME).await;

    let icmpv6 = ping_once(IPV6_REACH_TARGET).await;
    let icmpv4 = ping_once(IPV4_REACH_TARGET).await;
    let http_v6 = probe_http_v6().await;

    let (ndp_status, ndp_detail) = probe_ndp();

    let traceroute_note = if icmpv6.as_ref().is_some_and(|(ok, _)| *ok) {
        Some(
            "ICMPv6 reachable — use Test → Traceroute on an IPv6 target for hop table (privilege may deepen path)."
                .into(),
        )
    } else {
        Some("ICMPv6 traceroute deferred (no ICMPv6 reachability)".into())
    };

    let ipv4_ok = icmpv4.as_ref().map(|(ok, _)| *ok).unwrap_or(false);
    let ipv6_ok = icmpv6.as_ref().map(|(ok, _)| *ok).unwrap_or(false);
    let dual_stack = Ipv6DualStackCompare {
        ipv4_ok,
        ipv6_ok,
        ipv4_rtt_ms: icmpv4.as_ref().and_then(|(_, rtt)| *rtt),
        ipv6_rtt_ms: icmpv6.as_ref().and_then(|(_, rtt)| *rtt),
        detail: match (ipv4_ok, ipv6_ok) {
            (true, true) => "Dual-stack reachability OK (v4+v6 ICMP)".into(),
            (true, false) => "IPv4 OK, IPv6 ICMP failed — possible v6 path/filter issue".into(),
            (false, true) => "IPv6 OK, IPv4 ICMP failed — unusual dual-stack asymmetry".into(),
            (false, false) => "Neither IPv4 nor IPv6 ICMP reached public targets".into(),
        },
    };

    let has_global = !global.is_empty();
    let icmpv6_ok = icmpv6.as_ref().map(|(ok, _)| *ok);
    let http_v6_ok = http_v6;

    let (status, message) = if has_global && aaaa_ok && icmpv6_ok == Some(true) {
        (
            "ok".to_string(),
            Some("IPv6 stack looks usable (address + AAAA + ICMPv6)".into()),
        )
    } else if has_global || aaaa_ok || icmpv6_ok == Some(true) || !link_local.is_empty() {
        (
            "partial".to_string(),
            Some("Partial IPv6: some checks passed; see details".into()),
        )
    } else if link_local.is_empty() && global.is_empty() {
        (
            "unavailable".to_string(),
            Some("No IPv6 addresses on active interfaces".into()),
        )
    } else {
        (
            "fail".to_string(),
            Some("IPv6 present locally but reachability checks failed".into()),
        )
    };

    Ok(Ipv6StackResult {
        status,
        link_local,
        global,
        aaaa_ok,
        aaaa_addrs,
        icmpv6_ok,
        icmpv6_rtt_ms: icmpv6.and_then(|(_, rtt)| rtt),
        http_v6_ok,
        dual_stack,
        ndp_status,
        ndp_detail,
        traceroute_note,
        message,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

fn collect_local_ipv6() -> (Vec<String>, Vec<String>) {
    let Ok(ifaces) = if_addrs::get_if_addrs() else {
        return (Vec::new(), Vec::new());
    };
    let mut link_local = Vec::new();
    let mut global = Vec::new();
    for iface in ifaces {
        if iface.is_loopback() {
            continue;
        }
        if let if_addrs::IfAddr::V6(v6) = iface.addr {
            let s = v6.ip.to_string();
            if s.starts_with("fe80:") {
                if !link_local.contains(&s) {
                    link_local.push(s);
                }
            } else if !global.contains(&s) {
                global.push(s);
            }
        }
    }
    (link_local, global)
}

async fn lookup_aaaa(name: &str) -> (bool, Vec<String>) {
    match super::dns::dns_lookup(name.into(), Some("AAAA".into()), None).await {
        Ok(r) => {
            let addrs: Vec<String> = r
                .records
                .into_iter()
                .filter_map(|rec| {
                    let data = rec.data.trim().to_string();
                    if data.parse::<IpAddr>().ok().is_some_and(|ip| ip.is_ipv6())
                        || data.contains(':')
                    {
                        Some(data)
                    } else {
                        None
                    }
                })
                .collect();
            (!addrs.is_empty(), addrs)
        }
        Err(_) => (false, Vec::new()),
    }
}

async fn ping_once(target: &str) -> Option<(bool, Option<f64>)> {
    match super::ping::ping_host(target.into(), Some(1), Some(200)).await {
        Ok(r) => {
            let ok = r.packets_received > 0;
            Some((ok, r.avg_rtt_ms))
        }
        Err(_) => None,
    }
}

async fn probe_http_v6() -> Option<bool> {
    let (http, _) = super::probe::probe_http_target(HTTP_V6_URL).await;
    http.map(|h| h.ok)
}

fn probe_ndp() -> (String, Option<String>) {
    #[cfg(target_os = "macos")]
    {
        match Command::new("ndp").args(["-an"]).output() {
            Ok(out) if out.status.success() => {
                let text = String::from_utf8_lossy(&out.stdout);
                let lines: Vec<&str> = text
                    .lines()
                    .filter(|l| !l.contains("Neighbor") && !l.trim().is_empty())
                    .collect();
                let count = lines.len();
                if count == 0 {
                    (
                        "partial".into(),
                        Some("ndp -an returned no neighbors (table empty or filtered)".into()),
                    )
                } else {
                    (
                        "ok".into(),
                        Some(format!("ndp -an: {count} neighbor entries visible")),
                    )
                }
            }
            Ok(out) => (
                "partial".into(),
                Some(format!(
                    "ndp -an failed (may need privileges): {}",
                    String::from_utf8_lossy(&out.stderr).trim()
                )),
            ),
            Err(e) => ("skip".into(), Some(format!("ndp unavailable: {e}"))),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        (
            "skip".into(),
            Some("NDP neighbor dump is macOS-only for MVP".into()),
        )
    }
}
