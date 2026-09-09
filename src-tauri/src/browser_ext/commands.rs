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

#[derive(Debug, Serialize)]
pub struct BrowserExtStatus {
    pub exported: bool,
    pub extension_dir: String,
    pub extension_id: String,
    pub host_bin_found: bool,
    pub host_bin_path: String,
    pub nm_registrations: Vec<super::NmRegistration>,
    pub browsers: Vec<super::BrowserInfo>,
}

/// 当前导出与注册状态（前端据此渲染按钮态）。
#[tauri::command]
pub fn browser_ext_status(app: tauri::AppHandle) -> AppResult<BrowserExtStatus> {
    let data_dir = bench_data_dir(&app)?;
    let extension_dir = data_dir.join("browser-extensions/bench-companion");
    let exported = extension_dir.join("manifest.json").exists();
    let host_bin = locate_host_bin();
    Ok(BrowserExtStatus {
        exported,
        extension_dir: extension_dir.display().to_string(),
        extension_id: EXTENSION_ID.to_string(),
        host_bin_found: host_bin.is_ok(),
        host_bin_path: host_bin.clone().unwrap_or_default().display().to_string(),
        nm_registrations: registered_nm_paths(),
        browsers: detect_browsers(),
    })
}

/// 一键导出：扩展目录 + wrapper + NM manifest。
#[tauri::command]
pub fn browser_ext_export(app: tauri::AppHandle) -> AppResult<super::ExportResult> {
    let host_bin = locate_host_bin().map_err(AppError::not_found)?;
    let data_dir = bench_data_dir(&app)?;

    let extension_dir = data_dir.join("browser-extensions/bench-companion");
    let files = write_extension_dir(&extension_dir).map_err(AppError::internal)?;
    let _ = files; // 写出文件数（日志用途）

    let wrapper = write_wrapper(&data_dir.join("bin"), &host_bin).map_err(AppError::internal)?;
    let nm_registrations = write_nm_manifests(&wrapper).map_err(AppError::internal)?;

    Ok(super::ExportResult {
        extension_dir: extension_dir.display().to_string(),
        wrapper_path: wrapper.display().to_string(),
        host_bin_path: host_bin.display().to_string(),
        nm_registrations,
        browsers: detect_browsers(),
        extension_id: EXTENSION_ID.to_string(),
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
