use super::input::{looks_like_url, parse_http_url, validate_probe_input};
use super::types::{
    HttpProbeDetail, IcmpProbeDetail, PingSampleError, ProbeTargetResult, TlsLightDetail,
};
use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use reqwest::redirect::Policy;
use std::time::{Duration, Instant};
use url::Url;

const HTTP_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_REDIRECTS: usize = 5;
/// Hard caps for site throughput sampling (plan: 1 MiB or 5s).
const THROUGHPUT_MAX_BYTES: u64 = 1024 * 1024;
const THROUGHPUT_MAX_SECS: Duration = Duration::from_secs(5);
/// Below this, Mbps is omitted (homepage often tiny).
const THROUGHPUT_MIN_BYTES: u64 = 32 * 1024;

pub async fn probe_target(input: String) -> AppResult<ProbeTargetResult> {
    validate_probe_input(&input)?;
    let trimmed = input.trim().to_string();
    let is_url = looks_like_url(&trimmed);
    let display_input = if is_url {
        Url::parse(&trimmed)
            .map(|url| redact_url_for_display(&url))
            .unwrap_or_else(|_| "<redacted>".into())
    } else {
        trimmed.clone()
    };
    let command_hint = format!("probeTarget(local, '{display_input}')");

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

    let (http, tls) = probe_http(http_url, false).await;

    Ok(ProbeTargetResult {
        input: display_input,
        kind: if is_url { "url" } else { "host" }.into(),
        icmp,
        http,
        tls,
        command_hint,
    })
}

pub async fn probe_http_target(target: &str) -> (Option<HttpProbeDetail>, Option<TlsLightDetail>) {
    match parse_http_url(target) {
        Ok(url) => probe_http(url, false).await,
        Err(e) => (
            Some(HttpProbeDetail {
                ok: false,
                status: None,
                ttfb_ms: None,
                final_url: None,
                download_mbps: None,
                download_bytes: None,
                error: Some(e.to_string()),
            }),
            None,
        ),
    }
}

/// HTTP probe that also samples bounded download throughput (sites / official cards).
pub async fn probe_http_target_with_throughput(
    target: &str,
) -> (Option<HttpProbeDetail>, Option<TlsLightDetail>) {
    match parse_http_url(target) {
        Ok(url) => probe_http(url, true).await,
        Err(e) => (
            Some(HttpProbeDetail {
                ok: false,
                status: None,
                ttfb_ms: None,
                final_url: None,
                download_mbps: None,
                download_bytes: None,
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
                error: sample
                    .and_then(|s| s.error.map(|error| error.code().to_string()))
                    .or_else(|| {
                        if ok {
                            None
                        } else {
                            Some(PingSampleError::NetworkError.code().to_string())
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

async fn probe_http(
    url: Url,
    measure_throughput: bool,
) -> (Option<HttpProbeDetail>, Option<TlsLightDetail>) {
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
                    download_mbps: None,
                    download_bytes: None,
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
            let final_url = redact_url_for_display(resp.url());
            let ttfb_ms = started.elapsed().as_secs_f64() * 1000.0;
            let (download_mbps, download_bytes) = if measure_throughput {
                drain_body_with_throughput(resp).await
            } else {
                // Custom target probes report status and TTFB only. Reading the
                // entire body here is both unnecessary and unbounded in memory;
                // a large or never-ending response must not hold the probe open.
                drop(resp);
                (None, None)
            };
            (
                Some(HttpProbeDetail {
                    ok: status < 500,
                    status: Some(status),
                    ttfb_ms: Some(ttfb_ms),
                    final_url: Some(final_url),
                    download_mbps,
                    download_bytes,
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
            let is_connect = e.is_connect();
            let msg = e.without_url().to_string();
            let tls_fail = is_https
                && (msg.contains("certificate")
                    || msg.contains("tls")
                    || msg.contains("SSL")
                    || msg.contains("handshake")
                    || is_connect);
            (
                Some(HttpProbeDetail {
                    ok: false,
                    status: None,
                    ttfb_ms: None,
                    final_url: None,
                    download_mbps: None,
                    download_bytes: None,
                    error: Some(msg.clone()),
                }),
                if is_https {
                    Some(TlsLightDetail {
                        present: true,
                        handshake_ok: !tls_fail && !is_connect,
                        detail: Some(msg),
                    })
                } else {
                    None
                },
            )
        }
    }
}

pub(super) fn redact_url_for_display(url: &Url) -> String {
    let mut display = format!("{}://{}", url.scheme(), url.host_str().unwrap_or_default());
    if let Some(port) = url.port() {
        display.push_str(&format!(":{port}"));
    }
    if url.path() != "/" {
        display.push_str("/[redacted-path]");
    }
    if url.query().is_some() {
        display.push_str("?[redacted]");
    }
    if url.fragment().is_some() {
        display.push_str("#[redacted]");
    }
    display
}

/// Stream body until 1 MiB or 5s; return Mbps only when sample is large enough.
async fn drain_body_with_throughput(resp: reqwest::Response) -> (Option<f64>, Option<u64>) {
    let transfer_start = Instant::now();
    let mut total: u64 = 0;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                total = total.saturating_add(bytes.len() as u64);
            }
            Err(_) => break,
        }
        if total >= THROUGHPUT_MAX_BYTES || transfer_start.elapsed() >= THROUGHPUT_MAX_SECS {
            break;
        }
    }
    let elapsed = transfer_start.elapsed().as_secs_f64();
    let download_bytes = Some(total);
    if total < THROUGHPUT_MIN_BYTES || elapsed <= 0.0 {
        return (None, download_bytes);
    }
    let mbps = (total as f64 * 8.0) / elapsed / 1_000_000.0;
    (Some(mbps), download_bytes)
}

#[cfg(test)]
mod tests {
    use super::{probe_http, redact_url_for_display};
    use std::io::{Read, Write};
    use std::time::{Duration, Instant};
    use url::Url;

    #[test]
    fn mbps_math_example() {
        // 256 KiB in 0.2s → 10.48576 Mbps
        let bytes = 256u64 * 1024;
        let elapsed = 0.2_f64;
        let mbps = (bytes as f64 * 8.0) / elapsed / 1_000_000.0;
        assert!((mbps - 10.485_76).abs() < 0.01);
    }

    #[test]
    fn command_hint_and_final_url_redact_credentials_paths_queries_and_fragments() {
        let url = Url::parse(
            "https://alice:secret@example.com/private/reset-token?api_key=secret#session",
        )
        .unwrap();

        assert_eq!(
            redact_url_for_display(&url),
            "https://example.com/[redacted-path]?[redacted]#[redacted]"
        );
    }

    #[tokio::test]
    async fn custom_http_probe_does_not_wait_for_the_response_body() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (release_body, wait_for_release) = std::sync::mpsc::channel();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request);
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 1000000000\r\nConnection: close\r\n\r\n",
                )
                .unwrap();
            let _ = wait_for_release.recv_timeout(Duration::from_secs(5));
        });

        let url = Url::parse(&format!("http://{address}/slow-body")).unwrap();
        let started = Instant::now();
        let (http, tls) = probe_http(url, false).await;
        let elapsed = started.elapsed();
        let _ = release_body.send(());
        server.join().unwrap();

        assert!(http.is_some_and(|detail| detail.status == Some(200) && detail.ok));
        assert!(tls.is_none());
        assert!(
            elapsed < Duration::from_secs(4),
            "probe waited for the response body: {elapsed:?}"
        );
    }
}
