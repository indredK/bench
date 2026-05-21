use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

const SKIP_DIR_NAMES: &[&str] = &[
    "node_modules",
    "target",
    ".venv",
    "venv",
    "__pycache__",
    ".git",
    "dist",
    ".next",
    "vendor",
    ".nuxt",
    "build",
    ".cache",
];

fn is_skip_dir_name(name: &str) -> bool {
    SKIP_DIR_NAMES.contains(&name)
}

fn is_skip_dir_entry(entry: &walkdir::DirEntry) -> bool {
    entry.file_type().is_dir()
        && entry
            .file_name()
            .to_str()
            .map(is_skip_dir_name)
            .unwrap_or(false)
}

fn is_child_of_skip_dir(entry: &walkdir::DirEntry, root: &Path) -> bool {
    let rel_path = match entry.path().strip_prefix(root) {
        Ok(p) => p,
        Err(_) => return false,
    };

    let components: Vec<_> = rel_path.components().collect();
    if components.is_empty() {
        return false;
    }

    let last_is_skip = components
        .last()
        .and_then(|c| c.as_os_str().to_str())
        .map(is_skip_dir_name)
        .unwrap_or(false);

    if last_is_skip {
        return false;
    }

    components.iter().any(|c| {
        c.as_os_str()
            .to_str()
            .map(is_skip_dir_name)
            .unwrap_or(false)
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ProjectType {
    NodeJs,
    Python,
    Rust,
    Go,
    General,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct CleanupRule {
    target: &'static str,
}

const NODEJS_CLEANUP_RULES: &[CleanupRule] = &[
    CleanupRule {
        target: "node_modules",
    },
    CleanupRule { target: "dist" },
    CleanupRule { target: ".next" },
    CleanupRule { target: ".nuxt" },
    CleanupRule { target: "build" },
    CleanupRule { target: ".cache" },
];

const PYTHON_CLEANUP_RULES: &[CleanupRule] = &[
    CleanupRule { target: ".venv" },
    CleanupRule { target: "venv" },
    CleanupRule {
        target: "__pycache__",
    },
];

const RUST_CLEANUP_RULES: &[CleanupRule] = &[CleanupRule { target: "target" }];
const GO_CLEANUP_RULES: &[CleanupRule] = &[CleanupRule { target: "vendor" }];

fn is_cleanup_dir_name(name: &str) -> bool {
    [
        ProjectType::NodeJs,
        ProjectType::Python,
        ProjectType::Rust,
        ProjectType::Go,
    ]
    .into_iter()
    .any(|project_type| project_type.is_cleanup_dir_name(name))
}

impl ProjectType {
    fn from_indicator(file_name: &str) -> Option<Self> {
        match file_name {
            "package.json" => Some(ProjectType::NodeJs),
            "Cargo.toml" => Some(ProjectType::Rust),
            "pyproject.toml" | "requirements.txt" => Some(ProjectType::Python),
            "go.mod" => Some(ProjectType::Go),
            _ => None,
        }
    }

    fn from_skip_dir(dir_name: &str) -> Self {
        for project_type in [
            ProjectType::NodeJs,
            ProjectType::Python,
            ProjectType::Rust,
            ProjectType::Go,
        ] {
            if project_type.is_cleanup_dir_name(dir_name) {
                return project_type;
            }
        }

        ProjectType::General
    }

    fn indicator_files(self) -> &'static [&'static str] {
        match self {
            ProjectType::NodeJs => &["package.json"],
            ProjectType::Python => &["pyproject.toml", "requirements.txt"],
            ProjectType::Rust => &["Cargo.toml"],
            ProjectType::Go => &["go.mod"],
            ProjectType::General => &[],
        }
    }

    fn cleanup_rules(self) -> &'static [CleanupRule] {
        match self {
            ProjectType::NodeJs => NODEJS_CLEANUP_RULES,
            ProjectType::Python => PYTHON_CLEANUP_RULES,
            ProjectType::Rust => RUST_CLEANUP_RULES,
            ProjectType::Go => GO_CLEANUP_RULES,
            ProjectType::General => &[],
        }
    }

    fn is_cleanup_dir_name(self, dir_name: &str) -> bool {
        self.cleanup_rules().iter().any(|rule| rule.target == dir_name)
    }
}

fn get_last_modified(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(SystemTime::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectInfo {
    pub path: String,
    pub name: String,
    pub total_size: u64,
    pub target_size: u64,
    pub last_modified: u64,
    pub dependencies_count: u32,
    pub project_type: ProjectType,
    pub cleanup_potential: u64,
    pub cleanup_paths: Vec<String>,
}

pub type ScanAbortFlag = Arc<AtomicBool>;

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub total_projects: u32,
    pub total_size: u64,
    pub total_cleanup_size: u64,
    pub projects: Vec<ProjectInfo>,
    pub scan_time_ms: u64,
    pub aborted: bool,
}

#[derive(Debug, Serialize)]
pub struct CleanupResult {
    pub success: bool,
    pub cleaned_size: u64,
    pub errors: Vec<String>,
}

#[tauri::command]
pub fn stop_scan(flag: tauri::State<ScanAbortFlag>) {
    flag.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn scan_dev_projects(
    root_path: String,
    flag: tauri::State<'_, ScanAbortFlag>,
) -> Result<ScanResult, String> {
    flag.store(false, Ordering::SeqCst);
    let abort = flag.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        let start_time = std::time::Instant::now();
        let mut raw_projects = Vec::new();
        let mut aborted = false;

        let root_path_ref = Path::new(&root_path);

        for entry in WalkDir::new(&root_path)
            .into_iter()
            .filter_entry(|e| !is_child_of_skip_dir(e, root_path_ref))
            .filter_map(|e| e.ok())
        {
            if abort.load(Ordering::SeqCst) {
                aborted = true;
                break;
            }

            let path = entry.path();
            let file_name = path.file_name().unwrap_or_default().to_string_lossy();

            if let Some(pt) = ProjectType::from_indicator(&file_name) {
                if let Ok(project) = detect_project(path.parent().unwrap(), pt, Some(&abort)) {
                    raw_projects.push(project);
                }
            } else if entry.file_type().is_dir() && is_cleanup_dir_name(&file_name) {
                if let Ok(project) = detect_skip_dir_project(path, &file_name, Some(&abort)) {
                    raw_projects.push(project);
                }
            }

            if abort.load(Ordering::SeqCst) {
                aborted = true;
                break;
            }
        }

        let projects = dedupe_projects(raw_projects, Some(&abort));
        let total_size = projects.iter().map(|project| project.total_size).sum();
        let total_cleanup_size = projects
            .iter()
            .map(|project| project.cleanup_potential)
            .sum();
        let scan_time_ms = start_time.elapsed().as_millis() as u64;

        Ok(ScanResult {
            total_projects: projects.len() as u32,
            total_size,
            total_cleanup_size,
            projects,
            scan_time_ms,
            aborted,
        })
    })
    .await
    .map_err(|e| format!("Scan task panicked: {}", e))?
}

#[tauri::command]
pub fn cleanup_projects(projects: Vec<ProjectInfo>) -> Result<CleanupResult, String> {
    let mut cleaned_size = 0u64;
    let mut errors = Vec::new();
    let mut seen_targets = HashSet::<PathBuf>::new();

    for project in projects {
        let project_dir = Path::new(&project.path);

        let cleanup_paths = match resolve_cleanup_paths(&project) {
            Ok(paths) => paths,
            Err(error) => {
                errors.push(error);
                continue;
            }
        };

        for target_path in cleanup_paths {
            if !seen_targets.insert(target_path.clone()) {
                continue;
            }

            let canonical_target = target_path.canonicalize().unwrap_or_else(|_| target_path.clone());
            let canonical_project = project_dir.canonicalize().unwrap_or_else(|_| project_dir.to_path_buf());

            if !canonical_target.starts_with(&canonical_project) {
                errors.push(format!(
                    "Unsafe cleanup path outside project: {}",
                    target_path.display()
                ));
                continue;
            }

            if target_path.exists() {
                match calculate_dir_size(&target_path, None) {
                    Ok(size) => {
                        if let Err(e) = fs::remove_dir_all(&target_path) {
                            errors.push(format!(
                                "Failed to remove {}: {}",
                                target_path.display(),
                                e
                            ));
                        } else {
                            cleaned_size += size;
                        }
                    }
                    Err(e) => {
                        errors.push(format!(
                            "Failed to calculate size of {}: {}",
                            target_path.display(),
                            e
                        ));
                    }
                }
            }
        }
    }

    Ok(CleanupResult {
        success: errors.is_empty(),
        cleaned_size,
        errors,
    })
}

fn count_dependencies(path: &Path, project_type: ProjectType) -> u32 {
    match project_type {
        ProjectType::NodeJs => {
            let pkg = path.join("package.json");
            if pkg.exists() {
                if let Ok(content) = fs::read_to_string(&pkg) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        let mut count = 0u32;
                        if let Some(deps) = json.get("dependencies").and_then(|v| v.as_object()) {
                            count += deps.len() as u32;
                        }
                        if let Some(deps) = json.get("devDependencies").and_then(|v| v.as_object())
                        {
                            count += deps.len() as u32;
                        }
                        return count;
                    }
                }
            }
            0
        }
        ProjectType::Python => {
            let files = &[path.join("requirements.txt"), path.join("pyproject.toml")];
            let mut count = 0u32;
            for f in files {
                if f.exists() {
                    if let Ok(content) = fs::read_to_string(f) {
                        count += content
                            .lines()
                            .filter(|l| {
                                let l = l.trim();
                                !l.is_empty() && !l.starts_with('#')
                            })
                            .count() as u32;
                    }
                }
            }
            count
        }
        ProjectType::Rust => {
            let cargo = path.join("Cargo.toml");
            if cargo.exists() {
                if let Ok(content) = fs::read_to_string(&cargo) {
                    let mut count = 0u32;
                    let mut in_deps = false;
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if trimmed.starts_with('[') {
                            let section = trimmed.trim_start_matches('[').trim_end_matches(']');
                            in_deps = section.starts_with("dependencies")
                                || section.starts_with("build-dependencies")
                                || section.starts_with("dev-dependencies");
                            continue;
                        }
                        if in_deps && trimmed.contains('=') && !trimmed.starts_with('#') {
                            count += 1;
                        }
                    }
                    return count;
                }
            }
            0
        }
        ProjectType::Go => {
            let go_mod = path.join("go.mod");
            if go_mod.exists() {
                if let Ok(content) = fs::read_to_string(&go_mod) {
                    let count = content
                        .lines()
                        .filter(|l| l.starts_with('\t') && !l.trim_start().starts_with("//"))
                        .count();
                    return count.max(1) as u32;
                }
            }
            0
        }
        ProjectType::General => 0,
    }
}

fn collect_existing_cleanup_paths(path: &Path, project_type: ProjectType) -> Vec<PathBuf> {
    cleanup_paths_for_project(path, project_type)
        .into_iter()
        .filter(|target_path| target_path.exists())
        .collect()
}

fn sum_cleanup_paths(paths: &[String], abort_flag: Option<&Arc<AtomicBool>>) -> u64 {
    paths.iter().fold(0u64, |sum, path| {
        sum + calculate_dir_size(Path::new(path), abort_flag).unwrap_or(0)
    })
}

fn is_direct_cleanup_entry(project: &ProjectInfo) -> bool {
    matches!(project.cleanup_paths.as_slice(), [only_path] if only_path == &project.path)
}

fn merge_project_info(
    existing: &mut ProjectInfo,
    candidate: ProjectInfo,
    abort_flag: Option<&Arc<AtomicBool>>,
) {
    let ProjectInfo {
        name: candidate_name,
        total_size: candidate_total_size,
        target_size: candidate_target_size,
        last_modified: candidate_last_modified,
        dependencies_count: candidate_dependencies_count,
        project_type: candidate_project_type,
        cleanup_potential: candidate_cleanup_potential,
        cleanup_paths: candidate_cleanup_paths,
        ..
    } = candidate;

    let candidate_is_more_specific = candidate_cleanup_potential > existing.cleanup_potential
        || (candidate_cleanup_paths.len() > existing.cleanup_paths.len()
            && candidate_project_type != existing.project_type);

    if candidate_is_more_specific {
        existing.project_type = candidate_project_type;
        existing.name = candidate_name;
    }

    existing.total_size = existing.total_size.max(candidate_total_size);
    existing.last_modified = existing.last_modified.max(candidate_last_modified);
    existing.dependencies_count = existing.dependencies_count.max(candidate_dependencies_count);

    let mut seen_cleanup_paths = existing.cleanup_paths.iter().cloned().collect::<HashSet<_>>();
    let mut cleanup_paths_changed = false;

    for cleanup_path in candidate_cleanup_paths {
        if seen_cleanup_paths.insert(cleanup_path.clone()) {
            existing.cleanup_paths.push(cleanup_path);
            cleanup_paths_changed = true;
        }
    }

    if cleanup_paths_changed {
        let cleanup_size = sum_cleanup_paths(&existing.cleanup_paths, abort_flag);
        existing.target_size = cleanup_size;
        existing.cleanup_potential = cleanup_size;
    } else {
        existing.target_size = existing.target_size.max(candidate_target_size);
        existing.cleanup_potential = existing.cleanup_potential.max(candidate_cleanup_potential);
    }
}

fn dedupe_projects(
    projects: Vec<ProjectInfo>,
    abort_flag: Option<&Arc<AtomicBool>>,
) -> Vec<ProjectInfo> {
    let mut merged_projects = Vec::new();
    let mut index_by_path = HashMap::<String, usize>::new();

    for project in projects {
        if let Some(index) = index_by_path.get(&project.path).copied() {
            merge_project_info(&mut merged_projects[index], project, abort_flag);
        } else {
            index_by_path.insert(project.path.clone(), merged_projects.len());
            merged_projects.push(project);
        }
    }

    let covered_cleanup_dirs = merged_projects
        .iter()
        .filter(|project| !is_direct_cleanup_entry(project))
        .flat_map(|project| project.cleanup_paths.iter().cloned())
        .collect::<HashSet<_>>();

    merged_projects
        .into_iter()
        .filter(|project| project.cleanup_potential > 0)
        .filter(|project| {
            !is_direct_cleanup_entry(project) || !covered_cleanup_dirs.contains(&project.path)
        })
        .collect()
}

fn detect_project(
    path: &Path,
    project_type: ProjectType,
    abort_flag: Option<&Arc<AtomicBool>>,
) -> Result<ProjectInfo, String> {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let total_size = calculate_dir_size(path, abort_flag)?;

    let cleanup_paths = collect_existing_cleanup_paths(path, project_type);
    let target_size = cleanup_paths.iter().fold(0u64, |sum, cleanup_path| {
        sum + calculate_dir_size(cleanup_path, abort_flag).unwrap_or(0)
    });

    let dependencies_count = count_dependencies(path, project_type);
    Ok(ProjectInfo {
        path: path.to_string_lossy().to_string(),
        name,
        total_size,
        target_size,
        last_modified: get_last_modified(path),
        dependencies_count,
        project_type,
        cleanup_potential: target_size,
        cleanup_paths: cleanup_paths
            .into_iter()
            .map(|cleanup_path| cleanup_path.to_string_lossy().to_string())
            .collect(),
    })
}

fn detect_skip_dir_project(
    path: &Path,
    dir_name: &str,
    abort_flag: Option<&Arc<AtomicBool>>,
) -> Result<ProjectInfo, String> {
    let pt = ProjectType::from_skip_dir(dir_name);
    let size = get_dir_size_fast(path, abort_flag)?;

    let parent_name = path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let name = if parent_name.is_empty() {
        dir_name.to_string()
    } else {
        format!("{}/{}", parent_name, dir_name)
    };

    Ok(ProjectInfo {
        path: path.to_string_lossy().to_string(),
        name,
        total_size: size,
        target_size: size,
        last_modified: get_last_modified(path),
        dependencies_count: 0,
        project_type: pt,
        cleanup_potential: size,
        cleanup_paths: vec![path.to_string_lossy().to_string()],
    })
}

fn cleanup_paths_for_project(path: &Path, project_type: ProjectType) -> Vec<PathBuf> {
    project_type
        .cleanup_rules()
        .iter()
        .map(|rule| path.join(rule.target))
        .collect()
}

fn project_has_indicator(path: &Path, project_type: ProjectType) -> bool {
    project_type
        .indicator_files()
        .iter()
        .any(|indicator| path.join(indicator).is_file())
}

fn resolve_cleanup_paths(project: &ProjectInfo) -> Result<Vec<PathBuf>, String> {
    if !project.cleanup_paths.is_empty() {
        return Ok(project
            .cleanup_paths
            .iter()
            .map(PathBuf::from)
            .collect());
    }

    let project_path = Path::new(&project.path);

    if project_has_indicator(project_path, project.project_type) {
        return Ok(cleanup_paths_for_project(project_path, project.project_type));
    }

    let dir_name = project_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();

    if project.project_type.is_cleanup_dir_name(dir_name) {
        return Ok(vec![project_path.to_path_buf()]);
    }

    Err(format!(
        "Unrecognized cleanup request: {}",
        project_path.display()
    ))
}

fn calculate_dir_size(path: &Path, abort_flag: Option<&Arc<AtomicBool>>) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }

    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if is_skip_dir_name(name) {
            return get_dir_size_fast(path, abort_flag);
        }
    }

    let mut size = 0u64;

    if let Ok(entries) = fs::read_dir(path) {
        for (i, entry) in entries.flatten().enumerate() {
            if let Some(flag) = abort_flag {
                if i % 100 == 0 && flag.load(Ordering::SeqCst) {
                    return Ok(0);
                }
            }
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if is_skip_dir_name(&name_str) {
                if let Ok(skip_size) = get_dir_size_fast(&entry.path(), abort_flag) {
                    size += skip_size;
                }
            }
        }
    }

    for (i, entry) in WalkDir::new(path)
        .into_iter()
        .filter_entry(|e| !is_skip_dir_entry(e))
        .filter_map(|e| e.ok())
        .enumerate()
    {
        if let Some(flag) = abort_flag {
            if i % 100 == 0 && flag.load(Ordering::SeqCst) {
                return Ok(0);
            }
        }

        if let Ok(metadata) = fs::metadata(entry.path()) {
            if metadata.is_file() {
                size += metadata.len();
            }
        }
    }

    Ok(size)
}

fn get_dir_size_fast(path: &Path, abort_flag: Option<&Arc<AtomicBool>>) -> Result<u64, String> {
    if let Some(flag) = abort_flag {
        if flag.load(Ordering::SeqCst) {
            return Ok(0);
        }
    }

    #[cfg(unix)]
    {
        if let Ok(output) = Command::new("du")
            .args(["-sk", &path.to_string_lossy().to_string()])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(size_str) = stdout.split_whitespace().next() {
                    if let Ok(kb) = size_str.parse::<u64>() {
                        return Ok(kb * 1024);
                    }
                }
            }
        }
    }

    #[cfg(windows)]
    {
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!(
                    "((Get-ChildItem -Recurse -Force -ErrorAction SilentlyContinue '{}' | Where-Object {{ -not $_.PSIsContainer }} | Measure-Object -Sum Length).Sum)",
                    path.to_string_lossy().replace('\'', "''")
                ),
            ])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !stdout.is_empty() {
                    if let Ok(bytes) = stdout.parse::<u64>() {
                        return Ok(bytes);
                    }
                }
            }
        }
    }

    let mut size = 0u64;
    for (i, entry) in WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .enumerate()
    {
        if let Some(flag) = abort_flag {
            if i % 100 == 0 && flag.load(Ordering::SeqCst) {
                return Ok(0);
            }
        }
        if let Ok(metadata) = fs::metadata(entry.path()) {
            if metadata.is_file() {
                size += metadata.len();
            }
        }
    }
    Ok(size)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn test_is_skip_dir_name_known() {
        assert!(is_skip_dir_name("node_modules"));
        assert!(is_skip_dir_name("target"));
        assert!(is_skip_dir_name(".venv"));
        assert!(is_skip_dir_name("venv"));
        assert!(is_skip_dir_name("__pycache__"));
        assert!(is_skip_dir_name(".git"));
        assert!(is_skip_dir_name("dist"));
        assert!(is_skip_dir_name(".next"));
        assert!(is_skip_dir_name("vendor"));
        assert!(is_skip_dir_name(".nuxt"));
        assert!(is_skip_dir_name("build"));
        assert!(is_skip_dir_name(".cache"));
    }

    #[test]
    fn test_is_skip_dir_name_unknown() {
        assert!(!is_skip_dir_name("src"));
        assert!(!is_skip_dir_name("lib"));
        assert!(!is_skip_dir_name("my_project"));
        assert!(!is_skip_dir_name(""));
    }

    #[test]
    fn test_project_type_from_indicator() {
        assert_eq!(
            ProjectType::from_indicator("package.json"),
            Some(ProjectType::NodeJs)
        );
        assert_eq!(
            ProjectType::from_indicator("Cargo.toml"),
            Some(ProjectType::Rust)
        );
        assert_eq!(
            ProjectType::from_indicator("pyproject.toml"),
            Some(ProjectType::Python)
        );
        assert_eq!(
            ProjectType::from_indicator("requirements.txt"),
            Some(ProjectType::Python)
        );
        assert_eq!(ProjectType::from_indicator("go.mod"), Some(ProjectType::Go));
    }

    #[test]
    fn test_project_type_from_indicator_unknown() {
        assert_eq!(ProjectType::from_indicator("README.md"), None);
        assert_eq!(ProjectType::from_indicator("Makefile"), None);
        assert_eq!(ProjectType::from_indicator(""), None);
    }

    #[test]
    fn test_project_type_from_skip_dir() {
        assert_eq!(
            ProjectType::from_skip_dir("node_modules"),
            ProjectType::NodeJs
        );
        assert_eq!(ProjectType::from_skip_dir("dist"), ProjectType::NodeJs);
        assert_eq!(ProjectType::from_skip_dir(".next"), ProjectType::NodeJs);
        assert_eq!(ProjectType::from_skip_dir(".nuxt"), ProjectType::NodeJs);
        assert_eq!(ProjectType::from_skip_dir("build"), ProjectType::NodeJs);
        assert_eq!(ProjectType::from_skip_dir(".cache"), ProjectType::NodeJs);
        assert_eq!(ProjectType::from_skip_dir(".venv"), ProjectType::Python);
        assert_eq!(ProjectType::from_skip_dir("venv"), ProjectType::Python);
        assert_eq!(
            ProjectType::from_skip_dir("__pycache__"),
            ProjectType::Python
        );
        assert_eq!(ProjectType::from_skip_dir("target"), ProjectType::Rust);
        assert_eq!(ProjectType::from_skip_dir("vendor"), ProjectType::Go);
    }

    #[test]
    fn test_project_type_from_skip_dir_unknown() {
        assert_eq!(ProjectType::from_skip_dir("src"), ProjectType::General);
        assert_eq!(ProjectType::from_skip_dir(""), ProjectType::General);
    }

    #[test]
    fn test_cleanup_targets() {
        let node_targets: Vec<_> = ProjectType::NodeJs
            .cleanup_rules()
            .iter()
            .map(|rule| rule.target)
            .collect();
        assert!(node_targets.contains(&"node_modules"));
        assert!(node_targets.contains(&"dist"));
        assert!(node_targets.contains(&".next"));
        assert!(node_targets.contains(&".nuxt"));
        assert!(node_targets.contains(&"build"));
        assert!(node_targets.contains(&".cache"));

        let python_targets: Vec<_> = ProjectType::Python
            .cleanup_rules()
            .iter()
            .map(|rule| rule.target)
            .collect();
        assert!(python_targets.contains(&".venv"));
        assert!(python_targets.contains(&"venv"));
        assert!(python_targets.contains(&"__pycache__"));

        let rust_targets: Vec<_> = ProjectType::Rust
            .cleanup_rules()
            .iter()
            .map(|rule| rule.target)
            .collect();
        assert!(rust_targets.contains(&"target"));

        let go_targets: Vec<_> = ProjectType::Go
            .cleanup_rules()
            .iter()
            .map(|rule| rule.target)
            .collect();
        assert!(go_targets.contains(&"vendor"));

        let general_targets = ProjectType::General.cleanup_rules();
        assert!(general_targets.is_empty());
    }

    #[test]
    fn test_is_cleanup_dir_name() {
        assert!(is_cleanup_dir_name("node_modules"));
        assert!(is_cleanup_dir_name(".nuxt"));
        assert!(is_cleanup_dir_name("build"));
        assert!(is_cleanup_dir_name(".cache"));
        assert!(!is_cleanup_dir_name(".git"));
    }

    #[test]
    fn test_resolve_cleanup_paths_for_project_root() {
        let tmp = std::env::temp_dir().join("tauri_test_cleanup_project_root");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("node_modules")).unwrap();
        fs::write(tmp.join("package.json"), "{}").unwrap();

        let project = ProjectInfo {
            path: tmp.to_string_lossy().to_string(),
            name: "demo".to_string(),
            total_size: 0,
            target_size: 0,
            last_modified: 0,
            dependencies_count: 0,
            project_type: ProjectType::NodeJs,
            cleanup_potential: 0,
            cleanup_paths: vec![],
        };

        let paths = resolve_cleanup_paths(&project).unwrap();
        assert!(paths.contains(&tmp.join("node_modules")));
        assert!(paths.contains(&tmp.join("dist")));
        assert!(paths.contains(&tmp.join(".next")));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_resolve_cleanup_paths_for_skip_dir_project() {
        let tmp = std::env::temp_dir().join("tauri_test_cleanup_skip_dir");
        let skip_dir = tmp.join("sample").join("node_modules");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&skip_dir).unwrap();

        let project = ProjectInfo {
            path: skip_dir.to_string_lossy().to_string(),
            name: "sample/node_modules".to_string(),
            total_size: 0,
            target_size: 0,
            last_modified: 0,
            dependencies_count: 0,
            project_type: ProjectType::NodeJs,
            cleanup_potential: 0,
            cleanup_paths: vec![],
        };

        let paths = resolve_cleanup_paths(&project).unwrap();
        assert_eq!(paths, vec![skip_dir.clone()]);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_resolve_cleanup_paths_rejects_unknown_project_shape() {
        let tmp = std::env::temp_dir().join("tauri_test_cleanup_unknown");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let project = ProjectInfo {
            path: tmp.to_string_lossy().to_string(),
            name: "unknown".to_string(),
            total_size: 0,
            target_size: 0,
            last_modified: 0,
            dependencies_count: 0,
            project_type: ProjectType::NodeJs,
            cleanup_potential: 0,
            cleanup_paths: vec![],
        };

        let error = resolve_cleanup_paths(&project).unwrap_err();
        assert!(error.contains("Unrecognized cleanup request"));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_is_child_of_skip_dir() {
        let tmp = std::env::temp_dir().join("tauri_test_is_child");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("my_project").join("node_modules").join("some_pkg")).unwrap();
        fs::create_dir_all(tmp.join("my_project").join("src")).unwrap();

        let entry_in_node_modules =
            walkdir::WalkDir::new(tmp.join("my_project").join("node_modules").join("some_pkg"))
                .into_iter()
                .filter_map(|e| e.ok())
                .find(|e| e.path().is_dir())
                .unwrap();

        assert!(is_child_of_skip_dir(&entry_in_node_modules, &tmp));

        let entry_in_src = walkdir::WalkDir::new(tmp.join("my_project").join("src"))
            .into_iter()
            .filter_map(|e| e.ok())
            .find(|e| e.path().is_dir())
            .unwrap();

        assert!(!is_child_of_skip_dir(&entry_in_src, &tmp));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_is_child_of_skip_dir_skip_dir_itself() {
        let tmp = std::env::temp_dir().join("tauri_test_is_child_self");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("my_project").join("node_modules")).unwrap();

        let entry = walkdir::WalkDir::new(tmp.join("my_project").join("node_modules"))
            .into_iter()
            .filter_map(|e| e.ok())
            .find(|e| e.path().is_dir())
            .unwrap();

        assert!(!is_child_of_skip_dir(&entry, &tmp));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_get_last_modified_existing_file() {
        let tmp = std::env::temp_dir().join("tauri_test_last_modified");
        fs::create_dir_all(&tmp).unwrap();
        let file_path = tmp.join("test.txt");
        fs::write(&file_path, "hello").unwrap();

        let ts = get_last_modified(&file_path);
        assert!(ts > 0);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_get_last_modified_missing_file() {
        let ts = get_last_modified(&PathBuf::from("/nonexistent/path/foobar"));
        assert_eq!(ts, 0);
    }

    #[test]
    fn test_calculate_dir_size_empty() {
        let tmp = std::env::temp_dir().join("tauri_test_empty_dir");
        fs::create_dir_all(&tmp).unwrap();

        let size = calculate_dir_size(&tmp, None).unwrap();
        assert_eq!(size, 0);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_calculate_dir_size_with_files() {
        let tmp = std::env::temp_dir().join("tauri_test_size_files");
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("a.txt"), "hello world").unwrap();
        fs::write(tmp.join("b.txt"), "foo bar baz").unwrap();

        let size = calculate_dir_size(&tmp, None).unwrap();
        assert!(size > 0);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_calculate_dir_size_nonexistent() {
        let size = calculate_dir_size(&PathBuf::from("/nonexistent/path/xyz"), None).unwrap();
        assert_eq!(size, 0);
    }

    #[test]
    fn test_count_dependencies_nodejs() {
        let tmp = std::env::temp_dir().join("tauri_test_deps_node");
        fs::create_dir_all(&tmp).unwrap();
        let pkg_json = r#"{"dependencies": {"react": "^18.0.0", "lodash": "^4.0.0"}, "devDependencies": {"typescript": "^5.0.0"}}"#;
        fs::write(tmp.join("package.json"), pkg_json).unwrap();

        let count = count_dependencies(&tmp, ProjectType::NodeJs);
        assert_eq!(count, 3);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_count_dependencies_nodejs_no_file() {
        let tmp = std::env::temp_dir().join("tauri_test_deps_node_empty");
        fs::create_dir_all(&tmp).unwrap();

        let count = count_dependencies(&tmp, ProjectType::NodeJs);
        assert_eq!(count, 0);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_count_dependencies_python() {
        let tmp = std::env::temp_dir().join("tauri_test_deps_python");
        fs::create_dir_all(&tmp).unwrap();
        fs::write(
            tmp.join("requirements.txt"),
            "flask\n# comment\nrequests\n\npytest\n",
        )
        .unwrap();

        let count = count_dependencies(&tmp, ProjectType::Python);
        assert_eq!(count, 3);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_count_dependencies_rust() {
        let tmp = std::env::temp_dir().join("tauri_test_deps_rust");
        fs::create_dir_all(&tmp).unwrap();
        let cargo_toml = r#"[package]
name = "test"
[dependencies]
serde = "1"
tokio = "1"
[dev-dependencies]
criterion = "0.5"
"#;
        fs::write(tmp.join("Cargo.toml"), cargo_toml).unwrap();

        let count = count_dependencies(&tmp, ProjectType::Rust);
        assert_eq!(count, 3);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_count_dependencies_go() {
        let tmp = std::env::temp_dir().join("tauri_test_deps_go");
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("go.mod"), "module example\n\ngo 1.21\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.0\n\tgithub.com/go-sql-driver/mysql v1.7.0\n)\n").unwrap();

        let count = count_dependencies(&tmp, ProjectType::Go);
        assert!(count >= 1);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_count_dependencies_general() {
        let count = count_dependencies(&PathBuf::from("/tmp"), ProjectType::General);
        assert_eq!(count, 0);
    }
}
