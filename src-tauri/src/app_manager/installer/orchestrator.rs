use super::codesign;
use super::downloader::{self, DownloadOptions, DownloadOutcome};
use super::extractor;
use super::replace::{self, ReplaceError};
use super::running;
use super::verifier::{self, VerifyConfig, VerifyOutcome};
use crate::app_manager::types::{
    InstallFinishedEvent, InstallPhase, InstallProgressEvent, UpdateInfo,
};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Mutex as AsyncMutex, Notify};

/// Max time to wait for the user to confirm a Developer ID change before
/// timing out and treating it as a rejection.
const DEV_ID_CONFIRM_TIMEOUT: Duration = Duration::from_secs(120);
/// Max time to wait for a running app to quit after we send AppleScript quit.
const QUIT_WAIT_TIMEOUT: Duration = Duration::from_secs(10);
/// Throttle progress events so we don't flood the bridge.
const PROGRESS_THROTTLE_MS: u128 = 200;

/// Per-install runtime state. Stored in `AppManagerState.install_state` so the
/// `cancel_app_update` and `confirm_developer_id_change` commands can signal
/// the running orchestrator.
pub struct InstallHandle {
    pub cancel: Arc<Notify>,
    /// `Some(sender)` while the orchestrator is blocked waiting for the user
    /// to approve a Developer ID change. The confirm command takes the sender
    /// out of the slot and `.send()`s the decision.
    pub dev_id_decision: AsyncMutex<Option<oneshot::Sender<bool>>>,
}

impl InstallHandle {
    pub fn new() -> Self {
        Self {
            cancel: Arc::new(Notify::new()),
            dev_id_decision: AsyncMutex::new(None),
        }
    }
}

impl Default for InstallHandle {
    fn default() -> Self {
        Self::new()
    }
}

/// Drive a single in-place update from queued → done (or failed). Never
/// panics; every error path emits an `app-update-install:finished` event.
pub async fn install_update(
    app_handle: AppHandle,
    update: UpdateInfo,
    install_path: String,
    handle: Arc<InstallHandle>,
) {
    let reporter = Reporter {
        app_handle: app_handle.clone(),
        app_id: update.app_id.clone(),
        started: Instant::now(),
    };

    let outcome = run_install(&reporter, &update, Path::new(&install_path), &handle).await;

    let (success, message, error_code, final_phase) = match outcome {
        Ok(()) => (
            true,
            "Update installed".to_string(),
            None,
            InstallPhase::Done,
        ),
        Err(Halt::Failed { code, message }) => (
            false,
            message.clone(),
            Some(code.clone()),
            InstallPhase::Failed { code, message },
        ),
        Err(Halt::RolledBack { reason }) => (
            false,
            format!("Update rolled back: {reason}"),
            Some("SU_REPLACE_ROLLED_BACK".to_string()),
            InstallPhase::RolledBack { reason },
        ),
        Err(Halt::Cancelled) => (
            false,
            "Update cancelled".to_string(),
            Some("SU_CANCELLED".to_string()),
            InstallPhase::Failed {
                code: "SU_CANCELLED".to_string(),
                message: "Cancelled by user".to_string(),
            },
        ),
    };

    reporter.emit(final_phase);
    let _ = app_handle.emit(
        "app-update-install:finished",
        InstallFinishedEvent {
            app_id: update.app_id,
            success,
            message,
            error_code,
        },
    );
}

struct Reporter {
    app_handle: AppHandle,
    app_id: String,
    started: Instant,
}

impl Reporter {
    fn emit(&self, phase: InstallPhase) {
        let _ = self.app_handle.emit(
            "app-update-install:progress",
            InstallProgressEvent {
                app_id: self.app_id.clone(),
                phase,
                elapsed_ms: self.started.elapsed().as_millis() as u64,
            },
        );
    }
}

/// Internal control-flow type. We can't return Result<_, String> because the
/// rollback vs cancel vs generic-failure distinction has to survive into the
/// final event.
enum Halt {
    Failed { code: String, message: String },
    RolledBack { reason: String },
    Cancelled,
}

impl Halt {
    fn failed(code: impl Into<String>, message: impl Into<String>) -> Self {
        Halt::Failed {
            code: code.into(),
            message: message.into(),
        }
    }
}

/// Turn a `SU_XXX: detail` string from one of the helper modules back into a
/// `Halt::Failed { code, message }` so the frontend can dispatch on the code.
fn split_su_error(s: String) -> Halt {
    if let Some(colon) = s.find(':') {
        let (code, rest) = s.split_at(colon);
        if code.starts_with("SU_") {
            return Halt::Failed {
                code: code.to_string(),
                message: rest.trim_start_matches(':').trim().to_string(),
            };
        }
    }
    Halt::Failed {
        code: "SU_INSTALL_FAIL".to_string(),
        message: s,
    }
}

async fn run_install(
    reporter: &Reporter,
    update: &UpdateInfo,
    install_path: &Path,
    handle: &Arc<InstallHandle>,
) -> Result<(), Halt> {
    reporter.emit(InstallPhase::Queued);

    let url = update
        .download_url
        .clone()
        .ok_or_else(|| Halt::failed("SU_NO_DOWNLOAD_URL", "Update has no download URL"))?;
    let ext = downloader::ext_from_url(&url);
    let cache_path = downloader::cache_path(&update.app_id, &update.latest_version, ext);

    let dest = download_with_progress(reporter, update, &url, &cache_path, handle).await?;

    // ---- Verify (hash / signature) ----
    reporter.emit(InstallPhase::Verifying);
    let verify_cfg = build_verify_config(install_path, update);
    match verifier::verify(&dest, &verify_cfg) {
        VerifyOutcome::Verified(_) | VerifyOutcome::Skipped => {}
        VerifyOutcome::Failed(e) => {
            downloader::cleanup(&dest).await;
            return Err(split_su_error(e));
        }
    }

    // ---- Extract ----
    reporter.emit(InstallPhase::Extracting);
    let work_dir = extractor::make_work_dir(&update.app_id).map_err(split_su_error)?;
    let extract_result = if ext == "dmg" {
        extractor::extract_dmg(&dest, &work_dir)
    } else if ext == "zip" {
        extractor::extract_zip(&dest, &work_dir)
    } else {
        Err(format!("SU_EXTRACT_FAIL: unsupported extension '{ext}'"))
    };
    let new_app = match extract_result {
        Ok(p) => p,
        Err(e) => {
            extractor::cleanup_work_dir(&work_dir);
            return Err(split_su_error(e));
        }
    };

    // ---- Codesign verify on the new bundle ----
    if let Err(e) = codesign::verify_signature(&new_app) {
        extractor::cleanup_work_dir(&work_dir);
        return Err(split_su_error(e));
    }

    // ---- Developer ID change check ----
    let old_info = codesign::read_codesign_info(install_path).unwrap_or_default();
    let new_info = codesign::read_codesign_info(&new_app).unwrap_or_default();
    if codesign::team_id_changed(&old_info, &new_info) {
        let approved = await_dev_id_decision(reporter, handle, &old_info, &new_info).await;
        if !approved {
            extractor::cleanup_work_dir(&work_dir);
            return Err(Halt::failed(
                "SU_DEV_ID_DENIED",
                "Developer ID change rejected by user",
            ));
        }
    }

    // ---- Quit running app ----
    if running::is_running(install_path) {
        if let Some(bid) = running::read_bundle_id(install_path) {
            running::request_quit(&bid);
        }
        if !running::wait_for_quit(install_path, QUIT_WAIT_TIMEOUT) {
            extractor::cleanup_work_dir(&work_dir);
            return Err(Halt::failed(
                "SU_APP_RUNNING",
                "App is still running; please quit it and retry",
            ));
        }
    }

    // ---- Replace ----
    reporter.emit(InstallPhase::Replacing);
    let trash = replace::default_trash_dir().map_err(split_su_error)?;
    match replace::replace_bundle(install_path, &new_app, &trash) {
        Ok(_) => {}
        Err(ReplaceError::RolledBack(reason)) => {
            extractor::cleanup_work_dir(&work_dir);
            return Err(Halt::RolledBack { reason });
        }
        Err(e @ ReplaceError::Stranded { .. }) => {
            extractor::cleanup_work_dir(&work_dir);
            return Err(Halt::Failed {
                code: e.code().to_string(),
                message: e.message(),
            });
        }
    }

    // ---- Finalize ----
    reporter.emit(InstallPhase::Finalizing);
    extractor::cleanup_work_dir(&work_dir);
    downloader::cleanup(&dest).await;

    Ok(())
}

async fn download_with_progress(
    reporter: &Reporter,
    update: &UpdateInfo,
    url: &str,
    cache_path: &Path,
    handle: &Arc<InstallHandle>,
) -> Result<std::path::PathBuf, Halt> {
    let client = downloader::default_client();
    let cancel = handle.cancel.clone();
    let app_id = update.app_id.clone();
    let reporter_handle = reporter.app_handle.clone();
    let started = reporter.started;
    let mut last_emit_ms: u128 = 0;
    let outcome = downloader::download(
        &client,
        DownloadOptions {
            url: url.to_string(),
            expected_size: update.size,
            dest_path: cache_path.to_path_buf(),
        },
        cancel,
        move |downloaded, total| {
            let now_ms = started.elapsed().as_millis();
            let finished = matches!(total, Some(t) if downloaded >= t);
            if now_ms.saturating_sub(last_emit_ms) < PROGRESS_THROTTLE_MS && !finished {
                return;
            }
            last_emit_ms = now_ms;
            let percent = match total {
                Some(t) if t > 0 => {
                    ((downloaded as f64 / t as f64) * 100.0).clamp(0.0, 100.0) as u8
                }
                _ => 0,
            };
            let _ = reporter_handle.emit(
                "app-update-install:progress",
                InstallProgressEvent {
                    app_id: app_id.clone(),
                    phase: InstallPhase::Downloading {
                        percent,
                        bytes_total: total,
                    },
                    elapsed_ms: now_ms as u64,
                },
            );
        },
    )
    .await;
    match outcome {
        DownloadOutcome::Ok(p) => Ok(p),
        DownloadOutcome::Cancelled => Err(Halt::Cancelled),
        DownloadOutcome::Error(e) => Err(split_su_error(e)),
    }
}

async fn await_dev_id_decision(
    reporter: &Reporter,
    handle: &Arc<InstallHandle>,
    old: &codesign::CodesignInfo,
    new: &codesign::CodesignInfo,
) -> bool {
    let (tx, rx) = oneshot::channel();
    {
        let mut slot = handle.dev_id_decision.lock().await;
        *slot = Some(tx);
    }
    reporter.emit(InstallPhase::DeveloperIdChanged {
        old: old.team_id.clone().unwrap_or_default(),
        new: new.team_id.clone().unwrap_or_default(),
    });

    let result = tokio::select! {
        biased;
        _ = handle.cancel.notified() => false,
        r = rx => r.unwrap_or(false),
        _ = tokio::time::sleep(DEV_ID_CONFIRM_TIMEOUT) => false,
    };

    // Drop any stale sender so future commands don't try to use it.
    let mut slot = handle.dev_id_decision.lock().await;
    *slot = None;
    result
}

/// Construct a `VerifyConfig` from `source_meta` (populated by Sparkle /
/// Electron sources) plus `SUPublicEDKey` from the installed bundle's
/// Info.plist (the Sparkle public key never travels in the feed).
fn build_verify_config(install_path: &Path, update: &UpdateInfo) -> VerifyConfig {
    let mut cfg = VerifyConfig::default();
    if let Some(meta) = &update.source_meta {
        if let Some(sig) = meta.get("ed25519Signature").and_then(|v| v.as_str()) {
            cfg.ed25519_signature = Some(sig.to_string());
        }
        if let Some(sha) = meta.get("sha512").and_then(|v| v.as_str()) {
            cfg.sha512 = Some(sha.to_string());
        }
    }
    if cfg.ed25519_signature.is_some() {
        if let Some(key) = read_su_public_ed_key(install_path) {
            cfg.ed25519_pubkey = Some(key);
        }
    }
    cfg
}

fn read_su_public_ed_key(install_path: &Path) -> Option<String> {
    let plist_path = install_path.join("Contents/Info.plist");
    let dict = plist::Value::from_file(&plist_path)
        .ok()?
        .into_dictionary()?;
    dict.get("SUPublicEDKey")
        .and_then(|v| v.as_string())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_manager::types::UpdateSource;
    use serde_json::json;

    fn make_update(source_meta: Option<serde_json::Value>) -> UpdateInfo {
        UpdateInfo {
            app_id: "com.example.demo".into(),
            app_name: "Demo".into(),
            source: UpdateSource::Sparkle,
            current_version: "1.0.0".into(),
            latest_version: "1.1.0".into(),
            download_url: Some("https://example.com/demo.dmg".into()),
            adam_id: None,
            release_notes_url: None,
            release_notes_inline: None,
            size: None,
            source_meta,
            feed_url: None,
            ignored: false,
        }
    }

    #[test]
    fn split_su_error_extracts_known_prefix() {
        match split_su_error("SU_DOWNLOAD_FAIL: write Foo".into()) {
            Halt::Failed { code, message } => {
                assert_eq!(code, "SU_DOWNLOAD_FAIL");
                assert_eq!(message, "write Foo");
            }
            _ => panic!("expected Failed"),
        }
    }

    #[test]
    fn split_su_error_falls_back_for_unprefixed_messages() {
        match split_su_error("something happened".into()) {
            Halt::Failed { code, message } => {
                assert_eq!(code, "SU_INSTALL_FAIL");
                assert_eq!(message, "something happened");
            }
            _ => panic!("expected Failed"),
        }
    }

    #[test]
    fn build_verify_config_picks_up_sha512_from_source_meta() {
        let update = make_update(Some(json!({ "sha512": "abc123" })));
        let cfg = build_verify_config(Path::new("/nonexistent"), &update);
        assert_eq!(cfg.sha512.as_deref(), Some("abc123"));
        assert!(cfg.ed25519_signature.is_none());
        assert!(cfg.ed25519_pubkey.is_none());
    }

    #[test]
    fn build_verify_config_picks_up_ed25519_signature_from_source_meta() {
        let update = make_update(Some(json!({ "ed25519Signature": "sigsigsig" })));
        let cfg = build_verify_config(Path::new("/nonexistent"), &update);
        assert_eq!(cfg.ed25519_signature.as_deref(), Some("sigsigsig"));
        // pubkey would only be set if Info.plist existed and had SUPublicEDKey.
        assert!(cfg.ed25519_pubkey.is_none());
    }

    #[test]
    fn build_verify_config_returns_skipped_config_when_no_meta() {
        let update = make_update(None);
        let cfg = build_verify_config(Path::new("/nonexistent"), &update);
        assert!(cfg.ed25519_signature.is_none());
        assert!(cfg.sha512.is_none());
        assert!(cfg.ed25519_pubkey.is_none());
    }

    #[test]
    fn install_handle_starts_with_empty_decision_slot() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let h = InstallHandle::new();
        rt.block_on(async {
            let slot = h.dev_id_decision.lock().await;
            assert!(slot.is_none());
        });
    }

    #[test]
    fn halt_failed_constructor_sets_code_and_message() {
        match Halt::failed("SU_X", "boom") {
            Halt::Failed { code, message } => {
                assert_eq!(code, "SU_X");
                assert_eq!(message, "boom");
            }
            _ => panic!("expected Failed"),
        }
    }
}
