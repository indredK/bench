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
use trippy_core::{Builder, PrivilegeMode, Protocol};

pub const TRACEROUTE_HOP_EVENT: &str = "network-probe:traceroute-hop";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

const DEFAULT_ROUNDS: usize = 3;
const MAX_ROUNDS: usize = 10;
const DEFAULT_MAX_TTL: u8 = 20;
const MAX_TTL_CAP: u8 = 32;

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

    let session_id = super::session::new_session_id();
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
    let mut result = tauri::async_runtime::spawn_blocking(move || {
        run_traceroute_blocking(
            app_owned.as_ref(),
            target_owned,
            max_ttl,
            rounds,
            command_hint,
            session_owned,
        )
    })
    .await
    .map_err(|e| AppError::task_failed(format!("traceroute join: {e}")))??;

    let cancelled = result.cancelled;
    if !result.hops.is_empty() && !cancelled {
        super::asn::enrich_traceroute_hops(&mut result.hops).await;
        if let Some(app) = app {
            for hop in &result.hops {
                let _ = app.emit(TRACEROUTE_HOP_EVENT, hop);
            }
        }
    }

    super::session::clear_session(&session_id);
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

    // Prefer privileged ICMP; fall back to unprivileged UDP (platform-dependent).
    let attempts = [
        (PrivilegeMode::Privileged, Protocol::Icmp, "privileged"),
        (PrivilegeMode::Unprivileged, Protocol::Udp, "unprivileged"),
    ];

    let mut last_err = None;
    for (mode, proto, label) in attempts {
        if super::session::is_cancelled(&session_id) {
            break;
        }
        match trace_once(app, ip, max_ttl, rounds, mode, proto, &session_id) {
            Ok((hops, cancelled)) => {
                return Ok(TracerouteResult {
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
                });
            }
            Err(e) => last_err = Some(e),
        }
    }

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

    let tracer = Builder::new(ip)
        .privilege_mode(mode)
        .protocol(proto)
        .max_rounds(Some(rounds))
        .first_ttl(1)
        .max_ttl(max_ttl)
        .build()
        .map_err(|e| AppError::new("TRACEROUTE_BUILD", e.to_string()))?;

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
