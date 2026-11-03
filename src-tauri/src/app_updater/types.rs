use serde::Serialize;

pub const APP_UPDATER_DOWNLOAD_EVENT: &str = "app-updater-download";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub date: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInstallResult {
    pub installed: bool,
    pub requires_restart: bool,
}

#[derive(Debug, Clone, Serialize)]
// `rename_all` 只改枚举变体名；结构体变体里的字段要 `rename_all_fields` 才会变 camelCase。
// 漏掉它时前端读到的 `contentLength` / `downloadedBytes` 恒为 undefined，下载进度条永远不动。
#[serde(
    tag = "event",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AppUpdateDownloadEvent {
    Started {
        content_length: Option<u64>,
    },
    Progress {
        chunk_length: usize,
        downloaded_bytes: u64,
        content_length: Option<u64>,
    },
    Finished,
    Cancelled,
    Failed {
        error: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_event_fields_are_camel_case_for_the_frontend() {
        let progress = serde_json::to_value(AppUpdateDownloadEvent::Progress {
            chunk_length: 16,
            downloaded_bytes: 32,
            content_length: Some(64),
        })
        .expect("serialize");
        assert_eq!(progress["event"], "progress");
        assert_eq!(progress["chunkLength"], 16);
        assert_eq!(progress["downloadedBytes"], 32);
        assert_eq!(progress["contentLength"], 64);

        let started = serde_json::to_value(AppUpdateDownloadEvent::Started {
            content_length: None,
        })
        .expect("serialize");
        assert_eq!(started["event"], "started");
        assert!(started["contentLength"].is_null());
    }
}
