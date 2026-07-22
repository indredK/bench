use super::defaults::get_defaults;
use super::probe::{probe_http_target_with_throughput, probe_icmp_once};
use super::types::{ScanSessionEvent, SiteSampleResult, SitesProbeResult};
use crate::error::{AppError, AppResult};
use tauri::{AppHandle, Emitter, Runtime};

pub const SITE_SAMPLE_EVENT: &str = "network-probe:site-sample";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

const MAX_SITES: usize = 32;

pub async fn sites_probe<R: Runtime>(
    app: Option<&AppHandle<R>>,
    pack_id: String,
) -> AppResult<SitesProbeResult> {
    let catalog = get_defaults()?;
    let pack_id = pack_id.trim().to_string();
    let sites = catalog
        .site_packs
        .get(&pack_id)
        .cloned()
        .ok_or_else(|| AppError::invalid_input(format!("Unknown site pack: {pack_id}")))?;

    if sites.is_empty() {
        return Err(AppError::invalid_input("Site pack is empty"));
    }
    if sites.len() > MAX_SITES {
        return Err(AppError::invalid_input(format!(
            "Site pack too large (max {MAX_SITES})"
        )));
    }

    let session_id = super::session::new_session_id();
    emit_session(app, &session_id);
    let command_hint = format!("startSitesProbe(local, '{pack_id}') // sessionId={session_id}");

    let mut results = Vec::new();
    let mut cancelled = false;
    for site in sites {
        if super::session::is_cancelled(&session_id) {
            cancelled = true;
            break;
        }
        let sample = probe_site(site.id, site.target, site.channel).await;
        emit_sample(app, &sample);
        results.push(sample);
    }

    super::session::clear_session(&session_id);
    Ok(SitesProbeResult {
        pack_id,
        results,
        cancelled,
        session_id,
        command_hint,
    })
}

pub async fn sites_probe_custom<R: Runtime>(
    app: Option<&AppHandle<R>>,
    targets: Vec<String>,
) -> AppResult<SitesProbeResult> {
    let mut cleaned = Vec::new();
    for raw in targets {
        let t = raw.trim().to_string();
        if t.is_empty() {
            continue;
        }
        validate_custom_target(&t)?;
        cleaned.push(t);
        if cleaned.len() > MAX_SITES {
            return Err(AppError::invalid_input(format!(
                "Too many custom targets (max {MAX_SITES})"
            )));
        }
    }
    if cleaned.is_empty() {
        return Err(AppError::invalid_input("No custom targets"));
    }

    let session_id = super::session::new_session_id();
    emit_session(app, &session_id);
    let command_hint = format!(
        "startSitesProbe(local, custom[{}]) // sessionId={session_id}",
        cleaned.len()
    );

    let mut results = Vec::new();
    let mut cancelled = false;
    for (idx, target) in cleaned.into_iter().enumerate() {
        if super::session::is_cancelled(&session_id) {
            cancelled = true;
            break;
        }
        let channel = if target.starts_with("http://") || target.starts_with("https://") {
            "http"
        } else {
            "both"
        };
        let sample = probe_site(format!("custom-{idx}"), target, channel.into()).await;
        emit_sample(app, &sample);
        results.push(sample);
    }

    super::session::clear_session(&session_id);
    Ok(SitesProbeResult {
        pack_id: "custom".into(),
        results,
        cancelled,
        session_id,
        command_hint,
    })
}

fn emit_session<R: Runtime>(app: Option<&AppHandle<R>>, session_id: &str) {
    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.into(),
                kind: "sites".into(),
            },
        );
    }
}

fn emit_sample<R: Runtime>(app: Option<&AppHandle<R>>, sample: &SiteSampleResult) {
    if let Some(app) = app {
        let _ = app.emit(SITE_SAMPLE_EVENT, sample);
    }
}

fn validate_custom_target(target: &str) -> AppResult<()> {
    let lower = target.to_ascii_lowercase();
    if lower.starts_with("javascript:")
        || lower.starts_with("data:")
        || lower.starts_with("file:")
        || lower.starts_with("vbscript:")
    {
        return Err(AppError::invalid_input(
            "Dangerous URL scheme is not allowed",
        ));
    }
    super::validate::validate_host(&host_from_target(target))?;
    Ok(())
}

fn host_from_target(target: &str) -> String {
    let stripped = target
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    let authority = stripped.split('/').next().unwrap_or(stripped);
    let authority = authority.rsplit('@').next().unwrap_or(authority);
    if let Some(rest) = authority.strip_prefix('[') {
        return rest.split(']').next().unwrap_or(rest).to_string();
    }
    authority.split(':').next().unwrap_or(authority).to_string()
}

async fn probe_site(id: String, target: String, channel: String) -> SiteSampleResult {
    let channel_l = channel.to_ascii_lowercase();
    match channel_l.as_str() {
        "icmp" => {
            let icmp = probe_icmp_once(&target).await;
            if icmp.ok {
                return SiteSampleResult {
                    id,
                    target,
                    channel,
                    ok: true,
                    degraded: false,
                    icmp_rtt_ms: icmp.rtt_ms,
                    http_status: None,
                    http_ttfb_ms: None,
                    download_mbps: None,
                    download_bytes: None,
                    error: None,
                };
            }
            // HTTP fallback when ICMP blocked (scenario S-FA-04).
            let http_target = if target.starts_with("http://") || target.starts_with("https://") {
                target.clone()
            } else {
                format!("https://{target}")
            };
            let (http, _) = probe_http_target_with_throughput(&http_target).await;
            let http_ok = http.as_ref().map(|h| h.ok).unwrap_or(false);
            SiteSampleResult {
                id,
                target,
                channel: "icmp→http".into(),
                ok: http_ok,
                degraded: http_ok,
                icmp_rtt_ms: None,
                http_status: http.as_ref().and_then(|h| h.status),
                http_ttfb_ms: http.as_ref().and_then(|h| h.ttfb_ms),
                download_mbps: http.as_ref().and_then(|h| h.download_mbps),
                download_bytes: http.as_ref().and_then(|h| h.download_bytes),
                error: if http_ok {
                    Some(format!(
                        "degraded: icmp failed ({})",
                        icmp.error.unwrap_or_else(|| "unreachable".into())
                    ))
                } else {
                    Some(
                        [icmp.error, http.and_then(|h| h.error)]
                            .into_iter()
                            .flatten()
                            .collect::<Vec<_>>()
                            .join("; "),
                    )
                },
            }
        }
        "http" | "https" => {
            let (http, _tls) = probe_http_target_with_throughput(&target).await;
            let http = http.unwrap_or(super::types::HttpProbeDetail {
                ok: false,
                status: None,
                ttfb_ms: None,
                final_url: None,
                download_mbps: None,
                download_bytes: None,
                error: Some("http probe missing".into()),
            });
            SiteSampleResult {
                id,
                target,
                channel,
                ok: http.ok,
                degraded: false,
                icmp_rtt_ms: None,
                http_status: http.status,
                http_ttfb_ms: http.ttfb_ms,
                download_mbps: http.download_mbps,
                download_bytes: http.download_bytes,
                error: http.error,
            }
        }
        "both" | "dual" => {
            let icmp = probe_icmp_once(&target).await;
            let http_target = if target.starts_with("http://") || target.starts_with("https://") {
                target.clone()
            } else {
                format!("https://{target}")
            };
            let (http, _) = probe_http_target_with_throughput(&http_target).await;
            let http_ok = http.as_ref().map(|h| h.ok).unwrap_or(false);
            let degraded = !icmp.ok && http_ok;
            SiteSampleResult {
                id,
                target,
                channel,
                ok: icmp.ok || http_ok,
                degraded,
                icmp_rtt_ms: icmp.rtt_ms,
                http_status: http.as_ref().and_then(|h| h.status),
                http_ttfb_ms: http.as_ref().and_then(|h| h.ttfb_ms),
                download_mbps: http.as_ref().and_then(|h| h.download_mbps),
                download_bytes: http.as_ref().and_then(|h| h.download_bytes),
                error: if icmp.ok || http_ok {
                    if degraded {
                        Some(format!(
                            "degraded: icmp failed ({})",
                            icmp.error.unwrap_or_else(|| "unreachable".into())
                        ))
                    } else {
                        None
                    }
                } else {
                    Some(
                        [icmp.error.clone(), http.and_then(|h| h.error)]
                            .into_iter()
                            .flatten()
                            .collect::<Vec<_>>()
                            .join("; "),
                    )
                },
            }
        }
        other => SiteSampleResult {
            id,
            target,
            channel,
            ok: false,
            degraded: false,
            icmp_rtt_ms: None,
            http_status: None,
            http_ttfb_ms: None,
            download_mbps: None,
            download_bytes: None,
            error: Some(format!("Unsupported channel: {other}")),
        },
    }
}
