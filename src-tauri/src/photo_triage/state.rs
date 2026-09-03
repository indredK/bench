//! Photo Triage state / 照片筛选共享状态.
//!
//! 对齐迁移方案 §6.4「并发与去重」：inflight 去重 + 令牌桶并发闸门 +
//! 扫描期 BUSY 闸门（扫描期间拒绝改动清单的批量操作）。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::OnceLock;
use std::sync::{Arc, Mutex};

use tokio::sync::{Notify, Semaphore};

use super::types::{Manifest, ScanStatus};

/// 图片代理（sips）并发上限，对齐 Python `IMG_GATE = Semaphore(6)`。
pub static IMG_GATE: OnceLock<Semaphore> = OnceLock::new();
/// 视频转码并发上限，对齐 Python `VID_GATE = Semaphore(2)`。
pub static VID_GATE: OnceLock<Semaphore> = OnceLock::new();

pub fn img_gate() -> &'static Semaphore {
    IMG_GATE.get_or_init(|| Semaphore::new(6))
}

pub fn vid_gate() -> &'static Semaphore {
    VID_GATE.get_or_init(|| Semaphore::new(2))
}

/// 预览种类：图片代理 / 视频封面 / 视频片段。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProxyKind {
    Image,
    Poster,
    Video,
}

impl ProxyKind {
    pub fn code(self) -> u8 {
        match self {
            ProxyKind::Image => 0,
            ProxyKind::Poster => 1,
            ProxyKind::Video => 2,
        }
    }

    /// 与 Python 版一致的输出文件名，保证跨会话复用缓存。
    pub fn file_name(self, id: &str) -> String {
        match self {
            ProxyKind::Image => format!("{id}_img.jpg"),
            ProxyKind::Poster => format!("{id}_poster.jpg"),
            ProxyKind::Video => format!("{id}_vid.mp4"),
        }
    }
}

/// 当前打开的相册会话（manifest 全量驻留内存，改动后原子落盘）。
pub struct Session {
    pub build: PathBuf,
    pub manifest_path: PathBuf,
    pub manifest: Manifest,
}

pub struct TriageState {
    /// 当前打开的相册；未打开为 `None`
    pub session: Mutex<Option<Session>>,
    /// 扫描是否进行中（BUSY 闸门：期间拒绝移动/删除/恢复/重置）
    pub scanning: AtomicBool,
    /// 扫描取消标志
    pub cancel: AtomicBool,
    /// 轮询兜底用的扫描状态
    pub scan_status: Mutex<ScanStatus>,
    /// 正在生成的预览 (kind, id) -> Notify：并发请求同一预览只生成一次
    pub inflight: Mutex<HashMap<(u8, String), Arc<Notify>>>,
}

impl Default for TriageState {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
            scanning: AtomicBool::new(false),
            cancel: AtomicBool::new(false),
            scan_status: Mutex::new(ScanStatus {
                running: false,
                phase: "idle".into(),
                done: 0,
                total: 0,
                current: String::new(),
                error: None,
                finished: 0.0,
            }),
            inflight: Mutex::new(HashMap::new()),
        }
    }
}

impl TriageState {
    pub fn set_scan_status(&self, status: ScanStatus) {
        *self.scan_status.lock().unwrap_or_else(|e| e.into_inner()) = status;
    }

    pub fn get_scan_status(&self) -> ScanStatus {
        self.scan_status
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}
