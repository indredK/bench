//! Extension 产物完整性校验（P3.1，spec §3.3 / §3.4 步骤 8）。
//!
//! **为什么必须逐文件校验**：只签 manifest 时，攻击者保留已签 manifest、
//! 替换 `assets/*.js` 为任意代码，验签照样通过 —— 等价于没有包完整性保护
//! （spec §4.5）。本模块对标 Mozilla AMO 的四级校验：
//!
//! 1. 清单内每个文件必须存在且为常规文件；
//! 2. 文件字节数与清单 `size` 一致；
//! 3. 文件内容 SHA256 与清单 `sha256` 一致；
//! 4. 产物中**不得存在**清单未登记的文件（防新增未覆盖的可执行文件）。
//!
//! 豁免项（宿主维护，不入清单）：根目录 `manifest.json`（文件哈希无法自嵌套，
//! 其完整性由 canonical 文本签名覆盖，见 [signature]）与根目录 `.disabled`。
//! 符号链接一律拒绝（与 spec §6.3「拒绝档案内的 symlink entry」一致）。

use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};

use super::{
    assets::is_safe_relative_path,
    manifest::{ExtensionManifest, EXT_DISABLED_MARKER, MANIFEST_FILE},
};

/// 校验插件产物目录的逐文件完整性（fail-closed，任一失败即 `FORBIDDEN_PATH`）。
///
/// - `dir`：插件产物根目录（`$APPDATA/extensions/<id>/`）；
/// - `manifest`：已通过 manifest 校验的清单。
pub fn verify_bundle_integrity(dir: &Path, manifest: &ExtensionManifest) -> AppResult<()> {
    // 1. 收集磁盘文件（相对路径，`/` 分隔），拒绝符号链接。
    let mut on_disk: BTreeMap<String, PathBuf> = BTreeMap::new();
    for entry in WalkDir::new(dir).follow_links(false) {
        let entry = entry
            .map_err(|e| AppError::io(format!("walk extension bundle {}: {e}", dir.display())))?;
        if entry.file_type().is_symlink() {
            return Err(AppError::forbidden_path(format!(
                "extension bundle contains a symlink at `{}` (rejected)",
                entry.path().display()
            )));
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = relative_unix_path(dir, entry.path())?;
        // 宿主维护项不入清单、不参与校验。
        if relative == MANIFEST_FILE || relative == EXT_DISABLED_MARKER {
            continue;
        }
        on_disk.insert(relative, entry.path().to_path_buf());
    }

    // 2. 清单内逐条校验：存在 → size → sha256。
    for file in &manifest.files {
        if !is_safe_relative_path(&file.path) {
            return Err(AppError::forbidden_path(format!(
                "manifest.files path `{}` is not a safe relative path",
                file.path
            )));
        }
        let disk_path = match on_disk.get(&file.path) {
            Some(path) => path,
            None => {
                return Err(AppError::forbidden_path(format!(
                    "manifest.files lists `{}` but it is missing from the bundle",
                    file.path
                )));
            }
        };
        let (hash, size) = sha256_and_size(disk_path)?;
        if size != file.size {
            return Err(AppError::forbidden_path(format!(
                "bundle file `{}` size mismatch (manifest {}, disk {size})",
                file.path, file.size
            )));
        }
        if hash != file.sha256 {
            return Err(AppError::forbidden_path(format!(
                "bundle file `{}` sha256 mismatch (integrity check failed)",
                file.path
            )));
        }
    }

    // 3. 清单外文件拒绝（Mozilla AMO 明文要求，防新增未覆盖的可执行文件）。
    for relative in on_disk.keys() {
        if !manifest.files.iter().any(|f| f.path == *relative) {
            return Err(AppError::forbidden_path(format!(
                "bundle contains unlisted file `{relative}` (not covered by manifest.files)"
            )));
        }
    }
    Ok(())
}

/// 相对路径（`/` 分隔，跨平台一致；目录穿越已在 asset provider / manifest 层拒绝，
/// 这里再次防御：相对路径越出根目录即拒绝）。
fn relative_unix_path(root: &Path, path: &Path) -> AppResult<String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| {
            AppError::forbidden_path(format!(
                "bundle path `{}` escapes root `{}`",
                path.display(),
                root.display()
            ))
        })?
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    Ok(relative)
}

/// 流式计算文件 SHA256（hex 小写）与字节数。
fn sha256_and_size(path: &Path) -> AppResult<(String, u64)> {
    let mut file =
        fs::File::open(path).map_err(|e| AppError::io(format!("open {}: {e}", path.display())))?;
    let mut hasher = Sha256::new();
    let mut size: u64 = 0;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| AppError::io(format!("read {}: {e}", path.display())))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        size += read as u64;
    }
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest {
        hex.push_str(&format!("{byte:02x}"));
    }
    Ok((hex, size))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extension_host::manifest::{
        ExtensionDisplay, ExtensionDistribution, ExtensionEngines, ExtensionEntry,
        ExtensionFileEntry, MANIFEST_SCHEMA_VERSION,
    };
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_root(tag: &str) -> PathBuf {
        let unique = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "bench-ext-integrity-{tag}-{}-{unique}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp root");
        dir
    }

    /// 组装一个最小合法产物：index.html + assets/app.js。
    fn write_bundle(root: &Path, html: &[u8], js: &[u8]) -> Vec<ExtensionFileEntry> {
        fs::create_dir_all(root.join("assets")).expect("mkdir assets");
        fs::write(root.join("index.html"), html).expect("write html");
        fs::write(root.join("assets/app.js"), js).expect("write js");
        vec![
            file_entry(root, "index.html"),
            file_entry(root, "assets/app.js"),
        ]
    }

    fn file_entry(root: &Path, relative: &str) -> ExtensionFileEntry {
        let path = root.join(relative);
        let bytes = fs::read(&path).expect("read file for entry");
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let hex: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        ExtensionFileEntry {
            path: relative.to_string(),
            sha256: hex,
            size: bytes.len() as u64,
        }
    }

    fn manifest_with(files: Vec<ExtensionFileEntry>) -> ExtensionManifest {
        ExtensionManifest {
            schema_version: super::super::manifest::MANIFEST_SCHEMA_VERSION,
            id: "photo-triage".into(),
            version: "1.0.0".into(),
            display: super::super::manifest::ExtensionDisplay {
                zh: Some("照片筛选".into()),
                en: "Photo Triage".into(),
            },
            distribution: super::super::manifest::ExtensionDistribution::Bundled,
            entry: super::super::manifest::ExtensionEntry {
                index: "index.html".into(),
            },
            files,
            acl: Default::default(),
            engines: super::super::manifest::ExtensionEngines { bench: "*".into() },
            expires_at: None,
            signature: None,
        }
    }

    #[test]
    fn accepts_valid_bundle() {
        let root = temp_root("valid");
        let files = write_bundle(&root, b"<html></html>", b"console.log(1)");
        verify_bundle_integrity(&root, &manifest_with(files)).expect("valid bundle passes");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_tampered_content() {
        let root = temp_root("tamper");
        let files = write_bundle(&root, b"<html></html>", b"console.log(1)");
        // 同字节数篡改（size 不变，内容变）。
        fs::write(root.join("assets/app.js"), b"console.log(9)").expect("tamper");
        let err = verify_bundle_integrity(&root, &manifest_with(files)).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains("sha256 mismatch"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_size_mismatch() {
        let root = temp_root("size");
        let files = write_bundle(&root, b"<html></html>", b"console.log(1)");
        fs::write(root.join("assets/app.js"), b"console.log(1234);").expect("resize");
        let err = verify_bundle_integrity(&root, &manifest_with(files)).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains("size mismatch"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_missing_listed_file() {
        let root = temp_root("missing");
        let files = write_bundle(&root, b"<html></html>", b"console.log(1)");
        fs::remove_file(root.join("assets/app.js")).expect("remove listed file");
        let err = verify_bundle_integrity(&root, &manifest_with(files)).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains("missing from the bundle"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_unlisted_extra_file() {
        let root = temp_root("extra");
        let files = write_bundle(&root, b"<html></html>", b"console.log(1)");
        fs::write(root.join("assets/evil.js"), b"alert(1)").expect("extra file");
        let err = verify_bundle_integrity(&root, &manifest_with(files)).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains("unlisted"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn ignores_host_managed_markers() {
        let root = temp_root("markers");
        let files = write_bundle(&root, b"<html></html>", b"console.log(1)");
        // .disabled（宿主标记）与 manifest.json（自引用豁免）都不入清单也不参与校验。
        fs::write(root.join(EXT_DISABLED_MARKER), "").expect("marker");
        fs::write(root.join(MANIFEST_FILE), "{}").expect("manifest");
        verify_bundle_integrity(&root, &manifest_with(files)).expect("markers ignored");
        fs::remove_dir_all(&root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_entries() {
        use std::os::unix::fs::symlink;
        let root = temp_root("symlink");
        let files = write_bundle(&root, b"<html></html>", b"console.log(1)");
        symlink("/etc/hosts", root.join("assets/link.js")).expect("symlink");
        let err = verify_bundle_integrity(&root, &manifest_with(files)).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains("symlink"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_empty_bundle_when_files_listed() {
        let root = temp_root("empty");
        let files = write_bundle(&root, b"<html></html>", b"console.log(1)");
        // 清空产物目录（清单不变）：所有登记文件缺失 → 拒绝。
        fs::remove_file(root.join("index.html")).expect("remove html");
        fs::remove_file(root.join("assets/app.js")).expect("remove js");
        let err = verify_bundle_integrity(&root, &manifest_with(files)).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        fs::remove_dir_all(&root).ok();
    }
}
