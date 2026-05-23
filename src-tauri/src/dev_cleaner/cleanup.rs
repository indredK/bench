use super::projects::resolve_cleanup_paths;
use super::safe_delete::{safe_delete_within_root, DeleteOutcome};
use super::sizing::calculate_dir_size;
use super::types::{CleanupResult, ProjectInfo};
use std::collections::HashSet;
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
            if !target_path.exists() {
                continue;
            }

            // Compute size before delete so the metric still includes
            // entries that get permanently removed by the fallback. If size
            // calculation fails we still attempt the delete, but skip the
            // metric — surface the calculation failure separately.
            let size_estimate = match calculate_dir_size(&target_path, None) {
                Ok(size) => Some(size),
                Err(e) => {
                    errors.push(format!(
                        "Failed to calculate size of {}: {}",
                        target_path.display(),
                        e
                    ));
                    None
                }
            };

            match safe_delete_within_root(&target_path, project_dir) {
                DeleteOutcome::Trashed => {
                    if let Some(size) = size_estimate {
                        cleaned_size += size;
                    }
                }
                DeleteOutcome::PermanentlyDeleted { trash_error } => {
                    if let Some(size) = size_estimate {
                        cleaned_size += size;
                    }
                    // Trash was unavailable; warn so the user knows nothing
                    // is recoverable from the recycle bin.
                    errors.push(format!(
                        "Recycle bin unavailable for {}; permanently deleted instead ({})",
                        target_path.display(),
                        trash_error
                    ));
                }
                DeleteOutcome::SkippedUnsafe { reason } => {
                    errors.push(format!(
                        "Unsafe cleanup path skipped: {} ({})",
                        target_path.display(),
                        reason
                    ));
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
