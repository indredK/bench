//! Terminology 能力：术语库**只读**访问（搜索 / 结构浏览）。
//!
//! Bench 应用把术语数据存为 tauri-plugin-store 的 JSON 文件
//! （`<app_data_dir>/terminology-store.json`，顶层键 `industries` / `terms` 等，
//! 字段 camelCase）。本模块只读取该文件并暴露搜索能力；**写入仍由 Bench GUI
//! 独占**，host 侧不提供任何术语写命令，避免双写冲突。
//!
//! store 文件定位：默认按平台惯例探测 `com.bench.app` 数据目录，
//! 可用 [`StoreLocator::with_dir`] 显式覆盖（供 `--store-dir` 传入）。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{CapError, CapResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermWebsite {
    pub url: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermCategory {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub subcategories: Vec<TermSubcategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermSubcategory {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Industry {
    pub id: String,
    pub label: String,
    pub categories: Vec<TermCategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Term {
    pub id: String,
    pub industry_id: String,
    pub category_id: String,
    #[serde(default)]
    pub subcategory_id: Option<String>,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub websites: Vec<TermWebsite>,
}

/// store 文件的只读快照（加载后即可多次查询，无需重复读盘）。
#[derive(Debug, Clone, Default)]
pub struct TerminologySnapshot {
    pub industries: Vec<Industry>,
    pub terms: Vec<Term>,
}

/// store 文件定位器。
#[derive(Debug, Clone, Default)]
pub struct StoreLocator {
    dir: Option<PathBuf>,
}

impl StoreLocator {
    /// 显式指定 store 所在目录（`--store-dir`）。
    pub fn with_dir(dir: impl Into<PathBuf>) -> Self {
        Self {
            dir: Some(dir.into()),
        }
    }

    /// 按平台惯例推断 `com.bench.app` 数据目录。
    fn inferred(&self) -> Option<PathBuf> {
        if let Some(dir) = &self.dir {
            return Some(dir.clone());
        }
        let home = std::env::var("HOME").ok()?;
        #[cfg(target_os = "macos")]
        {
            Some(PathBuf::from(home).join("Library/Application Support/com.bench.app"))
        }
        #[cfg(target_os = "windows")]
        {
            let appdata = std::env::var("APPDATA").ok()?;
            Some(PathBuf::from(appdata).join("com.bench.app"))
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let data_home =
                std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| format!("{home}/.local/share"));
            Some(PathBuf::from(data_home).join("com.bench.app"))
        }
    }

    fn store_file(&self) -> Option<PathBuf> {
        let dir = self.inferred()?;
        Some(dir.join("terminology-store.json"))
    }

    /// 加载快照。store 不存在视为「库为空」而非错误（首启场景）。
    pub fn load(&self) -> CapResult<TerminologySnapshot> {
        let Some(path) = self.store_file() else {
            return Err(CapError::unsupported(
                "无法定位数据目录（请用 --store-dir 显式指定）",
            ));
        };
        load_from_file(&path)
    }
}

/// 从指定 store 文件加载快照（供测试与高级用法）。
pub fn load_from_file(path: &Path) -> CapResult<TerminologySnapshot> {
    if !path.exists() {
        return Ok(TerminologySnapshot::default());
    }
    let raw = std::fs::read_to_string(path)
        .map_err(|e| CapError::internal(format!("读取术语库失败: {e}")))?;
    let value: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| CapError::invalid_input(format!("术语库 JSON 解析失败: {e}")))?;
    let industries = value
        .get("industries")
        .cloned()
        .map(serde_json::from_value::<Vec<Industry>>)
        .transpose()
        .map_err(|e| CapError::invalid_input(format!("industries 解析失败: {e}")))?
        .unwrap_or_default();
    let terms = value
        .get("terms")
        .cloned()
        .map(serde_json::from_value::<Vec<Term>>)
        .transpose()
        .map_err(|e| CapError::invalid_input(format!("terms 解析失败: {e}")))?
        .unwrap_or_default();
    Ok(TerminologySnapshot { industries, terms })
}

impl TerminologySnapshot {
    pub fn is_empty(&self) -> bool {
        self.terms.is_empty()
    }

    fn label_lookup(&self) -> std::collections::HashMap<(String, String, Option<String>), String> {
        let mut map = std::collections::HashMap::new();
        for industry in &self.industries {
            for category in &industry.categories {
                for sub in &category.subcategories {
                    map.insert(
                        (
                            industry.id.clone(),
                            category.id.clone(),
                            Some(sub.id.clone()),
                        ),
                        format!("{} / {} / {}", industry.label, category.label, sub.label),
                    );
                }
                map.insert(
                    (industry.id.clone(), category.id.clone(), None),
                    format!("{} / {}", industry.label, category.label),
                );
            }
        }
        map
    }

    /// 大小写不敏感的关键词搜索（匹配 title 与 description），返回带层级路径。
    pub fn search(&self, query: &str, limit: usize) -> Vec<TermHit> {
        let needle = query.trim().to_lowercase();
        if needle.is_empty() {
            return Vec::new();
        }
        let lookup = self.label_lookup();
        let mut hits: Vec<TermHit> = self
            .terms
            .iter()
            .filter(|t| {
                t.title.to_lowercase().contains(&needle)
                    || t.description.to_lowercase().contains(&needle)
            })
            .map(|t| TermHit {
                id: t.id.clone(),
                title: t.title.clone(),
                description: t.description.clone(),
                path: lookup
                    .get(&(
                        t.industry_id.clone(),
                        t.category_id.clone(),
                        t.subcategory_id.clone(),
                    ))
                    .cloned()
                    .unwrap_or_else(|| t.industry_id.clone()),
                websites: t.websites.iter().map(|w| w.url.clone()).collect::<Vec<_>>(),
            })
            .collect();
        // 标题命中优先于描述命中，其余按 title 排序保证确定性
        hits.sort_by(|a, b| {
            let a_title = a.title.to_lowercase().contains(&needle);
            let b_title = b.title.to_lowercase().contains(&needle);
            b_title.cmp(&a_title).then_with(|| a.title.cmp(&b.title))
        });
        hits.truncate(limit.max(1));
        hits
    }

    /// 行业树（id + label + 分类 label，不含术语正文，保持响应轻量）。
    pub fn list_industries(&self) -> Vec<IndustryOutline> {
        self.industries
            .iter()
            .map(|i| IndustryOutline {
                id: i.id.clone(),
                label: i.label.clone(),
                categories: i
                    .categories
                    .iter()
                    .map(|c| CategoryOutline {
                        id: c.id.clone(),
                        label: c.label.clone(),
                        subcategories: c.subcategories.iter().map(|s| s.label.clone()).collect(),
                    })
                    .collect(),
            })
            .collect()
    }

    /// 术语总数（含 builtin 迁移结果，供协议层展示规模）。
    pub fn term_count(&self) -> usize {
        self.terms.len()
    }
}

/// 搜索命中项。
#[derive(Debug, Clone, Serialize)]
pub struct TermHit {
    pub id: String,
    pub title: String,
    pub description: String,
    /// `行业 / 分类 / 子分类` 层级路径
    pub path: String,
    pub websites: Vec<String>,
}

/// 行业大纲（协议层响应）。
#[derive(Debug, Clone, Serialize)]
pub struct IndustryOutline {
    pub id: String,
    pub label: String,
    pub categories: Vec<CategoryOutline>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CategoryOutline {
    pub id: String,
    pub label: String,
    pub subcategories: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_store(dir: &Path, json: &str) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let path = dir.join("terminology-store.json");
        std::fs::write(&path, json).unwrap();
        path
    }

    #[test]
    fn missing_store_is_empty_snapshot() {
        let dir = std::env::temp_dir().join(format!("cap-term-missing-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let snap = load_from_file(&dir.join("terminology-store.json")).unwrap();
        assert!(snap.is_empty());
    }

    #[test]
    fn search_matches_title_case_insensitively_and_maps_path() {
        let dir = std::env::temp_dir().join(format!("cap-term-search-{}", std::process::id()));
        let path = write_store(
            &dir,
            r#"{
              "schema_version": 1,
              "industries": [
                { "id": "computer", "label": "计算机",
                  "categories": [ { "id": "frontend", "label": "前端",
                    "subcategories": [ { "id": "react", "label": "React" } ] } ] }
              ],
              "terms": [
                { "id": "t-1", "industryId": "computer", "categoryId": "frontend",
                  "subcategoryId": "react", "title": "虚拟 DOM / Virtual DOM",
                  "description": "轻量描述对象", "websites": [] }
              ],
              "pinned_term_ids": []
            }"#,
        );
        let snap = load_from_file(&path).unwrap();
        assert_eq!(snap.term_count(), 1);
        let hits = snap.search("virtual dom", 10);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "计算机 / 前端 / React");
        assert!(snap.search("zzz-no-match", 10).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
