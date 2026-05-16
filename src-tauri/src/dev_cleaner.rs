use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use walkdir::WalkDir;

const SKIP_DIR_NAMES: &[&str] = &[
    "node_modules", "target", ".venv", "venv", "__pycache__",
    ".git", "dist", ".next", "vendor", ".nuxt", "build", ".cache",
];

fn is_skip_dir_name(name: &str) -> bool {
    SKIP_DIR_NAMES.contains(&name)
}

fn is_skip_dir_entry(entry: &walkdir::DirEntry) -> bool {
    entry.file_type().is_dir()
        && entry.file_name().to_str().map(is_skip_dir_name).unwrap_or(false)
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
        c.as_os_str().to_str().map(is_skip_dir_name).unwrap_or(false)
    })
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum ProjectType {
    NodeJs,
    Python,
    Rust,
    Go,
    General,
}

impl ProjectType {
    fn as_str(self) -> &'static str {
        match self {
            ProjectType::NodeJs => "NodeJs",
            ProjectType::Python => "Python",
            ProjectType::Rust => "Rust",
            ProjectType::Go => "Go",
            ProjectType::General => "General",
        }
    }

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
        match dir_name {
            "node_modules" | "dist" | ".next" | ".nuxt" | "build" | ".cache" => ProjectType::NodeJs,
            ".venv" | "venv" | "__pycache__" => ProjectType::Python,
            "target" => ProjectType::Rust,
            "vendor" => ProjectType::Go,
            _ => ProjectType::General,
        }
    }

    fn cleanup_targets(self) -> &'static [&'static str] {
        match self {
            ProjectType::NodeJs => &["node_modules", "dist", ".next"],
            ProjectType::Python => &[".venv", "venv", "__pycache__"],
            ProjectType::Rust => &["target"],
            ProjectType::Go => &["vendor"],
            ProjectType::General => &[],
        }
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

#[derive(Debug, Serialize, Clone)]
pub struct ProjectInfo {
    pub path: String,
    pub name: String,
    pub total_size: u64,
    pub target_size: u64,
    pub last_modified: u64,
    pub dependencies_count: u32,
    pub project_type: String,
    pub cleanup_potential: u64,
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
pub async fn scan_dev_projects(root_path: String, _max_depth: u32, _min_size_mb: u64, flag: tauri::State<'_, ScanAbortFlag>) -> Result<ScanResult, String> {
    flag.store(false, Ordering::SeqCst);
    let abort = flag.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        let start_time = std::time::Instant::now();
        let mut projects = Vec::new();
        let mut total_size = 0u64;
        let mut total_cleanup_size = 0u64;
        let mut aborted = false;

        let root_path_ref = Path::new(&root_path);

        let mut push_project = |p: ProjectInfo| {
            total_size += p.total_size;
            total_cleanup_size += p.cleanup_potential;
            projects.push(p);
        };

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
                    push_project(project);
                }
            } else if entry.file_type().is_dir() && is_skip_dir_name(&file_name) {
                if let Ok(project) = detect_skip_dir_project(path, &file_name, Some(&abort)) {
                    push_project(project);
                }
            }

            if abort.load(Ordering::SeqCst) {
                aborted = true;
                break;
            }
        }

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
pub fn cleanup_projects(paths: Vec<String>, targets: Vec<String>, _backup: bool) -> Result<CleanupResult, String> {
    let mut cleaned_size = 0u64;
    let mut errors = Vec::new();

    for project_path in paths {
        let project_dir = Path::new(&project_path);

        for target in &targets {
            let target_path = project_dir.join(target);

            if target_path.exists() {
                match calculate_dir_size(&target_path, None) {
                    Ok(size) => {
                        cleaned_size += size;
                        if let Err(e) = fs::remove_dir_all(&target_path) {
                            errors.push(format!("Failed to remove {}: {}", target_path.display(), e));
                        }
                    }
                    Err(e) => {
                        errors.push(format!("Failed to calculate size of {}: {}", target_path.display(), e));
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

fn detect_project(path: &Path, project_type: ProjectType, abort_flag: Option<&Arc<AtomicBool>>) -> Result<ProjectInfo, String> {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let total_size = calculate_dir_size(path, abort_flag)?;

    let mut target_size = 0u64;
    for target in project_type.cleanup_targets() {
        let target_path = path.join(target);
        if target_path.exists() {
            if let Ok(size) = calculate_dir_size(&target_path, abort_flag) {
                target_size += size;
            }
        }
    }

    Ok(ProjectInfo {
        path: path.to_string_lossy().to_string(),
        name,
        total_size,
        target_size,
        last_modified: get_last_modified(path),
        dependencies_count: 0,
        project_type: project_type.as_str().to_string(),
        cleanup_potential: target_size,
    })
}

fn detect_skip_dir_project(path: &Path, dir_name: &str, _abort_flag: Option<&Arc<AtomicBool>>) -> Result<ProjectInfo, String> {
    let pt = ProjectType::from_skip_dir(dir_name);
    let size = get_dir_size_fast(path)?;

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
        project_type: pt.as_str().to_string(),
        cleanup_potential: size,
    })
}

fn calculate_dir_size(path: &Path, abort_flag: Option<&Arc<AtomicBool>>) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }

    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if is_skip_dir_name(name) {
            return get_dir_size_fast(path);
        }
    }

    let mut size = 0u64;

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if is_skip_dir_name(&name_str) {
                if let Ok(skip_size) = get_dir_size_fast(&entry.path()) {
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
        if i % 100 == 0 {
            if let Some(flag) = abort_flag {
                if flag.load(Ordering::SeqCst) {
                    return Ok(0);
                }
            }
        }

        match fs::metadata(entry.path()) {
            Ok(metadata) => {
                if metadata.is_file() {
                    size += metadata.len();
                }
            }
            Err(_e) => {
            }
        }
    }

    Ok(size)
}

fn get_dir_size_fast(path: &Path) -> Result<u64, String> {
    if cfg!(unix) {
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

    let mut size = 0u64;
    for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
        if let Ok(metadata) = fs::metadata(entry.path()) {
            if metadata.is_file() {
                size += metadata.len();
            }
        }
    }
    Ok(size)
}
