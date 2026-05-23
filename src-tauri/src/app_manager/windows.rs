use crate::app_manager::{
    build_app_info, build_scan_result, deduplicate, get_last_modified, make_app_id,
    operation_result, platform_capabilities, record_operation_result, resolve_windows_source,
    AppInfoInput, AppManagerState, OperationResult, ScanResult, SourceType,
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

/// Column offsets parsed from a winget table header.
struct WingetColumns {
    name_start: usize,
    id_start: usize,
    version_start: Option<usize>,
}

impl WingetColumns {
    fn from_header(header: &str) -> Option<Self> {
        let name_start = header.find("Name")?;
        let id_start = header.find("Id")?;
        if id_start <= name_start {
            return None;
        }
        let version_start = header.find("Version");
        if let Some(v) = version_start {
            if v <= id_start {
                return None;
            }
        }
        Some(Self {
            name_start,
            id_start,
            version_start,
        })
    }
}

/// Locate the winget header line and return remaining data lines (skipping the
/// dash separator immediately after the header).
fn find_winget_table(stdout: &str) -> Option<(WingetColumns, Vec<&str>)> {
    let lines: Vec<&str> = stdout.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        if let Some(cols) = WingetColumns::from_header(line) {
            let data: Vec<&str> = lines.into_iter().skip(i + 2).collect();
            return Some((cols, data));
        }
    }
    None
}

/// Slice `s` by byte range, snapping each endpoint to the nearest char
/// boundary so UTF-8 sequences stay intact.
fn slice_byte_range(s: &str, start: usize, end: usize) -> &str {
    let len = s.len();
    if start >= len {
        return "";
    }
    let end = end.min(len);
    if end <= start {
        return "";
    }
    let mut s_idx = start;
    while s_idx < len && !s.is_char_boundary(s_idx) {
        s_idx += 1;
    }
    let mut e_idx = end;
    while e_idx < len && !s.is_char_boundary(e_idx) {
        e_idx += 1;
    }
    if s_idx >= e_idx {
        return "";
    }
    &s[s_idx..e_idx]
}

/// List installed winget packages.
fn list_winget_packages(winget: &str) -> Result<Vec<(String, String)>, String> {
    let output = Command::new(winget)
        .args(["list", "--accept-source-agreements"])
        .output()
        .map_err(|e| format!("winget list failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("winget list failed: {}", stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let (cols, data) = match find_winget_table(&stdout) {
        Some(v) => v,
        None => return Ok(Vec::new()),
    };
    let mut packages = Vec::new();
    for line in data {
        if line.trim().is_empty() {
            continue;
        }
        let id_end = cols.version_start.unwrap_or(usize::MAX);
        let name = slice_byte_range(line, cols.name_start, cols.id_start)
            .trim()
            .to_string();
        let id = slice_byte_range(line, cols.id_start, id_end)
            .trim()
            .to_string();
        if !name.is_empty() && !id.is_empty() {
            packages.push((name, id));
        }
    }
    Ok(packages)
}

fn list_winget_upgradable(winget: &str) -> Result<Vec<String>, String> {
    let output = Command::new(winget)
        .args(["upgrade", "--accept-source-agreements"])
        .output()
        .map_err(|e| format!("winget upgrade list failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("winget upgrade list failed: {}", stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let (cols, data) = match find_winget_table(&stdout) {
        Some(v) => v,
        None => return Ok(Vec::new()),
    };
    let mut ids = Vec::new();
    for line in data {
        if line.trim().is_empty() {
            continue;
        }
        let id_end = cols.version_start.unwrap_or(usize::MAX);
        let id = slice_byte_range(line, cols.id_start, id_end).trim();
        if !id.is_empty() {
            ids.push(id.to_lowercase());
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

    let mut apps = Vec::new();

    for (name, version, publisher, install_location) in registry_entries {
        if name.is_empty() {
            continue;
        }

        let bundle_id = format!(
            "{}.{}",
            publisher.to_lowercase().replace(' ', "."),
            name.to_lowercase().replace(' ', ".")
        );

        let install_path = if !install_location.is_empty() {
            install_location.clone()
        } else {
            format!(r"C:\Program Files\{}", name)
        };

        let install_exists = Path::new(&install_path).exists();

        let app_id = make_app_id(&bundle_id, &install_path);
        let last_modified = get_last_modified(Path::new(&install_path));

        let source = resolve_windows_source(&name, &bundle_id, &winget_packages, &upgradable_ids);

        let ver = if version.is_empty() {
            "—".into()
        } else {
            version
        };

        apps.push(build_app_info(AppInfoInput {
            app_id,
            name,
            version: ver,
            bundle_id,
            install_path,
            source_type: source.source_type,
            source_id: source.source_id,
            source_confidence: source.source_confidence,
            can_upgrade: source.can_upgrade,
            can_uninstall: source.can_uninstall,
            upgrade_available: source.upgrade_available,
            last_modified,
            is_system_app: false,
            launchable: install_exists,
            revealable: install_exists,
        }));
    }

    apps = deduplicate(apps);

    build_scan_result(
        apps,
        platform_capabilities(false, winget_available, false, false, false),
        start.elapsed().as_millis() as u64,
        0,
    )
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
        if status.success() {
            return Ok(());
        }
        return Err("Launch failed".into());
    }
    let status = Command::new("cmd")
        .args(["/C", "start", "", &app_path])
        .status()
        .map_err(|e| format!("Failed to launch: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err("Launch failed".into())
    }
}

pub fn reveal_in_explorer(app_path: String) -> Result<(), String> {
    let status = Command::new("explorer")
        .arg("/select")
        .arg(&app_path)
        .status()
        .map_err(|e| format!("Failed to reveal: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err("Reveal failed".into())
    }
}

// ============================================================================
// update check (Windows)
// ============================================================================

pub fn check_updates(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> Result<Vec<String>, String> {
    let upgradable = match winget_path() {
        Some(ref wg) => list_winget_upgradable(wg)
            .map_err(|e| format!("winget upgrade --list failed: {}", e))?,
        None => Vec::new(),
    };
    let apps = state.apps.lock().unwrap_or_else(|e| e.into_inner());
    Ok(app_ids
        .into_iter()
        .filter(|id| {
            apps.iter().find(|a| &a.app_id == id).is_some_and(|a| {
                a.source_type == SourceType::Winget.to_string()
                    && upgradable.contains(&a.source_id.to_lowercase())
            })
        })
        .collect())
}

// ============================================================================
// upgrade / uninstall (Windows via winget)
// ============================================================================

pub fn upgrade_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    let app = {
        let apps = state.apps.lock().unwrap_or_else(|e| e.into_inner());
        apps.iter()
            .find(|a| a.app_id == app_id)
            .cloned()
            .ok_or_else(|| "Application not found".to_string())?
    };
    if !app.can_upgrade {
        return Err("Cannot upgrade".into());
    }
    let wg = winget_path().ok_or("winget is not available")?;
    let output = Command::new(&wg)
        .args([
            "upgrade",
            "--id",
            &app.source_id,
            "--accept-source-agreements",
            "--silent",
        ])
        .output()
        .map_err(|e| format!("winget upgrade failed: {}", e))?;
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
    .trim()
    .to_string();
    let success = output.status.success();

    Ok(record_operation_result(
        &state,
        "upgrade",
        &app.app_id,
        &app.name,
        success,
        &combined,
        combined.clone(),
        output.status.code(),
    ))
}

pub fn uninstall_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    let app = {
        let apps = state.apps.lock().unwrap_or_else(|e| e.into_inner());
        apps.iter()
            .find(|a| a.app_id == app_id)
            .cloned()
            .ok_or_else(|| "Application not found".to_string())?
    };
    if !app.can_uninstall {
        return Err("Cannot uninstall".into());
    }
    let wg = winget_path().ok_or("winget is not available")?;
    let output = Command::new(&wg)
        .args([
            "uninstall",
            "--id",
            &app.source_id,
            "--accept-source-agreements",
            "--silent",
        ])
        .output()
        .map_err(|e| format!("winget uninstall failed: {}", e))?;
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
    .trim()
    .to_string();
    let success = output.status.success();

    Ok(record_operation_result(
        &state,
        "uninstall",
        &app.app_id,
        &app.name,
        success,
        &combined,
        combined.clone(),
        output.status.code(),
    ))
}

// ============================================================================
// Install (Windows via winget)
// ============================================================================

pub fn install_app(
    app_id: String,
    install_source: crate::app_manager::InstallSource,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    // Prefer winget install
    if let Some(winget_id) = &install_source.winget {
        if let Some(wg) = find_winget() {
            let output = Command::new(&wg)
                .args([
                    "install",
                    "--id",
                    winget_id,
                    "--accept-source-agreements",
                    "--silent",
                ])
                .output()
                .map_err(|e| format!("winget install failed: {}", e))?;

            let combined = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            )
            .trim()
            .to_string();
            let success = output.status.success();

            return Ok(record_operation_result(
                &state,
                "install",
                &app_id,
                &app_id,
                success,
                &combined,
                combined.clone(),
                output.status.code(),
            ));
        }
    }

    // Fallback: open download URL
    if let Some(url) = &install_source.url {
        let _ = Command::new("cmd").args(["/C", "start", url]).status();
        return Ok(operation_result(
            true,
            format!("Opening download page: {}", url),
            Some(0),
            None,
            false,
        ));
    }

    Err("No suitable installation method available for this application".into())
}
