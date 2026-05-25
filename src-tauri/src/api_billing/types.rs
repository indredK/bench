use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AccountSessionStatus {
    Ready,
    LoginRequired,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayStation {
    pub id: String,
    pub remark: String,
    pub website: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub probe_url: Option<String>,
    pub created_at: String,
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
    #[serde(default)]
    pub notes: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tg_account: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linked_account: Option<String>,
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
    pub probe_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default)]
    pub accounts: Vec<RelayAccountExport>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayDataExportFile {
    pub version: u32,
    pub exported_at: String,
    pub stations: Vec<RelayStationExport>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayDataExportResult {
    pub station_count: usize,
    pub account_count: usize,
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
    WebviewFail { message: String },
    ProbeTimeout { message: String },
    ProbeNetwork { message: String, status: Option<u16> },
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
    pub fn webview_fail(msg: impl Into<String>) -> Self {
        Self::WebviewFail { message: msg.into() }
    }
    pub fn probe_timeout(msg: impl Into<String>) -> Self {
        Self::ProbeTimeout { message: msg.into() }
    }
    pub fn probe_network(msg: impl Into<String>, status: Option<u16>) -> Self {
        Self::ProbeNetwork { message: msg.into(), status }
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
            Self::WebviewFail { message } => write!(f, "webview failure: {message}"),
            Self::ProbeTimeout { message } => write!(f, "probe timeout: {message}"),
            Self::ProbeNetwork { message, status } => {
                if let Some(s) = status {
                    write!(f, "probe network error: {message} (status {s})")
                } else {
                    write!(f, "probe network error: {message}")
                }
            }
        }
    }
}

impl std::error::Error for ApiBillingError {}

pub type ApiBillingResult<T> = Result<T, ApiBillingError>;
