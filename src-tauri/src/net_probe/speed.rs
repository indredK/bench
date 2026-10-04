//! LibreSpeed-compatible bandwidth probe (Post-MVP-C).
//! Protocol: ping/empty + download garbage + upload empty (design §11.3).

use super::types::{ScanSessionEvent, SpeedSampleEvent, SpeedSource, SpeedTestResult};
use crate::error::{AppError, AppResult};
use futures_util::{Stream, StreamExt};
use std::future::Future;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Runtime};
use tokio_util::sync::CancellationToken;

pub const SPEED_SAMPLE_EVENT: &str = "network-probe:speed-sample";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

/// Hard caps (S-TT-04): reject larger transfers even if a source asks for more.
const MAX_DOWNLOAD_MB: u64 = 32;
const MAX_UPLOAD_MB: u64 = 8;
const MAX_PHASE_SECS: u64 = 45;
const PING_COUNT: u32 = 8;

pub fn builtin_sources() -> Vec<SpeedSource> {
    // Public instances — verify ToS before shipping hard defaults; users may add self-hosted.
    vec![
        SpeedSource {
            id: "librespeed-org".into(),
            name: "LibreSpeed.org".into(),
            base_url: "https://librespeed.org/".into(),
            dl_path: "backend/garbage.php".into(),
            ul_path: "backend/empty.php".into(),
            ping_path: "backend/empty.php".into(),
        },
        SpeedSource {
            id: "librespeed-ams".into(),
            name: "LibreSpeed (Amsterdam mirror)".into(),
            base_url: "https://speedtest.online.net/".into(),
            dl_path: "garbage.php".into(),
            ul_path: "empty.php".into(),
            ping_path: "empty.php".into(),
        },
        SpeedSource {
            id: "librespeed-selfhost-template".into(),
            name: "Self-hosted template (often offline)".into(),
            base_url: "https://speedtest.example.invalid/".into(),
            dl_path: "backend/garbage.php".into(),
            ul_path: "backend/empty.php".into(),
            ping_path: "backend/empty.php".into(),
        },
    ]
}

fn join_url(base: &str, path: &str) -> String {
    let base = base.trim_end_matches('/');
    let path = path.trim_start_matches('/');
    format!("{base}/{path}")
}

pub async fn run_speed_test<R: Runtime>(
    app: Option<&AppHandle<R>>,
    source_id: String,
) -> AppResult<SpeedTestResult> {
    let source = builtin_sources()
        .into_iter()
        .find(|s| s.id == source_id)
        .ok_or_else(|| AppError::invalid_input(format!("Unknown speed source: {source_id}")))?;

    let session = super::session::new_session();
    let session_id = session.id().to_owned();
    let cancellation = session.cancellation_token();
    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "speed".into(),
            },
        );
    }

    let command_hint = format!("startSpeedTest('{}') // sessionId={session_id}", source.id);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(MAX_PHASE_SECS))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|e| AppError::new("SPEED_CLIENT", e.to_string()))?;

    let mut cancelled = false;
    let mut ping_ms = None;
    let mut jitter_ms = None;
    let mut download_mbps = None;
    let mut upload_mbps = None;

    // --- ping / jitter ---
    emit_sample(app, "ping", 0.0, "running");
    let ping_url = join_url(&source.base_url, &source.ping_path);
    let mut rtts = Vec::new();
    for i in 0..PING_COUNT {
        if cancellation.is_cancelled() {
            cancelled = true;
            break;
        }
        let t0 = Instant::now();
        let Some(res) = run_until_cancelled(client.get(&ping_url).send(), &cancellation).await
        else {
            cancelled = true;
            break;
        };
        let ok = res.map(|r| r.status().is_success()).unwrap_or(false);
        if ok {
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            rtts.push(ms);
            emit_sample(app, "ping", ms, "sample");
        }
        if i + 1 < PING_COUNT
            && run_until_cancelled(
                tokio::time::sleep(std::time::Duration::from_millis(80)),
                &cancellation,
            )
            .await
            .is_none()
        {
            cancelled = true;
            break;
        }
    }
    if !rtts.is_empty() {
        let avg = rtts.iter().sum::<f64>() / rtts.len() as f64;
        ping_ms = Some(avg);
        let mut diffs = Vec::new();
        for w in rtts.windows(2) {
            diffs.push((w[1] - w[0]).abs());
        }
        if !diffs.is_empty() {
            jitter_ms = Some(diffs.iter().sum::<f64>() / diffs.len() as f64);
        }
    }

    // --- download ---
    if !cancelled && !cancellation.is_cancelled() {
        emit_sample(app, "download", 0.0, "running");
        // Ask the LibreSpeed endpoint for the configured amount and stop reading
        // its response stream as soon as the byte budget is reached.
        let ck = MAX_DOWNLOAD_MB.clamp(1, MAX_DOWNLOAD_MB);
        let dl_url = format!(
            "{}?ckSize={ck}&r={}",
            join_url(&source.base_url, &source.dl_path),
            uuid::Uuid::new_v4()
        );
        let t0 = Instant::now();
        let max_bytes = (MAX_DOWNLOAD_MB * 1024 * 1024) as usize;
        match run_until_cancelled(client.get(&dl_url).send(), &cancellation).await {
            None => {
                cancelled = true;
                emit_sample(app, "download", 0.0, "cancelled");
            }
            Some(Ok(resp)) if resp.status().is_success() => {
                match read_capped_stream(resp.bytes_stream(), max_bytes, &cancellation).await {
                    Ok(read) if read.cancelled => {
                        cancelled = true;
                        emit_sample(app, "download", 0.0, "cancelled");
                    }
                    Ok(read) if read.bytes_read > 0 => {
                        let secs = t0.elapsed().as_secs_f64().max(0.001);
                        let mbps = (read.bytes_read as f64 * 8.0) / (secs * 1_000_000.0);
                        download_mbps = Some(mbps);
                        emit_sample(app, "download", mbps, "done");
                    }
                    Ok(_) => emit_sample(app, "download", 0.0, "empty-body"),
                    Err(e) => emit_sample(app, "download", 0.0, &format!("error:{e}")),
                }
            }
            Some(Ok(resp)) => emit_sample(app, "download", 0.0, &format!("http:{}", resp.status())),
            Some(Err(e)) => emit_sample(app, "download", 0.0, &format!("error:{e}")),
        }
    } else {
        cancelled = true;
    }

    // --- upload ---
    if !cancelled && !cancellation.is_cancelled() {
        emit_sample(app, "upload", 0.0, "running");
        let ul_url = join_url(&source.base_url, &source.ul_path);
        let payload = vec![0u8; (MAX_UPLOAD_MB.clamp(1, MAX_UPLOAD_MB) * 1024 * 1024) as usize];
        let payload_len = payload.len();
        let t0 = Instant::now();
        match run_until_cancelled(client.post(&ul_url).body(payload).send(), &cancellation).await {
            None => {
                cancelled = true;
                emit_sample(app, "upload", 0.0, "cancelled");
            }
            Some(Ok(resp)) if resp.status().is_success() => {
                let secs = t0.elapsed().as_secs_f64().max(0.001);
                let mbps = (payload_len as f64 * 8.0) / (secs * 1_000_000.0);
                upload_mbps = Some(mbps);
                emit_sample(app, "upload", mbps, "done");
            }
            Some(Ok(resp)) => emit_sample(app, "upload", 0.0, &format!("http:{}", resp.status())),
            Some(Err(e)) => emit_sample(app, "upload", 0.0, &format!("error:{e}")),
        }
    } else {
        cancelled = cancelled || cancellation.is_cancelled();
    }

    cancelled = cancelled || cancellation.is_cancelled();
    // Ping confirms latency only; a bandwidth test needs at least one usable
    // throughput sample to avoid treating broken transfer endpoints as success.
    let ok = has_bandwidth_sample(download_mbps, upload_mbps);
    Ok(SpeedTestResult {
        source_id: source.id,
        source_name: source.name,
        ping_ms,
        jitter_ms,
        download_mbps,
        upload_mbps,
        ok,
        cancelled,
        session_id,
        message: if cancelled {
            Some("Speed test cancelled.".into())
        } else if !ok {
            Some(
                "Speed source returned no usable bandwidth samples. Wait before retrying (cooldown)."
                    .into(),
            )
        } else {
            None
        },
        command_hint,
    })
}

fn has_bandwidth_sample(download_mbps: Option<f64>, upload_mbps: Option<f64>) -> bool {
    download_mbps.is_some() || upload_mbps.is_some()
}

fn emit_sample<R: Runtime>(app: Option<&AppHandle<R>>, phase: &str, value: f64, detail: &str) {
    if let Some(app) = app {
        let _ = app.emit(
            SPEED_SAMPLE_EVENT,
            &SpeedSampleEvent {
                phase: phase.into(),
                value,
                detail: detail.into(),
            },
        );
    }
}

async fn run_until_cancelled<F: Future>(
    future: F,
    cancellation: &CancellationToken,
) -> Option<F::Output> {
    tokio::select! {
        biased;
        _ = cancellation.cancelled() => None,
        output = future => Some(output),
    }
}

#[derive(Debug, PartialEq, Eq)]
struct StreamRead {
    bytes_read: usize,
    cancelled: bool,
}

async fn read_capped_stream<S, B, E>(
    stream: S,
    max_bytes: usize,
    cancellation: &CancellationToken,
) -> Result<StreamRead, E>
where
    S: Stream<Item = Result<B, E>>,
    B: AsRef<[u8]>,
{
    let mut stream = Box::pin(stream);
    let mut bytes_read = 0usize;

    while bytes_read < max_bytes {
        let Some(next) = run_until_cancelled(stream.as_mut().next(), cancellation).await else {
            return Ok(StreamRead {
                bytes_read,
                cancelled: true,
            });
        };

        match next {
            Some(Ok(chunk)) => {
                let remaining = max_bytes.saturating_sub(bytes_read);
                bytes_read = bytes_read.saturating_add(chunk.as_ref().len().min(remaining));
            }
            Some(Err(error)) => return Err(error),
            None => break,
        }
    }

    Ok(StreamRead {
        bytes_read,
        cancelled: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::stream::{self, pending};
    use std::convert::Infallible;

    #[test]
    fn bandwidth_test_requires_a_download_or_upload_sample() {
        assert!(!has_bandwidth_sample(None, None));
        assert!(has_bandwidth_sample(Some(12.5), None));
        assert!(has_bandwidth_sample(None, Some(4.2)));
        assert!(has_bandwidth_sample(Some(12.5), Some(4.2)));
    }

    #[tokio::test]
    async fn download_stream_stops_counting_at_the_configured_limit() {
        let cancellation = CancellationToken::new();
        let poll_count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let stream_poll_count = poll_count.clone();
        let chunks = stream::unfold(0, move |index| {
            let poll_count = stream_poll_count.clone();
            async move {
                if index == 3 {
                    None
                } else {
                    poll_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    Some((Ok::<_, Infallible>(vec![0; 50]), index + 1))
                }
            }
        });

        let read = read_capped_stream(chunks, 100, &cancellation)
            .await
            .unwrap();

        assert_eq!(read.bytes_read, 100);
        assert!(!read.cancelled);
        assert_eq!(poll_count.load(std::sync::atomic::Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn download_stream_returns_promptly_when_cancelled() {
        let cancellation = CancellationToken::new();
        let cancel_handle = cancellation.clone();
        let reader = tokio::spawn(async move {
            read_capped_stream(pending::<Result<Vec<u8>, Infallible>>(), 1, &cancellation)
                .await
                .unwrap()
        });

        tokio::task::yield_now().await;
        cancel_handle.cancel();
        let read = tokio::time::timeout(std::time::Duration::from_secs(1), reader)
            .await
            .expect("cancelled download stream completes")
            .expect("reader task completes");

        assert_eq!(
            read,
            StreamRead {
                bytes_read: 0,
                cancelled: true,
            }
        );
    }
}
