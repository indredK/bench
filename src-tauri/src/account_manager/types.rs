use std::collections::HashMap;

use serde::{Deserialize, Deserializer, Serialize};

use super::crypto::EncryptedBlob;

/// 兼容历史格式中的 `null` 字段：反序列化为缺省默认值（1.23.0 及更早把无规则/无配置序列化为
/// `null`，`#[serde(default)]` 只对缺失生效、对 `null` 报错，故此处把 `null` 折叠为默认值）。
fn deserialize_null_as_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de> + Default,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

// ═══════════════════════════════════════════════
// Session Manager — 新增类型
// ═══════════════════════════════════════════════

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum AccountType {
    #[default]
    Persistent,
    Ephemeral,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum AccountSessionStatus {
    Ready,
    LoginRequired,
    Expired,
    FetchFailed,
    #[default]
    Inactive,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CookieEntry {
    pub name: String,
    pub value: String,
    pub domain: String,
    /// True when the original cookie omitted Domain and was scoped to the capture host.
    #[serde(default)]
    pub host_only: bool,
    pub path: String,
    pub http_only: bool,
    pub secure: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub same_site: Option<String>,
    #[serde(default)]
    pub partitioned: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at_ts: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsrfTokenEntry {
    pub extraction_method: String,
    pub token_name: String,
    pub token_value: String,
}

/// 会话来源端点（互通 I0）。
///
/// 账号会话可以从多个端点写入 canonical store：Bench 内部 WebView 的登录窗口、
/// 会话保活的后台刷新、外部 App 登录代理，以及本方案新增的浏览器端点（CDP 托管
/// profile / bench-companion 扩展）。该字段用于审计与冲突诊断，**不携带任何凭据**：
/// 只记录「哪类端点、由什么动作写入」，不含 cookie 值、URL query 或账号明文。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum SessionOrigin {
    /// 来源未知（1.32.0 及更早写入的会话，或旧数据迁移）。
    #[default]
    Unknown,
    /// 用户在 Bench 隔离登录窗口中完成登录后捕获。
    WebviewLogin,
    /// 会话保活（Session Keeper）静默刷新后重新捕获。
    WebviewKeeper,
    /// 外部 App 登录代理（`bench-auth://` / loopback 回调）完成后捕获。
    AuthProxy,
    /// 通过 CDP 从 Bench 托管的浏览器 profile 回采（互通 I2）。
    BrowserCdp,
    /// 通过 bench-companion 扩展从用户日常浏览器回采（互通 I3）。
    BrowserExtension,
    /// 由导入（sanitized / encrypted 导出文件）写入。
    Import,
}

impl SessionOrigin {
    /// 日志 / 审计用稳定字符串（非本地化，前端自行映射 i18n）。
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Unknown => "unknown",
            Self::WebviewLogin => "webviewLogin",
            Self::WebviewKeeper => "webviewKeeper",
            Self::AuthProxy => "authProxy",
            Self::BrowserCdp => "browserCdp",
            Self::BrowserExtension => "browserExtension",
            Self::Import => "import",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccountSession {
    pub cookies: Vec<CookieEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub indexeddb_snapshot: Option<EncryptedBlob>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub csrf_token: Option<CsrfTokenEntry>,
    pub captured_at: String,
    /// UTC Unix 秒。用于 TTL 计算,避免 `captured_at` 字符串按本地时区解析的歧义。
    /// 旧 session 无此字段时回退到 `captured_at` 字符串解析。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub captured_at_ts: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_hint: Option<String>,
    pub user_agent: String,
    /// v2.0 per-origin 存储（参考 Playwright storageState）。
    /// 恢复时精确按 origin 注入,避免跨 origin 污染。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub origins: Vec<OriginStorage>,
    /// 会话来源端点（互通 I0）。旧数据缺失时回退 `Unknown`，不影响读写。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_origin: Option<SessionOrigin>,
    /// 来源端点补充标识（浏览器 id 等），**不得包含凭据 / URL query / 账号明文**。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin_detail: Option<String>,
}

/// per-origin 存储。localStorage 和 sessionStorage 都按 origin 隔离。
/// 参考 Playwright storageState 的 origins 结构。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OriginStorage {
    /// 例如 "https://example.com" 或 "https://app.example.com"
    pub origin: String,
    /// 该 origin 下的 localStorage 键值对(加密)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_storage: Option<EncryptedBlob>,
    /// 该 origin 下的 sessionStorage 键值对(加密)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_storage: Option<EncryptedBlob>,
    /// 该 origin 下的 IndexedDB schema 与记录快照(加密)。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub indexed_db: Option<EncryptedBlob>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum TokenStorage {
    Cookie,
    LocalStorage,
    SessionStorage,
    IndexedDB,
    Multiple,
    #[default]
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsrfExtraction {
    pub source: String,
    pub name: String,
    pub header_name: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum AuthType {
    #[default]
    SessionCookie,
    BearerOAuth,
    Saml,
    OpenIdConnect,
    WebSocket,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum FingerprintingLevel {
    #[default]
    None,
    Basic,
    Strict,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AntiBotProvider {
    Cloudflare,
    CloudflareTurnstile,
    Recaptcha,
    HCaptcha,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SsoProvider {
    AzureAd,
    Okta,
    Auth0,
    Custom(String),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ProbeStrategy {
    #[default]
    HttpFirst,
    HttpOnly,
    WebviewOnly,
    Hybrid,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ExclusivityMode {
    #[default]
    Coexisting,
    Exclusive,
    Rotating,
}

// ═══════════════════════════════════════════════
// Session Keeper — 会话保活计划 / 账号日志
// ═══════════════════════════════════════════════

/// 静默刷新计划模式:每隔 N 小时,或每天固定时刻(本地时区)。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RefreshScheduleMode {
    /// 每隔 N 小时刷新一次。1..=8760。
    Interval { hours: u32 },
    /// 每天固定时刻刷新。minute_of_day 为 0..=1439(从午夜起的分钟数)。
    Daily { minute_of_day: u32 },
}

/// 每账号的会话保活计划。`enabled=false` 表示保留配置但暂停调度。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RefreshSchedule {
    pub enabled: bool,
    pub mode: RefreshScheduleMode,
}

impl RefreshSchedule {
    /// 校验计划参数合法性(hours 1..=8760;minute_of_day < 1440)。
    pub fn validate(&self) -> AccountManagerResult<()> {
        match &self.mode {
            RefreshScheduleMode::Interval { hours } => {
                if *hours == 0 || *hours > 8760 {
                    return Err(AccountManagerError::invalid_input(
                        "refresh interval hours must be within 1..=8760",
                    ));
                }
            }
            RefreshScheduleMode::Daily { minute_of_day } => {
                if *minute_of_day >= 1440 {
                    return Err(AccountManagerError::invalid_input(
                        "refresh daily minuteOfDay must be within 0..=1439",
                    ));
                }
            }
        }
        Ok(())
    }
}

/// 账号日志事件类型。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AccountLogKind {
    Login,
    ManualRefresh,
    AutoRefresh,
    ScheduleChanged,
    StatusChanged,
    /// 浏览器互通操作（同步到日常浏览器 / 隔离实例开关 / 回采 / 清档案）。
    BrowserInterop,
    /// 账号生命周期（创建 / 删除 / 凭据查看与复制等管理操作）。
    Lifecycle,
    /// 站点 / 外部应用等账号级配置变更。
    Config,
    Error,
}

/// 账号日志级别。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AccountLogLevel {
    Info,
    Success,
    Warn,
    Error,
}

/// 单条账号日志。detail 只允许枚举字符串/数值,禁止记录 URL 原文、
/// cookie、用户名、密码等敏感信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountLogEntry {
    pub id: String,
    /// 本地时间标签("%Y-%m-%d %H:%M"),供直接展示。
    pub at: String,
    /// UTC Unix 秒,供排序与格式化。
    pub at_ts: i64,
    pub kind: AccountLogKind,
    pub level: AccountLogLevel,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<serde_json::Value>,
}

/// `list_account_logs` 的返回:日志倒序列表 + 当前计划与下次执行时间。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountLogsResponse {
    /// 按 at_ts 倒序(最新在前)。
    pub entries: Vec<AccountLogEntry>,
    pub schedule: Option<RefreshSchedule>,
    pub next_refresh_at_ts: Option<i64>,
}

/// 快速登录 URL → 站点匹配的置信度:精确 host 或同一可注册域(父子域)。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StationUrlMatchConfidence {
    Exact,
    RegistrableDomain,
}

/// `match_stations_by_url` 的单条匹配结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StationUrlMatch {
    pub station_id: String,
    pub remark: String,
    pub website: String,
    pub account_count: usize,
    pub confidence: StationUrlMatchConfidence,
}

/// per-station 网络代理类型（HTTP / SOCKS5）。
/// 与 `proxy_enabled`（外部登录代理）语义无关，命名上区分。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum NetworkProxyType {
    #[default]
    Http,
    Socks5,
}

/// per-station 网络代理配置。`encrypted_password` 走 keyring-backed master key 加密。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProxyConfig {
    pub proxy_type: NetworkProxyType,
    pub host: String,
    pub port: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encrypted_password: Option<EncryptedBlob>,
}

/// Explicit password mutation for network proxy updates. Renderer code cannot
/// overload null to mean both "keep" and "clear".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum PasswordAction {
    #[default]
    Keep,
    Set {
        password: String,
    },
    Clear,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthProfile {
    pub cookie_based: bool,
    #[serde(default)]
    pub token_storage: TokenStorage,
    #[serde(default)]
    pub csrf_protection: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub csrf_extraction: Option<CsrfExtraction>,
    #[serde(default)]
    pub auth_type: AuthType,
    #[serde(default)]
    pub fingerprinting: FingerprintingLevel,
    #[serde(default)]
    pub anti_bot: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anti_bot_provider: Option<AntiBotProvider>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sso_provider: Option<SsoProvider>,
    #[serde(default)]
    pub probe_strategy: ProbeStrategy,
    pub detected_at: String,
    pub confidence: f32,
}

// ═══════════════════════════════════════════════
// 保留现有类型 (LoginMethod etc.)
// ═══════════════════════════════════════════════

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LoginMethod {
    EmailCode,
    UsernamePassword,
    LinkedLink,
    PhoneCode,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LoginDetectionMode {
    PresetLogout,
    PresetLogin,
    Custom,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LoginDetectionPresence {
    Present,
    Absent,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LoginDetectionRule {
    pub presence: LoginDetectionPresence,
    pub text: String,
}

impl Default for LoginDetectionRule {
    fn default() -> Self {
        Self {
            presence: LoginDetectionPresence::Present,
            text: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LoginDetectionConfig {
    pub mode: LoginDetectionMode,
    #[serde(default, deserialize_with = "deserialize_null_as_default")]
    pub logged_out_rule: LoginDetectionRule,
    #[serde(default, deserialize_with = "deserialize_null_as_default")]
    pub logged_in_rule: LoginDetectionRule,
}

impl Default for LoginDetectionConfig {
    fn default() -> Self {
        Self {
            mode: LoginDetectionMode::PresetLogout,
            logged_out_rule: LoginDetectionRule::default(),
            logged_in_rule: LoginDetectionRule::default(),
        }
    }
}

// ═══════════════════════════════════════════════
// 登录指纹（F2）— 站点级登录态特征（不含任何值）
// ═══════════════════════════════════════════════

/// 单条 cookie 特征：记录 name/domain/path/httpOnly 与**值的形态**（长度）。
/// **绝不记录值本身**；`value_len` 用于区分「长串密钥的登录态」与「短占位/空的未登录态」。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CookieFeature {
    pub name: String,
    pub domain: String,
    pub path: String,
    pub http_only: bool,
    /// 采样时该 cookie 值的字符数（形态特征）。0 = 旧数据未记录，不校验长度。
    #[serde(default)]
    pub value_len: usize,
}

/// 站点级登录指纹：登录态的确定性证据集合。
///
/// - `cookie_features`: 采样时页面域下的 cookie 特征（name/domain/path + 值长度）。
/// - `storage_keys`: localStorage/sessionStorage 中与登录态相关的键名
///   （token/auth/session/jwt/access/id_token/refresh 正则命中）。
/// - `storage_key_lens`: 上述键在采样时的值长度（形态特征）。
/// - `sampled_at`: 采样时刻（`%Y-%m-%d %H:%M`，本地）。
/// - `sampled_by_account`: 采样时处于登录态的账号 id（元信息，不进日志）。
///
/// 判定原则（probe L0 预检，两路只做「特征全缺失/形态不符」短路）：
/// - 特征缺失或值长度与采样形态不符（如短占位 cookie）→ 确定性未登录。
/// - 至少一项特征存在且值形态匹配（长串密钥）→ 判定已登录。
///
/// 安全边界：完整指纹（特征名 + 值长度）只存 Rust 侧 snapshot（`fingerprints` map，
/// 不入 RelayStation DTO）；IPC 只暴露 `LoginFingerprintInfo` 摘要。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginFingerprint {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cookie_features: Vec<CookieFeature>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub storage_keys: Vec<String>,
    /// storage 键对应的采样值长度（key → len）。旧数据无此字段时不校验长度。
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub storage_key_lens: HashMap<String, usize>,
    #[serde(default)]
    pub sampled_at: String,
    #[serde(default)]
    pub sampled_by_account: String,
}

impl LoginFingerprint {
    /// 无任何特征时无法参与判定。
    pub fn is_empty(&self) -> bool {
        self.cookie_features.is_empty() && self.storage_keys.is_empty()
    }
}

/// 指纹摘要（IPC DTO）：只含计数与采样时间，**不含任何特征名**。
/// 挂载在 `RelayStation.login_fingerprint`，供 UI 展示「已采样」状态。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginFingerprintInfo {
    pub sampled_at: String,
    #[serde(default)]
    pub sampled_by_account: String,
    #[serde(default)]
    pub cookie_count: usize,
    #[serde(default)]
    pub storage_key_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayStation {
    pub id: String,
    pub remark: String,
    pub website: String,
    pub created_at: String,
    #[serde(default)]
    pub login_detection: LoginDetectionConfig,
    // Session Manager 新增字段
    #[serde(default)]
    pub exclusivity_mode: ExclusivityMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_profile: Option<AuthProfile>,
    #[serde(default)]
    pub probe_failure_count: u32,
    /// Session 有效期（小时）。超过该时长后启动恢复时自动清理。
    /// F.6.2 默认 720h (30 天)。设为 0 视为永不过期。
    #[serde(default = "default_session_ttl_hours")]
    pub session_ttl_hours: u32,
    /// per-station 网络代理（HTTP / SOCKS5）。None 表示直连。
    /// 仅在 macOS 14+ WebView 上生效；其他平台必须显式返回 unsupported。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network_proxy: Option<NetworkProxyConfig>,
    /// 登录指纹摘要（F2，IPC DTO）：只含计数与采样时间，无特征名。
    /// 完整指纹存 `AccountManagerSnapshot.fingerprints`（按 station_id）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub login_fingerprint: Option<LoginFingerprintInfo>,
}

pub fn default_session_ttl_hours() -> u32 {
    720
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationAccount {
    pub id: String,
    pub station_id: String,
    pub username: String,
    pub notes: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tg_account: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linked_account: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invite_link: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub login_methods: Vec<LoginMethod>,
    pub status: AccountSessionStatus,
    pub last_login_at: Option<String>,
    pub last_refreshed_at: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub has_password: bool,
    // Session Manager 新增字段
    #[serde(default)]
    pub account_type: AccountType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,
    /// Schema <= 4 migration input only. New snapshots keep sessions exclusively
    /// in AccountManagerSnapshot.sessions and never serialize this field.
    #[serde(default, skip_serializing)]
    pub session: Option<EncryptedBlob>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exclusivity_group: Option<String>,
    /// 外部登录代理开关（Phase 0）
    #[serde(default)]
    pub proxy_enabled: bool,
    /// 已授权使用此账号的外部 App ID 列表（Phase 3）
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub external_app_ids: Vec<String>,
    /// Session Keeper — 会话保活计划(None = 未配置)。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_schedule: Option<RefreshSchedule>,
    /// Session Keeper — 下次静默刷新时刻(UTC Unix 秒)。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_refresh_at_ts: Option<i64>,
    /// 首次探测到登录成功(Ready)的时间。历史账号为 None,由后续刷新回填。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_login_at: Option<String>,
    /// 当前 status 的判定来源（F2/D1）。仅 L0 指纹短路时为
    /// `fingerprintMissing`，其余为 None。前端徽标据此显示来源 tooltip。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status_reason: Option<String>,
}

// ═══════════════════════════════════════════════
// 外部登录代理 — Phase 3 类型
// ═══════════════════════════════════════════════

/// 已授权的外部 App。首次使用 bench 登录的外部 App 需用户确认后注册。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalApp {
    pub id: String,
    pub name: String,
    /// 回调 URL scheme，如 "x-client"
    pub url_scheme: String,
    /// 允许的 return URL host 列表（allowlist）。空列表表示不限制 host。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub return_hosts: Vec<String>,
    pub first_used_at: String,
    pub last_used_at: String,
    #[serde(default)]
    pub use_count: u32,
}

/// 外部 App 与账号的绑定关系（一个外部 App 可绑定多个账号）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppBinding {
    pub id: String,
    pub app_id: String,
    pub account_id: String,
    pub first_used_at: String,
    pub last_used_at: String,
    #[serde(default)]
    pub use_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayAccountExport {
    pub username: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encrypted_password: Option<EncryptedBlob>,
    /// EncryptedFull 模式下导出的 session（含 cookies / IndexedDB / origins）。
    /// 导入时 decrypt + re-encrypt 到当前 keyring；key 不匹配时整个导入失败。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encrypted_session: Option<EncryptedBlob>,
    #[serde(default)]
    pub notes: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tg_account: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linked_account: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invite_link: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub login_methods: Vec<LoginMethod>,
    pub status: AccountSessionStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_login_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_refreshed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayStationExport {
    pub remark: String,
    pub website: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default)]
    pub login_detection: LoginDetectionConfig,
    #[serde(default)]
    pub accounts: Vec<RelayAccountExport>,
    /// 可选:导出文件携带的 session TTL(小时); 缺省时回退到 default_session_ttl_hours().
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_ttl_hours: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum RelayExportMode {
    #[default]
    Sanitized,
    EncryptedFull,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayDataExportFile {
    pub version: u32,
    pub exported_at: String,
    #[serde(default)]
    pub mode: RelayExportMode,
    pub stations: Vec<RelayStationExport>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayDataExportResult {
    pub station_count: usize,
    pub account_count: usize,
    pub mode: RelayExportMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayDataImportResult {
    pub station_count: usize,
    pub account_count: usize,
    pub stations: Vec<RelayStation>,
    pub accounts: Vec<StationAccount>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DeletionStatus {
    Complete,
    Partial,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DeletionResourceKind {
    WebviewData,
    Metadata,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DeletionResourceStatus {
    Succeeded,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeletionResourceResult {
    pub resource: DeletionResourceKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    pub status: DeletionResourceStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeletionReport {
    pub target_id: String,
    pub status: DeletionStatus,
    pub metadata_deleted: bool,
    pub removed_account_count: usize,
    pub resources: Vec<DeletionResourceResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshFailure {
    pub account_id: String,
    pub error: AccountManagerError,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshReport {
    pub total: usize,
    pub succeeded: Vec<StationAccount>,
    pub failed: Vec<RefreshFailure>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CapabilityStatus {
    #[allow(dead_code)]
    Supported,
    Partial,
    Unsupported,
    Failed,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountManagerCapability {
    pub status: CapabilityStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_code: Option<String>,
}

impl AccountManagerCapability {
    pub fn partial(reason_code: impl Into<String>) -> Self {
        Self {
            status: CapabilityStatus::Partial,
            reason_code: Some(reason_code.into()),
        }
    }

    pub fn unsupported(reason_code: impl Into<String>) -> Self {
        Self {
            status: CapabilityStatus::Unsupported,
            reason_code: Some(reason_code.into()),
        }
    }

    pub fn failed(reason_code: impl Into<String>) -> Self {
        Self {
            status: CapabilityStatus::Failed,
            reason_code: Some(reason_code.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountManagerCapabilities {
    pub platform: String,
    pub credential_store: AccountManagerCapability,
    pub isolated_webview: AccountManagerCapability,
    pub cookie_session: AccountManagerCapability,
    pub web_storage: AccountManagerCapability,
    pub indexed_db: AccountManagerCapability,
    pub network_proxy: AccountManagerCapability,
    pub deep_link: AccountManagerCapability,
    /// 互通 I1：把账号会话注入 Bench 托管的浏览器 profile（出向）。
    pub browser_session_open: AccountManagerCapability,
    /// 互通 I2：从 Bench 托管的浏览器 profile 回采会话（入向）。
    pub browser_session_capture: AccountManagerCapability,
    /// 互通 I3/I5：经浏览器扩展读写**用户日常浏览器**的会话。
    ///
    /// 与上面两项的关键差异：不依赖 Bench 启动浏览器、也不依赖 Chromium 系之外
    /// 的引擎判断，但要求用户已加载 `bench-companion` 扩展且本地桥就绪
    /// （后者由 `browser_ext_status.bridge_ready` 单独上报）。
    pub browser_session_extension: AccountManagerCapability,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "code", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AccountManagerError {
    NotFound { message: String },
    InvalidInput { message: String },
    StoreFail { message: String },
    KeyringUnavailable { message: String },
    CryptoFail { message: String },
    ClipboardFail { message: String },
}

impl AccountManagerError {
    pub fn not_found(what: impl Into<String>) -> Self {
        Self::NotFound {
            message: what.into(),
        }
    }
    pub fn invalid_input(msg: impl Into<String>) -> Self {
        Self::InvalidInput {
            message: msg.into(),
        }
    }
    pub fn store_fail(msg: impl Into<String>) -> Self {
        Self::StoreFail {
            message: msg.into(),
        }
    }
    pub fn keyring_unavailable(msg: impl Into<String>) -> Self {
        Self::KeyringUnavailable {
            message: msg.into(),
        }
    }
    pub fn crypto_fail(msg: impl Into<String>) -> Self {
        Self::CryptoFail {
            message: msg.into(),
        }
    }
    pub fn clipboard_fail(msg: impl Into<String>) -> Self {
        Self::ClipboardFail {
            message: msg.into(),
        }
    }

    /// 错误文案（不含 code）。
    ///
    /// 供**非 IPC 通道**使用：浏览器扩展本地桥只回 JSON
    /// `{ ok: false, error }`，没有 `AppResult` 的错误结构，故需要取纯文案。
    pub fn message(&self) -> String {
        match self {
            Self::NotFound { message }
            | Self::InvalidInput { message }
            | Self::StoreFail { message }
            | Self::KeyringUnavailable { message }
            | Self::CryptoFail { message }
            | Self::ClipboardFail { message } => message.clone(),
        }
    }
}

impl std::fmt::Display for AccountManagerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound { message } => write!(f, "not found: {message}"),
            Self::InvalidInput { message } => write!(f, "invalid input: {message}"),
            Self::StoreFail { message } => write!(f, "store failure: {message}"),
            Self::KeyringUnavailable { message } => write!(f, "keyring unavailable: {message}"),
            Self::CryptoFail { message } => write!(f, "crypto failure: {message}"),
            Self::ClipboardFail { message } => write!(f, "clipboard failure: {message}"),
        }
    }
}

impl std::error::Error for AccountManagerError {}

pub type AccountManagerResult<T> = Result<T, AccountManagerError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refresh_schedule_validation_accepts_legal_bounds() {
        assert!(RefreshSchedule {
            enabled: true,
            mode: RefreshScheduleMode::Interval { hours: 1 },
        }
        .validate()
        .is_ok());
        assert!(RefreshSchedule {
            enabled: true,
            mode: RefreshScheduleMode::Interval { hours: 8760 },
        }
        .validate()
        .is_ok());
        assert!(RefreshSchedule {
            enabled: true,
            mode: RefreshScheduleMode::Daily { minute_of_day: 0 },
        }
        .validate()
        .is_ok());
        assert!(RefreshSchedule {
            enabled: true,
            mode: RefreshScheduleMode::Daily {
                minute_of_day: 1439
            },
        }
        .validate()
        .is_ok());
    }

    #[test]
    fn refresh_schedule_validation_rejects_out_of_range_values() {
        let zero_hours = RefreshSchedule {
            enabled: true,
            mode: RefreshScheduleMode::Interval { hours: 0 },
        };
        let excessive_hours = RefreshSchedule {
            enabled: true,
            mode: RefreshScheduleMode::Interval { hours: 8761 },
        };
        let bad_minute = RefreshSchedule {
            enabled: true,
            mode: RefreshScheduleMode::Daily {
                minute_of_day: 1440,
            },
        };
        assert!(matches!(
            zero_hours.validate().unwrap_err(),
            AccountManagerError::InvalidInput { .. }
        ));
        assert!(matches!(
            excessive_hours.validate().unwrap_err(),
            AccountManagerError::InvalidInput { .. }
        ));
        assert!(matches!(
            bad_minute.validate().unwrap_err(),
            AccountManagerError::InvalidInput { .. }
        ));
    }
}
