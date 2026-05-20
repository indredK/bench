use crate::app_manager::{
    record_operation, make_app_id, get_last_modified, deduplicate, name_match_confidence,
    AppInfo, AllowedActions, OperationRecord, OperationResult, ScanResult,
    PlatformCapabilities, AppManagerState, SourceType,
};
use base64::Engine;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashSet;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

// ============================================================================
// Homebrew Integration
// ============================================================================

const BREW_PATHS: &[&str] = &[
    "/opt/homebrew/bin/brew",
    "/usr/local/bin/brew",
    "/usr/bin/brew",
];

fn find_brew() -> Option<PathBuf> {
    for path in BREW_PATHS {
        let p = Path::new(path);
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }
    if let Ok(output) = Command::new("which").arg("brew").output() {
        let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path_str.is_empty() {
            return Some(PathBuf::from(path_str));
        }
    }
    None
}

fn brew_path() -> Option<String> {
    find_brew().map(|p| p.to_string_lossy().to_string())
}

fn list_installed_casks(brew: &str) -> Result<HashSet<String>, String> {
    let output = Command::new(brew)
        .args(["list", "--cask"])
        .output()
        .map_err(|e| format!("Failed to run brew list --cask: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("brew list --cask failed: {}", stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()).collect())
}

fn list_outdated_casks(brew: &str) -> Result<HashSet<String>, String> {
    let output = Command::new(brew)
        .args(["outdated", "--cask"])
        .output()
        .map_err(|e| format!("Failed to run brew outdated --cask: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()).collect())
}

fn map_casks(brew: &str) -> Result<(HashSet<String>, HashSet<String>), String> {
    Ok((list_installed_casks(brew)?, list_outdated_casks(brew)?))
}

// ============================================================================
// plist / .app Scanner
// ============================================================================

const SCAN_DIRECTORIES: &[&str] = &["/Applications", "/System/Applications"];

fn user_applications_dir() -> Option<PathBuf> {
    dirs_next::home_dir().map(|home| home.join("Applications"))
}

fn read_plist_string(plist_xml: &str, key: &str) -> Option<String> {
    let pattern = format!("<key>{}</key>", key);
    let start = plist_xml.find(&pattern)?;
    let after_key = &plist_xml[start + pattern.len()..];
    let tag_start = after_key.find("<string>")?;
    let tag_end = after_key[tag_start..].find("</string>")?;
    let value = &after_key[tag_start + 8..tag_start + tag_end];
    Some(value.trim().to_string())
}

fn extract_app_metadata(app_path: &Path) -> Option<(String, String, String)> {
    let plist_path = app_path.join("Contents").join("Info.plist");
    let plist_content = fs::read_to_string(&plist_path).ok()?;
    let display_name = read_plist_string(&plist_content, "CFBundleDisplayName")
        .or_else(|| read_plist_string(&plist_content, "CFBundleName"));
    let bundle_id = read_plist_string(&plist_content, "CFBundleIdentifier");
    let version = read_plist_string(&plist_content, "CFBundleShortVersionString")
        .or_else(|| read_plist_string(&plist_content, "CFBundleVersion"));
    let name = display_name
        .or_else(|| app_path.file_stem().and_then(|s| s.to_str()).map(|s| s.to_string()))
        .unwrap_or_else(|| "Unknown".to_string());
    Some((name, bundle_id.unwrap_or_else(|| "unknown".to_string()), version.unwrap_or_else(|| "—".to_string())))
}

fn scan_directory_raw(dir: &Path, is_system: bool) -> Vec<(String, String, String, String, String, bool, u64)> {
    let mut results = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return results,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(true, |ext| ext != "app") {
            continue;
        }
        let real_path = match fs::canonicalize(&path) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let install_path = real_path.to_string_lossy().to_string();
        let (name, bundle_id, version) = if let Some(m) = extract_app_metadata(&real_path) {
            m
        } else {
            let name = real_path.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string();
            (name, "unknown".to_string(), "—".to_string())
        };
        let app_id = make_app_id(&bundle_id, &install_path);
        results.push((app_id, name, bundle_id, version, install_path, is_system, get_last_modified(&real_path)));
    }
    results
}

// ============================================================================
// scan_installed_apps (macOS)
// ============================================================================

pub fn scan_installed_apps(state: tauri::State<'_, AppManagerState>) -> ScanResult {
    let start = std::time::Instant::now();
    let mut raw: Vec<(String, String, String, String, String, bool, u64)> = Vec::new();

    for dir in SCAN_DIRECTORIES {
        let path = Path::new(dir);
        if path.exists() {
            raw.extend(scan_directory_raw(path, dir.starts_with("/System")));
        }
    }
    if let Some(user_dir) = user_applications_dir() {
        if user_dir.exists() {
            raw.extend(scan_directory_raw(&user_dir, false));
        }
    }

    let brew = brew_path();
    let brew_available = brew.is_some();
    let mut installed_casks = HashSet::new();
    let mut outdated_casks = HashSet::new();

    if let Some(ref brew_bin) = brew {
        if let Ok((casks, outdated)) = map_casks(brew_bin) {
            installed_casks = casks;
            outdated_casks = outdated;
        }
    }

    let mut apps: Vec<AppInfo> = Vec::new();

    for (app_id, name, bundle_id, version, install_path, is_system, last_modified) in raw {
        let (source_type, source_id, source_confidence, can_upgrade, can_uninstall, upgrade_available) =
            if is_system {
                (SourceType::MacBundle.to_string(), String::new(), 1.0, false, false, false)
            } else {
                let mut best_cask: Option<String> = None;
                let mut best_conf = 0.0;
                for cask in &installed_casks {
                    let conf = name_match_confidence(&name, &bundle_id, cask);
                    if conf > best_conf { best_conf = conf; best_cask = Some(cask.clone()); }
                }
                if best_conf >= 0.5 {
                    let ct = best_cask.unwrap();
                    let upd = outdated_casks.contains(&ct);
                    (SourceType::HomebrewCask.to_string(), ct.clone(), best_conf, true, true, upd)
                } else {
                    (SourceType::MacBundle.to_string(), String::new(), 1.0, false, false, false)
                }
            };

        apps.push(AppInfo {
            allowed_actions: AllowedActions {
                launch: true, reveal: true,
                upgrade: can_upgrade,
                uninstall: can_uninstall && !is_system,
            },
            app_id, name, version, bundle_id, install_path,
            source: if source_type == SourceType::HomebrewCask.to_string() { "Homebrew".into() } else { "Bundle".into() },
            source_type, source_id, source_confidence,
            can_upgrade, can_uninstall, upgrade_available,
            last_operation_result: None, last_modified, is_system_app: is_system,
            icon_base64: None,
        });
    }

    apps = deduplicate(apps);

    let num_threads = std::cmp::min(apps.len(), 8);
    let chunk_size = if num_threads > 0 { (apps.len() + num_threads - 1) / num_threads } else { 0 };

    if chunk_size > 0 {
        std::thread::scope(|s| {
            for chunk in apps.chunks_mut(chunk_size) {
                s.spawn(move || {
                    for app in chunk.iter_mut() {
                        app.icon_base64 = get_app_icon_base64(&app.install_path).ok();
                    }
                });
            }
        });
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let total_count = apps.len();
    let system_count = apps.iter().filter(|a| a.is_system_app).count();
    let managed_count = apps.iter().filter(|a| a.can_upgrade || a.can_uninstall).count();

    ScanResult {
        apps, total_count,
        user_count: total_count - system_count,
        system_count,
        scan_time_ms: start.elapsed().as_millis() as u64,
        managed_count,
        platform_capabilities: PlatformCapabilities {
            brew_available,
            winget_available: false, flatpak_available: false, snap_available: false, apt_available: false,
        },
        last_scan_time: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64,
        last_update_check: if let Ok(t) = state.last_update_check_time.lock() { *t } else { 0 },
    }
}

// ============================================================================
// launch / reveal (macOS)
// ============================================================================

pub fn launch_app(app_path: String) -> Result<(), String> {
    if !Path::new(&app_path).exists() {
        return Err(format!("Application not found: {}", app_path));
    }
    let status = Command::new("open").arg(&app_path).status()
        .map_err(|e| format!("Failed to launch: {}", e))?;
    if status.success() { Ok(()) } else { Err(format!("Launch exited with status: {}", status)) }
}

pub fn reveal_app_in_finder(app_path: String) -> Result<(), String> {
    if !Path::new(&app_path).exists() {
        return Err(format!("Application not found: {}", app_path));
    }
    let status = Command::new("open").arg("-R").arg(&app_path).status()
        .map_err(|e| format!("Failed to reveal: {}", e))?;
    if status.success() { Ok(()) } else { Err(format!("Reveal exited with status: {}", status)) }
}

// ============================================================================
// update check (macOS)
// ============================================================================

pub fn check_updates(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> Vec<String> {
    let outdated = if let Some(ref brew) = brew_path() {
        list_outdated_casks(brew).unwrap_or_default()
    } else {
        HashSet::new()
    };
    let apps = state.apps.lock().unwrap();
    app_ids.into_iter().filter(|id| {
        apps.iter().find(|a| &a.app_id == id).map_or(false, |a| {
            a.source_type == SourceType::HomebrewCask.to_string()
                && outdated.contains(&a.source_id.to_lowercase())
        })
    }).collect()
}

// ============================================================================
// upgrade / uninstall (macOS)
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
    if !app.can_upgrade {
        return Err("This application cannot be upgraded".to_string());
    }
    let brew = brew_path().ok_or("Homebrew is not available")?;
    let output = Command::new(&brew).args(["upgrade", "--cask", &app.source_id]).output()
        .map_err(|e| format!("Failed to run brew upgrade: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stdout, stderr).trim().to_string();
    let success = output.status.success();

    let rec = OperationRecord::new("upgrade", &app.app_id, &app.name, success, &combined, output.status.code());
    record_operation(rec.clone());

    Ok(OperationResult {
        success,
        message: if success { format!("Upgraded {}", app.name) } else { combined },
        exit_code: output.status.code(),
        error_code: rec.error_code,
        permission_issue: rec.permission_issue,
    })
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
    if app.is_system_app { return Err("System applications cannot be uninstalled".into()); }
    if !app.can_uninstall { return Err("This application cannot be uninstalled".into()); }
    let brew = brew_path().ok_or("Homebrew is not available")?;
    let output = Command::new(&brew).args(["uninstall", "--cask", &app.source_id]).output()
        .map_err(|e| format!("Failed to run brew uninstall: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stdout, stderr).trim().to_string();
    let success = output.status.success();

    let rec = OperationRecord::new("uninstall", &app.app_id, &app.name, success, &combined, output.status.code());
    record_operation(rec.clone());

    Ok(OperationResult {
        success,
        message: if success { format!("Uninstalled {}", app.name) } else { combined },
        exit_code: output.status.code(),
        error_code: rec.error_code,
        permission_issue: rec.permission_issue,
    })
}

// ============================================================================
// App Icon Extraction (macOS)
// ============================================================================

fn find_icns_in_resources(resources: &Path) -> Option<PathBuf> {
    if !resources.exists() {
        return None;
    }
    let entries = std::fs::read_dir(resources).ok()?;
    let mut icns_files: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map_or(false, |ext| ext == "icns"))
        .collect();
    icns_files.sort_by_key(|p| {
        std::fs::metadata(p).map(|m| m.len()).unwrap_or(0)
    });
    icns_files.pop()
}

fn extract_plist_icon_file(plist_content: &str) -> Option<String> {
    let key = "<key>CFBundleIconFile</key>";
    let start = plist_content.find(key)?;
    let after_key = &plist_content[start + key.len()..];
    let tag_start = after_key.find("<string>")?;
    let tag_end = after_key[tag_start..].find("</string>")?;
    Some(after_key[tag_start + 8..tag_start + tag_end].trim().to_string())
}

fn resolve_finder_alias(path: &Path) -> Option<PathBuf> {
    if !path.is_file() {
        return None;
    }
    let output = Command::new("osascript")
        .args([
            "-e",
            &format!(
                "tell application \"Finder\" to get POSIX path of (original item of (POSIX file \"{}\" as alias))",
                path.display()
            ),
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let resolved = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if resolved.is_empty() {
        return None;
    }
    let resolved_path = PathBuf::from(resolved);
    if resolved_path.exists() {
        Some(resolved_path)
    } else {
        None
    }
}

pub fn get_app_icon_base64(install_path: &str) -> Result<String, String> {
    let app_path = Path::new(install_path);
    if !app_path.exists() {
        return Err("Application not found".into());
    }

    let app_path = if app_path.is_file() {
        resolve_finder_alias(app_path)
            .ok_or("Cannot resolve Finder alias to real app bundle")?
    } else {
        app_path.to_path_buf()
    };

    let contents = app_path.join("Contents");

    if contents.exists() {
        let resources = contents.join("Resources");
        let icon_path = resolve_macos_icon(&contents, &resources)?;
        return icns_to_base64_png(install_path, &icon_path);
    }

    let inner_app = resolve_ios_wrapped_bundle(&app_path).unwrap_or(app_path);
    let png = find_ios_app_icon_png(&inner_app)?;
    png_to_base64(&png)
}

fn resolve_macos_icon(contents: &Path, resources: &Path) -> Result<PathBuf, String> {
    if let Ok(plist_content) = std::fs::read_to_string(contents.join("Info.plist")) {
        let icon_name = extract_plist_icon_file(&plist_content).unwrap_or_default();
        if !icon_name.is_empty() {
            let p = resources.join(&icon_name);
            if p.exists() {
                return Ok(p);
            }
            let with_ext = resources.join(format!("{}.icns", icon_name));
            if with_ext.exists() {
                return Ok(with_ext);
            }
        }
    }
    find_icns_in_resources(resources).ok_or("No icon file found in app bundle".into())
}

fn resolve_ios_wrapped_bundle(app_path: &Path) -> Option<PathBuf> {
    let wrapper = app_path.join("Wrapper");
    if wrapper.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&wrapper) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().map_or(false, |ext| ext == "app") {
                    return Some(p);
                }
            }
        }
    }
    let wrapped = app_path.join("WrappedBundle");
    if wrapped.is_symlink() {
        if let Ok(target) = std::fs::read_link(&wrapped) {
            let resolved = if target.is_relative() {
                app_path.join(target)
            } else {
                target
            };
            return resolve_ios_wrapped_bundle(&resolved)
                .or_else(|| if resolved.exists() { Some(resolved) } else { None });
        }
    }
    None
}

fn find_ios_app_icon_png(app_path: &Path) -> Result<PathBuf, String> {
    if !app_path.is_dir() {
        return Err("Not a valid iOS app bundle".into());
    }
    let read_dir = std::fs::read_dir(app_path).map_err(|e| format!("Cannot read app bundle: {}", e))?;
    let mut icons: Vec<PathBuf> = read_dir
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map_or(false, |n| {
                        n.starts_with("AppIcon") && n.ends_with(".png")
                    })
        })
        .collect();
    if icons.is_empty() {
        return Err("No AppIcon PNG found in iOS app bundle".into());
    }
    icons.sort_by_key(|p| {
        std::fs::metadata(p).map(|m| m.len()).unwrap_or(0)
    });
    icons.pop().ok_or("No AppIcon found".into())
}

fn icns_to_base64_png(install_path: &str, icon_path: &Path) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let mut hasher = DefaultHasher::new();
    install_path.hash(&mut hasher);
    let temp_png = temp_dir.join(format!("bench_app_icon_{:x}.png", hasher.finish()));

    let output = Command::new("sips")
        .args([
            "-s", "format", "png",
            icon_path.to_str().ok_or("Invalid icon path")?,
            "--out", temp_png.to_str().ok_or("Invalid temp path")?,
        ])
        .output()
        .map_err(|e| format!("Failed to run sips: {}", e))?;

    if !output.status.success() {
        let _ = std::fs::remove_file(&temp_png);
        return Err("Failed to convert icon to PNG".into());
    }

    let mut buf = Vec::new();
    std::fs::File::open(&temp_png)
        .map_err(|e| format!("Failed to open converted PNG: {}", e))?
        .read_to_end(&mut buf)
        .map_err(|e| format!("Failed to read converted PNG: {}", e))?;

    let _ = std::fs::remove_file(&temp_png);

    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

fn png_to_base64(png_path: &Path) -> Result<String, String> {
    let mut buf = Vec::new();
    std::fs::File::open(png_path)
        .map_err(|e| format!("Failed to open icon PNG: {}", e))?
        .read_to_end(&mut buf)
        .map_err(|e| format!("Failed to read icon PNG: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}
