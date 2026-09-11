//! Browser Extension export / 浏览器扩展导出与 Native Messaging 注册。
//!
//! 职责（Tauri 命令 `browser_ext_*`）：
//! 1. 把内嵌的 bench-companion 扩展模板写出为「可直接加载的已解压扩展」；
//! 2. 注册 Native Messaging host（`com.kindred.bench`）到各浏览器的
//!    NativeMessagingHosts 目录，并生成 wrapper 脚本（NM 启动不带参数）；
//! 3. 探测本机浏览器，为前端引导浮层提供数据。
//!
//! 设计要点：
//! - 模板经 `include_str!/include_bytes!` 编译期嵌入，无运行时资源路径问题；
//! - 扩展 manifest 携带固定 `key`，扩展 ID 恒为
//!   `dmcfgfpfilhgcoddmciglpjdggkpinje`，与 NM host manifest 的
//!   `allowed_origins` 永久匹配（见
//!   `docs/explanation/browser-session-extension-plan.md` §3.1）；
//! - 本模块只写「用户可见的安装/注册文件」，不改浏览器内部数据。

pub mod commands;
pub mod mcp_config;

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Native Messaging host 名（与 wrapper、host manifest 三处一致）。
pub const NM_HOST_NAME: &str = "com.kindred.bench";
/// 固定扩展 ID（由 manifest 中的固定 `key` 派生，见 R3）。
pub const EXTENSION_ID: &str = "dmcfgfpfilhgcoddmciglpjdggkpinje";
/// Firefox/Gecko 扩展 ID（manifest 的 browser_specific_settings.gecko.id）。
pub const GECKO_EXTENSION_ID: &str = "bench-companion@kindred.dev";

/// 从编译期内嵌的扩展 manifest 解析版本号（status / export 都要带给前端展示，
/// 用户据此核对浏览器里已加载扩展的版本是否与本次导出一致）。
pub fn extension_version() -> String {
    serde_json::from_str::<serde_json::Value>(template::MANIFEST)
        .ok()
        .and_then(|value| {
            value
                .get("version")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_default()
}

// —— 模板（编译期嵌入，避免运行时资源路径解析问题）——
mod template {
    pub const MANIFEST: &str =
        include_str!("../../resources/browser-extension/bench-companion/manifest.json");
    pub const BACKGROUND: &str =
        include_str!("../../resources/browser-extension/bench-companion/background.js");
    pub const POPUP_HTML: &str =
        include_str!("../../resources/browser-extension/bench-companion/popup.html");
    pub const POPUP_CSS: &str =
        include_str!("../../resources/browser-extension/bench-companion/popup.css");
    pub const POPUP_JS: &str =
        include_str!("../../resources/browser-extension/bench-companion/popup.js");
    pub const TAB_HTML: &str =
        include_str!("../../resources/browser-extension/bench-companion/tab.html");
    pub const TAB_CSS: &str =
        include_str!("../../resources/browser-extension/bench-companion/tab.css");
    pub const TAB_JS: &str =
        include_str!("../../resources/browser-extension/bench-companion/tab.js");
    pub const ICON_128: &[u8] =
        include_bytes!("../../resources/browser-extension/bench-companion/icons/icon128.png");
    pub const ICON_48: &[u8] =
        include_bytes!("../../resources/browser-extension/bench-companion/icons/icon48.png");
    pub const ICON_16: &[u8] =
        include_bytes!("../../resources/browser-extension/bench-companion/icons/icon16.png");
}

/// 模板文件清单：(相对路径, 内容)。
pub fn template_files() -> Vec<(&'static str, TemplateContent)> {
    use TemplateContent::{Binary, Text};
    vec![
        ("manifest.json", Text(template::MANIFEST)),
        ("background.js", Text(template::BACKGROUND)),
        ("popup.html", Text(template::POPUP_HTML)),
        ("popup.css", Text(template::POPUP_CSS)),
        ("popup.js", Text(template::POPUP_JS)),
        ("tab.html", Text(template::TAB_HTML)),
        ("tab.css", Text(template::TAB_CSS)),
        ("tab.js", Text(template::TAB_JS)),
        ("icons/icon128.png", Binary(template::ICON_128)),
        ("icons/icon48.png", Binary(template::ICON_48)),
        ("icons/icon16.png", Binary(template::ICON_16)),
    ]
}

pub enum TemplateContent {
    Text(&'static str),
    Binary(&'static [u8]),
}

/// macOS 上各浏览器的 NativeMessagingHosts 目录（Chromium 系 allowed_origins /
/// Firefox 系 allowed_extensions，由 [`write_nm_manifests`] 分别生成）。
pub fn nm_target_dirs() -> Vec<(&'static str, PathBuf, bool)> {
    let home = std::env::var("HOME").unwrap_or_default();
    let app_support = |p: &str| {
        PathBuf::from(&home)
            .join("Library/Application Support")
            .join(p)
    };
    vec![
        (
            "chrome",
            app_support("Google/Chrome/NativeMessagingHosts"),
            false, // Chromium 系：allowed_origins
        ),
        (
            "edge",
            app_support("Microsoft Edge/NativeMessagingHosts"),
            false,
        ),
        (
            "brave",
            app_support("BraveSoftware/Brave-Browser/NativeMessagingHosts"),
            false,
        ),
        (
            "chromium",
            PathBuf::from(&home).join(".config/chromium/NativeMessagingHosts"),
            false,
        ),
        (
            "arc",
            app_support("Arc/User Data/NativeMessagingHosts"),
            false,
        ),
        ("firefox", app_support("Mozilla/NativeMessagingHosts"), true), // Gecko：allowed_extensions
    ]
}

/// macOS 上已安装的浏览器（按 /Applications 下的 .app 判断）。
pub fn detect_browsers() -> Vec<BrowserInfo> {
    let applications = PathBuf::from("/Applications");
    let candidates: &[(&str, &str)] = &[
        ("chrome", "Google Chrome.app"),
        ("edge", "Microsoft Edge.app"),
        ("brave", "Brave Browser.app"),
        ("arc", "Arc.app"),
        ("firefox", "Firefox.app"),
    ];
    candidates
        .iter()
        .map(|(id, app)| BrowserInfo {
            id: (*id).to_string(),
            name: app.trim_end_matches(".app").to_string(),
            installed: applications.join(app).is_dir(),
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInfo {
    pub id: String,
    pub name: String,
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NmRegistration {
    pub browser: String,
    pub manifest_path: String,
    pub registered: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub extension_dir: String,
    pub wrapper_path: String,
    pub host_bin_path: String,
    pub nm_registrations: Vec<NmRegistration>,
    pub browsers: Vec<BrowserInfo>,
    pub extension_id: String,
    /// 本次导出的扩展版本（弹窗/toast 提示用）。
    pub extension_version: String,
}

/// bench-host 可执行文件位置：与当前进程同目录（打包后 = Contents/MacOS/，
/// dev = target/debug/）。不存在则返回 Err，提示先构建。
pub fn locate_host_bin() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法定位当前进程: {e}"))?;
    let dir = exe.parent().ok_or("无法定位可执行目录")?;
    let candidate = dir.join(if cfg!(windows) {
        "bench-host.exe"
    } else {
        "bench-host"
    });
    if candidate.exists() {
        Ok(candidate)
    } else {
        Err(format!(
            "未找到 bench-host（期望位置 {}）。请先执行 cargo build -p bench-host",
            candidate.display()
        ))
    }
}

/// 写出扩展目录（覆盖式：先清空目标内旧文件再逐个写入）。
pub fn write_extension_dir(target: &Path) -> Result<usize, String> {
    std::fs::create_dir_all(target).map_err(|e| format!("创建扩展目录失败: {e}"))?;
    let mut count = 0;
    for (rel, content) in template_files() {
        let path = target.join(rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建 {} 失败: {e}", parent.display()))?;
        }
        let bytes: Vec<u8> = match content {
            TemplateContent::Text(t) => t.as_bytes().to_vec(),
            TemplateContent::Binary(b) => b.to_vec(),
        };
        std::fs::write(&path, bytes).map_err(|e| format!("写入 {} 失败: {e}", path.display()))?;
        count += 1;
    }
    Ok(count)
}

/// 生成 NM wrapper 脚本（Native Messaging 启动 host 不带参数，
/// 参数必须经 wrapper 传入）。返回脚本绝对路径。
///
/// wrapper 额外带上 `--bridge-descriptor`：扩展需要经 bench-host 取回本地桥的
/// 端口与一次性 token（控制面），因此 host 必须知道描述文件在哪。
pub fn write_wrapper(
    bin_dir: &Path,
    host_bin: &Path,
    descriptor_path: &Path,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(bin_dir).map_err(|e| format!("创建 bin 目录失败: {e}"))?;
    let wrapper = bin_dir.join("bench-host-nm.sh");
    let script = format!(
        "#!/bin/sh\n# 由 Bench 生成：Native Messaging host 启动入口（NM 不支持传参）\nexec \"{}\" native --bridge-descriptor \"{}\" \"$@\"\n",
        host_bin.display(),
        descriptor_path.display()
    );
    std::fs::write(&wrapper, script).map_err(|e| format!("写入 wrapper 失败: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&wrapper, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("设置 wrapper 可执行位失败: {e}"))?;
    }
    Ok(wrapper)
}

/// 把 NM host manifest 写到所有已知浏览器目录。
/// Chromium 系用 `allowed_origins`（固定扩展 ID），Gecko 用 `allowed_extensions`。
pub fn write_nm_manifests(wrapper: &Path) -> Result<Vec<NmRegistration>, String> {
    let mut registrations = Vec::new();
    for (browser, dir, is_gecko) in nm_target_dirs() {
        let manifest = if is_gecko {
            serde_json::json!({
                "name": NM_HOST_NAME,
                "description": "Bench capability bridge",
                "path": wrapper.display().to_string(),
                "type": "stdio",
                "allowed_extensions": [GECKO_EXTENSION_ID],
            })
        } else {
            serde_json::json!({
                "name": NM_HOST_NAME,
                "description": "Bench capability bridge",
                "path": wrapper.display().to_string(),
                "type": "stdio",
                "allowed_origins": [format!("chrome-extension://{EXTENSION_ID}/")],
            })
        };
        let pretty = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
        if std::fs::create_dir_all(&dir).is_err() {
            registrations.push(NmRegistration {
                browser: browser.to_string(),
                manifest_path: dir
                    .join(format!("{NM_HOST_NAME}.json"))
                    .display()
                    .to_string(),
                registered: false,
            });
            continue;
        }
        let path = dir.join(format!("{NM_HOST_NAME}.json"));
        let registered = std::fs::write(&path, pretty).is_ok();
        registrations.push(NmRegistration {
            browser: browser.to_string(),
            manifest_path: path.display().to_string(),
            registered,
        });
    }
    Ok(registrations)
}

/// 已注册的 NM manifest 路径（status 查询用）。
pub fn registered_nm_paths() -> Vec<NmRegistration> {
    nm_target_dirs()
        .into_iter()
        .map(|(browser, dir, _)| {
            let path = dir.join(format!("{NM_HOST_NAME}.json"));
            NmRegistration {
                browser: browser.to_string(),
                manifest_path: path.display().to_string(),
                registered: path.exists(),
            }
        })
        .collect()
}
