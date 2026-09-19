use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use super::types::BEHAVIOR_MINIMIZE_TO_TRAY;
use crate::error::{AppError, AppResult};

const STORE_FILE: &str = "app-preferences.json";
const CLOSE_BEHAVIOR_KEY: &str = "closeButtonBehavior";
/// 浏览器扩展导出目录（`browser_ext_export` 落盘的那个目录，含 `bench-companion`
/// 本身）。存**最终目录**而非它的父目录：下次直接作为选择器的起始位置，用户在
/// 同一目录点「打开」也不会再套一层。
const BROWSER_EXT_EXPORT_DIR_KEY: &str = "browserExtensionExportDir";
const KEY_SCHEMA_VERSION: &str = "schema_version";
/// A5-1: 偏好存储版本保护。旧数据 (无该字段) 按 schema 0 兼容读取;
/// 未来版本拒绝 (fail-closed); 损坏/缺键降级为默认值。
const CURRENT_SCHEMA_VERSION: u64 = 1;

fn default_close_behavior() -> String {
    BEHAVIOR_MINIMIZE_TO_TRAY.to_string()
}

/// 从 store 文档解析关闭行为: 校验 schema 版本与取值形状。
/// - 未来 schema → Err (fail-closed, 不猜语义)
/// - 缺键/形状异常 → 默认值 (损坏降级)
/// - 旧格式 (无 schema_version) → 兼容读取
pub(crate) fn close_behavior_from_doc(doc: Option<&serde_json::Value>) -> AppResult<String> {
    let Some(value) = doc else {
        return Ok(default_close_behavior());
    };
    if let Some(schema) = value.get(KEY_SCHEMA_VERSION).and_then(|v| v.as_u64()) {
        if schema > CURRENT_SCHEMA_VERSION {
            return Err(AppError::new(
                "PERSISTENCE_FUTURE_SCHEMA",
                format!(
                    "app-preferences schema {schema} is newer than supported {CURRENT_SCHEMA_VERSION}"
                ),
            ));
        }
    }
    Ok(value
        .get(CLOSE_BEHAVIOR_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(default_close_behavior))
}

pub fn get_close_behavior<R: Runtime>(app: &AppHandle<R>) -> AppResult<String> {
    let store = match app.store(STORE_FILE) {
        Ok(store) => store,
        Err(e) => {
            // 损坏/不可读: 降级为默认值, 不阻断启动路径 (A5-1)。
            eprintln!("[app-preferences] store unreadable, using default: {e}");
            return Ok(default_close_behavior());
        }
    };

    let doc = serde_json::json!({
        (KEY_SCHEMA_VERSION): store.get(KEY_SCHEMA_VERSION),
        (CLOSE_BEHAVIOR_KEY): store.get(CLOSE_BEHAVIOR_KEY),
    });
    close_behavior_from_doc(Some(&doc))
}

pub fn set_close_behavior<R: Runtime>(app: &AppHandle<R>, behavior: &str) -> AppResult<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::internal(format!("Failed to open store: {e}")))?;

    store.set(
        CLOSE_BEHAVIOR_KEY,
        serde_json::Value::String(behavior.to_string()),
    );
    store.set(
        KEY_SCHEMA_VERSION,
        serde_json::Value::from(CURRENT_SCHEMA_VERSION),
    );
    store
        .save()
        .map_err(|e| AppError::internal(format!("Failed to save store: {e}")))
}

/// 记住浏览器扩展的导出目录（`browser_ext_export` 成功后调用）。
pub fn set_browser_ext_export_dir<R: Runtime>(
    app: &AppHandle<R>,
    dir: &std::path::Path,
) -> AppResult<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::internal(format!("Failed to open store: {e}")))?;
    store.set(
        BROWSER_EXT_EXPORT_DIR_KEY,
        serde_json::Value::String(dir.display().to_string()),
    );
    store
        .save()
        .map_err(|e| AppError::internal(format!("Failed to save store: {e}")))
}

/// 上次记住的扩展导出目录；没有记住、或存的值形状不对时为 `None`。
///
/// 与 [`get_close_behavior`] 不同，这里**不做** schema 未来版本 fail-closed：该值
/// 只决定原生选择器的起始文件夹，取错了一次就能改，而按 A5-1 拒绝读取会让用户
/// 直接导出不了扩展（跨版本装回旧版 Bench 时的真实场景）。路径字符串的语义不随
/// schema 变化，无需按版本解释。
pub fn get_browser_ext_export_dir<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let store = app.store(STORE_FILE).ok()?;
    let value = store.get(BROWSER_EXT_EXPORT_DIR_KEY);
    browser_ext_export_dir_from_doc(value.as_ref()).map(str::to_string)
}

/// 从 store 取值解析导出目录：只接受非空字符串。是否存在、是否是目录由调用方判
/// （用户可能已把那个文件夹删掉或搬走，那时应当回退到桌面而不是报错）。
pub(crate) fn browser_ext_export_dir_from_doc(value: Option<&serde_json::Value>) -> Option<&str> {
    let path = value?.as_str()?;
    (!path.trim().is_empty()).then_some(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn legacy_doc_without_schema_version_is_readable() {
        let doc = json!({ "closeButtonBehavior": "quit" });
        assert_eq!(
            close_behavior_from_doc(Some(&doc)).expect("legacy ok"),
            "quit"
        );
    }

    #[test]
    fn future_schema_version_is_rejected_fail_closed() {
        let doc = json!({
            "schema_version": CURRENT_SCHEMA_VERSION + 1,
            "closeButtonBehavior": "quit"
        });
        let error = close_behavior_from_doc(Some(&doc)).unwrap_err();
        assert!(error.to_string().contains("PERSISTENCE_FUTURE_SCHEMA"));
    }

    #[test]
    fn missing_key_or_corrupt_shape_degrades_to_default() {
        assert_eq!(
            close_behavior_from_doc(Some(&json!({}))).expect("empty doc"),
            BEHAVIOR_MINIMIZE_TO_TRAY
        );
        assert_eq!(
            close_behavior_from_doc(Some(&json!({ "closeButtonBehavior": 42 })))
                .expect("corrupt shape"),
            BEHAVIOR_MINIMIZE_TO_TRAY
        );
        assert_eq!(
            close_behavior_from_doc(None).expect("missing doc"),
            BEHAVIOR_MINIMIZE_TO_TRAY
        );
    }

    #[test]
    fn written_doc_round_trips_through_current_schema() {
        let doc = json!({
            "schema_version": CURRENT_SCHEMA_VERSION,
            "closeButtonBehavior": "quit"
        });
        assert_eq!(close_behavior_from_doc(Some(&doc)).expect("ok"), "quit");
    }

    #[test]
    fn export_dir_accepts_only_non_empty_strings() {
        assert_eq!(
            browser_ext_export_dir_from_doc(Some(&json!("/Users/a/Dev/bench-companion"))),
            Some("/Users/a/Dev/bench-companion")
        );
        // 没记住 / 存成别的类型 / 空白串 → None，由调用方回退到桌面。
        assert_eq!(browser_ext_export_dir_from_doc(None), None);
        assert_eq!(browser_ext_export_dir_from_doc(Some(&json!(""))), None);
        assert_eq!(browser_ext_export_dir_from_doc(Some(&json!("   "))), None);
        assert_eq!(browser_ext_export_dir_from_doc(Some(&json!(null))), None);
        assert_eq!(browser_ext_export_dir_from_doc(Some(&json!(42))), None);
    }

    #[test]
    fn export_dir_key_does_not_collide_with_close_behavior() {
        assert_eq!(BROWSER_EXT_EXPORT_DIR_KEY, "browserExtensionExportDir");
        assert_ne!(BROWSER_EXT_EXPORT_DIR_KEY, CLOSE_BEHAVIOR_KEY);
    }
}
