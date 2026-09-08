//! Extension host commands —— P1 概念验证（spike）。
//!
//! 只暴露 P1 验证必需的两个命令：
//! - `ext_poc_open`：打开 POC 插件窗口（`tauri://localhost/ext/bench-poc/index.html`）；
//! - `ext_poc_report`：把插件页内的自检结果落盘，供脚本读取判定。
//!
//! **P1 范围**：无签名校验、无 ACL、无生命周期管理。那些属于 P2/P3。

use std::{fs, path::PathBuf};

use serde_json::Value;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::{AppError, AppResult};

use super::assets::{EXT_ASSET_PREFIX, EXT_DIR_NAME};

/// POC 插件 id（P1 固定值）。
pub const POC_EXTENSION_ID: &str = "bench-poc";

/// POC 窗口 label。
pub const POC_WINDOW_LABEL: &str = "ext-bench-poc";

/// 验证结果落盘文件名（写在应用数据目录下）。
pub const POC_RESULT_FILE: &str = "poc-verify-result.json";

/// 插件根目录：`$APPDATA/extensions`。
fn extensions_root(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("resolve app data dir failed: {e}")))?;
    Ok(dir.join(EXT_DIR_NAME))
}

/// 打开 POC 插件窗口，返回窗口 label。
///
/// 窗口 URL 走内置 asset provider（已被 `ExtensionAssets` 包装），因此插件页与
/// 主程序前端同源：IPC 可用、CSP `'self'` 覆盖、无平台 URL 差异。
#[tauri::command]
pub fn ext_poc_open(app: AppHandle) -> AppResult<String> {
    let root = extensions_root(&app)?;
    let index = root.join(POC_EXTENSION_ID).join("index.html");
    if !index.exists() {
        return Err(AppError::not_found(format!(
            "POC extension bundle not found: {} — run `pnpm run poc:extension` first",
            index.display()
        )));
    }

    // 显式走 `tauri://localhost` —— 不能用 `WebviewUrl::App`：
    // dev 模式下 App 会被 `Manager::get_app_url` 拼接到 `build.devUrl`
    // （http://localhost:1420），永远到不了 asset provider；只有生产构建
    // （frontendDist → tauri://localhost）才走 asset provider。CustomProtocol
    // 在 dev / prod 行为一致，均由 `ExtensionAssets` 解析。
    let url = tauri::Url::parse(&format!(
        "tauri://localhost/{EXT_ASSET_PREFIX}{POC_EXTENSION_ID}/index.html"
    ))
    .map_err(|e| AppError::internal(format!("parse extension url: {e}")))?;

    if let Some(existing) = app.get_webview_window(POC_WINDOW_LABEL) {
        let _ = existing.set_focus();
        return Ok(POC_WINDOW_LABEL.to_string());
    }

    WebviewWindowBuilder::new(&app, POC_WINDOW_LABEL, WebviewUrl::CustomProtocol(url))
        .title("Extension POC · bench-poc")
        .inner_size(760.0, 560.0)
        .center()
        .build()
        .map_err(|e| AppError::internal(format!("open POC window failed: {e}")))?;

    Ok(POC_WINDOW_LABEL.to_string())
}

/// 接收插件页自检结果并落盘到 `$APPDATA/poc-verify-result.json`。
#[tauri::command]
pub fn ext_poc_report(app: AppHandle, payload: Value) -> AppResult<()> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("resolve app data dir failed: {e}")))?;
    fs::create_dir_all(&dir).map_err(|e| AppError::io(format!("create app data dir: {e}")))?;

    let path = dir.join(POC_RESULT_FILE);
    let text = serde_json::to_string_pretty(&payload)
        .map_err(|e| AppError::internal(format!("serialize POC result: {e}")))?;
    fs::write(&path, text).map_err(|e| AppError::io(format!("write POC result: {e}")))?;
    Ok(())
}
