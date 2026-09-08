//! Extension host —— 运行时插件宿主（P1 spike → P2 契约 → P3.1 完整性安全地基）。
//!
//! 契约唯一规格：`docs/extension-spec.md`；执行顺序与状态唯一清单：
//! `docs/modules/extension-center/roadmap.md`。方向性决策见 DECISIONS D-023 / D-024。
//!
//! 模块地图：
//! - [assets]：asset provider（`$APPDATA/extensions` 叠加内置资源，同源加载）；
//! - [acl]：`ext-` 窗口 IPC 网关（deny-by-default）；
//! - [manifest]：schema v2 解析与校验（fail-closed）；
//! - [signature]：canonical 文本签名 + trusted comment + 公钥三态；
//! - [integrity]：逐文件 hash 校验 + 清单外文件拒绝；
//! - [records]：版本水位（重放/降级防护）；
//! - [commands]：IPC 命令面（list/open/enable/uninstall/data_dir）。

pub mod acl;
pub mod assets;
pub mod commands;
pub mod integrity;
pub mod manifest;
pub mod records;
pub mod signature;
pub mod url;

use tauri::{AppHandle, Manager, Runtime};

pub use assets::{
    new_root_slot, ExtensionAssets, ExtensionRootSlot, PlaceholderAssets, EXT_DIR_NAME,
};

/// 插件私有数据目录名（`$APPDATA/extension-data/<id>/`，spec §9.3）。
///
/// **产物目录是只读的**（完整性校验拒绝清单外文件），插件数据（缓存/配置/
/// 状态）必须写在此处；卸载默认保留，数据目录不参与 `files` hash 校验。
pub const EXT_DATA_DIR_NAME: &str = "extension-data";

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
