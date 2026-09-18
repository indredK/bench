//! 桥接路由 `POST /v1/douyin/items/import-batch` 的处理（DCA-01，D-037）。
//!
//! 安全边界（与 browser_bridge 现有机制叠加）：
//! - token + Origin 校验由 `browser_bridge::authorize` 统一完成，本模块只做
//!   **路由级**校验：仅 https + 抖音域名白名单（拒绝后缀欺骗）、条数/长度上限、
//!   枚举合法、去重幂等；
//! - 不把 cookies、请求头、页面脚本或视频二进制写进请求/存储；
//! - 响应只回计数与被拒摘要（截断到 [`MAX_REJECTED_REPORTED`]），不含内部路径。

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};

use crate::douyin_content_assets::store;
use crate::douyin_content_assets::types::{
    CapturedItem, DouyinAssetsResult, LIST_TYPES, MAX_BATCH_ITEMS, MAX_IMPORT_BODY_BYTES,
    MAX_REJECTED_REPORTED, SHARE_URL_KEEP_PARAMS,
};

/// 单条字符串字段的长度上限（chars）。
const MAX_TITLE_CHARS: usize = 200;
const MAX_AUTHOR_CHARS: usize = 120;
const MAX_URL_CHARS: usize = 2048;
const MAX_ID_CHARS: usize = 64;
const MAX_CAPTURE_ID_CHARS: usize = 64;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBatchRequest {
    pub capture_id: String,
    pub list_type: String,
    #[serde(default)]
    pub page_url: Option<String>,
    #[serde(default)]
    pub captured_at: Option<String>,
    #[serde(default)]
    pub items: Vec<ImportBatchItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBatchItem {
    #[serde(default)]
    pub platform_item_id: Option<String>,
    #[serde(default)]
    pub share_url: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub cover_url: Option<String>,
}

/// 路由级请求体上限（browser_bridge 分发前先比对，超限直接 400）。
pub const fn import_body_limit() -> usize {
    MAX_IMPORT_BODY_BYTES
}

/// host 是否在抖音域名白名单内（含子域；拒绝 `douyin.com.attacker.example`）。
pub fn is_douyin_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    host == "douyin.com" || host.ends_with(".douyin.com")
}

/// 截断到安全长度并去掉控制字符（页面文本不可信）。
fn clean_text(value: Option<String>, max_chars: usize) -> Option<String> {
    let value = value?
        .trim()
        .chars()
        .filter(|c| !c.is_control())
        .take(max_chars)
        .collect::<String>();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

/// 规范化分享链接：仅 https + 白名单域名；清理跟踪参数但保留作品标识参数；
/// 去掉 fragment；host 小写。失败返回 `Err(reason)`。
pub fn normalize_share_url(raw: &str) -> Result<String, String> {
    if raw.chars().count() > MAX_URL_CHARS {
        return Err("SHARE_URL_TOO_LONG".to_string());
    }
    let parsed = tauri::Url::parse(raw).map_err(|_| "SHARE_URL_INVALID".to_string())?;
    if parsed.scheme() != "https" {
        return Err("SHARE_URL_NOT_HTTPS".to_string());
    }
    let host = parsed.host_str().unwrap_or_default();
    if !is_douyin_host(host) {
        return Err("SHARE_URL_HOST_NOT_ALLOWED".to_string());
    }
    let mut path = parsed.path().to_string();
    if path.len() > 1 {
        while path.ends_with('/') {
            path.pop();
        }
    }
    let kept: Vec<(String, String)> = parsed
        .query_pairs()
        .filter(|(k, _)| {
            SHARE_URL_KEEP_PARAMS
                .iter()
                .any(|name| k.eq_ignore_ascii_case(name))
        })
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    let mut normalized = format!("https://{}{}", host.to_ascii_lowercase(), path);
    if !kept.is_empty() {
        let query = kept
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("&");
        normalized.push('?');
        normalized.push_str(&query);
    }
    Ok(normalized)
}

/// 幂等键：优先平台作品 ID，否则规范化分享链接。
fn dedupe_key(
    list_type: &str,
    platform_item_id: Option<&str>,
    normalized_url: Option<&str>,
) -> String {
    if let Some(pid) = platform_item_id {
        return format!("pid:{list_type}:{pid}");
    }
    format!("url:{list_type}:{}", normalized_url.unwrap_or_default())
}

/// 校验单条并产出待写入条目；失败返回稳定 reason。
fn build_item(
    request: &ImportBatchRequest,
    item: &ImportBatchItem,
) -> Result<CapturedItem, String> {
    let platform_item_id = match &item.platform_item_id {
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else if trimmed.chars().count() > MAX_ID_CHARS
                || !trimmed
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                return Err("PLATFORM_ITEM_ID_INVALID".to_string());
            } else {
                Some(trimmed.to_string())
            }
        }
        None => None,
    };
    let share_url = match &item.share_url {
        Some(raw) if !raw.trim().is_empty() => normalize_share_url(raw.trim())?,
        _ => String::new(),
    };
    if share_url.is_empty() && platform_item_id.is_none() {
        // 「待补充」条目：不丢弃也不入库，稳定 reason 供用户回看页面补采。
        return Err("MISSING_IDENTIFIER".to_string());
    }
    let now = chrono::Utc::now().to_rfc3339();
    Ok(CapturedItem {
        id: uuid::Uuid::new_v4().to_string(),
        dedupe_key: dedupe_key(
            &request.list_type,
            platform_item_id.as_deref(),
            if share_url.is_empty() {
                None
            } else {
                Some(&share_url)
            },
        ),
        list_type: request.list_type.clone(),
        share_url,
        platform_item_id,
        title: clean_text(item.title.clone(), MAX_TITLE_CHARS),
        author: clean_text(item.author.clone(), MAX_AUTHOR_CHARS),
        cover_url: match clean_text(item.cover_url.clone(), MAX_URL_CHARS) {
            Some(url) if url.starts_with("https://") => Some(url),
            Some(_) => return Err("COVER_URL_NOT_HTTPS".to_string()),
            None => None,
        },
        page_url: request.page_url.clone(),
        captured_at: request.captured_at.clone().unwrap_or_else(|| now.clone()),
        source_capture_id: Some(request.capture_id.clone()),
        status: "new".to_string(),
        video_asset_id: None,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    })
}

/// 处理一次采集批次导入：校验 → 去重 → 持久化 → 返回计数与被拒摘要。
pub async fn import_batch<R: Runtime>(app: &AppHandle<R>, body: &Value) -> Result<Value, String> {
    let request: ImportBatchRequest =
        serde_json::from_value(body.clone()).map_err(|_| "BODY_SCHEMA_INVALID".to_string())?;

    if request.capture_id.trim().is_empty()
        || request.capture_id.chars().count() > MAX_CAPTURE_ID_CHARS
    {
        return Err("CAPTURE_ID_INVALID".to_string());
    }
    if !LIST_TYPES.contains(&request.list_type.as_str()) {
        return Err("LIST_TYPE_INVALID".to_string());
    }
    if let Some(page_url) = &request.page_url {
        normalize_share_url(page_url).map_err(|reason| format!("PAGE_URL_{reason}"))?;
    }
    if request.items.is_empty() {
        return Err("ITEMS_EMPTY".to_string());
    }
    if request.items.len() > MAX_BATCH_ITEMS {
        return Err("ITEMS_TOO_MANY".to_string());
    }

    let app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || insert_batch(&app, &request))
        .await
        .map_err(|e| format!("TASK_JOIN_FAILED: {e}"))?;

    let (accepted, duplicates, rejected) = result.map_err(|e| e.to_string())?;
    let reported: Vec<Value> = rejected
        .iter()
        .take(MAX_REJECTED_REPORTED)
        .map(|(index, reason)| json!({ "index": index, "reason": reason }))
        .collect();
    Ok(json!({
        "accepted": accepted,
        "duplicates": duplicates,
        "rejectedTotal": rejected.len(),
        "rejected": reported,
    }))
}

/// 一次采集批次的落库结果（accepted/duplicates/rejected[index, reason]）。
pub type BatchImportCounts = (usize, usize, Vec<(usize, String)>);

/// 批次落库（在写锁内完成去重与插入；软删条目重新采到时复活并刷新字段）。
fn insert_batch<R: Runtime>(
    app: &AppHandle<R>,
    request: &ImportBatchRequest,
) -> DouyinAssetsResult<BatchImportCounts> {
    let mut accepted = 0usize;
    let mut duplicates = 0usize;
    let mut rejected: Vec<(usize, String)> = Vec::new();
    let mut built: Vec<CapturedItem> = Vec::new();
    for (index, raw) in request.items.iter().enumerate() {
        match build_item(request, raw) {
            Ok(item) => built.push(item),
            Err(reason) => rejected.push((index, reason)),
        }
    }

    store::with_items_mut(app, |items| {
        for item in built {
            let key = item.dedupe_key.clone();
            if let Some(existing) = items
                .iter_mut()
                .find(|candidate| candidate.dedupe_key == key)
            {
                if existing.deleted_at.is_some() {
                    // 重新采集 = 复活并刷新可见字段，不制造重复行。
                    existing.deleted_at = None;
                    existing.title = item.title.clone();
                    existing.author = item.author.clone();
                    existing.cover_url = item.cover_url.clone();
                    existing.captured_at = item.captured_at.clone();
                    existing.source_capture_id = item.source_capture_id.clone();
                    existing.updated_at = chrono::Utc::now().to_rfc3339();
                    accepted += 1;
                } else {
                    duplicates += 1;
                }
            } else {
                items.push(item);
                accepted += 1;
            }
        }
        Ok(())
    })?;

    Ok((accepted, duplicates, rejected))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::douyin_content_assets::types::invalid_input;

    #[test]
    fn douyin_host_allowlist_rejects_suffix_spoofing() {
        assert!(is_douyin_host("douyin.com"));
        assert!(is_douyin_host("www.douyin.com"));
        assert!(is_douyin_host("v.douyin.com"));
        assert!(!is_douyin_host("douyin.com.attacker.example"));
        assert!(!is_douyin_host("notdouyin.com"));
        assert!(!is_douyin_host(""));
    }

    #[test]
    fn share_url_normalization_keeps_item_ids_and_drops_tracking() {
        let normalized = normalize_share_url(
            "https://www.douyin.com/video/7410000000000000000?utm_source=x&item_id=741&from=share&Enter_from=y#frag/",
        )
        .expect("normalize");
        assert_eq!(
            normalized,
            "https://www.douyin.com/video/7410000000000000000?item_id=741"
        );

        assert_eq!(
            normalize_share_url("http://www.douyin.com/video/1").unwrap_err(),
            "SHARE_URL_NOT_HTTPS"
        );
        assert_eq!(
            normalize_share_url("https://evil.example/video/1").unwrap_err(),
            "SHARE_URL_HOST_NOT_ALLOWED"
        );
        assert_eq!(
            normalize_share_url("not a url").unwrap_err(),
            "SHARE_URL_INVALID"
        );
    }

    #[test]
    fn dedupe_prefers_platform_item_id() {
        assert_eq!(
            dedupe_key("favorite", Some("741"), Some("https://douyin.com/video/1")),
            "pid:favorite:741"
        );
        assert_eq!(
            dedupe_key("favorite", None, Some("https://douyin.com/video/1")),
            "url:favorite:https://douyin.com/video/1"
        );
    }

    #[test]
    fn body_limit_matches_types_constant() {
        assert_eq!(MAX_IMPORT_BODY_BYTES, 1024 * 1024);
        assert_eq!(import_body_limit(), MAX_IMPORT_BODY_BYTES);
    }

    #[test]
    fn clean_text_truncates_and_strips_controls() {
        assert_eq!(
            clean_text(Some(" a\u{7}b ".into()), 10).as_deref(),
            Some("ab")
        );
        assert_eq!(clean_text(Some("   ".into()), 10), None);
        assert_eq!(clean_text(Some("abcdef".into()), 3).as_deref(), Some("abc"));
        assert_eq!(clean_text(None, 10), None);
    }

    #[test]
    fn invalid_input_error_code_is_stable() {
        let code = serde_json::to_value(invalid_input("x")).expect("serialize");
        assert_eq!(code["code"], "INVALID_INPUT");
    }
}
