//! Photo Triage ffmpeg / ffmpeg 探测与降级.
//!
//! 对齐迁移方案 §6.2：探测顺序 `PATH` → `/opt/homebrew/bin/ffmpeg` →
//! `/usr/local/bin/ffmpeg`；未找到时 `has_ffmpeg: false`，前端标注「仅静态封面」。

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use super::types::PhotoTriageCapabilities;

#[derive(Debug, Clone)]
pub struct FfmpegInfo {
    pub has_ffmpeg: bool,
    pub path: Option<PathBuf>,
}

static FFMPEG: OnceLock<FfmpegInfo> = OnceLock::new();

fn detect_once() -> FfmpegInfo {
    let candidates: Vec<PathBuf> =
        std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
            .map(|p| p.join("ffmpeg"))
            .chain([
                PathBuf::from("/opt/homebrew/bin/ffmpeg"),
                PathBuf::from("/usr/local/bin/ffmpeg"),
            ])
            .collect();
    for cand in candidates {
        if cand.is_file() {
            // 确认可执行（`-version` 能跑通才算数，避免 PATH 里是死链/占位文件）
            if Command::new(&cand).arg("-version").output().is_ok() {
                return FfmpegInfo {
                    has_ffmpeg: true,
                    path: Some(cand),
                };
            }
        }
    }
    FfmpegInfo {
        has_ffmpeg: false,
        path: None,
    }
}

pub fn detect() -> &'static FfmpegInfo {
    FFMPEG.get_or_init(detect_once)
}

pub fn capabilities() -> PhotoTriageCapabilities {
    let info = detect();
    PhotoTriageCapabilities {
        has_ffmpeg: info.has_ffmpeg,
        ffmpeg_path: info.path.as_ref().map(|p| p.to_string_lossy().into_owned()),
    }
}
