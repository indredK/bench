use crate::app_manager::types::{LaunchTarget, ProviderState, ProviderStatus, SourceEvidence};
use crate::app_manager::{
    build_app_info, build_scan_result, deduplicate, get_last_modified, make_app_id,
    operation_result, platform_capabilities, record_operation_result, resolve_windows_product_code,
    resolve_windows_source, run_command_with_timeout_and_cancel, AppInfoInput, AppManagerState,
    OperationResult, ScanResult, SourceType,
};
use serde::Deserialize;
use std::collections::HashSet;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

const WINDOWS_DISCOVERY_TIMEOUT: Duration = Duration::from_secs(60);
const PACKAGE_OPERATION_TIMEOUT: Duration = Duration::from_secs(30 * 60);

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
    available_start: Option<usize>,
    source_start: Option<usize>,
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
            available_start: header.find("Available"),
            source_start: header.find("Source"),
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
fn list_winget_packages(
    winget: &str,
    cancel: Option<&AtomicBool>,
) -> Result<Vec<(String, String, Option<String>)>, String> {
    if let Ok(output) = run_command_with_timeout_and_cancel(
        Command::new(winget).args([
            "list",
            "--output",
            "json",
            "--accept-source-agreements",
            "--disable-interactivity",
        ]),
        WINDOWS_DISCOVERY_TIMEOUT,
        cancel,
    ) {
        if output.status.success() {
            if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                return Ok(parse_winget_packages_json(&value));
            }
        }
    }
    let output = run_command_with_timeout_and_cancel(
        Command::new(winget).args(["list", "--accept-source-agreements"]),
        WINDOWS_DISCOVERY_TIMEOUT,
        cancel,
    )
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
            packages.push((name, id, None));
        }
    }
    Ok(packages)
}

fn parse_winget_packages_json(value: &serde_json::Value) -> Vec<(String, String, Option<String>)> {
    fn visit(value: &serde_json::Value, output: &mut Vec<(String, String, Option<String>)>) {
        match value {
            serde_json::Value::Array(items) => {
                for item in items {
                    visit(item, output);
                }
            }
            serde_json::Value::Object(object) => {
                let read = |keys: &[&str]| {
                    keys.iter()
                        .find_map(|key| object.get(*key).and_then(|value| value.as_str()))
                };
                if let (Some(name), Some(id)) = (
                    read(&["Name", "PackageName"]),
                    read(&["PackageIdentifier", "PackageId", "Id"]),
                ) {
                    let install_location = read(&[
                        "InstallLocation",
                        "InstalledLocation",
                        "InstallPath",
                        "Location",
                    ])
                    .map(str::to_string);
                    output.push((name.to_string(), id.to_string(), install_location));
                }
                for child in object.values() {
                    visit(child, output);
                }
            }
            _ => {}
        }
    }

    let mut packages = Vec::new();
    visit(value, &mut packages);
    packages.sort();
    packages.dedup();
    packages
}

fn list_winget_upgradable(
    winget: &str,
    cancel: Option<&AtomicBool>,
) -> Result<Vec<String>, String> {
    list_winget_updates(winget, cancel).map(|updates| {
        updates
            .into_iter()
            .map(|(id, _, _)| id.to_lowercase())
            .collect()
    })
}

fn list_winget_updates(
    winget: &str,
    cancel: Option<&AtomicBool>,
) -> Result<Vec<(String, String, String)>, String> {
    let json_output = run_command_with_timeout_and_cancel(
        Command::new(winget).args([
            "upgrade",
            "--output",
            "json",
            "--accept-source-agreements",
            "--disable-interactivity",
        ]),
        WINDOWS_DISCOVERY_TIMEOUT,
        cancel,
    );
    if let Ok(output) = json_output {
        if output.status.success() {
            if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                return Ok(parse_winget_updates_json(&value));
            }
        }
    }

    let output = run_command_with_timeout_and_cancel(
        Command::new(winget).args([
            "upgrade",
            "--accept-source-agreements",
            "--disable-interactivity",
        ]),
        WINDOWS_DISCOVERY_TIMEOUT,
        cancel,
    )
    .map_err(|error| format!("winget upgrade list failed: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "winget upgrade list failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let (columns, data) = find_winget_table(&stdout)
        .ok_or_else(|| "WINDOWS_WINGET_OUTPUT_UNSUPPORTED".to_string())?;
    let version_start = columns
        .version_start
        .ok_or_else(|| "WINDOWS_WINGET_VERSION_COLUMN_MISSING".to_string())?;
    let available_start = columns
        .available_start
        .ok_or_else(|| "WINDOWS_WINGET_VERSION_COLUMN_MISSING".to_string())?;
    let mut updates = Vec::new();
    for line in data {
        if line.trim().is_empty() {
            continue;
        }
        let id = slice_byte_range(line, columns.id_start, version_start).trim();
        let current = slice_byte_range(line, version_start, available_start).trim();
        let latest = slice_byte_range(
            line,
            available_start,
            columns.source_start.unwrap_or(line.len()),
        )
        .trim();
        if !id.is_empty() && !current.is_empty() && !latest.is_empty() {
            updates.push((id.to_string(), current.to_string(), latest.to_string()));
        }
    }
    Ok(updates)
}

fn parse_winget_updates_json(value: &serde_json::Value) -> Vec<(String, String, String)> {
    fn visit(value: &serde_json::Value, output: &mut Vec<(String, String, String)>) {
        match value {
            serde_json::Value::Array(items) => {
                for item in items {
                    visit(item, output);
                }
            }
            serde_json::Value::Object(object) => {
                let read = |keys: &[&str]| {
                    keys.iter()
                        .find_map(|key| object.get(*key).and_then(|value| value.as_str()))
                };
                if let (Some(id), Some(current), Some(latest)) = (
                    read(&["PackageIdentifier", "PackageId", "Id"]),
                    read(&["InstalledVersion", "Version"]),
                    read(&["AvailableVersion", "LatestVersion"]),
                ) {
                    output.push((id.to_string(), current.to_string(), latest.to_string()));
                }
                for child in object.values() {
                    visit(child, output);
                }
            }
            _ => {}
        }
    }

    let mut updates = Vec::new();
    visit(value, &mut updates);
    updates.sort();
    updates.dedup();
    updates
}

// ============================================================================
// Registry-based App Discovery (Uninstall keys)
// ============================================================================

#[derive(Debug, Deserialize)]
struct RegistryApp {
    #[serde(rename = "registryKey")]
    registry_key: String,
    #[serde(rename = "displayName")]
    display_name: String,
    #[serde(default, rename = "displayVersion")]
    display_version: String,
    #[serde(default, rename = "installLocation")]
    install_location: String,
    #[serde(default, rename = "displayIcon")]
    display_icon: String,
    #[serde(default, rename = "releaseType")]
    release_type: String,
    #[serde(default, rename = "productCode")]
    product_code: String,
    #[serde(default, rename = "uninstallString")]
    uninstall_string: String,
    #[serde(default, rename = "quietUninstallString")]
    quiet_uninstall_string: String,
}

#[derive(Debug, Clone, Deserialize)]
struct StartApp {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "AppID")]
    app_id: String,
}

fn run_powershell_json(
    script: &str,
    cancel: Option<&AtomicBool>,
) -> Result<serde_json::Value, String> {
    let output = run_command_with_timeout_and_cancel(
        Command::new("powershell.exe").args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        ]),
        WINDOWS_DISCOVERY_TIMEOUT,
        cancel,
    )
    .map_err(|error| format!("powershell spawn failed: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(stdout.trim()).map_err(|error| format!("powershell JSON failed: {error}"))
}

fn query_registry_uninstall(cancel: Option<&AtomicBool>) -> Result<Vec<RegistryApp>, String> {
    let script = r#"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$paths = @(
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$items = Get-ItemProperty -Path $paths -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -and $_.SystemComponent -ne 1 } |
  ForEach-Object {
    [PSCustomObject]@{
      registryKey = $_.PSPath
      displayName = [string]$_.DisplayName
      displayVersion = [string]$_.DisplayVersion
      installLocation = [string]$_.InstallLocation
      displayIcon = [string]$_.DisplayIcon
      releaseType = [string]$_.ReleaseType
      productCode = [string]$_.PSChildName
      uninstallString = [string]$_.UninstallString
      quietUninstallString = [string]$_.QuietUninstallString
    }
  }
@($items) | ConvertTo-Json -Compress -Depth 3
"#;
    let value = run_powershell_json(script, cancel)?;
    if value.is_null() {
        return Ok(Vec::new());
    }
    if value.is_array() {
        serde_json::from_value(value).map_err(|error| format!("registry JSON failed: {error}"))
    } else {
        serde_json::from_value(value)
            .map(|entry| vec![entry])
            .map_err(|error| format!("registry JSON failed: {error}"))
    }
}

fn normalize_name(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn is_valid_product_code(value: &str) -> bool {
    let value = value.trim();
    if value.len() != 38 || !value.starts_with('{') || !value.ends_with('}') {
        return false;
    }
    let body = &value[1..value.len() - 1];
    body.len() == 36
        && body
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn has_msi_uninstall_command(entry: &RegistryApp) -> bool {
    [&entry.quiet_uninstall_string, &entry.uninstall_string]
        .iter()
        .any(|command| {
            let lower = command.to_ascii_lowercase();
            lower.contains("msiexec") && lower.contains(&entry.product_code.to_ascii_lowercase())
        })
}

fn parse_display_icon(raw: &str) -> Option<String> {
    let value = raw.trim().trim_matches('"');
    let path = value.split(',').next()?.trim().trim_matches('"');
    if path.is_empty() {
        return None;
    }
    let expanded = path
        .replace(
            "%ProgramFiles%",
            &std::env::var("ProgramFiles").unwrap_or_default(),
        )
        .replace(
            "%ProgramFiles(x86)%",
            &std::env::var("ProgramFiles(x86)").unwrap_or_default(),
        )
        .replace(
            "%LOCALAPPDATA%",
            &std::env::var("LOCALAPPDATA").unwrap_or_default(),
        );
    Some(expanded)
}

fn find_executable(entry: &RegistryApp) -> Option<String> {
    let icon = parse_display_icon(&entry.display_icon);
    if let Some(path) = icon
        .as_deref()
        .filter(|path| path.to_ascii_lowercase().ends_with(".exe") && Path::new(path).is_file())
    {
        return Some(path.to_string());
    }
    let root = Path::new(entry.install_location.trim());
    if root.is_file()
        && root
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
    {
        return Some(root.to_string_lossy().to_string());
    }
    if !root.is_dir() {
        return None;
    }
    let normalized = normalize_name(&entry.display_name);
    let mut candidates = Vec::new();
    for item in std::fs::read_dir(root).ok()?.flatten() {
        let path = item.path();
        if path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
        {
            let stem = normalize_name(path.file_stem()?.to_string_lossy().as_ref());
            if stem == normalized && !stem.contains("uninstall") && !stem.contains("setup") {
                candidates.push(path);
            }
        }
    }
    candidates.sort();
    candidates
        .first()
        .map(|path| path.to_string_lossy().to_string())
}

fn query_start_apps(cancel: Option<&AtomicBool>) -> Result<Vec<StartApp>, String> {
    let script = r#"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
@(Get-StartApps | Where-Object { $_.Name -and $_.AppID }) | ConvertTo-Json -Compress -Depth 2
"#;
    let value = run_powershell_json(script, cancel)?;
    if value.is_null() {
        return Ok(Vec::new());
    }
    if value.is_array() {
        serde_json::from_value(value).map_err(|error| format!("start apps JSON failed: {error}"))
    } else {
        serde_json::from_value(value)
            .map(|entry| vec![entry])
            .map_err(|error| format!("start apps JSON failed: {error}"))
    }
}

// ============================================================================
// scan_installed_apps (Windows)
// ============================================================================

pub fn scan_installed_apps(cancel: &AtomicBool) -> ScanResult {
    let start = std::time::Instant::now();

    let (registry_entries, registry_ok) = match query_registry_uninstall(Some(cancel)) {
        Ok(entries) => (entries, true),
        Err(_) => (Vec::new(), false),
    };
    let (start_apps, start_apps_ok) = match query_start_apps(Some(cancel)) {
        Ok(entries) => (entries, true),
        Err(_) => (Vec::new(), false),
    };

    let winget = winget_path();
    let winget_available = winget.is_some();

    // Collect winget data
    let mut winget_packages: Vec<(String, String, Option<String>)> = Vec::new();
    let mut upgradable_ids: HashSet<String> = HashSet::new();
    let mut winget_scan_ok = true;

    if let Some(ref wg) = winget {
        match list_winget_packages(wg, Some(cancel)) {
            Ok(packages) => winget_packages = packages,
            Err(_) => winget_scan_ok = false,
        }
        match list_winget_upgradable(wg, Some(cancel)) {
            Ok(upgradable) => upgradable_ids = upgradable.into_iter().collect(),
            Err(_) => winget_scan_ok = false,
        }
    }

    let mut apps = Vec::new();

    for entry in registry_entries {
        if entry.display_name.is_empty()
            || entry.release_type.eq_ignore_ascii_case("update")
            || entry.release_type.eq_ignore_ascii_case("hotfix")
        {
            continue;
        }

        let executable = find_executable(&entry);
        let install_path = executable
            .clone()
            .or_else(|| {
                (!entry.install_location.trim().is_empty())
                    .then(|| entry.install_location.trim().to_string())
            })
            .unwrap_or_default();
        let install_exists = !install_path.is_empty() && Path::new(&install_path).exists();

        // Registry key is a stronger and more stable identity than a display
        // name or a guessed Program Files directory.
        let bundle_id = format!("windows:registry:{}", entry.registry_key);

        let app_id = make_app_id(&bundle_id, &install_path);
        let last_modified = get_last_modified(Path::new(&install_path));

        let source =
            if is_valid_product_code(&entry.product_code) && has_msi_uninstall_command(&entry) {
                resolve_windows_product_code(entry.product_code.clone())
            } else {
                resolve_windows_source(
                    &entry.display_name,
                    &bundle_id,
                    entry.install_location.trim(),
                    &winget_packages,
                    &upgradable_ids,
                )
            };

        let ver = if entry.display_version.is_empty() {
            "—".into()
        } else {
            entry.display_version
        };

        apps.push(build_app_info(AppInfoInput {
            app_id,
            name: entry.display_name,
            version: ver,
            bundle_id,
            install_path: install_path.clone(),
            source_type: source.source_type,
            source_id: source.source_id,
            source_confidence: source.source_confidence,
            source_evidence: source.source_evidence,
            can_upgrade: source.can_upgrade,
            can_uninstall: source.can_uninstall,
            upgrade_available: source.upgrade_available,
            last_modified,
            is_system_app: false,
            launchable: install_exists,
            revealable: install_exists,
            launch_target: executable.map(|path| LaunchTarget::Executable {
                path,
                args: Vec::new(),
            }),
        }));
    }

    // winget's own inventory is authoritative for package operations even
    // when no safe correlation to an ARP/registry launch record exists. Keep
    // such packages as management-only records instead of granting an
    // unrelated same-name registry record destructive capabilities.
    let mut represented_package_ids: HashSet<String> = apps
        .iter()
        .filter(|app| app.source_evidence == SourceEvidence::ExactPackageId)
        .map(|app| app.source_id.to_ascii_lowercase())
        .collect();
    for (name, package_id, package_install_path) in &winget_packages {
        if represented_package_ids.contains(&package_id.to_ascii_lowercase()) {
            continue;
        }
        represented_package_ids.insert(package_id.to_ascii_lowercase());
        let install_path = package_install_path.clone().unwrap_or_default();
        let install_exists = !install_path.is_empty() && Path::new(&install_path).exists();
        let bundle_id = format!("windows:winget:{package_id}");
        apps.push(build_app_info(AppInfoInput {
            app_id: make_app_id(&bundle_id, &install_path),
            name: name.clone(),
            version: "—".to_string(),
            bundle_id,
            install_path: install_path.clone(),
            source_type: SourceType::Winget,
            source_id: package_id.clone(),
            source_confidence: 1.0,
            source_evidence: SourceEvidence::ExactPackageId,
            can_upgrade: true,
            can_uninstall: true,
            upgrade_available: upgradable_ids.contains(&package_id.to_ascii_lowercase()),
            last_modified: get_last_modified(Path::new(&install_path)),
            is_system_app: false,
            launchable: false,
            revealable: install_exists,
            launch_target: None,
        }));
    }

    let known_names: HashSet<String> = apps
        .iter()
        .filter(|app| app.allowed_actions.launch)
        .map(|app| normalize_name(&app.name))
        .collect();
    for entry in start_apps {
        if entry.app_id.trim().is_empty() || known_names.contains(&normalize_name(&entry.name)) {
            continue;
        }
        let bundle_id = format!("windows:aumid:{}", entry.app_id);
        let app_id = make_app_id(&bundle_id, "");
        apps.push(build_app_info(AppInfoInput {
            app_id,
            name: entry.name,
            version: "—".to_string(),
            bundle_id,
            install_path: String::new(),
            source_type: if entry.app_id.contains('!') {
                SourceType::WindowsStore
            } else {
                SourceType::Unknown
            },
            source_id: entry.app_id.clone(),
            source_confidence: 1.0,
            source_evidence: SourceEvidence::ExactPackageId,
            can_upgrade: false,
            can_uninstall: false,
            upgrade_available: false,
            last_modified: 0,
            is_system_app: false,
            launchable: true,
            revealable: false,
            launch_target: Some(LaunchTarget::Aumid {
                value: entry.app_id,
            }),
        }));
    }

    apps = deduplicate(apps);

    let mut result = build_scan_result(
        apps,
        platform_capabilities(false, winget_available, false, false, false),
        start.elapsed().as_millis() as u64,
        0,
    );
    result.providers = vec![
        ProviderStatus {
            provider: "registry".to_string(),
            state: if registry_ok {
                ProviderState::Ok
            } else {
                ProviderState::Failed
            },
            error_code: (!registry_ok).then(|| "WINDOWS_REGISTRY_SCAN_FAILED".to_string()),
        },
        ProviderStatus {
            provider: "appsFolder".to_string(),
            state: if start_apps_ok {
                ProviderState::Ok
            } else {
                ProviderState::Partial
            },
            error_code: (!start_apps_ok).then(|| "WINDOWS_START_APPS_SCAN_FAILED".to_string()),
        },
        ProviderStatus {
            provider: "winget".to_string(),
            state: if !winget_available {
                ProviderState::Unsupported
            } else if winget_scan_ok {
                ProviderState::Ok
            } else {
                ProviderState::Partial
            },
            error_code: if !winget_available {
                Some("WINDOWS_WINGET_UNAVAILABLE".to_string())
            } else if !winget_scan_ok {
                Some("WINDOWS_WINGET_SCAN_PARTIAL".to_string())
            } else {
                None
            },
        },
    ];
    result.complete = registry_ok && start_apps_ok && (!winget_available || winget_scan_ok);
    result
}

// ============================================================================
// launch / reveal (Windows)
// ============================================================================

pub fn launch_app(app: &crate::app_manager::types::AppInfo) -> Result<(), String> {
    let Some(target) = app.launch_target.as_ref() else {
        return Err("APP_NOT_LAUNCHABLE".into());
    };
    match target {
        LaunchTarget::Executable { path, args } => {
            if !Path::new(path).is_file() {
                return Err("APP_LAUNCH_TARGET_MISSING".into());
            }
            Command::new(path)
                .args(args)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("APP_LAUNCH_FAILED: {error}"))
        }
        LaunchTarget::Aumid { value } => Command::new("explorer.exe")
            .arg(format!("shell:AppsFolder\\{value}"))
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("APP_LAUNCH_FAILED: {error}")),
        _ => Err("APP_LAUNCH_TARGET_UNSUPPORTED".into()),
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

pub fn get_app_icon_base64(app: &crate::app_manager::types::AppInfo) -> Result<String, String> {
    let icon_path = match app.launch_target.as_ref() {
        Some(LaunchTarget::Executable { path, .. }) => path.as_str(),
        _ if Path::new(&app.install_path).is_file() => app.install_path.as_str(),
        _ => return Err("WINDOWS_ICON_SOURCE_UNAVAILABLE".to_string()),
    };
    if !Path::new(icon_path).is_file() {
        return Err("WINDOWS_ICON_SOURCE_MISSING".to_string());
    }

    // Pass the path through the environment so it is never interpolated into
    // PowerShell source. System.Drawing is available in Windows PowerShell and
    // can extract the executable's associated icon without invoking a shell.
    let script = r#"
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($env:BENCH_ICON_PATH)
if ($null -eq $icon) { exit 2 }
$bitmap = New-Object System.Drawing.Bitmap 64,64
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.DrawIcon($icon, 0, 0)
$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
[Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))
$stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $icon.Dispose()
"#;
    let output = Command::new("powershell.exe")
        .env("BENCH_ICON_PATH", icon_path)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        ])
        .output()
        .map_err(|error| format!("WINDOWS_ICON_EXTRACT_FAILED: {error}"))?;
    if !output.status.success() {
        return Err("WINDOWS_ICON_EXTRACT_FAILED".to_string());
    }
    let encoded = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if encoded.is_empty() {
        return Err("WINDOWS_ICON_EXTRACT_EMPTY".to_string());
    }
    Ok(encoded)
}

// ============================================================================
// update check (Windows)
// ============================================================================

pub fn check_all_updates(
    apps: &[crate::app_manager::types::AppInfo],
) -> (
    Vec<crate::app_manager::types::UpdateInfo>,
    Vec<ProviderStatus>,
) {
    let Some(winget) = winget_path() else {
        return (
            Vec::new(),
            vec![ProviderStatus {
                provider: "winget".to_string(),
                state: ProviderState::Unsupported,
                error_code: Some("WINDOWS_WINGET_UNAVAILABLE".to_string()),
            }],
        );
    };
    let rows = match list_winget_updates(&winget, None) {
        Ok(rows) => rows,
        Err(error) => {
            return (
                Vec::new(),
                vec![ProviderStatus {
                    provider: "winget".to_string(),
                    state: ProviderState::Failed,
                    error_code: Some(error),
                }],
            )
        }
    };
    let mut updates = Vec::new();
    let mut applicable = 0_usize;
    for app in apps {
        if app.source_type != SourceType::Winget.to_string()
            || !app.allowed_actions.upgrade
            || app.source_id.is_empty()
        {
            continue;
        }
        applicable += 1;
        if let Some((_, current, latest)) = rows
            .iter()
            .find(|(id, _, _)| id.eq_ignore_ascii_case(&app.source_id))
        {
            updates.push(crate::app_manager::types::UpdateInfo {
                update_id: String::new(),
                inventory_revision: 0,
                app_id: app.app_id.clone(),
                app_name: app.name.clone(),
                source: crate::app_manager::types::UpdateSource::Winget,
                current_version: current.clone(),
                latest_version: latest.clone(),
                download_url: None,
                adam_id: None,
                release_notes_url: None,
                release_notes_inline: None,
                size: None,
                source_meta: Some(serde_json::json!({ "packageId": app.source_id })),
                feed_url: None,
                ignored: false,
            });
        }
    }
    (
        updates,
        vec![ProviderStatus {
            provider: "winget".to_string(),
            state: if applicable > 0 {
                ProviderState::Ok
            } else {
                ProviderState::Unsupported
            },
            error_code: (applicable == 0).then(|| "WINDOWS_WINGET_NO_EXACT_PACKAGES".to_string()),
        }],
    )
}

pub fn check_updates(
    app_ids: Vec<String>,
    state: tauri::State<'_, AppManagerState>,
) -> Result<Vec<String>, String> {
    let upgradable = match winget_path() {
        Some(ref wg) => list_winget_upgradable(wg, None)
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
    if app.source_type != SourceType::Winget.to_string()
        || app.source_evidence != SourceEvidence::ExactPackageId
    {
        return Err("UPGRADE_SOURCE_NOT_PROVEN".into());
    }
    let wg = winget_path().ok_or("winget is not available")?;
    let output = run_command_with_timeout_and_cancel(
        Command::new(&wg).args([
            "upgrade",
            "--id",
            &app.source_id,
            "--exact",
            "--accept-source-agreements",
            "--disable-interactivity",
            "--silent",
        ]),
        PACKAGE_OPERATION_TIMEOUT,
        None,
    )
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
    let output = if app.source_type == SourceType::Winget.to_string()
        && app.source_evidence == SourceEvidence::ExactPackageId
    {
        let wg = winget_path().ok_or("winget is not available")?;
        run_command_with_timeout_and_cancel(
            Command::new(&wg).args([
                "uninstall",
                "--id",
                &app.source_id,
                "--exact",
                "--accept-source-agreements",
                "--disable-interactivity",
                "--silent",
            ]),
            PACKAGE_OPERATION_TIMEOUT,
            None,
        )
        .map_err(|e| format!("winget uninstall failed: {e}"))?
    } else if app.source_type == SourceType::MsiInstaller.to_string()
        && app.source_evidence == SourceEvidence::ExactProductCode
        && is_valid_product_code(&app.source_id)
    {
        run_command_with_timeout_and_cancel(
            Command::new("msiexec.exe").args(["/x", &app.source_id, "/qn", "/norestart"]),
            PACKAGE_OPERATION_TIMEOUT,
            None,
        )
        .map_err(|e| format!("msiexec uninstall failed: {e}"))?
    } else {
        return Err("UNINSTALL_SOURCE_NOT_PROVEN".into());
    };
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
            let output = run_command_with_timeout_and_cancel(
                Command::new(&wg).args([
                    "install",
                    "--id",
                    winget_id,
                    "--exact",
                    "--accept-source-agreements",
                    "--disable-interactivity",
                    "--silent",
                ]),
                PACKAGE_OPERATION_TIMEOUT,
                None,
            )
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
        let parsed = url::Url::parse(url).map_err(|_| "INVALID_INSTALL_URL".to_string())?;
        if parsed.scheme() != "https" {
            return Err("HTTPS_INSTALL_URL_REQUIRED".into());
        }
        let status = Command::new("explorer.exe")
            .arg(url)
            .status()
            .map_err(|error| format!("open download page failed: {error}"))?;
        if !status.success() {
            return Err("OPEN_DOWNLOAD_PAGE_FAILED".into());
        }
        return Ok(operation_result(
            true,
            "Opening download page".to_string(),
            status.code(),
            None,
            false,
        ));
    }

    Err("No suitable installation method available for this application".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_locale_independent_winget_packages_json() {
        let fixture = serde_json::json!({
            "Sources": [{
                "Packages": [{
                    "Name": "微信",
                    "PackageIdentifier": "Tencent.WeChat",
                    "Version": "4.0.0"
                }]
            }]
        });
        assert_eq!(
            parse_winget_packages_json(&fixture),
            vec![("微信".to_string(), "Tencent.WeChat".to_string(), None)]
        );
    }

    #[test]
    fn validates_msi_product_codes_before_authorizing_uninstall() {
        assert!(is_valid_product_code(
            "{12345678-1234-ABCD-9876-1234567890AB}"
        ));
        assert!(!is_valid_product_code("not-a-product-code"));
    }

    #[test]
    fn parses_locale_independent_winget_updates_json() {
        let fixture = serde_json::json!({
            "Data": [{
                "PackageIdentifier": "Microsoft.VisualStudioCode",
                "InstalledVersion": "1.100.0",
                "AvailableVersion": "1.101.0"
            }]
        });
        assert_eq!(
            parse_winget_updates_json(&fixture),
            vec![(
                "Microsoft.VisualStudioCode".to_string(),
                "1.100.0".to_string(),
                "1.101.0".to_string()
            )]
        );
    }
}
