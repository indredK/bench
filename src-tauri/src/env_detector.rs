use chrono::{DateTime, Local};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::env;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
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
    pub category: String,
    pub source: String,
    pub kind: String,
    pub status: String,
    pub detector: String,
    pub all_paths: Vec<String>,
    pub issue: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ScanDonePayload {
    pub tools: Vec<EnvTool>,
    pub unavailable: Vec<EnvTool>,
}

#[derive(Debug, Clone)]
struct CommandCandidate {
    name: String,
    path: PathBuf,
    dir_index: usize,
    extension_rank: usize,
}

#[derive(Debug, Clone, Copy)]
struct ToolDetector {
    name: &'static str,
    aliases: &'static [&'static str],
    category: &'static str,
    version_args: &'static [&'static str],
}

#[derive(Debug)]
struct ToolClassification {
    category: String,
    source: String,
    kind: String,
    status: String,
    detector: String,
    issue: String,
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

const VERSION_TIMEOUT: Duration = Duration::from_millis(1200);
#[cfg(target_os = "macos")]
const SHELL_TIMEOUT: Duration = Duration::from_millis(4000);
const MAX_VERSION_PROBES: usize = 80;
const ENV_TOOL_DETECTORS: &[ToolDetector] = &[
    ToolDetector {
        name: "node",
        aliases: &["node"],
        category: "javascript",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "npm",
        aliases: &["npm"],
        category: "javascript",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "pnpm",
        aliases: &["pnpm"],
        category: "javascript",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "yarn",
        aliases: &["yarn"],
        category: "javascript",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "bun",
        aliases: &["bun"],
        category: "javascript",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "deno",
        aliases: &["deno"],
        category: "javascript",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "python",
        aliases: &["python", "python3", "py"],
        category: "python",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "pip",
        aliases: &["pip", "pip3"],
        category: "python",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "uv",
        aliases: &["uv"],
        category: "python",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "poetry",
        aliases: &["poetry"],
        category: "python",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "cargo",
        aliases: &["cargo"],
        category: "rust",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "rustc",
        aliases: &["rustc"],
        category: "rust",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "rustup",
        aliases: &["rustup"],
        category: "rust",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "go",
        aliases: &["go"],
        category: "runtime",
        version_args: &["version"],
    },
    ToolDetector {
        name: "git",
        aliases: &["git"],
        category: "build",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "docker",
        aliases: &["docker"],
        category: "container",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "kubectl",
        aliases: &["kubectl"],
        category: "container",
        version_args: &["version", "--client=true"],
    },
    ToolDetector {
        name: "java",
        aliases: &["java"],
        category: "runtime",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "mvn",
        aliases: &["mvn"],
        category: "runtime",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "gradle",
        aliases: &["gradle"],
        category: "runtime",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "code",
        aliases: &["code", "code-insiders"],
        category: "editor",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "brew",
        aliases: &["brew"],
        category: "packageManager",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "choco",
        aliases: &["choco"],
        category: "packageManager",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "winget",
        aliases: &["winget"],
        category: "packageManager",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "scoop",
        aliases: &["scoop"],
        category: "packageManager",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "aws",
        aliases: &["aws"],
        category: "cloud",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "az",
        aliases: &["az"],
        category: "cloud",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "gcloud",
        aliases: &["gcloud"],
        category: "cloud",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "gh",
        aliases: &["gh"],
        category: "cloud",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "terraform",
        aliases: &["terraform"],
        category: "cloud",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "psql",
        aliases: &["psql"],
        category: "database",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "mysql",
        aliases: &["mysql"],
        category: "database",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "redis-cli",
        aliases: &["redis-cli"],
        category: "database",
        version_args: &["--version"],
    },
    ToolDetector {
        name: "sqlite3",
        aliases: &["sqlite3"],
        category: "database",
        version_args: &["--version"],
    },
];

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
    });
}

fn detect_env_tools_inner(app_handle: AppHandle) {
    let search_dirs = collect_search_dirs();
    let inventory = collect_command_inventory(&search_dirs);
    let (tools, unavailable) = diagnose_command_inventory(inventory, MAX_VERSION_PROBES);

    let _ = app_handle.emit("env-scan-done", ScanDonePayload { tools, unavailable });
}

#[derive(Debug)]
struct CommandInventory {
    candidates_by_name: HashMap<String, CommandCandidate>,
    paths_by_name: HashMap<String, Vec<String>>,
    command_order: Vec<String>,
}

fn collect_command_inventory(search_dirs: &[PathBuf]) -> CommandInventory {
    let mut candidates_by_name: HashMap<String, CommandCandidate> = HashMap::new();
    let mut paths_by_name: HashMap<String, Vec<String>> = HashMap::new();
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
            paths_by_name
                .entry(key.clone())
                .or_default()
                .push(candidate.path.to_string_lossy().to_string());

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

    CommandInventory {
        candidates_by_name,
        paths_by_name,
        command_order,
    }
}

fn diagnose_command_inventory(
    mut inventory: CommandInventory,
    max_version_probes: usize,
) -> (Vec<EnvTool>, Vec<EnvTool>) {
    let mut version_probe_count = 0;
    let tools: Vec<EnvTool> = inventory
        .command_order
        .into_iter()
        .filter_map(|key| {
            let candidate = inventory.candidates_by_name.remove(&key)?;
            let all_paths = inventory.paths_by_name.remove(&key).unwrap_or_default();
            let should_probe_version = version_probe_count < max_version_probes
                && resolve_tool_detector(&candidate.name).is_some();
            if should_probe_version {
                version_probe_count += 1;
            }
            Some(build_available_tool(
                candidate,
                all_paths,
                should_probe_version,
            ))
        })
        .collect();
    let available_keys: HashSet<String> = tools
        .iter()
        .flat_map(|tool| {
            resolve_tool_detector(&tool.name)
                .map(|detector| {
                    detector
                        .aliases
                        .iter()
                        .map(|alias| command_key(alias))
                        .collect()
                })
                .unwrap_or_else(|| vec![command_key(&tool.name)])
        })
        .collect();
    let unavailable = ENV_TOOL_DETECTORS
        .iter()
        .filter(|detector| {
            !detector
                .aliases
                .iter()
                .any(|alias| available_keys.contains(&command_key(alias)))
        })
        .map(build_unavailable_tool)
        .collect();

    (tools, unavailable)
}

fn candidate_is_better(candidate: &CommandCandidate, existing: &CommandCandidate) -> bool {
    candidate.dir_index < existing.dir_index
        || (candidate.dir_index == existing.dir_index
            && candidate.extension_rank < existing.extension_rank)
}

fn build_available_tool(
    candidate: CommandCandidate,
    all_paths: Vec<String>,
    should_probe_version: bool,
) -> EnvTool {
    let (size_bytes, size_display) = get_file_size(&candidate.path);
    let install_time = get_file_time(&candidate.path);
    let detector = resolve_tool_detector(&candidate.name);
    let version = should_probe_version
        .then(|| {
            detector
                .and_then(|detector| detect_tool_version(&candidate.path, detector.version_args))
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let classification = classify_env_tool(
        &candidate.name,
        &candidate.path,
        detector,
        &all_paths,
        should_probe_version,
        !version.is_empty(),
    );

    EnvTool {
        name: candidate.name,
        version,
        path: candidate.path.to_string_lossy().to_string(),
        size_bytes,
        size_display,
        install_time,
        available: true,
        category: classification.category,
        source: classification.source,
        kind: classification.kind,
        status: classification.status,
        detector: classification.detector,
        all_paths,
        issue: classification.issue,
    }
}

fn resolve_tool_detector(command_name: &str) -> Option<&'static ToolDetector> {
    let normalized_command = command_key(command_name);
    ENV_TOOL_DETECTORS.iter().find(|detector| {
        detector
            .aliases
            .iter()
            .any(|alias| command_key(alias) == normalized_command)
    })
}

fn classify_env_tool(
    command_name: &str,
    path: &Path,
    detector: Option<&ToolDetector>,
    all_paths: &[String],
    version_probe_attempted: bool,
    version_found: bool,
) -> ToolClassification {
    let source = classify_source(path);
    let kind = classify_kind(path);
    let category = detector
        .map(|detector| detector.category.to_string())
        .unwrap_or_else(|| classify_category(command_name, &source));
    let detector_name = detector
        .map(|detector| detector.name.to_string())
        .unwrap_or_else(|| "path-scan".to_string());
    let issue = if all_paths.len() > 1 {
        "multipleVersions".to_string()
    } else if detector.is_some() && version_probe_attempted && !version_found {
        "versionUnknown".to_string()
    } else {
        String::new()
    };
    let status = if all_paths.len() > 1 {
        "multipleVersions"
    } else if detector.is_some() && version_probe_attempted && !version_found {
        "versionUnknown"
    } else {
        "ok"
    };

    ToolClassification {
        category,
        source,
        kind,
        status: status.to_string(),
        detector: detector_name,
        issue,
    }
}

fn build_unavailable_tool(detector: &ToolDetector) -> EnvTool {
    EnvTool {
        name: detector.name.to_string(),
        version: String::new(),
        path: String::new(),
        size_bytes: 0,
        size_display: String::new(),
        install_time: String::new(),
        available: false,
        category: detector.category.to_string(),
        source: "notFound".to_string(),
        kind: "missing".to_string(),
        status: "missing".to_string(),
        detector: detector.name.to_string(),
        all_paths: Vec::new(),
        issue: "notFound".to_string(),
    }
}

fn detect_tool_version(path: &Path, args: &[&str]) -> Option<String> {
    if args.is_empty() {
        return None;
    }

    let mut child = Command::new(path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;

    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child.wait_with_output().ok()?;
                return extract_version_output(&output.stdout, &output.stderr);
            }
            Ok(None) if start.elapsed() >= VERSION_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

fn extract_version_output(stdout: &[u8], stderr: &[u8]) -> Option<String> {
    let stdout = String::from_utf8_lossy(stdout);
    let stderr = String::from_utf8_lossy(stderr);
    let output = if stdout.trim().is_empty() {
        stderr.trim()
    } else {
        stdout.trim()
    };

    output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(120).collect())
}

fn classify_category(command_name: &str, source: &str) -> String {
    let command = command_name.to_ascii_lowercase();

    if matches!(
        command.as_str(),
        "claude" | "codex" | "cursor" | "gemini" | "ollama" | "opencode" | "windsurf"
    ) {
        return "ai".to_string();
    }
    if matches!(
        command.as_str(),
        "bun" | "corepack" | "deno" | "node" | "npm" | "npx" | "pnpm" | "yarn"
    ) || source == "node"
        || source == "volta"
    {
        return "javascript".to_string();
    }
    if matches!(
        command.as_str(),
        "cargo" | "clippy-driver" | "cross" | "rustc" | "rustfmt" | "rustup"
    ) || command.starts_with("cargo-")
        || source == "cargo"
    {
        return "rust".to_string();
    }
    if matches!(
        command.as_str(),
        "conda"
            | "ipython"
            | "jupyter"
            | "pip"
            | "pip3"
            | "pipx"
            | "poetry"
            | "py"
            | "pyenv"
            | "python"
            | "python3"
            | "uv"
            | "virtualenv"
    ) || source == "python"
        || source == "pyenv"
    {
        return "python".to_string();
    }
    if matches!(
        command.as_str(),
        "docker" | "docker-compose" | "helm" | "k9s" | "kind" | "kubectl" | "minikube" | "podman"
    ) {
        return "container".to_string();
    }
    if matches!(
        command.as_str(),
        "ansible"
            | "aws"
            | "az"
            | "doctl"
            | "fly"
            | "gcloud"
            | "gh"
            | "netlify"
            | "pulumi"
            | "terraform"
            | "vercel"
            | "wrangler"
    ) {
        return "cloud".to_string();
    }
    if matches!(
        command.as_str(),
        "duckdb" | "mariadb" | "mongosh" | "mysql" | "psql" | "redis-cli" | "sqlite3"
    ) {
        return "database".to_string();
    }
    if matches!(
        command.as_str(),
        "code" | "code-insiders" | "emacs" | "nano" | "nvim" | "subl" | "vim"
    ) {
        return "editor".to_string();
    }
    if matches!(
        command.as_str(),
        "curl"
            | "dig"
            | "ngrok"
            | "nslookup"
            | "openssl"
            | "rsync"
            | "scp"
            | "sftp"
            | "ssh"
            | "wget"
    ) {
        return "network".to_string();
    }
    if matches!(
        command.as_str(),
        "apt"
            | "apt-get"
            | "brew"
            | "choco"
            | "dnf"
            | "pacman"
            | "scoop"
            | "winget"
            | "yum"
            | "zypper"
    ) {
        return "packageManager".to_string();
    }
    if matches!(
        command.as_str(),
        "bundle"
            | "composer"
            | "dart"
            | "dotnet"
            | "flutter"
            | "gem"
            | "go"
            | "gofmt"
            | "gradle"
            | "java"
            | "javac"
            | "kotlin"
            | "kotlinc"
            | "lua"
            | "mvn"
            | "perl"
            | "php"
            | "ruby"
            | "swift"
            | "swiftc"
    ) || source == "go"
    {
        return "runtime".to_string();
    }
    if matches!(
        command.as_str(),
        "ar" | "bazel"
            | "clang"
            | "clang++"
            | "cmake"
            | "g++"
            | "gcc"
            | "gdb"
            | "ld"
            | "lldb"
            | "make"
            | "meson"
            | "ninja"
            | "ranlib"
            | "xcodebuild"
    ) {
        return "build".to_string();
    }

    "other".to_string()
}

fn classify_source(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/").to_lowercase();

    if normalized.contains("/node_modules/") || normalized.ends_with("/npm") {
        return "node".to_string();
    }
    if normalized.contains("/.cargo/bin") || normalized.contains("/.rustup/") {
        return "cargo".to_string();
    }
    if normalized.contains("/opt/homebrew/") || normalized.contains("/homebrew/") {
        return "homebrew".to_string();
    }
    if normalized.contains("/.volta/") || normalized.contains("/volta/bin") {
        return "volta".to_string();
    }
    if normalized.contains("/.asdf/") {
        return "asdf".to_string();
    }
    if normalized.contains("/mise/") {
        return "mise".to_string();
    }
    if normalized.contains("/scoop/") {
        return "scoop".to_string();
    }
    if normalized.contains("/chocolatey/") {
        return "chocolatey".to_string();
    }
    if normalized.contains("/go/bin") || normalized.contains("/program files/go/bin") {
        return "go".to_string();
    }
    if normalized.contains("/.pyenv/") || normalized.contains("/pyenv-win/") {
        return "pyenv".to_string();
    }
    if normalized.contains("/python") && normalized.contains("/scripts") {
        return "python".to_string();
    }
    if normalized.contains("/.local/bin") {
        return "local".to_string();
    }

    "path".to_string()
}

fn classify_kind(path: &Path) -> String {
    let extension = path
        .extension()
        .map(|extension| extension.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();

    if matches!(extension.as_str(), "cmd" | "bat" | "ps1") {
        "shim".to_string()
    } else if matches!(
        extension.as_str(),
        "js" | "mjs" | "cjs" | "ts" | "py" | "rb" | "sh"
    ) {
        "script".to_string()
    } else {
        "executable".to_string()
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

    #[cfg(target_os = "macos")]
    for dir in macos_login_shell_path_dirs() {
        push_search_dir(&mut dirs, &mut seen, dir);
    }

    for dir in platform_default_dirs() {
        push_search_dir(&mut dirs, &mut seen, dir);
    }

    dirs
}

#[cfg(target_os = "macos")]
fn macos_login_shell_path_dirs() -> Vec<PathBuf> {
    let shell = env::var_os("SHELL")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from("/bin/zsh"));

    let mut child = match Command::new(&shell)
        .args(["-lc", "print -r -- $PATH"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(_) => return Vec::new(),
    };

    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => {
                let output = match child.wait_with_output() {
                    Ok(out) => out,
                    Err(_) => return Vec::new(),
                };
                let path_value = String::from_utf8_lossy(&output.stdout);
                return env::split_paths(OsStr::new(path_value.trim())).collect();
            }
            Ok(Some(_)) => return Vec::new(),
            Ok(None) if start.elapsed() >= SHELL_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return Vec::new();
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Vec::new();
            }
        }
    }
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
            dirs.push(home.join(".pyenv").join("pyenv-win").join("bin"));
            dirs.push(home.join(".pyenv").join("pyenv-win").join("shims"));
            dirs.push(home.join(".local").join("bin"));
            dirs.push(
                home.join("AppData")
                    .join("Roaming")
                    .join("Python")
                    .join("Scripts"),
            );
            push_existing_child_dirs(
                &mut dirs,
                &home
                    .join("AppData")
                    .join("Local")
                    .join("Programs")
                    .join("Python"),
                "Scripts",
            );
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
        for dir in windows_registry_dirs() {
            dirs.push(dir);
        }

        push_env_child(&mut dirs, "APPDATA", &["npm"]);
        push_env_child(&mut dirs, "APPDATA", &["Python", "Scripts"]);
        push_env_child(&mut dirs, "LOCALAPPDATA", &["pnpm"]);
        push_env_child(&mut dirs, "LOCALAPPDATA", &["Volta", "bin"]);
        push_env_child(
            &mut dirs,
            "LOCALAPPDATA",
            &["Programs", "Microsoft VS Code", "bin"],
        );
        push_env_child(&mut dirs, "ProgramData", &["chocolatey", "bin"]);

        // Use env vars for Program Files to support non-English Windows
        if let Some(pf) = env::var_os("ProgramFiles") {
            dirs.push(PathBuf::from(&pf).join("nodejs"));
            dirs.push(PathBuf::from(&pf).join("Go").join("bin"));
            dirs.push(PathBuf::from(&pf).join("Git").join("cmd"));
            dirs.push(
                PathBuf::from(&pf)
                    .join("Docker")
                    .join("Docker")
                    .join("resources")
                    .join("bin"),
            );
        }
        if let Some(pfx86) = env::var_os("ProgramFiles(x86)") {
            dirs.push(PathBuf::from(&pfx86).join("Microsoft VS Code").join("bin"));
        } else if let Some(pf) = env::var_os("ProgramFiles") {
            dirs.push(PathBuf::from(&pf).join("Microsoft VS Code").join("bin"));
        }
        // Python Scripts from LOCALAPPDATA instead of root C:\Python*
        push_env_child(&mut dirs, "LOCALAPPDATA", &["Programs", "Python", "Launcher"]);
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

#[cfg(target_os = "windows")]
fn push_existing_child_dirs(dirs: &mut Vec<PathBuf>, parent: &Path, child: &str) {
    let entries = match fs::read_dir(parent) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let child_dir = entry.path().join(child);
        if child_dir.is_dir() {
            dirs.push(child_dir);
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_registry_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for key in [
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\git.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\git.exe",
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\node.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\node.exe",
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\Code.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\Code.exe",
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\python.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\python.exe",
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\python3.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\python3.exe",
    ] {
        if let Some(dir) = query_windows_app_path_dir(key) {
            dirs.push(dir);
        }
    }
    dirs
}

#[cfg(target_os = "windows")]
fn query_windows_app_path_dir(key: &str) -> Option<PathBuf> {
    let output = Command::new("reg")
        .args(["query", key, "/ve"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find_map(parse_windows_registry_value_line)
        .and_then(|path| path.parent().map(Path::to_path_buf))
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn parse_windows_registry_value_line(line: &str) -> Option<PathBuf> {
    let trimmed = line.trim();
    if trimmed.is_empty() || !trimmed.contains("REG_") {
        return None;
    }

    let value = trimmed
        .split_whitespace()
        .skip_while(|part| !part.starts_with("REG_"))
        .skip(1)
        .collect::<Vec<_>>()
        .join(" ");
    if value.is_empty() {
        None
    } else {
        Some(PathBuf::from(value))
    }
}

fn is_scannable_dir(path: &Path) -> bool {
    path.is_dir() && !is_os_system_dir(path) && !is_project_local_bin_dir(path)
}

fn is_os_system_dir(path: &Path) -> bool {
    let normalized = normalize_path_key(path);

    if cfg!(windows) {
        return normalized == "c:/windows";
    }

    matches!(
        normalized.as_str(),
        "/usr/lib" | "/lib" | "/library/apple/usr/bin"
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

    #[test]
    fn resolves_known_tool_detector_by_alias() {
        let detector = resolve_tool_detector("python3").unwrap();

        assert_eq!(detector.name, "python");
        assert_eq!(detector.category, "python");
    }

    #[test]
    fn classifies_windows_python_source() {
        let source = classify_source(Path::new(
            r"C:\Users\me\AppData\Local\Programs\Python\Python312\Scripts\pip.exe",
        ));

        assert_eq!(source, "python");
    }

    #[test]
    fn builds_missing_detector_profile() {
        let tool = build_unavailable_tool(resolve_tool_detector("node").unwrap());

        assert_eq!(tool.name, "node");
        assert!(!tool.available);
        assert_eq!(tool.status, "missing");
        assert_eq!(tool.source, "notFound");
    }

    #[test]
    fn extracts_first_version_line_from_stderr_fallback() {
        let version = extract_version_output(b"", b"java 21.0.1\nextra").unwrap();

        assert_eq!(version, "java 21.0.1");
    }

    #[test]
    fn keeps_global_command_dirs_scannable() {
        assert!(!is_os_system_dir(Path::new("/usr/bin")));
        assert!(!is_os_system_dir(Path::new("/bin")));
        assert!(is_project_local_bin_dir(Path::new(
            "/project/node_modules/.bin"
        )));
    }

    #[test]
    fn parses_windows_registry_app_path_output_line() {
        let path = parse_windows_registry_value_line(
            r"(Default)    REG_SZ    C:\Program Files\Git\cmd\git.exe",
        )
        .unwrap();

        assert_eq!(path, PathBuf::from(r"C:\Program Files\Git\cmd\git.exe"));
    }
}
