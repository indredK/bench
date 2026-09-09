//! Photo Triage 能力：扫描、配对、稳定 ID 与清单落盘。
//!
//! 自 `src-tauri/src/photo_triage/scan.rs` 迁移（逻辑逐行等价，仅错误类型换为
//! [`CapError`]）。对齐 Python `scan.py`：只做目录遍历 + 图/视频配对 + 稳定 ID；
//! 预览一律按需生成，已存在的代理直接登记回清单（增量复用）。
//! 稳定 ID 为 `md5(相对路径去扩展名)[:12]`，与 Python 版逐字节一致。

use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{CapError, CapResult};

pub const IMAGE_EXTS: &[&str] = &[
    ".heic", ".heif", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp",
];
pub const VIDEO_EXTS: &[&str] = &[".mov", ".mp4", ".m4v", ".avi", ".mkv", ".webm"];

/// 图片代理最长边（越大越容易看清糊不糊），对齐 Python `IMG_MAX_EDGE = 1600`。
pub const IMG_MAX_EDGE: u32 = 1600;
/// 视频代理高度，对齐 Python `VID_HEIGHT = 720`。
pub const VID_HEIGHT: u32 = 720;
/// manifest.json 大小上限：约 40 万条目（~600B/条）。超限拒绝写入，避免损坏/膨胀缓存
/// 拖垮打开流程（Python 版兼容约束下不引入 schema_version，见 D-020）。
pub const MANIFEST_MAX_BYTES: u64 = 256 * 1024 * 1024;

/// 单个条目（字段名与 Python 版 manifest.json 一致，`type` / `*_proxy` 等）。
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

/// 相册清单（`<build>/manifest.json`）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub source: String,
    pub count: usize,
    pub items: Vec<PhotoItem>,
}

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

/// 扫描进度（由调用方转发为 Tauri 事件 / 协议层进度消息）。
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
) -> CapResult<usize> {
    fs::create_dir_all(build).map_err(|e| CapError::internal(format!("创建构建目录失败: {e}")))?;
    let proxies = build.join("proxies");
    fs::create_dir_all(&proxies)
        .map_err(|e| CapError::internal(format!("创建代理目录失败: {e}")))?;
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
            return Err(CapError::new(
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
        return Err(CapError::new(
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
pub fn write_manifest_atomic(path: &Path, manifest: &mut Manifest) -> CapResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| CapError::internal(format!("创建目录失败: {e}")))?;
    }
    manifest.count = manifest.items.len();
    let json = serde_json::to_vec(manifest)
        .map_err(|e| CapError::internal(format!("manifest 序列化失败: {e}")))?;
    if json.len() as u64 > MANIFEST_MAX_BYTES {
        return Err(CapError::invalid_input(format!(
            "manifest 超出大小上限 ({MANIFEST_MAX_BYTES} 字节)，请缩小相册目录后重扫"
        )));
    }
    atomic_write(path, &json).map_err(|e| CapError::internal(format!("manifest 写入失败: {e}")))
}

/// 原子写：先写同目录 `.tmp` 副本再 rename，避免半截文件。
/// 与主应用 `crate::persistence::atomic_write` 语义一致（本 crate 不依赖宿主）。
pub fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)
}

/// 增量判断：文件已存在且非空即视为可用（对齐 Python `_fresh`）。
pub fn fresh(path: &Path, force: bool) -> bool {
    if force {
        let _ = fs::remove_file(path);
        return false;
    }
    fs::metadata(path).map(|md| md.len() > 0).unwrap_or(false)
}

/// 只读摘要：读取已有 manifest.json 并返回统计（供 MCP / NM / CLI 暴露）。
pub fn read_manifest_summary(build: &Path) -> CapResult<ManifestSummary> {
    let raw = fs::read(build.join("manifest.json")).map_err(|_| {
        CapError::not_found(format!(
            "未找到清单: {}",
            build.join("manifest.json").display()
        ))
    })?;
    let manifest: Manifest = serde_json::from_slice(&raw)
        .map_err(|e| CapError::invalid_input(format!("清单解析失败: {e}")))?;
    Ok(ManifestSummary::from_manifest(&manifest))
}

/// 清单摘要（协议层友好：不含绝对路径列表，只含统计与样本）。
#[derive(Debug, Clone, Serialize)]
pub struct ManifestSummary {
    pub source: String,
    pub count: usize,
    pub photos: usize,
    pub videos: usize,
    pub lives: usize,
    pub deleted: usize,
    pub total_bytes: u64,
    /// 按目录聚合的条目数（前 20 个，按数量降序）
    pub top_folders: Vec<FolderCount>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FolderCount {
    pub folder: String,
    pub count: usize,
}

impl ManifestSummary {
    pub fn from_manifest(m: &Manifest) -> Self {
        let mut photos = 0usize;
        let mut videos = 0usize;
        let mut lives = 0usize;
        let mut deleted = 0usize;
        let mut total_bytes = 0u64;
        let mut folders: HashMap<String, usize> = HashMap::new();
        for item in &m.items {
            match item.typ.as_str() {
                "live" => lives += 1,
                "photo" => photos += 1,
                _ => videos += 1,
            }
            if item.deleted == Some(true) {
                deleted += 1;
            }
            total_bytes = total_bytes.saturating_add(item.size_bytes);
            *folders.entry(item.folder.clone()).or_default() += 1;
        }
        let mut top_folders: Vec<FolderCount> = folders
            .into_iter()
            .map(|(folder, count)| FolderCount { folder, count })
            .collect();
        top_folders.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.folder.cmp(&b.folder)));
        top_folders.truncate(20);
        Self {
            source: m.source.clone(),
            count: m.count,
            photos,
            videos,
            lives,
            deleted,
            total_bytes,
            top_folders,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write as _;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    fn tempdir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir =
            std::env::temp_dir().join(format!("cap-photo-test-{}-{nanos}", std::process::id()));
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

    #[test]
    fn summary_counts_types_and_folders() {
        let dir = tempdir();
        write_file(&dir, "sub/IMG_0001.JPG");
        write_file(&dir, "sub/IMG_0002.MOV");
        let m = build(&dir, "s");
        let summary = ManifestSummary::from_manifest(&m);
        assert_eq!(summary.count, 2);
        assert_eq!(summary.photos, 1);
        assert_eq!(summary.videos, 1);
        assert_eq!(summary.lives, 0);
        assert_eq!(summary.top_folders.len(), 1);
        assert_eq!(summary.top_folders[0].folder, "sub");
        let _ = fs::remove_dir_all(&dir);
    }
}
