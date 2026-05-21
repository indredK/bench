use super::projects::resolve_cleanup_paths;
use super::sizing::calculate_dir_size;
use super::types::{CleanupResult, ProjectInfo};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub(super) fn cleanup_projects(projects: Vec<ProjectInfo>) -> Result<CleanupResult, String> {
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

            let canonical_target = target_path
                .canonicalize()
                .unwrap_or_else(|_| target_path.clone());
            let canonical_project = project_dir
                .canonicalize()
                .unwrap_or_else(|_| project_dir.to_path_buf());

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
