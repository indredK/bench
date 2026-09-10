//! 登录规则包（login rulepack）——声明式站点登录判定规则的分发与解析。
//!
//! 规格真相源：`docs/reference/login-rulepack-spec.md`。规则是纯 JSON 数据，
//! 判定引擎在宿主（`probe.rs` / `session_keeper.rs`），远程仓库不下发逻辑。
//!
//! 数据面：
//! - 索引 `rules.json`（command-market 登录规则板块）+ 单站点规则 `rules/<id>.json`；
//! - bundled 内置集（`ruledata/`，include_str! 随版本编译，离线兜底）；
//! - 远程缓存 `$APPDATA/login-rules/`（启动后台拉取 + 24h TTL 惰性刷新，失败静默沿用）。
//!
//! 安全铁律（fail-closed）：
//! - `loginCheck.url` 必须 https 且与规则 `match.registrableDomain` 同一可注册域、
//!   method 白名单 GET/POST——loginCheck 携带账号 cookie，同域约束下投毒无法外泄 session；
//! - `fallback` 仅 text/selector 弱证据；未知字段 / 非法 kind / 路径穿越一律拒绝。

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use super::types::AccountSessionStatus;

/// 宿主支持的规则包 schema 版本（与 command-market `build-rules.mjs` 同步演进）。
pub const RULES_SCHEMA_VERSION: u32 = 1;

/// 通用兜底规则 id（非域名特例）：match 省略 = 对所有站点生效；
/// 禁止 loginCheck（无法预知各站点同域鉴权接口）；站点特殊规则优先于它。
pub const GENERIC_RULE_ID: &str = "generic";

const RULES_URL_ENV: &str = "BENCH_LOGIN_RULES_URL";
const RULES_DIR_ENV: &str = "BENCH_LOGIN_RULES_DIR";

/// 官方登录规则索引（command-market 登录规则板块；env 未设置时作为默认源 —— 零配置）。
pub const OFFICIAL_RULES_URL: &str =
    "https://raw.githubusercontent.com/kindred-plugin-market/command-market/main/rules.json";

const CACHE_DIR_NAME: &str = "login-rules";
/// 缓存 TTL：超过后 resolve 惰性触发后台刷新（不阻塞当前判定）。
const REFRESH_INTERVAL_SECS: u64 = 24 * 3600;
/// 远程拉取超时（索引与单文件共用）。
const FETCH_TIMEOUT_SECS: u64 = 15;
/// 单规则文件大小上限（规则是 KB 级 JSON，防异常内容写盘）。
const MAX_RULE_FILE_BYTES: u64 = 256 * 1024;

static REFRESHING: AtomicBool = AtomicBool::new(false);

// ═══════════════════════════════════════════════
// 数据类型（schema v1；serde deny_unknown_fields fail-closed）
// ═══════════════════════════════════════════════

/// 远程规则索引（`rules.json`）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoginRulesIndex {
    pub schema_version: u32,
    /// 索引构建时间（ISO 8601）。宿主暂未消费，保留以对齐索引 schema（deny_unknown_fields 下必须声明）。
    #[allow(dead_code)]
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub rules: Vec<LoginRuleEntry>,
}

/// 索引条目。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoginRuleEntry {
    pub id: String,
    pub version: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    /// 相对索引的规则文件路径（`rules/<id>.json`）。
    pub file: String,
    /// 规则文件 sha256（hex 64）。
    pub sha256: String,
    /// 规则文件字节数。
    pub size: u64,
}

/// 单站点规则文件（`rules/<id>.json`）。`match` 是 JSON 字段名（Rust 侧 rename）。
/// generic 兜底规则省略 `match`（None = 全局生效）。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoginRuleDoc {
    pub schema_version: u32,
    pub id: String,
    pub version: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(rename = "match", default)]
    pub match_rule: Option<RuleMatch>,
    pub detection: RuleDetection,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuleMatch {
    /// 规则 id 必须等于它（可注册域）。
    pub registrable_domain: String,
    /// 可选精确 host 集合（specificity 高于可注册域匹配）。
    #[serde(default)]
    pub hosts: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuleDetection {
    #[serde(default)]
    pub login_check: Option<LoginCheckSpec>,
    #[serde(default)]
    pub fallback: Option<RuleFallback>,
}

/// S1 服务端权威探针配置（强判据）。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoginCheckSpec {
    pub url: String,
    /// 白名单 GET | POST（POST 空请求体）。
    pub method: String,
    pub expect: LoginCheckExpect,
}

/// 期望判定（kind 白名单 status | jsonBool | bodyContains）。
///
/// `loggedIn`/`loggedOut` 用 `Value` 承载混合类型：status kind 下是数字状态码，
/// bodyContains kind 下是指示器字符串；`validate_rule_doc` 保证与 kind 匹配。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoginCheckExpect {
    pub kind: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub logged_in: Vec<Value>,
    #[serde(default)]
    pub logged_out: Vec<Value>,
}

/// 文本/选择器弱证据集合（loginCheck 缺失或不可用时的兜底）。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuleFallback {
    #[serde(default)]
    pub logged_in: Vec<RuleCondition>,
    #[serde(default)]
    pub logged_out: Vec<RuleCondition>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuleCondition {
    pub kind: RuleConditionKind,
    pub value: String,
    #[serde(default)]
    pub presence: RulePresence,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RuleConditionKind {
    Text,
    Selector,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RulePresence {
    #[default]
    Present,
    Absent,
}

// ═══════════════════════════════════════════════
// 校验（fail-closed；与 command-market build-rules.mjs 同规则）
// ═══════════════════════════════════════════════

/// 合法 host 段：`[a-z0-9]([a-z0-9-]*[a-z0-9])?`。
fn is_host_label(label: &str) -> bool {
    let bytes = label.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    let is_alnum = |b: u8| b.is_ascii_lowercase() || b.is_ascii_digit();
    if !is_alnum(bytes[0]) || !is_alnum(bytes[bytes.len() - 1]) {
        return false;
    }
    bytes[1..bytes.len() - 1]
        .iter()
        .all(|b| is_alnum(*b) || *b == b'-')
}

/// host/可注册域：至少两段点分小写标签。
fn is_host(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    parts.len() >= 2 && parts.iter().all(|label| is_host_label(label))
}

fn same_registrable_domain(host: &str, domain: &str) -> bool {
    host == domain
        || host
            .strip_suffix(domain)
            .is_some_and(|rest| rest.ends_with('.'))
}

fn is_semver(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

fn is_hex64(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

/// 三段数字版本比较：`a > b`。
fn version_gt(a: &str, b: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.split('.')
            .map(|p| p.parse::<u64>().unwrap_or(0))
            .collect()
    };
    let (av, bv) = (parse(a), parse(b));
    for i in 0..3 {
        let x = av.get(i).copied().unwrap_or(0);
        let y = bv.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

pub(crate) fn json_bool_path(root: &Value, path: &str) -> Option<bool> {
    let mut current = root;
    for segment in path.split('.') {
        current = if let Ok(index) = segment.parse::<usize>() {
            current.get(index)?
        } else {
            current.get(segment)?
        };
    }
    current.as_bool()
}

fn validate_login_check(doc_id: &str, check: &LoginCheckSpec) -> Result<(), String> {
    if !matches!(check.method.as_str(), "GET" | "POST") {
        return Err(format!("loginCheck.method `{}` not allowed", check.method));
    }
    let url = url::Url::parse(&check.url).map_err(|e| format!("loginCheck.url invalid: {e}"))?;
    if url.scheme() != "https" {
        return Err("loginCheck.url must be https".into());
    }
    let host = url.host_str().unwrap_or_default();
    if !same_registrable_domain(host, doc_id) {
        return Err(format!(
            "loginCheck.url host `{host}` must share registrable domain `{doc_id}`"
        ));
    }
    let expect = &check.expect;
    match expect.kind.as_str() {
        "status" => {
            if expect.path.is_some() {
                return Err("expect.path is only valid for kind jsonBool".into());
            }
            for side in [&expect.logged_in, &expect.logged_out] {
                if side.is_empty() {
                    return Err("expect.status requires non-empty loggedIn/loggedOut".into());
                }
                for item in side {
                    if !item
                        .as_u64()
                        .is_some_and(|code| (100..=599).contains(&code))
                    {
                        return Err("expect.status entries must be HTTP codes 100-599".into());
                    }
                }
            }
        }
        "jsonBool" => {
            let path = expect
                .path
                .as_deref()
                .filter(|p| !p.is_empty())
                .ok_or("expect.jsonBool requires path")?;
            if !path
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'.')
            {
                return Err("expect.path must match [A-Za-z0-9_.]".into());
            }
            if !expect.logged_in.is_empty() || !expect.logged_out.is_empty() {
                return Err("expect.jsonBool must not define loggedIn/loggedOut".into());
            }
        }
        "bodyContains" => {
            if expect.path.is_some() {
                return Err("expect.path is only valid for kind jsonBool".into());
            }
            for side in [&expect.logged_in, &expect.logged_out] {
                if side.is_empty() {
                    return Err("expect.bodyContains requires non-empty loggedIn/loggedOut".into());
                }
                for item in side {
                    if item.as_str().is_none_or(|s| s.is_empty()) {
                        return Err("expect.bodyContains entries must be non-empty strings".into());
                    }
                }
            }
        }
        other => return Err(format!("expect.kind `{other}` is invalid")),
    }
    Ok(())
}

/// 规则文件 fail-closed 校验（spec §4.3）。任一失败整条规则拒绝。
pub fn validate_rule_doc(doc: &LoginRuleDoc) -> Result<(), String> {
    if doc.schema_version != RULES_SCHEMA_VERSION {
        return Err(format!(
            "schemaVersion {} not supported (host supports {})",
            doc.schema_version, RULES_SCHEMA_VERSION
        ));
    }
    let is_generic = doc.id == GENERIC_RULE_ID;
    if !is_generic && !is_host(&doc.id) {
        return Err(format!("id `{}` is not a valid registrable domain", doc.id));
    }
    if doc.version.is_empty() || !is_semver(&doc.version) {
        return Err(format!("version `{}` must be X.Y.Z", doc.version));
    }
    if doc.title.trim().is_empty() {
        return Err("title must be non-empty".into());
    }
    if is_generic {
        // generic 兜底规则：match 省略（全局生效）、禁 loginCheck、必须提供 fallback。
        if doc.match_rule.is_some() {
            return Err("generic rule must not define match (applies globally)".into());
        }
        if doc.detection.login_check.is_some() {
            return Err(
                "generic rule must not define loginCheck (same-domain rule cannot apply globally)"
                    .into(),
            );
        }
        if doc.detection.fallback.is_none() {
            return Err("generic rule must define fallback".into());
        }
    } else {
        let Some(match_rule) = &doc.match_rule else {
            return Err("match is required".into());
        };
        if match_rule.registrable_domain != doc.id {
            return Err(format!(
                "match.registrableDomain `{}` must equal id `{}`",
                match_rule.registrable_domain, doc.id
            ));
        }
        for host in &match_rule.hosts {
            if !is_host(host) {
                return Err(format!("match.hosts entry `{host}` is not a valid host"));
            }
            if !same_registrable_domain(host, &doc.id) {
                return Err(format!(
                    "match.hosts entry `{host}` must share registrable domain `{}`",
                    doc.id
                ));
            }
        }
        if doc.detection.login_check.is_none() && doc.detection.fallback.is_none() {
            return Err("detection must define loginCheck and/or fallback".into());
        }
    }
    if let Some(check) = &doc.detection.login_check {
        validate_login_check(&doc.id, check)?;
    }
    if let Some(fallback) = &doc.detection.fallback {
        for (side, conditions) in [
            ("loggedIn", &fallback.logged_in),
            ("loggedOut", &fallback.logged_out),
        ] {
            for condition in conditions {
                if condition.value.trim().is_empty() || condition.value.len() > 200 {
                    return Err(format!(
                        "fallback.{side} condition value must be 1-200 chars"
                    ));
                }
                if condition.presence == RulePresence::Absent
                    && condition.kind != RuleConditionKind::Text
                {
                    return Err(format!(
                        "fallback.{side}: presence=absent is only valid for kind=text"
                    ));
                }
            }
        }
    }
    Ok(())
}

// ═══════════════════════════════════════════════
// bundled 内置集（离线兜底；随版本发布）
// ═══════════════════════════════════════════════

const BUNDLED_RULE_SOURCES: &[(&str, &str)] = &[
    ("generic", include_str!("ruledata/generic.json")),
    ("github.com", include_str!("ruledata/github.com.json")),
    ("trae.cn", include_str!("ruledata/trae.cn.json")),
];

fn parse_rule_doc(bytes: &[u8]) -> Result<LoginRuleDoc, String> {
    let doc: LoginRuleDoc =
        serde_json::from_slice(bytes).map_err(|e| format!("rule JSON invalid: {e}"))?;
    validate_rule_doc(&doc)?;
    Ok(doc)
}

fn bundled_rule_docs() -> Vec<LoginRuleDoc> {
    BUNDLED_RULE_SOURCES
        .iter()
        .filter_map(|(name, source)| match parse_rule_doc(source.as_bytes()) {
            Ok(doc) => Some(doc),
            Err(error) => {
                eprintln!("[login_rules] bundled rule {name} invalid, skipped: {error}");
                None
            }
        })
        .collect()
}

// ═══════════════════════════════════════════════
// 市场源与缓存
// ═══════════════════════════════════════════════

enum RulesSource {
    Url(String),
    Dir(PathBuf),
}

/// 市场源解析：DIR 优先（开发调试）→ URL env → 官方默认源。
fn rules_source() -> RulesSource {
    let dir = std::env::var(RULES_DIR_ENV).unwrap_or_default();
    if !dir.trim().is_empty() {
        return RulesSource::Dir(PathBuf::from(dir.trim()));
    }
    let url = std::env::var(RULES_URL_ENV).unwrap_or_default();
    let url = url.trim().to_string();
    if url.is_empty() {
        RulesSource::Url(OFFICIAL_RULES_URL.to_string())
    } else {
        RulesSource::Url(url)
    }
}

fn cache_dir<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    Some(app.path().app_data_dir().ok()?.join(CACHE_DIR_NAME))
}

fn meta_path(dir: &Path) -> PathBuf {
    dir.join("meta.json")
}

/// 缓存元信息（meta.json）。
#[derive(Debug, Clone, Default)]
pub(crate) struct CacheMeta {
    /// 最近一次成功拉取时间（unix 秒）。
    pub last_fetched: Option<u64>,
    /// 最近一次拉取的远程索引构建时间（ISO 8601，来自 rules.json 的 updatedAt）。
    pub index_updated_at: Option<String>,
}

fn read_meta(dir: &Path) -> CacheMeta {
    let Ok(body) = std::fs::read(meta_path(dir)) else {
        return CacheMeta::default();
    };
    let Ok(value) = serde_json::from_slice::<Value>(&body) else {
        return CacheMeta::default();
    };
    CacheMeta {
        last_fetched: value.get("lastFetched").and_then(Value::as_u64),
        index_updated_at: value
            .get("indexUpdatedAt")
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

fn last_fetched_secs(dir: &Path) -> Option<u64> {
    read_meta(dir).last_fetched
}

fn write_meta(dir: &Path, meta: &CacheMeta) {
    let body = serde_json::json!({
        "lastFetched": meta.last_fetched,
        "indexUpdatedAt": meta.index_updated_at,
    })
    .to_string();
    if let Err(error) = std::fs::write(meta_path(dir), body) {
        eprintln!("[login_rules] write meta failed: {error}");
    }
}

/// 读缓存目录中的规则文件（在 blocking 线程调用；损坏文件静默跳过）。
fn load_cached_docs(dir: Option<PathBuf>) -> Vec<LoginRuleDoc> {
    let Some(dir) = dir else {
        return Vec::new();
    };
    let rules_dir = dir.join("rules");
    let Ok(entries) = std::fs::read_dir(&rules_dir) else {
        return Vec::new();
    };
    let mut docs = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        match parse_rule_doc(&bytes) {
            Ok(doc) => docs.push(doc),
            Err(error) => eprintln!(
                "[login_rules] cached rule {} invalid, skipped: {error}",
                path.display()
            ),
        }
    }
    docs
}

/// 从本地调试目录直接加载（BENCH_LOGIN_RULES_DIR，不走缓存）。
fn load_dir_docs(dir: &Path) -> Vec<LoginRuleDoc> {
    load_cached_docs(Some(dir.to_path_buf()))
}

// ═══════════════════════════════════════════════
// 匹配与解析
// ═══════════════════════════════════════════════

/// 规则来源（供判定归因）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RuleSource {
    Bundled,
    Remote,
}

/// 命中的规则（doc + 来源）。
#[derive(Debug, Clone)]
pub struct ResolvedRule {
    pub doc: LoginRuleDoc,
    pub source: RuleSource,
    /// 精确 host 命中（specificity 高于可注册域）。
    pub exact_host: bool,
}

fn rule_matches_host(doc: &LoginRuleDoc, host: &str) -> Option<bool> {
    let Some(match_rule) = &doc.match_rule else {
        // generic 兜底规则（match 省略）：对所有 host 生效，specificity 最低。
        return (doc.id == GENERIC_RULE_ID).then_some(false);
    };
    if match_rule.hosts.iter().any(|h| h == host) {
        return Some(true);
    }
    same_registrable_domain(host, &doc.id).then_some(false)
}

/// 解析站点 URL 命中的规则。
///
/// 优先级（spec §6）：精确 host > 可注册域；同 specificity 内远程缓存 > bundled，
/// 同 id 时取版本更高者。同时检查缓存 TTL，过期则后台惰性刷新（不阻塞当前判定）。
pub async fn resolve<R: Runtime>(app: &AppHandle<R>, website: &str) -> Option<ResolvedRule> {
    let host = url::Url::parse(website)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))?;
    let host = host.to_ascii_lowercase();
    if host.is_empty() {
        return None;
    }

    let source = rules_source();
    let dir = cache_dir(app);
    let remote_docs = match &source {
        RulesSource::Dir(dir) => {
            let dir = dir.clone();
            tokio::task::spawn_blocking(move || load_dir_docs(&dir))
                .await
                .unwrap_or_default()
        }
        RulesSource::Url(_) => {
            // URL 模式：读缓存；TTL 过期 → 后台刷新（single-flight，不阻塞判定）。
            let cached = tokio::task::spawn_blocking({
                let dir = dir.clone();
                move || load_cached_docs(dir)
            })
            .await
            .unwrap_or_default();
            let expired = dir
                .as_deref()
                .and_then(last_fetched_secs)
                .is_none_or(|fetched| {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    now.saturating_sub(fetched) > REFRESH_INTERVAL_SECS
                });
            if expired {
                spawn_background_refresh(app.clone());
            }
            cached
        }
    };

    // 候选收集：remote > bundled；同 id 取版本高者。
    let mut candidates: Vec<ResolvedRule> = Vec::new();
    for doc in &remote_docs {
        if let Some(exact) = rule_matches_host(doc, &host) {
            candidates.push(ResolvedRule {
                doc: doc.clone(),
                source: RuleSource::Remote,
                exact_host: exact,
            });
        }
    }
    for doc in bundled_rule_docs() {
        if let Some(exact) = rule_matches_host(&doc, &host) {
            candidates.push(ResolvedRule {
                doc,
                source: RuleSource::Bundled,
                exact_host: exact,
            });
        }
    }

    pick_best(candidates)
}

/// 候选中选出最优规则。优先级（spec §6 扩展）：站点特殊规则 > generic 兜底 >
/// 精确 host > 同 id 版本高者 > 远程 > bundled。
fn pick_best(candidates: Vec<ResolvedRule>) -> Option<ResolvedRule> {
    candidates
        .into_iter()
        .fold(None::<ResolvedRule>, |best, cand| {
            let take = match &best {
                None => true,
                Some(current) => {
                    let cand_generic = cand.doc.id == GENERIC_RULE_ID;
                    let cur_generic = current.doc.id == GENERIC_RULE_ID;
                    if cand_generic != cur_generic {
                        !cand_generic
                    } else if cand.exact_host != current.exact_host {
                        cand.exact_host
                    } else if cand.doc.id == current.doc.id {
                        if cand.doc.version != current.doc.version {
                            version_gt(&cand.doc.version, &current.doc.version)
                        } else {
                            // 同版本平局：remote 优先（与候选顺序无关，确定性结果）。
                            matches!(cand.source, RuleSource::Remote)
                        }
                    } else {
                        matches!(cand.source, RuleSource::Remote)
                    }
                }
            };
            if take {
                Some(cand)
            } else {
                best
            }
        })
}

// ═══════════════════════════════════════════════
// 概览（更新登录逻辑弹窗）与按需更新
// ═══════════════════════════════════════════════

/// 单条规则的概要（IPC 响应；前端据此渲染「当前使用的判断逻辑」详情）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRuleSummary {
    pub id: String,
    pub version: String,
    pub title: String,
    pub description: String,
    /// bundled | remote
    pub source: RuleSource,
    /// 是否含 S1 服务端权威探针（强判据）。
    pub has_login_check: bool,
    pub login_check_url: Option<String>,
    pub login_check_method: Option<String>,
    /// 文本弱证据（loggedIn 侧 text 条件值）。
    pub logged_in_texts: Vec<String>,
    /// 文本弱证据（loggedOut 侧 text 条件值）。
    pub logged_out_texts: Vec<String>,
}

/// 远程索引中某条规则相对本地的可更新状态。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRuleRemoteEntry {
    pub id: String,
    pub version: String,
    /// 远程版本 > 本地生效版本（可升级；本地缺失视为可新装）。
    pub updatable: bool,
}

/// 远程检查结果（None = 检查失败或无远程源）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRulesRemoteStatus {
    /// 本次检查时间（ISO 8601 UTC）。
    pub checked_at: String,
    /// 远程索引构建时间（rules.json updatedAt）。
    pub index_updated_at: Option<String>,
    pub generic: Option<LoginRuleRemoteEntry>,
    pub site: Option<LoginRuleRemoteEntry>,
    pub generic_updatable: bool,
    pub site_updatable: bool,
}

/// get_login_rules_overview 响应。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRulesOverview {
    /// 当前生效的 generic 兜底规则（bundled 保底，恒存在）。
    pub generic: Option<LoginRuleSummary>,
    /// 当前站点命中的特殊规则（无则 None，判定走 generic）。
    pub site: Option<LoginRuleSummary>,
    /// 远程检查结果（None 时看 remote_error）。
    pub remote: Option<LoginRulesRemoteStatus>,
    pub remote_error: Option<String>,
    /// 缓存最近一次成功拉取时间（unix 秒；bundled/从未拉取为 None）。
    pub last_fetched_at: Option<u64>,
}

/// update_login_rules 更新范围。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LoginRulesUpdateScope {
    /// 拉取索引中的全部规则。
    All,
    /// 仅 generic 兜底规则。
    Generic,
    /// 仅当前站点命中的特殊规则（需 website）。
    Site,
}

/// update_login_rules 结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRulesUpdateReport {
    /// 实际写入缓存的规则 id。
    pub updated: Vec<String>,
    /// 因「已最新/防降级」跳过的规则 id。
    pub skipped: Vec<String>,
    /// 本次拉取的远程索引构建时间（ISO 8601）。
    pub index_updated_at: Option<String>,
}

fn summarize(doc: &LoginRuleDoc, source: RuleSource) -> LoginRuleSummary {
    let text_values = |side: &Vec<RuleCondition>| -> Vec<String> {
        side.iter()
            .filter(|c| c.kind == RuleConditionKind::Text)
            .map(|c| c.value.clone())
            .collect()
    };
    let (logged_in_texts, logged_out_texts) = doc
        .detection
        .fallback
        .as_ref()
        .map(|f| (text_values(&f.logged_in), text_values(&f.logged_out)))
        .unwrap_or_default();
    LoginRuleSummary {
        id: doc.id.clone(),
        version: doc.version.clone(),
        title: doc.title.clone(),
        description: doc.description.clone(),
        source,
        has_login_check: doc.detection.login_check.is_some(),
        login_check_url: doc.detection.login_check.as_ref().map(|c| c.url.clone()),
        login_check_method: doc.detection.login_check.as_ref().map(|c| c.method.clone()),
        logged_in_texts,
        logged_out_texts,
    }
}

/// 概览：当前生效的 generic / 站点规则详情 + 远程可更新状态（驱动弹窗按钮可用态）。
/// 不触发后台刷新（弹窗主动检查即可，避免与 resolve 的惰性刷新叠加）。
pub async fn overview<R: Runtime>(app: &AppHandle<R>, website: &str) -> LoginRulesOverview {
    let source = rules_source();
    let dir = cache_dir(app);

    // 本地规则池（URL 模式读缓存；DIR 模式读调试目录）：remote > bundled。
    let cached: Vec<LoginRuleDoc> = match (&source, &dir) {
        (RulesSource::Dir(dir), _) => {
            let dir = dir.clone();
            tokio::task::spawn_blocking(move || load_dir_docs(&dir))
                .await
                .unwrap_or_default()
        }
        (_, Some(dir)) => {
            let dir = dir.clone();
            tokio::task::spawn_blocking(move || load_cached_docs(Some(dir)))
                .await
                .unwrap_or_default()
        }
        (_, None) => Vec::new(),
    };
    let pool: Vec<(LoginRuleDoc, RuleSource)> = cached
        .iter()
        .cloned()
        .map(|doc| (doc, RuleSource::Remote))
        .chain(
            bundled_rule_docs()
                .into_iter()
                .map(|doc| (doc, RuleSource::Bundled)),
        )
        .collect();

    // generic 生效规则：remote/bundled 中同 id 版本高者（版本相同取 remote）。
    let generic = pool
        .iter()
        .filter(|(doc, _)| doc.id == GENERIC_RULE_ID)
        .fold(
            None::<&(LoginRuleDoc, RuleSource)>,
            |best, item| match best {
                None => Some(item),
                Some((current, _)) => {
                    if version_gt(&item.0.version, &current.version) {
                        Some(item)
                    } else {
                        best
                    }
                }
            },
        )
        .map(|(doc, source)| summarize(doc, *source));

    // 站点特殊规则：与 resolve 相同的候选收集，排除 generic。
    let host = url::Url::parse(website)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .map(|h| h.to_ascii_lowercase())
        .filter(|h| !h.is_empty());
    let site = host.as_deref().and_then(|host| {
        let candidates: Vec<ResolvedRule> = pool
            .iter()
            .filter(|(doc, _)| doc.id != GENERIC_RULE_ID)
            .filter_map(|(doc, source)| {
                rule_matches_host(doc, host).map(|exact| ResolvedRule {
                    doc: doc.clone(),
                    source: *source,
                    exact_host: exact,
                })
            })
            .collect();
        pick_best(candidates).map(|resolved| summarize(&resolved.doc, resolved.source))
    });

    let meta = dir.as_deref().map(read_meta).unwrap_or_default();

    // 远程检查（DIR 调试模式无远程源）。
    let (remote, remote_error) = match &source {
        RulesSource::Dir(_) => (None, None),
        RulesSource::Url(index_url) => match fetch_index(index_url).await {
            Ok((index, _)) => {
                let local_version = |id: &str| -> &str {
                    match id {
                        GENERIC_RULE_ID => generic
                            .as_ref()
                            .map(|g| g.version.as_str())
                            .unwrap_or("0.0.0"),
                        _ => site.as_ref().map(|s| s.version.as_str()).unwrap_or("0.0.0"),
                    }
                };
                let remote_entry = |id: &str| -> Option<LoginRuleRemoteEntry> {
                    index.rules.iter().find(|e| e.id == id).map(|e| {
                        let updatable = version_gt(&e.version, local_version(id));
                        LoginRuleRemoteEntry {
                            id: e.id.clone(),
                            version: e.version.clone(),
                            updatable,
                        }
                    })
                };
                // 站点条目：索引中 id 即可注册域（generic 除外），按 host 匹配。
                let site_entry = host.as_deref().and_then(|host| {
                    index
                        .rules
                        .iter()
                        .find(|e| e.id != GENERIC_RULE_ID && same_registrable_domain(host, &e.id))
                        .map(|e| {
                            let updatable = version_gt(&e.version, local_version(&e.id));
                            LoginRuleRemoteEntry {
                                id: e.id.clone(),
                                version: e.version.clone(),
                                updatable,
                            }
                        })
                });
                let generic_entry = remote_entry(GENERIC_RULE_ID);
                (
                    Some(LoginRulesRemoteStatus {
                        checked_at: chrono::Utc::now().to_rfc3339(),
                        index_updated_at: index.updated_at.clone(),
                        generic_updatable: generic_entry.as_ref().is_some_and(|e| e.updatable),
                        site_updatable: site_entry.as_ref().is_some_and(|e| e.updatable),
                        generic: generic_entry,
                        site: site_entry,
                    }),
                    None,
                )
            }
            Err(error) => (None, Some(error)),
        },
    };

    LoginRulesOverview {
        generic,
        site,
        remote,
        remote_error,
        last_fetched_at: meta.last_fetched,
    }
}

/// 按范围拉取远程规则并写入缓存（版本单调守卫；DIR 调试模式无远程源，空报告）。
pub async fn update_login_rules<R: Runtime>(
    app: &AppHandle<R>,
    scope: LoginRulesUpdateScope,
    website: Option<&str>,
) -> Result<LoginRulesUpdateReport, String> {
    let index_url = match rules_source() {
        RulesSource::Dir(_) => {
            return Ok(LoginRulesUpdateReport {
                updated: Vec::new(),
                skipped: Vec::new(),
                index_updated_at: None,
            });
        }
        RulesSource::Url(url) => url,
    };
    let (index, base) = fetch_index(&index_url).await?;

    // 目标条目筛选。
    let host = match scope {
        LoginRulesUpdateScope::Site => website
            .and_then(|w| url::Url::parse(w).ok())
            .and_then(|u| u.host_str().map(str::to_string))
            .map(|h| h.to_ascii_lowercase())
            .filter(|h| !h.is_empty())
            .ok_or_else(|| "site scope requires a valid website URL".to_string())?,
        _ => String::new(),
    };
    let mut validated: Vec<(LoginRuleEntry, Vec<u8>)> = Vec::new();
    for entry in &index.rules {
        let targeted = match scope {
            LoginRulesUpdateScope::All => true,
            LoginRulesUpdateScope::Generic => entry.id == GENERIC_RULE_ID,
            LoginRulesUpdateScope::Site => {
                entry.id != GENERIC_RULE_ID && same_registrable_domain(&host, &entry.id)
            }
        };
        if targeted {
            validated.push(fetch_validated_entry(&base, entry).await?);
        }
    }

    let (updated, skipped) =
        write_validated_to_cache(app, validated, index.updated_at.clone()).await?;
    Ok(LoginRulesUpdateReport {
        updated,
        skipped,
        index_updated_at: index.updated_at,
    })
}

// ═══════════════════════════════════════════════
// 后台拉取（URL 模式；失败静默沿用旧缓存）
// ═══════════════════════════════════════════════

/// 启动后台刷新（single-flight；仅 URL 模式生效）。
pub fn spawn_background_refresh<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        refresh_once(&app).await;
    });
}

async fn refresh_once<R: Runtime>(app: &AppHandle<R>) {
    let RulesSource::Url(index_url) = rules_source() else {
        return; // DIR 调试模式直读盘，无需缓存
    };
    if REFRESHING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let result = fetch_and_cache(app, &index_url).await;
    REFRESHING.store(false, Ordering::SeqCst);
    match result {
        Ok((written, _skipped)) if !written.is_empty() => {
            eprintln!("[login_rules] refreshed {} rule(s)", written.len());
        }
        Ok(_) => {}
        Err(error) => {
            eprintln!("[login_rules] refresh failed (cache retained): {error}");
        }
    }
}

/// 拉取远程索引并校验 schema（返回索引与其 base URL，用于拼接规则文件地址）。
async fn fetch_index(index_url: &str) -> Result<(LoginRulesIndex, String), String> {
    let index_bytes = fetch_bytes(index_url).await?;
    let index: LoginRulesIndex = serde_json::from_slice(&index_bytes)
        .map_err(|e| format!("rules index JSON invalid: {e}"))?;
    if index.schema_version != RULES_SCHEMA_VERSION {
        return Err(format!(
            "rules index schemaVersion {} not supported (host supports {})",
            index.schema_version, RULES_SCHEMA_VERSION
        ));
    }
    let base = index_url
        .trim_end_matches('/')
        .rsplit_once('/')
        .map(|(base, _)| base.to_string())
        .unwrap_or_else(|| index_url.to_string());
    Ok((index, base))
}

/// 拉取并校验单个规则条目：安全路径 + semver/sha256 + size + 文件 schema fail-closed，
/// 并交叉校验索引条目与文件内容一致（spec §4.3 第 6 条）。
async fn fetch_validated_entry(
    base: &str,
    entry: &LoginRuleEntry,
) -> Result<(LoginRuleEntry, Vec<u8>), String> {
    let file = &entry.file;
    if Path::new(file).is_absolute()
        || file.starts_with('/')
        || file.split('/').any(|seg| seg == ".." || seg.is_empty())
        || !file.starts_with("rules/")
        || file.as_str() != format!("rules/{}.json", entry.id)
    {
        return Err(format!(
            "rule `{}` file `{file}` is not a safe rules/ path",
            entry.id
        ));
    }
    if !is_semver(&entry.version) || !is_hex64(&entry.sha256) {
        return Err(format!(
            "rule `{}` entry has invalid version/sha256",
            entry.id
        ));
    }
    let file_bytes = fetch_bytes(&format!("{base}/{file}")).await?;
    if file_bytes.len() as u64 != entry.size {
        return Err(format!("rule `{}` size mismatch", entry.id));
    }
    let digest = sha256_hex(&file_bytes);
    if digest != entry.sha256 {
        return Err(format!("rule `{}` sha256 mismatch", entry.id));
    }
    let doc = parse_rule_doc(&file_bytes)?;
    if doc.id != entry.id || doc.version != entry.version {
        return Err(format!(
            "rule `{}` entry/file id or version mismatch",
            entry.id
        ));
    }
    Ok((entry.clone(), file_bytes))
}

/// 写盘（版本单调，spec §5：同 id 缓存版本 ≥ 远程版本时拒绝回写防降级）。
/// 返回（实际写入的 id，因已最新/防降级跳过的 id）。
fn write_docs_to_cache(
    dir: &Path,
    validated: &[(LoginRuleEntry, Vec<u8>)],
) -> Result<(Vec<String>, Vec<String>), String> {
    let rules_dir = dir.join("rules");
    std::fs::create_dir_all(&rules_dir).map_err(|e| format!("create cache dir: {e}"))?;
    let mut written = Vec::new();
    let mut skipped = Vec::new();
    for (entry, bytes) in validated {
        let path = rules_dir.join(format!("{}.json", entry.id));
        let cached_newer_or_equal = std::fs::read(&path)
            .ok()
            .and_then(|cached_bytes| parse_rule_doc(&cached_bytes).ok())
            .is_some_and(|cached| !version_gt(&entry.version, &cached.version));
        if cached_newer_or_equal {
            skipped.push(entry.id.clone());
            continue;
        }
        std::fs::write(&path, bytes).map_err(|e| format!("write {}: {e}", path.display()))?;
        written.push(entry.id.clone());
    }
    Ok((written, skipped))
}

/// 全量拉取 → 全部校验通过后写盘（损坏内容不落缓存）。
async fn fetch_and_cache<R: Runtime>(
    app: &AppHandle<R>,
    index_url: &str,
) -> Result<(Vec<String>, Vec<String>), String> {
    let (index, base) = fetch_index(index_url).await?;
    let mut validated: Vec<(LoginRuleEntry, Vec<u8>)> = Vec::new();
    for entry in &index.rules {
        validated.push(fetch_validated_entry(&base, entry).await?);
    }
    write_validated_to_cache(app, validated, index.updated_at.clone()).await
}

/// 校验通过的规则写缓存目录 + 更新 meta（lastFetched / indexUpdatedAt）。
async fn write_validated_to_cache<R: Runtime>(
    app: &AppHandle<R>,
    validated: Vec<(LoginRuleEntry, Vec<u8>)>,
    index_updated_at: Option<String>,
) -> Result<(Vec<String>, Vec<String>), String> {
    let dir = cache_dir(app).ok_or("app data dir unavailable")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let write_result =
        tokio::task::spawn_blocking(move || -> Result<(Vec<String>, Vec<String>), String> {
            let result = write_docs_to_cache(&dir, &validated)?;
            write_meta(
                &dir,
                &CacheMeta {
                    last_fetched: Some(now),
                    index_updated_at,
                },
            );
            Ok(result)
        })
        .await
        .map_err(|e| format!("cache write join: {e}"))?;
    write_result
}

async fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(FETCH_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("build http client: {e}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("fetch {url}: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("fetch {url}: HTTP {}", response.status()));
    }
    let content_length = response.content_length();
    if let Some(length) = content_length {
        if length > MAX_RULE_FILE_BYTES {
            return Err(format!("fetch {url}: body {length} exceeds limit"));
        }
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("read {url}: {e}"))?;
    if bytes.len() as u64 > MAX_RULE_FILE_BYTES {
        return Err(format!("fetch {url}: body exceeds limit"));
    }
    Ok(bytes.to_vec())
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::Digest;
    let digest = sha2::Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

// ═══════════════════════════════════════════════
// fallback 文本判定（弱证据；selector 条件仅在 WebView DOM 路径可用，
// 纯文本路径一律跳过 —— 弱证据宁可不定论）
// ═══════════════════════════════════════════════

fn text_conditions_hit(conditions: &[RuleCondition], page_text: &str) -> bool {
    conditions
        .iter()
        .filter(|c| c.kind == RuleConditionKind::Text)
        .any(|c| match c.presence {
            RulePresence::Present => page_text.contains(&c.value),
            RulePresence::Absent => !page_text.contains(&c.value),
        })
}

/// 弱证据判定（对齐 legacy `classify_confident` 语义）：有确定倾向才返回。
pub fn classify_fallback_text_confident(
    page_text: &str,
    rule: &LoginRuleDoc,
) -> Option<AccountSessionStatus> {
    let fallback = rule.detection.fallback.as_ref()?;
    if text_conditions_hit(&fallback.logged_out, page_text) {
        return Some(AccountSessionStatus::LoginRequired);
    }
    if text_conditions_hit(&fallback.logged_in, page_text) {
        return Some(AccountSessionStatus::Ready);
    }
    None
}

/// 弱证据判定（对齐 legacy `classify` 语义）：无倾向时返回 Expired。
pub fn classify_fallback_text(page_text: &str, rule: &LoginRuleDoc) -> AccountSessionStatus {
    classify_fallback_text_confident(page_text, rule).unwrap_or(AccountSessionStatus::Expired)
}

/// WebView 路径的 selector 条件（供 DOM 存在性检查；text 条件不在此列）。
pub fn selector_conditions(rule: &LoginRuleDoc, side: FallbackSide) -> Vec<&str> {
    let Some(fallback) = rule.detection.fallback.as_ref() else {
        return Vec::new();
    };
    let conditions = match side {
        FallbackSide::LoggedIn => &fallback.logged_in,
        FallbackSide::LoggedOut => &fallback.logged_out,
    };
    conditions
        .iter()
        .filter(|c| c.kind == RuleConditionKind::Selector && c.presence == RulePresence::Present)
        .map(|c| c.value.as_str())
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FallbackSide {
    LoggedIn,
    LoggedOut,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn doc_from_json(body: &str) -> LoginRuleDoc {
        parse_rule_doc(body.as_bytes()).expect("valid rule doc")
    }

    /// 仅解析不校验（供「validate 应拒绝」类测试使用）。
    fn doc_unchecked(body: &str) -> LoginRuleDoc {
        serde_json::from_str(body).expect("parseable rule doc")
    }

    #[test]
    fn bundled_rules_parse_and_validate() {
        assert!(!bundled_rule_docs().is_empty(), "bundled rules must load");
    }

    #[test]
    fn host_helpers() {
        assert!(is_host("trae.cn"));
        assert!(is_host("api.trae.cn"));
        assert!(is_host("github.com"));
        assert!(!is_host("trae"));
        assert!(!is_host("TRAE.cn"));
        assert!(!is_host("-trae.cn"));
        assert!(same_registrable_domain("www.trae.cn", "trae.cn"));
        assert!(same_registrable_domain("trae.cn", "trae.cn"));
        assert!(!same_registrable_domain("eviltrae.cn", "trae.cn"));
        assert!(!same_registrable_domain("trae.cn.evil.com", "trae.cn"));
    }

    #[test]
    fn rejects_cross_domain_login_check() {
        let doc = doc_unchecked(
            r#"{
                "schemaVersion": 1,
                "id": "trae.cn",
                "version": "1.0.0",
                "title": "t",
                "match": { "registrableDomain": "trae.cn" },
                "detection": {
                    "loginCheck": {
                        "url": "https://evil.com/steal",
                        "method": "GET",
                        "expect": { "kind": "status", "loggedIn": [200], "loggedOut": [401] }
                    }
                }
            }"#,
        );
        let error = validate_rule_doc(&doc).unwrap_err();
        assert!(error.contains("share registrable domain"), "{error}");
    }

    #[test]
    fn rejects_non_https_and_bad_method() {
        let mut doc = doc_from_json(BUNDLED_RULE_SOURCES[1].1);
        doc.detection.login_check.as_mut().unwrap().url =
            "http://api.trae.cn/cloudide/api/v3/trae/CheckLogin".into();
        assert!(validate_rule_doc(&doc).unwrap_err().contains("https"));

        doc.detection.login_check.as_mut().unwrap().method = "DELETE".into();
        assert!(validate_rule_doc(&doc).unwrap_err().contains("method"));
    }

    #[test]
    fn rejects_id_domain_mismatch_and_bad_expect() {
        let body = r#"{
            "schemaVersion": 1,
            "id": "trae.cn",
            "version": "1.0.0",
            "title": "t",
            "match": { "registrableDomain": "evil.cn" },
            "detection": {
                "fallback": { "loggedOut": [{ "kind": "text", "value": "登录" }] }
            }
        }"#;
        let doc = doc_unchecked(body);
        assert!(validate_rule_doc(&doc)
            .unwrap_err()
            .contains("must equal id"));

        let body = r#"{
            "schemaVersion": 1,
            "id": "trae.cn",
            "version": "1.0.0",
            "title": "t",
            "match": { "registrableDomain": "trae.cn" },
            "detection": {
                "loginCheck": {
                    "url": "https://api.trae.cn/x",
                    "method": "GET",
                    "expect": { "kind": "status", "loggedIn": [99999], "loggedOut": [401] }
                }
            }
        }"#;
        let doc = doc_unchecked(body);
        assert!(validate_rule_doc(&doc).unwrap_err().contains("100-599"));
    }

    #[test]
    fn rejects_unknown_fields() {
        let body = r#"{
            "schemaVersion": 1,
            "id": "trae.cn",
            "version": "1.0.0",
            "title": "t",
            "hacker": true,
            "match": { "registrableDomain": "trae.cn" },
            "detection": {
                "fallback": { "loggedOut": [{ "kind": "text", "value": "登录" }] }
            }
        }"#;
        let parsed: Result<LoginRuleDoc, _> = serde_json::from_str(body);
        assert!(parsed.is_err(), "unknown fields must be denied");
    }

    #[test]
    fn version_comparison() {
        assert!(version_gt("1.1.0", "1.0.9"));
        assert!(version_gt("1.10.0", "1.2.0"));
        assert!(!version_gt("1.0.0", "1.0.0"));
        assert!(!version_gt("0.9.9", "1.0.0"));
    }

    #[test]
    fn fallback_text_classification() {
        let rule = doc_from_json(
            r#"{
                "schemaVersion": 1,
                "id": "example.com",
                "version": "1.0.0",
                "title": "t",
                "match": { "registrableDomain": "example.com" },
                "detection": {
                    "fallback": {
                        "loggedIn": [{ "kind": "text", "value": "Sign out" }],
                        "loggedOut": [
                            { "kind": "selector", "value": "a[href^='/login']" },
                            { "kind": "text", "value": "Sign up" }
                        ]
                    }
                }
            }"#,
        );
        // selector 在纯文本路径不参与判定。
        assert_eq!(classify_fallback_text_confident("hello world", &rule), None);
        assert_eq!(
            classify_fallback_text_confident("welcome, Sign out here", &rule),
            Some(AccountSessionStatus::Ready)
        );
        assert_eq!(
            classify_fallback_text_confident("please Sign up now", &rule),
            Some(AccountSessionStatus::LoginRequired)
        );
        assert_eq!(
            classify_fallback_text("nothing", &rule),
            AccountSessionStatus::Expired
        );
    }

    #[test]
    fn json_bool_path_extraction() {
        let value = json!({ "Result": { "IsLogin": true, "list": [false, true] } });
        assert_eq!(json_bool_path(&value, "Result.IsLogin"), Some(true));
        assert_eq!(json_bool_path(&value, "Result.list.1"), Some(true));
        assert_eq!(json_bool_path(&value, "Result.Missing"), None);
        assert_eq!(json_bool_path(&value, ""), None);
    }

    #[test]
    fn generic_rule_valid_and_matches_all_hosts() {
        let doc = doc_from_json(BUNDLED_RULE_SOURCES[0].1);
        assert_eq!(doc.id, GENERIC_RULE_ID);
        assert!(doc.match_rule.is_none(), "generic must omit match");
        assert!(
            doc.detection.login_check.is_none(),
            "generic bans loginCheck"
        );
        // generic 对任意 host 都生效（specificity 最低）。
        assert_eq!(rule_matches_host(&doc, "anything.example.com"), Some(false));
        assert_eq!(rule_matches_host(&doc, "trae.cn"), Some(false));
    }

    #[test]
    fn rejects_generic_with_match_or_login_check() {
        // generic + match → 拒绝。
        let body = r#"{
            "schemaVersion": 1,
            "id": "generic",
            "version": "1.0.0",
            "title": "t",
            "match": { "registrableDomain": "generic" },
            "detection": { "fallback": { "loggedOut": [{ "kind": "text", "value": "登录" }] } }
        }"#;
        let doc = doc_unchecked(body);
        assert!(validate_rule_doc(&doc)
            .unwrap_err()
            .contains("must not define match"));

        // generic + loginCheck → 拒绝。
        let body = r#"{
            "schemaVersion": 1,
            "id": "generic",
            "version": "1.0.0",
            "title": "t",
            "detection": {
                "loginCheck": {
                    "url": "https://api.trae.cn/x",
                    "method": "GET",
                    "expect": { "kind": "status", "loggedIn": [200], "loggedOut": [401] }
                }
            }
        }"#;
        let doc = doc_unchecked(body);
        assert!(validate_rule_doc(&doc)
            .unwrap_err()
            .contains("must not define loginCheck"));

        // generic 无 fallback → 拒绝（detection 只允许 loginCheck，而 loginCheck 又被禁）。
        let body = r#"{
            "schemaVersion": 1,
            "id": "generic",
            "version": "1.0.0",
            "title": "t",
            "detection": {}
        }"#;
        let doc = doc_unchecked(body);
        assert!(validate_rule_doc(&doc)
            .unwrap_err()
            .contains("must define fallback"));
    }

    #[test]
    fn rejects_non_generic_without_match() {
        let body = r#"{
            "schemaVersion": 1,
            "id": "example.com",
            "version": "1.0.0",
            "title": "t",
            "detection": { "fallback": { "loggedOut": [{ "kind": "text", "value": "登录" }] } }
        }"#;
        let doc = doc_unchecked(body);
        assert!(validate_rule_doc(&doc)
            .unwrap_err()
            .contains("match is required"));
    }

    fn fallback_only_doc(id: &str, version: &str) -> LoginRuleDoc {
        serde_json::from_value(json!({
            "schemaVersion": 1,
            "id": id,
            "version": version,
            "title": "t",
            "match": if id == GENERIC_RULE_ID { None } else { Some(json!({ "registrableDomain": id })) },
            "detection": { "fallback": { "loggedOut": [{ "kind": "text", "value": "登录" }] } }
        }))
        .expect("valid fallback doc")
    }

    #[test]
    fn pick_best_prefers_special_over_generic() {
        // 特殊规则（bundled）> generic（remote）：来源不改变 special > generic。
        let special = ResolvedRule {
            doc: fallback_only_doc("example.com", "1.0.0"),
            source: RuleSource::Bundled,
            exact_host: false,
        };
        let generic = ResolvedRule {
            doc: fallback_only_doc(GENERIC_RULE_ID, "9.9.9"),
            source: RuleSource::Remote,
            exact_host: false,
        };
        let best = pick_best(vec![generic.clone(), special.clone()]).expect("best");
        assert_eq!(best.doc.id, "example.com");
        // 顺序无关。
        let best = pick_best(vec![special, generic]).expect("best");
        assert_eq!(best.doc.id, "example.com");
    }

    #[test]
    fn pick_best_generic_only_takes_higher_version_then_remote() {
        let bundled_old = ResolvedRule {
            doc: fallback_only_doc(GENERIC_RULE_ID, "1.0.0"),
            source: RuleSource::Bundled,
            exact_host: false,
        };
        let remote_new = ResolvedRule {
            doc: fallback_only_doc(GENERIC_RULE_ID, "1.1.0"),
            source: RuleSource::Remote,
            exact_host: false,
        };
        assert_eq!(
            pick_best(vec![bundled_old.clone(), remote_new.clone()])
                .expect("best")
                .source,
            RuleSource::Remote
        );
        // 版本相同：remote 优先。
        let remote_same = ResolvedRule {
            doc: fallback_only_doc(GENERIC_RULE_ID, "1.0.0"),
            source: RuleSource::Remote,
            exact_host: false,
        };
        assert_eq!(
            pick_best(vec![bundled_old, remote_same])
                .expect("best")
                .source,
            RuleSource::Remote
        );
    }
}
