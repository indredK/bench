//! Capability packs (D-017): manifest, install markers, uninstall.
//! Artifact download URLs live only in the backend manifest — never from the renderer.

use super::types::{
    CapabilityPackInfo, CapabilityPackInstallResult, CapabilityPackProgress,
    NetworkProbeCapabilities,
};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub const PACK_PROGRESS_EVENT: &str = "network-probe:pack-progress";

const PACK_IDS: &[&str] = &["adv-scanner", "pcap-diag", "priv-helper"];
const MAX_PACK_BYTES: u64 = 64 * 1024 * 1024;
const STALE_PACK_TEMP_AGE: std::time::Duration = std::time::Duration::from_secs(24 * 60 * 60);

static ACTIVE_PACK_OPERATIONS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn active_pack_operations() -> &'static Mutex<HashSet<String>> {
    ACTIVE_PACK_OPERATIONS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Prevent install/uninstall races for the same pack in this process and across dev/prod.
/// Dev and production share app_data_dir, while each process has its own static mutex.
struct PackOperationGuard {
    pack_id: String,
    process_lock: Option<fs::File>,
}

impl PackOperationGuard {
    fn acquire(pack_id: &str, dir: &Path) -> AppResult<Self> {
        let mut active = active_pack_operations()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !active.insert(pack_id.to_owned()) {
            return Err(pack_busy_error());
        }

        let lock_path = dir.join(format!(".{pack_id}.lock"));
        let process_lock = match OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(lock_path)
            .and_then(|file| {
                file.try_lock()?;
                Ok(file)
            }) {
            Ok(file) => file,
            Err(error) => {
                active.remove(pack_id);
                if error.kind() == std::io::ErrorKind::WouldBlock {
                    return Err(pack_busy_error());
                }
                return Err(AppError::io(format!(
                    "open capability pack operation lock: {error}"
                )));
            }
        };
        Ok(Self {
            pack_id: pack_id.to_owned(),
            process_lock: Some(process_lock),
        })
    }
}

fn pack_busy_error() -> AppError {
    AppError::new(
        "PACK_BUSY",
        "another operation for this capability pack is already in progress",
    )
}

impl Drop for PackOperationGuard {
    fn drop(&mut self) {
        // Dropping the file releases the cross-process OS lock before the local reservation.
        self.process_lock.take();
        active_pack_operations()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&self.pack_id);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackManifestEntry {
    id: String,
    version: String,
    /// Human-facing size hint (bytes); UI only.
    size_bytes: u64,
    /// Backend-only download URL. Empty = artifact not published yet (marker install).
    #[serde(default)]
    download_url: String,
    #[serde(default)]
    sha256: String,
    platforms: Vec<String>,
    description_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstalledPackRecord {
    pack_id: String,
    version: String,
    installed_at_ms: u64,
    /// marker = local install record without sidecar binary yet
    mode: String,
    /// Integrity metadata is absent in older marker records; those remain readable but are not
    /// treated as a healthy sidecar install.
    #[serde(default)]
    size_bytes: u64,
    #[serde(default)]
    sha256: String,
}

fn canonical_manifest() -> Vec<PackManifestEntry> {
    vec![
        PackManifestEntry {
            id: "adv-scanner".into(),
            version: "0.1.0".into(),
            size_bytes: 8_000_000,
            download_url: String::new(),
            sha256: String::new(),
            platforms: vec!["macos".into(), "windows".into()],
            description_key: "networkProbe.packs.desc.advScanner".into(),
        },
        PackManifestEntry {
            id: "pcap-diag".into(),
            version: "0.1.0".into(),
            size_bytes: 4_000_000,
            // Deliberate S-X-05 verify-fail channel when artifactReady path is exercised via
            // network_probe_install_capability_pack_verify_fail — keep normal install as marker.
            download_url: String::new(),
            sha256: String::new(),
            platforms: vec!["macos".into(), "windows".into()],
            description_key: "networkProbe.packs.desc.pcapDiag".into(),
        },
        PackManifestEntry {
            id: "priv-helper".into(),
            version: "0.1.0".into(),
            size_bytes: 2_000_000,
            download_url: String::new(),
            sha256: String::new(),
            platforms: vec!["macos".into()],
            description_key: "networkProbe.packs.desc.privHelper".into(),
        },
    ]
}

fn packs_dir(app: &AppHandle<impl Runtime>) -> AppResult<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::io(format!("app_data_dir: {e}")))?;
    let dir = base.join("network-probe").join("packs");
    fs::create_dir_all(&dir).map_err(|e| AppError::io(format!("create packs dir: {e}")))?;
    Ok(dir)
}

fn record_path(dir: &Path, pack_id: &str) -> PathBuf {
    dir.join(format!("{pack_id}.json"))
}

fn validate_pack_id(pack_id: &str) -> AppResult<()> {
    if PACK_IDS.contains(&pack_id) {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "Unknown packId: {pack_id}"
        )))
    }
}

fn validate_operation_id(operation_id: &str) -> AppResult<String> {
    uuid::Uuid::parse_str(operation_id)
        .map(|id| id.to_string())
        .map_err(|_| AppError::invalid_input("operationId must be a UUID"))
}

fn artifact_path(dir: &Path, pack_id: &str, version: &str) -> Option<PathBuf> {
    if !PACK_IDS.contains(&pack_id) || !crate::extension_host::manifest::is_valid_semver(version) {
        return None;
    }
    Some(dir.join(format!("{pack_id}-{version}.bin")))
}

fn is_valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn validate_artifact_metadata(size_bytes: u64, sha256: &str) -> AppResult<()> {
    if size_bytes == 0 || size_bytes > MAX_PACK_BYTES {
        return Err(AppError::new(
            "PACK_SIZE_INVALID",
            format!("Pack size must be between 1 and {MAX_PACK_BYTES} bytes."),
        ));
    }
    if !is_valid_sha256(sha256) {
        return Err(AppError::new(
            "PACK_HASH_INVALID",
            "Pack manifest SHA-256 must contain exactly 64 hexadecimal characters.",
        ));
    }
    Ok(())
}

fn verify_artifact(path: &Path, expected_size: u64, expected_sha256: &str) -> bool {
    if expected_size == 0 || expected_size > MAX_PACK_BYTES || !is_valid_sha256(expected_sha256) {
        return false;
    }
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() || metadata.len() != expected_size {
        return false;
    }
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let mut hasher = sha2::Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let read = match file.read(&mut buffer) {
            Ok(read) => read,
            Err(_) => return false,
        };
        if read == 0 {
            break;
        }
        total += read as u64;
        if total > expected_size || total > MAX_PACK_BYTES {
            return false;
        }
        hasher.update(&buffer[..read]);
    }
    let digest = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    total == expected_size && digest.eq_ignore_ascii_case(expected_sha256)
}

fn sidecar_record_is_healthy(dir: &Path, pack_id: &str, record: &InstalledPackRecord) -> bool {
    if record.pack_id != pack_id || record.mode != "sidecar" {
        return false;
    }
    let Some(path) = artifact_path(dir, pack_id, &record.version) else {
        return false;
    };
    verify_artifact(&path, record.size_bytes, &record.sha256)
}

fn sidecar_record_matches_manifest(
    dir: &Path,
    entry: &PackManifestEntry,
    record: &InstalledPackRecord,
) -> bool {
    sidecar_record_is_healthy(dir, &entry.id, record)
        && record.version == entry.version
        && record.size_bytes == entry.size_bytes
        && record.sha256.eq_ignore_ascii_case(entry.sha256.trim())
}

/// Remove only files owned by this pack and matching the current artifact naming scheme.
fn cleanup_pack_artifacts(dir: &Path, pack_id: &str, keep: Option<&Path>) -> AppResult<()> {
    validate_pack_id(pack_id)?;
    let mut candidates = vec![dir.join(format!("{pack_id}.bin"))];
    let prefix = format!("{pack_id}-");
    for item in fs::read_dir(dir).map_err(|e| AppError::io(format!("read packs dir: {e}")))? {
        let item = item.map_err(|e| AppError::io(format!("read pack entry: {e}")))?;
        let name = item.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        let Some(version) = name
            .strip_prefix(&prefix)
            .and_then(|v| v.strip_suffix(".bin"))
        else {
            continue;
        };
        if crate::extension_host::manifest::is_valid_semver(version) {
            candidates.push(item.path());
        }
    }
    for path in candidates {
        if keep.is_some_and(|keep| keep == path) {
            continue;
        }
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_file() || metadata.file_type().is_symlink() => {
                fs::remove_file(path)
                    .map_err(|e| AppError::io(format!("remove stale pack artifact: {e}")))?;
            }
            Ok(_) => continue,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(AppError::io(format!(
                    "inspect stale pack artifact: {error}"
                )));
            }
        }
    }
    Ok(())
}

fn is_managed_pack_temp_name(name: &str, pack_id: &str) -> bool {
    let download_prefix = format!(".pack-{pack_id}-");
    let record_prefix = format!(".{pack_id}.");
    let uuid = name
        .strip_prefix(&download_prefix)
        .or_else(|| name.strip_prefix(&record_prefix))
        .and_then(|name| name.strip_suffix(".tmp"));
    uuid.is_some_and(|value| uuid::Uuid::parse_str(value).is_ok())
}

/// Recover only stale temporary files owned by this pack; fresh temps may belong to another run.
fn cleanup_stale_pack_temps(dir: &Path, pack_id: &str) -> AppResult<usize> {
    validate_pack_id(pack_id)?;
    let now = SystemTime::now();
    let mut removed = 0;
    for item in fs::read_dir(dir).map_err(|e| AppError::io(format!("read packs dir: {e}")))? {
        let item = item.map_err(|e| AppError::io(format!("read pack entry: {e}")))?;
        let name = item.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if !is_managed_pack_temp_name(name, pack_id) {
            continue;
        }
        let path = item.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_file() => metadata,
            Ok(_) => continue,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(AppError::io(format!("inspect stale pack temp: {error}"))),
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        if now.duration_since(modified).unwrap_or_default() < STALE_PACK_TEMP_AGE {
            continue;
        }
        fs::remove_file(path).map_err(|e| AppError::io(format!("remove stale pack temp: {e}")))?;
        removed += 1;
    }
    Ok(removed)
}

struct TempFileGuard(PathBuf);

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn write_installed_record(dir: &Path, record: &InstalledPackRecord) -> AppResult<()> {
    let target = record_path(dir, &record.pack_id);
    let temp = dir.join(format!(".{}.{}.tmp", record.pack_id, uuid::Uuid::new_v4()));
    let _cleanup = TempFileGuard(temp.clone());
    let json = serde_json::to_vec_pretty(record)
        .map_err(|e| AppError::io(format!("serialize pack record: {e}")))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|e| AppError::io(format!("create temporary pack record: {e}")))?;
    file.write_all(&json)
        .and_then(|()| file.sync_all())
        .map_err(|e| AppError::io(format!("write temporary pack record: {e}")))?;
    drop(file);
    // Windows cannot rename over an existing file. If the next rename fails, the verified
    // artifact remains intact and a later install can recreate this small metadata record.
    if target.exists() {
        fs::remove_file(&target).map_err(|e| AppError::io(format!("replace pack record: {e}")))?;
    }
    fs::rename(&temp, &target).map_err(|e| AppError::io(format!("install pack record: {e}")))?;
    Ok(())
}

fn read_installed(dir: &Path, pack_id: &str) -> Option<InstalledPackRecord> {
    let path = record_path(dir, pack_id);
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn platform_id() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "unsupported"
    }
}

pub fn nmap_binary() -> Option<PathBuf> {
    let is_windows = std::env::consts::OS == "windows";
    let executable = if is_windows { "nmap.exe" } else { "nmap" };
    let mut candidates = Vec::new();

    match std::env::consts::OS {
        "macos" => candidates.extend([
            PathBuf::from("/opt/homebrew/bin/nmap"),
            PathBuf::from("/usr/local/bin/nmap"),
            PathBuf::from("/opt/local/bin/nmap"),
        ]),
        "windows" => candidates.extend([
            PathBuf::from(r"C:\Program Files\Nmap\nmap.exe"),
            PathBuf::from(r"C:\Program Files (x86)\Nmap\nmap.exe"),
        ]),
        _ => {}
    }

    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path).map(|dir| dir.join(executable)));
    }

    candidates.into_iter().find(|path| {
        path.is_file()
            && Command::new(path)
                .arg("-V")
                .output()
                .is_ok_and(|output| output.status.success())
    })
}

fn nmap_status() -> String {
    if nmap_binary().is_some() {
        "found".into()
    } else {
        "not_found".into()
    }
}

fn fingerprint_status(nmap_found: bool) -> &'static str {
    if nmap_found {
        "supported"
    } else {
        "unsupported"
    }
}

fn port_scan_status(nmap_found: bool) -> &'static str {
    if nmap_found {
        "supported"
    } else {
        "degraded"
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn list_capability_packs(app: &AppHandle<impl Runtime>) -> AppResult<Vec<CapabilityPackInfo>> {
    let dir = packs_dir(app)?;
    let platform = platform_id();
    let mut out = Vec::new();
    for entry in canonical_manifest() {
        if !entry.platforms.iter().any(|p| p == platform) {
            continue;
        }
        let installed = read_installed(&dir, &entry.id);
        let artifact_ready = !entry.download_url.is_empty() && !entry.sha256.is_empty();
        let healthy_sidecar = installed.as_ref().is_some_and(|record| {
            sidecar_record_is_healthy(&dir, &entry.id, record)
                && (!artifact_ready || sidecar_record_matches_manifest(&dir, &entry, record))
        });
        let marker_installed = installed
            .as_ref()
            .is_some_and(|record| record.pack_id == entry.id && record.mode == "marker");
        let status = if healthy_sidecar || (marker_installed && !artifact_ready) {
            "installed"
        } else {
            "available"
        };
        out.push(CapabilityPackInfo {
            id: entry.id,
            version: entry.version,
            size_bytes: entry.size_bytes,
            status: status.into(),
            description_key: entry.description_key,
            artifact_ready,
            installed_at_ms: if status == "installed" {
                installed.as_ref().map(|r| r.installed_at_ms)
            } else {
                None
            },
            install_mode: if status == "installed" {
                installed.as_ref().map(|r| r.mode.clone())
            } else {
                None
            },
        });
    }
    Ok(out)
}

pub async fn install_capability_pack<R: Runtime>(
    app: &AppHandle<R>,
    pack_id: String,
    operation_id: String,
) -> AppResult<CapabilityPackInstallResult> {
    let pack_id = pack_id.trim().to_string();
    let operation_id = validate_operation_id(&operation_id)?;
    validate_pack_id(&pack_id)?;
    let dir = packs_dir(app)?;
    let _operation = PackOperationGuard::acquire(&pack_id, &dir)?;
    if let Err(error) = cleanup_stale_pack_temps(&dir, &pack_id) {
        eprintln!("[network-probe] stale capability pack temp cleanup failed: {error}");
    }
    let entry = canonical_manifest()
        .into_iter()
        .find(|e| e.id == pack_id)
        .ok_or_else(|| AppError::invalid_input(format!("Unknown packId: {pack_id}")))?;
    let platform = platform_id();
    if !entry.platforms.iter().any(|p| p == platform) {
        return Err(AppError::invalid_input(format!(
            "Pack {pack_id} unavailable on {platform}"
        )));
    }

    let artifact_ready = !entry.download_url.is_empty() && !entry.sha256.is_empty();
    if let Some(installed) = read_installed(&dir, &pack_id) {
        let health_dir = dir.clone();
        let health_entry = entry.clone();
        let health_record = installed.clone();
        let health_pack_id = pack_id.clone();
        let healthy_sidecar = tauri::async_runtime::spawn_blocking(move || {
            sidecar_record_is_healthy(&health_dir, &health_pack_id, &health_record)
                && (!artifact_ready
                    || sidecar_record_matches_manifest(&health_dir, &health_entry, &health_record))
        })
        .await
        .map_err(|e| AppError::task_failed(format!("check capability pack health: {e}")))?;
        let current_marker = installed.pack_id == pack_id && installed.mode == "marker";
        if healthy_sidecar || (current_marker && !artifact_ready) {
            return Ok(CapabilityPackInstallResult {
                pack_id: pack_id.clone(),
                ok: true,
                mode: if current_marker {
                    "marker".into()
                } else {
                    "already-installed".into()
                },
                message: if current_marker {
                    "Pack is recorded locally; sidecar artifact is not published yet.".into()
                } else {
                    "Pack already installed.".into()
                },
                command_hint: format!("installCapabilityPack('{pack_id}') // already-installed"),
            });
        }
    }

    emit_progress(
        app,
        &operation_id,
        &pack_id,
        "validating",
        0,
        entry.size_bytes,
    );

    // Sidecar download path (when URL+hash published). Until then: marker install only.
    // S-X-05: test://hash-mismatch is a deliberate verify-fail channel (no binary executed).
    let mode = if entry.download_url.starts_with("test://hash-mismatch") {
        emit_progress(app, &operation_id, &pack_id, "verifying", 0, 0);
        return Ok(CapabilityPackInstallResult {
            pack_id: pack_id.clone(),
            ok: false,
            mode: "hash-mismatch".into(),
            message: "SHA-256 verification failed (test channel). Pack not installed; binary not executed."
                .into(),
            command_hint: format!("installCapabilityPack('{pack_id}') // hash-mismatch"),
        });
    } else if entry.download_url.is_empty() || entry.sha256.is_empty() {
        // marker 安装不下载任何字节：拿 size_bytes 的一半当进度分子是伪造进度
        // （ux-standards §2 禁止）。这里只报阶段，不报字节数。
        emit_progress(app, &operation_id, &pack_id, "marker", 0, 0);
        "marker"
    } else {
        match download_and_verify(app, &entry, &operation_id).await {
            Ok(()) => "sidecar",
            Err(e) => {
                emit_progress(app, &operation_id, &pack_id, "failed", 0, entry.size_bytes);
                return Ok(CapabilityPackInstallResult {
                    pack_id: pack_id.clone(),
                    ok: false,
                    mode: "failed".into(),
                    message: e.to_string(),
                    command_hint: format!("installCapabilityPack('{pack_id}') // failed"),
                });
            }
        }
    };

    let record = InstalledPackRecord {
        pack_id: pack_id.clone(),
        version: entry.version.clone(),
        installed_at_ms: now_ms(),
        mode: mode.into(),
        size_bytes: if mode == "sidecar" {
            entry.size_bytes
        } else {
            0
        },
        sha256: if mode == "sidecar" {
            entry.sha256.trim().to_ascii_lowercase()
        } else {
            String::new()
        },
    };
    let record_dir = dir.clone();
    let cleanup_id = pack_id.clone();
    let cleanup_version = entry.version.clone();
    let is_sidecar = mode == "sidecar";
    tauri::async_runtime::spawn_blocking(move || {
        write_installed_record(&record_dir, &record)?;
        if is_sidecar {
            if let Some(path) = artifact_path(&record_dir, &cleanup_id, &cleanup_version) {
                if let Err(error) = cleanup_pack_artifacts(&record_dir, &cleanup_id, Some(&path)) {
                    eprintln!("[network-probe] stale capability pack cleanup failed: {error}");
                }
            }
        }
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::task_failed(format!("save capability pack record: {e}")))??;
    if mode == "sidecar" {
        emit_progress(
            app,
            &operation_id,
            &pack_id,
            "done",
            entry.size_bytes,
            entry.size_bytes,
        );
    } else {
        emit_progress(app, &operation_id, &pack_id, "done", 0, 0);
    }

    Ok(CapabilityPackInstallResult {
        pack_id: pack_id.clone(),
        ok: true,
        mode: mode.into(),
        message: if mode == "marker" {
            "Installed as local marker (sidecar artifact not published yet). Tools stay degraded until binary lands.".into()
        } else {
            "Pack installed.".into()
        },
        command_hint: format!("installCapabilityPack('{pack_id}') // mode={mode}"),
    })
}

pub async fn uninstall_capability_pack<R: Runtime>(
    app: &AppHandle<R>,
    pack_id: String,
) -> AppResult<()> {
    let pack_id = pack_id.trim().to_string();
    validate_pack_id(&pack_id)?;
    let dir = packs_dir(app)?;
    let _operation = PackOperationGuard::acquire(&pack_id, &dir)?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = cleanup_stale_pack_temps(&dir, &pack_id) {
            eprintln!("[network-probe] stale capability pack temp cleanup failed: {error}");
        }
        let path = record_path(&dir, &pack_id);
        cleanup_pack_artifacts(&dir, &pack_id, None)?;
        if path.exists() {
            fs::remove_file(&path).map_err(|e| AppError::io(format!("uninstall pack: {e}")))?;
        }
        // Idempotent: missing file is success.
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::task_failed(format!("uninstall capability pack: {e}")))?
}

/// 能力位判定：**只有真正带回二进制的 sidecar 安装**才算可用。
/// marker 记录只代表「装过一条本地安装记录」，把它算成 supported 会让前端
/// 在什么都没解锁的情况下全绿（SYN 扫描/富 pcap 依旧降级）。
pub fn is_pack_installed(app: &AppHandle<impl Runtime>, pack_id: &str) -> bool {
    let Ok(dir) = packs_dir(app) else {
        return false;
    };
    read_installed(&dir, pack_id)
        .is_some_and(|record| sidecar_record_is_healthy(&dir, pack_id, &record))
}

pub fn build_capabilities(app: Option<&AppHandle<impl Runtime>>) -> NetworkProbeCapabilities {
    let platform = platform_id().to_string();
    let mut tools = HashMap::new();
    let s = |v: &str| v.to_string();

    tools.insert("summary".into(), s("supported"));
    tools.insert("defaultRoute".into(), s("supported"));
    tools.insert("tcpConnect".into(), s("supported"));
    tools.insert("hosts".into(), s("supported"));
    tools.insert(
        "firewall".into(),
        if cfg!(target_os = "macos") {
            s("supported")
        } else {
            s("unsupported")
        },
    );
    tools.insert("openNetworkSettings".into(), s("supported"));
    tools.insert("defaults".into(), s("supported"));
    tools.insert("ping".into(), s("supported"));
    tools.insert("dnsLookup".into(), s("supported"));
    tools.insert("probeTarget".into(), s("supported"));
    tools.insert("sitesProbe".into(), s("supported"));
    tools.insert("healthScan".into(), s("supported"));
    tools.insert("flushDns".into(), s("supported"));
    tools.insert("switchDns".into(), s("supported"));
    tools.insert("renewDhcp".into(), s("supported"));
    tools.insert("detectCaptive".into(), s("supported"));
    tools.insert("publicIp".into(), s("supported"));
    tools.insert("proxyVpn".into(), s("supported"));
    tools.insert(
        "traceroute".into(),
        if cfg!(target_os = "macos") || cfg!(target_os = "windows") {
            s("supported")
        } else {
            s("unsupported")
        },
    );
    tools.insert(
        "resetNetworkStack".into(),
        if cfg!(target_os = "macos") {
            s("supported")
        } else {
            s("unsupported")
        },
    );
    tools.insert(
        "checkIpv6".into(),
        if cfg!(target_os = "macos") {
            s("supported")
        } else {
            s("partial")
        },
    );
    tools.insert(
        "pathMtu".into(),
        if cfg!(target_os = "macos") {
            s("supported")
        } else {
            s("unsupported")
        },
    );

    // Post tools — matrix-driven (never hardcode all-green in UI).
    tools.insert("speedTest".into(), s("supported")); // Wave 2
    tools.insert("globalping".into(), s("supported")); // Wave 2 DNS / ping / HTTP remote measurements
    tools.insert("whois".into(), s("supported")); // Wave 3
    tools.insert("dnssec".into(), s("partial")); // Wave 3 — DoH AD-bit
    tools.insert("pollution".into(), s("supported")); // Wave 3
    tools.insert("nat".into(), s("supported")); // Wave 4
    tools.insert("ntp".into(), s("supported")); // Wave 4
    tools.insert("mdns".into(), s("supported")); // Wave 4 lan-svc
    tools.insert("lanServices".into(), s("supported"));
    tools.insert("multiNode".into(), s("partial")); // Globalping + agent registry
    tools.insert("agent".into(), s("partial"));

    let pcap_installed = app
        .map(|a| is_pack_installed(a, "pcap-diag"))
        .unwrap_or(false);
    let nmap = nmap_status();

    // This command currently invokes Nmap or the built-in TCP-connect fallback.
    // Do not count adv-scanner as usable until its sidecar is integrated here.
    tools.insert("portScan".into(), s(port_scan_status(nmap == "found")));
    // ARP: cache read always; privileged sweep needs pack.
    tools.insert("arp".into(), s("degraded"));
    // Pcap: tcpdump counters always attempted; pack unlocks richer mode later.
    tools.insert(
        "pcap".into(),
        if pcap_installed {
            s("supported")
        } else {
            s("degraded")
        },
    );
    tools.insert("fingerprint".into(), s(fingerprint_status(nmap == "found")));

    let mut packs = HashMap::new();
    if let Some(app) = app {
        if let Ok(list) = list_capability_packs(app) {
            for p in list {
                packs.insert(p.id, p.status);
            }
        }
    } else {
        for id in PACK_IDS {
            packs.insert((*id).into(), "available".into());
        }
    }

    let mut external_tools = HashMap::new();
    external_tools.insert("nmap".into(), nmap);

    NetworkProbeCapabilities {
        platform,
        privilege_level: "none".into(),
        tools,
        packs,
        external_tools,
    }
}

fn emit_progress<R: Runtime>(
    app: &AppHandle<R>,
    operation_id: &str,
    pack_id: &str,
    phase: &str,
    bytes: u64,
    total: u64,
) {
    let _ = app.emit(
        PACK_PROGRESS_EVENT,
        &CapabilityPackProgress {
            operation_id: operation_id.into(),
            pack_id: pack_id.into(),
            phase: phase.into(),
            bytes,
            total_bytes: total,
        },
    );
}

/// Download sidecar + SHA-256 verify (D-017). Never trusts frontend URLs.
async fn download_and_verify<R: Runtime>(
    app: &AppHandle<R>,
    entry: &PackManifestEntry,
    operation_id: &str,
) -> AppResult<()> {
    use sha2::Sha256;

    validate_artifact_metadata(entry.size_bytes, &entry.sha256)?;
    crate::extension_host::registry::validate_download_url(&entry.download_url).map_err(|_| {
        AppError::new(
            "PACK_URL_INSECURE",
            "Pack download URL must be a public HTTPS URL without credentials or fragments.",
        )
    })?;
    if !crate::extension_host::manifest::is_valid_semver(&entry.version) {
        return Err(AppError::new(
            "PACK_VERSION_INVALID",
            "Pack version is invalid.",
        ));
    }
    let dir = packs_dir(app)?;
    let bin_path = artifact_path(&dir, &entry.id, &entry.version)
        .ok_or_else(|| AppError::invalid_input("Pack artifact path is invalid."))?;
    let existing_path = bin_path.clone();
    let expected_hash = entry.sha256.clone();
    let expected_size = entry.size_bytes;
    let existing_is_valid = tauri::async_runtime::spawn_blocking(move || {
        verify_artifact(&existing_path, expected_size, &expected_hash)
    })
    .await
    .map_err(|e| AppError::internal(format!("verify existing pack artifact: {e}")))?;
    if existing_is_valid {
        return Ok(());
    }

    emit_progress(
        app,
        operation_id,
        &entry.id,
        "downloading",
        0,
        entry.size_bytes,
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .user_agent("Bench-NetworkProbe/1.0")
        .referer(false)
        .redirect(crate::extension_host::registry::public_https_redirect_policy())
        .build()
        .map_err(|e| AppError::new("PACK_CLIENT", e.without_url().to_string()))?;
    let response = client
        .get(&entry.download_url)
        .send()
        .await
        .map_err(|e| {
            AppError::new(
                "PACK_DOWNLOAD",
                format!("Download failed: {}", e.without_url()),
            )
        })?
        .error_for_status()
        .map_err(|e| {
            AppError::new(
                "PACK_DOWNLOAD",
                format!("Download HTTP error: {}", e.without_url()),
            )
        })?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_PACK_BYTES)
    {
        return Err(AppError::new(
            "PACK_SIZE_LIMIT",
            format!("Pack download exceeds the {MAX_PACK_BYTES}-byte limit."),
        ));
    }

    let temp_path = dir.join(format!(".pack-{}-{}.tmp", entry.id, uuid::Uuid::new_v4()));
    let _cleanup = TempFileGuard(temp_path.clone());
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .await
        .map_err(|e| AppError::io(format!("create temporary pack artifact: {e}")))?;
    let mut response = response;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    while let Some(chunk) = response.chunk().await.map_err(|e| {
        AppError::new(
            "PACK_DOWNLOAD",
            format!("Read body failed: {}", e.without_url()),
        )
    })? {
        received = next_download_size(received, chunk.len(), entry.size_bytes)?;
        hasher.update(&chunk);
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| AppError::io(format!("write temporary pack artifact: {e}")))?;
        emit_progress(
            app,
            operation_id,
            &entry.id,
            "downloading",
            received,
            entry.size_bytes,
        );
    }
    if received != entry.size_bytes {
        return Err(AppError::new(
            "PACK_SIZE_MISMATCH",
            format!(
                "Pack size mismatch: received {received} bytes, expected {}.",
                entry.size_bytes
            ),
        ));
    }
    emit_progress(
        app,
        operation_id,
        &entry.id,
        "verifying",
        received,
        entry.size_bytes,
    );
    let digest = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let expected = entry.sha256.trim().to_ascii_lowercase();
    if !digest.eq_ignore_ascii_case(&expected) {
        return Err(AppError::new(
            "PACK_HASH_MISMATCH",
            format!("SHA-256 mismatch: got {digest}, expected {expected}. Binary not installed."),
        ));
    }
    tokio::io::AsyncWriteExt::flush(&mut file)
        .await
        .map_err(|e| AppError::io(format!("flush temporary pack artifact: {e}")))?;
    file.sync_all()
        .await
        .map_err(|e| AppError::io(format!("sync temporary pack artifact: {e}")))?;
    drop(file);
    if bin_path.exists() {
        tokio::fs::remove_file(&bin_path)
            .await
            .map_err(|e| AppError::io(format!("replace invalid pack artifact: {e}")))?;
    }
    tokio::fs::rename(&temp_path, &bin_path)
        .await
        .map_err(|e| AppError::io(format!("install verified pack artifact: {e}")))?;
    Ok(())
}

fn next_download_size(received: u64, chunk_size: usize, expected_size: u64) -> AppResult<u64> {
    let next = received
        .checked_add(chunk_size as u64)
        .ok_or_else(|| AppError::new("PACK_SIZE_LIMIT", "Pack download size overflowed."))?;
    if next > MAX_PACK_BYTES || next > expected_size {
        return Err(AppError::new(
            "PACK_SIZE_LIMIT",
            format!("Pack download exceeds its declared size or the {MAX_PACK_BYTES}-byte limit."),
        ));
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDirGuard(PathBuf);

    impl Drop for TempDirGuard {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn test_dir() -> TempDirGuard {
        let path = std::env::temp_dir().join(format!("bench-pack-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).expect("create temporary test directory");
        TempDirGuard(path)
    }

    fn sha256(bytes: &[u8]) -> String {
        sha2::Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }

    #[test]
    fn fingerprint_capability_matches_external_nmap_availability() {
        assert_eq!(fingerprint_status(true), "supported");
        assert_eq!(fingerprint_status(false), "unsupported");
    }

    #[test]
    fn port_scan_capability_matches_the_tool_the_command_actually_invokes() {
        assert_eq!(port_scan_status(true), "supported");
        assert_eq!(port_scan_status(false), "degraded");
    }

    #[test]
    fn pack_ids_and_artifact_versions_cannot_escape_managed_directory() {
        assert!(validate_pack_id("adv-scanner").is_ok());
        assert!(validate_pack_id("../../outside").is_err());
        assert!(artifact_path(Path::new("/safe/packs"), "adv-scanner", "1.2.3").is_some());
        assert!(artifact_path(Path::new("/safe/packs"), "adv-scanner", "../../outside").is_none());
        assert!(artifact_path(Path::new("/safe/packs"), "../../outside", "1.2.3").is_none());
    }

    #[test]
    fn download_metadata_and_chunks_are_bounded_and_exact() {
        let digest = "a".repeat(64);
        assert!(validate_artifact_metadata(1, &digest).is_ok());
        assert!(validate_artifact_metadata(0, &digest).is_err());
        assert!(validate_artifact_metadata(MAX_PACK_BYTES + 1, &digest).is_err());
        assert!(validate_artifact_metadata(1, "not-a-hash").is_err());

        assert_eq!(next_download_size(2, 3, 5).unwrap(), 5);
        assert!(next_download_size(2, 4, 5).is_err());
        assert!(next_download_size(MAX_PACK_BYTES, 1, MAX_PACK_BYTES + 1).is_err());
    }

    #[test]
    fn sidecar_is_installed_only_when_file_size_and_hash_match_record() {
        let dir = test_dir();
        let content = b"verified sidecar";
        let version = "1.2.3";
        let path = artifact_path(&dir.0, "adv-scanner", version).expect("safe artifact path");
        fs::write(&path, content).expect("write test artifact");
        let record = InstalledPackRecord {
            pack_id: "adv-scanner".into(),
            version: version.into(),
            installed_at_ms: 1,
            mode: "sidecar".into(),
            size_bytes: content.len() as u64,
            sha256: sha256(content),
        };

        assert!(sidecar_record_is_healthy(&dir.0, "adv-scanner", &record));
        assert!(!sidecar_record_is_healthy(&dir.0, "pcap-diag", &record));
        assert!(!sidecar_record_is_healthy(
            &dir.0,
            "adv-scanner",
            &InstalledPackRecord {
                size_bytes: content.len() as u64 + 1,
                ..record.clone()
            }
        ));

        fs::write(&path, b"corrupt").expect("corrupt test artifact");
        assert!(!sidecar_record_is_healthy(&dir.0, "adv-scanner", &record));
    }

    #[test]
    fn pack_download_urls_use_the_public_https_policy() {
        assert!(crate::extension_host::registry::validate_download_url(
            "https://cdn.example.com/packs/adv-scanner.bin"
        )
        .is_ok());
        assert!(crate::extension_host::registry::validate_download_url(
            "https://user:secret@cdn.example.com/pack.bin"
        )
        .is_err());
        assert!(crate::extension_host::registry::validate_download_url(
            "https://127.0.0.1/pack.bin"
        )
        .is_err());
        assert!(crate::extension_host::registry::validate_download_url(
            "http://cdn.example.com/pack.bin"
        )
        .is_err());
    }

    #[test]
    fn pack_operation_lock_rejects_an_existing_os_file_lock() {
        let dir = test_dir();
        let lock_path = dir.0.join(".adv-scanner.lock");
        let other_process_lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(lock_path)
            .expect("open shared operation lock");
        other_process_lock
            .try_lock()
            .expect("acquire simulated other-process lock");

        assert!(PackOperationGuard::acquire("adv-scanner", &dir.0).is_err());
        drop(other_process_lock);

        let operation = PackOperationGuard::acquire("adv-scanner", &dir.0)
            .expect("acquire released shared operation lock");
        drop(operation);
    }

    #[test]
    fn stale_pack_temp_cleanup_preserves_fresh_and_unowned_files() {
        let dir = test_dir();
        let stale_download = dir
            .0
            .join(format!(".pack-adv-scanner-{}.tmp", uuid::Uuid::new_v4()));
        let stale_record = dir
            .0
            .join(format!(".adv-scanner.{}.tmp", uuid::Uuid::new_v4()));
        let fresh_temp = dir
            .0
            .join(format!(".pack-adv-scanner-{}.tmp", uuid::Uuid::new_v4()));
        let other_pack_temp = dir
            .0
            .join(format!(".pack-pcap-diag-{}.tmp", uuid::Uuid::new_v4()));
        for path in [
            &stale_download,
            &stale_record,
            &fresh_temp,
            &other_pack_temp,
        ] {
            fs::write(path, b"temp").expect("write temp file");
        }
        let old_time = SystemTime::now() - STALE_PACK_TEMP_AGE - std::time::Duration::from_secs(1);
        fs::OpenOptions::new()
            .write(true)
            .open(&stale_download)
            .expect("open stale download temp for timestamp update")
            .set_modified(old_time)
            .expect("age stale download temp");
        fs::OpenOptions::new()
            .write(true)
            .open(&stale_record)
            .expect("open stale record temp for timestamp update")
            .set_modified(old_time)
            .expect("age stale record temp");

        assert_eq!(cleanup_stale_pack_temps(&dir.0, "adv-scanner").unwrap(), 2);
        assert!(!stale_download.exists());
        assert!(!stale_record.exists());
        assert!(fresh_temp.exists());
        assert!(other_pack_temp.exists());
    }
}

/// S-X-05 test channel: force hash-mismatch without installing.
pub async fn install_capability_pack_verify_fail<R: Runtime>(
    app: &AppHandle<R>,
    pack_id: String,
    operation_id: String,
) -> AppResult<CapabilityPackInstallResult> {
    let pack_id = pack_id.trim().to_string();
    let operation_id = validate_operation_id(&operation_id)?;
    validate_pack_id(&pack_id)?;
    emit_progress(app, &operation_id, &pack_id, "verifying", 0, 0);
    Ok(CapabilityPackInstallResult {
        pack_id: pack_id.clone(),
        ok: false,
        mode: "hash-mismatch".into(),
        message:
            "SHA-256 verification failed (test channel). Pack not installed; binary not executed."
                .into(),
        command_hint: format!("installCapabilityPack('{pack_id}') // hash-mismatch test"),
    })
}
