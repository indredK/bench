//! 路径白名单 / Path Guard。
//!
//! `bench-host` 是被外部进程（AI 客户端、浏览器）启动的能力出口，其输入不可信。
//! 所有涉及用户文件系统的命令必须通过 [`PathGuard::check`] 校验：
//! 目标路径 canonicalize 后必须位于某个显式授权的根目录之内。
//!
//! 设计对齐 Tauri 侧 extension ACL 的 deny-by-default 思想：
//! 未提供 `--allow-root` 时，文件系统类命令一律拒绝并返回配置指引。

use std::path::{Path, PathBuf};

use crate::error::{CapError, CapResult};

#[derive(Debug, Clone, Default)]
pub struct PathGuard {
    roots: Vec<PathBuf>,
}

impl PathGuard {
    /// 从 `--allow-root` 参数构建。重复路径去重；不存在的根目录保留
    /// （canonicalize 失败时退化为字面路径比较，避免「先配置后创建目录」被卡死）。
    pub fn new(roots: impl IntoIterator<Item = impl AsRef<Path>>) -> Self {
        let mut seen = std::collections::HashSet::new();
        let roots = roots
            .into_iter()
            .filter_map(|r| {
                let raw = r.as_ref().to_path_buf();
                let canonical = raw.canonicalize().unwrap_or_else(|_| raw.clone());
                if seen.insert(canonical.clone()) {
                    Some(canonical)
                } else {
                    None
                }
            })
            .collect();
        Self { roots }
    }

    pub fn is_empty(&self) -> bool {
        self.roots.is_empty()
    }

    pub fn roots(&self) -> &[PathBuf] {
        &self.roots
    }

    /// 校验 `path` 是否落在任一授权根目录内。
    ///
    /// 对「尚不存在」的路径（如待创建的 build 目录）做 best-effort
    /// canonicalize：向上找到最近一个真实存在的祖先，canonicalize 后再拼回
    /// 尾部片段 —— 否则 macOS `/var` → `/private/var` 这类符号链接会令
    /// 未创建目录误判为越界。
    pub fn check(&self, path: &Path) -> CapResult<PathBuf> {
        if self.roots.is_empty() {
            return Err(CapError::path_not_allowed(
                "未配置 --allow-root 白名单；启动 bench-host 时至少提供一个 --allow-root <dir>",
            ));
        }
        let canonical = canonicalize_best_effort(path);
        for root in &self.roots {
            if canonical.starts_with(root) {
                return Ok(canonical);
            }
        }
        Err(CapError::path_not_allowed(format!(
            "路径 {} 不在授权根目录内（--allow-root）",
            path.display()
        )))
    }
}

/// 逐级向上找已存在的祖先做 canonicalize，再拼回不存在的尾部（见 [`PathGuard::check`]）。
fn canonicalize_best_effort(path: &Path) -> PathBuf {
    let mut missing: Vec<std::ffi::OsString> = Vec::new();
    let mut current = path.to_path_buf();
    loop {
        match current.canonicalize() {
            Ok(real) => {
                let mut result = real;
                for part in missing.into_iter().rev() {
                    result.push(part);
                }
                return result;
            }
            Err(_) => match (current.file_name(), current.parent()) {
                (Some(name), Some(parent)) => {
                    missing.push(name.to_os_string());
                    current = parent.to_path_buf();
                }
                _ => return path.to_path_buf(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tempdir(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir =
            std::env::temp_dir().join(format!("cap-guard-{tag}-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn rejects_when_no_roots_configured() {
        let guard = PathGuard::default();
        assert_eq!(
            guard.check(Path::new("/tmp")).unwrap_err().code,
            "PATH_NOT_ALLOWED"
        );
    }

    #[test]
    fn allows_not_yet_created_dir_under_symlinked_root() {
        // 回归：/var → /private/var 符号链接下，尚未创建的 build 目录曾误判越界
        let root = tempdir("sym");
        let deep = root.join("not-yet-created/build");
        let guard = PathGuard::new([root.clone()]);
        assert!(guard.check(&deep).is_ok());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn allows_inside_root_and_rejects_outside() {
        let root = tempdir("in");
        let child = root.join("sub");
        std::fs::create_dir_all(&child).unwrap();
        let guard = PathGuard::new([root.clone()]);

        assert!(guard.check(&child).is_ok());
        assert_eq!(
            guard.check(Path::new("/etc/hosts")).unwrap_err().code,
            "PATH_NOT_ALLOWED"
        );
        let _ = std::fs::remove_dir_all(&root);
    }
}
