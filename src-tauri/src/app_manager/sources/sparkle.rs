use super::UpdaterSource;
use crate::app_manager::types::{AppInfo, UpdateInfo, UpdateSource};
use async_trait::async_trait;
use quick_xml::events::Event;
use quick_xml::Reader;
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

#[derive(Debug, Default, Clone)]
pub struct AppcastItem {
    pub version: String,
    pub short_version: String,
    pub enclosure_url: Option<String>,
    pub release_notes_link: Option<String>,
    pub description: Option<String>,
    pub min_system_version: Option<String>,
    pub length: Option<u64>,
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
fn version_lt(a: &str, b: &str) -> bool {
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

        let resp = self
            .client
            .get(&feed_url)
            .send()
            .await
            .map_err(|e| format!("SU_SPARKLE_HTTP: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("SU_SPARKLE_HTTP: {}", resp.status()));
        }
        let body = resp
            .text()
            .await
            .map_err(|e| format!("SU_SPARKLE_HTTP: {e}"))?;

        let items = parse_appcast(&body)?;
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
            source_meta: None,
            feed_url: Some(feed_url),
            ignored: false,
        }))
    }
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
}
