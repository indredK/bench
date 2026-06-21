use serde::{Deserialize, Serialize};

use super::crypto::EncryptedBlob;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AccountSessionStatus {
    Ready,
    LoginRequired,
    Expired,
    FetchFailed,
}

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
