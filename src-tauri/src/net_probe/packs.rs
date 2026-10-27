//! Capability packs (D-017): manifest, install markers, uninstall.
//! Artifact download URLs live only in the backend manifest — never from the renderer.

use super::types::{
    CapabilityPackInfo, CapabilityPackInstallResult, CapabilityPackProgress,
    NetworkProbeCapabilities,
};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::process::Command as TokioCommand;
use tokio::time::timeout;

pub const PACK_PROGRESS_EVENT: &str = "network-probe:pack-progress";

const PACK_IDS: &[&str] = &["adv-scanner", "pcap-diag", "priv-helper"];

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

fn pack_failure_mode(error: &AppError) -> &'static str {
    if error.code == "PACK_HASH_MISMATCH" {
        "hash-mismatch"
    } else {
        "failed"
    }
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

async fn nmap_status() -> String {
    if version_command_succeeds(OsStr::new("nmap"), Duration::from_secs(2)).await {
        "found".into()
    } else {
        "not_found".into()
    }
}

async fn version_command_succeeds(program: &OsStr, timeout_after: Duration) -> bool {
    let mut command = TokioCommand::new(program);
    command.arg("-V").kill_on_drop(true);
    matches!(
        timeout(timeout_after, command.output()).await,
        Ok(Ok(output)) if output.status.success()
    )
}

fn port_scan_status(nmap_found: bool) -> &'static str {
    if nmap_found {
        "supported"
    } else {
        "degraded"
    }
}

fn pcap_status(pcap_installed: bool) -> &'static str {
    if pcap_installed {
        "supported"
    } else {
        "degraded"
    }
}

fn fingerprint_status(nmap_found: bool, adv_installed: bool) -> &'static str {
    if nmap_found {
        "supported"
    } else if adv_installed {
        // The package marker is not wired to this scanner; it cannot enable
        // fingerprint execution by itself.
        "degraded"
    } else {
        "missing_pack"
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
        let status = if installed.is_some() {
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
            artifact_ready: !entry.download_url.is_empty() && !entry.sha256.is_empty(),
            installed_at_ms: installed.as_ref().map(|r| r.installed_at_ms),
            install_mode: installed.as_ref().map(|r| r.mode.clone()),
        });
    }
    Ok(out)
}

pub async fn install_capability_pack<R: Runtime>(
    app: &AppHandle<R>,
    pack_id: String,
) -> AppResult<CapabilityPackInstallResult> {
    let pack_id = pack_id.trim().to_string();
    if !PACK_IDS.contains(&pack_id.as_str()) {
        return Err(AppError::invalid_input(format!(
            "Unknown packId: {pack_id}"
        )));
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

    let dir = packs_dir(app)?;
    if read_installed(&dir, &pack_id).is_some() {
        return Ok(CapabilityPackInstallResult {
            pack_id: pack_id.clone(),
            ok: true,
            mode: "already-installed".into(),
            message: "Pack already installed.".into(),
            command_hint: format!("installCapabilityPack('{pack_id}') // already-installed"),
        });
    }

    emit_progress(app, &pack_id, "validating", 0, entry.size_bytes);

    // Sidecar download path (when URL+hash published). Until then: marker install only.
    // S-X-05: test://hash-mismatch is a deliberate verify-fail channel (no binary executed).
    let mode = if entry.download_url.starts_with("test://hash-mismatch") {
        emit_progress(
            app,
            &pack_id,
            "verifying",
            entry.size_bytes / 3,
            entry.size_bytes,
        );
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
        emit_progress(app, &pack_id, "marker", 0, 0);
        "marker"
    } else {
        match download_and_verify(app, &entry).await {
            Ok(()) => "sidecar",
            Err(e) => {
                let mode = pack_failure_mode(&e);
                return Ok(CapabilityPackInstallResult {
                    pack_id: pack_id.clone(),
                    ok: false,
                    mode: mode.into(),
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
    };
    let path = record_path(&dir, &pack_id);
    let json = serde_json::to_string_pretty(&record)
        .map_err(|e| AppError::io(format!("serialize pack record: {e}")))?;
    fs::write(&path, json).map_err(|e| AppError::io(format!("write pack record: {e}")))?;

    emit_progress(app, &pack_id, "done", entry.size_bytes, entry.size_bytes);

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

pub fn uninstall_capability_pack(app: &AppHandle<impl Runtime>, pack_id: String) -> AppResult<()> {
    let pack_id = pack_id.trim().to_string();
    if pack_id.is_empty() {
        return Err(AppError::invalid_input("packId required"));
    }
    let dir = packs_dir(app)?;
    let path = record_path(&dir, &pack_id);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| AppError::io(format!("uninstall pack: {e}")))?;
    }
    // Idempotent: missing file is success.
    Ok(())
}

/// 能力位判定：**只有真正带回二进制的 sidecar 安装**才算可用。
/// marker 记录只代表「装过一条本地安装记录」，把它算成 supported 会让前端
/// 在什么都没解锁的情况下全绿（SYN 扫描/富 pcap 依旧降级）。
pub fn is_pack_installed(app: &AppHandle<impl Runtime>, pack_id: &str) -> bool {
    packs_dir(app)
        .ok()
        .and_then(|dir| read_installed(&dir, pack_id))
        .is_some_and(|record| record.mode != "marker")
}

pub async fn build_capabilities(app: Option<&AppHandle<impl Runtime>>) -> NetworkProbeCapabilities {
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
    tools.insert("globalping".into(), s("partial")); // Wave 2 remote DNS compare
    tools.insert("whois".into(), s("supported")); // Wave 3
    tools.insert("dnssec".into(), s("partial")); // Wave 3 — DoH AD-bit
    tools.insert("pollution".into(), s("supported")); // Wave 3
    tools.insert("nat".into(), s("supported")); // Wave 4
    tools.insert("ntp".into(), s("supported")); // Wave 4
    tools.insert("mdns".into(), s("supported")); // Wave 4 lan-svc
    tools.insert("lanServices".into(), s("supported"));
    tools.insert("multiNode".into(), s("partial")); // Globalping + agent registry
    tools.insert("agent".into(), s("partial"));

    let adv_installed = app
        .map(|a| is_pack_installed(a, "adv-scanner"))
        .unwrap_or(false);
    let pcap_installed = app
        .map(|a| is_pack_installed(a, "pcap-diag"))
        .unwrap_or(false);
    let nmap = nmap_status().await;
    let nmap_found = nmap == "found";

    // The current port scanner invokes only nmap or the built-in TCP fallback.
    // An installed adv-scanner pack does not claim support until its sidecar is wired in.
    tools.insert("portScan".into(), s(port_scan_status(nmap_found)));
    // ARP: cache read always; privileged sweep needs pack.
    tools.insert("arp".into(), s("degraded"));
    // Pcap: tcpdump counters always attempted; pack unlocks richer mode later.
    tools.insert("pcap".into(), s(pcap_status(pcap_installed)));
    tools.insert(
        "fingerprint".into(),
        s(fingerprint_status(nmap_found, adv_installed)),
    );

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
    pack_id: &str,
    phase: &str,
    bytes: u64,
    total: u64,
) {
    let _ = app.emit(
        PACK_PROGRESS_EVENT,
        &CapabilityPackProgress {
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
) -> AppResult<()> {
    use sha2::{Digest, Sha256};

    if !entry.download_url.starts_with("https://") {
        return Err(AppError::new(
            "PACK_URL_INSECURE",
            "Pack download URL must be https:// (backend manifest only).",
        ));
    }
    emit_progress(app, &entry.id, "downloading", 0, entry.size_bytes);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|e| AppError::new("PACK_CLIENT", e.to_string()))?;
    let bytes = client
        .get(&entry.download_url)
        .send()
        .await
        .map_err(|e| AppError::new("PACK_DOWNLOAD", format!("Download failed: {e}")))?
        .error_for_status()
        .map_err(|e| AppError::new("PACK_DOWNLOAD", format!("Download HTTP error: {e}")))?
        .bytes()
        .await
        .map_err(|e| AppError::new("PACK_DOWNLOAD", format!("Read body failed: {e}")))?;

    emit_progress(
        app,
        &entry.id,
        "verifying",
        bytes.len() as u64,
        entry.size_bytes.max(bytes.len() as u64),
    );
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let digest = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let expected = entry.sha256.trim().to_ascii_lowercase();
    if digest != expected {
        return Err(AppError::new(
            "PACK_HASH_MISMATCH",
            format!("SHA-256 mismatch: got {digest}, expected {expected}. Binary not installed."),
        ));
    }

    let dir = packs_dir(app)?;
    let bin_path = dir.join(format!("{}.bin", entry.id));
    fs::write(&bin_path, &bytes).map_err(|e| AppError::io(format!("write pack binary: {e}")))?;
    Ok(())
}

/// S-X-05 test channel: force hash-mismatch without installing.
#[cfg(debug_assertions)]
pub async fn install_capability_pack_verify_fail<R: Runtime>(
    app: &AppHandle<R>,
    pack_id: String,
) -> AppResult<CapabilityPackInstallResult> {
    let pack_id = pack_id.trim().to_string();
    if !PACK_IDS.contains(&pack_id.as_str()) {
        return Err(AppError::invalid_input(format!(
            "Unknown packId: {pack_id}"
        )));
    }
    emit_progress(app, &pack_id, "verifying", 1, 3);
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

/// The test-only hash failure channel is unavailable in production builds.
#[cfg(not(debug_assertions))]
pub async fn install_capability_pack_verify_fail<R: Runtime>(
    app: &AppHandle<R>,
    pack_id: String,
) -> AppResult<CapabilityPackInstallResult> {
    let _ = (app, pack_id);
    Err(AppError::unsupported(
        "Capability pack verification test is only available in debug builds.",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;
    #[cfg(unix)]
    use std::process::{Command as StdCommand, Stdio};
    #[cfg(unix)]
    use std::time::Instant;

    #[test]
    fn hash_mismatch_has_a_stable_install_failure_mode() {
        assert_eq!(
            pack_failure_mode(&AppError::new("PACK_HASH_MISMATCH", "mismatch")),
            "hash-mismatch"
        );
        assert_eq!(pack_failure_mode(&AppError::io("disk full")), "failed");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn stalled_nmap_version_probe_times_out_and_kills_the_child() {
        let directory =
            std::env::temp_dir().join(format!("bench-nmap-version-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).expect("create test directory");
        let pid_file = directory.join("pid");
        let mock_program = directory.join("mock-nmap");
        fs::write(
            &mock_program,
            format!(
                "#!/bin/sh\nprintf '%s' \"$$\" > '{}'\nexec /bin/sleep 15\n",
                pid_file.display()
            ),
        )
        .expect("write mock program");
        let mut permissions = fs::metadata(&mock_program)
            .expect("read mock permissions")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&mock_program, permissions).expect("make mock executable");

        let started = Instant::now();
        let program = mock_program.clone();
        let probe = tokio::spawn(async move {
            version_command_succeeds(program.as_os_str(), Duration::from_secs(2)).await
        });

        let pid = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if let Ok(pid) = fs::read_to_string(&pid_file) {
                    break pid;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("mock version command should start");
        let found = tokio::time::timeout(Duration::from_secs(4), probe)
            .await
            .expect("stalled version probe should respect its deadline")
            .expect("version probe task should finish");
        assert!(
            !found,
            "stalled version probes must be treated as unavailable"
        );
        assert!(started.elapsed() < Duration::from_secs(8));

        let child_exited = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let alive = StdCommand::new("kill")
                    .args(["-0", pid.trim()])
                    .stderr(Stdio::null())
                    .status()
                    .map(|status| status.success())
                    .unwrap_or(false);
                if !alive {
                    break true;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap_or(false);
        if !child_exited {
            let _ = StdCommand::new("kill")
                .args(["-KILL", pid.trim()])
                .stderr(Stdio::null())
                .status();
        }
        let _ = fs::remove_dir_all(&directory);
        assert!(child_exited, "timed-out version probe child must exit");
    }

    #[test]
    fn missing_privileged_tools_remain_degraded_or_pack_gated() {
        assert_eq!(port_scan_status(false), "degraded");
        assert_eq!(pcap_status(false), "degraded");
        assert_eq!(fingerprint_status(false, false), "missing_pack");
    }

    #[test]
    fn installed_scanner_does_not_claim_unwired_port_scan_support() {
        assert_eq!(port_scan_status(false), "degraded");
        assert_eq!(fingerprint_status(false, true), "degraded");
    }

    #[test]
    fn external_nmap_enables_port_scan_but_does_not_fake_pack_features() {
        assert_eq!(port_scan_status(true), "supported");
        assert_eq!(fingerprint_status(true, false), "supported");
        assert_eq!(pcap_status(false), "degraded");
    }
}
