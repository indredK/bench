use crate::app_manager::{
    record_operation, make_app_id, get_last_modified, deduplicate, name_match_confidence,
    AppInfo, AllowedActions, OperationRecord, OperationResult, ScanResult,
    PlatformCapabilities, AppManagerState, SourceType,
};
use std::collections::HashSet;
use std::path::Path;
use std::process::Command;

// ============================================================================
// Winget Integration
// ============================================================================

fn find_winget() -> Option<String> {
    // Try via LOCALAPPDATA environment variable
    if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
        let p = format!(r"{}\Microsoft\WindowsApps\winget.exe", localappdata);
        if Path::new(&p).exists() {
            return Some(p);
        }
    }
    // Try `where winget`
    if let Ok(output) = Command::new("where").arg("winget").output() {
        let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !s.is_empty() {
            return Some(s.lines().next().unwrap_or("").to_string());
        }
    }
    None
}

fn winget_path() -> Option<String> {
    find_winget()
}

/// List installed winget packages.
fn list_winget_packages(winget: &str) -> Result<Vec<(String, String)>, String> {
    let output = Command::new(winget)
        .args(["list", "--accept-source-agreements"])
        .output()
        .map_err(|e| format!("winget list failed: {}", e))?;
    // Parse winget table output – format: Name Id Version Available Source
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut packages = Vec::new();
    for line in stdout.lines().skip(3) {
        // winget list output columns are variable-width; extract first two columns
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let name = parts[0].to_string();
            let id = parts[1].to_string();
            if !name.is_empty() && !id.is_empty() {
                packages.push((name, id));
            }
        }
    }
    Ok(packages)
}

fn list_winget_upgradable(winget: &str) -> Result<Vec<String>, String> {
    let output = Command::new(winget)
        .args(["upgrade", "--accept-source-agreements"])
        .output()
        .map_err(|e| format!("winget upgrade list failed: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut ids = Vec::new();
    for line in stdout.lines().skip(3) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            ids.push(parts[1].to_lowercase());
        }
    }
    Ok(ids)
}

// ============================================================================
// Registry-based App Discovery (Uninstall keys)
// ============================================================================

/// Query registry for installed apps. Uses `reg query` on Windows.
fn query_registry_uninstall() -> Vec<(String, String, String, String)> {
    // (name, version, publisher, install_location)
    let mut results = Vec::new();

    let reg_paths = &[
        r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ];

    for reg_path in reg_paths {
        if let Ok(output) = Command::new("reg")
            .args(["query", reg_path, "/s", "/f", "DisplayName", "/t", "REG_SZ"])
            .output()
        {
            // Parse reg output to extract app entries
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut display_name = String::new();
            let mut version = String::new();
            let mut publisher = String::new();
            let mut install_location = String::new();

            for line in stdout.lines() {
                let line = line.trim();
                if line.starts_with("HKEY_") {
                    // Flush previous entry
                    if !display_name.is_empty() {
                        results.push((
                            std::mem::take(&mut display_name),
                            std::mem::take(&mut version),
                            std::mem::take(&mut publisher),
                            std::mem::take(&mut install_location),
                        ));
                    }
                } else if let Some(val) = line.strip_prefix("DisplayName    REG_SZ    ") {
                    display_name = val.to_string();
                } else if let Some(val) = line.strip_prefix("DisplayVersion    REG_SZ    ") {
                    version = val.to_string();
                } else if let Some(val) = line.strip_prefix("Publisher    REG_SZ    ") {
                    publisher = val.to_string();
                } else if let Some(val) = line.strip_prefix("InstallLocation    REG_SZ    ") {
                    install_location = val.to_string();
                }
            }
            // Flush last entry
            if !display_name.is_empty() {
                results.push((display_name, version, publisher, install_location));
            }
        }
    }
    results
}

// ============================================================================
// scan_installed_apps (Windows)
// ============================================================================

pub fn scan_installed_apps() -> ScanResult {
    let start = std::time::Instant::now();

    let registry_entries = query_registry_uninstall();

    let winget = winget_path();
    let winget_available = winget.is_some();

    // Collect winget data
    let mut winget_packages: Vec<(String, String)> = Vec::new();
    let mut upgradable_ids: HashSet<String> = HashSet::new();

    if let Some(ref wg) = winget {
        if let Ok(pkgs) = list_winget_packages(wg) {
            winget_packages = pkgs;
        }
        if let Ok(upg) = list_winget_upgradable(wg) {
            upgradable_ids = upg.into_iter().collect();
        }
    }

    let mut apps: Vec<AppInfo> = Vec::new();

    for (name, version, publisher, install_location) in registry_entries {
        if name.is_empty() { continue; }

        let bundle_id = format!("{}.{}", publisher.to_lowercase().replace(' ', "."), name.to_lowercase().replace(' ', "."));

        let install_path = if !install_location.is_empty() {
            install_location.clone()
        } else {
            format!(r"C:\Program Files\{}", name)
        };

        let app_id = make_app_id(&bundle_id, &install_path);
        let last_modified = get_last_modified(Path::new(&install_path));

        // Match against winget
        let (source_type, source_id, source_confidence, can_upgrade, can_uninstall, upgrade_available) = {
            let mut best_match: Option<&(String, String)> = None;
            let mut best_conf = 0.0;
            for pkg in &winget_packages {
                let conf = name_match_confidence(&name, &bundle_id, &pkg.0);
                if conf > best_conf { best_conf = conf; best_match = Some(pkg); }
            }
            if best_conf >= 0.5 {
                let pkg = best_match.unwrap();
                let upgradable = upgradable_ids.contains(&pkg.1.to_lowercase());
                (SourceType::Winget.to_string(), pkg.1.clone(), best_conf, true, true, upgradable)
            } else {
                (SourceType::MsiInstaller.to_string(), String::new(), 1.0, false, false, false)
            }
        };

        let ver = if version.is_empty() { "—".into() } else { version };

        apps.push(AppInfo {
            allowed_actions: AllowedActions {
                launch: !install_location.is_empty(),
                reveal: !install_location.is_empty(),
                upgrade: can_upgrade,
                uninstall: can_uninstall,
            },
            app_id, name, version: ver, bundle_id, install_path,
            source: if source_type == SourceType::Winget.to_string() { "winget".into() } else { "Registry".into() },
            source_type, source_id, source_confidence,
            can_upgrade, can_uninstall, upgrade_available,
            last_operation_result: None, last_modified, is_system_app: false,
            icon_base64: None,
        });
    }

    apps = deduplicate(apps);
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let total_count = apps.len();
    let managed_count = apps.iter().filter(|a| a.can_upgrade || a.can_uninstall).count();

    ScanResult {
        apps, total_count,
        user_count: total_count,
        system_count: 0,
        scan_time_ms: start.elapsed().as_millis() as u64,
        managed_count,
        platform_capabilities: PlatformCapabilities {
            brew_available: false,
            winget_available,
            flatpak_available: false, snap_available: false, apt_available: false,
        },
        last_scan_time: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64,
        last_update_check: 0,
    }
}

// ============================================================================
// launch / reveal (Windows)
// ============================================================================

pub fn launch_app(app_path: String) -> Result<(), String> {
    if !Path::new(&app_path).exists() && !app_path.ends_with(".exe") {
        // Try to launch via `start` as fallback
        let status = Command::new("cmd")
            .args(["/C", "start", "", &app_path])
            .status()
            .map_err(|e| format!("Failed to launch: {}", e))?;
        if status.success() { return Ok(()); }
        return Err("Launch failed".into());
    }
    let status = Command::new("cmd")
        .args(["/C", "start", "", &app_path])
        .status()
        .map_err(|e| format!("Failed to launch: {}", e))?;
    if status.success() { Ok(()) } else { Err("Launch failed".into()) }
}

pub fn reveal_in_explorer(app_path: String) -> Result<(), String> {
    let status = Command::new("explorer")
        .arg("/select")
        .arg(&app_path)
        .status()
        .map_err(|e| format!("Failed to reveal: {}", e))?;
    if status.success() { Ok(()) } else { Err("Reveal failed".into()) }
}

// ============================================================================
// update check (Windows)
// ============================================================================

pub fn check_updates(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> Vec<String> {
    let upgradable = if let Some(ref wg) = winget_path() {
        list_winget_upgradable(wg).unwrap_or_default()
    } else {
        Vec::new()
    };
    let apps = state.apps.lock().unwrap();
    app_ids.into_iter().filter(|id| {
        apps.iter().find(|a| &a.app_id == id).map_or(false, |a| {
            a.source_type == SourceType::Winget.to_string()
                && upgradable.contains(&a.source_id.to_lowercase())
        })
    }).collect()
}

// ============================================================================
// upgrade / uninstall (Windows via winget)
// ============================================================================

pub fn upgrade_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    let app = {
        let apps = state.apps.lock().unwrap();
        apps.iter().find(|a| a.app_id == app_id).cloned()
            .ok_or_else(|| "Application not found".to_string())?
    };
    if !app.can_upgrade { return Err("Cannot upgrade".into()); }
    let wg = winget_path().ok_or("winget is not available")?;
    let output = Command::new(&wg)
        .args(["upgrade", "--id", &app.source_id, "--accept-source-agreements", "--silent"])
        .output()
        .map_err(|e| format!("winget upgrade failed: {}", e))?;
    let combined = format!("{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)).trim().to_string();
    let success = output.status.success();

    let rec = OperationRecord::new("upgrade", &app.app_id, &app.name, success, &combined, output.status.code());
    record_operation(rec.clone());
    Ok(OperationResult { success, message: combined, exit_code: output.status.code(), error_code: rec.error_code, permission_issue: rec.permission_issue })
}

pub fn uninstall_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    let app = {
        let apps = state.apps.lock().unwrap();
        apps.iter().find(|a| a.app_id == app_id).cloned()
            .ok_or_else(|| "Application not found".to_string())?
    };
    if !app.can_uninstall { return Err("Cannot uninstall".into()); }
    let wg = winget_path().ok_or("winget is not available")?;
    let output = Command::new(&wg)
        .args(["uninstall", "--id", &app.source_id, "--accept-source-agreements", "--silent"])
        .output()
        .map_err(|e| format!("winget uninstall failed: {}", e))?;
    let combined = format!("{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)).trim().to_string();
    let success = output.status.success();

    let rec = OperationRecord::new("uninstall", &app.app_id, &app.name, success, &combined, output.status.code());
    record_operation(rec.clone());
    Ok(OperationResult { success, message: combined, exit_code: output.status.code(), error_code: rec.error_code, permission_issue: rec.permission_issue })
}

// ============================================================================
// Install (Windows via winget)
// ============================================================================

pub fn install_app(app_id: String, install_source: crate::app_manager::InstallSource) -> Result<OperationResult, String> {
    // Prefer winget install
    if let Some(winget_id) = &install_source.winget {
        if let Some(wg) = find_winget() {
            let output = Command::new(&wg)
                .args(["install", "--id", winget_id, "--accept-source-agreements", "--silent"])
                .output()
                .map_err(|e| format!("winget install failed: {}", e))?;

            let combined = format!("{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)).trim().to_string();
            let success = output.status.success();

            let rec = OperationRecord::new("install", &app_id, &app_id, success, &combined, output.status.code());
            record_operation(rec.clone());

            return Ok(OperationResult {
                success,
                message: combined,
                exit_code: output.status.code(),
                error_code: rec.error_code,
                permission_issue: rec.permission_issue,
            });
        }
    }

    // Fallback: open download URL
    if let Some(url) = &install_source.url {
        let _ = Command::new("cmd")
            .args(["/C", "start", url])
            .status();
        return Ok(OperationResult {
            success: true,
            message: format!("Opening download page: {}", url),
            exit_code: Some(0),
            error_code: None,
            permission_issue: false,
        });
    }

    Err("No suitable installation method available for this application".into())
}
