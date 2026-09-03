//! Photo Triage file operations / 文件操作闭环.
//!
//! 移入废纸篓 / 恢复 / 移动 / 重置缓存 / 清理空目录 / Finder 显示。
//! 与 Python 版行为逐细节一致：dest 命名规则、manifest `deleted`/`trash` 标记、
//! 相册内移动重算稳定 ID、安全边界校验。

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

#[cfg(target_os = "macos")]
use std::process::Command;

use super::scan::{stable_id, write_manifest_atomic};
use super::state::TriageState;
use super::types::{
    DeleteEmptyDirsResult, EmptyDirsResult, FileMoveInfo, IdError, MoveResult, MoveUpdate,
    PathError, PruneResult, RestoreResult, TrashResult,
};
use crate::error::{AppError, AppResult};

/// 全局废纸篓根目录（macOS）。
fn trash_root() -> PathBuf {
    // 测试隔离接口：单元测试把废纸篓重定向到临时目录，避免污染真实 ~/.Trash。
    if let Ok(override_root) = std::env::var("PHOTO_TRIAGE_TEST_TRASH_ROOT") {
        return PathBuf::from(override_root);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/Users/unknown"))
        .join(".Trash")
}

/// 移动文件（跨卷 fallback：rename 失败则 copy + remove）。
pub fn move_file(src: &Path, dest: &Path) -> std::io::Result<()> {
    match fs::rename(src, dest) {
        Ok(()) => Ok(()),
        Err(e) if e.raw_os_error() == Some(18) /* EXDEV */ => {
            fs::copy(src, dest)?;
            fs::remove_file(src)?;
            Ok(())
        }
        Err(e) => Err(e),
    }
}

/// 把文件移入废纸篓，返回目标路径（冲突自动追加 `_{k}` 后缀，与 Python 版一致）。
fn move_to_trash(src: &Path, root: &Path) -> std::io::Result<PathBuf> {
    if !src.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "原文件不存在",
        ));
    }
    let name = src
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unnamed");
    let mut dest = root.join(name);
    if dest.exists() {
        let (stem, ext) = match name.rfind('.') {
            Some(idx) if idx > 0 => (&name[..idx], &name[idx..]),
            _ => (name, ""),
        };
        let mut k = 1;
        while dest.exists() {
            dest = root.join(format!("{stem}_{k}{ext}"));
            k += 1;
        }
    }
    move_file(src, &dest)?;
    Ok(dest)
}

pub fn reject_while_scanning(state: &TriageState) -> AppResult<()> {
    if state.scanning.load(Ordering::Relaxed) {
        return Err(AppError::new(
            "SCAN_IN_PROGRESS",
            "扫描进行中，请等扫描完成后再移动/删除（留/删标记不受影响）",
        ));
    }
    Ok(())
}

/// 复制会话内 manifest（读）并返回 manifest 路径；无会话时返回明确错误。
fn session_manifest(state: &TriageState) -> AppResult<(super::types::Manifest, PathBuf)> {
    let guard = state.session.lock().unwrap_or_else(|e| e.into_inner());
    let session = guard
        .as_ref()
        .ok_or_else(|| AppError::new("NO_SESSION", "当前没有打开的相册，请先选择照片目录"))?;
    Ok((session.manifest.clone(), session.manifest_path.clone()))
}

/// 全部文件都移入废纸篓的条目：标记 deleted 并记录废纸篓位置（可恢复）；
/// 部分移动的条目：仅移除已移动文件的引用（对齐 Python `_apply_trash_to_manifest`）。
fn apply_trash(manifest: &mut super::types::Manifest, moved: &[FileMoveInfo]) {
    let moved_to: HashMap<&str, &str> = moved
        .iter()
        .map(|m| (m.from.as_str(), m.to.as_str()))
        .collect();
    for it in manifest.items.iter_mut() {
        let files = [
            (String::from("image"), it.image.clone()),
            (String::from("video"), it.video.clone()),
        ];
        let present: Vec<(String, String)> = files
            .into_iter()
            .filter_map(|(k, p)| p.map(|p| (k, p)))
            .collect();
        let moved_files: Vec<(String, String)> = present
            .iter()
            .filter(|(_, p)| moved_to.contains_key(p.as_str()))
            .cloned()
            .collect();
        if moved_files.is_empty() {
            continue;
        }
        if moved_files.len() == present.len() {
            it.deleted = Some(true);
            let mut trash = HashMap::new();
            for (k, p) in &moved_files {
                if let Some(dest) = moved_to.get(p.as_str()) {
                    trash.insert(k.clone(), (*dest).to_string());
                }
            }
            it.trash = Some(trash);
        } else {
            for (k, _) in &moved_files {
                if k == "image" {
                    it.image = None;
                } else {
                    it.video = None;
                }
            }
        }
    }
}

fn push_path_error(errors: &mut Vec<PathError>, path: &str, msg: impl Into<String>) {
    errors.push(PathError {
        path: path.to_string(),
        error: msg.into(),
    });
}

/// 原子写回 manifest 并同步内存会话。
fn commit(
    state: &TriageState,
    manifest_path: &Path,
    manifest: &mut super::types::Manifest,
) -> AppResult<()> {
    write_manifest_atomic(manifest_path, manifest)?;
    let mut guard = state.session.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(session) = guard.as_mut() {
        if session.manifest_path == manifest_path {
            session.manifest = manifest.clone();
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// trash / restore
// ---------------------------------------------------------------------------

pub fn trash(state: &TriageState, ids: Vec<String>) -> AppResult<TrashResult> {
    reject_while_scanning(state)?;
    let id_set: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let (mut manifest, manifest_path) = session_manifest(state)?;
    let to_delete: Vec<(String, Vec<String>)> = manifest
        .items
        .iter()
        .filter(|it| id_set.contains(it.id.as_str()))
        .map(|it| {
            let files: Vec<String> = [it.image.clone(), it.video.clone()]
                .into_iter()
                .flatten()
                .collect();
            (it.id.clone(), files)
        })
        .filter(|(_, files)| !files.is_empty())
        .collect();
    if to_delete.is_empty() {
        return Ok(TrashResult {
            moved: vec![],
            errors: vec![],
            count: 0,
        });
    }
    let root = trash_root();
    fs::create_dir_all(&root).map_err(|e| AppError::io(format!("无法访问废纸篓: {e}")))?;
    let mut moved: Vec<FileMoveInfo> = Vec::new();
    let mut errors: Vec<PathError> = Vec::new();
    for (_id, files) in to_delete {
        for fp in files {
            let path = PathBuf::from(&fp);
            if !path.exists() {
                push_path_error(&mut errors, &fp, "原文件不存在（可能已移动）");
                continue;
            }
            match move_to_trash(&path, &root) {
                Ok(dest) => moved.push(FileMoveInfo {
                    from: fp.clone(),
                    to: dest.to_string_lossy().into_owned(),
                }),
                Err(e) => push_path_error(&mut errors, &fp, e.to_string()),
            }
        }
    }
    if !moved.is_empty() {
        apply_trash(&mut manifest, &moved);
        commit(state, &manifest_path, &mut manifest)?;
    }
    Ok(TrashResult {
        count: moved.len(),
        moved,
        errors,
    })
}

pub fn restore(state: &TriageState, ids: Vec<String>) -> AppResult<RestoreResult> {
    reject_while_scanning(state)?;
    let id_set: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let (mut manifest, manifest_path) = session_manifest(state)?;
    let mut restored: Vec<FileMoveInfo> = Vec::new();
    let mut errors: Vec<PathError> = Vec::new();
    let mut changed = false;
    for it in manifest.items.iter_mut() {
        if !id_set.contains(it.id.as_str()) || it.deleted != Some(true) {
            continue;
        }
        let trash_map = it.trash.clone().unwrap_or_default();
        let mut ok = true;
        // 先收集要回移的 (kind, trash 路径)，避免借用冲突
        let moves: Vec<(String, PathBuf)> = {
            let fp_image = it.image.clone();
            let fp_video = it.video.clone();
            let mut m = Vec::new();
            for (key, fp) in [("image", fp_image), ("video", fp_video)] {
                let Some(fp) = fp else { continue };
                let src_path = PathBuf::from(&fp);
                let Some(dest) = trash_map.get(key) else {
                    if src_path.exists() {
                        continue; // 之前已恢复过，跳过
                    }
                    push_path_error(&mut errors, &fp, "废纸篓中找不到该文件（可能已被清空）");
                    ok = false;
                    continue;
                };
                let dest_path = PathBuf::from(dest);
                if !dest_path.exists() {
                    push_path_error(&mut errors, &fp, "废纸篓中找不到该文件（可能已被清空）");
                    ok = false;
                    continue;
                }
                if src_path.exists() {
                    push_path_error(&mut errors, &fp, "原路径已存在同名文件，未覆盖");
                    ok = false;
                    continue;
                }
                m.push((key.to_string(), dest_path));
            }
            m
        };
        for (key, dest_path) in moves {
            let fp = if key == "image" {
                it.image.clone()
            } else {
                it.video.clone()
            };
            let Some(fp) = fp else { continue };
            let src = PathBuf::from(&fp);
            if let Some(parent) = src.parent() {
                let _ = fs::create_dir_all(parent);
            }
            match move_file(&dest_path, &src) {
                Ok(()) => restored.push(FileMoveInfo {
                    from: dest_path.to_string_lossy().into_owned(),
                    to: fp.clone(),
                }),
                Err(e) => {
                    push_path_error(&mut errors, &fp, e.to_string());
                    ok = false;
                }
            }
        }
        if ok {
            it.deleted = None;
            it.trash = None;
            changed = true;
        }
    }
    if changed {
        commit(state, &manifest_path, &mut manifest)?;
    }
    Ok(RestoreResult {
        count: restored.len(),
        restored,
        errors,
    })
}

// ---------------------------------------------------------------------------
// move（对齐 Python `_move_impl`）
// ---------------------------------------------------------------------------

pub fn move_items(state: &TriageState, ids: Vec<String>, target: String) -> AppResult<MoveResult> {
    reject_while_scanning(state)?;
    let id_set: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let (mut manifest, manifest_path) = session_manifest(state)?;
    if target.trim().is_empty() || !Path::new(&target).is_dir() {
        return Err(AppError::invalid_input(format!(
            "目标文件夹不存在: {target}"
        )));
    }
    let target_dir = fs::canonicalize(&target).unwrap_or_else(|_| PathBuf::from(&target));
    let src_root = PathBuf::from(&manifest.source);
    if !src_root.is_dir() {
        return Err(AppError::internal(format!(
            "源目录不存在: {}",
            manifest.source
        )));
    }
    let src_real = fs::canonicalize(&src_root).unwrap_or_else(|_| src_root.clone());
    let tgt_real = fs::canonicalize(&target_dir).unwrap_or_else(|_| target_dir.clone());
    let inside = tgt_real == src_real || tgt_real.starts_with(&src_real);
    let folder_field = if inside {
        let rel = tgt_real
            .strip_prefix(&src_real)
            .unwrap_or(tgt_real.as_path());
        if rel.as_os_str().is_empty() {
            ".".to_string()
        } else {
            rel.to_string_lossy().replace('\\', "/")
        }
    } else {
        target_dir.to_string_lossy().into_owned()
    };

    let mut moved: Vec<String> = Vec::new();
    let mut items_out: Vec<MoveUpdate> = Vec::new();
    let mut errors: Vec<IdError> = Vec::new();
    let mut existing_ids: HashSet<String> = manifest.items.iter().map(|it| it.id.clone()).collect();
    let mut changed = false;

    for it in manifest.items.iter_mut() {
        if !id_set.contains(it.id.as_str()) || it.deleted == Some(true) {
            continue;
        }
        let files: Vec<(String, String)> = [
            (String::from("image"), it.image.clone()),
            (String::from("video"), it.video.clone()),
        ]
        .into_iter()
        .filter_map(|(k, p)| p.map(|p| (k, p)))
        .collect();
        if files.is_empty() {
            errors.push(IdError {
                id: it.id.clone(),
                error: "条目没有文件".into(),
            });
            continue;
        }
        if it.folder == folder_field {
            errors.push(IdError {
                id: it.id.clone(),
                error: "已在目标文件夹".into(),
            });
            continue;
        }
        if files.iter().any(|(_, p)| !Path::new(p).exists()) {
            errors.push(IdError {
                id: it.id.clone(),
                error: "原文件不存在（可能已移动/删除）".into(),
            });
            continue;
        }
        let stem = it.stem.clone();
        let mut new_stem = stem.clone();
        let mut k = 0u32;
        loop {
            let key = if inside {
                if folder_field == "." {
                    new_stem.clone()
                } else {
                    format!("{folder_field}/{new_stem}")
                }
            } else {
                target_dir.join(&new_stem).to_string_lossy().into_owned()
            };
            let new_id = stable_id(&key);
            let clash = files.iter().any(|(_, p)| {
                let ext = Path::new(p)
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| format!(".{e}"))
                    .unwrap_or_default();
                target_dir.join(format!("{new_stem}{ext}")).exists()
            }) || (new_id != it.id && existing_ids.contains(&new_id));
            if clash {
                k += 1;
                new_stem = format!("{stem}_{k}");
                continue;
            }
            let mut upd = MoveUpdate {
                from: it.id.clone(),
                to: new_id,
                folder: folder_field.clone(),
                image: None,
                video: None,
            };
            let mut abort = false;
            // 已实际移动的 (原路径, 目标路径)：某文件失败时回滚，保证磁盘与 manifest 一致
            let orig_image = it.image.clone();
            let orig_video = it.video.clone();
            let mut moved_pairs: Vec<(PathBuf, PathBuf)> = Vec::new();
            for (key_kind, fp) in &files {
                let src_path = Path::new(fp);
                let ext = src_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| format!(".{e}"))
                    .unwrap_or_default();
                let dest = target_dir.join(format!("{new_stem}{ext}"));
                if let Err(e) = move_file(src_path, &dest) {
                    // 部分失败：回滚已移动的文件并恢复条目字段，避免半移动不一致
                    for (s, d) in moved_pairs.iter().rev() {
                        let _ = move_file(d, s);
                    }
                    it.image = orig_image;
                    it.video = orig_video;
                    errors.push(IdError {
                        id: it.id.clone(),
                        error: format!("移动失败: {e}"),
                    });
                    abort = true;
                    break; // 中止本条，不更新条目状态
                }
                moved_pairs.push((PathBuf::from(fp), dest.clone()));
                if key_kind == "image" {
                    it.image = Some(dest.to_string_lossy().into_owned());
                    upd.image = Some(dest.to_string_lossy().into_owned());
                } else {
                    it.video = Some(dest.to_string_lossy().into_owned());
                    upd.video = Some(dest.to_string_lossy().into_owned());
                }
            }
            if !abort {
                it.stem = new_stem;
                it.folder = folder_field.clone();
                existing_ids.insert(upd.to.clone());
                items_out.push(upd.clone());
                moved.push(upd.from.clone());
                changed = true;
            }
            break;
        }
    }

    if changed {
        commit(state, &manifest_path, &mut manifest)?;
    }
    Ok(MoveResult {
        count: moved.len(),
        moved,
        items: items_out,
        errors,
    })
}

// ---------------------------------------------------------------------------
// prune / empty dirs / reveal
// ---------------------------------------------------------------------------

pub fn prune(state: &TriageState) -> AppResult<PruneResult> {
    reject_while_scanning(state)?;
    let (manifest, manifest_path) = session_manifest(state)?;
    // 源目录不可达（外置盘未挂载/路径失效）时拒绝清理：缺失文件可能是暂时不可见，
    // 直接清除引用会造成不可恢复的数据丢失。
    let src_real =
        fs::canonicalize(&manifest.source).unwrap_or_else(|_| PathBuf::from(&manifest.source));
    if !src_real.is_dir() {
        return Err(AppError::new(
            "SOURCE_UNAVAILABLE",
            "源目录当前不可访问（可能已移除或外置盘未挂载），已跳过清理，避免误删引用",
        ));
    }
    let mut kept = Vec::with_capacity(manifest.items.len());
    let mut removed = 0usize;
    for it in manifest.items.into_iter() {
        if it.deleted == Some(true) {
            let paths: Vec<String> = it
                .trash
                .as_ref()
                .map(|t| t.values().cloned().collect())
                .unwrap_or_else(|| {
                    [it.image.as_deref(), it.video.as_deref()]
                        .into_iter()
                        .flatten()
                        .map(|p| p.to_string())
                        .collect()
                });
            if paths.iter().any(|p| Path::new(p).exists()) {
                kept.push(it); // 废纸篓里还在，保留（可恢复）
            } else {
                removed += 1; // 废纸篓里也没了，不再显示
            }
        } else {
            let files: Vec<(String, String)> = [
                (String::from("image"), it.image.clone()),
                (String::from("video"), it.video.clone()),
            ]
            .into_iter()
            .filter_map(|(k, p)| p.map(|p| (k, p)))
            .collect();
            if files.is_empty() {
                removed += 1;
                continue;
            }
            let missing: Vec<String> = files
                .iter()
                .filter(|(_, p)| !Path::new(p).exists())
                .map(|(k, _)| k.clone())
                .collect();
            if missing.len() == files.len() {
                removed += 1;
                continue;
            }
            if !missing.is_empty() {
                let mut it = it;
                if missing.iter().any(|k| k == "image") {
                    it.image = None;
                }
                if missing.iter().any(|k| k == "video") {
                    it.video = None;
                }
                kept.push(it);
            } else {
                kept.push(it);
            }
        }
    }
    let kept_count = kept.len();
    let mut manifest = super::types::Manifest {
        source: manifest.source,
        count: kept_count,
        items: kept,
    };
    if removed > 0 {
        commit(state, &manifest_path, &mut manifest)?;
    }
    Ok(PruneResult {
        removed,
        kept: kept_count,
    })
}

pub fn empty_dirs(state: &TriageState) -> AppResult<EmptyDirsResult> {
    let (manifest, _path) = session_manifest(state)?;
    let src_real =
        fs::canonicalize(&manifest.source).unwrap_or_else(|_| PathBuf::from(&manifest.source));
    if !src_real.is_dir() {
        return Err(AppError::internal("源目录不存在或 manifest 读取失败"));
    }
    let mut dirs = Vec::new();
    let walker = walkdir::WalkDir::new(&src_real).sort_by_file_name();
    for entry in walker.into_iter().flatten() {
        let p = entry.path();
        if !p.is_dir() || p == src_real {
            continue; // 相册根目录本身不参与清理
        }
        let empty = fs::read_dir(p)
            .map(|mut it| it.next().is_none())
            .unwrap_or(false);
        if empty {
            dirs.push(p.to_string_lossy().into_owned());
        }
    }
    dirs.sort();
    Ok(EmptyDirsResult { dirs })
}

pub fn delete_empty_dirs(
    state: &TriageState,
    paths: Vec<String>,
) -> AppResult<DeleteEmptyDirsResult> {
    let (manifest, _path) = session_manifest(state)?;
    let src_real =
        fs::canonicalize(&manifest.source).unwrap_or_else(|_| PathBuf::from(&manifest.source));
    if !src_real.is_dir() {
        return Err(AppError::internal("源目录不存在或 manifest 读取失败"));
    }
    let mut deleted = Vec::new();
    let mut errors = Vec::new();
    for raw in paths {
        let p = PathBuf::from(&raw);
        let canon = fs::canonicalize(&p).unwrap_or_else(|_| p.clone());
        if canon == src_real || !canon.starts_with(&src_real) {
            errors.push(PathError {
                path: raw.clone(),
                error: "不在相册目录内，拒绝删除".into(),
            });
            continue;
        }
        if !canon.is_dir() {
            errors.push(PathError {
                path: raw.clone(),
                error: "文件夹不存在".into(),
            });
            continue;
        }
        let empty = fs::read_dir(&canon)
            .map(|mut it| it.next().is_none())
            .unwrap_or(false);
        if !empty {
            errors.push(PathError {
                path: raw.clone(),
                error: "文件夹不再是空的，已跳过".into(),
            });
            continue;
        }
        match fs::remove_dir(&canon) {
            Ok(()) => deleted.push(raw),
            Err(e) => errors.push(PathError {
                path: raw.clone(),
                error: e.to_string(),
            }),
        }
    }
    Ok(DeleteEmptyDirsResult {
        count: deleted.len(),
        deleted,
        errors,
    })
}

/// 在访达中显示（`open -R`），仅 macOS。
pub fn reveal(path: String) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    {
        if !Path::new(&path).exists() {
            return Err(AppError::not_found(format!("文件夹不存在: {path}")));
        }
        let ok = Command::new("open")
            .arg("-R")
            .arg(&path)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if ok {
            Ok(())
        } else {
            Err(AppError::internal(format!("无法在访达中显示: {path}")))
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err(AppError::unsupported("仅在 macOS 上支持在访达中显示"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::photo_triage::scan::write_manifest_atomic;
    use crate::photo_triage::state::{Session, TriageState};
    use crate::photo_triage::types::{Manifest, PhotoItem};
    use std::io::Write;

    /// env 重定向是进程级全局状态，测试并行时互相覆盖会串用例 → 用互斥锁串行化。
    static TRASH_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "pt-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_file(dir: &Path, rel: &str) -> PathBuf {
        let path = dir.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut f = fs::File::create(&path).unwrap();
        f.write_all(b"x").unwrap();
        path
    }

    fn make_manifest(src: &Path) -> Manifest {
        let img = write_file(src, "IMG_0001.HEIC");
        let vid = write_file(src, "IMG_0001.MOV");
        Manifest {
            source: src.to_string_lossy().into_owned(),
            count: 2,
            items: vec![
                PhotoItem {
                    id: "id1".into(),
                    typ: "live".into(),
                    stem: "IMG_0001".into(),
                    folder: ".".into(),
                    image: Some(img.to_string_lossy().into_owned()),
                    video: Some(vid.to_string_lossy().into_owned()),
                    image_proxy: None,
                    video_proxy: None,
                    video_poster: None,
                    size_bytes: 2,
                    deleted: None,
                    trash: None,
                },
                PhotoItem {
                    id: "id2".into(),
                    typ: "photo".into(),
                    stem: "IMG_0002".into(),
                    folder: "sub".into(),
                    image: Some(
                        write_file(src, "sub/IMG_0002.JPG")
                            .to_string_lossy()
                            .into_owned(),
                    ),
                    video: None,
                    image_proxy: None,
                    video_proxy: None,
                    video_poster: None,
                    size_bytes: 1,
                    deleted: None,
                    trash: None,
                },
            ],
        }
    }

    fn setup_state(src: &Path) -> TriageState {
        let manifest = make_manifest(src);
        let build = temp_dir();
        let manifest_path = build.join("manifest.json");
        let mut m = manifest.clone();
        write_manifest_atomic(&manifest_path, &mut m).unwrap();
        let state = TriageState::default();
        {
            let mut guard = state.session.lock().unwrap_or_else(|e| e.into_inner());
            *guard = Some(Session {
                build,
                manifest_path,
                manifest,
            });
        }
        state
    }

    #[test]
    fn trash_moves_files_to_trash_and_marks_deleted() {
        let _env_guard = TRASH_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let src = temp_dir();
        let trash_root = temp_dir();
        std::env::set_var(
            "PHOTO_TRIAGE_TEST_TRASH_ROOT",
            trash_root.to_string_lossy().as_ref(),
        );
        let state = setup_state(&src);
        let result = trash(&state, vec!["id1".into()]).unwrap();
        assert_eq!(result.count, 2); // image + video
        assert!(result.errors.is_empty());
        // 已验证文件已移入废纸篓
        assert!(trash_root.join("IMG_0001.HEIC").exists());
        assert!(trash_root.join("IMG_0001.MOV").exists());
        let guard = state.session.lock().unwrap_or_else(|e| e.into_inner());
        let session = guard.as_ref().unwrap();
        assert_eq!(session.manifest.items[0].deleted, Some(true));
        assert!(session.manifest.items[0].trash.is_some());
        assert_eq!(session.manifest.items[1].deleted, None); // id2 未删
        std::env::remove_var("PHOTO_TRIAGE_TEST_TRASH_ROOT");
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&trash_root);
    }

    #[test]
    fn restore_brings_files_back_and_clears_trash_mark() {
        let _env_guard = TRASH_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let src = temp_dir();
        let trash_root = temp_dir();
        std::env::set_var(
            "PHOTO_TRIAGE_TEST_TRASH_ROOT",
            trash_root.to_string_lossy().as_ref(),
        );
        let state = setup_state(&src);
        // 先删
        trash(&state, vec!["id1".into()]).unwrap();
        assert!(!src.join("IMG_0001.HEIC").exists());
        // 恢复
        let result = restore(&state, vec!["id1".into()]).unwrap();
        assert_eq!(result.count, 2);
        assert!(src.join("IMG_0001.HEIC").exists());
        assert!(src.join("IMG_0001.MOV").exists());
        let guard = state.session.lock().unwrap_or_else(|e| e.into_inner());
        let session = guard.as_ref().unwrap();
        assert_eq!(session.manifest.items[0].deleted, None);
        assert_eq!(session.manifest.items[0].trash, None);
        std::env::remove_var("PHOTO_TRIAGE_TEST_TRASH_ROOT");
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&trash_root);
    }

    #[test]
    fn move_items_moves_files_and_rewrites_ids() {
        let src = temp_dir();
        let state = setup_state(&src);
        let target = temp_dir();
        let result = move_items(
            &state,
            vec!["id2".into()],
            target.to_string_lossy().into_owned(),
        )
        .unwrap();
        assert_eq!(result.count, 1);
        assert!(result.errors.is_empty());
        assert!(target.join("IMG_0002.JPG").exists());
        assert!(!src.join("sub/IMG_0002.JPG").exists());
        std::env::remove_var("PHOTO_TRIAGE_TEST_TRASH_ROOT");
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&target);
    }

    #[test]
    fn prune_removes_entries_without_trash_or_source_files() {
        let src = temp_dir();
        let state = setup_state(&src);
        // 手动制造一个已删条目（废纸篓中无文件）和一个缺 source 的条目
        {
            let mut guard = state.session.lock().unwrap_or_else(|e| e.into_inner());
            let session = guard.as_mut().unwrap();
            session.manifest.items[0].deleted = Some(true);
            session.manifest.items[0].trash = Some(HashMap::new());
            // id2 的 source 文件会被删除
            let img2 = session.manifest.items[1].image.clone().unwrap();
            let _ = fs::remove_file(&img2);
        }
        let result = prune(&state).unwrap();
        assert_eq!(result.removed, 2);
        let guard = state.session.lock().unwrap_or_else(|e| e.into_inner());
        let session = guard.as_ref().unwrap();
        assert_eq!(session.manifest.items.len(), 0);
        let _ = fs::remove_dir_all(&src);
    }

    #[test]
    fn reject_while_scanning_blocks_trash_and_move() {
        let state = TriageState::default();
        state
            .scanning
            .store(true, std::sync::atomic::Ordering::Release);
        assert!(reject_while_scanning(&state).is_err());
    }

    #[test]
    fn prune_refuses_when_source_unavailable() {
        let src = temp_dir();
        let state = setup_state(&src);
        // 模拟外置盘未挂载：删除源目录，prune 必须拒绝而非静默清除引用
        fs::remove_dir_all(&src).unwrap();
        let err = prune(&state).unwrap_err();
        assert_eq!(err.code, "SOURCE_UNAVAILABLE");
    }
}
