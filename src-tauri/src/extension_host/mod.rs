//! Extension host —— 运行时插件宿主的 P1 概念验证（spike）。
//!
//! 设计依据见 [docs/plugin-market-assessment.md](../../docs/plugin-market-assessment.md) §8（B′ 方案）
//! 与 §9（P1 概念验证）。方向性决策见 DECISIONS D-023。
//!
//! **P1 只验证一件事**：Tauri v2 能否在运行时把 `$APPDATA/extensions` 下的前端 bundle
//! 当作同源本地页面渲染，并保持 IPC 可用。签名 / ACL / 生命周期 / 插件中心均属 P2+。

pub mod acl;
pub mod assets;
pub mod commands;
pub mod manifest;
pub mod signature;
pub mod url;

use tauri::{AppHandle, Manager, Runtime};

pub use assets::{
    new_root_slot, ExtensionAssets, ExtensionRootSlot, PlaceholderAssets, EXT_DIR_NAME,
};

/// 环境变量：设置后在启动时自动打开 POC 插件窗口（仅 P1 验证用，不进生产路径）。
pub const POC_AUTO_OPEN_ENV: &str = "BENCH_POC_EXT";

/// 承载插件根目录槽位的托管状态。
///
/// 走 Tauri state 而非闭包捕获，避免 `setup` 闭包捕获非 `'static` 引用。
pub struct ExtensionRootState(pub ExtensionRootSlot);

/// 在 `setup` 中回填插件根目录槽位。
///
/// `generate_context!()` 早于 `AppHandle` 创建，槽位此时只能占位；
/// 拿到 `app_data_dir()` 后在这里回填。
pub fn init_extension_root<R: Runtime>(app: &AppHandle<R>, slot: &ExtensionRootSlot) {
    match app.path().app_data_dir() {
        Ok(dir) => {
            let _ = slot.set(dir.join(EXT_DIR_NAME));
        }
        Err(e) => {
            eprintln!("[extension_host] resolve app data dir failed: {e}");
        }
    }
}

/// P1/P2b：设置了 `BENCH_POC_EXT` 时自动打开插件窗口。
///
/// - `BENCH_POC_EXT=1` → 打开 POC 插件（`bench-poc`）；
/// - `BENCH_POC_EXT=<extension-id>` → 打开指定插件（如 `photo-triage`）。
///
/// 失败不阻断启动 —— 验证缺失只是没跑，不应影响主程序。
pub fn maybe_auto_open_poc(app: &AppHandle) {
    let Ok(target) = std::env::var(POC_AUTO_OPEN_ENV) else {
        return;
    };
    let extension_id = if target == "1" {
        commands::POC_EXTENSION_ID.to_string()
    } else {
        target
    };
    match commands::ext_open(app.clone(), extension_id, None) {
        Ok(label) => println!("[extension_host] extension window opened: {label}"),
        Err(e) => eprintln!("[extension_host] auto open extension window failed: {e}"),
    }
}
