//! Photo Triage types / 照片筛选类型.
//!
//! [`PhotoItem`] / [`Manifest`] 的字段名与 Python 版 `scan.py` 输出的 manifest.json
//! 保持一致（`type` / `stem` / `folder` / `image` / `video` / `*_proxy` / `size_bytes`
//! / `deleted` / `trash`），保证已有 Python 扫描结果可直接复用、标记不丢失。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoItem {
    pub id: String,
    /// `live` / `photo` / `video`
    #[serde(rename = "type")]
    pub typ: String,
    pub stem: String,
    /// 相对相册根目录的目录；`.` 表示根目录；移出相册后为绝对路径
    pub folder: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<String>,
    #[serde(rename = "image_proxy", skip_serializing_if = "Option::is_none")]
    pub image_proxy: Option<String>,
    #[serde(rename = "video_proxy", skip_serializing_if = "Option::is_none")]
    pub video_proxy: Option<String>,
    #[serde(rename = "video_poster", skip_serializing_if = "Option::is_none")]
    pub video_poster: Option<String>,
    #[serde(default)]
    pub size_bytes: u64,
    /// 该条目文件已移入废纸篓
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted: Option<bool>,
    /// 废纸篓位置映射：`{ "image": "<dest>", "video": "<dest>" }`，恢复时据此回移
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trash: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub source: String,
    pub count: usize,
    pub items: Vec<PhotoItem>,
}

/// 扫描/单条目操作的统一返回（对齐前端 `ScanStatus`）。
#[derive(Debug, Clone, Serialize)]
pub struct ScanStatus {
    pub running: bool,
    pub phase: String,
    pub done: u64,
    pub total: u64,
    pub current: String,
    pub error: Option<String>,
    /// 完成时刻（Unix 秒）
    pub finished: f64,
}

/// 迁移方案 §2 决策 2：ffmpeg 可选依赖 + 降级。
#[derive(Debug, Clone, Serialize)]
pub struct PhotoTriageCapabilities {
    pub has_ffmpeg: bool,
    pub ffmpeg_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentAlbum {
    pub src: String,
    pub build: String,
    pub last: String,
}

#[derive(Debug, Serialize)]
pub struct FileMoveInfo {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Serialize)]
pub struct PathError {
    pub path: String,
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct IdError {
    pub id: String,
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct TrashResult {
    pub moved: Vec<FileMoveInfo>,
    pub errors: Vec<PathError>,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct RestoreResult {
    pub restored: Vec<FileMoveInfo>,
    pub errors: Vec<PathError>,
    pub count: usize,
}

/// 移动后的条目信息，前端据此迁移标记（`from` → `to`）。
#[derive(Debug, Clone, Serialize)]
pub struct MoveUpdate {
    pub from: String,
    pub to: String,
    pub folder: String,
    pub image: Option<String>,
    pub video: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MoveResult {
    pub moved: Vec<String>,
    pub items: Vec<MoveUpdate>,
    pub errors: Vec<IdError>,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct PruneResult {
    pub removed: usize,
    pub kept: usize,
}

#[derive(Debug, Serialize)]
pub struct EmptyDirsResult {
    pub dirs: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct DeleteEmptyDirsResult {
    pub deleted: Vec<String>,
    pub errors: Vec<PathError>,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ExportResult {
    pub copied: usize,
    pub errors: Vec<PathError>,
    pub zip_path: Option<String>,
}

/// 扫描启动的即时返回（`{ ok, build }`）。
#[derive(Debug, Serialize)]
pub struct ScanStartResult {
    pub ok: bool,
    pub build: String,
}
