//! Extension 版本单调性记录（P3.1 A2，spec §3.4 步骤 7 / §8）。
//!
//! minisign 签名本身无版本与有效期概念；trusted comment 只把签名绑定到
//! 签发时的 `<id>@<version>`，**无法阻止整套旧 bundle（签名合法）重放**。
//! 宿主按插件持久化**已验证版本水位**：
//!
//! - 凡完整通过 manifest + 签名 + 完整性校验的版本，抬升水位至 `max(已记录, 当前)`；
//! - 安装/更新路径（P4 market install，spec §6.1 步骤 7）必须先调
//!   [`check_version_monotonic`]：`new < recorded` 即判定重放/降级并拒绝；
//! - 卸载清理水位（重装旧版本不受历史水位卡死）。
//!
//! 存储位置：`$APPDATA/extension-records/<id>/version`（宿主独占；**不是**
//! 插件数据目录 `extension-data/`，后者归插件所有、宿主不解析）。
//!
//! 范围说明（spec §8）：版本单调性**仅约束 market 安装/更新路径**；bundled
//! 版本由应用发版控制，`ext_open` 只抬升水位、不做拒绝，避免应用整体回退
//! 安装时 bundled 插件被水位误伤。

use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use tauri::{AppHandle, Manager, Runtime};

use crate::error::{AppError, AppResult};

use super::manifest::{is_valid_extension_id, is_valid_semver, semver_at_least};

/// 宿主侧插件记录根目录名（`$APPDATA/extension-records`）。
pub const EXT_RECORDS_DIR_NAME: &str = "extension-records";

static RECORD_WRITE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// `$APPDATA/extension-records`（经 `AppHandle`）。
fn records_root<R: Runtime>(app: &AppHandle<R>) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("resolve app data dir failed: {e}")))?;
    Ok(dir.join(EXT_RECORDS_DIR_NAME))
}

/// 单条记录文件路径（`<root>/<id>/version`）；id 必须合法（防路径穿越）。
fn record_path(root: &Path, extension_id: &str) -> AppResult<PathBuf> {
    if !is_valid_extension_id(extension_id) {
        return Err(AppError::invalid_input(format!(
            "invalid extension id `{extension_id}`"
        )));
    }
    Ok(root.join(extension_id).join("version"))
}

/// 读取已记录版本水位（纯文件系统核心，便于测试）。
fn read_record_at(root: &Path, extension_id: &str) -> AppResult<Option<String>> {
    let path = record_path(root, extension_id)?;
    match fs::read_to_string(&path) {
        Ok(text) => {
            let version = text.trim().to_string();
            if version.is_empty() {
                return Ok(None);
            }
            Ok(Some(version))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::io(format!(
            "read extension version record {}: {e}",
            path.display()
        ))),
    }
}

/// 抬升版本水位至 `max(已记录, version)`（纯文件系统核心）。
fn record_at(root: &Path, extension_id: &str, version: &str) -> AppResult<()> {
    if !is_valid_semver(version) {
        return Err(AppError::invalid_input(format!(
            "invalid extension version `{version}`"
        )));
    }
    if let Some(installed) = read_record_at(root, extension_id)? {
        if !semver_at_least(version, &installed) {
            return Ok(()); // 已记录版本更高：水位只升不降。
        }
        if version == installed {
            return Ok(()); // 幂等：同版本无需重写。
        }
    }
    let path = record_path(root, extension_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::io(format!("create extension records dir: {e}")))?;
    }
    write_record_atomically(&path, version)
}

fn write_record_atomically(path: &Path, version: &str) -> AppResult<()> {
    write_record_atomically_with(path, version, |from, to| fs::rename(from, to))
}

fn write_record_atomically_with(
    path: &Path,
    version: &str,
    mut rename: impl FnMut(&Path, &Path) -> std::io::Result<()>,
) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::internal("extension version record has no parent"))?;
    let name = path
        .file_name()
        .ok_or_else(|| AppError::internal("extension version record has no file name"))?
        .to_string_lossy();

    let (temporary_path, mut temporary_file) = (0..32)
        .find_map(|_| {
            let sequence = RECORD_WRITE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let candidate = parent.join(format!(".{name}.tmp-{}-{sequence}", std::process::id()));
            match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&candidate)
            {
                Ok(file) => Some(Ok((candidate, file))),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => None,
                Err(error) => Some(Err(error)),
            }
        })
        .ok_or_else(|| AppError::internal("could not allocate a temporary version record"))?
        .map_err(|error| AppError::io(format!("create temporary version record: {error}")))?;

    let write_result = temporary_file
        .write_all(version.as_bytes())
        .and_then(|()| temporary_file.sync_all());
    drop(temporary_file);
    if let Err(error) = write_result {
        let _ = fs::remove_file(&temporary_path);
        return Err(AppError::io(format!(
            "write temporary version record: {error}"
        )));
    }

    if !path.exists() {
        return rename(&temporary_path, path).map_err(|error| {
            let _ = fs::remove_file(&temporary_path);
            AppError::io(format!("promote version record: {error}"))
        });
    }

    let backup_path = match next_record_backup_path(parent, &name) {
        Ok(path) => path,
        Err(error) => {
            let _ = fs::remove_file(&temporary_path);
            return Err(error);
        }
    };
    if let Err(error) = rename(path, &backup_path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(AppError::io(format!("preserve version record: {error}")));
    }

    match rename(&temporary_path, path) {
        Ok(()) => {
            if let Err(error) = fs::remove_file(&backup_path) {
                eprintln!(
                    "[extension_host] updated version record but could not remove backup {}: {error}",
                    backup_path.display()
                );
            }
            Ok(())
        }
        Err(write_error) => match rename(&backup_path, path) {
            Ok(()) => {
                let _ = fs::remove_file(&temporary_path);
                Err(AppError::io(format!(
                    "promote version record failed; previous record restored: {write_error}"
                )))
            }
            Err(restore_error) => Err(AppError::new(
                "EXTENSION_BUNDLE_RECOVERY_FAILED",
                format!(
                    "version record update failed ({write_error}); restoring the previous record also failed ({restore_error}); previous record remains at {}",
                    backup_path.display()
                ),
            )),
        },
    }
}

fn next_record_backup_path(parent: &Path, name: &str) -> AppResult<PathBuf> {
    for _ in 0..32 {
        let sequence = RECORD_WRITE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(".{name}.backup-{}-{sequence}", std::process::id()));
        match fs::symlink_metadata(&candidate) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(candidate),
            Ok(_) => continue,
            Err(error) => {
                return Err(AppError::io(format!(
                    "check version record backup path {}: {error}",
                    candidate.display()
                )))
            }
        }
    }

    Err(AppError::internal(format!(
        "could not allocate a unique version record backup for {name}"
    )))
}

/// 版本单调性检查（纯文件系统核心）：`version < 已记录` → 重放/降级，拒绝。
fn check_monotonic_at(root: &Path, extension_id: &str, version: &str) -> AppResult<()> {
    let Some(installed) = read_record_at(root, extension_id)? else {
        return Ok(());
    };
    if !semver_at_least(version, &installed) {
        return Err(AppError::forbidden_path(format!(
            "extension `{extension_id}` version {version} is not newer than installed \
             {installed} (replay/rollback rejected)"
        )));
    }
    Ok(())
}

/// 清除版本水位（卸载时调用，避免重装旧版本被历史水位卡死）。
fn clear_record_at(root: &Path, extension_id: &str) -> AppResult<()> {
    let path = record_path(root, extension_id)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(AppError::io(format!(
            "remove extension version record {}: {e}",
            path.display()
        ))),
    }
}

/// 抬升已验证版本水位（`ext_open` / bundled 部署通过全量校验后调用）。
pub fn record_verified_version<R: Runtime>(
    app: &AppHandle<R>,
    extension_id: &str,
    version: &str,
) -> AppResult<()> {
    record_at(&records_root(app)?, extension_id, version)
}

/// 版本单调性检查（P4 market 安装/更新路径调用；spec §6.1 步骤 7）。
pub fn check_version_monotonic<R: Runtime>(
    app: &AppHandle<R>,
    extension_id: &str,
    version: &str,
) -> AppResult<()> {
    check_monotonic_at(&records_root(app)?, extension_id, version)
}

/// 清除版本水位（`ext_uninstall` 调用）。
pub fn clear_record<R: Runtime>(app: &AppHandle<R>, extension_id: &str) -> AppResult<()> {
    clear_record_at(&records_root(app)?, extension_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_root(tag: &str) -> PathBuf {
        let unique = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "bench-ext-records-{tag}-{}-{unique}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp root");
        dir
    }

    #[test]
    fn records_and_reads_watermark() {
        let root = temp_root("basic");
        assert_eq!(read_record_at(&root, "fake-ext").expect("empty"), None);
        record_at(&root, "fake-ext", "1.2.0").expect("record");
        assert_eq!(
            read_record_at(&root, "fake-ext").expect("recorded"),
            Some("1.2.0".to_string())
        );
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn failed_record_replacement_preserves_previous_watermark() {
        let root = temp_root("atomic-replacement");
        record_at(&root, "fake-ext", "1.0.0").expect("record old version");
        let path = record_path(&root, "fake-ext").expect("record path");
        let mut rename_calls = 0;

        let error = write_record_atomically_with(&path, "2.0.0", |from, to| {
            rename_calls += 1;
            if rename_calls == 2 {
                return Err(std::io::Error::other("simulated record replace failure"));
            }
            fs::rename(from, to)
        })
        .expect_err("failed replacement must return an error");

        assert_eq!(error.code, "IO_ERROR");
        assert_eq!(
            read_record_at(&root, "fake-ext").expect("old watermark remains readable"),
            Some("1.0.0".to_string())
        );
        assert_eq!(
            fs::read_dir(path.parent().expect("record parent"))
                .expect("record directory")
                .count(),
            1,
            "temporary and backup files are cleaned after rollback"
        );
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn watermark_only_rises() {
        let root = temp_root("rise");
        record_at(&root, "fake-ext", "2.0.0").expect("record high");
        // 更低版本不降水位。
        record_at(&root, "fake-ext", "1.0.0").expect("ignored");
        assert_eq!(
            read_record_at(&root, "fake-ext").expect("recorded"),
            Some("2.0.0".to_string())
        );
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn replay_of_older_version_rejected() {
        let root = temp_root("replay");
        record_at(&root, "fake-ext", "1.0.0").expect("record");
        // 旧版本（签名合法）重放必须被拒。
        let err = check_monotonic_at(&root, "fake-ext", "0.9.0").unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains("replay/rollback"));
        // 同版本与更新版本允许。
        check_monotonic_at(&root, "fake-ext", "1.0.0").expect("same version ok");
        check_monotonic_at(&root, "fake-ext", "1.1.0").expect("newer ok");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn first_install_has_no_monotonic_barrier() {
        let root = temp_root("first");
        check_monotonic_at(&root, "fake-ext", "0.1.0").expect("no record yet");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn clear_record_allows_reinstall_of_older_version() {
        let root = temp_root("clear");
        record_at(&root, "fake-ext", "2.0.0").expect("record");
        clear_record_at(&root, "fake-ext").expect("clear");
        assert_eq!(read_record_at(&root, "fake-ext").expect("empty"), None);
        check_monotonic_at(&root, "fake-ext", "1.0.0").expect("older install now allowed");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_invalid_id_and_version() {
        let root = temp_root("invalid");
        assert_eq!(
            record_path(&root, "../evil").unwrap_err().code,
            "INVALID_INPUT"
        );
        assert_eq!(
            record_at(&root, "fake-ext", "not-semver").unwrap_err().code,
            "INVALID_INPUT"
        );
        fs::remove_dir_all(&root).ok();
    }
}
