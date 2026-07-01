/// File operations / 文件操作
///
/// 通用文件读写命令，供前端通过 Tauri IPC 调用。
/// 在 Tauri webview 中，浏览器的 `a.click()` 下载被拦截，
/// 需要通过 Rust 后端写文件。
///
/// # 安全 / Security
/// 所有路径都会经过 [`guard_path`] 校验：必须是绝对路径、不含 `..`，
/// 且落在 allowlist 根目录内（应用数据/缓存目录、系统临时目录，以及用户
/// Downloads/Documents/Desktop）。这样即使前端被注入恶意脚本，也无法通过
/// 这些命令读写任意文件（如 `~/.ssh/id_rsa`、`/etc/passwd`）。
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

/// 词法归一化：在不触碰文件系统的前提下解析 `.` 与 `..`。
fn normalize_lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// 对已存在的路径做 canonicalize；不存在则回退到词法归一化。
fn canonical_or_lexical(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| normalize_lexical(path))
}

/// canonicalize 最深的“已存在祖先”，再把不存在的尾部拼回。
/// 这样即便目标文件尚未创建，也能解析路径中间的 symlink。
fn canonical_existing_ancestor(path: &Path) -> PathBuf {
    let mut ancestor = path;
    let mut tail: Vec<&OsStr> = Vec::new();
    loop {
        if ancestor.exists() {
            let mut base = fs::canonicalize(ancestor).unwrap_or_else(|_| ancestor.to_path_buf());
            for part in tail.iter().rev() {
                base.push(part);
            }
            return base;
        }
        match ancestor.parent() {
            Some(parent) => {
                if let Some(name) = ancestor.file_name() {
                    tail.push(name);
                }
                ancestor = parent;
            }
            None => return normalize_lexical(path),
        }
    }
}

/// 收集前端允许读写的根目录集合（least privilege）。
fn allowed_roots(app: &AppHandle) -> Vec<PathBuf> {
    let resolver = app.path();
    let mut roots: Vec<PathBuf> = Vec::new();
    for candidate in [
        resolver.app_data_dir(),
        resolver.app_config_dir(),
        resolver.app_cache_dir(),
        resolver.app_local_data_dir(),
        resolver.download_dir(),
        resolver.document_dir(),
        resolver.desktop_dir(),
    ]
    .into_iter()
    .flatten()
    {
        roots.push(canonical_or_lexical(&candidate));
    }
    roots.push(canonical_or_lexical(&std::env::temp_dir()));
    roots
}

/// 校验 `path`：必须为绝对路径、不含 `..`，且位于某个 allowlist 根目录内。
/// 返回归一化后的安全绝对路径。
fn guard_path(app: &AppHandle, path: &str) -> AppResult<PathBuf> {
    let raw = PathBuf::from(path);
    if !raw.is_absolute() {
        return Err(AppError::new(
            "PATH_NOT_ABSOLUTE",
            format!("path must be absolute: {path}"),
        ));
    }
    if raw.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(AppError::new(
            "PATH_TRAVERSAL",
            format!("path must not contain '..': {path}"),
        ));
    }

    let normalized = normalize_lexical(&raw);
    let resolved = canonical_existing_ancestor(&normalized);
    let roots = allowed_roots(app);
    let within = roots
        .iter()
        .any(|root| resolved.starts_with(root) || normalized.starts_with(root));
    if !within {
        return Err(AppError::forbidden_path(format!(
            "path is outside the allowed directories: {path}"
        )));
    }
    Ok(normalized)
}

/// 将文本内容写入指定路径。用于前端导出 JSON 等文件。
#[tauri::command]
pub fn write_text_file(app: AppHandle, path: String, content: String) -> AppResult<()> {
    let safe = guard_path(&app, &path)?;
    fs::write(&safe, &content).map_err(|e| AppError::io(format!("write {path}: {e}")))
}

/// 从指定路径读取文本内容。
#[tauri::command]
pub fn read_text_file(app: AppHandle, path: String) -> AppResult<String> {
    let safe = guard_path(&app, &path)?;
    fs::read_to_string(&safe).map_err(|e| AppError::io(format!("read {path}: {e}")))
}

/// 确保目录存在（递归创建）。
#[tauri::command]
pub fn ensure_dir(app: AppHandle, path: String) -> AppResult<()> {
    let safe = guard_path(&app, &path)?;
    fs::create_dir_all(&safe).map_err(|e| AppError::io(format!("create_dir {path}: {e}")))
}

/// 判断文件是否存在。
#[tauri::command]
pub fn file_exists(app: AppHandle, path: String) -> AppResult<bool> {
    let safe = guard_path(&app, &path)?;
    Ok(fs::metadata(&safe).is_ok())
}

/// 返回系统临时目录路径。
#[tauri::command]
pub fn temp_dir() -> String {
    std::env::temp_dir().to_string_lossy().into_owned()
}

// 以下函数仅供模块内部或测试使用，不导出为 Tauri 命令
#[allow(dead_code)]
fn _list_dir(path: &str) -> io::Result<Vec<String>> {
    let mut entries: Vec<String> = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        entries.push(entry.file_name().to_string_lossy().into_owned());
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_resolves_dot_and_parent() {
        let p = normalize_lexical(Path::new("/a/b/../c/./d"));
        assert_eq!(p, PathBuf::from("/a/c/d"));
    }

    #[test]
    fn canonical_ancestor_preserves_nonexistent_tail() {
        let base = std::env::temp_dir();
        let target = base.join("bench_test_nonexistent_dir/file.json");
        let resolved = canonical_existing_ancestor(&target);
        assert!(resolved.ends_with("bench_test_nonexistent_dir/file.json"));
        // 归一化后的临时目录应当是已解析祖先的前缀
        let canon_base = canonical_or_lexical(&base);
        assert!(resolved.starts_with(&canon_base));
    }
}
