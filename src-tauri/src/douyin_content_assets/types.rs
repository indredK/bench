//! douyin_content_assets 类型与常量（DCA-01，D-037）。
//!
//! 持久化沿用版本化 JSON 约定（见 persistence-schema.md 与 D-037 第 4 条）；
//! 媒体文件按资产 ID 存私有目录，路径只由宿主解析，IPC 一律使用资产 ID。

use std::fmt;

use serde::{Deserialize, Serialize};

/// 插件 ID（与 plugin-market `extensions/douyin-content-assets` 对应）。
pub const EXTENSION_ID: &str = "douyin-content-assets";

/// 采集批次上限（条）——桥接路由级与宿主校验一致。
pub const MAX_BATCH_ITEMS: usize = 100;
/// 桥接 import-batch 路由级请求体上限（1 MiB；全局 16 MiB 之外更严的独立限制）。
pub const MAX_IMPORT_BODY_BYTES: usize = 1024 * 1024;
/// 单个导入视频文件上限（2 GiB）。
pub const MAX_IMPORT_FILE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// 素材 JSON 文件上限（与 token-calculator 同量级的保守值）。
pub const MAX_STORE_FILE_BYTES: u64 = 8 * 1024 * 1024;
/// 当前持久化 schema 版本（未来字段演进时按 fail-closed 语义递增）。
pub const CURRENT_SCHEMA: u32 = 1;
/// rejected 摘要最多返回条数（防止恶意大包撑爆响应）。
pub const MAX_REJECTED_REPORTED: usize = 50;
/// 列表单页上限。
pub const MAX_PAGE_LIMIT: u32 = 200;

/// 合法的列表类型（采集时由用户选择）。
pub const LIST_TYPES: &[&str] = &["favorite", "like", "watch_later", "profile", "other"];

/// 分享链接可保留的查询参数白名单（清理跟踪参数时保留作品标识所需）。
pub const SHARE_URL_KEEP_PARAMS: &[&str] = &["item_id", "aweme_id", "video_id", "modal_id"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "code", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DouyinAssetsError {
    #[serde(rename_all = "camelCase")]
    InvalidInput { message: String },
    #[serde(rename_all = "camelCase")]
    NotFound { message: String },
    #[serde(rename_all = "camelCase")]
    StoreFail { message: String },
    #[serde(rename_all = "camelCase")]
    Unsupported { message: String },
}

impl fmt::Display for DouyinAssetsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DouyinAssetsError::InvalidInput { message } => write!(f, "Invalid input: {message}"),
            DouyinAssetsError::NotFound { message } => write!(f, "Not found: {message}"),
            DouyinAssetsError::StoreFail { message } => write!(f, "Store failure: {message}"),
            DouyinAssetsError::Unsupported { message } => write!(f, "Unsupported: {message}"),
        }
    }
}

impl std::error::Error for DouyinAssetsError {}

pub type DouyinAssetsResult<T> = Result<T, DouyinAssetsError>;

pub fn invalid_input(message: impl Into<String>) -> DouyinAssetsError {
    DouyinAssetsError::InvalidInput {
        message: message.into(),
    }
}

pub fn store_fail(message: impl Into<String>) -> DouyinAssetsError {
    DouyinAssetsError::StoreFail {
        message: message.into(),
    }
}

/// 采集到的条目（去重键 = list_type + 平台作品 ID 或规范化分享链接）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CapturedItem {
    pub id: String,
    pub dedupe_key: String,
    pub list_type: String,
    /// 规范化后的分享链接；仅有平台作品 ID 时为空串。
    pub share_url: String,
    pub platform_item_id: Option<String>,
    pub title: Option<String>,
    pub author: Option<String>,
    pub cover_url: Option<String>,
    pub page_url: Option<String>,
    pub captured_at: String,
    pub source_capture_id: Option<String>,
    /// `new`（未导入视频）| `imported`（已导入本地视频）。
    pub status: String,
    pub video_asset_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

impl Default for CapturedItem {
    fn default() -> Self {
        Self {
            id: String::new(),
            dedupe_key: String::new(),
            list_type: String::new(),
            share_url: String::new(),
            platform_item_id: None,
            title: None,
            author: None,
            cover_url: None,
            page_url: None,
            captured_at: String::new(),
            source_capture_id: None,
            status: "new".to_string(),
            video_asset_id: None,
            created_at: String::new(),
            updated_at: String::new(),
            deleted_at: None,
        }
    }
}

/// 用户导入的本地视频资产。路径由宿主生成与保存，IPC 只暴露资产 ID 与元数据。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct VideoAsset {
    pub id: String,
    pub original_name: String,
    /// 相对私有数据目录的路径（`media/<assetId>/source.<ext>`）。
    pub rel_path: String,
    pub sha256: String,
    pub size_bytes: u64,
    /// 探测到的容器族：`mp4` | `mov` | `ebml`（mkv/webm）| `avi`。
    pub container: String,
    pub imported_at: String,
    pub deleted_at: Option<String>,
}

/// 宿主能力状态：插件 UI 据此如实展示缺什么，不假设机器有模型/worker。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DouyinCapabilities {
    pub media_worker: MediaWorkerStatus,
    pub limits: DouyinLimits,
    pub capture: CaptureStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaWorkerStatus {
    /// P1 固定 false：媒体 worker 尚未接入（DCA-02 按 DCA-00 PoC ADR 决定发行形态）。
    pub available: bool,
    /// `NOT_INSTALLED`（P1 固定）| `READY`。
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DouyinLimits {
    pub max_batch_items: usize,
    pub max_import_file_bytes: u64,
    pub max_page_limit: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatus {
    /// 本机桥是否就绪（Companion 能否提交采集批次）。
    pub bridge_ready: bool,
}

/// 分页查询参数与结果的 DTO。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedItemPage {
    pub items: Vec<CapturedItem>,
    pub total: u64,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFilesOutcome {
    pub imported: Vec<VideoAsset>,
    /// SHA-256 去重命中的数量（未重复导入）。
    pub duplicates: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteOutcome {
    pub items_deleted: usize,
    pub assets_deleted: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_codes_are_screaming_snake() {
        let value = serde_json::to_value(DouyinAssetsError::InvalidInput {
            message: "x".into(),
        })
        .expect("serialize");
        assert_eq!(value["code"], "INVALID_INPUT");
        assert_eq!(value["message"], "x");
    }

    #[test]
    fn stored_items_serialize_camel_case() {
        let item = CapturedItem {
            platform_item_id: Some("741".into()),
            ..Default::default()
        };
        let value = serde_json::to_value(&item).expect("serialize");
        assert!(value.get("platformItemId").is_some());
        assert!(value.get("platform_item_id").is_none());
    }
}
