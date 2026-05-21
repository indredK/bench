use super::rules::{cleanup_paths_for_project, project_has_indicator};
use super::sizing::{calculate_dir_size, get_dir_size_fast, get_last_modified};
use super::types::{ProjectInfo, ProjectType};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

pub(super) fn detect_project(
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

pub(super) fn detect_skip_dir_project(
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

pub(super) fn dedupe_projects(
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

pub(super) fn resolve_cleanup_paths(project: &ProjectInfo) -> Result<Vec<PathBuf>, String> {
    if !project.cleanup_paths.is_empty() {
        return Ok(project.cleanup_paths.iter().map(PathBuf::from).collect());
    }

    let project_path = Path::new(&project.path);

    if project_has_indicator(project_path, project.project_type) {
        return Ok(cleanup_paths_for_project(
            project_path,
            project.project_type,
        ));
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

#[cfg(test)]
mod tests {
    use super::*;

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
