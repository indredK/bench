//! Extension URL 工具 —— 固化 P1 实测教训（D-024 第 4 条）。
//!
//! **铁律：extension URL 一律显式 `tauri://localhost/ext/…`。**
//!
//! 禁止使用 `WebviewUrl::App`：dev 模式下它被 `Manager::get_app_url` 拼接到
//! `build.devUrl`（vite dev server），永远到不了 asset provider；只有生产
//! 构建才解析为 `tauri://localhost`。`WebviewUrl::CustomProtocol` 在
//! dev / prod 行为一致（P1 实测证实）。

use crate::error::{AppError, AppResult};

use super::assets::EXT_ASSET_PREFIX;

/// asset provider 的固定 origin。
pub const EXT_URL_ORIGIN: &str = "tauri://localhost";

/// extension 窗口 label：`ext-<id>`（与 [super::acl] 的前缀约定一致）。
pub fn extension_window_label(extension_id: &str) -> String {
    format!("{EXT_WINDOW_PREFIX}{extension_id}")
}

use super::acl::EXT_WINDOW_PREFIX;

/// 构造 extension 入口 URL。
///
/// - `extension_id`：已通过 manifest 校验的插件 id；
/// - `entry`：manifest.entry.index（已校验为 bundle 内相对路径）。
pub fn extension_url(extension_id: &str, entry: &str) -> AppResult<tauri::Url> {
    if extension_id.is_empty() || entry.is_empty() {
        return Err(AppError::invalid_input(
            "extension id and entry must not be empty",
        ));
    }
    let url = format!("{EXT_URL_ORIGIN}/{EXT_ASSET_PREFIX}{extension_id}/{entry}");
    tauri::Url::parse(&url).map_err(|e| AppError::internal(format!("parse extension url: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_explicit_tauri_url() {
        let url = extension_url("bench-poc", "index.html").expect("valid");
        assert_eq!(url.as_str(), "tauri://localhost/ext/bench-poc/index.html");
    }

    #[test]
    fn builds_nested_entry() {
        let url = extension_url("photo-triage", "index.html").expect("valid");
        assert_eq!(
            url.as_str(),
            "tauri://localhost/ext/photo-triage/index.html"
        );
    }

    #[test]
    fn rejects_empty_parts() {
        assert!(extension_url("", "index.html").is_err());
        assert!(extension_url("photo-triage", "").is_err());
    }

    #[test]
    fn window_label_uses_prefix() {
        let label = extension_window_label("photo-triage");
        assert_eq!(label, "ext-photo-triage");
        assert!(label.starts_with("ext-"));
    }
}
