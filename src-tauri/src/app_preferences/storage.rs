use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use super::types::BEHAVIOR_MINIMIZE_TO_TRAY;
use crate::error::{AppError, AppResult};

const STORE_FILE: &str = "app-preferences.json";
const CLOSE_BEHAVIOR_KEY: &str = "closeButtonBehavior";
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
}
