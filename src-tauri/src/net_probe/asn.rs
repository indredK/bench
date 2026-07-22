//! ASN lookup via Team Cymru DNS (no API key). Cache + fail-empty.

use super::types::TracerouteHop;
use hickory_resolver::proto::rr::RecordType;
use hickory_resolver::Resolver;
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const CACHE_TTL_OK: Duration = Duration::from_secs(120);
const CACHE_TTL_NEG: Duration = Duration::from_secs(30);

#[derive(Debug, Clone)]
pub struct AsnInfo {
    pub asn: u32,
    pub as_name: Option<String>,
    pub prefix: Option<String>,
    pub country: Option<String>,
}

#[derive(Clone)]
enum CacheEntry {
    Ok { info: AsnInfo, at: Instant },
    Miss { at: Instant },
}

fn cache() -> &'static Mutex<HashMap<IpAddr, CacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<IpAddr, CacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub async fn lookup_asn(ip: IpAddr) -> Option<AsnInfo> {
    if !is_globally_routable(ip) {
        return None;
    }
    if let Some(hit) = cache_get(ip) {
        return hit;
    }

    let info = match lookup_asn_uncached(ip).await {
        Some(info) => {
            cache_put(
                ip,
                CacheEntry::Ok {
                    info: info.clone(),
                    at: Instant::now(),
                },
            );
            Some(info)
        }
        None => {
            cache_put(ip, CacheEntry::Miss { at: Instant::now() });
            None
        }
    };
    info
}

pub async fn enrich_traceroute_hops(hops: &mut [TracerouteHop]) {
    let mut unique: Vec<IpAddr> = Vec::new();
    for hop in hops.iter() {
        for addr in &hop.addrs {
            if let Ok(ip) = addr.parse::<IpAddr>() {
                if is_globally_routable(ip) && !unique.contains(&ip) {
                    unique.push(ip);
                }
            }
        }
    }

    let mut map: HashMap<IpAddr, AsnInfo> = HashMap::new();
    for ip in unique {
        if let Some(info) = lookup_asn(ip).await {
            map.insert(ip, info);
        }
    }

    for hop in hops.iter_mut() {
        let Some(first) = hop.addrs.first() else {
            continue;
        };
        let Ok(ip) = first.parse::<IpAddr>() else {
            continue;
        };
        if let Some(info) = map.get(&ip) {
            hop.asn = Some(format!("AS{}", info.asn));
            hop.as_name = info
                .as_name
                .clone()
                .or_else(|| match (&info.prefix, &info.country) {
                    (Some(p), Some(cc)) => Some(format!("{p} ({cc})")),
                    (Some(p), None) => Some(p.clone()),
                    (None, Some(cc)) => Some(cc.clone()),
                    _ => None,
                });
        }
    }
}

async fn lookup_asn_uncached(ip: IpAddr) -> Option<AsnInfo> {
    let origin_name = match ip {
        IpAddr::V4(v4) => ipv4_origin_name(v4),
        IpAddr::V6(v6) => ipv6_origin_name(v6),
    };
    let txt = dns_txt(&origin_name).await?;
    let (asn, prefix, country) = parse_origin_txt(&txt)?;
    let as_name = dns_txt(&format!("AS{asn}.asn.cymru.com"))
        .await
        .and_then(|t| parse_as_name_txt(&t));
    Some(AsnInfo {
        asn,
        as_name,
        prefix,
        country,
    })
}

fn ipv4_origin_name(ip: Ipv4Addr) -> String {
    let o = ip.octets();
    format!("{}.{}.{}.{}.origin.asn.cymru.com", o[3], o[2], o[1], o[0])
}

fn ipv6_origin_name(ip: Ipv6Addr) -> String {
    let bytes = ip.octets();
    let mut nibbles = String::with_capacity(64);
    for b in bytes.iter().rev() {
        let hi = b >> 4;
        let lo = b & 0x0f;
        // reverse nibble order within each byte as well for Cymru origin6
        nibbles.push_str(&format!("{lo:x}.{hi:x}."));
    }
    format!("{}origin6.asn.cymru.com", nibbles)
}

async fn dns_txt(name: &str) -> Option<String> {
    let resolver = Resolver::builder_tokio().ok()?.build().ok()?;
    let lookup = resolver.lookup(name, RecordType::TXT).await.ok()?;
    for record in lookup.answers() {
        let raw = record.data.to_string();
        // Hickory Display for TXT often looks like: "\"13335 | ...\"" or bare text.
        let cleaned = raw
            .trim()
            .trim_matches('"')
            .replace("\\\"", "")
            .trim()
            .trim_matches('"')
            .trim()
            .to_string();
        if cleaned.contains('|') || cleaned.chars().any(|c| c.is_ascii_digit()) {
            return Some(cleaned);
        }
    }
    None
}

/// `"13335 | 1.1.1.0/24 | US | arin | 2010-07-14"`
fn parse_origin_txt(txt: &str) -> Option<(u32, Option<String>, Option<String>)> {
    let parts: Vec<&str> = txt.split('|').map(str::trim).collect();
    if parts.is_empty() {
        return None;
    }
    let asn: u32 = parts[0].parse().ok()?;
    if asn == 0 {
        return None;
    }
    let prefix = parts
        .get(1)
        .map(|s| (*s).to_string())
        .filter(|s| !s.is_empty());
    let country = parts
        .get(2)
        .map(|s| (*s).to_string())
        .filter(|s| !s.is_empty());
    Some((asn, prefix, country))
}

/// `"13335 | US | arin | 2010-07-14 | CLOUDFLARENET, US"`
fn parse_as_name_txt(txt: &str) -> Option<String> {
    let parts: Vec<&str> = txt.split('|').map(str::trim).collect();
    parts
        .get(4)
        .map(|s| (*s).to_string())
        .filter(|s| !s.is_empty())
}

fn cache_get(ip: IpAddr) -> Option<Option<AsnInfo>> {
    let guard = cache().lock().ok()?;
    match guard.get(&ip)? {
        CacheEntry::Ok { info, at } if at.elapsed() < CACHE_TTL_OK => Some(Some(info.clone())),
        CacheEntry::Miss { at } if at.elapsed() < CACHE_TTL_NEG => Some(None),
        _ => None,
    }
}

fn cache_put(ip: IpAddr, entry: CacheEntry) {
    if let Ok(mut guard) = cache().lock() {
        guard.insert(ip, entry);
    }
}

fn is_globally_routable(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || is_cgnat(v4))
        }
        IpAddr::V6(v6) => {
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_unicast_link_local()
                || v6.is_unique_local())
        }
    }
}

fn is_cgnat(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 100 && (o[1] & 0xc0) == 64 // 100.64.0.0/10
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_name_v4() {
        assert_eq!(
            ipv4_origin_name(Ipv4Addr::new(1, 1, 1, 1)),
            "1.1.1.1.origin.asn.cymru.com"
        );
    }

    #[test]
    fn parse_origin() {
        let (asn, prefix, cc) =
            parse_origin_txt("13335 | 1.1.1.0/24 | US | arin | 2010-07-14").unwrap();
        assert_eq!(asn, 13335);
        assert_eq!(prefix.as_deref(), Some("1.1.1.0/24"));
        assert_eq!(cc.as_deref(), Some("US"));
    }
}
