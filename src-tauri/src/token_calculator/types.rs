use std::fmt;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPricing {
    pub model_name: String,
    pub input_price: f64,
    /// Cached write price per 1M tokens (first time populating cache). None if not supported.
    pub cached_write_price: Option<f64>,
    /// Cached read / cache-hit price per 1M tokens (reading cached tokens). None if not supported.
    pub cached_read_price: Option<f64>,
    pub output_price: f64,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PricingStandard {
    pub id: String,
    pub name: String,
    pub is_built_in: bool,
    pub models: Vec<ModelPricing>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "code", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TokenCalculatorError {
    #[serde(rename_all = "camelCase")]
    NotFound { message: String },
    #[serde(rename_all = "camelCase")]
    InvalidInput { message: String },
    #[serde(rename_all = "camelCase")]
    DuplicateName { message: String },
    #[serde(rename_all = "camelCase")]
    BuiltInImmutable { message: String },
    #[serde(rename_all = "camelCase")]
    StoreFail { message: String },
}

impl fmt::Display for TokenCalculatorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TokenCalculatorError::NotFound { message } => write!(f, "Not found: {}", message),
            TokenCalculatorError::InvalidInput { message } => {
                write!(f, "Invalid input: {}", message)
            }
            TokenCalculatorError::DuplicateName { message } => {
                write!(f, "Duplicate name: {}", message)
            }
            TokenCalculatorError::BuiltInImmutable { message } => {
                write!(f, "Built-in immutable: {}", message)
            }
            TokenCalculatorError::StoreFail { message } => write!(f, "Store failure: {}", message),
        }
    }
}

pub type TokenCalculatorResult<T> = Result<T, TokenCalculatorError>;

/// Build the pre-defined built-in pricing standards.
pub fn builtin_standards() -> Vec<PricingStandard> {
    vec![
        PricingStandard {
            id: "builtin-openai".into(),
            name: "OpenAI Official".into(),
            is_built_in: true,
            models: vec![
                ModelPricing {
                    model_name: "gpt-5.5".into(),
                    input_price: 5.00,
                    cached_write_price: Some(5.00),
                    cached_read_price: Some(0.50),
                    output_price: 30.00,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "gpt-5.5-pro".into(),
                    input_price: 30.00,
                    cached_write_price: None,
                    cached_read_price: None,
                    output_price: 180.00,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "gpt-5.4".into(),
                    input_price: 2.50,
                    cached_write_price: Some(2.50),
                    cached_read_price: Some(0.25),
                    output_price: 15.00,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "gpt-5.4-mini".into(),
                    input_price: 0.75,
                    cached_write_price: Some(0.75),
                    cached_read_price: Some(0.075),
                    output_price: 4.50,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "gpt-5.4-nano".into(),
                    input_price: 0.20,
                    cached_write_price: Some(0.20),
                    cached_read_price: Some(0.02),
                    output_price: 1.25,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "o3".into(),
                    input_price: 2.00,
                    cached_write_price: None,
                    cached_read_price: None,
                    output_price: 8.00,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "o4-mini".into(),
                    input_price: 1.10,
                    cached_write_price: None,
                    cached_read_price: None,
                    output_price: 4.40,
                    currency: "USD".into(),
                },
            ],
            created_at: "2026-06-01T00:00:00Z".into(),
            updated_at: "2026-06-01T00:00:00Z".into(),
        },
        PricingStandard {
            id: "builtin-anthropic".into(),
            name: "Anthropic Official".into(),
            is_built_in: true,
            models: vec![
                ModelPricing {
                    model_name: "claude-opus-4.8".into(),
                    input_price: 5.00,
                    cached_write_price: Some(5.00),
                    cached_read_price: Some(0.50),
                    output_price: 25.00,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "claude-opus-4.7".into(),
                    input_price: 5.00,
                    cached_write_price: Some(5.00),
                    cached_read_price: Some(0.50),
                    output_price: 25.00,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "claude-sonnet-4.6".into(),
                    input_price: 3.00,
                    cached_write_price: Some(3.00),
                    cached_read_price: Some(0.30),
                    output_price: 15.00,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "claude-haiku-4.5".into(),
                    input_price: 1.00,
                    cached_write_price: Some(1.00),
                    cached_read_price: Some(0.10),
                    output_price: 5.00,
                    currency: "USD".into(),
                },
            ],
            created_at: "2026-06-01T00:00:00Z".into(),
            updated_at: "2026-06-01T00:00:00Z".into(),
        },
        PricingStandard {
            id: "builtin-google".into(),
            name: "Google Official".into(),
            is_built_in: true,
            models: vec![
                ModelPricing {
                    model_name: "gemini-2.5-pro".into(),
                    input_price: 1.25,
                    cached_write_price: Some(1.25),
                    cached_read_price: Some(0.125),
                    output_price: 10.00,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "gemini-2.5-flash".into(),
                    input_price: 0.30,
                    cached_write_price: Some(0.30),
                    cached_read_price: Some(0.03),
                    output_price: 2.50,
                    currency: "USD".into(),
                },
            ],
            created_at: "2026-06-01T00:00:00Z".into(),
            updated_at: "2026-06-01T00:00:00Z".into(),
        },
        PricingStandard {
            id: "builtin-deepseek".into(),
            name: "DeepSeek Official".into(),
            is_built_in: true,
            models: vec![
                ModelPricing {
                    model_name: "deepseek-v4-pro".into(),
                    input_price: 0.435,
                    cached_write_price: Some(0.435),
                    cached_read_price: Some(0.0435),
                    output_price: 0.87,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "deepseek-v4-flash".into(),
                    input_price: 0.098,
                    cached_write_price: Some(0.098),
                    cached_read_price: Some(0.0098),
                    output_price: 0.197,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "deepseek-v3.2".into(),
                    input_price: 0.229,
                    cached_write_price: Some(0.229),
                    cached_read_price: Some(0.0229),
                    output_price: 0.343,
                    currency: "USD".into(),
                },
                ModelPricing {
                    model_name: "deepseek-r1".into(),
                    input_price: 0.70,
                    cached_write_price: Some(0.70),
                    cached_read_price: Some(0.07),
                    output_price: 2.50,
                    currency: "USD".into(),
                },
            ],
            created_at: "2026-06-01T00:00:00Z".into(),
            updated_at: "2026-06-01T00:00:00Z".into(),
        },
        PricingStandard {
            id: "builtin-china".into(),
            name: "国内模型参考".into(),
            is_built_in: true,
            models: vec![
                ModelPricing {
                    model_name: "通义千问 qwen-max".into(),
                    input_price: 2.80,
                    cached_write_price: None,
                    cached_read_price: None,
                    output_price: 8.40,
                    currency: "CNY".into(),
                },
                ModelPricing {
                    model_name: "通义千问 qwen-plus".into(),
                    input_price: 0.80,
                    cached_write_price: None,
                    cached_read_price: None,
                    output_price: 2.00,
                    currency: "CNY".into(),
                },
                ModelPricing {
                    model_name: "通义千问 qwen-turbo".into(),
                    input_price: 0.30,
                    cached_write_price: None,
                    cached_read_price: None,
                    output_price: 0.60,
                    currency: "CNY".into(),
                },
                ModelPricing {
                    model_name: "文心一言 ERNIE-4.0".into(),
                    input_price: 12.00,
                    cached_write_price: None,
                    cached_read_price: None,
                    output_price: 12.00,
                    currency: "CNY".into(),
                },
                ModelPricing {
                    model_name: "豆包 doubao-pro".into(),
                    input_price: 0.80,
                    cached_write_price: None,
                    cached_read_price: None,
                    output_price: 2.00,
                    currency: "CNY".into(),
                },
                ModelPricing {
                    model_name: "豆包 doubao-lite".into(),
                    input_price: 0.30,
                    cached_write_price: None,
                    cached_read_price: None,
                    output_price: 0.60,
                    currency: "CNY".into(),
                },
                ModelPricing {
                    model_name: "Moonshot moonshot-v1".into(),
                    input_price: 12.00,
                    cached_write_price: None,
                    cached_read_price: None,
                    output_price: 12.00,
                    currency: "CNY".into(),
                },
                ModelPricing {
                    model_name: "GLM-4".into(),
                    input_price: 10.00,
                    cached_write_price: None,
                    cached_read_price: None,
                    output_price: 10.00,
                    currency: "CNY".into(),
                },
            ],
            created_at: "2026-06-01T00:00:00Z".into(),
            updated_at: "2026-06-01T00:00:00Z".into(),
        },
    ]
}
