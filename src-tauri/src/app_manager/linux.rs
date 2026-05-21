use crate::app_manager::{
    record_operation, make_app_id, get_last_modified, deduplicate, name_match_confidence,
    AppInfo, AllowedActions, OperationRecord, OperationResult, ScanResult,
    PlatformCapabilities, AppManagerState, SourceType,
};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

// ============================================================================
// Package Manager Detection
// ============================================================================

fn has_command(cmd: &str) -> bool {
    Command::new("which").arg(cmd).output().map(|o| o.status.success()).unwrap_or(false)
}

fn flatpak_available() -> bool { has_command("flatpak") }
fn snap_available() -> bool { has_command("snap") }
fn apt_available() -> bool { has_command("apt") }

// ============================================================================
// Desktop Entry Parsing
// ============================================================================

const DESKTOP_ENTRY_DIRS: &[&str] = &[
    "/usr/share/applications",
    "/usr/local/share/applications",
];

fn user_desktop_entries_dir() -> Option<PathBuf> {
    dirs_next::data_dir().map(|d| d.join("applications"))
}

/// Parse a .desktop file for Name, Comment, Exec, Icon.
fn parse_desktop_entry(path: &Path) -> Option<(String, String, String, String)> {
    let content = fs::read_to_string(path).ok()?;
    let mut name = String::new();
    let mut comment = String::new();
    let mut exec = String::new();
    let mut icon = String::new();
    let mut in_desktop_entry = false;

    for line in content.lines() {
        let line = line.trim();
        if line == "[Desktop Entry]" {
            in_desktop_entry = true;
            continue;
        }
        if line.starts_with('[') {
            in_desktop_entry = false;
            continue;
        }
        if !in_desktop_entry { continue; }
        // Skip NoDisplay/Hidden entries
        if line.starts_with("NoDisplay=true") || line.starts_with("Hidden=true") {
            return None;
        }
        if let Some(val) = line.strip_prefix("Name=") {
            name = val.to_string();
        } else if let Some(val) = line.strip_prefix("Comment=") {
            comment = val.to_string();
        } else if let Some(val) = line.strip_prefix("Exec=") {
            exec = val.to_string();
        } else if let Some(val) = line.strip_prefix("Icon=") {
            icon = val.to_string();
        }
    }

    if name.is_empty() { return None; }
    Some((name, comment, exec, icon))
}

/// Clean Exec field: remove %f, %u, %F, %U placeholders.
fn clean_exec(exec: &str) -> String {
    let s = exec
        .replace("%f", "")
        .replace("%u", "")
        .replace("%F", "")
        .replace("%U", "")
        .replace("%c", "")
        .replace("%k", "");
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    s.trim().to_string()
}

fn scan_desktop_entries() -> Vec<(String, String, String, String, String)> {
    // (name, bundle_id, version, install_path, comment)
    let mut results = Vec::new();
    let mut dirs: Vec<PathBuf> = DESKTOP_ENTRY_DIRS.iter().map(PathBuf::from).collect();
    if let Some(user_dir) = user_desktop_entries_dir() {
        dirs.push(user_dir);
    }

    for dir in &dirs {
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(true, |ext| ext != "desktop") {
                continue;
            }
            if let Some((name, _comment, exec, _icon)) = parse_desktop_entry(&path) {
                let install_path = path.to_string_lossy().to_string();
                let cleaned_exec = clean_exec(&exec);
                // Derive bundle_id from file name
                let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(&name);
                let bundle_id = format!("desktop.{}", stem.to_lowercase().replace(' ', "-"));
                results.push((name, bundle_id, String::new(), install_path, cleaned_exec));
            }
        }
    }
    results
}

// ============================================================================
// Flatpak / Snap / APT package lists
// ============================================================================

fn list_flatpak_apps() -> Vec<(String, String, String)> {
    // (name, app_id, version)
    let mut apps = Vec::new();
    if !flatpak_available() { return apps; }
    if let Ok(output) = Command::new("flatpak").args(["list", "--app", "--columns=name,application,version"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().skip(1) {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                apps.push((
                    parts[0].trim().to_string(),
                    parts[1].trim().to_string(),
                    parts.get(2).map(|s| s.trim().to_string()).unwrap_or_default(),
                ));
            }
        }
    }
    apps
}

fn list_snap_apps() -> Vec<(String, String, String)> {
    let mut apps = Vec::new();
    if !snap_available() { return apps; }
    if let Ok(output) = Command::new("snap").args(["list"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                apps.push((
                    parts[0].to_string(),
                    parts[0].to_string(),
                    parts.get(1).map(|s| s.to_string()).unwrap_or_default(),
                ));
            }
        }
    }
    apps
}

fn list_apt_installed() -> Vec<(String, String, String)> {
    let mut apps = Vec::new();
    if !apt_available() { return apps; }
    if let Ok(output) = Command::new("dpkg-query")
        .args(["-W", "-f=${Package}\t${Version}\t${Section}\n"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                // Only include packages likely to be GUI apps (not libraries)
                let section = parts.get(2).map(|s| s.to_string()).unwrap_or_default();
                if section.contains("lib") || section.contains("devel") { continue; }
                apps.push((parts[0].to_string(), parts[0].to_string(), parts[1].to_string()));
            }
        }
    }
    apps
}

// ============================================================================
// scan_installed_apps (Linux)
// ============================================================================

pub fn scan_installed_apps() -> ScanResult {
    let start = std::time::Instant::now();

    let desktop_entries = scan_desktop_entries();
    let flatpak_apps = list_flatpak_apps();
    let snap_apps = list_snap_apps();
    let apt_packages = list_apt_installed();

    let fp_available = flatpak_available();
    let sn_available = snap_available();
    let ap_available = apt_available();

    // Build lookup sets
    let flatpak_names: HashSet<String> = flatpak_apps.iter().map(|(n, _, _)| n.to_lowercase()).collect();
    let snap_names: HashSet<String> = snap_apps.iter().map(|(n, _, _)| n.to_lowercase()).collect();

    let mut apps: Vec<AppInfo> = Vec::new();

    for (name, bundle_id, version, install_path, exec_path) in desktop_entries {
        let app_id = make_app_id(&bundle_id, &install_path);
        let last_modified = get_last_modified(Path::new(&install_path));

        // Source identification
        let (source_type, source_id, source_confidence, can_upgrade, can_uninstall, upgrade_available) = {
            let name_lower = name.to_lowercase();

            if flatpak_names.contains(&name_lower) {
                let fp_id = flatpak_apps.iter()
                    .find(|(n, _, _)| n.to_lowercase() == name_lower)
                    .map(|(_, id, _)| id.clone())
                    .unwrap_or_default();
                (SourceType::Flatpak.to_string(), fp_id, 0.9, fp_available, fp_available, false)
            } else if snap_names.contains(&name_lower) {
                (SourceType::Snap.to_string(), name_lower.clone(), 0.9, sn_available, sn_available, false)
            } else if ap_available && apt_packages.iter().any(|(n, _, _)| {
                name_match_confidence(&name, &bundle_id, n) >= 0.5
            }) {
                let apt_id = apt_packages.iter()
                    .find(|(n, _, _)| name_match_confidence(&name, &bundle_id, n) >= 0.5)
                    .map(|(id, _, _)| id.clone())
                    .unwrap_or_default();
                (SourceType::Apt.to_string(), apt_id, 0.7, ap_available, ap_available, false)
            } else {
                (SourceType::Unknown.to_string(), String::new(), 1.0, false, false, false)
            }
        };

        let ver = if version.is_empty() { "—".into() } else { version };

        apps.push(AppInfo {
            allowed_actions: AllowedActions {
                launch: !exec_path.is_empty(),
                reveal: true,
                upgrade: can_upgrade,
                uninstall: can_uninstall,
            },
            app_id, name, version: ver, bundle_id, install_path,
            source: source_type.clone(),
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
            winget_available: false,
            flatpak_available: fp_available,
            snap_available: sn_available,
            apt_available: ap_available,
        },
        last_scan_time: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64,
        last_update_check: 0,
    }
}

// ============================================================================
// launch / reveal (Linux)
// ============================================================================

pub fn launch_app(app_path: String) -> Result<(), String> {
    // Extract Exec line from desktop file and run it
    if app_path.ends_with(".desktop") {
        if let Ok(content) = fs::read_to_string(&app_path) {
            for line in content.lines() {
                if let Some(exec) = line.trim().strip_prefix("Exec=") {
                    let cmd = clean_exec(exec);
                    let parts: Vec<&str> = cmd.split_whitespace().collect();
                    if parts.is_empty() {
                        return Err("Empty exec in desktop entry".into());
                    }
                    let mut command = Command::new(parts[0]);
                    for arg in &parts[1..] {
                        command.arg(arg);
                    }
                    let status = command.status()
                        .map_err(|e| format!("Failed to launch: {}", e))?;
                    return if status.success() { Ok(()) } else { Err("Launch failed".into()) };
                }
            }
        }
    }
    // Fallback to xdg-open
    let status = Command::new("xdg-open")
        .arg(&app_path)
        .status()
        .map_err(|e| format!("Failed to launch: {}", e))?;
    if status.success() { Ok(()) } else { Err("Launch failed".into()) }
}

pub fn reveal_in_file_manager(app_path: String) -> Result<(), String> {
    let parent = Path::new(&app_path).parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(app_path.clone());

    // Try gio first (GNOME), then xdg-open
    if has_command("gio") {
        let status = Command::new("gio")
            .args(["open", &parent])
            .status()
            .map_err(|e| format!("Failed: {}", e))?;
        if status.success() { return Ok(()); }
    }
    let status = Command::new("xdg-open")
        .arg(&parent)
        .status()
        .map_err(|e| format!("Failed to reveal: {}", e))?;
    if status.success() { Ok(()) } else { Err("Reveal failed".into()) }
}

// ============================================================================
// update check (Linux)
// ============================================================================

pub fn check_updates(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> Vec<String> {
    let apps = state.apps.lock().unwrap();

    // Collect upgradable flatpak/snap apps
    let mut updatable_ids: HashSet<String> = HashSet::new();

    if flatpak_available() {
        if let Ok(output) = Command::new("flatpak").args(["remote-ls", "--updates", "--app"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some(id) = line.split_whitespace().next() {
                    updatable_ids.insert(id.to_lowercase());
                }
            }
        }
    }

    if snap_available() {
        if let Ok(output) = Command::new("snap").args(["refresh", "--list"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                if let Some(name) = line.split_whitespace().next() {
                    updatable_ids.insert(name.to_lowercase());
                }
            }
        }
    }

    app_ids.into_iter().filter(|id| {
        apps.iter().find(|a| &a.app_id == id).map_or(false, |a| {
            updatable_ids.contains(&a.source_id.to_lowercase())
        })
    }).collect()
}

// ============================================================================
// upgrade / uninstall (Linux)
// ============================================================================

fn do_upgrade_linux(app: &AppInfo) -> Result<(bool, String, Option<i32>), String> {
    match app.source_type.as_str() {
        "Flatpak" => {
            let output = Command::new("flatpak")
                .args(["update", "-y", &app.source_id])
                .output().map_err(|e| format!("flatpak update failed: {}", e))?;
            let combined = format!("{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr)).trim().to_string();
            Ok((output.status.success(), combined, output.status.code()))
        }
        "Snap" => {
            let output = Command::new("snap")
                .args(["refresh", &app.source_id])
                .output().map_err(|e| format!("snap refresh failed: {}", e))?;
            let combined = format!("{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr)).trim().to_string();
            Ok((output.status.success(), combined, output.status.code()))
        }
        "Apt" => {
            let output = Command::new("sudo")
                .args(["-n", "apt-get", "install", "--only-upgrade", "-y", &app.source_id])
                .output().map_err(|e| format!("apt upgrade failed: {}", e))?;
            let combined = format!("{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr)).trim().to_string();
            Ok((output.status.success(), combined, output.status.code()))
        }
        _ => Err("Unsupported source for upgrade".into()),
    }
}

fn do_uninstall_linux(app: &AppInfo) -> Result<(bool, String, Option<i32>), String> {
    match app.source_type.as_str() {
        "Flatpak" => {
            let output = Command::new("flatpak")
                .args(["uninstall", "-y", &app.source_id])
                .output().map_err(|e| format!("flatpak uninstall failed: {}", e))?;
            let combined = format!("{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr)).trim().to_string();
            Ok((output.status.success(), combined, output.status.code()))
        }
        "Snap" => {
            let output = Command::new("snap")
                .args(["remove", &app.source_id])
                .output().map_err(|e| format!("snap remove failed: {}", e))?;
            let combined = format!("{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr)).trim().to_string();
            Ok((output.status.success(), combined, output.status.code()))
        }
        "Apt" => {
            let output = Command::new("sudo")
                .args(["-n", "apt-get", "remove", "-y", &app.source_id])
                .output().map_err(|e| format!("apt remove failed: {}", e))?;
            let combined = format!("{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr)).trim().to_string();
            Ok((output.status.success(), combined, output.status.code()))
        }
        _ => Err("Unsupported source for uninstall".into()),
    }
}

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

    let (success, output, exit_code) = do_upgrade_linux(&app)?;
    let rec = OperationRecord::new("upgrade", &app.app_id, &app.name, success, &output, exit_code);
    record_operation(rec.clone());
    Ok(OperationResult { success, message: output, exit_code, error_code: rec.error_code, permission_issue: rec.permission_issue })
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

    let (success, output, exit_code) = do_uninstall_linux(&app)?;
    let rec = OperationRecord::new("uninstall", &app.app_id, &app.name, success, &output, exit_code);
    record_operation(rec.clone());
    Ok(OperationResult { success, message: output, exit_code, error_code: rec.error_code, permission_issue: rec.permission_issue })
}

// ============================================================================
// Install (Linux via flatpak/snap/apt)
// ============================================================================

pub fn install_app(app_id: String, install_source: crate::app_manager::InstallSource) -> Result<OperationResult, String> {
    // Prefer flatpak
    if let Some(flatpak_id) = &install_source.flatpak {
        if flatpak_available() {
            let output = Command::new("flatpak")
                .args(["install", "--noninteractive", "-y", "flathub", flatpak_id])
                .output()
                .map_err(|e| format!("flatpak install failed: {}", e))?;
            let combined = format!("{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)).trim().to_string();
            let success = output.status.success();
            let r = OperationRecord::new("install", &app_id, &app_id, success, &combined, output.status.code());
            record_operation(r.clone());
            return Ok(OperationResult { success, message: combined, exit_code: output.status.code(), error_code: r.error_code, permission_issue: r.permission_issue });
        }
    }

    // Prefer snap
    if let Some(snap_name) = &install_source.snap {
        if snap_available() {
            let output = Command::new("snap")
                .args(["install", snap_name])
                .output()
                .map_err(|e| format!("snap install failed: {}", e))?;
            let combined = format!("{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)).trim().to_string();
            let success = output.status.success();
            let r = OperationRecord::new("install", &app_id, &app_id, success, &combined, output.status.code());
            record_operation(r.clone());
            return Ok(OperationResult { success, message: combined, exit_code: output.status.code(), error_code: r.error_code, permission_issue: r.permission_issue });
        }
    }

    // Prefer apt
    if let Some(apt_pkg) = &install_source.apt {
        if apt_available() {
            let output = Command::new("sudo")
                .args(["-n", "apt", "install", "-y", apt_pkg])
                .output()
                .map_err(|e| format!("apt install failed: {}", e))?;
            let combined = format!("{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)).trim().to_string();
            let success = output.status.success();
            let r = OperationRecord::new("install", &app_id, &app_id, success, &combined, output.status.code());
            record_operation(r.clone());
            return Ok(OperationResult { success, message: combined, exit_code: output.status.code(), error_code: r.error_code, permission_issue: r.permission_issue });
        }
    }

    // Fallback: open download URL with xdg-open
    if let Some(url) = &install_source.url {
        let _ = Command::new("xdg-open").arg(url).status();
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
