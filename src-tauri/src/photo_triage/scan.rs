//! Photo Triage scan / 扫描与配对.
//!
//! 对齐 Python `scan.py`：只做目录遍历 + 图/视频配对 + 稳定 ID，秒级完成；
//! 预览一律按需生成，已存在的代理直接登记回清单（增量复用）。
//! 稳定 ID 为 `md5(相对路径去扩展名)[:12]`，与 Python 版逐字节一致。

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::persistence::atomic_write;

use super::types::{Manifest, PhotoItem};

pub const IMAGE_EXTS: &[&str] = &[
    ".heic", ".heif", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp",
];
pub const VIDEO_EXTS: &[&str] = &[".mov", ".mp4", ".m4v", ".avi", ".mkv", ".webm"];

/// 图片代理最长边（越大越容易看清糊不糊），对齐 Python `IMG_MAX_EDGE = 1600`。
/// 仅 macOS 的 sips 预览路径使用；Windows 下不编译（避免 dead-code）。
#[cfg(target_os = "macos")]
pub const IMG_MAX_EDGE: u32 = 1600;
/// 视频代理高度，对齐 Python `VID_HEIGHT = 720`。
pub const VID_HEIGHT: u32 = 720;
/// manifest.json 大小上限：约 40 万条目（~600B/条）。超限拒绝写入，避免损坏/膨胀缓存
/// 拖垮打开流程（Python 版兼容约束下不引入 schema_version，见 D-020）。
pub const MANIFEST_MAX_BYTES: u64 = 256 * 1024 * 1024;

/// 基于相对路径的稳定 ID：目录内容变化不影响未变文件的 ID。
pub fn stable_id(key: &str) -> String {
    let digest = md5::compute(key.as_bytes());
    let hex = format!("{digest:x}");
    hex.chars().take(12).collect()
}

fn is_image_ext(ext: &str) -> bool {
    IMAGE_EXTS.contains(&ext)
}

fn is_video_ext(ext: &str) -> bool {
    VIDEO_EXTS.contains(&ext)
}

/// 遍历中间状态：同 key（相对路径去扩展名）的 image / video 配对。
#[derive(Debug, Default)]
struct Group {
    image: Option<PathBuf>,
    video: Option<PathBuf>,
}

/// 扫描进度（由调用方节流地转发为 Tauri 事件）。
#[derive(Debug, Clone, Default)]
pub struct BuildProgress {
    pub phase: String,
    pub done: u64,
    pub total: u64,
    pub current: String,
}

/// `force` 时清空并重建全部代理；否则已有且非空的代理直接复用（对齐 `_fresh`）。
pub fn build_manifest(
    src: &Path,
    build: &Path,
    force: bool,
    progress: &mut impl FnMut(BuildProgress),
    cancel: &std::sync::atomic::AtomicBool,
) -> AppResult<usize> {
    fs::create_dir_all(build).map_err(|e| AppError::io(format!("创建构建目录失败: {e}")))?;
    let proxies = build.join("proxies");
    fs::create_dir_all(&proxies).map_err(|e| AppError::io(format!("创建代理目录失败: {e}")))?;
    if force {
        if let Ok(entries) = fs::read_dir(&proxies) {
            for entry in entries.flatten() {
                if entry.path().is_file() {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }

    // 收集文件，按 (相对路径去扩展名) 配对，避免不同目录同名冲突。
    // 遍历顺序只影响收集，输出顺序按 key 排序（与 Python `sorted(groups)` 一致）。
    let mut groups: HashMap<String, Group> = HashMap::new();
    let mut found = 0u64;
    let walker = walkdir::WalkDir::new(src)
        .follow_links(false)
        .sort_by_file_name();
    for entry in walker.into_iter().flatten() {
        if cancel.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(AppError::new(
                "SCAN_CANCELED",
                "扫描已取消（原样返回，不写入清单）",
            ));
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e.to_lowercase()))
            .unwrap_or_default();
        if !(is_image_ext(&ext) || is_video_ext(&ext)) {
            continue;
        }
        let rel = path.strip_prefix(src).unwrap_or(path);
        let key = rel.with_extension("");
        let group = groups
            .entry(key.to_string_lossy().into_owned())
            .or_default();
        if is_image_ext(&ext) {
            if group.image.is_none() {
                group.image = Some(path.to_path_buf());
            }
        } else if group.video.is_none() {
            group.video = Some(path.to_path_buf());
        }
        found += 1;
        if found.is_multiple_of(100) {
            progress(BuildProgress {
                phase: "list".into(),
                done: found,
                total: found,
                current: String::new(),
            });
        }
    }
    if cancel.load(std::sync::atomic::Ordering::Relaxed) {
        return Err(AppError::new(
            "SCAN_CANCELED",
            "扫描已取消（原样返回，不写入清单）",
        ));
    }

    let mut keys: Vec<&String> = groups.keys().collect();
    keys.sort();
    let mut items = Vec::with_capacity(keys.len());
    let mut done = 0u64;
    for key in keys {
        let g = &groups[key];
        let iid = stable_id(key);
        let img = g.image.as_ref();
        let vid = g.video.as_ref();
        let typ = if img.is_some() && vid.is_some() {
            "live"
        } else if img.is_some() {
            "photo"
        } else {
            "video"
        };
        let stem = Path::new(key)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let folder = Path::new(key)
            .parent()
            .and_then(|p| p.to_str())
            .unwrap_or(".");
        let folder = if folder.is_empty() { "." } else { folder };
        let mut size_bytes: u64 = 0;
        if let Some(p) = img {
            if let Ok(md) = fs::metadata(p) {
                size_bytes += md.len();
            }
        }
        if let Some(v) = vid {
            if let Ok(md) = fs::metadata(v) {
                size_bytes += md.len();
            }
        }
        let image_proxy = img
            .map(|_| format!("proxies/{iid}_img.jpg"))
            .filter(|name| fresh(&proxies.join(name.trim_start_matches("proxies/")), false));
        let video_poster = vid
            .map(|_| format!("proxies/{iid}_poster.jpg"))
            .filter(|name| fresh(&proxies.join(name.trim_start_matches("proxies/")), false));
        let video_proxy = vid
            .map(|_| format!("proxies/{iid}_vid.mp4"))
            .filter(|name| fresh(&proxies.join(name.trim_start_matches("proxies/")), false));
        items.push(PhotoItem {
            id: iid,
            typ: typ.into(),
            stem,
            folder: folder.to_string(),
            image: img.map(|p| p.to_string_lossy().into_owned()),
            video: vid.map(|p| p.to_string_lossy().into_owned()),
            image_proxy,
            video_proxy,
            video_poster,
            size_bytes,
            deleted: None,
            trash: None,
        });
        done += 1;
        if done.is_multiple_of(100) {
            progress(BuildProgress {
                phase: "list".into(),
                done,
                total: found,
                current: String::new(),
            });
        }
    }

    let mut manifest = Manifest {
        source: src.to_string_lossy().into_owned(),
        count: items.len(),
        items,
    };
    write_manifest_atomic(&build.join("manifest.json"), &mut manifest)?;
    Ok(manifest.count)
}

/// manifest 原子落盘：写 `.tmp` 后 rename（对齐 Python `write_json_atomic`）。
pub fn write_manifest_atomic(path: &Path, manifest: &mut Manifest) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::io(format!("创建目录失败: {e}")))?;
    }
    manifest.count = manifest.items.len();
    let json = serde_json::to_vec(manifest)
        .map_err(|e| AppError::internal(format!("manifest 序列化失败: {e}")))?;
    if json.len() as u64 > MANIFEST_MAX_BYTES {
        return Err(AppError::invalid_input(format!(
            "manifest 超出大小上限 ({MANIFEST_MAX_BYTES} 字节)，请缩小相册目录后重扫"
        )));
    }
    atomic_write(path, &json).map_err(|e| AppError::io(format!("manifest 写入失败: {e}")))
}

/// 增量判断：文件已存在且非空即视为可用（对齐 Python `_fresh`）。
pub fn fresh(path: &Path, force: bool) -> bool {
    if force {
        let _ = fs::remove_file(path);
        return false;
    }
    fs::metadata(path).map(|md| md.len() > 0).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    fn tempdir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir =
            std::env::temp_dir().join(format!("photo-triage-test-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_file(dir: &Path, name: &str) {
        let path = dir.join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut f = fs::File::create(path).unwrap();
        f.write_all(b"x").unwrap();
    }

    fn build(dir: &Path, tag: &str) -> Manifest {
        let mut progress = |_: BuildProgress| {};
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let b = dir.join(format!("build-{tag}"));
        build_manifest(dir, &b, false, &mut progress, &cancel).unwrap();
        let raw = fs::read_to_string(b.join("manifest.json")).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    #[test]
    fn stable_id_matches_python_hexdigest_prefix() {
        // hashlib.md5(key.encode()).hexdigest()[:12]
        assert_eq!(stable_id("IMG_0001"), "6eaa56848d68");
        assert_eq!(stable_id("2024/abc"), "1a25e22d3e5a");
    }

    #[test]
    fn pairs_live_photo_and_video_share_key() {
        let dir = tempdir();
        write_file(&dir, "IMG_0001.HEIC");
        write_file(&dir, "IMG_0001.MOV");
        let m = build(&dir, "a");
        assert_eq!(m.source, dir.to_string_lossy());
        assert_eq!(m.count, 1);
        assert_eq!(m.items.len(), 1);
        let it = &m.items[0];
        assert_eq!(it.typ, "live");
        assert!(it.image.as_ref().unwrap().ends_with("IMG_0001.HEIC"));
        assert!(it.video.as_ref().unwrap().ends_with("IMG_0001.MOV"));
        assert_eq!(it.folder, ".");
        assert_eq!(it.size_bytes, 2);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn id_stable_when_case_of_extension_differs() {
        // 后缀大小写不影响 key（Python 版同样 lower() 后去扩展名），稳定 ID 一致。
        let a = tempdir();
        let b = tempdir();
        write_file(&a, "sub/IMG_0001.HEIC");
        write_file(&b, "sub/IMG_0001.heic");
        let ma = build(&a, "x");
        let mb = build(&b, "y");
        assert_eq!(ma.items[0].id, mb.items[0].id);
        assert_eq!(ma.items[0].folder, "sub");
        let _ = fs::remove_dir_all(&a);
        let _ = fs::remove_dir_all(&b);
    }
}
