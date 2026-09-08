//! Bundled extension 随包发布部署（P3.4，D-024）。
//!
//! **方案**：`bundle.resources` 随包 + 启动时拷入 `$APPDATA/extensions/`。
//! 理由（roadmap P3.4「二选一并写明理由」）：
//! 1. Tauri 原生机制，macOS/Windows 打包行为一致 —— installer 钩子需要
//!    NSIS/DMG 两套脚本且 dev 构建不可复用；
//! 2. 纯 Rust 启动逻辑可控：首启拷入、升级覆盖、保留用户 `.disabled` 标记、
//!    完整性校验通过才落位，全部 fail-closed；
//! 3. dev 模式 resources 不参与打包 —— dev 继续走 `extensions:sync` 脚本
//!    （脚本仅保留 dev 用途，符合 roadmap P3.4）。
//!
//! 打包链路：`beforeBuildCommand` → `extensions:build`（vite 产物）→
//! `extensions:stage`（组装部署根 + 注入 files 清单到
//! `src-tauri/resources/extensions/<id>/`）→ `tauri build` 经
//! `bundle.resources` 打进包 → 启动时本模块拷入运行时目录。
//!
//! 覆盖规则：目标不存在 → 拷入；已装版本 **低于** bundled 版本 → 覆盖升级
//! （保留 `.disabled`）；否则跳过（不降级、不无谓重写 —— 用户可能经 market
//! 装了更高版本）。

use std::{
    fs,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager, Runtime};

use crate::error::AppResult;

use super::{
    audit::{self, AuditEvent},
    integrity,
    manifest::ExtensionManifest,
    records,
};

/// 解析包内 bundled 插件根目录（兼容 `$RESOURCE/extensions` 与
/// `$RESOURCE/resources/extensions` 两种布局）；找不到返回 `None`。
fn resolve_bundled_root<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    [
        resource_dir.join("extensions"),
        resource_dir.join("resources").join("extensions"),
    ]
    .into_iter()
    .find(|candidate| candidate.is_dir())
}

/// 递归拷贝目录（跳过点文件；与打包脚本行为一致）。
fn copy_dir_recursive(src: &Path, dst: &Path) -> AppResult<()> {
    fs::create_dir_all(dst)
        .map_err(|e| crate::error::AppError::io(format!("mkdir {dst:?}: {e}")))?;
    for entry in
        fs::read_dir(src).map_err(|e| crate::error::AppError::io(format!("read {src:?}: {e}")))?
    {
        let entry = entry.map_err(|e| crate::error::AppError::io(format!("entry {src:?}: {e}")))?;
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let from = entry.path();
        let to = dst.join(&name);
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to)
                .map_err(|e| crate::error::AppError::io(format!("copy {from:?}: {e}")))?;
        }
    }
    Ok(())
}

/// 单个 bundled 插件的部署判定与落位。返回是否发生了部署。
fn deploy_one<R: Runtime>(app: &AppHandle<R>, bundled_dir: &Path, installed_dir: &Path) -> bool {
    // bundled manifest 完整校验（fail-closed；bundled 豁免签名但校验 files 清单）。
    let manifest_path = bundled_dir.join(super::manifest::MANIFEST_FILE);
    let Ok(text) = fs::read_to_string(&manifest_path) else {
        eprintln!(
            "[extension_host] bundled deploy: unreadable manifest at {}",
            manifest_path.display()
        );
        return false;
    };
    let Ok(manifest) = ExtensionManifest::parse(&text) else {
        eprintln!(
            "[extension_host] bundled deploy: invalid manifest at {}",
            manifest_path.display()
        );
        return false;
    };
    // 拷入前先校验包内完整性（资源在包内也可能被篡改/损坏）。
    if let Err(error) = integrity::verify_bundle_integrity(bundled_dir, &manifest) {
        eprintln!(
            "[extension_host] bundled deploy: integrity check failed for `{}`: {error}",
            manifest.id
        );
        return false;
    }

    // 已装版本比较：bundled > installed 才覆盖。
    if installed_dir.exists() {
        let installed_version =
            fs::read_to_string(installed_dir.join(super::manifest::MANIFEST_FILE))
                .ok()
                .and_then(|text| ExtensionManifest::parse(&text).ok())
                .map(|m| m.version);
        match installed_version {
            Some(installed) if super::manifest::semver_at_least(&installed, &manifest.version) => {
                // installed >= bundled：不降级、不重写。
                return false;
            }
            _ => {}
        }
    }

    // 保留用户禁用标记。
    let disabled_marker = installed_dir.join(super::manifest::EXT_DISABLED_MARKER);
    let disabled_backup = fs::read(&disabled_marker).ok();

    if installed_dir.exists() {
        if let Err(error) = fs::remove_dir_all(installed_dir) {
            eprintln!(
                "[extension_host] bundled deploy: remove old bundle `{}` failed: {error}",
                manifest.id
            );
            return false;
        }
    }
    if let Err(error) = copy_dir_recursive(bundled_dir, installed_dir) {
        eprintln!(
            "[extension_host] bundled deploy: copy `{}` failed: {error}",
            manifest.id
        );
        return false;
    }
    if let Some(marker) = disabled_backup {
        let _ = fs::write(&disabled_marker, marker);
    }
    // bundled 升级属于受信分发，抬升版本水位（防后续旧包重放）。
    if let Err(error) = records::record_verified_version(app, &manifest.id, &manifest.version) {
        eprintln!("[extension_host] bundled deploy: record version failed: {error}");
    }
    audit::record(
        app,
        AuditEvent::Install,
        &manifest.id,
        Some(&manifest.version),
        Some("bundled deploy"),
    );
    true
}

/// 启动时部署 bundled 插件（best-effort：任何失败只记录，不阻断启动）。
pub fn deploy_bundled_extensions<R: Runtime>(app: &AppHandle<R>) {
    let Some(bundled_root) = resolve_bundled_root(app) else {
        return; // dev 模式 / 无 bundled 资源：静默跳过（dev 用 sync 脚本）。
    };
    let Ok(installed_root) = app
        .path()
        .app_data_dir()
        .map(|dir| dir.join(super::assets::EXT_DIR_NAME))
    else {
        return;
    };
    let Ok(entries) = fs::read_dir(&bundled_root) else {
        return;
    };
    for entry in entries.flatten() {
        let bundled_dir = entry.path();
        if !bundled_dir.is_dir() || !bundled_dir.join(super::manifest::MANIFEST_FILE).is_file() {
            continue;
        }
        let installed_dir = installed_root.join(entry.file_name());
        if deploy_one(app, &bundled_dir, &installed_dir) {
            println!(
                "[extension_host] bundled extension deployed: {}",
                bundled_dir.display()
            );
        }
    }
}
