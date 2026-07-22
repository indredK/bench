use super::types::{
    CaptiveProbe, DefaultsOverride, DnsPreset, MtuTarget, NetworkProbeDefaultsCatalog, PublicIpApi,
    ReachTarget, SitePreset,
};
use crate::error::{AppError, AppResult};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

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

fn override_path() -> AppResult<PathBuf> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| AppError::io("Cannot determine config directory"))?;
    let dir = config_dir.join("bench").join("network-probe");
    fs::create_dir_all(&dir).map_err(|e| AppError::io(format!("create defaults dir: {e}")))?;
    Ok(dir.join("defaults-override.json"))
}

pub fn load_override() -> AppResult<Option<DefaultsOverride>> {
    let path = override_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| AppError::io(format!("read override: {e}")))?;
    let parsed: DefaultsOverride = serde_json::from_str(&raw)
        .map_err(|e| AppError::invalid_input(format!("Invalid defaults override JSON: {e}")))?;
    Ok(Some(parsed))
}

fn apply_override(
    mut catalog: NetworkProbeDefaultsCatalog,
    overlay: DefaultsOverride,
) -> NetworkProbeDefaultsCatalog {
    if let Some(v) = overlay.dns_presets {
        catalog.dns_presets = v;
    }
    if let Some(v) = overlay.site_packs {
        catalog.site_packs = v;
    }
    if let Some(v) = overlay.reach_targets {
        catalog.reach_targets = v;
    }
    if let Some(v) = overlay.captive_probes {
        catalog.captive_probes = v;
    }
    if let Some(v) = overlay.public_ip_apis {
        catalog.public_ip_apis = v;
    }
    if let Some(v) = overlay.mtu_targets {
        catalog.mtu_targets = v;
    }
    catalog
}

pub fn get_defaults() -> AppResult<NetworkProbeDefaultsCatalog> {
    let builtin = builtin_defaults()?;
    match load_override()? {
        Some(overlay) => Ok(apply_override(builtin, overlay)),
        None => Ok(builtin),
    }
}

pub fn save_defaults_override(overlay: DefaultsOverride) -> AppResult<()> {
    let path = override_path()?;
    let json = serde_json::to_string_pretty(&overlay)
        .map_err(|e| AppError::io(format!("serialize override: {e}")))?;
    fs::write(&path, json).map_err(|e| AppError::io(format!("write override: {e}")))?;
    Ok(())
}

pub fn reset_defaults() -> AppResult<()> {
    let path = override_path()?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| AppError::io(format!("reset defaults: {e}")))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_has_site_packs() {
        let d = builtin_defaults().expect("defaults");
        assert!(d.site_packs.contains_key("global"));
        assert!(d.site_packs.contains_key("cn-friendly"));
    }

    #[test]
    fn overlay_replaces_dns_presets() {
        let overlay = DefaultsOverride {
            dns_presets: Some(vec![dns("custom", "9.9.9.9", "global")]),
            ..Default::default()
        };
        let merged = apply_override(builtin_defaults().unwrap(), overlay);
        assert_eq!(merged.dns_presets.len(), 1);
        assert_eq!(merged.dns_presets[0].id, "custom");
        assert!(merged.site_packs.contains_key("dev"));
    }
}
