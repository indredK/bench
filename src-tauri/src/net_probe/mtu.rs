#[cfg(not(target_os = "macos"))]
use super::types::PathMtuResult;
#[cfg(target_os = "macos")]
use super::types::{PathMtuProbeStep, PathMtuResult};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::net::IpAddr;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::time::Instant;

const IPV4_HEADER_ICMP: u16 = 28; // 20 IP + 8 ICMP
const IPV6_HEADER_ICMP: u16 = 48; // 40 IPv6 + 8 ICMPv6
#[cfg(target_os = "macos")]
const MIN_PAYLOAD: u16 = 64;
const MAX_PAYLOAD_V4: u16 = 1472; // 1500 - 28
const MAX_PAYLOAD_V6: u16 = 1452; // 1500 - 48

pub async fn probe_path_mtu(target: String) -> AppResult<PathMtuResult> {
    let mut target = target.trim().to_string();
    if target.is_empty() || target == "gateway" {
        target = resolve_gateway_target()?;
    }
    validate_host(&target)?;
    let command_hint = format!("probePathMtu(local, '{target}')");
    let started = Instant::now();

    let ip = super::ping::resolve_target_ip(&target).await?;
    #[cfg(target_os = "macos")]
    let (min_payload, max_payload, header) = match ip {
        IpAddr::V4(_) => (MIN_PAYLOAD, MAX_PAYLOAD_V4, IPV4_HEADER_ICMP),
        IpAddr::V6(_) => (MIN_PAYLOAD, MAX_PAYLOAD_V6, IPV6_HEADER_ICMP),
    };

    #[cfg(target_os = "macos")]
    {
        Ok(probe_macos_df(
            target,
            ip,
            min_payload,
            max_payload,
            header,
            command_hint,
            started,
        ))
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(PathMtuResult {
            target,
            resolved_ip: ip.to_string(),
            status: "unsupported".into(),
            path_mtu: None,
            max_payload: None,
            method: "none".into(),
            steps: vec![],
            message: Some(
                "Path MTU (DF binary search) is implemented on macOS for MVP; other platforms deferred."
                    .into(),
            ),
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            command_hint,
        })
    }
}

/// Quick ladder for health scan (3 sizes) — avoids long binary search.
pub async fn probe_path_mtu_health() -> AppResult<PathMtuResult> {
    let target = "1.1.1.1".to_string();
    let command_hint = "probePathMtu(local, '1.1.1.1')".to_string();
    let started = Instant::now();
    let ip = super::ping::resolve_target_ip(&target).await?;
    let header = match ip {
        IpAddr::V4(_) => IPV4_HEADER_ICMP,
        IpAddr::V6(_) => IPV6_HEADER_ICMP,
    };
    let sizes: &[u16] = match ip {
        IpAddr::V4(_) => &[
            576 - IPV4_HEADER_ICMP,
            1200 - IPV4_HEADER_ICMP,
            MAX_PAYLOAD_V4,
        ],
        IpAddr::V6(_) => &[
            1280 - IPV6_HEADER_ICMP,
            1400 - IPV6_HEADER_ICMP,
            MAX_PAYLOAD_V6,
        ],
    };

    #[cfg(target_os = "macos")]
    {
        let mut steps = Vec::new();
        let mut best_ok: Option<u16> = None;
        let mut saw_timeout_after_ok = false;
        for &payload in sizes {
            let (ok, detail) = ping_df_once(&ip.to_string(), payload);
            if ok {
                best_ok = Some(payload);
            } else if best_ok.is_some() && detail.as_deref().is_some_and(|d| d.contains("timeout"))
            {
                saw_timeout_after_ok = true;
            }
            steps.push(PathMtuProbeStep {
                payload_bytes: payload,
                ok,
                detail,
            });
        }
        let (status, path_mtu, max_payload, message) = match best_ok {
            Some(p) if p == *sizes.last().unwrap_or(&p) => (
                "ok".to_string(),
                Some(p.saturating_add(header)),
                Some(p),
                None,
            ),
            Some(p) if saw_timeout_after_ok => (
                "blackhole".to_string(),
                Some(p.saturating_add(header)),
                Some(p),
                Some("Larger DF packets timed out — possible PMTUD blackhole".into()),
            ),
            Some(p) => (
                "ok".to_string(),
                Some(p.saturating_add(header)),
                Some(p),
                Some("Path MTU below Ethernet default (quick ladder)".into()),
            ),
            None => (
                "fail".to_string(),
                None,
                None,
                Some("All quick MTU ladder sizes failed".into()),
            ),
        };
        Ok(PathMtuResult {
            target,
            resolved_ip: ip.to_string(),
            status,
            path_mtu,
            max_payload,
            method: "ping-df-ladder".into(),
            steps,
            message,
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            command_hint,
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (header, sizes);
        Ok(PathMtuResult {
            target,
            resolved_ip: ip.to_string(),
            status: "unsupported".into(),
            path_mtu: None,
            max_payload: None,
            method: "none".into(),
            steps: vec![],
            message: Some("MTU quick probe is macOS-only for MVP".into()),
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            command_hint,
        })
    }
}

#[cfg(target_os = "macos")]
fn probe_macos_df(
    target: String,
    ip: IpAddr,
    min_payload: u16,
    max_payload: u16,
    header: u16,
    command_hint: String,
    started: Instant,
) -> PathMtuResult {
    let host = ip.to_string();
    let mut steps = Vec::new();
    let mut lo = min_payload;
    let mut hi = max_payload;
    let mut saw_msg_too_long = false;
    let mut saw_timeout_on_large = false;

    // Confirm baseline small packet works.
    let (base_ok, base_detail) = ping_df_once(&host, min_payload);
    steps.push(PathMtuProbeStep {
        payload_bytes: min_payload,
        ok: base_ok,
        detail: base_detail.clone(),
    });
    if !base_ok {
        return PathMtuResult {
            target,
            resolved_ip: host,
            status: "fail".into(),
            path_mtu: None,
            max_payload: None,
            method: "ping-df-binary".into(),
            steps,
            message: Some(format!(
                "Baseline DF ping failed: {}",
                base_detail.unwrap_or_default()
            )),
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            command_hint,
        };
    }
    let mut best_ok = Some(min_payload);

    while lo + 1 < hi {
        let mid = lo + (hi - lo) / 2;
        let (ok, detail) = ping_df_once(&host, mid);
        if detail.as_deref().is_some_and(|d| d.contains("too long")) {
            saw_msg_too_long = true;
        }
        if !ok && detail.as_deref().is_some_and(|d| d.contains("timeout")) {
            saw_timeout_on_large = true;
        }
        steps.push(PathMtuProbeStep {
            payload_bytes: mid,
            ok,
            detail,
        });
        if ok {
            best_ok = Some(mid);
            lo = mid;
        } else {
            hi = mid;
        }
    }

    // Probe max once if not already.
    if !steps.iter().any(|s| s.payload_bytes == max_payload) {
        let (ok, detail) = ping_df_once(&host, max_payload);
        if detail.as_deref().is_some_and(|d| d.contains("too long")) {
            saw_msg_too_long = true;
        }
        if !ok && detail.as_deref().is_some_and(|d| d.contains("timeout")) {
            saw_timeout_on_large = true;
        }
        steps.push(PathMtuProbeStep {
            payload_bytes: max_payload,
            ok,
            detail,
        });
        if ok {
            best_ok = Some(max_payload);
        }
    }

    let max_ok = best_ok.unwrap_or(min_payload);
    let path_mtu = max_ok.saturating_add(header);
    let (status, message) = if max_ok >= max_payload {
        ("ok".to_string(), None)
    } else if saw_timeout_on_large && !saw_msg_too_long {
        (
            "blackhole".to_string(),
            Some(
                "Large DF packets timed out without Message too long — possible PMTUD blackhole"
                    .into(),
            ),
        )
    } else {
        (
            "ok".to_string(),
            Some(format!(
                "Path MTU estimated at {path_mtu} (below Ethernet default)"
            )),
        )
    };

    PathMtuResult {
        target,
        resolved_ip: host,
        status,
        path_mtu: Some(path_mtu),
        max_payload: Some(max_ok),
        method: "ping-df-binary".into(),
        steps,
        message,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    }
}

#[cfg(target_os = "macos")]
fn ping_df_once(host: &str, payload: u16) -> (bool, Option<String>) {
    // -D Don't Fragment; -s payload size; -c 1; -W 1000 ms wait (BSD ping)
    let output = Command::new("ping")
        .args([
            "-c",
            "1",
            "-W",
            "1000",
            "-D",
            "-s",
            &payload.to_string(),
            host,
        ])
        .output();
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let stderr = String::from_utf8_lossy(&out.stderr);
            let combined = format!("{stdout}{stderr}").to_ascii_lowercase();
            if out.status.success() {
                (true, Some(format!("ok payload={payload}")))
            } else if combined.contains("message too long")
                || combined.contains("packet too big")
                || combined.contains("frag needed")
            {
                (false, Some("too long".into()))
            } else if combined.contains("100.0% packet loss")
                || combined.contains("request timeout")
                || combined.contains("no answer")
                || !out.status.success()
            {
                (false, Some("timeout".into()))
            } else {
                (false, Some(format!("fail: {}", stderr.trim())))
            }
        }
        Err(e) => (false, Some(format!("ping spawn failed: {e}"))),
    }
}

fn resolve_gateway_target() -> AppResult<String> {
    let route = super::summary::collect_default_route()?;
    route.gateway.ok_or_else(|| {
        AppError::invalid_input("No default gateway available for MTU probe target 'gateway'")
    })
}
