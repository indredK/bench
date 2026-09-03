//! Photo Triage / 照片筛选领域模块（旁路独立模块，macOS-only）。
//!
//! 迁移自 `/Users/apple/KnowledgeBase/photo-triage/`（Python 独立桌面应用）。
//! 稳定 ID 与 manifest 结构与原版逐字节一致，已扫描过的相册可直接复用缓存目录与代理。

pub(crate) mod commands;
pub(crate) mod export;
pub(crate) mod ffmpeg;
pub(crate) mod preview;
pub(crate) mod scan;
pub(crate) mod state;
pub(crate) mod trash_ops;
pub(crate) mod types;
