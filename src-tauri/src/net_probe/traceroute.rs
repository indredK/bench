use super::types::{ScanSessionEvent, TracerouteHop, TracerouteResult};
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::net::IpAddr;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Runtime};
use trippy_core::{Builder, Port, PortDirection, PrivilegeMode, Protocol, Tracer};

#[cfg(target_os = "macos")]
use std::collections::HashSet;
#[cfg(target_os = "macos")]
use std::sync::OnceLock;
#[cfg(target_os = "macos")]
use uuid::Uuid;

pub const TRACEROUTE_HOP_EVENT: &str = "network-probe:traceroute-hop";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

const DEFAULT_ROUNDS: usize = 3;
const MAX_ROUNDS: usize = 10;
const DEFAULT_MAX_TTL: u8 = 20;
const MAX_TTL_CAP: u8 = 32;

type TraceAttempt = (PrivilegeMode, Protocol, &'static str);

const MACOS_TRACE_ATTEMPTS: &[TraceAttempt] = &[
    (PrivilegeMode::Privileged, Protocol::Icmp, "privileged"),
    (PrivilegeMode::Unprivileged, Protocol::Udp, "unprivileged"),
];
const PRIVILEGED_TRACE_ATTEMPTS: &[TraceAttempt] =
    &[(PrivilegeMode::Privileged, Protocol::Icmp, "privileged")];

#[cfg(target_os = "macos")]
const DYNAMIC_UDP_SOURCE_PORT_START: u16 = 49_152;
#[cfg(target_os = "macos")]
const DYNAMIC_UDP_SOURCE_PORT_COUNT: usize = 16_384;

pub async fn run_traceroute<R: Runtime>(
    app: Option<&AppHandle<R>>,
    target: String,
    max_ttl: Option<u8>,
    rounds: Option<u32>,
) -> AppResult<TracerouteResult> {
    validate_host(&target)?;
    let max_ttl = max_ttl.unwrap_or(DEFAULT_MAX_TTL).clamp(1, MAX_TTL_CAP);
    let rounds = rounds
        .unwrap_or(DEFAULT_ROUNDS as u32)
        .clamp(1, MAX_ROUNDS as u32) as usize;

    let session_guard = super::session::SessionGuard::new();
    let session_id = session_guard.id().to_string();
    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "traceroute".into(),
            },
        );
    }

    let command_hint = format!(
        "startTraceroute(local, '{target}', {{maxTtl:{max_ttl},rounds:{rounds}}}) // sessionId={session_id}"
    );

    let target_owned = target.clone();
    let app_owned = app.cloned();
    let session_owned = session_id.clone();
    let blocking_result = tauri::async_runtime::spawn_blocking(move || {
        let result = run_traceroute_blocking(
            app_owned.as_ref(),
            target_owned,
            max_ttl,
            rounds,
            command_hint,
            session_owned,
        );
        drop(session_guard);
        result
    })
    .await
    .map_err(|e| AppError::task_failed(format!("traceroute join: {e}")));
    let mut result = blocking_result??;

    let cancelled = result.cancelled;
    if !result.hops.is_empty() && !cancelled {
        super::asn::enrich_traceroute_hops(&mut result.hops).await;
        if let Some(app) = app {
            for hop in &result.hops {
                let _ = app.emit(TRACEROUTE_HOP_EVENT, hop);
            }
        }
    }

    Ok(result)
}

fn run_traceroute_blocking<R: Runtime>(
    app: Option<&AppHandle<R>>,
    target: String,
    max_ttl: u8,
    rounds: usize,
    command_hint: String,
    session_id: String,
) -> AppResult<TracerouteResult> {
    let started = Instant::now();
    let ip = resolve_ip(&target)?;

    if super::session::is_cancelled(&session_id) {
        return Ok(TracerouteResult {
            target,
            resolved_ip: ip.to_string(),
            privilege_mode: "cancelled".into(),
            hops: vec![],
            rounds: 0,
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            message: Some("Traceroute cancelled before start.".into()),
            session_id,
            cancelled: true,
            command_hint,
        });
    }

    // Prefer privileged ICMP; macOS can fall back to unprivileged UDP.
    let attempts = traceroute_attempts_for(current_traceroute_platform());
    match try_trace_attempts(
        attempts,
        || super::session::is_cancelled(&session_id),
        |mode, proto| trace_once(app, ip, max_ttl, rounds, mode, proto, &session_id),
    ) {
        TraceAttemptsOutcome::Success((hops, cancelled), label) => Ok(TracerouteResult {
            target,
            resolved_ip: ip.to_string(),
            privilege_mode: label.into(),
            hops,
            rounds: rounds as u32,
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            message: if cancelled {
                Some("Traceroute cancelled; hop stream stopped.".into())
            } else if label == "unprivileged" {
                Some(
                    "Completed with unprivileged UDP traceroute (ICMP privileged path unavailable)."
                        .into(),
                )
            } else {
                None
            },
            session_id,
            cancelled,
            command_hint,
        }),
        TraceAttemptsOutcome::Cancelled => Ok(TracerouteResult {
            target,
            resolved_ip: ip.to_string(),
            privilege_mode: "cancelled".into(),
            hops: vec![],
            rounds: 0,
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            message: Some("Traceroute cancelled.".into()),
            session_id,
            cancelled: true,
            command_hint,
        }),
        TraceAttemptsOutcome::Unavailable(last_err) => {
            let cancelled = super::session::is_cancelled(&session_id);
            Ok(TracerouteResult {
                target,
                resolved_ip: ip.to_string(),
                privilege_mode: if cancelled {
                    "cancelled".into()
                } else {
                    "unavailable".into()
                },
                hops: vec![],
                rounds: 0,
                elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
                message: Some(if cancelled {
                    "Traceroute cancelled.".into()
                } else {
                    format!(
                        "Traceroute unavailable without sufficient privileges. {}",
                        last_err
                            .map(|e| e.to_string())
                            .unwrap_or_else(|| "No usable protocol mode".into())
                    )
                }),
                session_id,
                cancelled,
                command_hint,
            })
        }
    }
}

fn traceroute_attempts_for(platform: &str) -> &'static [TraceAttempt] {
    if platform == "macos" {
        MACOS_TRACE_ATTEMPTS
    } else {
        PRIVILEGED_TRACE_ATTEMPTS
    }
}

fn current_traceroute_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "unsupported"
    }
}

enum TraceAttemptsOutcome<T, E> {
    Success(T, &'static str),
    Unavailable(Option<E>),
    Cancelled,
}

fn try_trace_attempts<T, E, F, C>(
    attempts: &[TraceAttempt],
    mut is_cancelled: C,
    mut trace: F,
) -> TraceAttemptsOutcome<T, E>
where
    F: FnMut(PrivilegeMode, Protocol) -> Result<T, E>,
    C: FnMut() -> bool,
{
    let mut last_error = None;
    for (mode, protocol, label) in attempts {
        if is_cancelled() {
            return TraceAttemptsOutcome::Cancelled;
        }
        match trace(*mode, *protocol) {
            Ok(result) => return TraceAttemptsOutcome::Success(result, label),
            Err(error) => last_error = Some(error),
        }
    }
    TraceAttemptsOutcome::Unavailable(last_error)
}

fn trace_once<R: Runtime>(
    app: Option<&AppHandle<R>>,
    ip: IpAddr,
    max_ttl: u8,
    rounds: usize,
    mode: PrivilegeMode,
    proto: Protocol,
    session_id: &str,
) -> Result<(Vec<TracerouteHop>, bool), AppError> {
    let latest: Arc<Mutex<Vec<TracerouteHop>>> = Arc::new(Mutex::new(Vec::new()));
    let latest_cb = latest.clone();
    let app_cb = app.cloned();
    let session_cb = session_id.to_string();
    let cancelled_flag = Arc::new(AtomicBool::new(false));
    let cancelled_cb = cancelled_flag.clone();

    #[cfg(target_os = "macos")]
    let udp_port_lease = if proto == Protocol::Udp {
        Some(UdpSourcePortLease::reserve(session_id)?)
    } else {
        None
    };
    #[cfg(target_os = "macos")]
    let udp_source_port = udp_port_lease.as_ref().map(UdpSourcePortLease::port);
    #[cfg(not(target_os = "macos"))]
    let udp_source_port = None;

    let tracer = build_tracer(ip, max_ttl, rounds, mode, proto, udp_source_port)?;

    let run_result = catch_unwind(AssertUnwindSafe(|| {
        tracer.run_with(|_round| {
            if super::session::is_cancelled(&session_cb) {
                cancelled_cb.store(true, Ordering::SeqCst);
                // Abort remaining rounds; outer catch_unwind recovers hops collected so far.
                panic!("network-probe-traceroute-cancelled");
            }
            let state = tracer.snapshot();
            let hops = state
                .hops()
                .iter()
                .filter(|h| h.total_sent() > 0 || h.addr_count() > 0)
                .map(hop_from_trippy)
                .collect::<Vec<_>>();
            if let Ok(mut guard) = latest_cb.lock() {
                *guard = hops.clone();
            }
            if let Some(app) = &app_cb {
                for hop in &hops {
                    let _ = app.emit(TRACEROUTE_HOP_EVENT, hop);
                }
            }
        })
    }));

    let cancelled =
        cancelled_flag.load(Ordering::SeqCst) || super::session::is_cancelled(session_id);

    match run_result {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            if !cancelled {
                return Err(AppError::new("TRACEROUTE_RUN", e.to_string()));
            }
        }
        Err(_) => {
            // Expected path when cancel panics the round handler.
            if !cancelled {
                return Err(AppError::new(
                    "TRACEROUTE_RUN",
                    "Traceroute aborted unexpectedly",
                ));
            }
        }
    }

    let hops = latest.lock().map(|g| g.clone()).unwrap_or_default();
    if hops.is_empty() && !cancelled {
        let state = tracer.snapshot();
        let hops = state
            .hops()
            .iter()
            .filter(|h| h.total_sent() > 0 || h.addr_count() > 0)
            .map(hop_from_trippy)
            .collect::<Vec<_>>();
        if hops.is_empty() {
            return Err(AppError::new(
                "TRACEROUTE_EMPTY",
                "No hops observed (may need privileges)",
            ));
        }
        return Ok((hops, false));
    }
    Ok((hops, cancelled))
}

fn build_tracer(
    ip: IpAddr,
    max_ttl: u8,
    rounds: usize,
    mode: PrivilegeMode,
    proto: Protocol,
    udp_source_port: Option<u16>,
) -> Result<Tracer, AppError> {
    let builder = Builder::new(ip)
        .privilege_mode(mode)
        .protocol(proto)
        .max_rounds(Some(rounds))
        .first_ttl(1)
        .max_ttl(max_ttl);
    let builder = if proto == Protocol::Udp {
        let source_port = udp_source_port.ok_or_else(|| {
            AppError::new(
                "TRACEROUTE_CONFIG",
                "A unique UDP source port is required for unprivileged traceroute",
            )
        })?;
        builder.port_direction(PortDirection::FixedSrc(Port(source_port)))
    } else {
        builder
    };
    builder
        .build()
        .map_err(|e| AppError::new("TRACEROUTE_BUILD", e.to_string()))
}

#[cfg(target_os = "macos")]
fn active_udp_source_ports() -> &'static Mutex<HashSet<u16>> {
    static PORTS: OnceLock<Mutex<HashSet<u16>>> = OnceLock::new();
    PORTS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Holds a per-process unique UDP source port while Trippy is using its unprivileged path.
/// Trippy binds that port for each probe, so parallel sessions must not share it.
#[cfg(target_os = "macos")]
struct UdpSourcePortLease {
    port: u16,
}

#[cfg(target_os = "macos")]
impl UdpSourcePortLease {
    fn reserve(session_id: &str) -> Result<Self, AppError> {
        let uuid = Uuid::parse_str(session_id)
            .map_err(|_| AppError::new("TRACEROUTE_SESSION", "Invalid traceroute session ID"))?;
        let bytes = uuid.as_bytes();
        let seed = usize::from(u16::from_be_bytes([bytes[0], bytes[1]]));
        let mut active = active_udp_source_ports()
            .lock()
            .unwrap_or_else(|error| error.into_inner());

        for offset in 0..DYNAMIC_UDP_SOURCE_PORT_COUNT {
            let candidate = DYNAMIC_UDP_SOURCE_PORT_START
                + ((seed + offset) % DYNAMIC_UDP_SOURCE_PORT_COUNT) as u16;
            if active.insert(candidate) {
                return Ok(Self { port: candidate });
            }
        }

        Err(AppError::new(
            "TRACEROUTE_BUSY",
            "No unique UDP source port is available for traceroute",
        ))
    }

    fn port(&self) -> u16 {
        self.port
    }
}

#[cfg(target_os = "macos")]
impl Drop for UdpSourcePortLease {
    fn drop(&mut self) {
        active_udp_source_ports()
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .remove(&self.port);
    }
}

fn hop_from_trippy(h: &trippy_core::Hop) -> TracerouteHop {
    let addrs: Vec<String> = h.addrs().map(ToString::to_string).collect();
    let avg = if h.total_recv() > 0 {
        Some(h.avg_ms())
    } else {
        None
    };
    TracerouteHop {
        ttl: h.ttl(),
        addrs,
        loss_percent: h.loss_pct(),
        avg_rtt_ms: avg,
        best_rtt_ms: h.best_ms(),
        worst_rtt_ms: h.worst_ms(),
        sent: h.total_sent() as u32,
        recv: h.total_recv() as u32,
        asn: None,
        as_name: None,
    }
}

fn resolve_ip(target: &str) -> AppResult<IpAddr> {
    if let Ok(ip) = IpAddr::from_str(target) {
        return Ok(ip);
    }
    let target = target.to_string();
    let addrs = std::net::ToSocketAddrs::to_socket_addrs(&format!("{target}:0"))
        .map_err(|e| AppError::invalid_input(format!("DNS resolve failed: {e}")))?
        .map(|a| a.ip())
        .collect::<Vec<_>>();
    addrs
        .into_iter()
        .next()
        .ok_or_else(|| AppError::invalid_input("No addresses resolved for target"))
}

#[cfg(test)]
mod tests {
    use super::{build_tracer, traceroute_attempts_for, try_trace_attempts, TraceAttemptsOutcome};
    use std::net::{IpAddr, Ipv4Addr};
    use trippy_core::{Port, PortDirection, PrivilegeMode, Protocol};

    #[test]
    fn macos_falls_back_to_unprivileged_udp_after_privileged_icmp_fails() {
        let mut calls = Vec::new();
        let result = try_trace_attempts(
            traceroute_attempts_for("macos"),
            || false,
            |mode, protocol| {
                calls.push((mode, protocol));
                if mode == PrivilegeMode::Privileged {
                    Err("privileged sockets unavailable")
                } else {
                    Ok("hop stream")
                }
            },
        );

        match result {
            TraceAttemptsOutcome::Success(value, mode) => {
                assert_eq!(value, "hop stream");
                assert_eq!(mode, "unprivileged");
            }
            TraceAttemptsOutcome::Unavailable(_) | TraceAttemptsOutcome::Cancelled => {
                panic!("macOS should complete with the unprivileged UDP fallback")
            }
        }
        assert_eq!(
            calls,
            [
                (PrivilegeMode::Privileged, Protocol::Icmp),
                (PrivilegeMode::Unprivileged, Protocol::Udp),
            ]
        );
    }

    #[test]
    fn cancelled_traceroute_does_not_start_another_privilege_mode() {
        let mut trace_called = false;
        let result = try_trace_attempts(
            traceroute_attempts_for("macos"),
            || true,
            |_, _| {
                trace_called = true;
                Ok::<_, ()>(())
            },
        );

        assert!(matches!(result, TraceAttemptsOutcome::Cancelled));
        assert!(!trace_called);
    }

    #[test]
    fn windows_traceroute_does_not_claim_an_unprivileged_fallback() {
        let attempts = traceroute_attempts_for("windows");

        assert_eq!(attempts.len(), 1);
        assert_eq!(attempts[0].0, PrivilegeMode::Privileged);
        assert_eq!(attempts[0].1, Protocol::Icmp);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn unprivileged_udp_fallback_has_a_valid_port_direction() {
        let tracer = build_tracer(
            IpAddr::V4(Ipv4Addr::LOCALHOST),
            8,
            1,
            PrivilegeMode::Unprivileged,
            Protocol::Udp,
            Some(52_341),
        )
        .expect("unprivileged UDP traceroute configuration should build");

        assert_eq!(Protocol::Udp, tracer.protocol());
        assert_eq!(PrivilegeMode::Unprivileged, tracer.privilege_mode());
        assert_eq!(
            PortDirection::FixedSrc(Port(52_341)),
            tracer.port_direction()
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn parallel_unprivileged_sessions_reserve_distinct_udp_source_ports() {
        use super::{
            UdpSourcePortLease, DYNAMIC_UDP_SOURCE_PORT_COUNT, DYNAMIC_UDP_SOURCE_PORT_START,
        };

        let first = UdpSourcePortLease::reserve("00000001-0000-4000-8000-000000000001")
            .expect("first source port should be available");
        let second = UdpSourcePortLease::reserve("00000002-0000-4000-8000-000000000002")
            .expect("second source port should be available");

        assert_ne!(first.port(), second.port());
        let range_start = u32::from(DYNAMIC_UDP_SOURCE_PORT_START);
        let range = range_start..range_start + DYNAMIC_UDP_SOURCE_PORT_COUNT as u32;
        assert!(range.contains(&u32::from(first.port())));
        assert!(range.contains(&u32::from(second.port())));
    }

    #[test]
    fn privileged_icmp_keeps_its_portless_configuration() {
        let tracer = build_tracer(
            IpAddr::V4(Ipv4Addr::LOCALHOST),
            8,
            1,
            PrivilegeMode::Privileged,
            Protocol::Icmp,
            None,
        )
        .expect("privileged ICMP traceroute configuration should build");

        assert_eq!(Protocol::Icmp, tracer.protocol());
        assert_eq!(PortDirection::None, tracer.port_direction());
    }
}
