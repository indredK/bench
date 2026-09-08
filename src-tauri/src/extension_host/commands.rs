//! Extension host commands —— P2（D-024）。
//!
//! P1 的 `ext_poc_open` / `ext_poc_report` 保留语义；P2 新增通用命令：
//! - `ext_list_installed`：扫描 `$APPDATA/extensions/*/manifest.json`，返回摘要；
//! - `ext_open`：按插件 id 打开独立 WebView（读 manifest 校验后经 asset provider 加载）；
//! - `ext_set_enabled`：以 `.disabled` 标记文件实现启用/禁用（禁用时关闭已开窗口）。
//!
//! 所有入口都 fail-closed：manifest 解析/校验失败、id 非法、 ACL 越权一律拒绝。
//! 已注册命令受 [super::acl] 网关保护（`ext-` 窗口 deny-by-default）。

use std::{fs, path::PathBuf};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::{AppError, AppResult};

use super::{
    assets::EXT_DIR_NAME,
    manifest::{ExtensionDistribution, ExtensionManifest, MANIFEST_FILE},
    url::{extension_url, extension_window_label},
};

/// POC 插件 id（P1 spike，保留作网关/回写验证入口）。
pub const POC_EXTENSION_ID: &str = "bench-poc";

/// POC 结果落盘文件名（写在应用数据目录下）。
pub const POC_RESULT_FILE: &str = "poc-verify-result.json";

/// 禁用标记文件名（置于插件产物目录内）。
pub const EXT_DISABLED_MARKER: &str = ".disabled";

/// 插件窗口错误捕获脚本。
///
/// 注入到每个插件窗口：捕获未处理异常 / Promise 拒绝 / console.error，
/// 经 `ext_poc_report` 回写宿主（ACL 注册表已放行）。
/// 这是插件调试基建（P3 起供开发模式诊断），生产构建同样保留——
/// 错误数据只落本机应用数据目录，无外发。
pub const EXT_ERROR_CAPTURE_SCRIPT: &str = r#"(() => {
  const send = (payload) => {
    try {
      window.__TAURI_INTERNALS__?.invoke?.("ext_poc_report", { payload });
    } catch (_) { /* IPC 未就绪时丢弃（仅调试数据） */ }
  };
  const fmt = (value) => {
    try {
      if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ""}`;
      return typeof value === "object" ? JSON.stringify(value) : String(value);
    } catch (_) {
      return String(value);
    }
  };
  window.addEventListener("error", (e) => {
    send({ type: "ext-diagnostic", kind: "window-error", url: location.href,
      message: String(e.message), source: String(e.filename ?? ""), line: e.lineno ?? 0 });
  });
  window.addEventListener("unhandledrejection", (e) => {
    send({ type: "ext-diagnostic", kind: "unhandled-rejection", url: location.href,
      message: fmt(e.reason) });
  });
  const originalError = console.error.bind(console);
  console.error = (...args) => {
    send({ type: "ext-diagnostic", kind: "console.error", url: location.href,
      message: args.map(fmt).join(" ") });
    originalError(...args);
  };
  window.addEventListener("load", () => {
    send({ type: "ext-diagnostic", kind: "boot", url: location.href, message: "window load" });
  });
})();"#;

/// 已安装插件摘要（返回给插件中心）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionSummary {
    pub id: String,
    pub version: String,
    pub display_zh: String,
    pub display_en: String,
    pub distribution: ExtensionDistribution,
    pub enabled: bool,
}

/// 插件根目录：`$APPDATA/extensions`。
fn extensions_root(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("resolve app data dir failed: {e}")))?;
    Ok(dir.join(EXT_DIR_NAME))
}

/// 校验插件 id 并返回其产物目录（拒绝路径穿越）。
fn extension_dir(app: &AppHandle, extension_id: &str) -> AppResult<PathBuf> {
    if !super::manifest::is_valid_extension_id(extension_id) {
        return Err(AppError::invalid_input(format!(
            "invalid extension id `{extension_id}`"
        )));
    }
    Ok(extensions_root(app)?.join(extension_id))
}

/// 读取并校验某插件的 manifest（fail-closed）。
fn read_manifest(dir: &std::path::Path) -> AppResult<ExtensionManifest> {
    let path = dir.join(MANIFEST_FILE);
    let text = fs::read_to_string(&path)
        .map_err(|e| AppError::not_found(format!("read {}: {e}", path.display())))?;
    ExtensionManifest::parse(&text)
}

/// 列出已安装插件（读每个产物的 manifest，跳过损坏条目并在错误信息中带过）。
#[tauri::command]
pub fn ext_list_installed(app: AppHandle) -> AppResult<Vec<ExtensionSummary>> {
    let root = extensions_root(&app)?;
    let mut summaries = Vec::new();
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        // 首次启动目录不存在：返回空列表而非报错。
        Err(_) => return Ok(summaries),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let manifest = match read_manifest(&path) {
            Ok(manifest) => manifest,
            Err(error) => {
                eprintln!(
                    "[extension_host] skip invalid extension at {}: {error}",
                    path.display()
                );
                continue;
            }
        };
        let enabled = !path.join(EXT_DISABLED_MARKER).exists();
        summaries.push(ExtensionSummary {
            id: manifest.id,
            version: manifest.version,
            display_zh: manifest.display.zh,
            display_en: manifest.display.en,
            distribution: manifest.distribution,
            enabled,
        });
    }
    summaries.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(summaries)
}

/// 打开插件窗口（label `ext-<id>`），返回窗口 label。
#[tauri::command]
pub fn ext_open(app: AppHandle, extension_id: String) -> AppResult<String> {
    let dir = extension_dir(&app, &extension_id)?;
    let manifest = read_manifest(&dir)?;

    if dir.join(EXT_DISABLED_MARKER).exists() {
        return Err(AppError::invalid_input(format!(
            "extension `{}` is disabled",
            manifest.id
        )));
    }

    let label = extension_window_label(&manifest.id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        return Ok(label);
    }

    let url = extension_url(&manifest.id, &manifest.entry.index)?;
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::CustomProtocol(url))
        .title(format!("{} · Bench Extension", manifest.display.en))
        .inner_size(960.0, 680.0)
        .center()
        .initialization_script(EXT_ERROR_CAPTURE_SCRIPT)
        .build()
        .map_err(|e| AppError::internal(format!("open extension window failed: {e}")))?;
    Ok(label)
}

/// 启用/禁用插件（以 `.disabled` 标记实现；禁用时关闭已开窗口），返回新状态。
#[tauri::command]
pub fn ext_set_enabled(app: AppHandle, extension_id: String, enabled: bool) -> AppResult<bool> {
    let dir = extension_dir(&app, &extension_id)?;
    // id 合法性之外再确认插件存在（manifest 可读）。
    read_manifest(&dir)?;
    let marker = dir.join(EXT_DISABLED_MARKER);
    if enabled {
        if marker.exists() {
            fs::remove_file(&marker).map_err(|e| AppError::io(format!("remove marker: {e}")))?;
        }
    } else {
        fs::write(&marker, "").map_err(|e| AppError::io(format!("write marker: {e}")))?;
        if let Some(existing) =
            app.get_webview_window(extension_window_label(&extension_id).as_str())
        {
            let _ = existing.close();
        }
    }
    Ok(enabled)
}

/// P1 语义保留：打开 POC 插件窗口（等价 `ext_open("bench-poc")`）。
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
    ext_open(app, POC_EXTENSION_ID.to_string())
}

/// 接收插件页自检结果并落盘到 `$APPDATA/poc-verify-result.json`（P1 保留）。
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
