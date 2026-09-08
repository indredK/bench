//! Extension asset provider —— P1 概念验证（spike）。
//!
//! 将 `$APPDATA/extensions/<id>/<version>/` 下的插件前端 bundle 暴露为
//! `tauri://localhost/ext/<id>/<version>/...`，与内置前端资源**同源**。
//!
//! 相比「`asset://` 顶层窗口」方案，同源带来三个直接收益：
//!
//! 1. 插件页就是普通本地页 —— `__TAURI_INTERNALS__` 与 `invoke` 天然可用；
//! 2. CSP `script-src 'self'` 天然覆盖插件脚本，无需放宽 CSP，也无需
//!    `dangerousDisableAssetCspModification`；
//! 3. 无 `asset://`（macOS/Linux）与 `http://asset.localhost`（Windows）的平台 URL 差异。
//!
//! 参考：Tauri v2 `Assets` trait（`Context.assets: Box<dyn Assets<R>>` 为公开字段，
//! 可整体替换）；`tauri-plugin-hotswap` 已验证同类思路可行。
//!
//! **P1 范围**：仅提供「读插件目录文件」的最小实现，不含签名校验、ACL、生命周期。
//! 那些属于 P2/P3。

use std::{
    borrow::Cow,
    fs,
    path::{Component, Path, PathBuf},
    sync::{Arc, OnceLock},
};

use tauri::{
    utils::assets::{AssetKey, AssetsIter, CspHash},
    App, Assets, Runtime,
};

/// 插件资源在 `tauri://localhost` 下的路径前缀。
pub const EXT_ASSET_PREFIX: &str = "ext/";

/// 插件前端产物在应用数据目录下的根目录名。
pub const EXT_DIR_NAME: &str = "extensions";

/// 插件根目录槽位。
///
/// `generate_context!()` 早于 `AppHandle` 创建，此时拿不到 `app_data_dir()`；
/// 因此在 build 前先占位，在 `setup` 里回填。用 `OnceLock` 避免每次资源请求加锁。
pub type ExtensionRootSlot = Arc<OnceLock<PathBuf>>;

/// 新建一个空槽位。
pub fn new_root_slot() -> ExtensionRootSlot {
    Arc::new(OnceLock::new())
}

/// 瞬态占位 provider。
///
/// 仅用于 `Context::set_assets` 交换出内置资源的一次调用，随即被真实的
/// `ExtensionAssets` 覆盖，**永不参与资源读取**。
pub struct PlaceholderAssets;

impl<R: Runtime> Assets<R> for PlaceholderAssets {
    fn get(&self, _key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }

    fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}

/// 包装内置 `EmbeddedAssets`，叠加运行时插件目录。
///
/// 查找顺序：插件目录 → 内置资源。插件目录缺失（如首次启动、槽位未回填）时静默回退，
/// 保证主程序前端不受影响。
pub struct ExtensionAssets<R: Runtime> {
    inner: Box<dyn Assets<R>>,
    root: ExtensionRootSlot,
}

impl<R: Runtime> ExtensionAssets<R> {
    /// 以内置资源为底、插件根目录槽位为叠加层构造 provider。
    pub fn new(inner: Box<dyn Assets<R>>, root: ExtensionRootSlot) -> Self {
        Self { inner, root }
    }

    /// 插件根目录（`$APPDATA/extensions`）；槽位未回填时为 `None`。
    ///
    /// 当前无调用方 —— 保留是为 P2 的插件注册与卸载（需回读根目录）。
    #[allow(dead_code)]
    pub fn root(&self) -> Option<&Path> {
        self.root.get().map(|p| p.as_path())
    }

    /// 把 `AssetKey` 映射为插件目录内的真实路径；非插件资源返回 `None`。
    fn resolve(&self, key: &AssetKey) -> Option<PathBuf> {
        let root = self.root.get()?;
        let key = key.as_ref();
        let relative = key.trim_start_matches('/').strip_prefix(EXT_ASSET_PREFIX)?;
        if relative.is_empty() || !is_safe_relative_path(relative) {
            return None;
        }
        Some(root.join(relative))
    }
}

/// 相对路径安全校验：拒绝目录穿越与任何形式的绝对路径。
///
/// 不使用 `Component::Prefix` —— 该枚举变体仅 Windows 存在，直接匹配会破坏
/// macOS 编译（双平台 CI 铁律）。盘符/UNC 改用跨平台字符串判断。
///
/// manifest `files[].path` 与完整性校验共用（P3.1）。
pub(crate) fn is_safe_relative_path(relative: &str) -> bool {
    let candidate = Path::new(relative);
    if candidate.is_absolute() {
        return false;
    }
    if candidate
        .components()
        .any(|c| matches!(c, Component::ParentDir | Component::RootDir))
    {
        return false;
    }
    // Windows 盘符（`C:\...`）与 UNC（`\\server\share`）：Unix 下它们是普通文件名，
    // Windows 下会被解析为绝对路径，统一拒绝。
    if relative.starts_with("\\\\") {
        return false;
    }
    let bytes = relative.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return false;
    }
    true
}

impl<R: Runtime> Assets<R> for ExtensionAssets<R> {
    fn setup(&self, app: &App<R>) {
        self.inner.setup(app)
    }

    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        if let Some(path) = self.resolve(key) {
            if let Ok(bytes) = fs::read(&path) {
                return Some(Cow::Owned(bytes));
            }
        }
        self.inner.get(key)
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.inner.iter()
    }

    fn csp_hashes(&self, html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.inner.csp_hashes(html_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试替身：不提供任何资源，仅用于验证 `resolve` 的路径映射。
    struct StubAssets;

    impl<R: Runtime> Assets<R> for StubAssets {
        fn get(&self, _key: &AssetKey) -> Option<Cow<'_, [u8]>> {
            None
        }

        fn iter(&self) -> Box<AssetsIter<'_>> {
            Box::new(std::iter::empty())
        }

        fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
            Box::new(std::iter::empty())
        }
    }

    fn provider(root: Option<&str>) -> ExtensionAssets<tauri::Wry> {
        let slot = new_root_slot();
        if let Some(r) = root {
            let _ = slot.set(PathBuf::from(r));
        }
        ExtensionAssets::new(Box::new(StubAssets), slot)
    }

    #[test]
    fn maps_extension_key_under_root() {
        let p = provider(Some("/tmp/app/extensions"));
        assert_eq!(
            p.resolve(&AssetKey::from("ext/bench-poc/1.0.0/index.html")),
            Some(PathBuf::from(
                "/tmp/app/extensions/bench-poc/1.0.0/index.html"
            ))
        );
    }

    #[test]
    fn tolerates_leading_slash() {
        let p = provider(Some("/tmp/app/extensions"));
        assert_eq!(
            p.resolve(&AssetKey::from("/ext/bench-poc/index.html")),
            Some(PathBuf::from("/tmp/app/extensions/bench-poc/index.html"))
        );
    }

    #[test]
    fn rejects_non_extension_keys() {
        let p = provider(Some("/tmp/app/extensions"));
        assert_eq!(p.resolve(&AssetKey::from("index.html")), None);
        assert_eq!(p.resolve(&AssetKey::from("assets/main.js")), None);
        assert_eq!(p.resolve(&AssetKey::from("ex/bench-poc/index.html")), None);
    }

    #[test]
    fn rejects_traversal() {
        let p = provider(Some("/tmp/app/extensions"));
        assert_eq!(p.resolve(&AssetKey::from("ext/../../secret")), None);
        assert_eq!(
            p.resolve(&AssetKey::from("ext/a/../../../etc/passwd")),
            None
        );
    }

    #[test]
    fn rejects_absolute_and_drive_letter_forms() {
        let p = provider(Some("/tmp/app/extensions"));
        assert_eq!(p.resolve(&AssetKey::from("ext//etc/passwd")), None);
        assert_eq!(p.resolve(&AssetKey::from("ext/C:/windows/win.ini")), None);
        assert_eq!(p.resolve(&AssetKey::from("ext/\\\\server\\share\\x")), None);
    }

    #[test]
    fn returns_none_when_root_missing() {
        let p = provider(None);
        assert_eq!(p.resolve(&AssetKey::from("ext/bench-poc/index.html")), None);
    }

    #[test]
    fn rejects_bare_prefix() {
        let p = provider(Some("/tmp/app/extensions"));
        assert_eq!(p.resolve(&AssetKey::from("ext/")), None);
        assert_eq!(p.resolve(&AssetKey::from("ext")), None);
    }
}
