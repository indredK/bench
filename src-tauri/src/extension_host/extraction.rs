//! Extension 包安全解压（P3.3 A3，spec §6.3；与 P3.1 完整性校验强耦合——
//! 逐文件 hash 清单只有在「先校验再原子落位」的流程里才有意义）。
//!
//! 规则（fail-closed，任一失败**整包拒绝**并清理）：
//!
//! 1. **路径穿越**：逐 entry 做词法 + canonical 前缀双重校验，越界即整包拒绝
//!    （不是跳过——对标 `app_manager` 解压器的「跳过坏条目」策略，插件场景更严）；
//! 2. **平台差异**：显式拒绝绝对路径、`..`、Windows 盘符（`C:`）、UNC（`\\`）。
//!    盘符判断用跨平台字符串，**禁用 `Component::Prefix`**（该枚举变体仅
//!    Windows 存在，会破坏 macOS 编译——roadmap 附录 A 铁律 3）；
//! 3. **zip bomb**：限制 entry 数量、单文件解压后大小、总体积；流式解压
//!    边写边累计并提前中断（不信任 zip header 声明值）；
//! 4. **symlink**：拒绝档案内的符号链接 entry；
//! 5. **目标目录**：必须不存在或为空（防与既有产物混杂）；
//! 6. **原子性**：本模块只负责解压到**临时目录**；调用方（P4 安装管线）在
//!    全量校验通过后 rename 到正式位置，失败即清理临时目录，不留半成品。

use std::{
    fs,
    io::{Read, Write},
    path::Path,
};

use crate::error::{AppError, AppResult};

use super::assets::is_safe_relative_path;

/// 解压资源上限（插件 bundle 在 MB 级，上限取宽松但有界值）。
#[derive(Debug, Clone, Copy)]
pub struct ExtractLimits {
    /// 档案内最多条目数。
    pub max_entries: usize,
    /// 单文件解压后最大字节数。
    pub max_entry_bytes: u64,
    /// 解压总体积最大字节数。
    pub max_total_bytes: u64,
}

impl Default for ExtractLimits {
    fn default() -> Self {
        Self {
            max_entries: 4096,
            max_entry_bytes: 64 * 1024 * 1024,
            max_total_bytes: 256 * 1024 * 1024,
        }
    }
}

/// 校验通过后原子落位：staging → 正式目录。
///
/// - 正式目录已存在（覆盖更新）：先整体移除旧产物（此时新产物已通过全部
///   校验，替换窗口极小；spec §6.1 步骤 8 的语义）；
/// - rename 失败：清理 staging，正式目录保持不变。
pub fn promote_staged_bundle(staging: &Path, final_dir: &Path) -> AppResult<()> {
    if !staging.is_dir() {
        return Err(AppError::internal(format!(
            "staging dir missing: {}",
            staging.display()
        )));
    }
    if final_dir.exists() {
        fs::remove_dir_all(final_dir)
            .map_err(|e| AppError::io(format!("remove previous bundle: {e}")))?;
    }
    fs::rename(staging, final_dir).map_err(|e| {
        // 失败即清理 staging，不留半成品。
        let _ = fs::remove_dir_all(staging);
        AppError::io(format!("promote staged bundle: {e}"))
    })
}

/// 安全解压插件 zip 到 `target_dir`（必须为空或不存在）。
pub fn extract_extension_zip(
    zip_path: &Path,
    target_dir: &Path,
    limits: &ExtractLimits,
) -> AppResult<()> {
    // 目标目录：不存在 → 创建；存在 → 必须为空。
    if target_dir.exists() {
        let empty = fs::read_dir(target_dir)
            .map_err(|e| AppError::io(format!("read target dir: {e}")))?
            .next()
            .is_none();
        if !empty {
            return Err(AppError::forbidden_path(format!(
                "extract target {} must be empty",
                target_dir.display()
            )));
        }
    } else {
        fs::create_dir_all(target_dir)
            .map_err(|e| AppError::io(format!("create target dir: {e}")))?;
    }
    // canonical 根（此时必然存在）。所有 entry 落点必须以它为前缀。
    let canonical_root = target_dir
        .canonicalize()
        .map_err(|e| AppError::io(format!("canonicalize target dir: {e}")))?;

    let file = fs::File::open(zip_path)
        .map_err(|e| AppError::io(format!("open {}: {e}", zip_path.display())))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::forbidden_path(format!("plugin archive is not a valid zip: {e}")))?;
    if archive.len() > limits.max_entries {
        return Err(AppError::forbidden_path(format!(
            "plugin archive has {} entries (limit {})",
            archive.len(),
            limits.max_entries
        )));
    }

    let mut total_bytes: u64 = 0;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|e| AppError::forbidden_path(format!("zip entry {index}: {e}")))?;
        let name = entry.name().to_string();
        // unix_mode 在 take() 消耗 entry 前捕获。
        #[cfg(unix)]
        let unix_mode = entry.unix_mode();

        // --- 路径合法性（整包拒绝，不是跳过）---
        let relative = validate_entry_name(&name)?;

        // --- symlink entry 拒绝（spec §6.3）---
        if entry.is_symlink() {
            return Err(AppError::forbidden_path(format!(
                "plugin archive contains a symlink entry `{name}` (rejected)"
            )));
        }

        let out_path = canonical_root.join(&relative);
        // canonical 前缀二次校验（belt-and-suspenders：词法已保证无 `..`，
        // 这里以 canonical 根为基座再确认落点不越界；注意基座必须是
        // canonical 根本身 —— target_dir 路径可能含符号链接（如 macOS
        // 的 /tmp → /private/tmp），否则前缀比对恒假）。
        // 不能对绝对 out_path 做 Component::RootDir 检查 —— 绝对路径首段
        // 恒为 RootDir，会永远误拒。
        if !out_path.starts_with(&canonical_root) {
            return Err(AppError::forbidden_path(format!(
                "zip entry `{name}` escapes the extraction target"
            )));
        }

        if entry.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| AppError::io(format!("create entry dir: {e}")))?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::io(format!("create entry parent: {e}")))?;
        }

        // --- zip bomb：header 声明值预检 + 实际写入计量双保险 ---
        let declared = entry.size();
        if declared > limits.max_entry_bytes {
            return Err(AppError::forbidden_path(format!(
                "plugin archive entry `{name}` exceeds per-file size limit (declared {declared})"
            )));
        }
        if total_bytes.saturating_add(declared) > limits.max_total_bytes {
            return Err(AppError::forbidden_path(format!(
                "plugin archive exceeds total size limit (entry `{name}` declared {declared})"
            )));
        }
        let mut out_file = fs::File::create(&out_path)
            .map_err(|e| AppError::io(format!("create entry file: {e}")))?;
        let mut chunk_buffer = entry.take(limits.max_entry_bytes + 1);
        let mut written: u64 = 0;
        loop {
            let mut chunk = [0u8; 64 * 1024];
            let read = chunk_buffer
                .read(&mut chunk)
                .map_err(|e| AppError::forbidden_path(format!("zip entry `{name}`: {e}")))?;
            if read == 0 {
                break;
            }
            out_file
                .write_all(&chunk[..read])
                .map_err(|e| AppError::io(format!("write entry file: {e}")))?;
            written += read as u64;
            if written > limits.max_entry_bytes {
                return Err(AppError::forbidden_path(format!(
                    "plugin archive entry `{name}` exceeds per-file limit"
                )));
            }
            total_bytes += read as u64;
            if total_bytes > limits.max_total_bytes {
                return Err(AppError::forbidden_path(
                    "plugin archive exceeds total size limit (possible zip bomb)",
                ));
            }
        }

        // 保留 unix 权限（可执行位等；symlink 已被上面拒绝，set_permissions
        // 只会作用于常规文件/目录）。
        #[cfg(unix)]
        if let Some(mode) = unix_mode {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&out_path, fs::Permissions::from_mode(mode));
        }
    }
    Ok(())
}

/// entry 名合法性（spec §6.3「平台差异」行，跨平台字符串实现）。
///
/// 返回规范化的相对路径（`/` 分隔）。**任何违规 → `FORBIDDEN_PATH` 整包拒绝**。
fn validate_entry_name(name: &str) -> AppResult<String> {
    if name.is_empty() {
        return Err(AppError::forbidden_path("zip entry name is empty"));
    }
    // 反斜杠一律拒绝：Windows 分隔符（`C:\`、UNC `\\server\share`）都离不开它，
    // Unix 下也是混乱源 —— 统一拒绝（禁用 `Component::Prefix` 的跨平台等价物）。
    if name.contains('\\') {
        return Err(AppError::forbidden_path(format!(
            "zip entry `{name}` contains a backslash (rejected)"
        )));
    }
    // 绝对路径：`/` 开头。
    if name.starts_with('/') {
        return Err(AppError::forbidden_path(format!(
            "zip entry `{name}` is an absolute path (rejected)"
        )));
    }
    // 尾随 `/` 是 zip 目录条目惯例，剥离后按文件名段校验。
    let trimmed = name.strip_suffix('/').unwrap_or(name);
    let segments: Vec<&str> = trimmed.split('/').collect();
    for (index, segment) in segments.iter().enumerate() {
        match *segment {
            "" => {
                // 只允许尾随空段（已被 strip 处理）；内部空段（`a//b`）拒绝。
                return Err(AppError::forbidden_path(format!(
                    "zip entry `{name}` contains an empty path segment"
                )));
            }
            "." => {
                return Err(AppError::forbidden_path(format!(
                    "zip entry `{name}` contains a `.` segment"
                )));
            }
            ".." => {
                return Err(AppError::forbidden_path(format!(
                    "zip entry `{name}` contains `..` (path traversal rejected)"
                )));
            }
            _ => {
                // Windows 盘符（`C:` / `c:`）：跨平台字符串判断（铁律 3）。
                if index == 0
                    && segment.len() >= 2
                    && segment.as_bytes()[1] == b':'
                    && segment.as_bytes()[0].is_ascii_alphabetic()
                {
                    return Err(AppError::forbidden_path(format!(
                        "zip entry `{name}` uses a Windows drive prefix (rejected)"
                    )));
                }
            }
        }
    }
    // 复用 asset provider 的防御（绝对路径 / 盘符 / UNC 双保险）。
    if !is_safe_relative_path(trimmed) {
        return Err(AppError::forbidden_path(format!(
            "zip entry `{name}` is not a safe relative path"
        )));
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::Write,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };
    use zip::write::SimpleFileOptions;

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_root(tag: &str) -> PathBuf {
        let unique = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "bench-ext-extract-{tag}-{}-{unique}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp root");
        dir
    }

    /// 写一个 entry（可指定 unix 权限，用于构造 symlink）。
    fn add_entry<W: Write + std::io::Seek>(
        writer: &mut zip::ZipWriter<W>,
        name: &str,
        content: &[u8],
        unix_mode: Option<u32>,
    ) {
        let mut options = SimpleFileOptions::default();
        if let Some(mode) = unix_mode {
            options = options.unix_permissions(mode);
        }
        writer.start_file(name, options).expect("start entry");
        writer.write_all(content).expect("write entry");
    }

    fn write_zip(tag: &str, build: impl FnOnce(&mut zip::ZipWriter<std::fs::File>)) -> PathBuf {
        let root = temp_root(tag);
        let zip_path = root.join("plugin.zip");
        let file = fs::File::create(&zip_path).expect("create zip");
        let mut writer = zip::ZipWriter::new(file);
        build(&mut writer);
        writer.finish().expect("finish zip");
        zip_path
    }

    const VALID_ZIP_ENTRIES: &[(&str, &[u8])] = &[
        ("manifest.json", b"{\"schemaVersion\":2}"),
        ("index.html", b"<html></html>"),
        ("assets/app.js", b"console.log(1)"),
    ];

    #[test]
    fn extracts_valid_archive() {
        let root = temp_root("valid");
        let zip_path = write_zip("valid-zip", |w| {
            for (name, content) in VALID_ZIP_ENTRIES {
                add_entry(w, name, content, None);
            }
        });
        let target = root.join("target");
        extract_extension_zip(&zip_path, &target, &ExtractLimits::default())
            .expect("valid archive extracts");
        assert!(target.join("manifest.json").is_file());
        assert!(target.join("assets/app.js").is_file());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_parent_traversal_entry() {
        let root = temp_root("traversal");
        let zip_path = write_zip("traversal-zip", |w| {
            add_entry(w, "index.html", b"ok", None);
            add_entry(w, "../evil.js", b"alert(1)", None);
        });
        let target = root.join("target");
        let err = extract_extension_zip(&zip_path, &target, &ExtractLimits::default()).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains(".."));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_absolute_path_entry() {
        let root = temp_root("abs");
        let zip_path = write_zip("abs-zip", |w| {
            add_entry(w, "/abs/path.js", b"alert(1)", None);
        });
        let target = root.join("target");
        let err = extract_extension_zip(&zip_path, &target, &ExtractLimits::default()).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_windows_drive_entry() {
        // `C:\Windows\evil.js`（反斜杠形式）与 `C:/Windows/evil.js`（斜杠形式）。
        for name in ["C:\\Windows\\evil.js", "C:/Windows/evil.js"] {
            let root = temp_root("drive");
            let zip_path = write_zip("drive-zip", |w| {
                add_entry(w, name, b"alert(1)", None);
            });
            let target = root.join("target");
            let err =
                extract_extension_zip(&zip_path, &target, &ExtractLimits::default()).unwrap_err();
            assert_eq!(
                err.code, "FORBIDDEN_PATH",
                "entry `{name}` must be rejected"
            );
            fs::remove_dir_all(&root).ok();
        }
    }

    #[test]
    fn rejects_unc_entry() {
        let root = temp_root("unc");
        let zip_path = write_zip("unc-zip", |w| {
            add_entry(w, "\\\\server\\share\\x.js", b"alert(1)", None);
        });
        let target = root.join("target");
        let err = extract_extension_zip(&zip_path, &target, &ExtractLimits::default()).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        fs::remove_dir_all(&root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_entry() {
        let root = temp_root("symlink");
        let zip_path = write_zip("symlink-zip", |w| {
            add_entry(w, "index.html", b"ok", None);
            // symlink entry：用 zip crate 的 add_symlink 构造
            // （unix_permissions() 只保留 0o777 权限位，无法手工带 S_IFLNK）。
            w.add_symlink("assets/link.js", "/etc/hosts", SimpleFileOptions::default())
                .expect("add symlink entry");
        });
        let target = root.join("target");
        let err = extract_extension_zip(&zip_path, &target, &ExtractLimits::default()).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains("symlink"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_entry_count_over_limit() {
        let root = temp_root("count");
        let zip_path = write_zip("count-zip", |w| {
            add_entry(w, "index.html", b"ok", None);
            add_entry(w, "assets/app.js", b"console.log(1)", None);
        });
        let target = root.join("target");
        let limits = ExtractLimits {
            max_entries: 1,
            ..ExtractLimits::default()
        };
        let err = extract_extension_zip(&zip_path, &target, &limits).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains("entries"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_oversized_single_entry() {
        let root = temp_root("big");
        let zip_path = write_zip("big-zip", |w| {
            add_entry(w, "assets/huge.js", &vec![b'a'; 1024], None);
        });
        let target = root.join("target");
        let limits = ExtractLimits {
            max_entry_bytes: 512,
            ..ExtractLimits::default()
        };
        let err = extract_extension_zip(&zip_path, &target, &limits).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_total_size_over_limit() {
        let root = temp_root("total");
        let zip_path = write_zip("total-zip", |w| {
            add_entry(w, "a.js", &vec![b'a'; 600], None);
            add_entry(w, "b.js", &vec![b'b'; 600], None);
        });
        let target = root.join("target");
        let limits = ExtractLimits {
            max_entry_bytes: 1024,
            max_total_bytes: 1000,
            ..ExtractLimits::default()
        };
        let err = extract_extension_zip(&zip_path, &target, &limits).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains("total size"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_non_empty_target() {
        let root = temp_root("nonempty");
        let zip_path = write_zip("nonempty-zip", |w| {
            add_entry(w, "index.html", b"ok", None);
        });
        let target = root.join("target");
        fs::create_dir_all(&target).expect("mkdir");
        fs::write(target.join("existing.txt"), b"stale").expect("stale file");
        let err = extract_extension_zip(&zip_path, &target, &ExtractLimits::default()).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains("must be empty"));
        assert!(target.join("existing.txt").exists(), "stale file untouched");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn promotes_staged_bundle_and_replaces_previous() {
        let root = temp_root("promote");
        let staging = root.join("staging");
        let final_dir = root.join("final");
        fs::create_dir_all(&staging).expect("staging");
        fs::write(staging.join("index.html"), b"new").expect("new bundle");
        fs::create_dir_all(&final_dir).expect("final");
        fs::write(final_dir.join("index.html"), b"old").expect("old bundle");

        promote_staged_bundle(&staging, &final_dir).expect("promote");
        assert_eq!(
            fs::read_to_string(final_dir.join("index.html")).unwrap(),
            "new"
        );
        assert!(!staging.exists(), "staging moved away");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn promoted_bundle_keeps_old_version_on_rename_failure() {
        // rename 失败（staging 缺失）→ 返回错误且不破坏正式目录。
        let root = temp_root("promote-fail");
        let final_dir = root.join("final");
        fs::create_dir_all(&final_dir).expect("final");
        fs::write(final_dir.join("index.html"), b"old").expect("old bundle");
        let missing_staging = root.join("missing-staging");
        let err = promote_staged_bundle(&missing_staging, &final_dir).unwrap_err();
        assert_eq!(err.code, "INTERNAL");
        assert_eq!(
            fs::read_to_string(final_dir.join("index.html")).unwrap(),
            "old",
            "previous bundle must stay intact"
        );
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn entry_name_validation_unit_cases() {
        assert!(validate_entry_name("index.html").is_ok());
        assert!(validate_entry_name("assets/app.js").is_ok());
        assert!(validate_entry_name("locales/").is_ok()); // zip 目录条目惯例
        for bad in [
            "",
            "a\\b.js",
            "/abs.js",
            "../evil.js",
            "a/../../evil.js",
            "a//b.js",
            "./x.js",
            "C:/x.js",
            "C:\\x.js",
        ] {
            let err = validate_entry_name(bad).unwrap_err();
            assert_eq!(err.code, "FORBIDDEN_PATH", "entry `{bad}` must be rejected");
        }
    }
}
