//! Photo Triage commands / 照片筛选 IPC 命令（15 个）.
//!
//! 对齐迁移方案 §5 契约表；长任务进度走事件（`photo-triage:scan-progress` /
//! `photo-triage:scan-done`），轮询兜底走 `photo_triage_scan_status`。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager};

use crate::error::{AppError, AppResult};

use super::ffmpeg;
use super::preview;
use super::scan::{self, BuildProgress};
use super::state::TriageState;
use super::trash_ops;
use super::types::*;

pub const SCAN_PROGRESS_EVENT: &str = "photo-triage:scan-progress";
pub const SCAN_DONE_EVENT: &str = "photo-triage:scan-done";

/// 数据目录：`$APPDATA/photo-triage/`（对齐迁移方案 §4）。
fn data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("无法定位应用数据目录: {e}")))?;
    Ok(base.join("photo-triage"))
}

/// 每个相册目录一个独立构建目录：换相册互不污染，同相册增量复用代理。
fn build_dir_of(app: &AppHandle, src: &str) -> AppResult<PathBuf> {
    let digest = format!("{:x}", md5::compute(src.as_bytes()));
    let prefix: String = digest.chars().take(10).collect();
    Ok(data_dir(app)?.join(format!("build-{prefix}")))
}

fn now_str() -> String {
    // 与 Python 版 `time.strftime("%Y-%m-%d %H:%M")` 相同格式（本地时间）
    chrono::Local::now().format("%Y-%m-%d %H:%M").to_string()
}

fn config_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(data_dir(app)?.join("config.json"))
}

/// config.json schema 版本（recent 列表）。
const CONFIG_SCHEMA_VERSION: u64 = 1;

fn load_recent(app: &AppHandle) -> Vec<RecentAlbum> {
    let path = match config_path(app) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| {
            let schema = v
                .get("schema_version")
                .and_then(|s| s.as_u64())
                .unwrap_or(1);
            // 未来版本 fail-closed：降级为空列表，不误读未知格式
            if schema > CONFIG_SCHEMA_VERSION {
                return None;
            }
            v.get("recent").cloned()
        })
        .and_then(|v| serde_json::from_value::<Vec<RecentAlbum>>(v).ok())
        .unwrap_or_default()
}

fn save_recent(app: &AppHandle, recent: Vec<RecentAlbum>) {
    let path = match config_path(app) {
        Ok(p) => p,
        Err(_) => return,
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let json = serde_json::json!({ "schema_version": CONFIG_SCHEMA_VERSION, "recent": recent });
    let _ = fs::write(
        path,
        serde_json::to_string_pretty(&json).unwrap_or_default(),
    );
}

fn register_recent(app: &AppHandle, src: &str, build: &Path) {
    let mut recent: Vec<RecentAlbum> = load_recent(app)
        .into_iter()
        .filter(|r| r.src != src)
        .collect();
    recent.insert(
        0,
        RecentAlbum {
            src: src.to_string(),
            build: build.to_string_lossy().into_owned(),
            last: now_str(),
        },
    );
    recent.truncate(8);
    save_recent(app, recent);
}

/// 放通 asset 协议 scope：用户选定目录 + 构建目录（代理缓存天然位于 $APPDATA）。
fn allow_asset_scope(app: &AppHandle, src: &Path, build: &Path) {
    let scope = app.asset_protocol_scope();
    let _ = scope.allow_directory(src, true);
    let _ = scope.allow_directory(build, true);
}

// ---------------------------------------------------------------------------
// P1: scan / status / recent / open
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn photo_triage_scan(app: AppHandle, src: String) -> AppResult<ScanStartResult> {
    let src_path = PathBuf::from(&src);
    if !src_path.is_dir() {
        return Err(AppError::invalid_input(format!("目录不存在: {src}")));
    }
    let state = app.state::<TriageState>();
    if state.scanning.swap(true, Ordering::AcqRel) {
        return Err(AppError::new("SCAN_IN_PROGRESS", "正在扫描中，请稍候"));
    }
    state.cancel.store(false, Ordering::Release);
    let build = build_dir_of(&app, &src)?;
    fs::create_dir_all(&build).map_err(|e| AppError::io(format!("创建构建目录失败: {e}")))?;
    allow_asset_scope(&app, &src_path, &build);

    state.set_scan_status(ScanStatus {
        running: true,
        phase: "list".into(),
        done: 0,
        total: 0,
        current: String::new(),
        error: None,
        finished: 0.0,
    });

    let scan_state = app.clone();
    let scan_src = src.clone();
    let scan_build = build.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let st = scan_state.state::<TriageState>();
        let handle = scan_state.clone();
        let emit = |status: &ScanStatus| {
            let _ = handle.emit(SCAN_PROGRESS_EVENT, status.clone());
        };
        // 节流：进度事件至少间隔 120ms 发一次
        let mut last_emit = std::time::Instant::now();
        let mut progress = |p: BuildProgress| {
            let now = std::time::Instant::now();
            let mut status = st.get_scan_status();
            status.phase = p.phase.clone();
            status.done = p.done;
            status.total = p.total;
            status.current = p.current;
            st.set_scan_status(status.clone());
            if now.duration_since(last_emit).as_millis() >= 120 {
                last_emit = now;
                emit(&status);
            }
        };
        let result = scan::build_manifest(
            Path::new(&scan_src),
            &scan_build,
            false,
            &mut progress,
            &st.cancel,
        );
        match result {
            Ok(count) => {
                register_recent(&handle, &scan_src, &scan_build);
                st.scanning.store(false, Ordering::Release);
                let status = ScanStatus {
                    running: false,
                    phase: "done".into(),
                    done: count as u64,
                    total: count as u64,
                    current: String::new(),
                    error: None,
                    finished: unix_now(),
                };
                st.set_scan_status(status.clone());
                let _ = handle.emit(SCAN_DONE_EVENT, status);
            }
            Err(e) => {
                st.scanning.store(false, Ordering::Release);
                let status = ScanStatus {
                    running: false,
                    phase: "error".into(),
                    done: 0,
                    total: 0,
                    current: String::new(),
                    error: Some(e.message),
                    finished: unix_now(),
                };
                st.set_scan_status(status.clone());
                let _ = handle.emit(SCAN_DONE_EVENT, status);
            }
        }
    });

    Ok(ScanStartResult {
        ok: true,
        build: build.to_string_lossy().into_owned(),
    })
}

fn unix_now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

#[tauri::command]
pub async fn photo_triage_scan_status(app: AppHandle) -> AppResult<ScanStatus> {
    let state = app.state::<TriageState>();
    Ok(state.get_scan_status())
}

#[tauri::command]
pub async fn photo_triage_list_recent(app: AppHandle) -> AppResult<Vec<RecentAlbum>> {
    Ok(load_recent(&app))
}

#[tauri::command]
pub async fn photo_triage_open(app: AppHandle, src: String) -> AppResult<Manifest> {
    let build = build_dir_of(&app, &src)?;
    let manifest_path = build.join("manifest.json");
    if !manifest_path.exists() {
        return Err(AppError::not_found("该目录还没有扫描结果，请先扫描"));
    }
    // 大小防护：超限/膨胀缓存拒绝打开，提示重扫（对齐 scan::MANIFEST_MAX_BYTES 治理）
    if let Ok(md) = fs::metadata(&manifest_path) {
        if md.len() > scan::MANIFEST_MAX_BYTES {
            return Err(AppError::invalid_input(
                "manifest 超出大小上限，请重新扫描该相册",
            ));
        }
    }
    let raw = fs::read_to_string(&manifest_path)
        .map_err(|e| AppError::io(format!("manifest 读取失败: {e}")))?;
    let mut manifest: Manifest = serde_json::from_str(&raw)
        .map_err(|e| AppError::internal(format!("manifest 解析失败: {e}")))?;
    manifest.count = manifest.items.len();

    let src_path = PathBuf::from(&src);
    allow_asset_scope(&app, &src_path, &build);
    let state = app.state::<TriageState>();
    {
        let mut guard = state.session.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(super::state::Session {
            build: build.clone(),
            manifest_path: manifest_path.clone(),
            manifest: manifest.clone(),
        });
    }
    register_recent(&app, &src, &build);
    Ok(manifest)
}

// ---------------------------------------------------------------------------
// P2/P4: capabilities / proxy / original
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn photo_triage_capabilities() -> AppResult<PhotoTriageCapabilities> {
    Ok(ffmpeg::capabilities())
}

#[derive(Serialize)]
pub struct ProxyPath {
    pub path: Option<String>,
}

#[tauri::command]
pub async fn photo_triage_ensure_proxy(
    app: AppHandle,
    id: String,
    kind: String,
) -> AppResult<ProxyPath> {
    let kind_enum = preview::parse_kind(&kind)
        .ok_or_else(|| AppError::invalid_input(format!("未知预览类型: {kind}")))?;
    let state = app.state::<TriageState>();
    let path = preview::ensure_proxy(&state, &id, kind_enum).await?;
    Ok(ProxyPath { path })
}

#[tauri::command]
pub async fn photo_triage_original_path(app: AppHandle, id: String) -> AppResult<String> {
    let state = app.state::<TriageState>();
    let guard = state.session.lock().unwrap_or_else(|e| e.into_inner());
    let session = guard
        .as_ref()
        .ok_or_else(|| AppError::new("NO_SESSION", "当前没有打开的相册，请先选择照片目录"))?;
    let it = session
        .manifest
        .items
        .iter()
        .find(|it| it.id == id)
        .ok_or_else(|| AppError::not_found(format!("条目 {id} 不存在")))?;
    it.image
        .as_deref()
        .or(it.video.as_deref())
        .map(|p| p.to_string())
        .ok_or_else(|| AppError::not_found(format!("条目 {id} 没有原始文件")))
}

// ---------------------------------------------------------------------------
// P4: trash / restore / move / reveal / prune / empty dirs / export
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn photo_triage_trash(app: AppHandle, ids: Vec<String>) -> AppResult<TrashResult> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<TriageState>();
        trash_ops::trash(&state, ids)
    })
    .await
    .map_err(|e| AppError::task_failed(format!("移入废纸篓任务失败: {e}")))?
}

#[tauri::command]
pub async fn photo_triage_restore(app: AppHandle, ids: Vec<String>) -> AppResult<RestoreResult> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<TriageState>();
        trash_ops::restore(&state, ids)
    })
    .await
    .map_err(|e| AppError::task_failed(format!("恢复任务失败: {e}")))?
}

#[tauri::command]
pub async fn photo_triage_move(
    app: AppHandle,
    ids: Vec<String>,
    target: String,
) -> AppResult<MoveResult> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<TriageState>();
        trash_ops::move_items(&state, ids, target)
    })
    .await
    .map_err(|e| AppError::task_failed(format!("移动任务失败: {e}")))?
}

#[tauri::command]
pub async fn photo_triage_reveal(path: String) -> AppResult<()> {
    trash_ops::reveal(path)
}

#[tauri::command]
pub async fn photo_triage_prune(app: AppHandle) -> AppResult<PruneResult> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<TriageState>();
        trash_ops::prune(&state)
    })
    .await
    .map_err(|e| AppError::task_failed(format!("重置缓存任务失败: {e}")))?
}

#[tauri::command]
pub async fn photo_triage_empty_dirs(app: AppHandle) -> AppResult<EmptyDirsResult> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<TriageState>();
        trash_ops::empty_dirs(&state)
    })
    .await
    .map_err(|e| AppError::task_failed(format!("扫描空文件夹任务失败: {e}")))?
}

#[tauri::command]
pub async fn photo_triage_delete_empty_dirs(
    app: AppHandle,
    paths: Vec<String>,
) -> AppResult<DeleteEmptyDirsResult> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<TriageState>();
        trash_ops::delete_empty_dirs(&state, paths)
    })
    .await
    .map_err(|e| AppError::task_failed(format!("删除空文件夹任务失败: {e}")))?
}

#[tauri::command]
pub async fn photo_triage_export(
    app: AppHandle,
    ids: Vec<String>,
    out: String,
    zip: Option<bool>,
) -> AppResult<ExportResult> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<TriageState>();
        super::export::export(&state, ids, out, zip.unwrap_or(false))
    })
    .await
    .map_err(|e| AppError::task_failed(format!("导出任务失败: {e}")))?
}

use serde::Serialize;
