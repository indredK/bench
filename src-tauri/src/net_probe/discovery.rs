//! LAN discovery — ARP cache + TCP /24 sweep with cancel (S-DIS-01).

use super::types::{ArpNeighbor, LanDiscoveryResult, ScanSessionEvent};
use crate::error::{AppError, AppResult};
use std::collections::BTreeMap;
use std::net::Ipv4Addr;
use std::process::Command;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::net::TcpStream;
use tokio::time::timeout;

const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";
const SWEEP_CONCURRENCY: usize = 32;
const SWEEP_TIMEOUT_MS: u64 = 250;
const SWEEP_PORTS: &[u16] = &[80, 443, 22];
/// Hard reject prefixes wider than /24 (S-DIS-01).
const MAX_PREFIX_HOSTS: u32 = 256;

pub async fn discover_lan<R: Runtime>(app: Option<&AppHandle<R>>) -> AppResult<LanDiscoveryResult> {
    let started = Instant::now();
    let session_id = super::session::new_session_id();
    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "lan".into(),
            },
        );
    }
    let command_hint =
        format!("scanLan(local) // degraded: arp-cache + tcp /24; sessionId={session_id}");

    let cache = tauri::async_runtime::spawn_blocking(read_arp_cache)
        .await
        .map_err(|e| AppError::task_failed(format!("arp join: {e}")))??;

    let summary = tauri::async_runtime::spawn_blocking(super::summary::collect_local_summary)
        .await
        .map_err(|e| AppError::task_failed(format!("summary join: {e}")))?
        .ok();

    let primary = summary
        .as_ref()
        .and_then(|s| s.primary_ipv4.clone())
        .and_then(|s| s.parse::<Ipv4Addr>().ok());
    let gateway = summary
        .as_ref()
        .and_then(|s| s.gateway.clone())
        .and_then(|s| s.parse::<Ipv4Addr>().ok());

    if primary.is_none() {
        super::session::clear_session(&session_id);
        return Ok(LanDiscoveryResult {
            mode: "arp-cache".into(),
            neighbors: cache,
            message: Some(
                "No primary IPv4 — Local Network permission may be required, or link is down."
                    .into(),
            ),
            empty_reason: Some("permission".into()),
            cidr: None,
            cancelled: false,
            session_id,
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            command_hint,
        });
    }
    let primary = primary.unwrap();

    let base = u32::from(primary) & 0xffff_ff00;
    let host_count = 256u32;
    if host_count > MAX_PREFIX_HOSTS {
        super::session::clear_session(&session_id);
        return Err(AppError::invalid_input(
            "CIDR wider than /24 is rejected without explicit confirmation",
        ));
    }
    let cidr = format!("{}/24", Ipv4Addr::from(base));
    let mut by_ip: BTreeMap<String, ArpNeighbor> = BTreeMap::new();
    for n in cache {
        by_ip.insert(n.ip.clone(), n);
    }

    let mut cancelled = false;
    let mut hosts = Vec::new();
    for host in 1u32..=254 {
        let ip = Ipv4Addr::from(base | host);
        if ip != primary {
            hosts.push(ip);
        }
    }

    for chunk in hosts.chunks(SWEEP_CONCURRENCY) {
        if super::session::is_cancelled(&session_id) {
            cancelled = true;
            break;
        }
        let mut handles = Vec::new();
        for ip in chunk {
            let ip = *ip;
            handles.push(tokio::spawn(async move { (ip, host_alive(ip).await) }));
        }
        for h in handles {
            if super::session::is_cancelled(&session_id) {
                cancelled = true;
                break;
            }
            if let Ok((ip, true)) = h.await {
                let key = ip.to_string();
                by_ip.entry(key.clone()).or_insert(ArpNeighbor {
                    ip: key,
                    mac: None,
                    iface: None,
                    source: "tcp-sweep".into(),
                });
            }
        }
        if cancelled {
            break;
        }
    }

    cancelled = cancelled || super::session::is_cancelled(&session_id);
    super::session::clear_session(&session_id);

    let neighbors: Vec<ArpNeighbor> = by_ip.into_values().collect();
    let gateway_seen = gateway
        .map(|g| neighbors.iter().any(|n| n.ip == g.to_string()))
        .unwrap_or(false);

    let (empty_reason, message) = if cancelled {
        (None, Some("LAN discovery cancelled mid-sweep.".into()))
    } else if neighbors.is_empty() {
        (
            Some("quiet".into()),
            Some(
                "No neighbors found. May be a quiet network, Wi‑Fi client isolation, or Local Network permission."
                    .into(),
            ),
        )
    } else if neighbors.len() <= 1 && gateway_seen {
        (
            Some("isolation".into()),
            Some("Only the gateway responded — guest Wi‑Fi / client isolation is likely.".into()),
        )
    } else {
        (
            None,
            Some(
                "Degraded: ARP cache + TCP connect /24 sweep. Privileged ARP request needs adv-scanner."
                    .into(),
            ),
        )
    };

    Ok(LanDiscoveryResult {
        mode: "arp-cache+tcp-sweep".into(),
        neighbors,
        message,
        empty_reason,
        cidr: Some(cidr),
        cancelled,
        session_id,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

async fn host_alive(ip: Ipv4Addr) -> bool {
    for &port in SWEEP_PORTS {
        let addr = format!("{ip}:{port}");
        if timeout(
            Duration::from_millis(SWEEP_TIMEOUT_MS),
            TcpStream::connect(addr),
        )
        .await
        .ok()
        .and_then(|r| r.ok())
        .is_some()
        {
            return true;
        }
    }
    false
}

pub fn read_arp_cache() -> AppResult<Vec<ArpNeighbor>> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("arp")
            .args(["-an"])
            .output()
            .map_err(|e| AppError::io(format!("arp: {e}")))?;
        let text = String::from_utf8_lossy(&output.stdout);
        let mut out = Vec::new();
        for line in text.lines() {
            if let Some(ip) = extract_paren_ip(line) {
                let mac = extract_mac(line);
                let iface = line
                    .split_whitespace()
                    .skip_while(|t| *t != "on")
                    .nth(1)
                    .map(str::to_string);
                out.push(ArpNeighbor {
                    ip,
                    mac,
                    iface,
                    source: "arp-cache".into(),
                });
            }
        }
        out.sort_by(|a, b| a.ip.cmp(&b.ip));
        out.dedup_by(|a, b| a.ip == b.ip);
        Ok(out)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(Vec::new())
    }
}

pub fn detect_arp_spoofing_hints() -> AppResult<Vec<super::types::PollutionFinding>> {
    use super::types::PollutionFinding;
    let mut findings = Vec::new();
    let neighbors = read_arp_cache()?;
    let route = super::summary::collect_default_route().ok();
    let gateway = route.as_ref().and_then(|r| r.gateway.clone());

    if let Some(gw) = gateway {
        let gw_entries: Vec<_> = neighbors.iter().filter(|n| n.ip == gw).collect();
        if gw_entries.is_empty() {
            findings.push(PollutionFinding {
                kind: "arp".into(),
                severity: "info".into(),
                evidence: format!(
                    "Gateway {gw} not present in ARP cache yet (normal just after link-up)."
                ),
                command_hint: "detectArpSpoofing(local) // read-only".into(),
            });
        } else if gw_entries.iter().any(|n| n.mac.is_none()) {
            findings.push(PollutionFinding {
                kind: "arp".into(),
                severity: "warn".into(),
                evidence: format!("Gateway {gw} has incomplete ARP entry."),
                command_hint: "detectArpSpoofing(local) // read-only".into(),
            });
        } else if let Some(mac) = gw_entries[0].mac.as_ref() {
            let same_mac: Vec<_> = neighbors
                .iter()
                .filter(|n| n.mac.as_ref() == Some(mac) && n.ip != gw)
                .map(|n| n.ip.clone())
                .collect();
            if !same_mac.is_empty() {
                findings.push(PollutionFinding {
                    kind: "arp".into(),
                    severity: "high".into(),
                    evidence: format!(
                        "Gateway {gw} MAC {mac} also claimed by: {}. Possible ARP spoofing (read-only detection).",
                        same_mac.join(", ")
                    ),
                    command_hint: "detectArpSpoofing(local) // read-only; no poison".into(),
                });
            } else {
                findings.push(PollutionFinding {
                    kind: "arp".into(),
                    severity: "info".into(),
                    evidence: format!("Gateway {gw} bound to MAC {mac} (single binding in cache)."),
                    command_hint: "detectArpSpoofing(local) // read-only".into(),
                });
            }
        }
    } else {
        findings.push(PollutionFinding {
            kind: "arp".into(),
            severity: "info".into(),
            evidence: "No default gateway — skip ARP spoofing check.".into(),
            command_hint: "detectArpSpoofing(local) // read-only".into(),
        });
    }

    Ok(findings)
}

fn extract_paren_ip(line: &str) -> Option<String> {
    let start = line.find('(')? + 1;
    let end = line[start..].find(')')? + start;
    Some(line[start..end].to_string())
}

fn extract_mac(line: &str) -> Option<String> {
    for token in line.split_whitespace() {
        if token.contains(':')
            && token.len() >= 11
            && token.chars().filter(|c| *c == ':').count() == 5
            && token.chars().all(|c| c.is_ascii_hexdigit() || c == ':')
        {
            return Some(token.to_ascii_lowercase());
        }
        if token == "(incomplete)" {
            return None;
        }
    }
    None
}
