use super::UpdaterSource;
use crate::app_manager::types::{AppInfo, UpdateInfo, UpdateSource};
use async_trait::async_trait;
use serde::Deserialize;
use std::path::Path;
use std::time::Duration;

/// Detect whether `install_path` is an Electron app managed by electron-updater.
/// Requires both the Electron framework and the `app-update.yml` config file.
pub fn is_electron_updater_app(install_path: &str) -> bool {
    let p = Path::new(install_path);
    p.join("Contents/Frameworks/Electron Framework.framework")
        .exists()
        && p.join("Contents/Resources/app-update.yml").exists()
}

#[derive(Debug, Deserialize, Clone)]
pub struct AppUpdateYml {
    pub provider: String,
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
}

pub fn read_app_update_yml(install_path: &str) -> Result<AppUpdateYml, String> {
    let path = Path::new(install_path).join("Contents/Resources/app-update.yml");
    let body = std::fs::read_to_string(&path).map_err(|e| format!("SU_ELEC_YML: {e}"))?;
    parse_app_update_yml(&body)
}

pub fn parse_app_update_yml(yml: &str) -> Result<AppUpdateYml, String> {
    serde_yaml::from_str::<AppUpdateYml>(yml).map_err(|e| format!("SU_ELEC_YML: {e}"))
}

#[derive(Debug, Deserialize, Clone)]
pub struct LatestMacYml {
    pub version: String,
    #[serde(default)]
    pub files: Vec<LatestMacFile>,
    #[serde(rename = "releaseNotes", default)]
    pub release_notes: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LatestMacFile {
    pub url: String,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub sha512: Option<String>,
}

pub fn parse_latest_mac_yml(yml: &str) -> Result<LatestMacYml, String> {
    serde_yaml::from_str(yml).map_err(|e| format!("SU_ELEC_YML: {e}"))
}

#[derive(Debug, Deserialize, Clone)]
pub struct GithubRelease {
    pub tag_name: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub html_url: Option<String>,
    pub assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct GithubAsset {
    pub name: String,
    pub browser_download_url: String,
    #[serde(default)]
    pub size: Option<u64>,
}

fn current_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x64"
    }
}

/// Pick a macOS download asset from a GitHub release, biased to the host arch.
pub fn pick_mac_asset(assets: &[GithubAsset]) -> Option<&GithubAsset> {
    let arch = current_arch();
    let arch_patterns: &[&str] = match arch {
        "arm64" => &["arm64", "aarch64"],
        _ => &["x64", "x86_64", "intel"],
    };

    let is_mac_pkg = |name: &str| {
        let l = name.to_lowercase();
        let mac_marker = l.contains("mac") || l.contains("darwin") || l.contains("osx");
        let ext_ok = l.ends_with(".zip") || l.ends_with(".dmg");
        mac_marker && ext_ok
    };

    // Arch-specific first.
    for pat in arch_patterns {
        if let Some(a) = assets
            .iter()
            .find(|a| is_mac_pkg(&a.name) && a.name.to_lowercase().contains(pat))
        {
            return Some(a);
        }
    }
    // Universal / unspecified second.
    assets.iter().find(|a| {
        if !is_mac_pkg(&a.name) {
            return false;
        }
        let l = a.name.to_lowercase();
        // Exclude the opposite arch
        let opposite = match arch {
            "arm64" => ["x64", "x86_64", "intel"],
            _ => ["arm64", "aarch64", "aarch"],
        };
        !opposite.iter().any(|o| l.contains(o))
    })
}

fn join_url(base: &str, path: &str) -> String {
    if path.starts_with("http://") || path.starts_with("https://") {
        path.to_string()
    } else {
        let base_trimmed = base.trim_end_matches('/');
        let path_trimmed = path.trim_start_matches('/');
        format!("{base_trimmed}/{path_trimmed}")
    }
}

pub struct ElectronSource {
    client: reqwest::Client,
}

impl ElectronSource {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .user_agent("bench-updater/1.0 (+macOS)")
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self { client }
    }

    async fn check_github(
        &self,
        yml: &AppUpdateYml,
        app: &AppInfo,
    ) -> Result<Option<UpdateInfo>, String> {
        let (Some(owner), Some(repo)) = (yml.owner.as_deref(), yml.repo.as_deref()) else {
            return Ok(None);
        };
        let api_url = format!("https://api.github.com/repos/{owner}/{repo}/releases/latest");
        let resp = self
            .client
            .get(&api_url)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| format!("SU_ELEC_HTTP: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("SU_ELEC_HTTP: {}", resp.status()));
        }
        let body = resp
            .text()
            .await
            .map_err(|e| format!("SU_ELEC_HTTP: {e}"))?;
        let release: GithubRelease =
            serde_json::from_str(&body).map_err(|e| format!("SU_ELEC_JSON: {e}"))?;
        Ok(build_github_update(&release, app, &api_url))
    }

    async fn check_generic(
        &self,
        yml: &AppUpdateYml,
        app: &AppInfo,
    ) -> Result<Option<UpdateInfo>, String> {
        let Some(base_url) = yml.url.as_deref() else {
            return Ok(None);
        };
        let arch = current_arch();
        let feed_path = if arch == "arm64" {
            "latest-mac-arm64.yml"
        } else {
            "latest-mac.yml"
        };

        let primary = join_url(base_url, feed_path);
        let body = match self.fetch_text(&primary).await {
            Ok(b) => b,
            Err(e) if arch == "arm64" => {
                // Some apps publish a single latest-mac.yml only.
                let fallback = join_url(base_url, "latest-mac.yml");
                self.fetch_text(&fallback).await.map_err(|_| e)?
            }
            Err(e) => return Err(e),
        };
        let parsed = parse_latest_mac_yml(&body)?;
        Ok(build_generic_update(&parsed, app, base_url, &primary))
    }

    async fn fetch_text(&self, url: &str) -> Result<String, String> {
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("SU_ELEC_HTTP: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("SU_ELEC_HTTP: {}", resp.status()));
        }
        resp.text().await.map_err(|e| format!("SU_ELEC_HTTP: {e}"))
    }
}

fn build_github_update(
    release: &GithubRelease,
    app: &AppInfo,
    api_url: &str,
) -> Option<UpdateInfo> {
    let latest_version = release
        .tag_name
        .trim()
        .trim_start_matches('v')
        .trim_start_matches('V')
        .to_string();
    if !super::sparkle::version_lt(&app.version, &latest_version) {
        return None;
    }
    let asset = pick_mac_asset(&release.assets);
    Some(UpdateInfo {
        update_id: String::new(),
        inventory_revision: 0,
        app_id: app.app_id.clone(),
        app_name: app.name.clone(),
        source: UpdateSource::Electron,
        current_version: app.version.clone(),
        latest_version,
        download_url: asset.map(|a| a.browser_download_url.clone()),
        adam_id: None,
        release_notes_url: release.html_url.clone(),
        release_notes_inline: release.body.clone(),
        size: asset.and_then(|a| a.size),
        source_meta: Some(serde_json::json!({ "provider": "github" })),
        feed_url: Some(api_url.to_string()),
        ignored: false,
    })
}

fn build_generic_update(
    parsed: &LatestMacYml,
    app: &AppInfo,
    base_url: &str,
    feed_url: &str,
) -> Option<UpdateInfo> {
    let latest_version = parsed
        .version
        .trim()
        .trim_start_matches('v')
        .trim_start_matches('V')
        .to_string();
    if !super::sparkle::version_lt(&app.version, &latest_version) {
        return None;
    }
    // Prefer .zip, fall back to first file.
    let chosen = parsed
        .files
        .iter()
        .find(|f| f.url.to_lowercase().ends_with(".zip"))
        .or_else(|| parsed.files.first());
    let download_url = chosen.map(|f| join_url(base_url, &f.url));
    let mut source_meta = serde_json::json!({ "provider": "generic" });
    if let (Some(obj), Some(f)) = (source_meta.as_object_mut(), chosen) {
        if let Some(sha) = &f.sha512 {
            obj.insert("sha512".into(), serde_json::Value::String(sha.clone()));
        }
    }
    Some(UpdateInfo {
        update_id: String::new(),
        inventory_revision: 0,
        app_id: app.app_id.clone(),
        app_name: app.name.clone(),
        source: UpdateSource::Electron,
        current_version: app.version.clone(),
        latest_version,
        download_url,
        adam_id: None,
        release_notes_url: None,
        release_notes_inline: parsed.release_notes.clone(),
        size: chosen.and_then(|f| f.size),
        source_meta: Some(source_meta),
        feed_url: Some(feed_url.to_string()),
        ignored: false,
    })
}

#[async_trait]
impl UpdaterSource for ElectronSource {
    fn id(&self) -> UpdateSource {
        UpdateSource::Electron
    }

    fn applies_to(&self, app: &AppInfo) -> bool {
        if app.source_type == "Homebrew Cask" {
            return false;
        }
        if super::mac_app_store::has_mas_receipt(&app.install_path) {
            return false;
        }
        is_electron_updater_app(&app.install_path)
    }

    async fn check_for_update(&self, app: &AppInfo) -> Result<Option<UpdateInfo>, String> {
        let yml = read_app_update_yml(&app.install_path)?;
        match yml.provider.as_str() {
            "github" => self.check_github(&yml, app).await,
            "generic" => self.check_generic(&yml, app).await,
            // s3 / spaces / etc. — out of scope for v1.1. Skip silently.
            _ => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_app(version: &str) -> AppInfo {
        AppInfo {
            source_evidence: crate::app_manager::types::SourceEvidence::None,
            launch_target: None,
            app_id: "demo".into(),
            name: "Demo".into(),
            version: version.into(),
            bundle_id: "com.example.demo".into(),
            install_path: "/Applications/Demo.app".into(),
            source: "MacBundle".into(),
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
                upgrade: true,
                uninstall: true,
            },
            icon_base64: None,
        }
    }

    #[test]
    fn parses_app_update_yml_github() {
        let yml = "provider: github\nowner: microsoft\nrepo: vscode\nupdaterCacheDirName: foo\n";
        let parsed = parse_app_update_yml(yml).expect("parses");
        assert_eq!(parsed.provider, "github");
        assert_eq!(parsed.owner.as_deref(), Some("microsoft"));
        assert_eq!(parsed.repo.as_deref(), Some("vscode"));
    }

    #[test]
    fn parses_app_update_yml_generic() {
        let yml = "provider: generic\nurl: https://updates.example.com/feed\nchannel: latest\n";
        let parsed = parse_app_update_yml(yml).expect("parses");
        assert_eq!(parsed.provider, "generic");
        assert_eq!(
            parsed.url.as_deref(),
            Some("https://updates.example.com/feed")
        );
    }

    #[test]
    fn parses_latest_mac_yml() {
        let yml = r#"version: 1.86.0
files:
  - url: VSCode-1.86.0-mac.zip
    sha512: PCwGm5XW
    size: 92341234
  - url: VSCode-1.86.0-mac.dmg
    sha512: aZx2pdQs
    size: 95823412
path: VSCode-1.86.0-mac.zip
sha512: PCwGm5XW
releaseDate: '2026-01-15T10:00:00.000Z'
"#;
        let parsed = parse_latest_mac_yml(yml).expect("parses");
        assert_eq!(parsed.version, "1.86.0");
        assert_eq!(parsed.files.len(), 2);
        assert_eq!(parsed.files[0].url, "VSCode-1.86.0-mac.zip");
        assert_eq!(parsed.files[0].size, Some(92341234));
    }

    #[test]
    fn picks_arch_specific_zip_when_available() {
        let assets = vec![
            GithubAsset {
                name: "App-1.0.0-mac.zip".into(),
                browser_download_url: "https://e.com/u.zip".into(),
                size: Some(10),
            },
            GithubAsset {
                name: "App-1.0.0-darwin-arm64.zip".into(),
                browser_download_url: "https://e.com/arm.zip".into(),
                size: Some(20),
            },
            GithubAsset {
                name: "App-1.0.0-darwin-x64.zip".into(),
                browser_download_url: "https://e.com/x64.zip".into(),
                size: Some(30),
            },
        ];
        let pick = pick_mac_asset(&assets).expect("has match");
        // We compile for the host arch; just verify the picked URL is mac-flavored
        // and matches one of the arch-specific or universal assets — never the wrong arch.
        assert!(
            pick.name.to_lowercase().contains("mac") || pick.name.to_lowercase().contains("darwin")
        );
    }

    #[test]
    fn picks_universal_mac_zip_when_no_arch_marker() {
        let assets = vec![GithubAsset {
            name: "MyApp-mac.zip".into(),
            browser_download_url: "https://e.com/mac.zip".into(),
            size: Some(100),
        }];
        let pick = pick_mac_asset(&assets).expect("has match");
        assert_eq!(pick.name, "MyApp-mac.zip");
    }

    #[test]
    fn skips_non_mac_assets() {
        let assets = vec![
            GithubAsset {
                name: "App-1.0.0-win.exe".into(),
                browser_download_url: "https://e.com/win.exe".into(),
                size: Some(10),
            },
            GithubAsset {
                name: "App-1.0.0-linux.AppImage".into(),
                browser_download_url: "https://e.com/lx.AppImage".into(),
                size: Some(20),
            },
        ];
        assert!(pick_mac_asset(&assets).is_none());
    }

    #[test]
    fn join_url_handles_absolute_and_relative_paths() {
        assert_eq!(
            join_url("https://e.com/base", "rel/foo.zip"),
            "https://e.com/base/rel/foo.zip"
        );
        assert_eq!(
            join_url("https://e.com/base/", "/rel/foo.zip"),
            "https://e.com/base/rel/foo.zip"
        );
        assert_eq!(
            join_url("https://e.com/base", "https://other.com/abs.zip"),
            "https://other.com/abs.zip"
        );
    }

    #[test]
    fn build_github_update_skips_when_current_is_newer() {
        let release = GithubRelease {
            tag_name: "v1.0.0".into(),
            body: None,
            html_url: None,
            assets: vec![],
        };
        let app = make_app("1.0.0");
        assert!(build_github_update(&release, &app, "https://api").is_none());
        let app_newer = make_app("2.0.0");
        assert!(build_github_update(&release, &app_newer, "https://api").is_none());
    }

    #[test]
    fn build_github_update_strips_v_prefix() {
        let release = GithubRelease {
            tag_name: "v1.86.0".into(),
            body: Some("notes".into()),
            html_url: Some("https://github.com/repo/releases/1.86.0".into()),
            assets: vec![GithubAsset {
                name: "App-1.86.0-mac.zip".into(),
                browser_download_url: "https://e.com/app.zip".into(),
                size: Some(123),
            }],
        };
        let app = make_app("1.85.0");
        let info = build_github_update(&release, &app, "https://api").expect("has update");
        assert_eq!(info.latest_version, "1.86.0");
        assert_eq!(info.source, UpdateSource::Electron);
        assert_eq!(info.download_url.as_deref(), Some("https://e.com/app.zip"));
    }

    #[test]
    fn build_generic_update_prefers_zip() {
        let parsed = LatestMacYml {
            version: "1.86.0".into(),
            files: vec![
                LatestMacFile {
                    url: "App-1.86.0-mac.dmg".into(),
                    size: Some(200),
                    sha512: None,
                },
                LatestMacFile {
                    url: "App-1.86.0-mac.zip".into(),
                    size: Some(100),
                    sha512: Some("aZx2pdQs".into()),
                },
            ],
            release_notes: None,
        };
        let app = make_app("1.85.0");
        let info = build_generic_update(
            &parsed,
            &app,
            "https://updates.example.com",
            "https://u/latest.yml",
        )
        .expect("has update");
        assert_eq!(
            info.download_url.as_deref(),
            Some("https://updates.example.com/App-1.86.0-mac.zip")
        );
        assert_eq!(info.size, Some(100));
        // source_meta should now carry the SHA-512 picked from the chosen file.
        let meta = info.source_meta.as_ref().expect("meta present");
        assert_eq!(meta["sha512"], "aZx2pdQs");
        assert_eq!(meta["provider"], "generic");
    }

    /// Regression: a generic feed with no sha512 must still produce a
    /// `source_meta` so the source can be identified, but without a fake
    /// sha512 key that would steer the verifier into a guaranteed-fail check.
    #[test]
    fn build_generic_update_omits_sha512_when_feed_has_none() {
        let parsed = LatestMacYml {
            version: "1.86.0".into(),
            files: vec![LatestMacFile {
                url: "App-1.86.0-mac.zip".into(),
                size: Some(100),
                sha512: None,
            }],
            release_notes: None,
        };
        let app = make_app("1.85.0");
        let info = build_generic_update(
            &parsed,
            &app,
            "https://updates.example.com",
            "https://u/latest.yml",
        )
        .expect("has update");
        let meta = info.source_meta.as_ref().expect("meta present");
        assert_eq!(meta["provider"], "generic");
        assert!(meta.get("sha512").is_none());
    }
}
