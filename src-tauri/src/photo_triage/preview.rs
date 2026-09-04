//! Photo Triage preview / 按需预览生成.
//!
//! 图片代理走 `sips`（系统自带，原生支持 HEIC→JPEG）；视频 4 秒片段走 `ffmpeg`
//! （可选依赖，无则降级静态封面）；封面无 ffmpeg 时回退 `qlmanage`。
//! 并发请求同一预览只生成一次（inflight 去重），`sips`/`ffmpeg` 并发由
//! [`super::state`] 中的令牌桶闸门限制。

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Notify;

use super::ffmpeg;
#[cfg(target_os = "macos")]
use super::scan::IMG_MAX_EDGE;
use super::scan::{fresh, VID_HEIGHT};
use super::state::{img_gate, vid_gate, ProxyKind, TriageState};
use crate::error::{AppError, AppResult};
use crate::subprocess::run_output_with_timeout;

/// 子进程超时：sips/qlmanage 短任务 60s；ffmpeg 转码最长 120s（损坏视频不拖死闸门）。
/// sips/qlmanage 为 macOS 系统工具，Windows 下不编译（避免 unused/dead-code）。
#[cfg(target_os = "macos")]
const SIPS_TIMEOUT: Duration = Duration::from_secs(60);
#[cfg(target_os = "macos")]
const QLMANAGE_TIMEOUT: Duration = Duration::from_secs(60);
const FFMPEG_TIMEOUT: Duration = Duration::from_secs(120);

/// `image`（图片代理）/ `poster`（视频封面）/ `video`（4 秒播放片段）。
pub fn parse_kind(kind: &str) -> Option<ProxyKind> {
    match kind {
        "image" => Some(ProxyKind::Image),
        "poster" => Some(ProxyKind::Poster),
        "video" => Some(ProxyKind::Video),
        _ => None,
    }
}

/// 有超时 + 输出上限的子进程执行（复用 subprocess 基建：超时杀进程组、输出截断 1MiB）。
fn run_quiet(cmd: &mut Command, timeout: Duration) -> bool {
    run_output_with_timeout(cmd, timeout, None)
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// `sips -s format jpeg -Z {IMG_MAX_EDGE} <src> --out <tmp>`
fn make_image_proxy(src: &Path, tmp: &Path) -> bool {
    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("sips");
        cmd.arg("-s")
            .arg("format")
            .arg("jpeg")
            .arg("-Z")
            .arg(IMG_MAX_EDGE.to_string())
            .arg(src)
            .arg("--out")
            .arg(tmp);
        run_quiet(&mut cmd, SIPS_TIMEOUT)
            && tmp.exists()
            && tmp.metadata().map(|m| m.len() > 0).unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (src, tmp);
        false
    }
}

/// 视频静态封面：优先 ffmpeg 单帧；失败或无 ffmpeg 时回退 qlmanage（须转成 jpeg）。
fn make_video_poster(src: &Path, tmp: &Path, info: &ffmpeg::FfmpegInfo) -> bool {
    // macOS 下 qlmanage 回退段会改写 made；Windows 无该段，made 只赋值一次（不可变）。
    #[cfg(target_os = "macos")]
    let mut made = fresh(tmp, true); // force: 先删除占位
    #[cfg(not(target_os = "macos"))]
    let made = fresh(tmp, true); // force: 先删除占位
    if info.has_ffmpeg {
        if let Some(ff) = &info.path {
            let mut cmd = Command::new(ff);
            cmd.args(["-y", "-ss", "0.1", "-i"])
                .arg(src)
                .args(["-vframes", "1", "-q:v", "3"]);
            let ok = run_quiet(cmd.arg(tmp), FFMPEG_TIMEOUT)
                && tmp.exists()
                && tmp.metadata().map(|m| m.len() > 0).unwrap_or(false);
            if ok {
                return true;
            }
        }
    }
    // 回退：qlmanage 生成静态封面（独立临时目录，避免不同目录同名文件互相覆盖）。
    // qlmanage 输出 .png——用 sips 转成 jpeg，保证 `*_poster.jpg` 是真实 JPEG。
    #[cfg(target_os = "macos")]
    {
        let ql_dir = tmp.parent().unwrap_or(Path::new(".")).join(format!(
            ".ql_{}",
            tmp.file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default()
        ));
        let _ = std::fs::create_dir_all(&ql_dir);
        let run = {
            let mut cmd = Command::new("qlmanage");
            cmd.args(["-t", "-s", "600", "-o"]).arg(&ql_dir).arg(src);
            run_quiet(&mut cmd, QLMANAGE_TIMEOUT)
        };
        if run {
            let cand = ql_dir.join(
                src.file_stem()
                    .map(|s| format!("{}.png", s.to_string_lossy()))
                    .unwrap_or_default(),
            );
            if cand.exists() {
                let mut conv = Command::new("sips");
                conv.args(["-s", "format", "jpeg"])
                    .arg(&cand)
                    .arg("--out")
                    .arg(tmp);
                if run_quiet(&mut conv, SIPS_TIMEOUT)
                    && tmp.metadata().map(|m| m.len() > 0).unwrap_or(false)
                {
                    made = true;
                }
            }
        }
        let _ = std::fs::remove_dir_all(&ql_dir);
    }
    made
}

/// `ffmpeg -t 4 -vf scale=-2:{VID_HEIGHT} -c:v libx264 -preset veryfast
///  -c:a aac -b:a 128k -movflags +faststart <tmp.mp4>`
fn transcode_video(src: &Path, tmp: &Path, info: &ffmpeg::FfmpegInfo) -> bool {
    let _ = fresh(tmp, true);
    if !info.has_ffmpeg {
        return false;
    }
    if let Some(ff) = &info.path {
        let mut cmd = Command::new(ff);
        cmd.arg("-y")
            .arg("-i")
            .arg(src)
            .arg("-t")
            .arg("4")
            .arg("-vf")
            .arg(format!("scale=-2:{VID_HEIGHT}"))
            .arg("-c:v")
            .arg("libx264")
            .arg("-preset")
            .arg("veryfast")
            .arg("-c:a")
            .arg("aac")
            .arg("-b:a")
            .arg("128k")
            .arg("-movflags")
            .arg("+faststart")
            .arg(tmp);
        return run_quiet(&mut cmd, FFMPEG_TIMEOUT)
            && tmp.exists()
            && tmp.metadata().map(|m| m.len() > 0).unwrap_or(false);
    }
    false
}

/// 生成失败清理 `.part` 文件。
fn cleanup_tmp(tmp: &Path) {
    let _ = std::fs::remove_file(tmp);
}

/// 确保某条目的按需预览已生成并缓存，返回代理的本地路径（前端经 `convertFileSrc` 加载）。
///
/// 已生成直接返回；未生成则在 inflight 去重后限并发生成，并把相对路径登记回清单
/// 的对应字段（供重扫/复用）。
pub async fn ensure_proxy(
    state: &TriageState,
    id: &str,
    kind: ProxyKind,
) -> AppResult<Option<String>> {
    let (src, session) = {
        let guard = state.session.lock().unwrap_or_else(|e| e.into_inner());
        let session = guard
            .as_ref()
            .ok_or_else(|| AppError::new("NO_SESSION", "当前没有打开的相册，请先选择照片目录"))?;
        let src = session
            .manifest
            .items
            .iter()
            .find(|it| it.id == id)
            .and_then(|it| match kind {
                ProxyKind::Image => it.image.as_ref(),
                ProxyKind::Poster | ProxyKind::Video => it.video.as_ref(),
            })
            .map(PathBuf::from)
            .filter(|p| p.exists())
            .ok_or_else(|| AppError::not_found(format!("条目 {id} 不存在或原文件已丢失")))?;
        (src, (session.build.clone(), session.manifest_path.clone()))
    };
    let (build, manifest_path) = session;
    let name = kind.file_name(id);
    let out = build.join("proxies").join(&name);
    if fresh(&out, false) {
        return Ok(Some(out.to_string_lossy().into_owned()));
    }

    // inflight 去重：并发请求同一预览只让第一个执行，其余等待。
    let key = (kind.code(), id.to_string());
    let notify = {
        let mut inflight = state.inflight.lock().unwrap_or_else(|e| e.into_inner());
        match inflight.get(&key) {
            Some(existing) => {
                let n = existing.clone();
                let owner = false;
                (n, owner)
            }
            None => {
                let n = Arc::new(Notify::new());
                inflight.insert(key.clone(), n.clone());
                (n, true)
            }
        }
    };
    let (notify, owner) = notify;
    if !owner {
        notify.notified().await;
        return Ok((fresh(&out, false)).then(|| out.to_string_lossy().into_owned()));
    }

    let result = {
        let gate = match kind {
            ProxyKind::Video => vid_gate(),
            _ => img_gate(),
        };
        let permit = match gate.acquire().await {
            Ok(p) => p,
            Err(_) => {
                // 闸门失效（理论上不会发生）：清理 inflight 后按失败处理
                state
                    .inflight
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(&key);
                notify.notify_waiters();
                return Ok(None);
            }
        };
        let _permit = permit;
        let spawn_src = src.clone();
        let spawn_out = out.clone();
        let info = ffmpeg::detect().clone();
        let kind_for_gen = kind;
        tauri::async_runtime::spawn_blocking(move || {
            // ffmpeg/sips 按扩展名推断输出格式，临时文件必须保留真实扩展名
            let ext = if kind_for_gen == ProxyKind::Video {
                "mp4"
            } else {
                "jpg"
            };
            let tmp = spawn_out.with_extension(format!("part.{ext}"));
            let ok = match kind_for_gen {
                ProxyKind::Image => make_image_proxy(&spawn_src, &tmp),
                ProxyKind::Poster => make_video_poster(&spawn_src, &tmp, &info),
                ProxyKind::Video => transcode_video(&spawn_src, &tmp, &info),
            };
            if ok && tmp.exists() && tmp.metadata().map(|m| m.len() > 0).unwrap_or(false) {
                let _ = std::fs::rename(&tmp, &spawn_out);
            } else {
                cleanup_tmp(&tmp);
            }
        })
        .await
    };

    {
        let mut inflight = state.inflight.lock().unwrap_or_else(|e| e.into_inner());
        inflight.remove(&key);
    }
    notify.notify_waiters();

    if let Err(e) = result {
        return Err(AppError::task_failed(format!("预览生成任务失败: {e}")));
    }
    if !fresh(&out, false) {
        return Ok(None);
    }

    // 登记回清单，重扫/下次浏览直接命中缓存。
    {
        let mut guard = state.session.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(session) = guard.as_mut() {
            if session.manifest_path == manifest_path {
                if let Some(it) = session.manifest.items.iter_mut().find(|it| it.id == id) {
                    let rel = format!("proxies/{name}");
                    match kind {
                        ProxyKind::Image => it.image_proxy = Some(rel),
                        ProxyKind::Poster => it.video_poster = Some(rel),
                        ProxyKind::Video => it.video_proxy = Some(rel),
                    }
                }
            }
        }
    }
    Ok(Some(out.to_string_lossy().into_owned()))
}
