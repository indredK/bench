use super::types::ProjectType;
use std::path::{Path, PathBuf};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct CleanupRule {
    pub(super) target: &'static str,
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

pub(super) fn is_skip_dir_name(name: &str) -> bool {
    SKIP_DIR_NAMES.contains(&name)
}

pub(super) fn is_child_of_skip_dir(entry: &walkdir::DirEntry, root: &Path) -> bool {
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

pub(super) fn is_cleanup_dir_name(name: &str) -> bool {
    [
        ProjectType::NodeJs,
        ProjectType::Python,
        ProjectType::Rust,
        ProjectType::Go,
    ]
    .into_iter()
    .any(|project_type| project_type.is_cleanup_dir_name(name))
}

pub(super) fn cleanup_paths_for_project(path: &Path, project_type: ProjectType) -> Vec<PathBuf> {
    project_type
        .cleanup_rules()
        .iter()
        .map(|rule| path.join(rule.target))
        .collect()
}

pub(super) fn project_has_indicator(path: &Path, project_type: ProjectType) -> bool {
    project_type
        .indicator_files()
        .iter()
        .any(|indicator| path.join(indicator).is_file())
}

impl ProjectType {
    pub(super) fn from_indicator(file_name: &str) -> Option<Self> {
        match file_name {
            "package.json" => Some(ProjectType::NodeJs),
            "Cargo.toml" => Some(ProjectType::Rust),
            "pyproject.toml" | "requirements.txt" => Some(ProjectType::Python),
            "go.mod" => Some(ProjectType::Go),
            _ => None,
        }
    }

    pub(super) fn from_skip_dir(dir_name: &str) -> Self {
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
            ProjectType::Mixed | ProjectType::General => &[],
        }
    }

    pub(super) fn cleanup_rules(self) -> &'static [CleanupRule] {
        match self {
            ProjectType::NodeJs => NODEJS_CLEANUP_RULES,
            ProjectType::Python => PYTHON_CLEANUP_RULES,
            ProjectType::Rust => RUST_CLEANUP_RULES,
            ProjectType::Go => GO_CLEANUP_RULES,
            ProjectType::Mixed | ProjectType::General => &[],
        }
    }

    pub(super) fn is_cleanup_dir_name(self, dir_name: &str) -> bool {
        self.cleanup_rules()
            .iter()
            .any(|rule| rule.target == dir_name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

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
}
