use crate::app_manager::{
    build_app_info, build_scan_result, deduplicate, get_last_modified, make_app_id,
    operation_result, platform_capabilities, record_operation_result,
    record_operation_result_with_error_code, resolve_macos_source, AppInfoInput, AppManagerState,
    OperationResult, ScanResult, SourceType,
};
use base64::Engine;
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashSet, VecDeque};
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

/// Verify that the located brew binary is actually executable and behaves
/// like Homebrew. `brew_path` only checks for file existence, but the binary
/// could be a broken symlink, lack execute permissions, or be a stub left by
/// an uninstall (#023). We run `brew --version` and require the success exit
/// status with stdout that starts with "Homebrew" before reporting brew as
/// available.
fn brew_works(brew: &str) -> bool {
    let Ok(output) = Command::new(brew).arg("--version").output() else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.trim_start().starts_with("Homebrew")
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
    Ok(stdout
        .lines()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect())
}

fn list_outdated_casks(brew: &str) -> Result<HashSet<String>, String> {
    let output = Command::new(brew)
        .args(["outdated", "--cask"])
        .output()
        .map_err(|e| format!("Failed to run brew outdated --cask: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("brew outdated --cask failed: {}", stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect())
}

fn map_casks(brew: &str) -> Result<(HashSet<String>, HashSet<String>), String> {
    Ok((list_installed_casks(brew)?, list_outdated_casks(brew)?))
}

// ============================================================================
// plist / .app Scanner
// ============================================================================

const SCAN_DIRECTORIES: &[&str] = &["/Applications", "/System/Applications"];
const SCAN_MAX_DEPTH: usize = 3;

fn user_applications_dir() -> Option<PathBuf> {
    dirs_next::home_dir().map(|home| home.join("Applications"))
}

fn extract_app_metadata(app_path: &Path) -> Option<(String, String, String)> {
    let plist_path = app_path.join("Contents").join("Info.plist");
    let dict = plist::Value::from_file(&plist_path)
        .ok()?
        .into_dictionary()?;

    let read = |key: &str| -> Option<String> {
        dict.get(key)
            .and_then(|v| v.as_string())
            .map(|s| s.to_string())
    };

    let display_name = read("CFBundleDisplayName").or_else(|| read("CFBundleName"));
    let bundle_id = read("CFBundleIdentifier");
    let version = read("CFBundleShortVersionString").or_else(|| read("CFBundleVersion"));
    let name = display_name
        .or_else(|| {
            app_path
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "Unknown".to_string());
    Some((
        name,
        bundle_id.unwrap_or_else(|| "unknown".to_string()),
        version.unwrap_or_else(|| "—".to_string()),
    ))
}

fn scan_directory_raw(
    dir: &Path,
    is_system: bool,
) -> Vec<(String, String, String, String, String, bool, u64)> {
    let mut results = Vec::new();
    let mut queue = VecDeque::from([(dir.to_path_buf(), 0usize)]);

    while let Some((current_dir, depth)) = queue.pop_front() {
        let entries = match fs::read_dir(&current_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }

            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "app") {
                let real_path = match fs::canonicalize(&path) {
                    Ok(p) => p,
                    Err(_) => continue,
                };
                let install_path = real_path.to_string_lossy().to_string();
                let (name, bundle_id, version) = if let Some(m) = extract_app_metadata(&real_path) {
                    m
                } else {
                    let name = real_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown")
                        .to_string();
                    (name, "unknown".to_string(), "—".to_string())
                };
                let app_id = make_app_id(&bundle_id, &install_path);
                results.push((
                    app_id,
                    name,
                    bundle_id,
                    version,
                    install_path,
                    is_system,
                    get_last_modified(&real_path),
                ));
                continue;
            }

            if file_type.is_dir() && depth < SCAN_MAX_DEPTH {
                queue.push_back((path, depth + 1));
            }
        }
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
    let brew_available = brew.as_deref().map(brew_works).unwrap_or(false);
    let mut installed_casks = HashSet::new();
    let mut outdated_casks = HashSet::new();

    if brew_available {
        if let Some(ref brew_bin) = brew {
            if let Ok((casks, outdated)) = map_casks(brew_bin) {
                installed_casks = casks;
                outdated_casks = outdated;
            }
        }
    }

    let mut apps = Vec::new();

    for (app_id, name, bundle_id, version, install_path, is_system, last_modified) in raw {
        let has_mas_receipt = !is_system
            && crate::app_manager::sources::mac_app_store::has_mas_receipt(&install_path);

        let (
            source_type,
            source_id,
            source_confidence,
            can_upgrade,
            can_uninstall,
            upgrade_available,
        ) = if has_mas_receipt {
            (
                SourceType::AppStore,
                String::new(),
                1.0,
                false,
                false,
                false,
            )
        } else {
            let source = resolve_macos_source(
                &name,
                &bundle_id,
                is_system,
                &installed_casks,
                &outdated_casks,
            );
            (
                source.source_type,
                source.source_id,
                source.source_confidence,
                source.can_upgrade,
                source.can_uninstall,
                source.upgrade_available,
            )
        };

        apps.push(build_app_info(AppInfoInput {
            app_id,
            name,
            version,
            bundle_id,
            install_path,
            source_type,
            source_id,
            source_confidence,
            can_upgrade,
            can_uninstall,
            upgrade_available,
            last_modified,
            is_system_app: is_system,
            launchable: true,
            revealable: true,
        }));
    }

    apps = deduplicate(apps);

    build_scan_result(
        apps,
        platform_capabilities(brew_available, false, false, false, false),
        start.elapsed().as_millis() as u64,
        state.get_last_update_check_time(),
    )
}

#[cfg(test)]
mod scan_tests {
    use super::*;

    fn unique_temp_dir(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("bench-app-manager-{name}-{nanos}"))
    }

    fn write_info_plist(app_dir: &Path, bundle_id: &str, version: &str) {
        let contents_dir = app_dir.join("Contents");
        fs::create_dir_all(&contents_dir).expect("create contents dir");
        let plist = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Test App</string>
  <key>CFBundleIdentifier</key>
  <string>{bundle_id}</string>
  <key>CFBundleShortVersionString</key>
  <string>{version}</string>
</dict>
</plist>
"#
        );
        fs::write(contents_dir.join("Info.plist"), plist).expect("write plist");
    }

    #[test]
    fn scan_directory_raw_finds_nested_apps_outside_app_bundles() {
        let root = unique_temp_dir("nested");
        let nested_app = root.join("Vendor").join("Test.app");
        fs::create_dir_all(root.join("Vendor")).expect("create vendor dir");
        write_info_plist(&nested_app, "com.example.nested", "1.2.3");

        let results = scan_directory_raw(&root, false);
        let install_paths: Vec<String> = results.into_iter().map(|item| item.4).collect();

        assert_eq!(install_paths.len(), 1);
        assert!(Path::new(&install_paths[0]).ends_with(Path::new("Vendor").join("Test.app")));

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn scan_directory_raw_does_not_descend_into_app_bundles() {
        let root = unique_temp_dir("app-bundle");
        let outer_app = root.join("Outer.app");
        let inner_app = outer_app.join("Nested").join("Inner.app");
        write_info_plist(&outer_app, "com.example.outer", "1.0.0");
        write_info_plist(&inner_app, "com.example.inner", "2.0.0");

        let results = scan_directory_raw(&root, false);
        let bundle_ids: Vec<String> = results.into_iter().map(|item| item.2).collect();

        assert_eq!(bundle_ids, vec!["com.example.outer".to_string()]);

        fs::remove_dir_all(root).expect("cleanup");
    }
}

// ============================================================================
// launch / reveal (macOS)
// ============================================================================

pub fn launch_app(app_path: String) -> Result<(), String> {
    if !Path::new(&app_path).exists() {
        return Err(format!("Application not found: {}", app_path));
    }
    let status = Command::new("open")
        .arg(&app_path)
        .status()
        .map_err(|e| format!("Failed to launch: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("Launch exited with status: {}", status))
    }
}

pub fn reveal_app_in_finder(app_path: String) -> Result<(), String> {
    if !Path::new(&app_path).exists() {
        return Err(format!("Application not found: {}", app_path));
    }
    let status = Command::new("open")
        .arg("-R")
        .arg(&app_path)
        .status()
        .map_err(|e| format!("Failed to reveal: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("Reveal exited with status: {}", status))
    }
}

// ============================================================================
// update check (macOS)
// ============================================================================

pub fn check_updates(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> Result<Vec<String>, String> {
    let outdated = match brew_path() {
        Some(ref brew) => {
            list_outdated_casks(brew).map_err(|e| format!("brew outdated failed: {}", e))?
        }
        None => HashSet::new(),
    };
    let apps = state.apps.lock().unwrap_or_else(|e| e.into_inner());
    Ok(app_ids
        .into_iter()
        .filter(|id| {
            apps.iter().find(|a| &a.app_id == id).is_some_and(|a| {
                a.source_type == SourceType::HomebrewCask.to_string()
                    && outdated.contains(&a.source_id.to_lowercase())
            })
        })
        .collect())
}

// ============================================================================
// upgrade / uninstall (macOS)
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
        return Err("This application cannot be upgraded".to_string());
    }
    let brew = brew_path().ok_or("Homebrew is not available")?;
    let output = Command::new(&brew)
        .args(["upgrade", "--cask", &app.source_id])
        .output()
        .map_err(|e| format!("Failed to run brew upgrade: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stdout, stderr).trim().to_string();
    let success = output.status.success();

    Ok(record_operation_result(
        &state,
        "upgrade",
        &app.app_id,
        &app.name,
        success,
        &combined,
        if success {
            format!("Upgraded {}", app.name)
        } else {
            combined.clone()
        },
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
    if app.is_system_app {
        return Err("System applications cannot be uninstalled".into());
    }
    if !app.can_uninstall {
        return Err("This application cannot be uninstalled".into());
    }
    let brew = brew_path().ok_or("Homebrew is not available")?;
    let output = Command::new(&brew)
        .args(["uninstall", "--cask", &app.source_id])
        .output()
        .map_err(|e| format!("Failed to run brew uninstall: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stdout, stderr).trim().to_string();
    let success = output.status.success();

    Ok(record_operation_result(
        &state,
        "uninstall",
        &app.app_id,
        &app.name,
        success,
        &combined,
        if success {
            format!("Uninstalled {}", app.name)
        } else {
            combined.clone()
        },
        output.status.code(),
    ))
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
        .filter(|p| p.extension().is_some_and(|ext| ext == "icns"))
        .collect();
    icns_files.sort_by_key(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0));
    icns_files.pop()
}

fn resolve_finder_alias(path: &Path) -> Option<PathBuf> {
    if !path.is_file() {
        return None;
    }
    let path_str = path.to_string_lossy();
    let output = Command::new("osascript")
        .args([
            "-e",
            "on run argv",
            "-e",
            "tell application \"Finder\" to get POSIX path of (original item of (POSIX file (item 1 of argv) as alias))",
            "-e",
            "end run",
            "--",
            &path_str,
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
        resolve_finder_alias(app_path).ok_or("Cannot resolve Finder alias to real app bundle")?
    } else {
        app_path.to_path_buf()
    };

    let contents = app_path.join("Contents");

    if contents.exists() {
        let resources = contents.join("Resources");
        let source = resolve_macos_icon(&contents, &resources)?;
        return match source {
            IconSource::Icns(p) => icns_to_base64_png(install_path, &p),
            IconSource::Png(p) => png_to_base64(&p),
        };
    }

    let inner_app = resolve_ios_wrapped_bundle(&app_path).unwrap_or(app_path);
    let png = find_ios_app_icon_png(&inner_app)?;
    png_to_base64(&png)
}

enum IconSource {
    Icns(PathBuf),
    Png(PathBuf),
}

fn resolve_macos_icon(contents: &Path, resources: &Path) -> Result<IconSource, String> {
    // 1. Info.plist CFBundleIconFile (preferred per Apple spec)
    let icon_name = plist::Value::from_file(contents.join("Info.plist"))
        .ok()
        .and_then(|v| v.into_dictionary())
        .and_then(|mut d| d.remove("CFBundleIconFile"))
        .and_then(|v| v.into_string())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    if !icon_name.is_empty() {
        let p = resources.join(&icon_name);
        if p.exists() {
            return Ok(classify_icon_path(p));
        }
        let with_ext = resources.join(format!("{}.icns", icon_name));
        if with_ext.exists() {
            return Ok(IconSource::Icns(with_ext));
        }
    }
    // 2. Largest .icns in Resources/
    if let Some(p) = find_icns_in_resources(resources) {
        return Ok(IconSource::Icns(p));
    }
    // 3. AppIcon.iconset / AppIcon.appiconset directories (Xcode build output)
    for iconset in ["AppIcon.iconset", "AppIcon.appiconset"] {
        let dir = resources.join(iconset);
        if dir.is_dir() {
            if let Some(p) = find_largest_png_in_dir(&dir) {
                return Ok(IconSource::Png(p));
            }
        }
    }
    // 4. Bare PNG candidates (Electron / cross-platform apps without .icns)
    for name in ["AppIcon.png", "icon.png", "Icon.png", "app.png", "logo.png"] {
        let candidate = resources.join(name);
        if candidate.exists() {
            return Ok(IconSource::Png(candidate));
        }
    }
    Err("No icon file found in app bundle".into())
}

fn classify_icon_path(path: PathBuf) -> IconSource {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => IconSource::Png(path),
        _ => IconSource::Icns(path),
    }
}

fn find_largest_png_in_dir(dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    let mut pngs: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("png"))
        })
        .collect();
    pngs.sort_by_key(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0));
    pngs.pop()
}

fn resolve_ios_wrapped_bundle(app_path: &Path) -> Option<PathBuf> {
    let wrapper = app_path.join("Wrapper");
    if wrapper.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&wrapper) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().is_some_and(|ext| ext == "app") {
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
            return resolve_ios_wrapped_bundle(&resolved).or_else(|| {
                if resolved.exists() {
                    Some(resolved)
                } else {
                    None
                }
            });
        }
    }
    None
}

fn find_ios_app_icon_png(app_path: &Path) -> Result<PathBuf, String> {
    if !app_path.is_dir() {
        return Err("Not a valid iOS app bundle".into());
    }
    let read_dir =
        std::fs::read_dir(app_path).map_err(|e| format!("Cannot read app bundle: {}", e))?;
    let mut icons: Vec<PathBuf> = read_dir
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with("AppIcon") && n.ends_with(".png"))
        })
        .collect();
    if icons.is_empty() {
        return Err("No AppIcon PNG found in iOS app bundle".into());
    }
    icons.sort_by_key(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0));
    icons.pop().ok_or("No AppIcon found".into())
}

fn icns_to_base64_png(install_path: &str, icon_path: &Path) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let mut hasher = DefaultHasher::new();
    install_path.hash(&mut hasher);
    let temp_png = temp_dir.join(format!("bench_app_icon_{:x}.png", hasher.finish()));

    let output = Command::new("sips")
        .args([
            "-s",
            "format",
            "png",
            icon_path.to_str().ok_or("Invalid icon path")?,
            "--out",
            temp_png.to_str().ok_or("Invalid temp path")?,
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

// ============================================================================
// Install
// ============================================================================

pub fn install_app(
    app_id: String,
    install_source: crate::app_manager::InstallSource,
    state: tauri::State<'_, AppManagerState>,
) -> Result<crate::app_manager::OperationResult, String> {
    // Prefer brew install --cask
    if let Some(cask) = &install_source.brew {
        if let Some(brew) = find_brew() {
            let output = std::process::Command::new(brew)
                .args(["install", "--cask", cask])
                .output()
                .map_err(|e| format!("Failed to execute brew: {}", e))?;

            let success = output.status.success();
            let message = String::from_utf8_lossy(if success {
                &output.stdout
            } else {
                &output.stderr
            })
            .to_string();

            return Ok(record_operation_result_with_error_code(
                &state,
                "install",
                &app_id,
                &app_id,
                success,
                message.trim(),
                message.trim().to_string(),
                output.status.code(),
                Some("INSTALL_FAILED"),
            ));
        }
    }

    // Fallback: try to open download URL
    if let Some(url) = &install_source.url {
        let output = std::process::Command::new("open").arg(url).output();
        return match output {
            Ok(o) if o.status.success() => Ok(operation_result(
                true,
                format!("Opening download page: {}", url),
                o.status.code(),
                None,
                false,
            )),
            Ok(o) => {
                let stderr = String::from_utf8_lossy(&o.stderr);
                let msg = stderr.trim();
                Ok(operation_result(
                    false,
                    if msg.is_empty() {
                        format!("Failed to open URL: {}", url)
                    } else {
                        format!("Failed to open URL: {}", msg)
                    },
                    o.status.code(),
                    None,
                    false,
                ))
            }
            Err(e) => Ok(operation_result(
                false,
                format!("Failed to launch 'open': {}", e),
                None,
                None,
                false,
            )),
        };
    }

    Err("No suitable installation method available for this application".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn brew_works_returns_false_for_nonexistent_path() {
        // Regression #023: brew_path() only checked file existence, so a stale
        // symlink or non-Homebrew binary at one of BREW_PATHS used to be
        // reported as available, breaking later `brew list --cask` calls.
        assert!(!brew_works("/nonexistent/brew"));
    }

    #[test]
    fn brew_works_returns_false_for_non_brew_binary() {
        // `/bin/echo` is a well-known POSIX binary that exits successfully
        // but does NOT print "Homebrew", so the version-string probe must
        // reject it as a fake brew. Skip on systems without /bin/echo.
        if Path::new("/bin/echo").exists() {
            assert!(!brew_works("/bin/echo"));
        }
    }
}
