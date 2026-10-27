use super::types::{
    CaptiveProbe, DefaultsOverride, DnsPreset, MtuTarget, NetworkProbeDefaultsCatalog, PublicIpApi,
    ReachTarget, SitePreset,
};
use crate::error::{AppError, AppResult};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::PathBuf;
use std::sync::Mutex;
use url::Url;

const MAX_OVERRIDE_BYTES: usize = 256 * 1024;
const MAX_DEFAULTS_ITEMS: usize = 128;
const MAX_FAILOVER_PROBES: usize = 3;
const MAX_REACH_TARGETS_PER_KIND: usize = 3;
const MAX_SITE_PACKS: usize = 32;
const MAX_SITES_PER_PACK: usize = 128;
const MAX_ID_BYTES: usize = 64;
const MAX_TEXT_BYTES: usize = 256;

// The override file is read and replaced by synchronous Tauri commands. Keep
// each read-modify-write operation ordered so reset cannot race a save.
static DEFAULTS_IO_LOCK: Mutex<()> = Mutex::new(());

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
    // Test L1 · 测试官网 — common foreign + domestic sites (HTTP reachability).
    site_packs.insert(
        "official".into(),
        vec![
            // Domestic / CN-friendly
            site("baidu", "https://www.baidu.com", "http"),
            site("qq", "https://www.qq.com", "http"),
            site("taobao", "https://www.taobao.com", "http"),
            site("jd", "https://www.jd.com", "http"),
            site("bilibili", "https://www.bilibili.com", "http"),
            site("weibo", "https://weibo.com", "http"),
            site("zhihu", "https://www.zhihu.com", "http"),
            site("douyin", "https://www.douyin.com", "http"),
            site("163", "https://www.163.com", "http"),
            site("aliyun", "https://www.aliyun.com", "http"),
            // Foreign / global
            site("google", "https://www.google.com", "http"),
            site("github", "https://github.com", "http"),
            site("youtube", "https://www.youtube.com", "http"),
            site("x", "https://x.com", "http"),
            site("instagram", "https://www.instagram.com", "http"),
            site("facebook", "https://www.facebook.com", "http"),
            site("wikipedia", "https://www.wikipedia.org", "http"),
            site("microsoft", "https://www.microsoft.com", "http"),
            site("apple", "https://www.apple.com", "http"),
            site("amazon", "https://www.amazon.com", "http"),
            site("cloudflare", "https://www.cloudflare.com", "http"),
            site("openai", "https://chatgpt.com", "http"),
            site("reddit", "https://www.reddit.com", "http"),
            site("stackoverflow", "https://stackoverflow.com", "http"),
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

fn parse_override(raw: &str) -> AppResult<DefaultsOverride> {
    if raw.len() > MAX_OVERRIDE_BYTES {
        return Err(AppError::invalid_input("Defaults override exceeds 256 KiB"));
    }
    let parsed: DefaultsOverride = serde_json::from_str(raw)
        .map_err(|e| AppError::invalid_input(format!("Invalid defaults override JSON: {e}")))?;
    validate_override(&parsed)?;
    Ok(parsed)
}

fn load_override_at(path: &std::path::Path) -> AppResult<Option<DefaultsOverride>> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(AppError::io(format!("read override: {error}"))),
    };
    let mut raw = String::new();
    file.take((MAX_OVERRIDE_BYTES + 1) as u64)
        .read_to_string(&mut raw)
        .map_err(|e| AppError::io(format!("read override: {e}")))?;
    Ok(Some(parse_override(&raw)?))
}

pub fn load_override() -> AppResult<Option<DefaultsOverride>> {
    let _guard = DEFAULTS_IO_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    load_override_at(&override_path()?)
}

fn invalid_override(reason: impl std::fmt::Display) -> AppError {
    AppError::invalid_input(format!("Invalid defaults override: {reason}"))
}

fn validate_id(id: &str, field: &str) -> AppResult<()> {
    let valid = !id.is_empty()
        && id.len() <= MAX_ID_BYTES
        && id.bytes().enumerate().all(|(index, byte)| match byte {
            b'a'..=b'z' | b'0'..=b'9' => true,
            b'-' | b'_' | b'.' => index > 0,
            _ => false,
        });
    if valid {
        Ok(())
    } else {
        Err(invalid_override(format!(
            "{field} must be 1–64 lowercase ASCII letters, digits, '.', '_' or '-'"
        )))
    }
}

fn validate_text(value: &str, field: &str) -> AppResult<()> {
    if value.trim().is_empty()
        || value.len() > MAX_TEXT_BYTES
        || value.chars().any(char::is_control)
    {
        return Err(invalid_override(format!(
            "{field} must be non-empty, at most 256 bytes, and contain no control characters"
        )));
    }
    Ok(())
}

fn validate_unique_ids<'a>(ids: impl IntoIterator<Item = &'a str>, field: &str) -> AppResult<()> {
    let mut seen = std::collections::HashSet::new();
    for id in ids {
        validate_id(id, field)?;
        if !seen.insert(id) {
            return Err(invalid_override(format!("duplicate {field}: {id}")));
        }
    }
    Ok(())
}

fn validate_http_url(raw: &str, https_only: bool, field: &str) -> AppResult<()> {
    validate_text(raw, field)?;
    let url = Url::parse(raw)
        .map_err(|_| invalid_override(format!("{field} must be an absolute URL")))?;
    let scheme_ok = if https_only {
        url.scheme() == "https"
    } else {
        matches!(url.scheme(), "http" | "https")
    };
    if !scheme_ok
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(invalid_override(format!(
            "{field} must use {} and must not contain credentials",
            if https_only { "HTTPS" } else { "HTTP or HTTPS" }
        )));
    }
    Ok(())
}

fn validate_host_or_ip(value: &str, field: &str) -> AppResult<()> {
    validate_text(value, field)?;
    if value.trim() != value || value.is_empty() || value.chars().any(char::is_whitespace) {
        return Err(invalid_override(format!(
            "{field} must be a hostname or IP address"
        )));
    }
    if value.parse::<std::net::IpAddr>().is_ok() {
        return Ok(());
    }
    let url = Url::parse(&format!("https://{value}"))
        .map_err(|_| invalid_override(format!("{field} must be a hostname or IP address")))?;
    if url.host_str().is_none()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(invalid_override(format!(
            "{field} must be a hostname or IP address"
        )));
    }
    Ok(())
}

fn validate_override(overlay: &DefaultsOverride) -> AppResult<()> {
    if let Some(items) = &overlay.dns_presets {
        if items.is_empty() {
            return Err(invalid_override("DNS presets cannot be empty"));
        }
        if items.len() > MAX_DEFAULTS_ITEMS {
            return Err(invalid_override("too many DNS presets (maximum 128)"));
        }
        validate_unique_ids(items.iter().map(|item| item.id.as_str()), "DNS preset id")?;
        for item in items {
            item.address.parse::<std::net::IpAddr>().map_err(|_| {
                invalid_override(format!("DNS preset {} has an invalid IP address", item.id))
            })?;
            validate_text(&item.region, "DNS preset region")?;
        }
    }
    if let Some(packs) = &overlay.site_packs {
        if packs.is_empty() {
            return Err(invalid_override("site packs cannot be empty"));
        }
        if packs.len() > MAX_SITE_PACKS {
            return Err(invalid_override("too many site packs (maximum 32)"));
        }
        validate_unique_ids(packs.keys().map(String::as_str), "site pack id")?;
        for (pack_id, sites) in packs {
            if sites.is_empty() {
                return Err(invalid_override(format!(
                    "site pack {pack_id} must contain at least one site"
                )));
            }
            if sites.len() > MAX_SITES_PER_PACK {
                return Err(invalid_override(format!(
                    "site pack {pack_id} exceeds 128 entries"
                )));
            }
            validate_unique_ids(sites.iter().map(|site| site.id.as_str()), "site id")?;
            for site in sites {
                match site.channel.as_str() {
                    "icmp" => validate_host_or_ip(&site.target, "ICMP site target")?,
                    "http" => validate_http_url(&site.target, false, "HTTP site target")?,
                    _ => {
                        return Err(invalid_override(format!(
                            "site {} has an unsupported channel",
                            site.id
                        )))
                    }
                }
            }
        }
    }
    if let Some(items) = &overlay.reach_targets {
        if items.is_empty() {
            return Err(invalid_override("reach targets cannot be empty"));
        }
        if items.len() > MAX_DEFAULTS_ITEMS {
            return Err(invalid_override("too many reach targets (maximum 128)"));
        }
        validate_unique_ids(items.iter().map(|item| item.id.as_str()), "reach target id")?;
        let ipv4_targets = items.iter().filter(|item| item.kind == "ipv4").count();
        let name_targets = items.iter().filter(|item| item.kind == "name").count();
        if ipv4_targets > MAX_REACH_TARGETS_PER_KIND || name_targets > MAX_REACH_TARGETS_PER_KIND {
            return Err(invalid_override(
                "reach targets exceed the 3-target limit per kind",
            ));
        }
        for item in items {
            match item.kind.as_str() {
                "ipv4" if item.target.parse::<std::net::Ipv4Addr>().is_ok() => {}
                "name" => validate_host_or_ip(&item.target, "reach target")?,
                _ => {
                    return Err(invalid_override(format!(
                        "reach target {} has an invalid kind or target",
                        item.id
                    )))
                }
            }
        }
    }
    if let Some(items) = &overlay.captive_probes {
        if items.is_empty() {
            return Err(invalid_override("captive probes cannot be empty"));
        }
        if items.len() > MAX_FAILOVER_PROBES {
            return Err(invalid_override(
                "captive probes exceed the 3-probe runtime limit",
            ));
        }
        if items.len() > MAX_DEFAULTS_ITEMS {
            return Err(invalid_override("too many captive probes (maximum 128)"));
        }
        validate_unique_ids(
            items.iter().map(|item| item.id.as_str()),
            "captive probe id",
        )?;
        for item in items {
            validate_http_url(&item.url, false, "captive probe URL")?;
            if !(100..=599).contains(&item.expect_status) {
                return Err(invalid_override(format!(
                    "captive probe {} has an invalid HTTP status",
                    item.id
                )));
            }
        }
    }
    if let Some(items) = &overlay.public_ip_apis {
        if items.is_empty() {
            return Err(invalid_override("public IP APIs cannot be empty"));
        }
        if items.len() > MAX_FAILOVER_PROBES {
            return Err(invalid_override(
                "public IP APIs exceed the 3-source failover limit",
            ));
        }
        if items.len() > MAX_DEFAULTS_ITEMS {
            return Err(invalid_override("too many public IP APIs (maximum 128)"));
        }
        validate_unique_ids(
            items.iter().map(|item| item.id.as_str()),
            "public IP API id",
        )?;
        for item in items {
            validate_http_url(&item.url, true, "public IP API URL")?;
            if !matches!(item.format.as_str(), "json-ip" | "text") {
                return Err(invalid_override(format!(
                    "public IP API {} has an unsupported format",
                    item.id
                )));
            }
        }
    }
    if let Some(items) = &overlay.mtu_targets {
        if items.is_empty() {
            return Err(invalid_override("MTU targets cannot be empty"));
        }
        if items.len() > MAX_DEFAULTS_ITEMS {
            return Err(invalid_override("too many MTU targets (maximum 128)"));
        }
        validate_unique_ids(items.iter().map(|item| item.id.as_str()), "MTU target id")?;
        for item in items {
            if item.target != "gateway" {
                validate_host_or_ip(&item.target, "MTU target")?;
            }
        }
    }
    Ok(())
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

fn merge_override(mut current: DefaultsOverride, patch: DefaultsOverride) -> DefaultsOverride {
    if patch.dns_presets.is_some() {
        current.dns_presets = patch.dns_presets;
    }
    if patch.site_packs.is_some() {
        current.site_packs = patch.site_packs;
    }
    if patch.reach_targets.is_some() {
        current.reach_targets = patch.reach_targets;
    }
    if patch.captive_probes.is_some() {
        current.captive_probes = patch.captive_probes;
    }
    if patch.public_ip_apis.is_some() {
        current.public_ip_apis = patch.public_ip_apis;
    }
    if patch.mtu_targets.is_some() {
        current.mtu_targets = patch.mtu_targets;
    }
    current
}

pub fn get_defaults() -> AppResult<NetworkProbeDefaultsCatalog> {
    let builtin = builtin_defaults()?;
    match load_override()? {
        Some(overlay) => Ok(apply_override(builtin, overlay)),
        None => Ok(builtin),
    }
}

pub fn save_defaults_override(overlay: DefaultsOverride) -> AppResult<()> {
    validate_override(&overlay)?;
    let _guard = DEFAULTS_IO_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let path = override_path()?;
    let current = load_override_at(&path)?.unwrap_or_default();
    let merged = merge_override(current, overlay);
    validate_override(&merged)?;
    let json = serde_json::to_vec_pretty(&merged)
        .map_err(|e| AppError::io(format!("serialize override: {e}")))?;
    if json.len() > MAX_OVERRIDE_BYTES {
        return Err(invalid_override("serialized override exceeds 256 KiB"));
    }
    write_override_at(&path, &json)
}

fn write_override_at(path: &std::path::Path, bytes: &[u8]) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::io("defaults override path has no parent directory"))?;
    fs::create_dir_all(parent).map_err(|e| AppError::io(format!("create defaults dir: {e}")))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|e| AppError::io(format!("create temporary defaults override: {e}")))?;
    std::io::Write::write_all(&mut temp, bytes)
        .map_err(|e| AppError::io(format!("write temporary defaults override: {e}")))?;
    temp.as_file()
        .sync_all()
        .map_err(|e| AppError::io(format!("sync temporary defaults override: {e}")))?;
    temp.persist(path)
        .map_err(|e| AppError::io(format!("replace defaults override: {}", e.error)))?;
    Ok(())
}

pub fn reset_defaults() -> AppResult<()> {
    let _guard = DEFAULTS_IO_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
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
        assert!(d.site_packs.contains_key("dev"));
        assert!(d.site_packs.contains_key("official"));
        assert!(d.site_packs.get("official").map(|v| v.len()).unwrap_or(0) >= 16);
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

    #[test]
    fn builtin_catalog_passes_override_validation() {
        let defaults = builtin_defaults().unwrap();
        validate_override(&DefaultsOverride {
            dns_presets: Some(defaults.dns_presets),
            site_packs: Some(defaults.site_packs),
            reach_targets: Some(defaults.reach_targets),
            captive_probes: Some(defaults.captive_probes),
            public_ip_apis: Some(defaults.public_ip_apis),
            mtu_targets: Some(defaults.mtu_targets),
        })
        .expect("built-in defaults remain valid overrides");
    }

    #[test]
    fn invalid_override_is_rejected_before_replacing_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("defaults-override.json");
        fs::write(&path, "previous-valid-value").unwrap();
        let invalid = DefaultsOverride {
            public_ip_apis: Some(vec![api("bad", "http://example.com/ip", "json-ip")]),
            ..Default::default()
        };

        assert!(validate_override(&invalid).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "previous-valid-value");
    }

    #[test]
    fn override_parser_enforces_size_limit_and_unique_ids() {
        let oversized = " ".repeat(MAX_OVERRIDE_BYTES + 1);
        assert!(parse_override(&oversized).is_err());

        let duplicate_ids = serde_json::json!({
            "dnsPresets": [
                { "id": "same", "address": "1.1.1.1", "region": "global" },
                { "id": "same", "address": "8.8.8.8", "region": "global" }
            ]
        });
        assert!(parse_override(&duplicate_ids.to_string()).is_err());
    }

    #[test]
    fn override_rejects_empty_runtime_lists_and_site_packs() {
        assert!(validate_override(&DefaultsOverride {
            dns_presets: Some(vec![]),
            ..Default::default()
        })
        .is_err());
        assert!(validate_override(&DefaultsOverride {
            site_packs: Some(HashMap::from([("empty".into(), vec![])])),
            ..Default::default()
        })
        .is_err());
        assert!(validate_override(&DefaultsOverride {
            public_ip_apis: Some(vec![]),
            ..Default::default()
        })
        .is_err());
    }

    #[test]
    fn override_limits_network_failover_lists_to_three_candidates() {
        let targets = (1..=MAX_REACH_TARGETS_PER_KIND + 1)
            .map(|index| reach(&format!("target-{index}"), "ipv4", "1.1.1.1"))
            .collect();
        assert!(validate_override(&DefaultsOverride {
            reach_targets: Some(targets),
            ..Default::default()
        })
        .is_err());

        let apis = (1..=MAX_FAILOVER_PROBES + 1)
            .map(|index| api(&format!("api-{index}"), "https://example.com/ip", "text"))
            .collect();
        assert!(validate_override(&DefaultsOverride {
            public_ip_apis: Some(apis),
            ..Default::default()
        })
        .is_err());
    }

    #[test]
    fn atomic_override_write_round_trips_valid_json() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("defaults-override.json");
        let override_data = DefaultsOverride {
            dns_presets: Some(vec![dns("custom", "9.9.9.9", "global")]),
            ..Default::default()
        };
        let bytes = serde_json::to_vec(&override_data).unwrap();

        write_override_at(&path, &bytes).unwrap();

        let loaded = load_override_at(&path).unwrap().unwrap();
        assert_eq!(loaded.dns_presets.unwrap()[0].address, "9.9.9.9");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn updating_one_catalog_preserves_other_user_overrides() {
        let existing = DefaultsOverride {
            dns_presets: Some(vec![dns("custom-dns", "9.9.9.9", "global")]),
            mtu_targets: Some(vec![MtuTarget {
                id: "custom-mtu".into(),
                target: "example.com".into(),
            }]),
            ..Default::default()
        };
        let patch = DefaultsOverride {
            dns_presets: Some(vec![dns("replacement", "8.8.8.8", "global")]),
            ..Default::default()
        };

        let merged = merge_override(existing, patch);

        assert_eq!(merged.dns_presets.unwrap()[0].id, "replacement");
        assert_eq!(merged.mtu_targets.unwrap()[0].id, "custom-mtu");
    }
}
