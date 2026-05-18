use chrono::{DateTime, Local};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::env;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Clone)]
pub struct EnvTool {
    pub name: String,
    pub version: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub install_time: String,
    pub available: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct ScanDonePayload {
    pub unavailable: Vec<EnvTool>,
}

#[derive(Debug, Clone)]
struct CommandCandidate {
    name: String,
    path: PathBuf,
    dir_index: usize,
    extension_rank: usize,
}

#[derive(Debug)]
struct NodeBinInfo {
    package_name: String,
    declared_bins: Vec<NodeDeclaredBin>,
    matched_name: Option<String>,
}

#[derive(Debug)]
struct NodeDeclaredBin {
    name: String,
    relative_path: String,
}

#[tauri::command]
pub async fn detect_env_tools(app_handle: AppHandle) {
    tokio::task::spawn_blocking(move || {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            detect_env_tools_inner(app_handle);
        })) {
            Ok(()) => {}
            Err(_) => {
                eprintln!("[env_detector] panic caught, returning empty result");
            }
        }
    })
    .await
    .unwrap_or_else(|_| {});
}

fn detect_env_tools_inner(app_handle: AppHandle) {
    let search_dirs = collect_search_dirs();
    let tools = scan_env_commands(&search_dirs);

    for tool in tools {
        let _ = app_handle.emit("env-tool-found", &tool);
    }

    let _ = app_handle.emit(
        "env-scan-done",
        ScanDonePayload {
            unavailable: Vec::new(),
        },
    );
}

fn scan_env_commands(search_dirs: &[PathBuf]) -> Vec<EnvTool> {
    let mut candidates_by_name: HashMap<String, CommandCandidate> = HashMap::new();
    let mut command_order: Vec<String> = Vec::new();
    let windows_extensions = windows_executable_extensions(env::var_os("PATHEXT").as_deref());

    for (dir_index, dir) in search_dirs.iter().enumerate() {
        if !is_scannable_dir(dir) {
            continue;
        }

        let entries = match fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name();

            if !is_executable_file(&path) {
                continue;
            }

            let Some((command_name, extension_rank)) =
                command_name_from_file_name(&file_name, &windows_extensions)
            else {
                continue;
            };

            let candidate = CommandCandidate {
                name: command_name,
                path,
                dir_index,
                extension_rank,
            };

            let Some(candidate) = refine_command_candidate(candidate) else {
                continue;
            };
            let key = command_key(&candidate.name);

            match candidates_by_name.get(&key) {
                Some(existing) if !candidate_is_better(&candidate, existing) => {}
                Some(_) => {
                    candidates_by_name.insert(key, candidate);
                }
                None => {
                    command_order.push(key.clone());
                    candidates_by_name.insert(key, candidate);
                }
            }
        }
    }

    command_order
        .into_iter()
        .filter_map(|key| candidates_by_name.remove(&key))
        .map(build_available_tool)
        .collect()
}

fn candidate_is_better(candidate: &CommandCandidate, existing: &CommandCandidate) -> bool {
    candidate.dir_index < existing.dir_index
        || (candidate.dir_index == existing.dir_index
            && candidate.extension_rank < existing.extension_rank)
}

fn build_available_tool(candidate: CommandCandidate) -> EnvTool {
    let (size_bytes, size_display) = get_file_size(&candidate.path);
    let install_time = get_file_time(&candidate.path);

    EnvTool {
        name: candidate.name,
        version: String::new(),
        path: candidate.path.to_string_lossy().to_string(),
        size_bytes,
        size_display,
        install_time,
        available: true,
    }
}

fn refine_command_candidate(mut candidate: CommandCandidate) -> Option<CommandCandidate> {
    let node_bin_info = node_bin_info_for_candidate(&candidate);

    if let Some(info) = node_bin_info {
        if let Some(declared_name) = &info.matched_name {
            candidate.name = declared_name.clone();
        }

        if is_low_signal_node_bin(&candidate.name, &info) {
            return None;
        }
    } else if is_low_signal_command_name(&candidate.name) {
        return None;
    }

    Some(candidate)
}

fn node_bin_info_for_candidate(candidate: &CommandCandidate) -> Option<NodeBinInfo> {
    let resolved_path =
        fs::canonicalize(&candidate.path).unwrap_or_else(|_| candidate.path.clone());
    let package_root = find_node_package_root(&resolved_path)?;
    let package_json_path = package_root.join("package.json");
    let package_json = fs::read_to_string(package_json_path).ok()?;
    let package_json = serde_json::from_str::<serde_json::Value>(&package_json).ok()?;
    let package_name = package_json
        .get("name")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();

    if package_name.is_empty() {
        return None;
    }

    let declared_bins = parse_node_declared_bins(&package_json, &package_name)?;
    let matched_name = match_declared_node_bin(
        &candidate.name,
        &resolved_path,
        &package_root,
        &declared_bins,
    );

    Some(NodeBinInfo {
        package_name,
        declared_bins,
        matched_name,
    })
}

fn find_node_package_root(path: &Path) -> Option<PathBuf> {
    for ancestor in path.ancestors().skip(1) {
        if ancestor.join("package.json").is_file() && path_has_component(ancestor, "node_modules") {
            return Some(ancestor.to_path_buf());
        }
    }

    None
}

fn parse_node_declared_bins(
    package_json: &serde_json::Value,
    package_name: &str,
) -> Option<Vec<NodeDeclaredBin>> {
    let bin = package_json.get("bin")?;

    if let Some(relative_path) = bin.as_str() {
        return Some(vec![NodeDeclaredBin {
            name: command_name_from_package_name(package_name),
            relative_path: relative_path.to_string(),
        }]);
    }

    let object = bin.as_object()?;
    let mut bins = Vec::new();
    for (name, value) in object {
        if let Some(relative_path) = value.as_str() {
            bins.push(NodeDeclaredBin {
                name: name.to_string(),
                relative_path: relative_path.to_string(),
            });
        }
    }

    if bins.is_empty() {
        None
    } else {
        Some(bins)
    }
}

fn command_name_from_package_name(package_name: &str) -> String {
    package_name
        .rsplit('/')
        .next()
        .unwrap_or(package_name)
        .to_string()
}

fn match_declared_node_bin(
    command_name: &str,
    resolved_path: &Path,
    package_root: &Path,
    declared_bins: &[NodeDeclaredBin],
) -> Option<String> {
    let requested_key = command_key(command_name);

    for bin in declared_bins {
        if command_key(&bin.name) == requested_key {
            return Some(bin.name.clone());
        }
    }

    for bin in declared_bins {
        let bin_path = package_root.join(&bin.relative_path);
        if paths_refer_to_same_file(&bin_path, resolved_path) {
            return Some(bin.name.clone());
        }
    }

    None
}

fn paths_refer_to_same_file(left: &Path, right: &Path) -> bool {
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(left), Ok(right)) => normalize_path_key(&left) == normalize_path_key(&right),
        _ => normalize_path_key(left) == normalize_path_key(right),
    }
}

fn is_low_signal_node_bin(command_name: &str, info: &NodeBinInfo) -> bool {
    let command = command_name.to_ascii_lowercase();
    let package = command_name_from_package_name(&info.package_name).to_ascii_lowercase();

    if matches!(command.as_str(), "tsserver") {
        return true;
    }

    if command.contains("language-server") || command.ends_with("-lsp") {
        return true;
    }

    info.declared_bins.len() > 1
        && command.ends_with("server")
        && command != package
        && info
            .declared_bins
            .iter()
            .any(|bin| command_key(&bin.name) == command_key(command_name))
}

fn is_low_signal_command_name(command_name: &str) -> bool {
    let command = command_name.to_ascii_lowercase();
    matches!(command.as_str(), "tsserver")
        || command.contains("language-server")
        || command.ends_with("-lsp")
}

fn collect_search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let mut seen = HashSet::new();

    if let Some(path_var) = env::var_os("PATH") {
        for dir in env::split_paths(&path_var) {
            push_search_dir(&mut dirs, &mut seen, dir);
        }
    }

    for dir in platform_default_dirs() {
        push_search_dir(&mut dirs, &mut seen, dir);
    }

    dirs
}

fn push_search_dir(dirs: &mut Vec<PathBuf>, seen: &mut HashSet<String>, dir: PathBuf) {
    if dir.as_os_str().is_empty() || !dir.is_absolute() {
        return;
    }

    let key = normalize_path_key(&dir);
    if seen.insert(key) {
        dirs.push(dir);
    }
}

fn normalize_path_key(path: &Path) -> String {
    let mut value = path.to_string_lossy().replace('\\', "/");
    while value.len() > 1 && value.ends_with('/') {
        value.pop();
    }

    if cfg!(windows) {
        value.to_lowercase()
    } else {
        value
    }
}

fn platform_default_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    push_env_dir(&mut dirs, "PNPM_HOME");

    if let Some(home) = home_dir() {
        dirs.push(home.join(".cargo").join("bin"));
        dirs.push(home.join(".bun").join("bin"));
        dirs.push(home.join(".deno").join("bin"));
        dirs.push(home.join(".local").join("bin"));
        dirs.push(home.join(".local").join("share").join("mise").join("shims"));
        dirs.push(home.join(".asdf").join("shims"));
        dirs.push(home.join(".volta").join("bin"));
        dirs.push(home.join("go").join("bin"));

        push_existing_child_bin_dirs(&mut dirs, &home.join(".nvm").join("versions").join("node"));

        #[cfg(target_os = "macos")]
        {
            dirs.push(home.join(".npm-global").join("bin"));
            dirs.push(home.join(".rbenv").join("shims"));
            dirs.push(home.join(".pyenv").join("shims"));
            dirs.push(home.join("Library").join("pnpm"));
        }

        #[cfg(target_os = "windows")]
        {
            dirs.push(home.join("scoop").join("shims"));
        }
    }

    #[cfg(target_os = "macos")]
    {
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
        dirs.push(PathBuf::from("/opt/local/bin"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        dirs.push(PathBuf::from("/usr/local/bin"));
        dirs.push(PathBuf::from("/snap/bin"));
    }

    #[cfg(target_os = "windows")]
    {
        push_env_child(&mut dirs, "APPDATA", &["npm"]);
        push_env_child(&mut dirs, "LOCALAPPDATA", &["pnpm"]);
        push_env_child(
            &mut dirs,
            "LOCALAPPDATA",
            &["Programs", "Microsoft VS Code", "bin"],
        );
        push_env_child(&mut dirs, "ProgramData", &["chocolatey", "bin"]);

        dirs.push(PathBuf::from(r"C:\Program Files\nodejs"));
        dirs.push(PathBuf::from(r"C:\Program Files\Git\cmd"));
        dirs.push(PathBuf::from(
            r"C:\Program Files\Docker\Docker\resources\bin",
        ));
        dirs.push(PathBuf::from(r"C:\Program Files\Microsoft VS Code\bin"));
    }

    dirs
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn push_env_dir(dirs: &mut Vec<PathBuf>, key: &str) {
    if let Some(value) = env::var_os(key) {
        dirs.push(PathBuf::from(value));
    }
}

#[cfg(target_os = "windows")]
fn push_env_child(dirs: &mut Vec<PathBuf>, key: &str, parts: &[&str]) {
    if let Some(value) = env::var_os(key) {
        let mut path = PathBuf::from(value);
        for part in parts {
            path.push(part);
        }
        dirs.push(path);
    }
}

fn push_existing_child_bin_dirs(dirs: &mut Vec<PathBuf>, parent: &Path) {
    let entries = match fs::read_dir(parent) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let bin_dir = entry.path().join("bin");
        if bin_dir.is_dir() {
            dirs.push(bin_dir);
        }
    }
}

fn is_scannable_dir(path: &Path) -> bool {
    path.is_dir() && !is_os_system_dir(path) && !is_project_local_bin_dir(path)
}

fn is_os_system_dir(path: &Path) -> bool {
    let normalized = normalize_path_key(path);

    if cfg!(windows) {
        return normalized == "c:/windows"
            || normalized.starts_with("c:/windows/")
            || normalized.ends_with("/windows/system32")
            || normalized.ends_with("/windows/syswow64");
    }

    matches!(
        normalized.as_str(),
        "/bin"
            | "/sbin"
            | "/usr/bin"
            | "/usr/sbin"
            | "/usr/lib"
            | "/lib"
            | "/library/apple/usr/bin"
    ) || normalized.starts_with("/system/")
}

fn is_project_local_bin_dir(path: &Path) -> bool {
    has_component_suffix(path, &["node_modules", ".bin"])
        || has_component_suffix(path, &[".venv", "bin"])
        || has_component_suffix(path, &["venv", "bin"])
        || has_component_suffix(path, &["env", "bin"])
        || has_component_suffix(path, &["target", "debug"])
        || has_component_suffix(path, &["target", "release"])
        || has_component_suffix(path, &[".git", "hooks"])
        || (cfg!(windows)
            && (has_component_suffix(path, &[".venv", "scripts"])
                || has_component_suffix(path, &["venv", "scripts"])
                || has_component_suffix(path, &["env", "scripts"])))
}

fn path_has_component(path: &Path, needle: &str) -> bool {
    path_components(path).iter().any(|part| part == needle)
}

fn has_component_suffix(path: &Path, suffix: &[&str]) -> bool {
    let components = path_components(path);
    components.len() >= suffix.len()
        && components[components.len() - suffix.len()..]
            .iter()
            .zip(suffix.iter())
            .all(|(left, right)| left == right)
}

fn path_components(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|component| component.as_os_str().to_str())
        .map(|component| {
            if cfg!(windows) {
                component.to_ascii_lowercase()
            } else {
                component.to_string()
            }
        })
        .collect()
}

fn command_name_from_file_name(
    file_name: &OsStr,
    windows_extensions: &[String],
) -> Option<(String, usize)> {
    let file_name = file_name.to_string_lossy();
    if is_ignored_file_name(&file_name) {
        return None;
    }

    if cfg!(windows) {
        windows_command_name_from_file_name(&file_name, windows_extensions)
    } else if is_reasonable_command_name(&file_name) {
        Some((file_name.to_string(), 0))
    } else {
        None
    }
}

fn windows_command_name_from_file_name(
    file_name: &str,
    windows_extensions: &[String],
) -> Option<(String, usize)> {
    let extension = Path::new(file_name)
        .extension()
        .map(|ext| format!(".{}", ext.to_string_lossy().to_lowercase()))?;

    let extension_rank = windows_extensions
        .iter()
        .position(|candidate| candidate == &extension)?;

    let stem = Path::new(file_name)
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())?;

    if is_reasonable_command_name(&stem) {
        Some((stem, extension_rank))
    } else {
        None
    }
}

fn windows_executable_extensions(path_ext: Option<&OsStr>) -> Vec<String> {
    const FALLBACK_EXTENSIONS: &[&str] = &[".exe", ".cmd", ".bat", ".com", ".ps1"];
    const ALLOWED_EXTENSIONS: &[&str] = &[".exe", ".cmd", ".bat", ".com", ".ps1"];

    let mut extensions = Vec::new();
    let source = path_ext
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| FALLBACK_EXTENSIONS.join(";"));

    for raw in source.split(';') {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }

        let normalized = if trimmed.starts_with('.') {
            trimmed.to_lowercase()
        } else {
            format!(".{}", trimmed.to_lowercase())
        };

        if ALLOWED_EXTENSIONS.contains(&normalized.as_str())
            && !extensions.iter().any(|ext| ext == &normalized)
        {
            extensions.push(normalized);
        }
    }

    for fallback in FALLBACK_EXTENSIONS {
        let fallback = (*fallback).to_string();
        if !extensions.iter().any(|ext| ext == &fallback) {
            extensions.push(fallback);
        }
    }

    extensions
}

fn is_executable_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    if cfg!(windows) {
        true
    } else {
        is_executable(path)
    }
}

fn is_ignored_file_name(name: &str) -> bool {
    name.is_empty()
        || name.starts_with('.')
        || name.eq_ignore_ascii_case("desktop.ini")
        || name.eq_ignore_ascii_case("thumbs.db")
}

fn is_reasonable_command_name(name: &str) -> bool {
    !name.is_empty()
        && name.chars().count() <= 120
        && !name.contains(std::path::MAIN_SEPARATOR)
        && !name.chars().any(char::is_control)
}

fn command_key(name: &str) -> String {
    if cfg!(windows) {
        name.to_lowercase()
    } else {
        name.to_string()
    }
}

fn get_file_size(path: &Path) -> (u64, String) {
    match fs::metadata(path) {
        Ok(meta) => {
            let bytes = meta.len();
            (bytes, format_bytes(bytes))
        }
        Err(_) => (0, String::new()),
    }
}

fn get_file_time(path: &Path) -> String {
    match fs::metadata(path) {
        Ok(meta) => {
            let timestamp = if cfg!(target_os = "windows") {
                meta.created().or_else(|_| meta.modified())
            } else {
                meta.modified().or_else(|_| meta.created())
            };

            match timestamp {
                Ok(time) => {
                    let duration = time
                        .duration_since(std::time::SystemTime::UNIX_EPOCH)
                        .unwrap_or_default();
                    let secs = duration.as_secs() as i64;
                    let nsecs = duration.subsec_nanos();
                    match DateTime::from_timestamp(secs, nsecs) {
                        Some(dt) => {
                            let local: DateTime<Local> = dt.with_timezone(&Local);
                            local.format("%Y-%m-%d %H:%M:%S").to_string()
                        }
                        None => String::new(),
                    }
                }
                Err(_) => String::new(),
            }
        }
        Err(_) => String::new(),
    }
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(path)
        .map(|m| m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(_path: &Path) -> bool {
    true
}

fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".to_string();
    }

    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let bytes_f = bytes as f64;
    let i = (bytes_f.log10() / 3.0).floor() as usize;
    let i = i.min(UNITS.len() - 1);
    let value = bytes_f / 1000_f64.powi(i as i32);
    format!("{:.2} {}", value, UNITS[i])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_windows_path_ext_with_fallbacks() {
        let extensions = windows_executable_extensions(Some(OsStr::new(".JS;.CMD;.EXE;.ps1;.cmd")));

        assert_eq!(extensions, vec![".cmd", ".exe", ".ps1", ".bat", ".com"]);
    }

    #[test]
    fn extracts_windows_command_name_from_wrapper() {
        let extensions = vec![".cmd".to_string(), ".exe".to_string()];
        let command = windows_command_name_from_file_name("sample-tool.cmd", &extensions);

        assert_eq!(command, Some(("sample-tool".to_string(), 0)));
    }

    #[test]
    fn ignores_non_executable_windows_extension() {
        let extensions = vec![".cmd".to_string(), ".exe".to_string()];
        let command = windows_command_name_from_file_name("sample-tool.txt", &extensions);

        assert_eq!(command, None);
    }

    #[test]
    fn prefers_path_order_before_extension_order() {
        let candidate = CommandCandidate {
            name: "sample".to_string(),
            path: PathBuf::from("/second/sample.exe"),
            dir_index: 1,
            extension_rank: 0,
        };
        let existing = CommandCandidate {
            name: "sample".to_string(),
            path: PathBuf::from("/first/sample.cmd"),
            dir_index: 0,
            extension_rank: 1,
        };

        assert!(!candidate_is_better(&candidate, &existing));
    }

    #[test]
    fn prefers_extension_order_inside_same_dir() {
        let candidate = CommandCandidate {
            name: "sample".to_string(),
            path: PathBuf::from("/bin/sample.exe"),
            dir_index: 0,
            extension_rank: 0,
        };
        let existing = CommandCandidate {
            name: "sample".to_string(),
            path: PathBuf::from("/bin/sample.cmd"),
            dir_index: 0,
            extension_rank: 1,
        };

        assert!(candidate_is_better(&candidate, &existing));
    }

    #[test]
    fn rejects_hidden_and_metadata_files() {
        assert!(is_ignored_file_name(".hidden"));
        assert!(is_ignored_file_name("desktop.ini"));
        assert!(is_ignored_file_name("thumbs.db"));
        assert!(!is_ignored_file_name("sample"));
    }

    #[test]
    fn rejects_project_local_bin_dirs() {
        assert!(is_project_local_bin_dir(Path::new(
            "/project/node_modules/.bin"
        )));
        assert!(is_project_local_bin_dir(Path::new("/project/.venv/bin")));
        assert!(is_project_local_bin_dir(Path::new("/project/target/debug")));
        assert!(!is_project_local_bin_dir(Path::new("/Users/me/.cargo/bin")));
    }

    #[test]
    fn maps_node_declared_bin_from_package_manifest() {
        let json = serde_json::json!({
            "name": "sample-package",
            "bin": {
                "sample": "./bin/cli.js",
                "sample-server": "./bin/server.js"
            }
        });

        let bins = parse_node_declared_bins(&json, "sample-package").unwrap();

        assert_eq!(bins.len(), 2);
        assert_eq!(bins[0].name, "sample");
        assert_eq!(bins[0].relative_path, "./bin/cli.js");
    }

    #[test]
    fn derives_bin_name_from_string_bin_package_name() {
        let json = serde_json::json!({
            "name": "@scope/sample",
            "bin": "./bin/cli.js"
        });

        let bins = parse_node_declared_bins(&json, "@scope/sample").unwrap();

        assert_eq!(bins[0].name, "sample");
    }

    #[test]
    fn rejects_low_signal_node_service_bins() {
        let info = NodeBinInfo {
            package_name: "typescript".to_string(),
            declared_bins: vec![
                NodeDeclaredBin {
                    name: "tsc".to_string(),
                    relative_path: "./bin/tsc".to_string(),
                },
                NodeDeclaredBin {
                    name: "tsserver".to_string(),
                    relative_path: "./bin/tsserver".to_string(),
                },
            ],
            matched_name: Some("tsserver".to_string()),
        };

        assert!(is_low_signal_node_bin("tsserver", &info));
        assert!(!is_low_signal_node_bin("tsc", &info));
    }

    #[test]
    fn formats_byte_counts() {
        assert_eq!(format_bytes(0), "0 B");
        assert_eq!(format_bytes(1536), "1.54 KB");
    }
}
