//! douyin_content_assets IPC 命令（插件能力面，DCA-01）。
//!
//! 命令清单（四处同步登记：本文件实现 + `app_invoke_handler!` +
//! `EXTENSION_ALLOWED_COMMANDS` + 插件 `manifest.acl.commands`，TS 侧
//! `contracts.ts`/typed wrapper 同步）：
//! - `douyin_assets_get_capabilities`：能力状态（worker/上限/桥）；
//! - `douyin_assets_list_items`：分页查询采集条目；
//! - `douyin_assets_import_files`：宿主弹原生文件选择器导入本地视频（只返回资产 ID+元数据）；
//! - `douyin_assets_delete_items`：软删（回收语义，卸载默认保留数据）。
//!
//! 插件前端不接触任何本机路径：文件选择、容器探测、复制与 SHA-256
//! 全部由宿主完成；导入产物落在插件私有数据目录 `media/<assetId>/`。

use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime};

use crate::douyin_content_assets::store;
use crate::douyin_content_assets::types::{
    invalid_input, DouyinAssetsError, DouyinAssetsResult, ImportFilesOutcome, VideoAsset,
    MAX_IMPORT_FILE_BYTES, MAX_PAGE_LIMIT,
};

/// 文件选择器接受的视频扩展名（跨平台通用子集）。
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "webm", "mkv", "m4v", "avi"];

/// 能力状态：P1 无 worker，如实返回 NOT_INSTALLED。
#[tauri::command]
pub fn douyin_assets_get_capabilities(
) -> DouyinAssetsResult<crate::douyin_content_assets::types::DouyinCapabilities> {
    Ok(crate::douyin_content_assets::types::DouyinCapabilities {
        media_worker: crate::douyin_content_assets::types::MediaWorkerStatus {
            available: false,
            status: "NOT_INSTALLED".to_string(),
        },
        limits: crate::douyin_content_assets::types::DouyinLimits {
            max_batch_items: crate::douyin_content_assets::types::MAX_BATCH_ITEMS,
            max_import_file_bytes: MAX_IMPORT_FILE_BYTES,
            max_page_limit: MAX_PAGE_LIMIT,
        },
        capture: crate::douyin_content_assets::types::CaptureStatus {
            bridge_ready: crate::account_manager::browser_bridge::descriptor().is_some(),
        },
    })
}

/// 分页查询采集条目（软删的除外），按 captured_at 倒序。
#[tauri::command]
pub fn douyin_assets_list_items<R: Runtime>(
    app: AppHandle<R>,
    offset: Option<u32>,
    limit: Option<u32>,
    list_type: Option<String>,
    search: Option<String>,
) -> DouyinAssetsResult<crate::douyin_content_assets::types::CapturedItemPage> {
    if let Some(list_type) = &list_type {
        if !crate::douyin_content_assets::types::LIST_TYPES.contains(&list_type.as_str()) {
            return Err(invalid_input(format!("unknown list type `{list_type}`")));
        }
    }
    let offset = offset.unwrap_or(0) as usize;
    let limit = limit.unwrap_or(50).min(MAX_PAGE_LIMIT) as usize;

    let file = store::load_items(&app)?;
    let search = search
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());
    let mut items: Vec<&crate::douyin_content_assets::types::CapturedItem> = file
        .items
        .iter()
        .filter(|item| item.deleted_at.is_none())
        .filter(|item| {
            list_type
                .as_ref()
                .map(|wanted| &item.list_type == wanted)
                .unwrap_or(true)
        })
        .filter(|item| match &search {
            Some(needle) => {
                item.title
                    .as_deref()
                    .map(|t| t.to_lowercase().contains(needle))
                    .unwrap_or(false)
                    || item
                        .author
                        .as_deref()
                        .map(|a| a.to_lowercase().contains(needle))
                        .unwrap_or(false)
            }
            None => true,
        })
        .collect();
    items.sort_by(|a, b| b.captured_at.cmp(&a.captured_at).then(a.id.cmp(&b.id)));
    let total = items.len();
    let page: Vec<crate::douyin_content_assets::types::CapturedItem> = items
        .into_iter()
        .skip(offset)
        .take(limit)
        .cloned()
        .collect();
    let has_more = offset + page.len() < total;
    Ok(crate::douyin_content_assets::types::CapturedItemPage {
        items: page,
        total: total as u64,
        has_more,
    })
}

/// 宿主弹原生文件选择器 → 校验容器/大小 → 复制进私有目录 → SHA-256 去重。
///
/// 必须是 `async`：`blocking_pick_files` 只能离开主线程调用（放
/// `spawn_blocking`），同步命令默认跑在主线程会造成界面卡死。
#[tauri::command]
pub async fn douyin_assets_import_files(app: AppHandle) -> DouyinAssetsResult<ImportFilesOutcome> {
    tauri::async_runtime::spawn_blocking(move || import_files_blocking(&app))
        .await
        .map_err(|e| invalid_input(format!("task join failed: {e}")))?
}

/// 软删采集条目与/或视频资产（至少一项非空；数据保留，可后续物理清理）。
#[tauri::command]
pub fn douyin_assets_delete_items<R: Runtime>(
    app: AppHandle<R>,
    item_ids: Option<Vec<String>>,
    asset_ids: Option<Vec<String>>,
) -> DouyinAssetsResult<crate::douyin_content_assets::types::DeleteOutcome> {
    let item_ids = item_ids.unwrap_or_default();
    let asset_ids = asset_ids.unwrap_or_default();
    if item_ids.is_empty() && asset_ids.is_empty() {
        return Err(invalid_input("item_ids and asset_ids cannot both be empty"));
    }
    let now = chrono::Utc::now().to_rfc3339();
    let mut items_deleted = 0usize;
    let mut assets_deleted = 0usize;
    if !item_ids.is_empty() {
        items_deleted = store::with_items_mut(&app, |items| {
            let mut count = 0usize;
            for item in items.iter_mut() {
                if item_ids.contains(&item.id) && item.deleted_at.is_none() {
                    item.deleted_at = Some(now.clone());
                    item.updated_at = now.clone();
                    count += 1;
                }
            }
            Ok(count)
        })?;
    }
    if !asset_ids.is_empty() {
        assets_deleted = store::with_assets_mut(&app, |assets| {
            let mut count = 0usize;
            for asset in assets.iter_mut() {
                if asset_ids.contains(&asset.id) && asset.deleted_at.is_none() {
                    asset.deleted_at = Some(now.clone());
                    count += 1;
                }
            }
            Ok(count)
        })?;
    }
    Ok(crate::douyin_content_assets::types::DeleteOutcome {
        items_deleted,
        assets_deleted,
    })
}

// ── 导入实现（阻塞上下文）───────────────────────────────────────────

fn import_files_blocking(app: &AppHandle) -> DouyinAssetsResult<ImportFilesOutcome> {
    use tauri_plugin_dialog::DialogExt;

    let picked = app
        .dialog()
        .file()
        .add_filter("Videos", VIDEO_EXTENSIONS)
        .blocking_pick_files();
    let Some(paths) = picked else {
        // 用户取消选择不是错误。
        return Ok(ImportFilesOutcome {
            imported: Vec::new(),
            duplicates: 0,
        });
    };

    let media_dir = store::media_dir(app)?;
    let mut imported = Vec::new();
    let mut duplicates = 0usize;
    for file_path in paths {
        let path = file_path
            .into_path()
            .map_err(|e| invalid_input(format!("resolve picked file: {e}")))?;
        match import_one(app, &path, &media_dir)? {
            Some(asset) => imported.push(asset),
            None => duplicates += 1,
        }
    }
    Ok(ImportFilesOutcome {
        imported,
        duplicates,
    })
}

/// 导入单个视频；返回 `None` 表示 SHA-256 与既有未删资产重复。
fn import_one<R: Runtime>(
    app: &AppHandle<R>,
    path: &Path,
    media_dir: &Path,
) -> DouyinAssetsResult<Option<VideoAsset>> {
    let meta =
        std::fs::metadata(path).map_err(|e| invalid_input(format!("read file metadata: {e}")))?;
    if !meta.is_file() {
        return Err(invalid_input("picked path is not a regular file"));
    }
    if meta.len() > MAX_IMPORT_FILE_BYTES {
        return Err(invalid_input(format!(
            "file exceeds the {} byte limit",
            MAX_IMPORT_FILE_BYTES
        )));
    }
    let container = sniff_container(path)?;
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_else(|| container.clone());
    let original_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("video")
        .to_string();

    let (sha256, size_bytes) = hash_file(path)?;
    // SHA-256 去重：同内容文件不重复入库（含软删条目——复活语义属删除域，不在此处理）。
    let existing = store::load_assets(app)?;
    if existing
        .assets
        .iter()
        .any(|asset| asset.sha256 == sha256 && asset.deleted_at.is_none())
    {
        return Ok(None);
    }

    let asset_id = uuid::Uuid::new_v4().to_string();
    let asset_dir = media_dir.join(&asset_id);
    std::fs::create_dir_all(&asset_dir).map_err(|e| {
        crate::douyin_content_assets::types::DouyinAssetsError::StoreFail {
            message: format!("create asset dir: {e}"),
        }
    })?;
    let dest = asset_dir.join(format!("source.{extension}"));
    let copy_result = std::fs::copy(path, &dest);
    if let Err(error) = copy_result {
        // 半写状态清理：失败不留下不可引用的资产目录。
        let _ = std::fs::remove_dir_all(&asset_dir);
        return Err(DouyinAssetsError::StoreFail {
            message: format!("copy file: {error}"),
        });
    }

    let now = chrono::Utc::now().to_rfc3339();
    let asset = VideoAsset {
        id: asset_id.clone(),
        original_name,
        rel_path: format!("media/{asset_id}/source.{extension}"),
        sha256,
        size_bytes,
        container,
        imported_at: now.clone(),
        deleted_at: None,
    };
    store::with_assets_mut(app, |assets| {
        assets.push(asset.clone());
        Ok(())
    })?;
    Ok(Some(asset))
}

/// 读文件头识别容器族；不认识的容器直接拒绝（fail-closed）。
fn sniff_container(path: &Path) -> DouyinAssetsResult<String> {
    let mut file =
        std::fs::File::open(path).map_err(|e| invalid_input(format!("open file: {e}")))?;
    let mut header = [0u8; 12];
    let read = file
        .read(&mut header)
        .map_err(|e| invalid_input(format!("read header: {e}")))?;
    if read < 12 {
        return Err(invalid_input("file too small to be a supported video"));
    }
    if &header[4..8] == b"ftyp" {
        let brand = &header[8..12];
        // mov 的常见 brand：qt / M4V 等；mp4 大多以 ftyp+isom/mp42/mp41 开始。
        if brand == b"qt  " {
            return Ok("mov".to_string());
        }
        return Ok("mp4".to_string());
    }
    if header[..4] == [0x1A, 0x45, 0xDF, 0xA3] {
        return Ok("ebml".to_string()); // mkv / webm
    }
    if &header[..4] == b"RIFF" && &header[8..12] == b"AVI " {
        return Ok("avi".to_string());
    }
    Err(invalid_input("unsupported media container"))
}

/// 流式 SHA-256，避免大文件整读进内存。
fn hash_file(path: &Path) -> DouyinAssetsResult<(String, u64)> {
    use std::io::Seek;
    let mut file =
        std::fs::File::open(path).map_err(|e| invalid_input(format!("open file: {e}")))?;
    let size = file
        .seek(std::io::SeekFrom::End(0))
        .map_err(|e| invalid_input(format!("seek file: {e}")))?;
    file.rewind()
        .map_err(|e| invalid_input(format!("rewind file: {e}")))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| invalid_input(format!("hash file: {e}")))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    // sha2 0.11 的输出不再实现 LowerHex，按仓库惯例逐字节转 hex。
    let sha256 = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Ok((sha256, size))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sniff_rejects_unknown_containers_fail_closed() {
        let dir = std::env::temp_dir().join(format!("dca-sniff-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("mkdir");
        let path = dir.join("sample.bin");
        std::fs::write(&path, [0u8; 32]).expect("write");

        assert!(sniff_container(&path).is_err());

        let mut mp4 = vec![0u8; 12];
        mp4[4..8].copy_from_slice(b"ftyp");
        mp4[8..12].copy_from_slice(b"isom");
        std::fs::write(&path, mp4).expect("write");
        assert_eq!(sniff_container(&path).expect("mp4"), "mp4");

        let mut mov = vec![0u8; 12];
        mov[4..8].copy_from_slice(b"ftyp");
        mov[8..12].copy_from_slice(b"qt  ");
        std::fs::write(&path, mov).expect("write");
        assert_eq!(sniff_container(&path).expect("mov"), "mov");

        let mut ebml = vec![0u8; 12];
        ebml[..4].copy_from_slice(&[0x1A, 0x45, 0xDF, 0xA3]);
        std::fs::write(&path, ebml).expect("write");
        assert_eq!(sniff_container(&path).expect("ebml"), "ebml");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn video_extensions_cover_common_containers() {
        assert!(VIDEO_EXTENSIONS.contains(&"mp4"));
        assert!(VIDEO_EXTENSIONS.contains(&"webm"));
    }
}
