use crate::app_manager::{
    build_app_info, build_scan_result, deduplicate, get_last_modified, make_app_id,
    operation_result, platform_capabilities, record_operation_result, resolve_linux_source,
    AppInfo, AppInfoInput, AppManagerState, OperationResult, ScanResult,
};
use std::collections::HashSet;
use std::fs;
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

// ============================================================================
// Package Manager Detection
// ============================================================================

fn has_command(cmd: &str) -> bool {
    Command::new("which")
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn flatpak_available() -> bool {
    has_command("flatpak")
}
fn snap_available() -> bool {
    has_command("snap")
}
fn apt_available() -> bool {
    has_command("apt")
}

// ============================================================================
// Desktop Entry Parsing
// ============================================================================

const DESKTOP_ENTRY_DIRS: &[&str] = &["/usr/share/applications", "/usr/local/share/applications"];

fn user_desktop_entries_dir() -> Option<PathBuf> {
    dirs_next::data_dir().map(|d| d.join("applications"))
}

/// Parse a .desktop file for Name, Comment, Exec, Icon.
fn parse_desktop_entry(path: &Path) -> Option<(String, String, String, String)> {
    let content = fs::read_to_string(path).ok()?;
    let mut name = String::new();
    let mut localized_names: Vec<(String, String)> = Vec::new();
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
        if !in_desktop_entry {
            continue;
        }
        // Skip NoDisplay/Hidden entries
        if line.starts_with("NoDisplay=true") || line.starts_with("Hidden=true") {
            return None;
        }
        if let Some(val) = line.strip_prefix("Name=") {
            name = val.to_string();
        } else if let Some(rest) = line.strip_prefix("Name[") {
            // Name[zh_CN]=Value — collect locale variants for desktop_locale selection
            if let Some(close) = rest.find(']') {
                let locale = rest[..close].to_string();
                let after = &rest[close + 1..];
                if let Some(val) = after.strip_prefix('=') {
                    localized_names.push((locale, val.to_string()));
                }
            }
        } else if let Some(val) = line.strip_prefix("Comment=") {
            comment = val.to_string();
        } else if let Some(val) = line.strip_prefix("Exec=") {
            exec = val.to_string();
        } else if let Some(val) = line.strip_prefix("Icon=") {
            icon = val.to_string();
        }
    }

    if let Some(localized) = pick_localized_name(&localized_names, &name) {
        name = localized;
    }

    if name.is_empty() {
        return None;
    }
    Some((name, comment, exec, icon))
}

/// Select the best `Name[locale]` variant for the current LC_MESSAGES, falling
/// back through priorities: exact `lang_REGION` → `lang` → any `lang_*` →
/// base `Name=`. Per freedesktop Desktop Entry Specification §5.
fn pick_localized_name(localized: &[(String, String)], base: &str) -> Option<String> {
    if localized.is_empty() {
        return None;
    }
    let locale = current_desktop_locale();
    let locale_lower = locale.to_lowercase();
    let (lang, region) = match locale_lower.split_once('_') {
        Some((l, r)) => {
            let r = r.split('.').next().unwrap_or(r);
            let r = r.split('@').next().unwrap_or(r);
            (l.to_string(), Some(r.to_string()))
        }
        None => {
            let l = locale_lower
                .split('.')
                .next()
                .unwrap_or(&locale_lower)
                .split('@')
                .next()
                .unwrap_or(&locale_lower);
            (l.to_string(), None)
        }
    };

    // Priority 1: exact lang_REGION
    if let Some(region) = &region {
        let want = format!("{}_{}", lang, region.to_uppercase());
        let want_lower = want.to_lowercase();
        if let Some((_, v)) = localized
            .iter()
            .find(|(k, _)| k.to_lowercase() == want_lower)
        {
            return Some(v.clone());
        }
    }
    // Priority 2: lang only
    if let Some((_, v)) = localized.iter().find(|(k, _)| {
        k.to_lowercase() == lang
            || k.to_lowercase()
                .split_once('_')
                .is_some_and(|(l, _)| l == lang)
                && region.is_none()
    }) {
        return Some(v.clone());
    }
    // Priority 3: any lang_*
    if let Some((_, v)) = localized.iter().find(|(k, _)| {
        k.to_lowercase()
            .split_once('_')
            .is_some_and(|(l, _)| l == lang)
    }) {
        return Some(v.clone());
    }
    if base.is_empty() {
        return localized.first().map(|(_, v)| v.clone());
    }
    None
}

fn current_desktop_locale() -> String {
    for var in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        if let Ok(v) = std::env::var(var) {
            let v = v.trim();
            if !v.is_empty() && v != "C" && v != "POSIX" {
                return v.to_string();
            }
        }
    }
    String::new()
}

/// Expand and strip freedesktop Exec field codes per §6 of the Desktop Entry
/// Specification. `%%` becomes a literal `%`; field codes that would need a
/// file/url/icon (`%f %F %u %U %i %c %k`) and the deprecated `%d %D %n %N %v
/// %m` codes are dropped since the launcher has nothing to substitute.
fn expand_exec_field_codes(exec: &str) -> String {
    let mut out = String::with_capacity(exec.len());
    let mut chars = exec.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '%' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('%') => out.push('%'),
            // Drop substitution codes — no files/urls/icons to forward.
            Some('f') | Some('F') | Some('u') | Some('U') | Some('i') | Some('c') | Some('k')
            | Some('d') | Some('D') | Some('n') | Some('N') | Some('v') | Some('m') => {}
            // Unknown / future codes: drop the marker too, matching glib behaviour.
            Some(_) => {}
            None => {} // trailing `%` — drop
        }
    }
    out
}

/// Split a `.desktop` Exec line into argv per freedesktop spec §6. Honours
/// double-quoted strings with backslash escapes (`\\ \" \` \$`). Single
/// quotes have no special meaning in the spec. Returns Err for unterminated
/// quotes so the caller can refuse to launch a malformed entry rather than
/// silently truncating arguments.
fn split_exec_args(exec: &str) -> Result<Vec<String>, String> {
    let mut args: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut had_token = false;
    let mut chars = exec.chars().peekable();

    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '\\' {
                match chars.next() {
                    Some(next @ ('"' | '\\' | '`' | '$')) => current.push(next),
                    Some(other) => {
                        current.push('\\');
                        current.push(other);
                    }
                    None => return Err("trailing backslash in Exec".into()),
                }
                continue;
            }
            if c == '"' {
                in_quotes = false;
                continue;
            }
            current.push(c);
            continue;
        }

        if c.is_whitespace() {
            if had_token {
                args.push(std::mem::take(&mut current));
                had_token = false;
            }
            continue;
        }
        if c == '"' {
            in_quotes = true;
            had_token = true;
            continue;
        }
        if c == '\\' {
            if let Some(next) = chars.next() {
                current.push(next);
                had_token = true;
            }
            continue;
        }
        current.push(c);
        had_token = true;
    }

    if in_quotes {
        return Err("unterminated quote in Exec".into());
    }
    if had_token {
        args.push(current);
    }
    Ok(args)
}

/// Returns the cleaned Exec line as a single display string (for storage
/// alongside the parsed entry). Tokenisation for actual launching uses
/// [`split_exec_args`] on the same expanded string.
fn clean_exec(exec: &str) -> String {
    let s = expand_exec_field_codes(exec);
    s.split_whitespace().collect::<Vec<_>>().join(" ")
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
            if path.extension().is_none_or(|ext| ext != "desktop") {
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
    if !flatpak_available() {
        return apps;
    }
    if let Ok(output) = Command::new("flatpak")
        .args(["list", "--app", "--columns=name,application,version"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().skip(1) {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                apps.push((
                    parts[0].trim().to_string(),
                    parts[1].trim().to_string(),
                    parts
                        .get(2)
                        .map(|s| s.trim().to_string())
                        .unwrap_or_default(),
                ));
            }
        }
    }
    apps
}

fn list_snap_apps() -> Vec<(String, String, String)> {
    let mut apps = Vec::new();
    if !snap_available() {
        return apps;
    }
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
    if !apt_available() {
        return apps;
    }
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
                if section.contains("lib") || section.contains("devel") {
                    continue;
                }
                apps.push((
                    parts[0].to_string(),
                    parts[0].to_string(),
                    parts[1].to_string(),
                ));
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

    let mut apps = Vec::new();

    for (name, bundle_id, version, install_path, exec_path) in desktop_entries {
        let app_id = make_app_id(&bundle_id, &install_path);
        let last_modified = get_last_modified(Path::new(&install_path));

        let source = resolve_linux_source(
            &name,
            &bundle_id,
            &flatpak_apps,
            &snap_apps,
            &apt_packages,
            fp_available,
            sn_available,
            ap_available,
        );

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
            launchable: !exec_path.is_empty(),
            revealable: true,
        }));
    }

    apps = deduplicate(apps);

    build_scan_result(
        apps,
        platform_capabilities(false, false, fp_available, sn_available, ap_available),
        start.elapsed().as_millis() as u64,
        0,
    )
}

// ============================================================================
// launch / reveal (Linux)
// ============================================================================

/// Parse a .desktop file for launch fields (TryExec, Exec) from the
/// [Desktop Entry] section only. Action sections are ignored per
/// freedesktop.org Desktop Entry Specification §6.
fn parse_desktop_entry_for_launch(path: &Path) -> Option<(Option<String>, Option<String>)> {
    let content = fs::read_to_string(path).ok()?;
    let mut try_exec: Option<String> = None;
    let mut exec: Option<String> = None;
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
        if !in_desktop_entry {
            continue;
        }
        if let Some(val) = line.strip_prefix("TryExec=") {
            try_exec = Some(val.to_string());
        } else if let Some(val) = line.strip_prefix("Exec=") {
            if exec.is_none() {
                exec = Some(val.to_string());
            }
        }
    }
    Some((try_exec, exec))
}

pub fn launch_app(app_path: String) -> Result<(), String> {
    // Extract Exec line from desktop file and run it
    if app_path.ends_with(".desktop") {
        let path = Path::new(&app_path);
        let (try_exec, exec) = parse_desktop_entry_for_launch(path)
            .ok_or_else(|| "Failed to read desktop entry".to_string())?;

        // Per XDG Desktop Entry Specification: if TryExec is set and the
        // referenced binary is not in PATH, the entry should be considered
        // not installed and the launcher must not invoke Exec.
        if let Some(try_exec) = try_exec.as_deref() {
            let try_exec = try_exec.trim();
            if !try_exec.is_empty() && !try_exec_resolves(try_exec) {
                return Err(format!("TryExec not found in PATH: {}", try_exec));
            }
        }

        let exec = exec.ok_or_else(|| "No Exec= in [Desktop Entry] section".to_string())?;
        // Per freedesktop §6: substitute field codes BEFORE shell-style
        // tokenisation so a value like `Exec="/opt/foo bar/app" %U` still
        // launches a path with a space rather than splitting on it.
        let expanded = expand_exec_field_codes(&exec);
        let parts = split_exec_args(&expanded)
            .map_err(|e| format!("Failed to parse Exec field: {}", e))?;
        if parts.is_empty() {
            return Err("Empty exec in desktop entry".into());
        }
        let mut command = Command::new(&parts[0]);
        for arg in &parts[1..] {
            command.arg(arg);
        }
        return spawn_detached(command);
    }
    // Fallback to xdg-open
    spawn_detached({
        let mut c = Command::new("xdg-open");
        c.arg(&app_path);
        c
    })
}

/// Launch `command` as a detached child: its stdio is redirected to /dev/null
/// and `setsid` makes it the leader of a new session, so the parent (this
/// process) never blocks waiting on it and the GUI app survives if we exit.
fn spawn_detached(mut command: Command) -> Result<(), String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // SAFETY: `setsid` is async-signal-safe; no allocation/locks are taken
    // between fork and exec.
    #[cfg(unix)]
    unsafe {
        command.pre_exec(|| {
            extern "C" {
                fn setsid() -> i32;
            }
            if setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to launch: {}", e))
}

/// Resolve a TryExec entry against PATH. Accepts absolute paths (must exist
/// and be executable) or bare binaries (must be reachable via `which`).
fn try_exec_resolves(value: &str) -> bool {
    let path = Path::new(value);
    if path.is_absolute() {
        return path.exists();
    }
    has_command(value)
}

pub fn reveal_in_file_manager(app_path: String) -> Result<(), String> {
    let parent = Path::new(&app_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(app_path.clone());

    // Try gio first (GNOME), then xdg-open
    if has_command("gio") {
        let status = Command::new("gio")
            .args(["open", &parent])
            .status()
            .map_err(|e| format!("Failed: {}", e))?;
        if status.success() {
            return Ok(());
        }
    }
    let status = Command::new("xdg-open")
        .arg(&parent)
        .status()
        .map_err(|e| format!("Failed to reveal: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err("Reveal failed".into())
    }
}

// ============================================================================
// update check (Linux)
// ============================================================================

pub fn check_updates(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> Result<Vec<String>, String> {
    let apps = state.apps.lock().unwrap_or_else(|e| e.into_inner());

    let mut updatable_ids: HashSet<String> = HashSet::new();
    let mut errors: Vec<String> = Vec::new();

    if flatpak_available() {
        match Command::new("flatpak")
            .args(["remote-ls", "--updates", "--app"])
            .output()
        {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if let Some(id) = line.split_whitespace().next() {
                        updatable_ids.insert(id.to_lowercase());
                    }
                }
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                errors.push(format!("flatpak: {}", stderr));
            }
            Err(e) => errors.push(format!("flatpak: {}", e)),
        }
    }

    if snap_available() {
        match Command::new("snap").args(["refresh", "--list"]).output() {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines().skip(1) {
                    if let Some(name) = line.split_whitespace().next() {
                        updatable_ids.insert(name.to_lowercase());
                    }
                }
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                errors.push(format!("snap: {}", stderr));
            }
            Err(e) => errors.push(format!("snap: {}", e)),
        }
    }

    if !errors.is_empty() && updatable_ids.is_empty() {
        return Err(errors.join("; "));
    }

    Ok(app_ids
        .into_iter()
        .filter(|id| {
            apps.iter().find(|a| &a.app_id == id).is_some_and(|a| {
                updatable_ids.contains(&a.source_id.to_lowercase())
            })
        })
        .collect())
}

// ============================================================================
// upgrade / uninstall (Linux)
// ============================================================================

fn do_upgrade_linux(app: &AppInfo) -> Result<(bool, String, Option<i32>), String> {
    match app.source_type.as_str() {
        "Flatpak" => {
            let output = Command::new("flatpak")
                .args(["update", "-y", &app.source_id])
                .output()
                .map_err(|e| format!("flatpak update failed: {}", e))?;
            let combined = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            )
            .trim()
            .to_string();
            Ok((output.status.success(), combined, output.status.code()))
        }
        "Snap" => {
            let output = Command::new("snap")
                .args(["refresh", &app.source_id])
                .output()
                .map_err(|e| format!("snap refresh failed: {}", e))?;
            let combined = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            )
            .trim()
            .to_string();
            Ok((output.status.success(), combined, output.status.code()))
        }
        "APT" => {
            let output = Command::new("sudo")
                .args([
                    "-n",
                    "apt-get",
                    "install",
                    "--only-upgrade",
                    "-y",
                    &app.source_id,
                ])
                .output()
                .map_err(|e| format!("apt upgrade failed: {}", e))?;
            let combined = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            )
            .trim()
            .to_string();
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
                .output()
                .map_err(|e| format!("flatpak uninstall failed: {}", e))?;
            let combined = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            )
            .trim()
            .to_string();
            Ok((output.status.success(), combined, output.status.code()))
        }
        "Snap" => {
            let output = Command::new("snap")
                .args(["remove", &app.source_id])
                .output()
                .map_err(|e| format!("snap remove failed: {}", e))?;
            let combined = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            )
            .trim()
            .to_string();
            Ok((output.status.success(), combined, output.status.code()))
        }
        "APT" => {
            let output = Command::new("sudo")
                .args(["-n", "apt-get", "remove", "-y", &app.source_id])
                .output()
                .map_err(|e| format!("apt remove failed: {}", e))?;
            let combined = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            )
            .trim()
            .to_string();
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
        let apps = state.apps.lock().unwrap_or_else(|e| e.into_inner());
        apps.iter()
            .find(|a| a.app_id == app_id)
            .cloned()
            .ok_or_else(|| "Application not found".to_string())?
    };
    if !app.can_upgrade {
        return Err("Cannot upgrade".into());
    }

    let (success, output, exit_code) = do_upgrade_linux(&app)?;
    Ok(record_operation_result(
        &state,
        "upgrade",
        &app.app_id,
        &app.name,
        success,
        &output,
        output.clone(),
        exit_code,
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

    let (success, output, exit_code) = do_uninstall_linux(&app)?;
    Ok(record_operation_result(
        &state,
        "uninstall",
        &app.app_id,
        &app.name,
        success,
        &output,
        output.clone(),
        exit_code,
    ))
}

// ============================================================================
// Install (Linux via flatpak/snap/apt)
// ============================================================================

pub fn install_app(
    app_id: String,
    install_source: crate::app_manager::InstallSource,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    // Prefer flatpak
    if let Some(flatpak_id) = &install_source.flatpak {
        if flatpak_available() {
            let output = Command::new("flatpak")
                .args(["install", "--noninteractive", "-y", "flathub", flatpak_id])
                .output()
                .map_err(|e| format!("flatpak install failed: {}", e))?;
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

    // Prefer snap
    if let Some(snap_name) = &install_source.snap {
        if snap_available() {
            let output = Command::new("snap")
                .args(["install", snap_name])
                .output()
                .map_err(|e| format!("snap install failed: {}", e))?;
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

    // Prefer apt
    if let Some(apt_pkg) = &install_source.apt {
        if apt_available() {
            let output = Command::new("sudo")
                .args(["-n", "apt", "install", "-y", apt_pkg])
                .output()
                .map_err(|e| format!("apt install failed: {}", e))?;
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

    // Fallback: open download URL with xdg-open
    if let Some(url) = &install_source.url {
        let _ = Command::new("xdg-open").arg(url).status();
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

#[cfg(test)]
mod tests {
    use super::*;

    fn write_temp_desktop(name: &str, body: &str) -> PathBuf {
        let path = std::env::temp_dir().join(name);
        fs::write(&path, body).expect("write desktop file");
        path
    }

    #[test]
    fn parse_desktop_entry_for_launch_extracts_try_exec_and_exec() {
        let path = write_temp_desktop(
            "tauri_test_launch_a.desktop",
            "[Desktop Entry]\nName=A\nTryExec=/usr/bin/ls\nExec=ls -la\n",
        );
        let (try_exec, exec) = parse_desktop_entry_for_launch(&path).unwrap();
        assert_eq!(try_exec.as_deref(), Some("/usr/bin/ls"));
        assert_eq!(exec.as_deref(), Some("ls -la"));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn parse_desktop_entry_for_launch_ignores_action_section_exec() {
        // Action section Exec should be ignored when [Desktop Entry] has none
        let path = write_temp_desktop(
            "tauri_test_launch_b.desktop",
            "[Desktop Entry]\nName=B\n\n[Desktop Action Open]\nName=Open\nExec=other-binary\n",
        );
        let (try_exec, exec) = parse_desktop_entry_for_launch(&path).unwrap();
        assert!(try_exec.is_none());
        assert!(
            exec.is_none(),
            "Exec from [Desktop Action] section must not leak into the main entry"
        );
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn parse_desktop_entry_for_launch_takes_first_exec_in_desktop_entry() {
        let path = write_temp_desktop(
            "tauri_test_launch_c.desktop",
            "[Desktop Entry]\nName=C\nExec=primary %U\nExec=secondary\n",
        );
        let (_, exec) = parse_desktop_entry_for_launch(&path).unwrap();
        assert_eq!(exec.as_deref(), Some("primary %U"));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn try_exec_resolves_absolute_path_existence() {
        assert!(try_exec_resolves("/bin/sh"));
        assert!(!try_exec_resolves("/this/path/does/not/exist/abcxyz"));
    }

    #[test]
    fn expand_exec_field_codes_drops_substitution_placeholders() {
        // Regression #018: %i %D %n %v were not stripped, causing `--icon %i`
        // to reach the child process as a literal argument.
        assert_eq!(expand_exec_field_codes("foo %f %U %i %c"), "foo    ");
        assert_eq!(expand_exec_field_codes("foo %D %n %v %m %N"), "foo     ");
    }

    #[test]
    fn expand_exec_field_codes_escapes_double_percent() {
        // Per spec: %% in Exec must be substituted with a literal %.
        assert_eq!(expand_exec_field_codes("100%%"), "100%");
    }

    #[test]
    fn split_exec_args_handles_quoted_paths() {
        // Regression #019: split_whitespace cut "/opt/dir with space/app" at
        // the first space, so the binary couldn't be located.
        let parts =
            split_exec_args(r#""/opt/dir with space/app" --foo "bar baz""#).expect("parse ok");
        assert_eq!(
            parts,
            vec![
                "/opt/dir with space/app".to_string(),
                "--foo".to_string(),
                "bar baz".to_string(),
            ]
        );
    }

    #[test]
    fn split_exec_args_handles_backslash_escapes_in_quotes() {
        let parts =
            split_exec_args(r#""a\"b" "c\\d" "e\$f""#).expect("parse ok");
        assert_eq!(
            parts,
            vec![
                "a\"b".to_string(),
                "c\\d".to_string(),
                "e$f".to_string(),
            ]
        );
    }

    #[test]
    fn split_exec_args_rejects_unterminated_quote() {
        assert!(split_exec_args(r#"foo "bar"#).is_err());
    }

    #[test]
    fn pick_localized_name_prefers_exact_region_then_lang() {
        // Regression #020: the parser silently used `Name=` even when the
        // user's locale had a matching `Name[zh_CN]=` variant.
        let entries = vec![
            ("zh_CN".into(), "微信".into()),
            ("zh_TW".into(), "微信(臺)".into()),
            ("ja".into(), "ウィーチャット".into()),
        ];

        // Save and restore locale env so we don't leak state across tests.
        let original = std::env::var("LC_ALL").ok();
        // SAFETY: only this test (single-threaded by default in cargo test
        // unless --test-threads > 1) touches the variable; it's restored
        // immediately. Tests run with --test-threads=1 in our CI config.
        unsafe {
            std::env::set_var("LC_ALL", "zh_CN.UTF-8");
        }
        let v = pick_localized_name(&entries, "WeChat");
        assert_eq!(v.as_deref(), Some("微信"));

        unsafe {
            std::env::set_var("LC_ALL", "zh_HK.UTF-8");
        }
        // Falls back to any zh_* when neither exact lang_REGION nor bare lang
        // is available — picks the first zh_* in declaration order.
        let v = pick_localized_name(&entries, "WeChat");
        assert!(matches!(v.as_deref(), Some("微信") | Some("微信(臺)")));

        // Restore
        unsafe {
            match original {
                Some(v) => std::env::set_var("LC_ALL", v),
                None => std::env::remove_var("LC_ALL"),
            }
        }
    }
}
