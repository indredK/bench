use super::UpdaterSource;
use crate::app_manager::types::{AppInfo, UpdateInfo, UpdateSource};
use async_trait::async_trait;
use std::path::Path;
use std::process::Command;
use std::sync::OnceLock;

/// A MAS-installed app has a `_MASReceipt/receipt` file in its bundle.
pub fn has_mas_receipt(install_path: &str) -> bool {
    let receipt = Path::new(install_path)
        .join("Contents")
        .join("_MASReceipt")
        .join("receipt");
    receipt.exists()
}

/// Read the Adam ID (numeric App Store ID) from the bundle's iTunesMetadata.
/// This lives at `<app>.app/Contents/_MASReceipt/iTunesMetadata.plist` for newer
/// installs, but the more portable way is to read CFBundleIdentifier and let the
/// caller match against a lookup. For v1.0 we just try a best-effort plist read.
pub fn read_adam_id(install_path: &str) -> Option<String> {
    let plist_path = Path::new(install_path)
        .join("Contents")
        .join("_MASReceipt")
        .join("iTunesMetadata.plist");
    if !plist_path.exists() {
        return None;
    }
    let dict = plist::Value::from_file(&plist_path)
        .ok()?
        .into_dictionary()?;
    dict.get("itemId").map(|v| match v {
        plist::Value::Integer(i) => i.to_string(),
        plist::Value::String(s) => s.clone(),
        _ => String::new(),
    })
}

/// Parse `softwareupdate --list --no-scan` output. Only MAS app updates have
/// `Action: restart` absent and a `Title:` line that doesn't look like macOS.
fn parse_softwareupdate(stdout: &str) -> Vec<String> {
    let mut names = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        // Modern format: "* Label: <name>"
        if let Some(rest) = line.strip_prefix("* Label: ") {
            names.push(rest.to_string());
            continue;
        }
        // Legacy format: "   * <name>-<version>"
        if let Some(rest) = line.strip_prefix("* ") {
            if !rest.contains("Label:") {
                names.push(rest.to_string());
            }
        }
    }
    names
}

fn fetch_pending_updates() -> Result<Vec<String>, String> {
    let output = Command::new("/usr/sbin/softwareupdate")
        .args(["--list", "--no-scan"])
        .output()
        .map_err(|e| format!("softwareupdate failed to spawn: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("SU_MAS_LIST_FAIL: {}", stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_softwareupdate(&stdout))
}

pub struct MacAppStoreSource {
    cache: OnceLock<Result<Vec<String>, String>>,
}

impl MacAppStoreSource {
    pub fn new() -> Self {
        Self {
            cache: OnceLock::new(),
        }
    }

    fn pending(&self) -> &Result<Vec<String>, String> {
        self.cache.get_or_init(fetch_pending_updates)
    }
}

#[async_trait]
impl UpdaterSource for MacAppStoreSource {
    fn id(&self) -> UpdateSource {
        UpdateSource::MacAppStore
    }

    fn applies_to(&self, app: &AppInfo) -> bool {
        // Don't shadow the Homebrew source for cask-installed apps.
        if app.source_type == "Homebrew Cask" {
            return false;
        }
        has_mas_receipt(&app.install_path)
    }

    async fn check_for_update(&self, app: &AppInfo) -> Result<Option<UpdateInfo>, String> {
        let pending = match self.pending() {
            Ok(list) => list,
            Err(e) => return Err(e.clone()),
        };

        let name_lower = app.name.to_lowercase();
        // softwareupdate output uses internal labels (e.g., "Bear-1.9.8") that
        // are hard to match precisely. We do a forgiving substring check: any
        // pending label that contains the app's name (or vice versa) counts.
        let matches = pending.iter().any(|label| {
            let l = label.to_lowercase();
            l.contains(&name_lower) || name_lower.contains(l.split('-').next().unwrap_or(&l))
        });
        if !matches {
            return Ok(None);
        }

        let adam_id = read_adam_id(&app.install_path);

        Ok(Some(UpdateInfo {
            app_id: app.app_id.clone(),
            app_name: app.name.clone(),
            source: UpdateSource::MacAppStore,
            current_version: app.version.clone(),
            latest_version: String::new(),
            download_url: None,
            adam_id,
            release_notes_url: None,
            release_notes_inline: None,
            size: None,
            source_meta: None,
            feed_url: None,
            ignored: false,
        }))
    }
}

/// Open the Mac App Store directly to a given Adam ID using the
/// `macappstore://` URL scheme.
pub fn open_in_mac_app_store(adam_id: &str) -> Result<(), String> {
    if adam_id.is_empty() {
        return Err("SU_MAS_OPEN_FAIL: empty adam id".into());
    }
    let url = format!("macappstore://apps.apple.com/app/id{adam_id}");
    let status = Command::new("/usr/bin/open")
        .arg(&url)
        .status()
        .map_err(|e| format!("SU_MAS_OPEN_FAIL: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("SU_MAS_OPEN_FAIL: exit {status}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_modern_label_lines() {
        let stdout = "Software Update Tool\n\nFinding available software\n* Label: Bear-1.9.8\n\tTitle: Bear, Version: 1.9.8\n* Label: Things3-3.20\n\tTitle: Things\n";
        let names = parse_softwareupdate(stdout);
        assert_eq!(names, vec!["Bear-1.9.8", "Things3-3.20"]);
    }

    #[test]
    fn parses_empty_output() {
        let stdout = "No new software available.\n";
        let names = parse_softwareupdate(stdout);
        assert!(names.is_empty());
    }
}
