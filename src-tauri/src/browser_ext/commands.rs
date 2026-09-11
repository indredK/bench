//! Tauri 命令：浏览器扩展导出 / MCP 一键接入。
//!
//! 命令清单（注册见 commands.rs 宏）：
//! - `browser_ext_export`         —— 写扩展目录 + wrapper + NM manifest，返回引导数据
//! - `browser_ext_status`         —— 当前导出/注册状态
//! - `browser_ext_open_extensions_page` —— 打开浏览器扩展管理页（chrome://extensions）
//! - `mcp_targets_status`         —— 探测本机 AI 客户端
//! - `mcp_install_clients`        —— 一键写入所选客户端的 MCP 配置

use serde::Serialize;

use crate::error::{AppError, AppResult};

use super::mcp_config;
use super::{
    detect_browsers, locate_host_bin, registered_nm_paths, write_extension_dir, write_nm_manifests,
    write_wrapper, EXTENSION_ID,
};

fn bench_data_dir(app: &tauri::AppHandle) -> AppResult<std::path::PathBuf> {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("无法定位数据目录: {e}")))
}

/// 扩展导出目录：放在**用户桌面**下（`<Desktop>/bench-companion`）。
///
/// 为什么不放应用数据目录：Chrome 的「加载已解压的扩展程序」文件夹选择器在
/// macOS 上到不了 `~/Library/Application Support`（Finder 默认隐藏 Library，
/// 系统文件选择器也无法前往该层级），用户实测反馈「找不到要选的文件夹」
/// （2026-09-10）。桌面是三平台文件选择器都能直接到达、用户最容易识别的位置。
///
/// 桌面目录经 `dirs::desktop_dir()` 获取（Windows 走 `SHGetKnownFolderPath`，
/// 能正确处理 OneDrive 等已知文件夹重定向；macOS 为 `$HOME/Desktop`），
/// 获取失败时回退到应用数据目录，保证导出流程永远可完成。
fn extension_export_dir(app: &tauri::AppHandle) -> AppResult<std::path::PathBuf> {
    let base = match dirs::desktop_dir() {
        Some(dir) => dir,
        None => bench_data_dir(app)?,
    };
    Ok(base.join("bench-companion"))
}

/// 序列化统一走 camelCase —— 前端类型（`src/lib/tauri/types/browser-ext.ts`）按
/// camelCase 声明；缺这个属性时 `extension_dir` / `bridge_ready` 等字段在前端读到的
/// 是 `undefined`（不报错，但会把「缺少 bench-host」误判为真、禁用导出按钮）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserExtStatus {
    pub exported: bool,
    pub extension_dir: String,
    pub extension_id: String,
    /// 扩展版本（来自内嵌 manifest；前端展示并与浏览器已加载版本核对）。
    pub extension_version: String,
    pub host_bin_found: bool,
    pub host_bin_path: String,
    pub nm_registrations: Vec<super::NmRegistration>,
    pub browsers: Vec<super::BrowserInfo>,
    /// 浏览器扩展本地桥是否已就绪（扩展要靠它把会话交回 Bench）。
    pub bridge_ready: bool,
    /// 本地桥端口（未就绪时为 null）。
    pub bridge_port: Option<u16>,
}

/// 当前导出与注册状态（前端据此渲染按钮态）。
#[tauri::command]
pub fn browser_ext_status(app: tauri::AppHandle) -> AppResult<BrowserExtStatus> {
    let extension_dir = extension_export_dir(&app)?;
    let exported = extension_dir.join("manifest.json").exists();
    let host_bin = locate_host_bin();
    let bridge = crate::account_manager::browser_bridge::descriptor();
    Ok(BrowserExtStatus {
        exported,
        extension_dir: extension_dir.display().to_string(),
        extension_id: EXTENSION_ID.to_string(),
        extension_version: super::extension_version(),
        host_bin_found: host_bin.is_ok(),
        host_bin_path: host_bin.clone().unwrap_or_default().display().to_string(),
        nm_registrations: registered_nm_paths(),
        browsers: detect_browsers(),
        bridge_ready: bridge.is_some(),
        bridge_port: bridge.map(|value| value.port),
    })
}

/// 一键导出：扩展目录 + wrapper + NM manifest。
///
/// 同时确保浏览器扩展本地桥已启动 —— wrapper 必须带上描述文件路径，扩展才能
/// 经 bench-host 取回桥的端口与一次性 token（控制面）。
#[tauri::command]
pub fn browser_ext_export(app: tauri::AppHandle) -> AppResult<super::ExportResult> {
    let host_bin = locate_host_bin().map_err(AppError::not_found)?;
    let data_dir = bench_data_dir(&app)?;

    crate::account_manager::browser_bridge::ensure_started(app.clone());
    let descriptor_path = crate::account_manager::browser_bridge::descriptor_path(&app)
        .map_err(AppError::internal)?;

    let extension_dir = extension_export_dir(&app)?;
    let files = write_extension_dir(&extension_dir).map_err(AppError::internal)?;
    let _ = files; // 写出文件数（日志用途）

    let wrapper = write_wrapper(&data_dir.join("bin"), &host_bin, &descriptor_path)
        .map_err(AppError::internal)?;
    let nm_registrations = write_nm_manifests(&wrapper).map_err(AppError::internal)?;

    Ok(super::ExportResult {
        extension_dir: extension_dir.display().to_string(),
        wrapper_path: wrapper.display().to_string(),
        host_bin_path: host_bin.display().to_string(),
        nm_registrations,
        browsers: detect_browsers(),
        extension_id: EXTENSION_ID.to_string(),
        extension_version: super::extension_version(),
    })
}

/// 打开浏览器扩展管理页。`chrome://` 协议不能经系统默认 URL handler 打开，
/// 必须直接调用浏览器（macOS: `open -a <app>`；Windows 暂不支持）。
#[tauri::command]
pub fn browser_ext_open_extensions_page(browser_id: String) -> AppResult<()> {
    let app_name = match browser_id.as_str() {
        "chrome" => "Google Chrome",
        "edge" => "Microsoft Edge",
        "brave" => "Brave Browser",
        "arc" => "Arc",
        "firefox" => "Firefox",
        other => return Err(AppError::invalid_input(format!("未知浏览器: {other}"))),
    };

    #[cfg(target_os = "macos")]
    {
        let url = if browser_id == "firefox" {
            "about:debugging#/runtime/this-firefox"
        } else {
            "chrome://extensions"
        };
        let status = std::process::Command::new("open")
            .args(["-a", app_name, url])
            .status()
            .map_err(|e| AppError::internal(format!("启动 {app_name} 失败: {e}")))?;
        if !status.success() {
            return Err(AppError::internal(format!(
                "{app_name} 打开扩展页失败（exit {}）",
                status.code().unwrap_or(-1)
            )));
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app_name;
        Err(AppError::unsupported("当前仅支持 macOS"))
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTargetStatus {
    pub id: String,
    pub name: String,
    pub config_path: String,
    pub installed_hint: bool,
    pub bench_configured: bool,
}

/// MCP 客户端探测结果（含 bench 是否已配置）。
#[tauri::command]
pub fn mcp_targets_status() -> AppResult<Vec<McpTargetStatus>> {
    Ok(mcp_config::mcp_targets()
        .into_iter()
        .map(|t| {
            let bench_configured = std::fs::read_to_string(&t.config_path)
                .ok()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                .and_then(|v| {
                    v.get("mcpServers")
                        .and_then(|m| m.get(mcp_config::SERVER_KEY))
                        .cloned()
                })
                .is_some();
            McpTargetStatus {
                id: t.id,
                name: t.name,
                config_path: t.config_path.display().to_string(),
                installed_hint: t.installed_hint,
                bench_configured,
            }
        })
        .collect())
}

/// 一键写入所选客户端的 MCP 配置。
#[tauri::command]
pub fn mcp_install_clients(
    app: tauri::AppHandle,
    client_ids: Vec<String>,
) -> AppResult<Vec<mcp_config::McpInstallResult>> {
    let host_bin = locate_host_bin().map_err(AppError::not_found)?;
    let entry = mcp_config::bench_server_entry(&host_bin);
    let mut results = Vec::new();
    for target in mcp_config::mcp_targets() {
        if !client_ids.contains(&target.id) {
            continue;
        }
        match mcp_config::install_to(&target.config_path, &entry) {
            Ok(already) => results.push(mcp_config::McpInstallResult {
                target_id: target.id,
                config_path: target.config_path.display().to_string(),
                installed: true,
                already_up_to_date: already,
                backup_path: None,
                message: if already {
                    "已是最新配置".to_string()
                } else {
                    "已写入，请重启客户端生效".to_string()
                },
            }),
            Err(e) => results.push(mcp_config::McpInstallResult {
                target_id: target.id,
                config_path: target.config_path.display().to_string(),
                installed: false,
                already_up_to_date: false,
                backup_path: None,
                message: e,
            }),
        }
    }
    let _ = bench_data_dir(&app)?; // 保持与其它命令一致的数据目录校验
    Ok(results)
}
