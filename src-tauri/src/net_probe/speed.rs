//! LibreSpeed-compatible bandwidth probe (Post-MVP-C).
//! Protocol: ping/empty + download garbage + upload empty (design §11.3).

use super::types::{ScanSessionEvent, SpeedSampleEvent, SpeedSource, SpeedTestResult};
use crate::error::{AppError, AppResult};
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

async fn cancellable<T>(
    cancellation: &mut tokio::sync::watch::Receiver<bool>,
    operation: impl Future<Output = T>,
) -> Option<T> {
    if *cancellation.borrow() {
        return None;
    }

    tokio::select! {
        biased;
        _ = cancellation.changed() => None,
        result = operation => Some(result),
    }
}

pub async fn run_speed_test<R: Runtime>(
    app: Option<&AppHandle<R>>,
    source_id: String,
) -> AppResult<SpeedTestResult> {
    let source = builtin_sources()
        .into_iter()
        .find(|s| s.id == source_id)
        .ok_or_else(|| AppError::invalid_input(format!("Unknown speed source: {source_id}")))?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(MAX_PHASE_SECS))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|e| AppError::new("SPEED_CLIENT", e.to_string()))?;

    let mut session = super::session::new_cancellable_session();
    let session_id = session.id.clone();
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
        let Some(res) = cancellable(&mut session.cancellation, client.get(&ping_url).send()).await
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
            && cancellable(
                &mut session.cancellation,
                tokio::time::sleep(std::time::Duration::from_millis(80)),
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
        match cancellable(&mut session.cancellation, client.get(&dl_url).send()).await {
            None => cancelled = true,
            Some(Ok(resp)) if resp.status().is_success() => {
                match cancellable(&mut session.cancellation, resp.bytes()).await {
                    None => cancelled = true,
                    Some(Ok(bytes)) => {
                        let capped = bytes.len().min(max_bytes);
                        let secs = t0.elapsed().as_secs_f64().max(0.001);
                        let mbps = (capped as f64 * 8.0) / (secs * 1_000_000.0);
                        download_mbps = Some(mbps);
                        emit_sample(app, "download", mbps, "done");
                    }
                    Some(Err(e)) => emit_sample(app, "download", 0.0, &format!("error:{e}")),
                }
            }
            Some(Ok(resp)) => emit_sample(app, "download", 0.0, &format!("http:{}", resp.status())),
            Some(Err(e)) => emit_sample(app, "download", 0.0, &format!("error:{e}")),
        }
    } else {
        cancelled = true;
    }

    // --- upload ---
    if !cancelled && !super::session::is_cancelled(&session_id) {
        emit_sample(app, "upload", 0.0, "running");
        let ul_url = join_url(&source.base_url, &source.ul_path);
        let payload = vec![0u8; (MAX_UPLOAD_MB.clamp(1, MAX_UPLOAD_MB) * 1024 * 1024) as usize];
        let payload_len = payload.len();
        let t0 = Instant::now();
        match cancellable(
            &mut session.cancellation,
            client.post(&ul_url).body(payload).send(),
        )
        .await
        {
            None => cancelled = true,
            Some(Ok(resp)) if resp.status().is_success() || resp.status().as_u16() == 200 => {
                let secs = t0.elapsed().as_secs_f64().max(0.001);
                let mbps = (payload_len as f64 * 8.0) / (secs * 1_000_000.0);
                upload_mbps = Some(mbps);
                emit_sample(app, "upload", mbps, "done");
            }
            Some(Ok(resp)) => emit_sample(app, "upload", 0.0, &format!("http:{}", resp.status())),
            Some(Err(e)) => emit_sample(app, "upload", 0.0, &format!("error:{e}")),
        }
    } else {
        cancelled = cancelled || super::session::is_cancelled(&session_id);
    }

    cancelled = cancelled || super::session::is_cancelled(&session_id);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cancellation_interrupts_a_pending_phase() {
        let mut session = super::super::session::new_cancellable_session();
        let session_id = session.id.clone();
        let cancel_id = session_id.clone();
        let started = tokio::time::Instant::now();

        let (result, ()) = tokio::join!(
            cancellable(
                &mut session.cancellation,
                tokio::time::sleep(std::time::Duration::from_secs(30)),
            ),
            async move {
                tokio::task::yield_now().await;
                super::super::session::cancel_scan(cancel_id);
            }
        );

        assert!(result.is_none());
        assert!(started.elapsed() < std::time::Duration::from_secs(1));
    }
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
