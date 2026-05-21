use std::fs;
use std::path::{Path, PathBuf};

use super::command_files::command_key;
use super::paths::{normalize_path_key, path_has_component};
use super::types::{CommandCandidate, NodeBinInfo, NodeDeclaredBin};

pub(super) fn refine_command_candidate(mut candidate: CommandCandidate) -> Option<CommandCandidate> {
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
