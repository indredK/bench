use std::fs;
use std::path::{Path, PathBuf};

use super::command_files::command_key;
use super::paths::{normalize_path_key, path_has_component};
use super::types::{CommandCandidate, NodeBinInfo, NodeDeclaredBin};

pub(super) fn refine_command_candidate(
    mut candidate: CommandCandidate,
) -> Option<CommandCandidate> {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn declared_bin(name: &str, rel: &str) -> NodeDeclaredBin {
        NodeDeclaredBin {
            name: name.to_string(),
            relative_path: rel.to_string(),
        }
    }

    fn node_bin_info(package_name: &str, declared_bins: Vec<NodeDeclaredBin>) -> NodeBinInfo {
        NodeBinInfo {
            package_name: package_name.to_string(),
            declared_bins,
            matched_name: None,
        }
    }

    fn json(raw: &str) -> serde_json::Value {
        serde_json::from_str(raw).unwrap()
    }

    #[test]
    fn package_name_strips_scope() {
        assert_eq!(
            command_name_from_package_name("@vue/cli-service"),
            "cli-service"
        );
        assert_eq!(command_name_from_package_name("eslint"), "eslint");
    }

    #[test]
    fn low_signal_command_name_flags_noise() {
        assert!(is_low_signal_command_name("tsserver"));
        assert!(is_low_signal_command_name("TSServer"));
        assert!(is_low_signal_command_name("typescript-language-server"));
        assert!(is_low_signal_command_name("gopls-lsp"));
        assert!(!is_low_signal_command_name("eslint"));
        assert!(!is_low_signal_command_name("prettier"));
    }

    #[test]
    fn low_signal_node_bin_rules() {
        assert!(is_low_signal_node_bin(
            "tsserver",
            &node_bin_info("typescript", vec![])
        ));
        assert!(is_low_signal_node_bin(
            "x-language-server",
            &node_bin_info("x", vec![])
        ));
        // 多 bin + command 以 server 结尾且非包名本身 → 判为低信号（IDE 后台服务，不是用户 CLI）。
        let multi = node_bin_info(
            "foo",
            vec![
                declared_bin("foo", "index.js"),
                declared_bin("foo-server", "srv.js"),
            ],
        );
        assert!(is_low_signal_node_bin("foo-server", &multi));
        // 单 bin 的真实 CLI 不算低信号。
        assert!(!is_low_signal_node_bin(
            "eslint",
            &node_bin_info("eslint", vec![declared_bin("eslint", "bin.js")])
        ));
    }

    #[test]
    fn parse_declared_bins_string_shorthand() {
        let bins = parse_node_declared_bins(&json(r#"{"bin":"cli.js"}"#), "eslint").unwrap();
        assert_eq!(bins.len(), 1);
        assert_eq!(bins[0].name, "eslint");
        assert_eq!(bins[0].relative_path, "cli.js");
    }

    #[test]
    fn parse_declared_bins_object_map() {
        let mut bins =
            parse_node_declared_bins(&json(r#"{"bin":{"a":"x.js","b":"y.js"}}"#), "pkg").unwrap();
        bins.sort_by(|l, r| l.name.cmp(&r.name));
        assert_eq!(
            bins.iter().map(|b| b.name.as_str()).collect::<Vec<_>>(),
            vec!["a", "b"]
        );
    }

    #[test]
    fn parse_declared_bins_absent_or_empty_is_none() {
        assert!(parse_node_declared_bins(&json("{}"), "pkg").is_none());
        assert!(parse_node_declared_bins(&json(r#"{"bin":{}}"#), "pkg").is_none());
        assert!(parse_node_declared_bins(&json(r#"{"bin":[]}"#), "pkg").is_none());
    }
}
