use super::types::{
    CaptiveProbe, DnsPreset, MtuTarget, NetworkProbeDefaultsCatalog, PublicIpApi, ReachTarget,
    SitePreset,
};
use crate::error::AppResult;
use std::collections::HashMap;

pub fn builtin_defaults() -> AppResult<NetworkProbeDefaultsCatalog> {
    let mut site_packs = HashMap::new();
    site_packs.insert(
        "global".into(),
        vec![
            site("cf-ip", "1.1.1.1", "icmp"),
            site("cf-web", "https://cloudflare.com", "http"),
            site("google", "https://www.google.com", "http"),
            site("github", "https://github.com", "http"),
        ],
    );
    site_packs.insert(
        "cn-friendly".into(),
        vec![
            site("ali-dns", "223.5.5.5", "icmp"),
            site("baidu", "https://www.baidu.com", "http"),
            site("qq", "https://www.qq.com", "http"),
            site("cloudflare", "1.1.1.1", "icmp"),
        ],
    );
    site_packs.insert(
        "dev".into(),
        vec![
            site("npm", "https://registry.npmjs.org", "http"),
            site("crates", "https://crates.io", "http"),
            site("goproxy", "https://proxy.golang.org", "http"),
        ],
    );

    Ok(NetworkProbeDefaultsCatalog {
        schema_version: 1,
        dns_presets: vec![
            dns("cf-dot1", "1.1.1.1", "global"),
            dns("cf-dot0", "1.0.0.1", "global"),
            dns("google-8", "8.8.8.8", "global"),
            dns("google-4", "8.8.4.4", "global"),
            dns("quad9", "9.9.9.9", "global"),
            dns("ali-223", "223.5.5.5", "cn-friendly"),
            dns("ali-224", "223.6.6.6", "cn-friendly"),
            dns("dnspod", "119.29.29.29", "cn-friendly"),
            dns("baidu", "180.76.76.76", "cn-friendly"),
        ],
        reach_targets: vec![
            reach("pub-ip-v4", "ipv4", "1.1.1.1"),
            reach("pub-ip-v4-alt", "ipv4", "8.8.8.8"),
            reach("pub-name", "name", "cloudflare.com"),
            reach("pub-name-alt", "name", "www.apple.com"),
            reach("dns-resolve-name", "name", "cloudflare.com"),
        ],
        captive_probes: vec![
            captive("apple", "http://captive.apple.com/hotspot-detect.html", 200),
            captive(
                "gstatic",
                "http://connectivitycheck.gstatic.com/generate_204",
                204,
            ),
            captive(
                "msft",
                "http://www.msftconnecttest.com/connecttest.txt",
                200,
            ),
        ],
        public_ip_apis: vec![
            api("ipify", "https://api.ipify.org?format=json", "json-ip"),
            api("ifconfig-me", "https://ifconfig.me/ip", "text"),
            api("seeip", "https://ip.seeip.org/jsonip", "json-ip"),
        ],
        site_packs,
        mtu_targets: vec![
            MtuTarget {
                id: "cf".into(),
                target: "1.1.1.1".into(),
            },
            MtuTarget {
                id: "gw".into(),
                target: "gateway".into(),
            },
        ],
    })
}

fn dns(id: &str, address: &str, region: &str) -> DnsPreset {
    DnsPreset {
        id: id.into(),
        address: address.into(),
        region: region.into(),
    }
}

fn reach(id: &str, kind: &str, target: &str) -> ReachTarget {
    ReachTarget {
        id: id.into(),
        kind: kind.into(),
        target: target.into(),
    }
}

fn captive(id: &str, url: &str, expect_status: u16) -> CaptiveProbe {
    CaptiveProbe {
        id: id.into(),
        url: url.into(),
        expect_status,
    }
}

fn api(id: &str, url: &str, format: &str) -> PublicIpApi {
    PublicIpApi {
        id: id.into(),
        url: url.into(),
        format: format.into(),
    }
}

fn site(id: &str, target: &str, channel: &str) -> SitePreset {
    SitePreset {
        id: id.into(),
        target: target.into(),
        channel: channel.into(),
    }
}

pub fn get_defaults() -> AppResult<NetworkProbeDefaultsCatalog> {
    builtin_defaults()
}
