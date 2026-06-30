use serde::{Deserialize, Serialize};

use super::crypto::EncryptedBlob;

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
    pub path: String,
    pub http_only: bool,
    pub secure: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub same_site: Option<String>,
    #[serde(default)]
    pub partitioned: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsrfTokenEntry {
    pub extraction_method: String,
    pub token_name: String,
    pub token_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccountSession {
    pub cookies: Vec<CookieEntry>,
    /// 扁平 localStorage（v1 兼容字段，新数据写入 origins）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_storage: Option<EncryptedBlob>,
    /// 扁平 sessionStorage（v1 兼容字段，新数据写入 origins）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_storage: Option<EncryptedBlob>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub indexeddb_snapshot: Option<EncryptedBlob>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub csrf_token: Option<CsrfTokenEntry>,
    pub captured_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_hint: Option<String>,
    pub user_agent: String,
    /// v2.0 per-origin 存储（参考 Playwright storageState）。
    /// 恢复时精确按 origin 注入,避免跨 origin 污染。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub origins: Vec<OriginStorage>,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProbeResult {
    Ready,
    LoginRequired,
    Expired,
    Uncertain,
    AntiBotBlocked,
    SsoChallenge,
    NetworkError(String),
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
    #[serde(default)]
    pub logged_out_rule: LoginDetectionRule,
    #[serde(default)]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<EncryptedBlob>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exclusivity_group: Option<String>,
    /// 外部登录代理开关（Phase 0）
    #[serde(default)]
    pub proxy_enabled: bool,
    /// 已授权使用此账号的外部 App ID 列表（Phase 3）
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub external_app_ids: Vec<String>,
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

#[derive(Debug, Serialize)]
#[serde(tag = "code", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ApiBillingError {
    NotFound { message: String },
    InvalidInput { message: String },
    StoreFail { message: String },
    KeyringUnavailable { message: String },
    CryptoFail { message: String },
    ClipboardFail { message: String },
}

impl ApiBillingError {
    pub fn not_found(what: impl Into<String>) -> Self {
        Self::NotFound { message: what.into() }
    }
    pub fn invalid_input(msg: impl Into<String>) -> Self {
        Self::InvalidInput { message: msg.into() }
    }
    pub fn store_fail(msg: impl Into<String>) -> Self {
        Self::StoreFail { message: msg.into() }
    }
    pub fn keyring_unavailable(msg: impl Into<String>) -> Self {
        Self::KeyringUnavailable { message: msg.into() }
    }
    pub fn crypto_fail(msg: impl Into<String>) -> Self {
        Self::CryptoFail { message: msg.into() }
    }
    pub fn clipboard_fail(msg: impl Into<String>) -> Self {
        Self::ClipboardFail { message: msg.into() }
    }
}

impl std::fmt::Display for ApiBillingError {
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

impl std::error::Error for ApiBillingError {}

pub type ApiBillingResult<T> = Result<T, ApiBillingError>;
