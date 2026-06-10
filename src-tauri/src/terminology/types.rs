use std::fmt;

use serde::{Deserialize, Serialize};

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
    pub websites: Vec<TermWebsite>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermInput {
    pub industry_id: String,
    pub category_id: String,
    #[serde(default)]
    pub subcategory_id: Option<String>,
    pub title: String,
    pub description: String,
    pub websites: Vec<TermWebsite>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminologyBundle {
    pub industries: Vec<Industry>,
    pub terms: Vec<Term>,
    #[serde(default)]
    pub pinned_term_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "code", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TerminologyError {
    #[serde(rename_all = "camelCase")]
    NotFound { message: String },
    #[serde(rename_all = "camelCase")]
    InvalidInput { message: String },
    #[serde(rename_all = "camelCase")]
    DuplicateName { message: String },
    #[serde(rename_all = "camelCase")]
    StoreFail { message: String },
}

impl fmt::Display for TerminologyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TerminologyError::NotFound { message } => write!(f, "Not found: {}", message),
            TerminologyError::InvalidInput { message } => write!(f, "Invalid input: {}", message),
            TerminologyError::DuplicateName { message } => write!(f, "Duplicate name: {}", message),
            TerminologyError::StoreFail { message } => write!(f, "Store failure: {}", message),
        }
    }
}

pub type TerminologyResult<T> = Result<T, TerminologyError>;
