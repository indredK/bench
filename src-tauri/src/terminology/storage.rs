use serde::de::DeserializeOwned;
use std::collections::HashSet;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

use super::data::{builtin_industries, builtin_terms};
use super::state::TerminologyState;
use super::types::{Industry, Term, TerminologyError, TerminologyResult};
use crate::persistence::{backup_file, ensure_file_size};

const STORE_FILE: &str = "terminology-store.json";
const KEY_INDUSTRIES: &str = "industries";
const KEY_TERMS: &str = "terms";
const KEY_FAVORITE_TERM_IDS: &str = "favorite_term_ids";
const KEY_PINNED_TERM_IDS: &str = "pinned_term_ids";
const KEY_SCHEMA: &str = "schema_version";
const CURRENT_SCHEMA: u32 = 1;
const MAX_STORE_FILE_BYTES: u64 = 32 * 1024 * 1024;
const FRONTEND_INDUSTRY_ID: &str = "computer";
const FRONTEND_CATEGORY_ID: &str = "frontend";
const UNCLASSIFIED_SUBCATEGORY_ID: &str = "__unclassified__";

fn store_error(message: impl Into<String>) -> TerminologyError {
    TerminologyError::StoreFail {
        message: message.into(),
    }
}

fn decode_optional<T: DeserializeOwned + Default>(
    value: Option<serde_json::Value>,
    label: &str,
) -> TerminologyResult<T> {
    match value {
        Some(value) => serde_json::from_value(value)
            .map_err(|error| store_error(format!("decode {label}: {error}"))),
        None => Ok(T::default()),
    }
}

fn validate_schema(schema: u64) -> TerminologyResult<()> {
    if schema > u64::from(CURRENT_SCHEMA) {
        Err(store_error(format!(
            "terminology store schema {schema} is newer than supported schema {CURRENT_SCHEMA}"
        )))
    } else {
        Ok(())
    }
}

fn migrate_frontend_builtin_title(id: &str, title: &str) -> Option<&'static str> {
    match (id, title) {
        ("t-1", "Virtual DOM") => Some("虚拟 DOM / Virtual DOM"),
        ("t-2", "Tree Shaking") => Some("摇树优化 / Tree Shaking"),
        ("t-3", "CSS Containment") => Some("CSS 包含 / CSS Containment"),
        ("t-26", "Hydration") => Some("水合 / Hydration"),
        ("t-27", "Code Splitting") => Some("代码分割 / Code Splitting"),
        ("t-28", "Service Worker") => Some("服务工作线程 / Service Worker"),
        ("t-88", "Sidebar") => Some("侧边栏 / Sidebar"),
        ("t-89", "Header") => Some("顶部栏 / Header"),
        ("t-90", "Footer") => Some("底部栏 / Footer"),
        ("t-91", "Main Content") => Some("主内容区 / Main Content"),
        ("t-92", "Three-column Layout") => Some("三栏布局 / Three-column Layout"),
        ("t-93", "Two-column Layout") => Some("双栏布局 / Two-column Layout"),
        ("t-94", "Vertical Layout") => Some("上下布局 / Vertical Layout"),
        ("t-95", "Grid Layout") => Some("栅格布局 / Grid Layout"),
        ("t-96", "Flex Layout") => Some("弹性布局 / Flex Layout"),
        ("t-97", "Responsive Design") => Some("响应式设计 / Responsive Design"),
        ("t-98", "Breakpoint") => Some("断点 / Breakpoint"),
        ("t-99", "Container") => Some("容器 / Container"),
        ("t-100", "Whitespace") => Some("留白 / Whitespace"),
        ("t-101", "Tabs") => Some("标签页 / Tabs"),
        ("t-102", "Drawer") => Some("抽屉 / Drawer"),
        ("t-103", "Modal") => Some("模态框 / Modal"),
        ("t-104", "Popover") => Some("悬浮层 / Popover"),
        ("t-105", "Tooltip") => Some("工具提示 / Tooltip"),
        ("t-106", "Hooks") => Some("钩子 / Hooks"),
        ("t-107", "State Management") => Some("状态管理 / State Management"),
        ("t-108", "Routing") => Some("路由 / Routing"),
        ("t-109", "Internationalization (i18n)") => Some("国际化 / Internationalization (i18n)"),
        ("t-110", "Localization (l10n)") => Some("本地化 / Localization (l10n)"),
        ("t-111", "Theming") => Some("主题系统 / Theming"),
        ("t-112", "Accessibility (a11y)") => Some("可访问性 / Accessibility (a11y)"),
        ("t-113", "Semantic HTML") => Some("语义化 HTML / Semantic HTML"),
        _ => None,
    }
}

fn migrate_frontend_builtin_subcategory(id: &str) -> Option<&'static str> {
    match id {
        "t-1" | "t-26" | "t-28" | "t-107" | "t-108" => Some("architecture"),
        "t-2" | "t-27" | "t-109" | "t-110" => Some("engineering"),
        "t-3" => Some("performance"),
        "t-88" | "t-89" | "t-90" | "t-91" | "t-92" | "t-93" | "t-94" | "t-97" | "t-98" | "t-99"
        | "t-100" | "t-101" | "t-102" | "t-103" | "t-104" | "t-105" => Some("design"),
        "t-95" | "t-96" | "t-111" => Some("styling"),
        "t-106" => Some("framework"),
        "t-112" | "t-113" => Some("accessibility"),
        _ => None,
    }
}

fn normalize_frontend_unclassified(term: &mut Term) {
    if term.industry_id == FRONTEND_INDUSTRY_ID && term.category_id == FRONTEND_CATEGORY_ID {
        match term.subcategory_id.as_deref() {
            None => {
                term.subcategory_id = Some(UNCLASSIFIED_SUBCATEGORY_ID.into());
            }
            Some(value) if value.trim().is_empty() => {
                term.subcategory_id = Some(UNCLASSIFIED_SUBCATEGORY_ID.into());
            }
            _ => {}
        }
    }
}

fn keep_frontend_unclassified_last(category: &mut super::types::TermCategory) {
    if category.id != FRONTEND_CATEGORY_ID {
        return;
    }
    if let Some(index) = category
        .subcategories
        .iter()
        .position(|subcategory| subcategory.id == UNCLASSIFIED_SUBCATEGORY_ID)
    {
        let is_last = index + 1 == category.subcategories.len();
        if !is_last {
            let item = category.subcategories.remove(index);
            category.subcategories.push(item);
        }
    }
}

fn keep_frontend_unclassified_last_in_industry(industry: &mut Industry) {
    if industry.id != FRONTEND_INDUSTRY_ID {
        return;
    }
    for category in &mut industry.categories {
        keep_frontend_unclassified_last(category);
    }
}

fn retain_existing_term_ids(ids: Vec<String>, terms: &[Term]) -> Vec<String> {
    let valid_ids: HashSet<&str> = terms.iter().map(|term| term.id.as_str()).collect();
    let mut seen = HashSet::new();
    ids.into_iter()
        .filter(|id| valid_ids.contains(id.as_str()) && seen.insert(id.clone()))
        .collect()
}

fn merge_industries(saved: Vec<Industry>) -> Vec<Industry> {
    let mut merged = builtin_industries();

    for saved_industry in saved {
        if let Some(existing) = merged
            .iter_mut()
            .find(|industry| industry.id == saved_industry.id)
        {
            existing.label = saved_industry.label;
            for saved_category in saved_industry.categories {
                if let Some(existing_category) = existing
                    .categories
                    .iter_mut()
                    .find(|category| category.id == saved_category.id)
                {
                    existing_category.label = saved_category.label;
                    for saved_subcategory in saved_category.subcategories {
                        if let Some(existing_subcategory) = existing_category
                            .subcategories
                            .iter_mut()
                            .find(|subcategory| subcategory.id == saved_subcategory.id)
                        {
                            existing_subcategory.label = saved_subcategory.label;
                        } else {
                            existing_category.subcategories.push(saved_subcategory);
                        }
                    }
                    keep_frontend_unclassified_last(existing_category);
                } else {
                    existing.categories.push(saved_category);
                }
            }
            keep_frontend_unclassified_last_in_industry(existing);
        } else {
            let mut saved_industry = saved_industry;
            keep_frontend_unclassified_last_in_industry(&mut saved_industry);
            merged.push(saved_industry);
        }
    }

    merged
}

fn merge_terms(saved: Vec<Term>) -> Vec<Term> {
    let mut merged = builtin_terms();

    for mut saved_term in saved {
        if let Some(next_title) = migrate_frontend_builtin_title(&saved_term.id, &saved_term.title)
        {
            saved_term.title = next_title.into();
        }
        if saved_term.industry_id == FRONTEND_INDUSTRY_ID
            && saved_term.category_id == FRONTEND_CATEGORY_ID
        {
            if saved_term.subcategory_id.is_none() {
                saved_term.subcategory_id =
                    migrate_frontend_builtin_subcategory(&saved_term.id).map(str::to_string);
            }
            normalize_frontend_unclassified(&mut saved_term);
        }
        if let Some(existing) = merged.iter_mut().find(|term| term.id == saved_term.id) {
            *existing = saved_term;
        } else {
            merged.push(saved_term);
        }
    }

    merged
}

pub fn init_state<R: Runtime>(
    app: &AppHandle<R>,
    state: &TerminologyState,
) -> TerminologyResult<()> {
    let store_path = app
        .path()
        .app_data_dir()
        .map(|directory| directory.join(STORE_FILE))
        .map_err(|error| store_error(format!("app data dir: {error}")))?;
    ensure_file_size(&store_path, MAX_STORE_FILE_BYTES)
        .map_err(|_| store_error("terminology store exceeds size limit"))?;
    let store = app
        .store(STORE_FILE)
        .map_err(|e| TerminologyError::StoreFail {
            message: format!("open store: {e}"),
        })?;
    let schema = store
        .get(KEY_SCHEMA)
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    validate_schema(schema)?;

    let saved_industries: Vec<Industry> =
        decode_optional(store.get(KEY_INDUSTRIES), KEY_INDUSTRIES)?;
    let saved_terms: Vec<Term> = decode_optional(store.get(KEY_TERMS), KEY_TERMS)?;
    let saved_favorite_term_ids: Vec<String> =
        decode_optional(store.get(KEY_FAVORITE_TERM_IDS), KEY_FAVORITE_TERM_IDS)?;
    let saved_pinned_term_ids: Vec<String> =
        decode_optional(store.get(KEY_PINNED_TERM_IDS), KEY_PINNED_TERM_IDS)?;

    let industries = if saved_industries.is_empty() {
        builtin_industries()
    } else {
        merge_industries(saved_industries)
    };
    let terms = if saved_terms.is_empty() {
        builtin_terms()
    } else {
        merge_terms(saved_terms)
    };
    let mut pinned_term_ids = retain_existing_term_ids(saved_pinned_term_ids, &terms);
    for term_id in retain_existing_term_ids(saved_favorite_term_ids, &terms) {
        if !pinned_term_ids.iter().any(|existing| existing == &term_id) {
            pinned_term_ids.push(term_id);
        }
    }

    if schema < u64::from(CURRENT_SCHEMA) {
        backup_file(&store_path, "pre-v1", 3)
            .map_err(|_| store_error("backup terminology store migration"))?;
        store.set(KEY_INDUSTRIES, serde_json::json!(&industries));
        store.set(KEY_TERMS, serde_json::json!(&terms));
        store.set(KEY_PINNED_TERM_IDS, serde_json::json!(&pinned_term_ids));
        store.set(KEY_SCHEMA, serde_json::json!(CURRENT_SCHEMA));
        store
            .save()
            .map_err(|error| store_error(format!("save terminology migration: {error}")))?;
    }

    *state.industries.lock().unwrap_or_else(|e| e.into_inner()) = industries;
    *state.terms.lock().unwrap_or_else(|e| e.into_inner()) = terms;
    *state
        .pinned_term_ids
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = pinned_term_ids;
    state.clear_init_error();

    Ok(())
}

fn save_state<R: Runtime>(
    app: &AppHandle<R>,
    industries: &[Industry],
    terms: &[Term],
    pinned_term_ids: &[String],
) -> TerminologyResult<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| TerminologyError::StoreFail {
            message: format!("open store: {e}"),
        })?;
    let schema = store
        .get(KEY_SCHEMA)
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    validate_schema(schema)?;

    store.set(KEY_INDUSTRIES, serde_json::json!(industries));
    store.set(KEY_TERMS, serde_json::json!(terms));
    store.set(KEY_PINNED_TERM_IDS, serde_json::json!(pinned_term_ids));
    store.set(KEY_SCHEMA, serde_json::json!(CURRENT_SCHEMA));
    store.save().map_err(|e| TerminologyError::StoreFail {
        message: format!("save store: {e}"),
    })?;

    Ok(())
}

pub fn with_state_mut<R: Runtime, F, T>(
    app: &AppHandle<R>,
    state: &TerminologyState,
    f: F,
) -> TerminologyResult<T>
where
    F: FnOnce(&mut Vec<Industry>, &mut Vec<Term>, &mut Vec<String>) -> TerminologyResult<T>,
{
    state.ensure_ready()?;
    let mut industries = state.industries.lock().unwrap_or_else(|e| e.into_inner());
    let mut terms = state.terms.lock().unwrap_or_else(|e| e.into_inner());
    let mut pinned_term_ids = state
        .pinned_term_ids
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let mut next_industries = industries.clone();
    let mut next_terms = terms.clone();
    let mut next_pinned_term_ids = pinned_term_ids.clone();
    let result = f(
        &mut next_industries,
        &mut next_terms,
        &mut next_pinned_term_ids,
    )?;

    save_state(app, &next_industries, &next_terms, &next_pinned_term_ids)?;
    *industries = next_industries;
    *terms = next_terms;
    *pinned_term_ids = next_pinned_term_ids;

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn future_terminology_schema_is_fail_closed() {
        assert!(validate_schema(u64::from(CURRENT_SCHEMA)).is_ok());
        assert!(validate_schema(u64::from(CURRENT_SCHEMA) + 1).is_err());
    }

    #[test]
    fn malformed_terminology_values_are_not_silently_reset() {
        let result =
            decode_optional::<Vec<String>>(Some(serde_json::json!({"unexpected": true})), "ids");
        assert!(result.is_err());
    }
}
