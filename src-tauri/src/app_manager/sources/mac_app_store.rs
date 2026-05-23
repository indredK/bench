use super::UpdaterSource;
use crate::app_manager::types::{AppInfo, UpdateInfo, UpdateSource};
use async_trait::async_trait;
use std::path::Path;
use std::process::Command;
use std::process::Stdio;
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

const SOFTWAREUPDATE_TIMEOUT: Duration = Duration::from_secs(8);

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

#[derive(Debug, Clone, PartialEq, Eq)]
struct PendingUpdate {
    label: String,
    title: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct LookupResponse {
    #[serde(default)]
    results: Vec<LookupItem>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LookupItem {
    #[serde(default)]
    version: String,
    #[serde(default)]
    track_id: Option<u64>,
    #[serde(default)]
    track_view_url: Option<String>,
}

fn parse_title_value(line: &str) -> String {
    line.split_once(", Version:")
        .map(|(title, _)| title)
        .unwrap_or(line)
        .trim()
        .to_string()
}

fn normalize_match_key(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

fn strip_version_suffix(label: &str) -> &str {
    let Some((prefix, suffix)) = label.rsplit_once('-') else {
        return label;
    };
    if suffix
        .chars()
        .all(|c| c.is_ascii_digit() || c == '.' || c == '_')
    {
        prefix
    } else {
        label
    }
}

fn matches_pending_update(update: &PendingUpdate, app: &AppInfo) -> bool {
    let app_name = normalize_match_key(&app.name);
    if app_name.is_empty() {
        return false;
    }

    let mut candidates = vec![
        strip_version_suffix(&update.label).to_string(),
        update.label.clone(),
    ];
    if let Some(title) = &update.title {
        candidates.push(title.clone());
    }

    candidates.into_iter().any(|candidate| {
        let normalized = normalize_match_key(&candidate);
        !normalized.is_empty()
            && (normalized == app_name
                || normalized.contains(&app_name)
                || app_name.contains(&normalized))
    })
}

/// Parse `softwareupdate --list` output. We keep both the machine-readable
/// label and the human-facing title because MAS labels often include version
/// suffixes or compressed names (for example `Things3-3.20`).
fn parse_softwareupdate(stdout: &str) -> Vec<PendingUpdate> {
    let mut updates = Vec::new();
    let mut current_label: Option<String> = None;

    let mut push_pending = |label: String, title: Option<String>| {
        if !label.trim().is_empty() {
            updates.push(PendingUpdate {
                label,
                title: title.filter(|value| !value.trim().is_empty()),
            });
        }
    };

    for line in stdout.lines() {
        let line = line.trim();
        // Modern format: "* Label: <name>"
        if let Some(rest) = line.strip_prefix("* Label: ") {
            if let Some(label) = current_label.replace(rest.to_string()) {
                push_pending(label, None);
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("Title: ") {
            if let Some(label) = current_label.take() {
                push_pending(label, Some(parse_title_value(rest)));
            }
            continue;
        }
        // Legacy format: "   * <name>-<version>"
        if let Some(rest) = line.strip_prefix("* ") {
            if !rest.contains("Label:") {
                if let Some(label) = current_label.replace(rest.to_string()) {
                    push_pending(label, None);
                }
            }
        }
    }
    if let Some(label) = current_label.take() {
        push_pending(label, None);
    }

    updates
}

fn run_softwareupdate(args: &[&str]) -> Result<Vec<PendingUpdate>, String> {
    let mut child = Command::new("/usr/sbin/softwareupdate")
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("softwareupdate failed to spawn: {e}"))?;

    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if started_at.elapsed() >= SOFTWAREUPDATE_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("SU_MAS_LIST_TIMEOUT: softwareupdate timed out".into());
                }
                thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("softwareupdate failed while waiting: {e}")),
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("softwareupdate failed to collect output: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("SU_MAS_LIST_FAIL: {}", stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_softwareupdate(&stdout))
}

fn fetch_pending_updates() -> Result<Vec<PendingUpdate>, String> {
    match run_softwareupdate(&["--list"]) {
        Ok(updates) => Ok(updates),
        Err(primary_error) => run_softwareupdate(&["--list", "--no-scan"])
            .map_err(|fallback_error| format!("{primary_error}; {fallback_error}")),
    }
}

fn parse_lookup_response(body: &str) -> Result<Vec<LookupItem>, String> {
    serde_json::from_str::<LookupResponse>(body)
        .map(|parsed| parsed.results)
        .map_err(|e| format!("SU_MAS_LOOKUP_JSON: {e}"))
}

pub struct MacAppStoreSource {
    cache: OnceLock<Result<Vec<PendingUpdate>, String>>,
    client: reqwest::Client,
}

impl MacAppStoreSource {
    pub fn new() -> Self {
        Self {
            cache: OnceLock::new(),
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(8))
                .user_agent("bench-updater/1.0 (+macOS)")
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }

    fn pending(&self) -> &Result<Vec<PendingUpdate>, String> {
        self.cache.get_or_init(fetch_pending_updates)
    }

    async fn lookup_store_version(&self, bundle_id: &str) -> Result<Option<LookupItem>, String> {
        if bundle_id.trim().is_empty() || bundle_id == "unknown" {
            return Ok(None);
        }

        let response = self
            .client
            .get("https://itunes.apple.com/lookup")
            .query(&[
                ("bundleId", bundle_id),
                ("entity", "macSoftware"),
                ("country", "us"),
            ])
            .send()
            .await
            .map_err(|e| format!("SU_MAS_LOOKUP_HTTP: {e}"))?;
        if !response.status().is_success() {
            return Err(format!("SU_MAS_LOOKUP_HTTP: {}", response.status()));
        }

        let body = response
            .text()
            .await
            .map_err(|e| format!("SU_MAS_LOOKUP_HTTP: {e}"))?;
        let results = parse_lookup_response(&body)?;
        Ok(results.into_iter().next())
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
        let pending_match = self.pending().as_ref().ok().is_some_and(|pending| {
            pending
                .iter()
                .any(|update| matches_pending_update(update, app))
        });

        let lookup = self.lookup_store_version(&app.bundle_id).await?;
        if let Some(store_item) = lookup {
            let latest_version = store_item.version.trim().to_string();
            if !latest_version.is_empty()
                && super::sparkle::version_lt(&app.version, &latest_version)
            {
                let adam_id = store_item
                    .track_id
                    .map(|id| id.to_string())
                    .or_else(|| read_adam_id(&app.install_path));

                return Ok(Some(UpdateInfo {
                    app_id: app.app_id.clone(),
                    app_name: app.name.clone(),
                    source: UpdateSource::MacAppStore,
                    current_version: app.version.clone(),
                    latest_version,
                    download_url: None,
                    adam_id,
                    release_notes_url: store_item.track_view_url,
                    release_notes_inline: None,
                    size: None,
                    source_meta: Some(serde_json::json!({ "provider": "itunes_lookup" })),
                    feed_url: Some("https://itunes.apple.com/lookup".into()),
                    ignored: false,
                }));
            }
        }

        if !pending_match {
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
        assert_eq!(
            names,
            vec![
                PendingUpdate {
                    label: "Bear-1.9.8".into(),
                    title: Some("Bear".into())
                },
                PendingUpdate {
                    label: "Things3-3.20".into(),
                    title: Some("Things".into())
                }
            ]
        );
    }

    #[test]
    fn parses_empty_output() {
        let stdout = "No new software available.\n";
        let names = parse_softwareupdate(stdout);
        assert!(names.is_empty());
    }

    #[test]
    fn parses_lookup_response() {
        let body = r#"{
          "resultCount": 1,
          "results": [
            {
              "version": "26.5",
              "trackId": 497799835,
              "trackViewUrl": "https://apps.apple.com/us/app/xcode/id497799835"
            }
          ]
        }"#;
        let results = parse_lookup_response(body).expect("lookup parses");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].version, "26.5");
        assert_eq!(results[0].track_id, Some(497799835));
    }

    #[test]
    fn falls_back_to_label_when_title_is_missing() {
        let app = AppInfo {
            app_id: "x".into(),
            name: "Things".into(),
            version: "3.19".into(),
            bundle_id: "com.culturedcode.ThingsMac".into(),
            install_path: "/Applications/Things.app".into(),
            source: "Bundle".into(),
            source_type: "MacBundle".into(),
            source_id: String::new(),
            source_confidence: 0.0,
            can_upgrade: false,
            can_uninstall: false,
            upgrade_available: false,
            last_operation_result: None,
            last_modified: 0,
            is_system_app: false,
            allowed_actions: crate::app_manager::types::AllowedActions {
                launch: true,
                reveal: true,
                upgrade: false,
                uninstall: false,
            },
            icon_base64: None,
        };

        assert!(matches_pending_update(
            &PendingUpdate {
                label: "Things3-3.20".into(),
                title: None,
            },
            &app
        ));
    }
}
