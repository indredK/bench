use chrono::{DateTime, Local};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc;
use std::time::Duration;

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

const TOOL_DISPLAY_NAMES: &[(&str, &str)] = &[
    ("node", "Node.js"),
    ("npm", "npm"),
    ("npx", "npx"),
    ("yarn", "Yarn"),
    ("pnpm", "pnpm"),
    ("bun", "Bun"),
    ("deno", "Deno"),
    ("python", "Python"),
    ("python3", "Python 3"),
    ("pip", "pip"),
    ("pip3", "pip3"),
    ("go", "Go"),
    ("rustc", "Rust (rustc)"),
    ("cargo", "Cargo"),
    ("java", "Java"),
    ("git", "Git"),
    ("docker", "Docker"),
    ("docker-compose", "Docker Compose"),
    ("docker compose", "Docker Compose"),
    ("kubectl", "kubectl"),
    ("code", "VS Code"),
    ("code-insiders", "VS Code Insiders"),
    ("codex", "Codex CLI"),
    ("gemini", "Gemini CLI"),
    ("claude", "Claude CLI"),
    ("cursor", "Cursor"),
    ("windsurf", "Windsurf"),
    ("nvim", "Neovim"),
    ("vim", "Vim"),
    ("nano", "Nano"),
    ("curl", "curl"),
    ("wget", "wget"),
    ("cmake", "CMake"),
    ("make", "Make"),
    ("gcc", "GCC"),
    ("g++", "G++"),
    ("clang", "Clang"),
    ("dotnet", ".NET SDK"),
    ("flutter", "Flutter"),
    ("dart", "Dart"),
    ("tauri", "Tauri CLI"),
    ("psql", "PostgreSQL (psql)"),
    ("sqlite3", "SQLite"),
    ("mongosh", "MongoDB Shell"),
    ("redis-cli", "Redis CLI"),
    ("ssh", "SSH"),
    ("terraform", "Terraform"),
    ("ansible", "Ansible"),
    ("podman", "Podman"),
    ("minikube", "Minikube"),
    ("helm", "Helm"),
    ("gh", "GitHub CLI"),
    ("aws", "AWS CLI"),
    ("az", "Azure CLI"),
    ("gcloud", "Google Cloud CLI"),
    ("vercel", "Vercel CLI"),
    ("wrangler", "Wrangler (Cloudflare)"),
    ("ngrok", "ngrok"),
    ("jq", "jq"),
    ("scoop", "Scoop"),
    ("choco", "Chocolatey"),
    ("winget", "winget"),
    ("brew", "Homebrew"),
];

const SKIP_DIR_PREFIXES: &[&str] = &[
    "C:\\Windows\\",
    "C:\\Program Files\\Windows ",
    "/usr/bin",
    "/usr/sbin",
    "/bin",
    "/sbin",
    "/usr/lib",
    "/lib",
];

/// Maximum seconds to wait for a single `--version` probe.
const PROBE_TIMEOUT_SECS: u64 = 3;

#[tauri::command]
pub fn detect_env_tools() -> Vec<EnvTool> {
    // Wrap with catch_unwind so ANY panic is caught and returned as empty
    // instead of crashing the Tauri command (which triggers native error dialog).
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        detect_env_tools_inner()
    })) {
        Ok(result) => result,
        Err(_) => {
            eprintln!("[env_detector] panic caught, returning empty result");
            Vec::new()
        }
    }
}

fn detect_env_tools_inner() -> Vec<EnvTool> {
    let is_windows = cfg!(target_os = "windows");

    let display_names: HashMap<&str, &str> = TOOL_DISPLAY_NAMES
        .iter()
        .map(|&(bin, name)| (bin, name))
        .collect();

    // Scan PATH and get (name, full_path) pairs — NO `where`/`which` calls
    let entries = scan_path_entries(is_windows);

    let mut found_set: HashSet<String> = HashSet::new();
    let mut results: Vec<EnvTool> = Vec::new();

    for (name, full_path) in &entries {
        found_set.insert(name.clone());

        let display_name = display_names
            .get(name.as_str())
            .map(|&s| s.to_string())
            .unwrap_or_else(|| name.clone());

        let version = probe_version_with_timeout(full_path);
        let (size_bytes, size_display) = get_file_size(full_path);
        let install_time = get_file_time(full_path);

        results.push(EnvTool {
            name: display_name,
            version,
            path: full_path.to_string_lossy().to_string(),
            size_bytes,
            size_display,
            install_time,
            available: true,
        });
    }

    // Add missing known tools
    for &(binary, display_name) in TOOL_DISPLAY_NAMES {
        if !found_set.contains(binary) {
            results.push(EnvTool {
                name: display_name.to_string(),
                version: String::new(),
                path: String::new(),
                size_bytes: 0,
                size_display: String::new(),
                install_time: String::new(),
                available: false,
            });
        }
    }

    results.sort_by(|a, b| {
        a.available
            .cmp(&b.available)
            .reverse()
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    results
}

/// Scan PATH directories and return (stem_name, full_path) for each executable found.
/// Skips system directories. Does NOT call `where`/`which`.
fn scan_path_entries(is_windows: bool) -> Vec<(String, PathBuf)> {
    let path_var = env::var("PATH").unwrap_or_default();
    let separator = if is_windows { ';' } else { ':' };

    let mut seen: HashSet<String> = HashSet::new();
    let mut result: Vec<(String, PathBuf)> = Vec::new();

    for dir_str in path_var.split(separator) {
        let dir_path = Path::new(dir_str.trim());

        if is_skip_directory(dir_path) || !dir_path.is_dir() {
            continue;
        }

        let entries = match fs::read_dir(dir_path) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let full_path = entry.path();
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy().to_string();

            if name_str.starts_with('.')
                || name_str.eq_ignore_ascii_case("desktop.ini")
                || name_str.eq_ignore_ascii_case("thumbs.db")
            {
                continue;
            }

            let stem = if is_windows {
                let lower = name_str.to_lowercase();
                if lower.ends_with(".exe")
                    || lower.ends_with(".bat")
                    || lower.ends_with(".cmd")
                    || lower.ends_with(".ps1")
                {
                    Path::new(&name_str)
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_lowercase())
                        .unwrap_or_default()
                } else {
                    continue;
                }
            } else {
                // On Unix, check executable permission
                if !is_executable(&full_path) {
                    continue;
                }
                name_str.to_lowercase()
            };

            if !stem.is_empty() && seen.insert(stem.clone()) {
                result.push((stem, full_path));
            }
        }
    }

    result
}

/// Try `--version` with a hard timeout. The timeout prevents hanging on commands
/// that never exit (e.g. interactive tools run without stdin).
fn probe_version_with_timeout(path: &PathBuf) -> String {
    let path = path.clone();
    let (tx, rx) = mpsc::channel();

    std::thread::spawn(move || {
        let result = run_version_cmd(&path);
        let _ = tx.send(result);
    });

    match rx.recv_timeout(Duration::from_secs(PROBE_TIMEOUT_SECS)) {
        Ok(version) => version,
        Err(mpsc::RecvTimeoutError::Timeout) => {
            // Timeout — command hung. Return empty string silently.
            String::new()
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => String::new(),
    }
}

/// Run the binary with --version and parse output.
/// Tries `--version` first; if no output, tries `-v`.
fn run_version_cmd(path: &Path) -> String {
    for args in [&["--version"][..], &["-v"][..], &["-V"][..]] {
        let result = run_single_cmd(path, args);
        if !result.is_empty() {
            return result;
        }
    }
    String::new()
}

fn run_single_cmd(path: &Path, args: &[&str]) -> String {
    let output = match Command::new(path).args(args).output() {
        Ok(o) => o,
        Err(_) => return String::new(),
    };

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    let combined = if !stdout.is_empty() && !stderr.is_empty() {
        format!("{}\n{}", stdout, stderr)
    } else if !stdout.is_empty() {
        stdout
    } else {
        stderr
    };

    let trimmed: String = combined
        .lines()
        .take(3)
        .collect::<Vec<_>>()
        .join(" | ")
        .trim()
        .to_string();

    if trimmed.is_empty()
        || trimmed.eq_ignore_ascii_case("usage")
        || trimmed.eq_ignore_ascii_case("help")
    {
        return String::new();
    }

    trimmed
}

fn is_skip_directory(path: &Path) -> bool {
    let path_str = path.to_string_lossy();
    let normalized = path_str.replace('/', "\\");
    SKIP_DIR_PREFIXES
        .iter()
        .any(|&prefix| normalized.starts_with(prefix))
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
