//! Photo Triage export / 按留选导出原始文件，可选打包 zip.
//!
//! 对齐 Python `export.py`：输出文件命名为 `{iid}_{stem}{ext}`，字节与源一致。

use std::fs::{self, File};
use std::io;
use std::path::PathBuf;

use crate::error::AppResult;
use zip::write::SimpleFileOptions;

use super::state::TriageState;
use super::types::{ExportResult, PathError};

pub fn export(
    state: &TriageState,
    ids: Vec<String>,
    out: String,
    zip: bool,
) -> AppResult<ExportResult> {
    let (manifest, _path) = {
        let guard = state.session.lock().unwrap_or_else(|e| e.into_inner());
        let session = guard.as_ref().ok_or_else(|| {
            crate::error::AppError::new("NO_SESSION", "当前没有打开的相册，请先选择照片目录")
        })?;
        (session.manifest.clone(), session.manifest_path.clone())
    };
    let by_id: std::collections::HashMap<&str, &super::types::PhotoItem> = manifest
        .items
        .iter()
        .map(|it| (it.id.as_str(), it))
        .collect();

    let out_dir = PathBuf::from(&out);
    fs::create_dir_all(&out_dir)
        .map_err(|e| crate::error::AppError::io(format!("创建导出目录失败: {e}")))?;

    let mut copied = 0usize;
    let mut errors: Vec<PathError> = Vec::new();

    for iid in ids {
        let Some(it) = by_id.get(iid.as_str()) else {
            continue;
        };
        let stem = it.stem.clone();
        for kind in ["image", "video"] {
            let src_str = if kind == "image" {
                it.image.as_deref()
            } else {
                it.video.as_deref()
            };
            let Some(src_str) = src_str else { continue };
            let sp = PathBuf::from(src_str);
            if !sp.exists() {
                errors.push(PathError {
                    path: src_str.to_string(),
                    error: "原文件不存在".into(),
                });
                continue;
            }
            let ext = sp
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            let dst = out_dir.join(format!("{iid}_{stem}.{ext}"));
            match fs::copy(&sp, &dst) {
                Ok(_) => copied += 1,
                Err(e) => errors.push(PathError {
                    path: src_str.to_string(),
                    error: e.to_string(),
                }),
            }
        }
    }

    let mut zip_path = None;
    if zip {
        let zp = out_dir.with_extension("zip");
        // 把 out_dir 下的文件全部打进去（与输出文件同层，zip 在目录旁）
        let zf = File::create(&zp)
            .map_err(|e| crate::error::AppError::io(format!("创建 zip 失败: {e}")))?;
        let mut zw = zip::ZipWriter::new(zf);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        let entries = fs::read_dir(&out_dir)
            .map_err(|e| crate::error::AppError::io(format!("读取导出目录失败: {e}")))?;
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();
            zw.start_file(name, options)
                .map_err(|e| crate::error::AppError::io(format!("zip 写入失败: {e}")))?;
            let mut f = File::open(&path)
                .map_err(|e| crate::error::AppError::io(format!("zip 读取失败: {e}")))?;
            // 流式写入：大视频不整读入内存（避免 4GB 文件撑爆堆）
            io::copy(&mut f, &mut zw)
                .map_err(|e| crate::error::AppError::io(format!("zip 读取失败: {e}")))?;
        }
        zw.finish()
            .map_err(|e| crate::error::AppError::io(format!("zip 完成失败: {e}")))?;
        zip_path = Some(zp.to_string_lossy().into_owned());
    }

    Ok(ExportResult {
        copied,
        errors,
        zip_path,
    })
}
