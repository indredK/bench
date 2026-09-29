use super::types::{
    CaptiveProbe, DefaultsOverride, DnsPreset, MtuTarget, NetworkProbeDefaultsCatalog, ProbeServer,
    PublicIpApi, ReachTarget, SitePreset,
};
use crate::error::{AppError, AppResult};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

pub(crate) const MAX_STUN_SERVERS: usize = 6;
pub(crate) const MAX_NTP_SERVERS: usize = 8;

fn override_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

/// Serialize defaults writes across both windows in this process and separate Bench builds
/// that share the same user config directory (for example, the installed app and a QA build).
struct DefaultsWriteGuard {
    process_lock: Option<MutexGuard<'static, ()>>,
    os_lock: Option<File>,
}

impl DefaultsWriteGuard {
    fn acquire(override_path: &Path) -> AppResult<Self> {
        let process_lock = override_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let lock_path = override_path.with_file_name("defaults-override.lock");
        let os_lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(lock_path)
            .map_err(|e| AppError::io(format!("open defaults lock: {e}")))?;
        os_lock
            .lock()
            .map_err(|e| AppError::io(format!("acquire defaults lock: {e}")))?;
        Ok(Self {
            process_lock: Some(process_lock),
            os_lock: Some(os_lock),
        })
    }
}

impl Drop for DefaultsWriteGuard {
    fn drop(&mut self) {
        // Release the OS lock first so another process can proceed before this process unlocks.
        self.os_lock.take();
        self.process_lock.take();
    }
}

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
        stun_servers: vec![
            probe_server("google-a", "stun.l.google.com:19302"),
            probe_server("google-b", "stun1.l.google.com:19302"),
            probe_server("google-c", "stun2.l.google.com:19302"),
        ],
        ntp_servers: vec![
            probe_server("apple", "time.apple.com:123"),
            probe_server("cloudflare", "time.cloudflare.com:123"),
            probe_server("google", "time.google.com:123"),
            probe_server("cn-ali", "ntp.aliyun.com:123"),
        ],
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

fn probe_server(id: &str, server: &str) -> ProbeServer {
    ProbeServer {
        id: id.into(),
        server: server.into(),
    }
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
    if let Some(v) = overlay.stun_servers {
        catalog.stun_servers = v;
    }
    if let Some(v) = overlay.ntp_servers {
        catalog.ntp_servers = v;
    }
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
    validate_override(&overlay)?;
    let path = override_path()?;
    let _guard = DefaultsWriteGuard::acquire(&path)?;
    let mut merged = load_override()?.unwrap_or_default();
    merge_override(&mut merged, overlay);
    let json = serde_json::to_vec_pretty(&merged)
        .map_err(|e| AppError::io(format!("serialize override: {e}")))?;
    crate::persistence::atomic_write(&path, &json)
        .map_err(|e| AppError::io(format!("write override: {e}")))?;
    Ok(())
}

pub fn reset_defaults() -> AppResult<()> {
    let path = override_path()?;
    let _guard = DefaultsWriteGuard::acquire(&path)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| AppError::io(format!("reset defaults: {e}")))?;
    }
    Ok(())
}

pub fn reset_discovery_defaults() -> AppResult<()> {
    let path = override_path()?;
    let _guard = DefaultsWriteGuard::acquire(&path)?;
    let Some(mut overlay) = load_override()? else {
        return Ok(());
    };
    overlay.stun_servers = None;
    overlay.ntp_servers = None;
    if override_is_empty(&overlay) {
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| AppError::io(format!("reset discovery defaults: {e}")))?;
        }
        return Ok(());
    }
    let json = serde_json::to_vec_pretty(&overlay)
        .map_err(|e| AppError::io(format!("serialize override: {e}")))?;
    crate::persistence::atomic_write(&path, &json)
        .map_err(|e| AppError::io(format!("reset discovery defaults: {e}")))
}

fn validate_override(overlay: &DefaultsOverride) -> AppResult<()> {
    if let Some(servers) = &overlay.stun_servers {
        validate_servers("STUN", servers, 2, MAX_STUN_SERVERS)?;
    }
    if let Some(servers) = &overlay.ntp_servers {
        validate_servers("NTP", servers, 1, MAX_NTP_SERVERS)?;
    }
    Ok(())
}

fn validate_servers(
    kind: &str,
    servers: &[ProbeServer],
    minimum: usize,
    maximum: usize,
) -> AppResult<()> {
    if !(minimum..=maximum).contains(&servers.len()) {
        return Err(AppError::invalid_input(format!(
            "{kind} source count must be between {minimum} and {maximum}"
        )));
    }
    let mut ids = std::collections::HashSet::with_capacity(servers.len());
    let mut endpoints = std::collections::HashSet::with_capacity(servers.len());
    for source in servers {
        let id = source.id.trim();
        if source.id != id
            || id.is_empty()
            || id.len() > 64
            || !id
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
            || !ids.insert(id.to_string())
        {
            return Err(AppError::invalid_input(format!(
                "{kind} source IDs must be unique lowercase letters, digits, or hyphens (1–64 characters)"
            )));
        }

        let address = source.server.trim();
        let parsed = url::Url::parse(&format!("udp://{address}"))
            .map_err(|_| AppError::invalid_input(format!("Invalid {kind} server address")))?;
        if source.server != address
            || address.len() > 320
            || address.chars().any(char::is_whitespace)
            || parsed.host_str().is_none()
            || parsed.port().is_none_or(|port| port == 0)
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || !(parsed.path().is_empty() || parsed.path() == "/")
            || parsed.query().is_some()
            || parsed.fragment().is_some()
            || !endpoints.insert(address.to_ascii_lowercase())
        {
            return Err(AppError::invalid_input(format!(
                "{kind} servers must be unique host:port addresses without a path"
            )));
        }
    }
    Ok(())
}

fn merge_override(target: &mut DefaultsOverride, update: DefaultsOverride) {
    if update.stun_servers.is_some() {
        target.stun_servers = update.stun_servers;
    }
    if update.ntp_servers.is_some() {
        target.ntp_servers = update.ntp_servers;
    }
    if update.dns_presets.is_some() {
        target.dns_presets = update.dns_presets;
    }
    if update.site_packs.is_some() {
        target.site_packs = update.site_packs;
    }
    if update.reach_targets.is_some() {
        target.reach_targets = update.reach_targets;
    }
    if update.captive_probes.is_some() {
        target.captive_probes = update.captive_probes;
    }
    if update.public_ip_apis.is_some() {
        target.public_ip_apis = update.public_ip_apis;
    }
    if update.mtu_targets.is_some() {
        target.mtu_targets = update.mtu_targets;
    }
}

fn override_is_empty(overlay: &DefaultsOverride) -> bool {
    overlay.stun_servers.is_none()
        && overlay.ntp_servers.is_none()
        && overlay.dns_presets.is_none()
        && overlay.site_packs.is_none()
        && overlay.reach_targets.is_none()
        && overlay.captive_probes.is_none()
        && overlay.public_ip_apis.is_none()
        && overlay.mtu_targets.is_none()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_path() -> PathBuf {
        std::env::temp_dir()
            .join(format!("bench-defaults-lock-{}", uuid::Uuid::new_v4()))
            .join("defaults-override.json")
    }

    #[test]
    fn defaults_write_lock_serializes_other_processes() {
        let path = test_path();
        fs::create_dir_all(path.parent().unwrap()).expect("create test config directory");
        let other_process_file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(path.with_file_name("defaults-override.lock"))
            .expect("open simulated other-process lock");
        let guard = DefaultsWriteGuard::acquire(&path).expect("acquire defaults lock");
        assert!(matches!(
            other_process_file.try_lock(),
            Err(std::fs::TryLockError::WouldBlock)
        ));
        drop(guard);
        other_process_file
            .try_lock()
            .expect("released defaults lock can be acquired");
        drop(other_process_file);
        fs::remove_dir_all(path.parent().unwrap()).expect("remove test config directory");
    }

    #[test]
    fn builtin_has_site_packs() {
        let d = builtin_defaults().expect("defaults");
        assert!(d.site_packs.contains_key("global"));
        assert!(d.site_packs.contains_key("cn-friendly"));
        assert!(d.site_packs.contains_key("dev"));
        assert!(d.site_packs.contains_key("official"));
        assert!(d.site_packs.get("official").map(|v| v.len()).unwrap_or(0) >= 16);
        assert_eq!(
            d.stun_servers
                .iter()
                .map(|s| s.id.as_str())
                .collect::<Vec<_>>(),
            ["google-a", "google-b", "google-c"]
        );
        assert_eq!(d.ntp_servers.len(), 4);
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
    fn partial_override_merge_preserves_other_categories() {
        let mut current = DefaultsOverride {
            dns_presets: Some(vec![dns("custom", "9.9.9.9", "global")]),
            ..Default::default()
        };
        merge_override(
            &mut current,
            DefaultsOverride {
                ntp_servers: Some(vec![probe_server("local", "time.example.com:123")]),
                ..Default::default()
            },
        );
        assert_eq!(current.dns_presets.unwrap()[0].id, "custom");
        assert_eq!(current.ntp_servers.unwrap()[0].id, "local");
    }

    #[test]
    fn rejects_invalid_or_excessive_server_lists() {
        let invalid = DefaultsOverride {
            stun_servers: Some(vec![probe_server("only-one", "stun.example.com:3478")]),
            ..Default::default()
        };
        assert!(validate_override(&invalid).is_err());

        let invalid = DefaultsOverride {
            ntp_servers: Some(vec![probe_server("ntp", "time.example.com")]),
            ..Default::default()
        };
        assert!(validate_override(&invalid).is_err());

        let valid = DefaultsOverride {
            ntp_servers: Some(vec![probe_server("ntp", "[2001:db8::1]:123")]),
            ..Default::default()
        };
        assert!(validate_override(&valid).is_ok());

        let invalid = DefaultsOverride {
            ntp_servers: Some(vec![probe_server("ntp", "time.example.com:0")]),
            ..Default::default()
        };
        assert!(validate_override(&invalid).is_err());

        let invalid = DefaultsOverride {
            ntp_servers: Some(
                (0..=MAX_NTP_SERVERS)
                    .map(|index| {
                        probe_server(
                            &format!("ntp-{index}"),
                            &format!("time{index}.example.com:123"),
                        )
                    })
                    .collect(),
            ),
            ..Default::default()
        };
        assert!(validate_override(&invalid).is_err());
    }
}
