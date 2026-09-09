//! Photo Triage scan / 扫描与配对 —— 薄壳层。
//!
//! 实现已迁移至 `crates/bench-capabilities/src/photo_triage.rs`（能力内核，
//! 与 bench-host / MCP / CLI 共享同一份实现）。本文件保留原公开 API：
//! Tauri 侧返回 [`AppResult`]，内核返回 [`CapResult`]，两者 serde 形状同构
//! （`{ code, message }`），在此做一次 `From` 转换。

use std::path::Path;
use std::sync::atomic::AtomicBool;

use crate::error::{AppError, AppResult};

// 类型与纯函数直接 re-export（serde 形状逐字节一致，前端无感知）。
// 部分 re-export 仅为保持既有模块 API 兼容（crate 内暂未使用），刻意保留。
#[allow(unused_imports)]
pub use bench_capabilities::photo_triage::{
    atomic_write, fresh, stable_id, BuildProgress, Manifest, PhotoItem, IMAGE_EXTS, IMG_MAX_EDGE,
    MANIFEST_MAX_BYTES, VIDEO_EXTS, VID_HEIGHT,
};

impl From<bench_capabilities::CapError> for AppError {
    fn from(e: bench_capabilities::CapError) -> Self {
        AppError::new(e.code, e.message)
    }
}

/// `force` 时清空并重建全部代理；否则已有且非空的代理直接复用（对齐 `_fresh`）。
pub fn build_manifest(
    src: &Path,
    build: &Path,
    force: bool,
    progress: &mut impl FnMut(BuildProgress),
    cancel: &AtomicBool,
) -> AppResult<usize> {
    bench_capabilities::photo_triage::build_manifest(src, build, force, progress, cancel)
        .map_err(AppError::from)
}

/// manifest 原子落盘：写 `.tmp` 后 rename（对齐 Python `write_json_atomic`）。
pub fn write_manifest_atomic(path: &Path, manifest: &mut Manifest) -> AppResult<()> {
    bench_capabilities::photo_triage::write_manifest_atomic(path, manifest).map_err(AppError::from)
}
