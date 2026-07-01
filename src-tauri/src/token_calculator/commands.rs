use chrono::Utc;
use std::collections::HashSet;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::token_calculator::{
    storage,
    types::{ModelPricing, PricingStandard, TokenCalculatorError, TokenCalculatorResult},
    TokenCalculatorState,
};

fn invalid_input(message: impl Into<String>) -> TokenCalculatorError {
    TokenCalculatorError::InvalidInput {
        message: message.into(),
    }
}

fn normalize_standard_name(name: &str) -> TokenCalculatorResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(invalid_input("Name cannot be empty"));
    }
    Ok(trimmed.to_string())
}

fn validate_price(value: f64, field: &str, model_name: &str) -> TokenCalculatorResult<f64> {
    if !value.is_finite() {
        return Err(invalid_input(format!(
            "{field} for model '{model_name}' must be a finite number"
        )));
    }
    if value < 0.0 {
        return Err(invalid_input(format!(
            "{field} for model '{model_name}' cannot be negative"
        )));
    }
    Ok(value)
}

fn validate_optional_price(
    value: Option<f64>,
    field: &str,
    model_name: &str,
) -> TokenCalculatorResult<Option<f64>> {
    value
        .map(|v| validate_price(v, field, model_name))
        .transpose()
}

fn normalize_currency(currency: &str, model_name: &str) -> TokenCalculatorResult<String> {
    let normalized = currency.trim().to_ascii_uppercase();
    match normalized.as_str() {
        "USD" | "CNY" => Ok(normalized),
        _ => Err(invalid_input(format!(
            "Currency for model '{model_name}' must be USD or CNY"
        ))),
    }
}

fn normalize_models(models: Vec<ModelPricing>) -> TokenCalculatorResult<Vec<ModelPricing>> {
    let mut normalized = Vec::with_capacity(models.len());
    let mut names = HashSet::with_capacity(models.len());

    for (idx, model) in models.into_iter().enumerate() {
        let model_name = model.model_name.trim().to_string();
        if model_name.is_empty() {
            return Err(invalid_input(format!("Model #{} name cannot be empty", idx + 1)));
        }

        let name_key = model_name.to_lowercase();
        if !names.insert(name_key) {
            return Err(invalid_input(format!(
                "Duplicate model name '{}' in the same standard",
                model_name
            )));
        }

        normalized.push(ModelPricing {
            input_price: validate_price(model.input_price, "Input price", &model_name)?,
            cached_write_price: validate_optional_price(
                model.cached_write_price,
                "Cache write price",
                &model_name,
            )?,
            cached_read_price: validate_optional_price(
                model.cached_read_price,
                "Cache read price",
                &model_name,
            )?,
            output_price: validate_price(model.output_price, "Output price", &model_name)?,
            currency: normalize_currency(&model.currency, &model_name)?,
            model_name,
        });
    }

    if normalized.is_empty() {
        return Err(invalid_input("At least one model is required"));
    }

    Ok(normalized)
}

#[tauri::command]
pub fn list_pricing_standards(
    state: State<'_, TokenCalculatorState>,
) -> TokenCalculatorResult<Vec<PricingStandard>> {
    state.ensure_ready()?;
    let standards = state.standards.lock().unwrap_or_else(|e| e.into_inner());
    Ok(standards.clone())
}

#[tauri::command]
pub fn create_pricing_standard(
    app: AppHandle,
    state: State<'_, TokenCalculatorState>,
    name: String,
    models: Vec<ModelPricing>,
) -> TokenCalculatorResult<PricingStandard> {
    let name = normalize_standard_name(&name)?;
    let models = normalize_models(models)?;

    storage::with_standards_mut(&app, &state, |all| {
        if all
            .iter()
            .any(|s| s.name.trim().eq_ignore_ascii_case(&name))
        {
            return Err(TokenCalculatorError::DuplicateName {
                message: format!("A standard named '{}' already exists", name),
            });
        }

        let now = Utc::now().to_rfc3339();
        let standard = PricingStandard {
            id: Uuid::new_v4().to_string(),
            name,
            is_built_in: false,
            models,
            created_at: now.clone(),
            updated_at: now,
        };
        let result = standard.clone();
        all.push(standard);
        Ok(result)
    })
}

#[tauri::command]
pub fn update_pricing_standard(
    app: AppHandle,
    state: State<'_, TokenCalculatorState>,
    id: String,
    name: Option<String>,
    models: Option<Vec<ModelPricing>>,
) -> TokenCalculatorResult<PricingStandard> {
    let name = name
        .map(|new_name| normalize_standard_name(&new_name))
        .transpose()?;
    let models = models.map(normalize_models).transpose()?;

    storage::with_standards_mut(&app, &state, |all| {
        let pos = all.iter().position(|s| s.id == id).ok_or_else(|| {
            TokenCalculatorError::NotFound {
                message: format!("Standard with id '{}' not found", id),
            }
        })?;

        if let Some(ref new_name) = name {
            if all.iter().any(|s| {
                s.id.as_str() != id.as_str()
                    && s.name.trim().eq_ignore_ascii_case(new_name)
            }) {
                return Err(TokenCalculatorError::DuplicateName {
                    message: format!("A standard named '{}' already exists", new_name),
                });
            }
        }

        let s = &mut all[pos];
        if let Some(ref new_name) = name {
            s.name = new_name.clone();
        }
        if let Some(ref new_models) = models {
            s.models = new_models.clone();
        }
        s.updated_at = Utc::now().to_rfc3339();
        Ok(s.clone())
    })
}

#[tauri::command]
pub fn delete_pricing_standard(
    app: AppHandle,
    state: State<'_, TokenCalculatorState>,
    id: String,
) -> TokenCalculatorResult<()> {
    storage::with_standards_mut(&app, &state, |all| {
        let before = all.len();
        all.retain(|s| s.id != id);
        if all.len() == before {
            return Err(TokenCalculatorError::NotFound {
                message: format!("Standard with id '{}' not found", id),
            });
        }
        Ok(())
    })
}
