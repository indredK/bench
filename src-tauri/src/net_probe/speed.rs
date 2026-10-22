//! LibreSpeed-compatible bandwidth probe (Post-MVP-C).
//! Protocol: ping/empty + download garbage + upload empty (design §11.3).

use super::types::{ScanSessionEvent, SpeedSampleEvent, SpeedSource, SpeedTestResult};
use crate::error::{AppError, AppResult};
use futures_util::{Stream, StreamExt};
use std::future::Future;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Runtime};

pub const SPEED_SAMPLE_EVENT: &str = "network-probe:speed-sample";
pub const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";

/// Hard caps (S-TT-04): reject larger transfers even if a source asks for more.
const MAX_DOWNLOAD_MB: u64 = 32;
const MAX_UPLOAD_MB: u64 = 8;
const MAX_PHASE_SECS: u64 = 45;
const PING_COUNT: u32 = 8;

fn upload_limit_mb(source_limit_mb: u64) -> u64 {
    source_limit_mb.clamp(1, MAX_UPLOAD_MB)
}

/// Bound response-body consumption even when a source ignores `ckSize`.
/// Only byte counts are needed for the speed result, so keep no body buffer.
async fn count_stream_capped<S, B, E>(stream: S, max_bytes: usize) -> Result<usize, E>
where
    S: Stream<Item = Result<B, E>>,
    B: AsRef<[u8]>,
{
    if max_bytes == 0 {
        return Ok(0);
    }
    futures_util::pin_mut!(stream);
    let mut total = 0usize;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        let remaining = max_bytes.saturating_sub(total);
        total += chunk.as_ref().len().min(remaining);
        if total == max_bytes {
            break;
        }
    }
    Ok(total)
}

async fn await_or_cancel<F>(session_id: &str, request: F) -> Option<F::Output>
where
    F: Future,
{
    tokio::select! {
        biased;
        _ = wait_for_cancel(session_id) => None,
        result = request => Some(result),
    }
}

async fn wait_for_cancel(session_id: &str) {
    loop {
        if super::session::is_cancelled(session_id) {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
}

pub fn builtin_sources() -> Vec<SpeedSource> {
    // Public instances from LibreSpeed's upstream server list; keep source transfer caps explicit.
    vec![
        SpeedSource {
            id: "librespeed-sharktech".into(),
            name: "LibreSpeed (Amsterdam · Sharktech)".into(),
            base_url: "https://amsspeed.sharktech.net/".into(),
            dl_path: "backend/garbage.php".into(),
            ul_path: "backend/empty.php".into(),
            ping_path: "backend/empty.php".into(),
            max_upload_mb: 8,
        },
        SpeedSource {
            id: "librespeed-clouvider".into(),
            name: "LibreSpeed (Amsterdam · Clouvider)".into(),
            base_url: "https://ams.speedtest.clouvider.net/backend/".into(),
            dl_path: "garbage.php".into(),
            ul_path: "empty.php".into(),
            ping_path: "empty.php".into(),
            max_upload_mb: 4,
        },
        SpeedSource {
            id: "librespeed-selfhost-template".into(),
            name: "Self-hosted template (often offline)".into(),
            base_url: "https://speedtest.example.invalid/".into(),
            dl_path: "backend/garbage.php".into(),
            ul_path: "backend/empty.php".into(),
            ping_path: "backend/empty.php".into(),
            max_upload_mb: 8,
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

    let session_id = super::session::new_session_id();
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
        if super::session::is_cancelled(&session_id) {
            cancelled = true;
            break;
        }
        let t0 = Instant::now();
        let res = match await_or_cancel(&session_id, client.get(&ping_url).send()).await {
            Some(result) => result,
            None => {
                cancelled = true;
                break;
            }
        };
        let ok = res.map(|r| r.status().is_success()).unwrap_or(false);
        if ok {
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            rtts.push(ms);
            emit_sample(app, "ping", ms, "sample");
        }
        if i + 1 < PING_COUNT {
            tokio::time::sleep(std::time::Duration::from_millis(80)).await;
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
    if !cancelled && !super::session::is_cancelled(&session_id) {
        emit_sample(app, "download", 0.0, "running");
        // Hard cap: never request more than MAX_DOWNLOAD_MB.
        let ck = MAX_DOWNLOAD_MB.clamp(1, MAX_DOWNLOAD_MB);
        let dl_url = format!(
            "{}?ckSize={ck}&r={}",
            join_url(&source.base_url, &source.dl_path),
            uuid::Uuid::new_v4()
        );
        let t0 = Instant::now();
        let max_bytes = (MAX_DOWNLOAD_MB * 1024 * 1024) as usize;
        let download = async {
            let response = client
                .get(&dl_url)
                .send()
                .await
                .map_err(|error| format!("error:{error}"))?;
            if !response.status().is_success() {
                return Err(format!("http:{}", response.status()));
            }
            count_stream_capped(response.bytes_stream(), max_bytes)
                .await
                .map_err(|error| format!("error:{error}"))
        };
        match await_or_cancel(&session_id, download).await {
            Some(Ok(bytes)) => {
                let secs = t0.elapsed().as_secs_f64().max(0.001);
                let mbps = (bytes as f64 * 8.0) / (secs * 1_000_000.0);
                download_mbps = Some(mbps);
                emit_sample(app, "download", mbps, "done");
            }
            Some(Err(detail)) => emit_sample(app, "download", 0.0, &detail),
            None => cancelled = true,
        }
    } else {
        cancelled = true;
    }

    // --- upload ---
    if !cancelled && !super::session::is_cancelled(&session_id) {
        emit_sample(app, "upload", 0.0, "running");
        let ul_url = join_url(&source.base_url, &source.ul_path);
        let payload_bytes = (upload_limit_mb(source.max_upload_mb) * 1024 * 1024) as usize;
        let payload = vec![0u8; payload_bytes];
        let t0 = Instant::now();
        let upload = async {
            let response = client
                .post(&ul_url)
                .body(payload)
                .send()
                .await
                .map_err(|error| format!("error:{error}"))?;
            if response.status().is_success() || response.status().as_u16() == 200 {
                Ok(())
            } else {
                Err(format!("http:{}", response.status()))
            }
        };
        match await_or_cancel(&session_id, upload).await {
            Some(Ok(())) => {
                let secs = t0.elapsed().as_secs_f64().max(0.001);
                let mbps = (payload_bytes as f64 * 8.0) / (secs * 1_000_000.0);
                upload_mbps = Some(mbps);
                emit_sample(app, "upload", mbps, "done");
            }
            Some(Err(detail)) => emit_sample(app, "upload", 0.0, &detail),
            None => cancelled = true,
        }
    } else {
        cancelled = cancelled || super::session::is_cancelled(&session_id);
    }

    cancelled = cancelled || super::session::is_cancelled(&session_id);
    super::session::clear_session(&session_id);

    let ok = ping_ms.is_some() || download_mbps.is_some() || upload_mbps.is_some();
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
                "Speed source unreachable or returned no usable samples. Wait before retrying (cooldown)."
                    .into(),
            )
        } else {
            None
        },
        command_hint,
    })
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

#[cfg(test)]
mod tests {
    use super::{await_or_cancel, count_stream_capped, upload_limit_mb};
    use crate::net_probe::session::{cancel_scan, clear_session, new_session_id};
    use futures_util::stream;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test]
    async fn cancellation_drops_an_in_flight_request_future() {
        struct DropSignal(Arc<AtomicBool>);

        impl Drop for DropSignal {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }

        let session_id = new_session_id();
        let dropped = Arc::new(AtomicBool::new(false));
        let request_dropped = Arc::clone(&dropped);
        let request = async move {
            let _signal = DropSignal(request_dropped);
            std::future::pending::<()>().await
        };
        let cancel_id = session_id.clone();
        let cancel_task = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(30)).await;
            cancel_scan(cancel_id);
        });

        let result = tokio::time::timeout(
            Duration::from_secs(1),
            await_or_cancel(&session_id, request),
        )
        .await
        .expect("an in-flight request should stop promptly after cancellation");

        assert!(result.is_none());
        assert!(dropped.load(Ordering::SeqCst));
        cancel_task.await.expect("cancel task should finish");
        clear_session(&session_id);
    }

    #[tokio::test]
    async fn download_byte_count_never_exceeds_the_configured_cap() {
        let chunks = stream::iter([Ok::<_, ()>(vec![1_u8; 4]), Ok(vec![2_u8; 5]), Err(())]);

        let bytes = count_stream_capped(chunks, 6)
            .await
            .expect("in-memory chunks should be counted");

        assert_eq!(bytes, 6);
    }

    #[test]
    fn source_upload_limits_are_bounded_by_the_global_cap() {
        assert_eq!(upload_limit_mb(0), 1);
        assert_eq!(upload_limit_mb(4), 4);
        assert_eq!(upload_limit_mb(32), 8);
    }
}
