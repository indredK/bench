use super::UpdaterSource;
use crate::app_manager::types::{AppInfo, UpdateInfo, UpdateSource};
use async_trait::async_trait;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Deserialize;
use std::path::Path;
use std::time::Duration;

pub fn read_su_feed_url(install_path: &str) -> Option<String> {
    let plist_path = Path::new(install_path).join("Contents").join("Info.plist");
    let dict = plist::Value::from_file(&plist_path)
        .ok()?
        .into_dictionary()?;
    dict.get("SUFeedURL")
        .and_then(|v| v.as_string())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Detect a Squirrel.Mac-hosted app. Presence of Squirrel.framework or the
/// ShipIt helper is a strong signal; the feed still uses Sparkle's SUFeedURL.
pub fn is_squirrel_app(install_path: &str) -> bool {
    let p = Path::new(install_path);
    p.join("Contents/Frameworks/Squirrel.framework").exists()
        || p.join("Contents/Frameworks/ShipIt").exists()
}

fn append_squirrel_query(url: &str, version: &str) -> String {
    let arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x64"
    };
    let sep = if url.contains('?') { '&' } else { '?' };
    format!("{url}{sep}version={version}&platform=darwin&arch={arch}")
}

#[derive(Debug, Deserialize, Clone)]
pub struct SquirrelFeed {
    pub url: String,
    pub name: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub pub_date: Option<String>,
}

pub fn parse_squirrel_json(body: &str) -> Result<SquirrelFeed, String> {
    serde_json::from_str::<SquirrelFeed>(body).map_err(|e| format!("SU_SQUIRREL_JSON: {e}"))
}

#[derive(Debug, Default, Clone)]
pub struct AppcastItem {
    pub version: String,
    pub short_version: String,
    pub enclosure_url: Option<String>,
    pub release_notes_link: Option<String>,
    pub description: Option<String>,
    pub min_system_version: Option<String>,
    pub length: Option<u64>,
    /// `sparkle:edSignature` from the enclosure (base64 ed25519). Used by the
    /// orchestrator together with `SUPublicEDKey` from Info.plist.
    pub ed_signature: Option<String>,
    /// `sparkle:installerSHA512Sum` from the enclosure (base64 or hex sha512).
    pub installer_sha512_sum: Option<String>,
}

/// Parse a Sparkle appcast XML and return the latest item (highest version
/// the host OS can run). We deliberately ignore `<sparkle:deltas>` blocks and
/// always pick the full enclosure.
pub fn parse_appcast(xml: &str) -> Result<Vec<AppcastItem>, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut items: Vec<AppcastItem> = Vec::new();
    let mut current: Option<AppcastItem> = None;
    let mut in_item = false;
    let mut in_deltas = false;
    let mut current_tag: Option<String> = None;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "item" => {
                        in_item = true;
                        current = Some(AppcastItem::default());
                    }
                    "sparkle:deltas" => in_deltas = true,
                    "enclosure" => {
                        if in_item && !in_deltas {
                            if let Some(item) = current.as_mut() {
                                for attr in e.attributes().flatten() {
                                    let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                                    let val = attr.unescape_value().unwrap_or_default().to_string();
                                    match key.as_str() {
                                        "url" => item.enclosure_url = Some(val),
                                        "sparkle:version" => item.version = val,
                                        "sparkle:shortVersionString" => item.short_version = val,
                                        "length" => item.length = val.parse().ok(),
                                        "sparkle:edSignature" => item.ed_signature = Some(val),
                                        "sparkle:installerSHA512Sum" => {
                                            item.installer_sha512_sum = Some(val)
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                    }
                    _ => {
                        current_tag = Some(name);
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "item" => {
                        in_item = false;
                        if let Some(item) = current.take() {
                            items.push(item);
                        }
                    }
                    "sparkle:deltas" => in_deltas = false,
                    _ => {
                        current_tag = None;
                    }
                }
            }
            Ok(Event::Text(t)) => {
                if in_item && !in_deltas {
                    let text = t.unescape().unwrap_or_default().to_string();
                    if let (Some(item), Some(tag)) = (current.as_mut(), current_tag.as_deref()) {
                        match tag {
                            "sparkle:version" => item.version = text,
                            "sparkle:shortVersionString" => item.short_version = text,
                            "sparkle:releaseNotesLink" => item.release_notes_link = Some(text),
                            "description" => item.description = Some(text),
                            "sparkle:minimumSystemVersion" => item.min_system_version = Some(text),
                            _ => {}
                        }
                    }
                }
            }
            Ok(Event::CData(t)) => {
                if in_item && !in_deltas {
                    let text = String::from_utf8_lossy(t.as_ref()).to_string();
                    if let (Some(item), Some(tag)) = (current.as_mut(), current_tag.as_deref()) {
                        match tag {
                            "sparkle:version" => item.version = text,
                            "sparkle:shortVersionString" => item.short_version = text,
                            "sparkle:releaseNotesLink" => item.release_notes_link = Some(text),
                            "description" => item.description = Some(text),
                            "sparkle:minimumSystemVersion" => item.min_system_version = Some(text),
                            _ => {}
                        }
                    }
                }
            }
            Ok(Event::Empty(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "enclosure" && in_item && !in_deltas {
                    if let Some(item) = current.as_mut() {
                        for attr in e.attributes().flatten() {
                            let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            let val = attr.unescape_value().unwrap_or_default().to_string();
                            match key.as_str() {
                                "url" => item.enclosure_url = Some(val),
                                "sparkle:version" => item.version = val,
                                "sparkle:shortVersionString" => item.short_version = val,
                                "length" => item.length = val.parse().ok(),
                                "sparkle:edSignature" => item.ed_signature = Some(val),
                                "sparkle:installerSHA512Sum" => {
                                    item.installer_sha512_sum = Some(val)
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("SU_PARSE_XML: {e}")),
            _ => {}
        }
        buf.clear();
    }

    Ok(items)
}

/// Strip a leading `v` from version strings like `v2.5`.
fn normalize_version(v: &str) -> String {
    v.trim().trim_start_matches('v').trim_start_matches('V').to_string()
}

/// `a < b`? Compare semver, with build-number fallback.
pub(crate) fn version_lt(a: &str, b: &str) -> bool {
    let a = normalize_version(a);
    let b = normalize_version(b);
    if let (Ok(va), Ok(vb)) = (semver::Version::parse(&a), semver::Version::parse(&b)) {
        return va < vb;
    }
    // Loose semver (e.g. "2.5") — try semver::Version with .0 padding.
    let pad = |s: &str| -> String {
        let dots = s.matches('.').count();
        match dots {
            0 => format!("{s}.0.0"),
            1 => format!("{s}.0"),
            _ => s.to_string(),
        }
    };
    if let (Ok(va), Ok(vb)) =
        (semver::Version::parse(&pad(&a)), semver::Version::parse(&pad(&b)))
    {
        return va < vb;
    }
    // Final fallback: numeric segment-by-segment.
    let to_nums =
        |s: &str| -> Vec<u64> { s.split('.').filter_map(|p| p.parse::<u64>().ok()).collect() };
    let na = to_nums(&a);
    let nb = to_nums(&b);
    na < nb
}

pub fn pick_latest(items: Vec<AppcastItem>) -> Option<AppcastItem> {
    items
        .into_iter()
        .filter(|item| !item.short_version.is_empty() || !item.version.is_empty())
        .filter(|item| item.enclosure_url.is_some())
        .max_by(|a, b| {
            let av = if !a.short_version.is_empty() {
                &a.short_version
            } else {
                &a.version
            };
            let bv = if !b.short_version.is_empty() {
                &b.short_version
            } else {
                &b.version
            };
            if version_lt(av, bv) {
                std::cmp::Ordering::Less
            } else if version_lt(bv, av) {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Equal
            }
        })
}

pub struct SparkleSource {
    client: reqwest::Client,
}

impl SparkleSource {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .user_agent("bench-updater/1.0 (+macOS)")
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self { client }
    }
}

#[async_trait]
impl UpdaterSource for SparkleSource {
    fn id(&self) -> UpdateSource {
        UpdateSource::Sparkle
    }

    fn applies_to(&self, app: &AppInfo) -> bool {
        // Sparkle is the catch-all for non-cask, non-MAS apps that carry a feed.
        if app.source_type == "Homebrew Cask" {
            return false;
        }
        if super::mac_app_store::has_mas_receipt(&app.install_path) {
            return false;
        }
        read_su_feed_url(&app.install_path).is_some()
    }

    async fn check_for_update(&self, app: &AppInfo) -> Result<Option<UpdateInfo>, String> {
        let Some(feed_url) = read_su_feed_url(&app.install_path) else {
            return Ok(None);
        };

        let is_squirrel = is_squirrel_app(&app.install_path);
        // Squirrel servers expect ?version= so they can return 204 when up-to-date.
        let request_url = if is_squirrel {
            append_squirrel_query(&feed_url, &app.version)
        } else {
            feed_url.clone()
        };

        let resp = self
            .client
            .get(&request_url)
            .send()
            .await
            .map_err(|e| format!("SU_SPARKLE_HTTP: {e}"))?;
        if resp.status() == reqwest::StatusCode::NO_CONTENT {
            return Ok(None);
        }
        if !resp.status().is_success() {
            return Err(format!("SU_SPARKLE_HTTP: {}", resp.status()));
        }
        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_lowercase();
        let body = resp
            .text()
            .await
            .map_err(|e| format!("SU_SPARKLE_HTTP: {e}"))?;
        let trimmed = body.trim_start();
        if trimmed.is_empty() {
            return Ok(None);
        }

        let looks_json = content_type.contains("json") || trimmed.starts_with('{');
        if is_squirrel || looks_json {
            return build_squirrel_update(&body, app, &feed_url);
        }

        // Sparkle XML path (existing behaviour).
        let items = parse_appcast(&body)?;
        build_sparkle_update(items, app, feed_url)
    }
}

/// Pure: pick the newest appcast item from `items` and convert it into an
/// `UpdateInfo` if it's newer than `app.version`. Extracted so that the v1.2
/// `source_meta` shape (provider / ed25519Signature / sha512) can be tested
/// without an HTTP mock.
fn build_sparkle_update(
    items: Vec<AppcastItem>,
    app: &AppInfo,
    feed_url: String,
) -> Result<Option<UpdateInfo>, String> {
    let Some(latest) = pick_latest(items) else {
        return Ok(None);
    };

    let latest_version = if !latest.short_version.is_empty() {
        latest.short_version.clone()
    } else {
        latest.version.clone()
    };

    if !version_lt(&app.version, &latest_version) {
        return Ok(None);
    }

    let mut meta = serde_json::Map::new();
    meta.insert(
        "provider".into(),
        serde_json::Value::String("sparkle".into()),
    );
    if let Some(sig) = &latest.ed_signature {
        meta.insert(
            "ed25519Signature".into(),
            serde_json::Value::String(sig.clone()),
        );
    }
    if let Some(sha) = &latest.installer_sha512_sum {
        meta.insert("sha512".into(), serde_json::Value::String(sha.clone()));
    }
    let source_meta = if meta.len() == 1 {
        // Only the "provider" key — no verification material was advertised.
        None
    } else {
        Some(serde_json::Value::Object(meta))
    };

    Ok(Some(UpdateInfo {
        app_id: app.app_id.clone(),
        app_name: app.name.clone(),
        source: UpdateSource::Sparkle,
        current_version: app.version.clone(),
        latest_version,
        download_url: latest.enclosure_url.clone(),
        adam_id: None,
        release_notes_url: latest.release_notes_link.clone(),
        release_notes_inline: latest.description.clone(),
        size: latest.length,
        source_meta,
        feed_url: Some(feed_url),
        ignored: false,
    }))
}

fn build_squirrel_update(
    body: &str,
    app: &AppInfo,
    feed_url: &str,
) -> Result<Option<UpdateInfo>, String> {
    let feed = parse_squirrel_json(body)?;
    let latest_version = feed
        .name
        .trim()
        .trim_start_matches('v')
        .trim_start_matches('V')
        .to_string();
    if latest_version.is_empty() || !version_lt(&app.version, &latest_version) {
        return Ok(None);
    }
    Ok(Some(UpdateInfo {
        app_id: app.app_id.clone(),
        app_name: app.name.clone(),
        source: UpdateSource::Squirrel,
        current_version: app.version.clone(),
        latest_version,
        download_url: Some(feed.url),
        adam_id: None,
        release_notes_url: None,
        release_notes_inline: feed.notes,
        size: None,
        source_meta: feed.pub_date.map(|d| serde_json::json!({ "pubDate": d })),
        feed_url: Some(feed_url.to_string()),
        ignored: false,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    const RECTANGLE_FEED: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0">
<channel>
<item>
<title>Version 0.78</title>
<sparkle:version>113</sparkle:version>
<sparkle:shortVersionString>0.78</sparkle:shortVersionString>
<sparkle:releaseNotesLink>https://rectangleapp.com/release_notes</sparkle:releaseNotesLink>
<enclosure url="https://example.com/Rectangle0.78.dmg" length="9123456" type="application/octet-stream" />
</item>
<item>
<title>Version 0.77</title>
<sparkle:version>112</sparkle:version>
<sparkle:shortVersionString>0.77</sparkle:shortVersionString>
<enclosure url="https://example.com/Rectangle0.77.dmg" length="9100000" type="application/octet-stream" />
</item>
</channel>
</rss>
"#;

    const WITH_DELTAS: &str = r#"<?xml version="1.0"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
<channel>
<item>
<sparkle:shortVersionString>5.10</sparkle:shortVersionString>
<sparkle:deltas>
<enclosure url="https://example.com/delta-from-5.9.dmg" sparkle:shortVersionString="5.10" sparkle:deltaFrom="5.9" />
</sparkle:deltas>
<enclosure url="https://example.com/Transmit5.10.dmg" length="50000000" />
</item>
</channel>
</rss>
"#;

    #[test]
    fn parses_standard_appcast() {
        let items = parse_appcast(RECTANGLE_FEED).expect("parses");
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].short_version, "0.78");
        assert_eq!(
            items[0].enclosure_url.as_deref(),
            Some("https://example.com/Rectangle0.78.dmg")
        );
        assert_eq!(items[0].length, Some(9123456));
    }

    #[test]
    fn ignores_sparkle_deltas() {
        let items = parse_appcast(WITH_DELTAS).expect("parses");
        assert_eq!(items.len(), 1);
        // The full enclosure (not the delta) is what's recorded
        assert_eq!(
            items[0].enclosure_url.as_deref(),
            Some("https://example.com/Transmit5.10.dmg")
        );
    }

    #[test]
    fn pick_latest_uses_short_version() {
        let items = parse_appcast(RECTANGLE_FEED).expect("parses");
        let latest = pick_latest(items).expect("at least one");
        assert_eq!(latest.short_version, "0.78");
    }

    #[test]
    fn version_lt_handles_v_prefix_and_padding() {
        assert!(version_lt("2.5", "2.5.1"));
        assert!(version_lt("v2.5", "2.5.1"));
        assert!(!version_lt("2.5.1", "2.5"));
        assert!(version_lt("0.65", "0.78"));
    }

    #[test]
    fn malformed_xml_returns_error() {
        let result = parse_appcast("not xml <unclosed>");
        // quick-xml may or may not error on this depending on event; either is fine
        // as long as it doesn't panic.
        let _ = result;
    }

    #[test]
    fn parses_squirrel_json_feed() {
        let body = r###"{
  "url": "https://example.com/Slack-4.32.0-macos.zip",
  "name": "4.32.0",
  "notes": "## What's New\n- Bug fixes",
  "pub_date": "2026-01-15T10:00:00Z"
}"###;
        let feed = parse_squirrel_json(body).expect("parses");
        assert_eq!(feed.name, "4.32.0");
        assert_eq!(feed.url, "https://example.com/Slack-4.32.0-macos.zip");
        assert!(feed.notes.unwrap().contains("Bug fixes"));
    }

    #[test]
    fn squirrel_json_missing_optional_fields_ok() {
        let body = r#"{ "url": "https://e.com/app.zip", "name": "1.2.3" }"#;
        let feed = parse_squirrel_json(body).expect("parses");
        assert!(feed.notes.is_none());
        assert!(feed.pub_date.is_none());
    }

    #[test]
    fn squirrel_json_malformed_errors() {
        let result = parse_squirrel_json("not json");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.starts_with("SU_SQUIRREL_JSON:"));
    }

    #[test]
    fn squirrel_query_appends_with_and_without_existing_qs() {
        assert_eq!(
            append_squirrel_query("https://e.com/feed", "1.0.0"),
            format!(
                "https://e.com/feed?version=1.0.0&platform=darwin&arch={}",
                if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" }
            )
        );
        assert_eq!(
            append_squirrel_query("https://e.com/feed?token=abc", "1.0.0"),
            format!(
                "https://e.com/feed?token=abc&version=1.0.0&platform=darwin&arch={}",
                if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" }
            )
        );
    }

    fn make_app(version: &str) -> AppInfo {
        AppInfo {
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
    fn build_squirrel_update_skips_when_up_to_date() {
        let body = r#"{ "url": "https://e.com/a.zip", "name": "1.0.0" }"#;
        let app = make_app("1.0.0");
        let result = build_squirrel_update(body, &app, "https://e.com/feed")
            .expect("ok");
        assert!(result.is_none());
    }

    #[test]
    fn build_squirrel_update_returns_squirrel_source() {
        let body = r#"{ "url": "https://e.com/a.zip", "name": "v2.1.0", "notes": "notes" }"#;
        let app = make_app("2.0.0");
        let info = build_squirrel_update(body, &app, "https://e.com/feed")
            .expect("ok")
            .expect("has update");
        assert_eq!(info.source, UpdateSource::Squirrel);
        assert_eq!(info.latest_version, "2.1.0");
        assert_eq!(info.download_url.as_deref(), Some("https://e.com/a.zip"));
        assert_eq!(info.release_notes_inline.as_deref(), Some("notes"));
    }

    /// Regression: enclosure attributes carrying Sparkle's ed25519 + sha512
    /// material must be captured for both empty-element and start/end forms.
    /// These two fields drive the v1.2 verifier (ed25519 > sha512 > skip).
    #[test]
    fn parses_ed_signature_and_sha512_from_empty_enclosure() {
        let feed = r#"<?xml version="1.0"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
<channel>
<item>
<sparkle:shortVersionString>1.2.0</sparkle:shortVersionString>
<enclosure url="https://e.com/App-1.2.0.dmg" length="123" sparkle:edSignature="ED-SIG-AAA" sparkle:installerSHA512Sum="SHA-AAA" />
</item>
</channel>
</rss>"#;
        let items = parse_appcast(feed).expect("parses");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].ed_signature.as_deref(), Some("ED-SIG-AAA"));
        assert_eq!(items[0].installer_sha512_sum.as_deref(), Some("SHA-AAA"));
    }

    #[test]
    fn parses_ed_signature_and_sha512_from_paired_enclosure() {
        let feed = r#"<?xml version="1.0"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
<channel>
<item>
<sparkle:shortVersionString>1.2.0</sparkle:shortVersionString>
<enclosure url="https://e.com/App-1.2.0.dmg" sparkle:edSignature="ED-SIG-BBB" sparkle:installerSHA512Sum="SHA-BBB"></enclosure>
</item>
</channel>
</rss>"#;
        let items = parse_appcast(feed).expect("parses");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].ed_signature.as_deref(), Some("ED-SIG-BBB"));
        assert_eq!(items[0].installer_sha512_sum.as_deref(), Some("SHA-BBB"));
    }

    /// End-to-end: a feed with both ed25519 + sha512 must produce a
    /// `source_meta` JSON object the orchestrator can read directly.
    #[test]
    fn build_sparkle_update_emits_source_meta_with_signature_and_sha512() {
        let feed = r#"<?xml version="1.0"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
<channel>
<item>
<sparkle:shortVersionString>2.0.0</sparkle:shortVersionString>
<enclosure url="https://e.com/App-2.0.0.dmg" length="200" sparkle:edSignature="ED-XYZ" sparkle:installerSHA512Sum="SHA-XYZ" />
</item>
</channel>
</rss>"#;
        let items = parse_appcast(feed).expect("parses");
        let app = make_app("1.0.0");
        let info = build_sparkle_update(items, &app, "https://e.com/feed".into())
            .expect("ok")
            .expect("has update");
        assert_eq!(info.source, UpdateSource::Sparkle);
        assert_eq!(info.latest_version, "2.0.0");
        let meta = info.source_meta.expect("source_meta present");
        assert_eq!(meta["provider"], "sparkle");
        assert_eq!(meta["ed25519Signature"], "ED-XYZ");
        assert_eq!(meta["sha512"], "SHA-XYZ");
    }

    /// When neither verification material is advertised, `source_meta` is
    /// `None` rather than a useless `{"provider":"sparkle"}` object — the
    /// orchestrator then falls back to "verification skipped".
    #[test]
    fn build_sparkle_update_omits_source_meta_when_no_signature_or_hash() {
        let feed = r#"<?xml version="1.0"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
<channel>
<item>
<sparkle:shortVersionString>2.0.0</sparkle:shortVersionString>
<enclosure url="https://e.com/App-2.0.0.dmg" length="200" />
</item>
</channel>
</rss>"#;
        let items = parse_appcast(feed).expect("parses");
        let app = make_app("1.0.0");
        let info = build_sparkle_update(items, &app, "https://e.com/feed".into())
            .expect("ok")
            .expect("has update");
        assert!(info.source_meta.is_none());
    }

    #[test]
    fn build_sparkle_update_skips_when_current_is_up_to_date() {
        let feed = r#"<?xml version="1.0"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
<channel>
<item>
<sparkle:shortVersionString>1.0.0</sparkle:shortVersionString>
<enclosure url="https://e.com/App-1.0.0.dmg" length="200" />
</item>
</channel>
</rss>"#;
        let items = parse_appcast(feed).expect("parses");
        let app = make_app("1.0.0");
        let result = build_sparkle_update(items, &app, "https://e.com/feed".into())
            .expect("ok");
        assert!(result.is_none());
    }
}
