use super::input::{looks_like_url, parse_http_url, validate_probe_input};
use super::types::{HttpProbeDetail, IcmpProbeDetail, ProbeTargetResult, TlsLightDetail};
use crate::error::{AppError, AppResult};
use reqwest::redirect::Policy;
use std::time::{Duration, Instant};
use url::Url;

const HTTP_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_REDIRECTS: usize = 5;

pub async fn probe_target(input: String) -> AppResult<ProbeTargetResult> {
    validate_probe_input(&input)?;
    let trimmed = input.trim().to_string();
    let is_url = looks_like_url(&trimmed);
    let command_hint = format!("probeTarget(local, '{trimmed}')");

    let icmp = if is_url {
        None
    } else {
        Some(probe_icmp_once(&trimmed).await)
    };

    let http_url = if is_url {
        Url::parse(&trimmed).map_err(|e| AppError::invalid_input(e.to_string()))?
    } else {
        parse_http_url(&trimmed)?
    };

    let (http, tls) = probe_http(http_url).await;

    Ok(ProbeTargetResult {
        input: trimmed,
        kind: if is_url { "url" } else { "host" }.into(),
        icmp,
        http,
        tls,
        command_hint,
    })
}

pub async fn probe_http_target(target: &str) -> (Option<HttpProbeDetail>, Option<TlsLightDetail>) {
    match parse_http_url(target) {
        Ok(url) => probe_http(url).await,
        Err(e) => (
            Some(HttpProbeDetail {
                ok: false,
                status: None,
                ttfb_ms: None,
                final_url: None,
                error: Some(e.to_string()),
            }),
            None,
        ),
    }
}

pub async fn probe_icmp_once(target: &str) -> IcmpProbeDetail {
    match super::ping::ping_host(target.to_string(), Some(1), Some(200)).await {
        Ok(result) => {
            let sample = result.samples.first();
            let ok = sample.map(|s| s.ok).unwrap_or(false);
            IcmpProbeDetail {
                ok,
                rtt_ms: sample.and_then(|s| s.rtt_ms),
                resolved_ip: Some(result.resolved_ip),
                error: sample.and_then(|s| s.error.clone()).or_else(|| {
                    if ok {
                        None
                    } else {
                        Some("icmp failed".into())
                    }
                }),
            }
        }
        Err(e) => IcmpProbeDetail {
            ok: false,
            rtt_ms: None,
            resolved_ip: None,
            error: Some(e.to_string()),
        },
    }
}

async fn probe_http(url: Url) -> (Option<HttpProbeDetail>, Option<TlsLightDetail>) {
    let is_https = url.scheme() == "https";
    let client = match reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .connect_timeout(Duration::from_secs(5))
        .redirect(Policy::limited(MAX_REDIRECTS))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return (
                Some(HttpProbeDetail {
                    ok: false,
                    status: None,
                    ttfb_ms: None,
                    final_url: None,
                    error: Some(e.to_string()),
                }),
                if is_https {
                    Some(TlsLightDetail {
                        present: true,
                        handshake_ok: false,
                        detail: Some(e.to_string()),
                    })
                } else {
                    None
                },
            );
        }
    };

    let started = Instant::now();
    match client.get(url.clone()).send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let final_url = resp.url().to_string();
            let ttfb_ms = started.elapsed().as_secs_f64() * 1000.0;
            // Drain a tiny bit of body so connection completes cleanly.
            let _ = resp.bytes().await;
            (
                Some(HttpProbeDetail {
                    ok: status < 500,
                    status: Some(status),
                    ttfb_ms: Some(ttfb_ms),
                    final_url: Some(final_url),
                    error: None,
                }),
                if is_https {
                    Some(TlsLightDetail {
                        present: true,
                        handshake_ok: true,
                        detail: None,
                    })
                } else {
                    None
                },
            )
        }
        Err(e) => {
            let msg = e.to_string();
            let tls_fail = is_https
                && (msg.contains("certificate")
                    || msg.contains("tls")
                    || msg.contains("SSL")
                    || msg.contains("handshake")
                    || e.is_connect());
            (
                Some(HttpProbeDetail {
                    ok: false,
                    status: None,
                    ttfb_ms: None,
                    final_url: None,
                    error: Some(msg.clone()),
                }),
                if is_https {
                    Some(TlsLightDetail {
                        present: true,
                        handshake_ok: !tls_fail && !e.is_connect(),
                        detail: Some(msg),
                    })
                } else {
                    None
                },
            )
        }
    }
}
