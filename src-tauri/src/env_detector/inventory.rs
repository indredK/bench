use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::PathBuf;

use super::classification::classify_env_tool;
use super::command_files::{
    command_key, command_name_from_file_name, get_file_size, get_file_time, is_executable_file,
    windows_executable_extensions,
};
use super::node_bins::refine_command_candidate;
use super::paths::is_scannable_dir;
use super::types::{CommandCandidate, EnvTool, ToolDetector};
use super::version::detect_tool_version;

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

pub(super) struct CommandInventory {
    candidates_by_name: HashMap<String, CommandCandidate>,
    paths_by_name: HashMap<String, Vec<String>>,
    command_order: Vec<String>,
}

pub(super) fn collect_command_inventory(search_dirs: &[PathBuf]) -> CommandInventory {
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

pub(super) fn diagnose_command_inventory(
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
