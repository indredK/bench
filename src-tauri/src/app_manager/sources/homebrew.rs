use super::UpdaterSource;
use crate::app_manager::run_command_with_timeout;
use crate::app_manager::types::{AppInfo, SourceType, UpdateInfo, UpdateSource};
use async_trait::async_trait;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::Duration;

const BREW_COMMAND_TIMEOUT: Duration = Duration::from_secs(30);

const BREW_PATHS: &[&str] = &[
    "/opt/homebrew/bin/brew",
    "/usr/local/bin/brew",
    "/usr/bin/brew",
];

#[derive(Debug, Deserialize)]
struct OutdatedV2 {
    #[serde(default)]
    casks: Vec<OutdatedCask>,
}

#[derive(Debug, Deserialize)]
struct OutdatedCask {
    name: String,
    #[serde(default)]
    installed_versions: Vec<String>,
    current_version: String,
}

#[derive(Debug, Clone)]
struct CaskUpdate {
    current_version: String,
    latest_version: String,
}

fn find_brew() -> Option<PathBuf> {
    for path in BREW_PATHS {
        let p = Path::new(path);
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }
    if let Ok(output) = Command::new("which").arg("brew").output() {
        let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path_str.is_empty() {
            return Some(PathBuf::from(path_str));
        }
    }
    None
}

fn parse_v2(stdout: &str) -> Option<HashMap<String, CaskUpdate>> {
    let parsed: OutdatedV2 = serde_json::from_str(stdout).ok()?;
    let mut map = HashMap::new();
    for cask in parsed.casks {
        let current = cask
            .installed_versions
            .into_iter()
            .next()
            .unwrap_or_default();
        map.insert(
            cask.name.to_lowercase(),
            CaskUpdate {
                current_version: current,
                latest_version: cask.current_version,
            },
        );
    }
    Some(map)
}

/// Fallback for old brew versions that don't speak `--json=v2`. The plain
/// stdout format looks like `name (1.0) < 1.1`; map each line to a CaskUpdate.
fn parse_plain(stdout: &str) -> HashMap<String, CaskUpdate> {
    let mut map = HashMap::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let (name, rest) = line.split_once(' ').unwrap_or((line, ""));
        let mut current = String::new();
        let mut latest = String::new();
        if let Some(open) = rest.find('(') {
            if let Some(close) = rest.find(')') {
                current = rest[open + 1..close].trim().to_string();
            }
            if let Some(arrow) = rest.find('<') {
                latest = rest[arrow + 1..].trim().to_string();
            }
        }
        map.insert(
            name.to_lowercase(),
            CaskUpdate {
                current_version: current,
                latest_version: latest,
            },
        );
    }
    map
}

fn fetch_outdated() -> Result<HashMap<String, CaskUpdate>, String> {
    let Some(brew) = find_brew() else {
        return Ok(HashMap::new());
    };

    let v2 = run_command_with_timeout(
        Command::new(&brew).args(["outdated", "--cask", "--json=v2"]),
        BREW_COMMAND_TIMEOUT,
    )
    .map_err(|e| format!("brew outdated --json=v2 failed to spawn: {e}"))?;
    if v2.status.success() {
        let stdout = String::from_utf8_lossy(&v2.stdout);
        if let Some(map) = parse_v2(&stdout) {
            return Ok(map);
        }
    }

    // Fallback: plain stdout
    let plain = run_command_with_timeout(
        Command::new(&brew).args(["outdated", "--cask"]),
        BREW_COMMAND_TIMEOUT,
    )
    .map_err(|e| format!("brew outdated failed to spawn: {e}"))?;
    if !plain.status.success() {
        let stderr = String::from_utf8_lossy(&plain.stderr);
        return Err(format!("SU_BREW_OUTDATED_FAIL: {}", stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&plain.stdout);
    Ok(parse_plain(&stdout))
}

pub struct HomebrewSource {
    cache: OnceLock<Result<HashMap<String, CaskUpdate>, String>>,
}

impl HomebrewSource {
    pub fn new() -> Self {
        Self {
            cache: OnceLock::new(),
        }
    }

    fn outdated(&self) -> &Result<HashMap<String, CaskUpdate>, String> {
        self.cache.get_or_init(fetch_outdated)
    }
}

#[async_trait]
impl UpdaterSource for HomebrewSource {
    fn id(&self) -> UpdateSource {
        UpdateSource::Homebrew
    }

    fn applies_to(&self, app: &AppInfo) -> bool {
        app.source_type == SourceType::HomebrewCask.to_string() && !app.source_id.is_empty()
    }

    async fn check_for_update(&self, app: &AppInfo) -> Result<Option<UpdateInfo>, String> {
        let map = match self.outdated() {
            Ok(m) => m,
            Err(e) => return Err(e.clone()),
        };
        let Some(update) = map.get(&app.source_id.to_lowercase()) else {
            return Ok(None);
        };

        Ok(Some(UpdateInfo {
            app_id: app.app_id.clone(),
            app_name: app.name.clone(),
            source: UpdateSource::Homebrew,
            current_version: if update.current_version.is_empty() {
                app.version.clone()
            } else {
                update.current_version.clone()
            },
            latest_version: update.latest_version.clone(),
            download_url: None,
            adam_id: None,
            release_notes_url: None,
            release_notes_inline: None,
            size: None,
            source_meta: None,
            feed_url: None,
            ignored: false,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_v2_extracts_versions() {
        let json = r#"{
            "casks": [
                {
                    "name": "rectangle",
                    "installed_versions": ["0.65"],
                    "current_version": "0.78"
                },
                {
                    "name": "iterm2",
                    "installed_versions": ["3.4.20"],
                    "current_version": "3.5.0"
                }
            ]
        }"#;
        let map = parse_v2(json).expect("should parse");
        assert_eq!(map.len(), 2);
        let rect = map.get("rectangle").unwrap();
        assert_eq!(rect.current_version, "0.65");
        assert_eq!(rect.latest_version, "0.78");
    }

    #[test]
    fn parse_v2_handles_empty_casks() {
        let json = r#"{ "casks": [] }"#;
        let map = parse_v2(json).expect("should parse");
        assert!(map.is_empty());
    }

    #[test]
    fn parse_plain_handles_brew_outdated_format() {
        let stdout = "rectangle (0.65) < 0.78\niterm2 (3.4.20) < 3.5.0\n";
        let map = parse_plain(stdout);
        assert_eq!(map.len(), 2);
        let rect = map.get("rectangle").unwrap();
        assert_eq!(rect.current_version, "0.65");
        assert_eq!(rect.latest_version, "0.78");
    }
}
