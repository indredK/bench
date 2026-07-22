//! Detect Clash/Surge-style Fake-IP (198.18.0.0/15) and related TUN pools.
//!
//! Under Fake-IP / enhanced mode, system DNS returns addresses in this range and
//! ICMP "ping github.com" only hits the local TUN — it is not real Internet RTT.

use std::net::{IpAddr, Ipv4Addr};

/// RFC 2544 benchmarking range used by Clash / Surge / similar Fake-IP pools.
pub fn is_fake_ip_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 198 && (o[1] == 18 || o[1] == 19)
}

pub fn is_fake_ip_addr(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_fake_ip_v4(v4),
        IpAddr::V6(_) => false,
    }
}

pub fn is_fake_ip_str(s: &str) -> bool {
    s.parse::<IpAddr>().map(is_fake_ip_addr).unwrap_or(false)
}

/// Resolve via OS stub (`getaddrinfo`) — the same path ping/browser use under Fake-IP.
pub async fn system_lookup_ips(host: &str) -> Vec<IpAddr> {
    let Ok(iter) = tokio::net::lookup_host(format!("{host}:443")).await else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for sa in iter {
        let ip = sa.ip();
        if !out.contains(&ip) {
            out.push(ip);
        }
    }
    out
}

pub async fn host_resolves_to_fake_ip(host: &str) -> Option<IpAddr> {
    system_lookup_ips(host)
        .await
        .into_iter()
        .find(|ip| is_fake_ip_addr(*ip))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn detects_clash_default_pool() {
        assert!(is_fake_ip_v4(Ipv4Addr::new(198, 18, 0, 20)));
        assert!(is_fake_ip_v4(Ipv4Addr::new(198, 19, 255, 255)));
        assert!(!is_fake_ip_v4(Ipv4Addr::new(198, 17, 0, 1)));
        assert!(!is_fake_ip_v4(Ipv4Addr::new(1, 1, 1, 1)));
        assert!(is_fake_ip_str("198.18.0.1"));
        assert!(!is_fake_ip_str("not-an-ip"));
    }
}
