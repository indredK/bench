use super::defaults::get_defaults;
use super::input::{looks_like_url, parse_http_url, validate_probe_input};
use super::probe::{probe_http_target, probe_http_target_with_throughput, probe_icmp_once};
use super::types::{ScanSessionEvent, SiteSampleResult, SitesProbeResult};
use crate::error::{AppError, AppResult};
use std::collections::HashSet;
use std::future::Future;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

pub const SITE_SAMPLE_EVENT: &str = "network-probe:site-sample";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

const MAX_SITES: usize = 32;
const MAX_MONITOR_TARGETS: usize = 3;
const MONITOR_SITE_TIMEOUT: Duration = Duration::from_secs(15);

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
        let sample = match probe_site_cancellable(
            &session_id,
            probe_site(site.id, site.target, site.channel),
        )
        .await
        {
            Some(sample) => sample,
            None => {
                cancelled = true;
                break;
            }
        };
        emit_sample(app, &sample);
        results.push(sample);
    }
    cancelled |= super::session::is_cancelled(&session_id);

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
    let cleaned = validate_custom_targets(targets)?;

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
        let channel = custom_target_channel(&target);
        let sample = match probe_site_cancellable(
            &session_id,
            probe_site(format!("custom-{idx}"), target, channel.into()),
        )
        .await
        {
            Some(sample) => sample,
            None => {
                cancelled = true;
                break;
            }
        };
        emit_sample(app, &sample);
        results.push(sample);
    }
    cancelled |= super::session::is_cancelled(&session_id);

    super::session::clear_session(&session_id);
    Ok(SitesProbeResult {
        pack_id: "custom".into(),
        results,
        cancelled,
        session_id,
        command_hint,
    })
}

pub async fn monitor_sites(targets: Vec<String>) -> AppResult<Vec<SiteSampleResult>> {
    let targets = validate_monitor_targets(targets)?;
    let mut results = Vec::with_capacity(targets.len());

    // Sequential sampling bounds both request concurrency and aggregate load.
    for (index, target) in targets.into_iter().enumerate() {
        let channel = if looks_like_url(&target) {
            "http"
        } else {
            "both"
        };
        let id = format!("monitor-{index}");
        let channel = channel.to_string();
        let sample = bounded_monitor_sample(
            id.clone(),
            target.clone(),
            channel.clone(),
            MONITOR_SITE_TIMEOUT,
            probe_site_with_mode(id, target, channel, false),
        )
        .await;
        results.push(sample);
    }

    Ok(results)
}

fn validate_monitor_targets(targets: Vec<String>) -> AppResult<Vec<String>> {
    if targets.is_empty() {
        return Err(AppError::invalid_input("No monitor targets"));
    }
    if targets.len() > MAX_MONITOR_TARGETS {
        return Err(AppError::invalid_input(format!(
            "Too many monitor targets (max {MAX_MONITOR_TARGETS})"
        )));
    }

    let mut cleaned = Vec::with_capacity(targets.len());
    let mut normalized = HashSet::with_capacity(targets.len());
    for raw in targets {
        let target = raw.trim().to_string();
        if target.is_empty() || target.len() > 2048 {
            return Err(AppError::invalid_input("Monitor target is invalid"));
        }
        validate_custom_target(&target)?;
        let key = parse_http_url(&target)?.to_string();
        if !normalized.insert(key) {
            return Err(AppError::invalid_input("Duplicate monitor target"));
        }
        cleaned.push(target);
    }
    Ok(cleaned)
}

fn redact_site_target(target: &str) -> String {
    parse_http_url(target)
        .map(|url| super::probe::redact_url_for_display(&url))
        .unwrap_or_else(|_| "<redacted>".to_string())
}

async fn bounded_monitor_sample<F>(
    id: String,
    target: String,
    channel: String,
    timeout: Duration,
    probe: F,
) -> SiteSampleResult
where
    F: Future<Output = SiteSampleResult>,
{
    let mut sample = match tokio::time::timeout(timeout, probe).await {
        Ok(sample) => sample,
        Err(_) => SiteSampleResult {
            id,
            target: target.clone(),
            channel,
            ok: false,
            degraded: false,
            icmp_rtt_ms: None,
            http_status: None,
            http_ttfb_ms: None,
            download_mbps: None,
            download_bytes: None,
            error: Some("Monitor probe timed out".into()),
        },
    };
    sample.target = redact_site_target(&target);
    sample
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

async fn probe_site_cancellable<F>(session_id: &str, probe: F) -> Option<SiteSampleResult>
where
    F: Future<Output = SiteSampleResult>,
{
    tokio::select! {
        sample = probe => Some(sample),
        _ = wait_for_cancel(session_id) => None,
    }
}

async fn wait_for_cancel(session_id: &str) {
    loop {
        if super::session::is_cancelled(session_id) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

fn validate_custom_target(target: &str) -> AppResult<()> {
    validate_probe_input(target)?;
    parse_http_url(target).map(|_| ())
}

fn validate_custom_targets(targets: Vec<String>) -> AppResult<Vec<String>> {
    let mut cleaned = Vec::new();
    let mut seen = HashSet::new();
    let mut input_count = 0;

    for raw in targets {
        let target = raw.trim().to_string();
        if target.is_empty() {
            continue;
        }
        input_count += 1;
        if input_count > MAX_SITES {
            return Err(AppError::invalid_input(format!(
                "Too many custom targets (max {MAX_SITES})"
            )));
        }

        validate_custom_target(&target)?;
        let normalized = parse_http_url(&target)?.to_string();
        if seen.insert(normalized) {
            cleaned.push(target);
        }
    }

    if cleaned.is_empty() {
        return Err(AppError::invalid_input("No custom targets"));
    }
    Ok(cleaned)
}

fn custom_target_channel(target: &str) -> &'static str {
    if looks_like_url(target) {
        "http"
    } else {
        "both"
    }
}

async fn probe_site(id: String, target: String, channel: String) -> SiteSampleResult {
    probe_site_with_mode(id, target, channel, true).await
}

async fn probe_site_with_mode(
    id: String,
    target: String,
    channel: String,
    measure_throughput: bool,
) -> SiteSampleResult {
    let channel_l = channel.to_ascii_lowercase();
    let display_target = redact_site_target(&target);
    let mut sample = match channel_l.as_str() {
        "icmp" => {
            let icmp = probe_icmp_once(&target).await;
            if icmp.ok {
                SiteSampleResult {
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
                }
            } else {
                // HTTP fallback when ICMP blocked (scenario S-FA-04).
                let (http, _) = probe_site_http(&target, measure_throughput).await;
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
        }
        "http" | "https" => {
            let (http, _tls) = probe_site_http(&target, measure_throughput).await;
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
            let (http, _) = probe_site_http(&target, measure_throughput).await;
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
    };
    sample.target = display_target;
    sample
}

async fn probe_site_http(
    target: &str,
    measure_throughput: bool,
) -> (
    Option<super::types::HttpProbeDetail>,
    Option<super::types::TlsLightDetail>,
) {
    if measure_throughput {
        probe_http_target_with_throughput(target).await
    } else {
        probe_http_target(target).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monitor_target_validation_is_bounded_and_rejects_duplicates() {
        assert!(validate_monitor_targets(vec![]).is_err());
        assert!(validate_monitor_targets(vec![
            "one.example".into(),
            "two.example".into(),
            "three.example".into(),
            "four.example".into(),
        ])
        .is_err());
        assert!(validate_monitor_targets(vec![
            "example.com".into(),
            "https://example.com/".into(),
        ])
        .is_err());
        assert!(validate_monitor_targets(vec!["https://example.com/path".into()]).is_ok());
    }

    #[test]
    fn custom_targets_share_bounded_http_and_ipv6_validation() {
        assert!(validate_custom_target("HTTPS://EXAMPLE.com/path").is_ok());
        assert!(validate_custom_target("2001:db8::1").is_ok());
        assert!(validate_custom_target(&"a".repeat(2049)).is_err());
        assert!(validate_custom_target("javascript:alert").is_err());
    }

    #[test]
    fn custom_targets_dedupe_by_normalized_http_url() {
        let targets = validate_custom_targets(vec![
            "HTTPS://EXAMPLE.com".into(),
            "https://example.com/".into(),
            "http://example.com".into(),
        ])
        .expect("targets should validate");

        assert_eq!(targets, ["HTTPS://EXAMPLE.com", "http://example.com"]);
    }

    #[test]
    fn custom_site_channel_detection_is_case_insensitive() {
        assert_eq!(custom_target_channel("HTTPS://example.com/"), "http");
        assert_eq!(custom_target_channel("HTTP://example.com/"), "http");
        assert_eq!(custom_target_channel("example.com"), "both");
        assert_eq!(custom_target_channel("2001:db8::1"), "both");
    }

    #[test]
    fn site_display_target_redacts_credentials_path_query_and_fragment() {
        assert_eq!(
            redact_site_target("https://user:secret@example.com:8443/private?token=secret#section"),
            "https://example.com:8443/[redacted-path]?[redacted]#[redacted]",
        );
    }

    #[tokio::test]
    async fn site_sample_redacts_target_even_when_probe_channel_is_unsupported() {
        let sample = probe_site_with_mode(
            "custom-0".into(),
            "https://user:secret@example.com/private?token=secret#section".into(),
            "unsupported".into(),
            false,
        )
        .await;

        assert_eq!(
            sample.target,
            "https://example.com/[redacted-path]?[redacted]#[redacted]",
        );
    }

    #[tokio::test]
    async fn monitor_probe_deadline_returns_a_redacted_failure_sample() {
        let sample = bounded_monitor_sample(
            "monitor-0".into(),
            "https://user:secret@example.com/private?token=secret".into(),
            "http".into(),
            Duration::from_millis(1),
            std::future::pending(),
        )
        .await;

        assert!(!sample.ok);
        assert_eq!(sample.error.as_deref(), Some("Monitor probe timed out"));
        assert_eq!(
            sample.target,
            "https://example.com/[redacted-path]?[redacted]",
        );
    }

    #[tokio::test]
    async fn cancellation_interrupts_an_in_flight_site_probe() {
        let session_id = super::super::session::new_session_id();
        let task_session_id = session_id.clone();
        let task = tokio::spawn(async move {
            probe_site_cancellable(&task_session_id, std::future::pending()).await
        });

        tokio::task::yield_now().await;
        super::super::session::cancel_scan(session_id.clone());
        let result = tokio::time::timeout(Duration::from_secs(1), task)
            .await
            .expect("cancellation should interrupt the pending probe")
            .expect("probe task should not panic");
        super::super::session::clear_session(&session_id);

        assert!(result.is_none());
    }
}
