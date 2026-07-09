use tauri::{AppHandle, State};
use uuid::Uuid;

use super::state::TerminologyState;
use super::storage;
use super::types::{
    Industry, Term, TermCategory, TermInput, TermSubcategory, TerminologyBundle, TerminologyError,
    TerminologyResult,
};

const FRONTEND_INDUSTRY_ID: &str = "computer";
const FRONTEND_CATEGORY_ID: &str = "frontend";
const UNCLASSIFIED_SUBCATEGORY_ID: &str = "__unclassified__";

fn invalid_input(message: impl Into<String>) -> TerminologyError {
    TerminologyError::InvalidInput {
        message: message.into(),
    }
}

fn normalize_label(value: &str, what: &str) -> TerminologyResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(invalid_input(format!("{what} cannot be empty")));
    }
    Ok(trimmed.to_string())
}

fn is_frontend_category(industry_id: &str, category_id: &str) -> bool {
    industry_id == FRONTEND_INDUSTRY_ID && category_id == FRONTEND_CATEGORY_ID
}

fn normalize_frontend_subcategory_id(
    industry_id: &str,
    category_id: &str,
    subcategory_id: Option<String>,
) -> Option<String> {
    if is_frontend_category(industry_id, category_id) {
        Some(
            subcategory_id
                .filter(|id| !id.trim().is_empty())
                .unwrap_or_else(|| UNCLASSIFIED_SUBCATEGORY_ID.to_string()),
        )
    } else {
        subcategory_id.filter(|id| !id.trim().is_empty())
    }
}

#[allow(clippy::type_complexity)]
fn validate_term_input(
    input: &TermInput,
) -> TerminologyResult<(
    String,
    String,
    Option<String>,
    String,
    String,
    Vec<super::types::TermWebsite>,
)> {
    let industry_id = normalize_label(&input.industry_id, "Industry id")?;
    let category_id = normalize_label(&input.category_id, "Category id")?;
    let subcategory_id = if is_frontend_category(&industry_id, &category_id) {
        Some(
            input
                .subcategory_id
                .as_deref()
                .filter(|id| !id.trim().is_empty())
                .map(|id| normalize_label(id, "Subcategory id"))
                .transpose()?
                .unwrap_or_else(|| UNCLASSIFIED_SUBCATEGORY_ID.to_string()),
        )
    } else {
        input
            .subcategory_id
            .as_deref()
            .filter(|id| !id.trim().is_empty())
            .map(|id| normalize_label(id, "Subcategory id"))
            .transpose()?
    };
    let title = normalize_label(&input.title, "Term title")?;
    let description = input.description.trim().to_string();
    if description.is_empty() {
        return Err(invalid_input("Term description cannot be empty"));
    }
    Ok((
        industry_id,
        category_id,
        subcategory_id,
        title,
        description,
        input.websites.clone(),
    ))
}

fn find_industry_mut<'a>(industries: &'a mut [Industry], id: &str) -> Option<&'a mut Industry> {
    industries.iter_mut().find(|industry| industry.id == id)
}

fn find_category_mut<'a>(industry: &'a mut Industry, id: &str) -> Option<&'a mut TermCategory> {
    industry
        .categories
        .iter_mut()
        .find(|category| category.id == id)
}

fn find_subcategory_mut<'a>(
    category: &'a mut TermCategory,
    id: &str,
) -> Option<&'a mut TermSubcategory> {
    category
        .subcategories
        .iter_mut()
        .find(|subcategory| subcategory.id == id)
}

fn validate_bundle(industries: &[Industry], terms: &[Term]) -> TerminologyResult<()> {
    for term in terms {
        let Some(industry) = industries
            .iter()
            .find(|industry| industry.id == term.industry_id)
        else {
            return Err(TerminologyError::NotFound {
                message: format!(
                    "Industry '{}' not found for term '{}'",
                    term.industry_id, term.id
                ),
            });
        };
        if !industry
            .categories
            .iter()
            .any(|category| category.id == term.category_id)
        {
            return Err(TerminologyError::NotFound {
                message: format!(
                    "Category '{}' not found for term '{}'",
                    term.category_id, term.id
                ),
            });
        }
        if let Some(subcategory_id) = term.subcategory_id.as_ref() {
            let Some(category) = industry
                .categories
                .iter()
                .find(|category| category.id == term.category_id)
            else {
                return Err(TerminologyError::NotFound {
                    message: format!(
                        "Category '{}' not found for term '{}'",
                        term.category_id, term.id
                    ),
                });
            };
            if !category
                .subcategories
                .iter()
                .any(|subcategory| subcategory.id == *subcategory_id)
            {
                return Err(TerminologyError::NotFound {
                    message: format!(
                        "Subcategory '{}' not found for term '{}'",
                        subcategory_id, term.id
                    ),
                });
            }
        }
    }
    Ok(())
}

fn is_reserved_subcategory(subcategory_id: &str) -> bool {
    subcategory_id == UNCLASSIFIED_SUBCATEGORY_ID
}

fn is_duplicate_term_scope(
    terms: &[Term],
    current_term_id: Option<&str>,
    industry_id: &str,
    category_id: &str,
    subcategory_id: Option<&str>,
    title: &str,
) -> bool {
    terms.iter().any(|term| {
        current_term_id != Some(term.id.as_str())
            && term.industry_id == industry_id
            && term.category_id == category_id
            && term.subcategory_id.as_deref() == subcategory_id
            && term.title.trim().eq_ignore_ascii_case(title)
    })
}

#[tauri::command]
pub fn list_terminology_data(
    state: State<'_, TerminologyState>,
) -> TerminologyResult<TerminologyBundle> {
    state.ensure_ready()?;
    Ok(state.read_bundle())
}

#[tauri::command]
pub fn create_industry(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    label: String,
) -> TerminologyResult<Industry> {
    let label = normalize_label(&label, "Industry label")?;

    storage::with_state_mut(&app, &state, |industries, terms, _pinned_term_ids| {
        if industries
            .iter()
            .any(|industry| industry.label.trim().eq_ignore_ascii_case(&label))
        {
            return Err(TerminologyError::DuplicateName {
                message: format!("An industry named '{}' already exists", label),
            });
        }

        let industry = Industry {
            id: format!("ind-{}", Uuid::new_v4()),
            label,
            categories: Vec::new(),
        };
        let result = industry.clone();
        industries.push(industry);
        validate_bundle(industries, terms)?;
        Ok(result)
    })
}

#[tauri::command]
pub fn update_industry(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    id: String,
    label: String,
) -> TerminologyResult<Industry> {
    let label = normalize_label(&label, "Industry label")?;

    storage::with_state_mut(&app, &state, |industries, terms, _pinned_term_ids| {
        if industries
            .iter()
            .any(|industry| industry.id != id && industry.label.trim().eq_ignore_ascii_case(&label))
        {
            return Err(TerminologyError::DuplicateName {
                message: format!("An industry named '{}' already exists", label),
            });
        }

        let industry = industries
            .iter_mut()
            .find(|industry| industry.id == id)
            .ok_or_else(|| TerminologyError::NotFound {
                message: format!("Industry with id '{}' not found", id),
            })?;
        industry.label = label;
        let result = industry.clone();
        validate_bundle(industries, terms)?;
        Ok(result)
    })
}

#[tauri::command]
pub fn delete_industry(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    id: String,
) -> TerminologyResult<()> {
    storage::with_state_mut(&app, &state, |industries, terms, pinned_term_ids| {
        let before = industries.len();
        industries.retain(|industry| industry.id != id);
        if industries.len() == before {
            return Err(TerminologyError::NotFound {
                message: format!("Industry with id '{}' not found", id),
            });
        }
        terms.retain(|term| term.industry_id != id);
        pinned_term_ids.retain(|term_id| terms.iter().any(|term| term.id == *term_id));
        Ok(())
    })
}

#[tauri::command]
pub fn create_category(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    industry_id: String,
    label: String,
) -> TerminologyResult<TermCategory> {
    let label = normalize_label(&label, "Category label")?;

    storage::with_state_mut(&app, &state, |industries, terms, _pinned_term_ids| {
        let industry = find_industry_mut(industries, &industry_id).ok_or_else(|| {
            TerminologyError::NotFound {
                message: format!("Industry with id '{}' not found", industry_id),
            }
        })?;

        if industry
            .categories
            .iter()
            .any(|category| category.label.trim().eq_ignore_ascii_case(&label))
        {
            return Err(TerminologyError::DuplicateName {
                message: format!(
                    "A category named '{}' already exists in industry '{}'",
                    label, industry.label
                ),
            });
        }

        let category = TermCategory {
            id: format!("cat-{}", Uuid::new_v4()),
            label,
            subcategories: Vec::new(),
        };
        let result = category.clone();
        industry.categories.push(category);
        validate_bundle(industries, terms)?;
        Ok(result)
    })
}

#[tauri::command]
pub fn update_category(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    industry_id: String,
    category_id: String,
    label: String,
) -> TerminologyResult<TermCategory> {
    let label = normalize_label(&label, "Category label")?;

    storage::with_state_mut(&app, &state, |industries, terms, _pinned_term_ids| {
        let industry = find_industry_mut(industries, &industry_id).ok_or_else(|| {
            TerminologyError::NotFound {
                message: format!("Industry with id '{}' not found", industry_id),
            }
        })?;

        if industry.categories.iter().any(|category| {
            category.id != category_id && category.label.trim().eq_ignore_ascii_case(&label)
        }) {
            return Err(TerminologyError::DuplicateName {
                message: format!(
                    "A category named '{}' already exists in industry '{}'",
                    label, industry.label
                ),
            });
        }

        let category = find_category_mut(industry, &category_id).ok_or_else(|| {
            TerminologyError::NotFound {
                message: format!("Category with id '{}' not found", category_id),
            }
        })?;
        category.label = label;
        let result = category.clone();
        validate_bundle(industries, terms)?;
        Ok(result)
    })
}

#[tauri::command]
pub fn delete_category(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    industry_id: String,
    category_id: String,
) -> TerminologyResult<()> {
    storage::with_state_mut(&app, &state, |industries, terms, pinned_term_ids| {
        let industry = find_industry_mut(industries, &industry_id).ok_or_else(|| {
            TerminologyError::NotFound {
                message: format!("Industry with id '{}' not found", industry_id),
            }
        })?;
        let before = industry.categories.len();
        industry
            .categories
            .retain(|category| category.id != category_id);
        if industry.categories.len() == before {
            return Err(TerminologyError::NotFound {
                message: format!("Category with id '{}' not found", category_id),
            });
        }
        terms.retain(|term| !(term.industry_id == industry_id && term.category_id == category_id));
        pinned_term_ids.retain(|term_id| terms.iter().any(|term| term.id == *term_id));
        Ok(())
    })
}

#[tauri::command]
pub fn create_subcategory(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    industry_id: String,
    category_id: String,
    label: String,
) -> TerminologyResult<TermSubcategory> {
    let label = normalize_label(&label, "Subcategory label")?;

    storage::with_state_mut(&app, &state, |industries, terms, _pinned_term_ids| {
        let industry = find_industry_mut(industries, &industry_id).ok_or_else(|| {
            TerminologyError::NotFound {
                message: format!("Industry with id '{}' not found", industry_id),
            }
        })?;
        let category = find_category_mut(industry, &category_id).ok_or_else(|| {
            TerminologyError::NotFound {
                message: format!("Category with id '{}' not found", category_id),
            }
        })?;
        if category
            .subcategories
            .iter()
            .any(|subcategory| subcategory.label.trim().eq_ignore_ascii_case(&label))
        {
            return Err(TerminologyError::DuplicateName {
                message: format!(
                    "A subcategory named '{}' already exists in category '{}'",
                    label, category.label
                ),
            });
        }

        let subcategory = TermSubcategory {
            id: format!("subcat-{}", Uuid::new_v4()),
            label,
        };
        let result = subcategory.clone();
        if is_frontend_category(&industry_id, &category_id) {
            if let Some(index) = category
                .subcategories
                .iter()
                .position(|item| item.id == UNCLASSIFIED_SUBCATEGORY_ID)
            {
                let reserved = category.subcategories.remove(index);
                category.subcategories.push(subcategory);
                category.subcategories.push(reserved);
            } else {
                category.subcategories.push(subcategory);
            }
        } else {
            category.subcategories.push(subcategory);
        }
        validate_bundle(industries, terms)?;
        Ok(result)
    })
}

#[tauri::command]
pub fn update_subcategory(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    industry_id: String,
    category_id: String,
    subcategory_id: String,
    label: String,
) -> TerminologyResult<TermSubcategory> {
    let label = normalize_label(&label, "Subcategory label")?;
    if is_reserved_subcategory(&subcategory_id) {
        return Err(invalid_input("Reserved subcategory cannot be modified"));
    }

    storage::with_state_mut(&app, &state, |industries, terms, _pinned_term_ids| {
        let industry = find_industry_mut(industries, &industry_id).ok_or_else(|| {
            TerminologyError::NotFound {
                message: format!("Industry with id '{}' not found", industry_id),
            }
        })?;
        let category = find_category_mut(industry, &category_id).ok_or_else(|| {
            TerminologyError::NotFound {
                message: format!("Category with id '{}' not found", category_id),
            }
        })?;
        if category.subcategories.iter().any(|subcategory| {
            subcategory.id != subcategory_id
                && subcategory.label.trim().eq_ignore_ascii_case(&label)
        }) {
            return Err(TerminologyError::DuplicateName {
                message: format!(
                    "A subcategory named '{}' already exists in category '{}'",
                    label, category.label
                ),
            });
        }
        let subcategory = find_subcategory_mut(category, &subcategory_id).ok_or_else(|| {
            TerminologyError::NotFound {
                message: format!("Subcategory with id '{}' not found", subcategory_id),
            }
        })?;
        subcategory.label = label;
        let result = subcategory.clone();
        validate_bundle(industries, terms)?;
        Ok(result)
    })
}

#[tauri::command]
pub fn delete_subcategory(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    industry_id: String,
    category_id: String,
    subcategory_id: String,
) -> TerminologyResult<()> {
    if is_reserved_subcategory(&subcategory_id) {
        return Err(invalid_input("Reserved subcategory cannot be deleted"));
    }
    storage::with_state_mut(&app, &state, |industries, terms, pinned_term_ids| {
        let industry = find_industry_mut(industries, &industry_id).ok_or_else(|| {
            TerminologyError::NotFound {
                message: format!("Industry with id '{}' not found", industry_id),
            }
        })?;
        let category = find_category_mut(industry, &category_id).ok_or_else(|| {
            TerminologyError::NotFound {
                message: format!("Category with id '{}' not found", category_id),
            }
        })?;
        let before = category.subcategories.len();
        category
            .subcategories
            .retain(|subcategory| subcategory.id != subcategory_id);
        if category.subcategories.len() == before {
            return Err(TerminologyError::NotFound {
                message: format!("Subcategory with id '{}' not found", subcategory_id),
            });
        }
        for term in terms.iter_mut() {
            if term.industry_id == industry_id
                && term.category_id == category_id
                && term.subcategory_id.as_deref() == Some(subcategory_id.as_str())
            {
                term.subcategory_id = if is_frontend_category(&industry_id, &category_id) {
                    Some(UNCLASSIFIED_SUBCATEGORY_ID.into())
                } else {
                    None
                };
            }
        }
        pinned_term_ids.retain(|term_id| terms.iter().any(|term| term.id == *term_id));
        Ok(())
    })
}

#[tauri::command]
pub fn create_term(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    input: TermInput,
) -> TerminologyResult<Term> {
    let (industry_id, category_id, subcategory_id, title, description, websites) =
        validate_term_input(&input)?;

    storage::with_state_mut(&app, &state, |industries, terms, _pinned_term_ids| {
        let industry = industries
            .iter()
            .find(|industry| industry.id == industry_id)
            .ok_or_else(|| TerminologyError::NotFound {
                message: format!("Industry with id '{}' not found", industry_id),
            })?;
        if !industry
            .categories
            .iter()
            .any(|category| category.id == category_id)
        {
            return Err(TerminologyError::NotFound {
                message: format!("Category with id '{}' not found", category_id),
            });
        }
        if let Some(subcategory_id) = subcategory_id.as_ref() {
            let category = industry
                .categories
                .iter()
                .find(|category| category.id == category_id)
                .ok_or_else(|| TerminologyError::NotFound {
                    message: format!("Category with id '{}' not found", category_id),
                })?;
            if !category
                .subcategories
                .iter()
                .any(|subcategory| subcategory.id == *subcategory_id)
            {
                return Err(TerminologyError::NotFound {
                    message: format!("Subcategory with id '{}' not found", subcategory_id),
                });
            }
        }
        if is_duplicate_term_scope(
            terms,
            None,
            &industry_id,
            &category_id,
            subcategory_id.as_deref(),
            &title,
        ) {
            return Err(TerminologyError::DuplicateName {
                message: format!(
                    "A term named '{}' already exists in this classification",
                    title
                ),
            });
        }

        let term = Term {
            id: format!("t-{}", Uuid::new_v4()),
            industry_id,
            category_id,
            subcategory_id,
            title,
            description,
            websites,
        };
        let result = term.clone();
        terms.push(term);
        Ok(result)
    })
}

#[tauri::command]
pub fn update_term(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    term: Term,
) -> TerminologyResult<Term> {
    let title = normalize_label(&term.title, "Term title")?;
    let description = term.description.trim().to_string();
    if description.is_empty() {
        return Err(invalid_input("Term description cannot be empty"));
    }
    let subcategory_id = normalize_frontend_subcategory_id(
        &term.industry_id,
        &term.category_id,
        term.subcategory_id.clone(),
    );

    storage::with_state_mut(&app, &state, |industries, terms, _pinned_term_ids| {
        let industry = industries
            .iter()
            .find(|industry| industry.id == term.industry_id)
            .ok_or_else(|| TerminologyError::NotFound {
                message: format!("Industry with id '{}' not found", term.industry_id),
            })?;
        if !industry
            .categories
            .iter()
            .any(|category| category.id == term.category_id)
        {
            return Err(TerminologyError::NotFound {
                message: format!("Category with id '{}' not found", term.category_id),
            });
        }
        if let Some(subcategory_id) = subcategory_id.as_ref() {
            let category = industry
                .categories
                .iter()
                .find(|category| category.id == term.category_id)
                .ok_or_else(|| TerminologyError::NotFound {
                    message: format!("Category with id '{}' not found", term.category_id),
                })?;
            if !category
                .subcategories
                .iter()
                .any(|subcategory| subcategory.id == *subcategory_id)
            {
                return Err(TerminologyError::NotFound {
                    message: format!("Subcategory with id '{}' not found", subcategory_id),
                });
            }
        }
        if is_duplicate_term_scope(
            terms,
            Some(term.id.as_str()),
            &term.industry_id,
            &term.category_id,
            subcategory_id.as_deref(),
            &title,
        ) {
            return Err(TerminologyError::DuplicateName {
                message: format!(
                    "A term named '{}' already exists in this classification",
                    title
                ),
            });
        }

        let existing = terms
            .iter_mut()
            .find(|existing| existing.id == term.id)
            .ok_or_else(|| TerminologyError::NotFound {
                message: format!("Term with id '{}' not found", term.id),
            })?;

        existing.industry_id = term.industry_id;
        existing.category_id = term.category_id;
        existing.subcategory_id = subcategory_id;
        existing.title = title;
        existing.description = description;
        existing.websites = term.websites;
        let result = existing.clone();
        Ok(result)
    })
}

#[tauri::command]
pub fn delete_term(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    id: String,
) -> TerminologyResult<()> {
    storage::with_state_mut(&app, &state, |_, terms, pinned_term_ids| {
        let before = terms.len();
        terms.retain(|term| term.id != id);
        if terms.len() == before {
            return Err(TerminologyError::NotFound {
                message: format!("Term with id '{}' not found", id),
            });
        }
        pinned_term_ids.retain(|term_id| term_id != &id);
        Ok(())
    })
}

#[tauri::command]
pub fn set_term_pinned(
    app: AppHandle,
    state: State<'_, TerminologyState>,
    id: String,
    value: bool,
) -> TerminologyResult<()> {
    storage::with_state_mut(&app, &state, |_, terms, pinned_term_ids| {
        if !terms.iter().any(|term| term.id == id) {
            return Err(TerminologyError::NotFound {
                message: format!("Term with id '{}' not found", id),
            });
        }
        if value {
            if !pinned_term_ids.iter().any(|term_id| term_id == &id) {
                pinned_term_ids.push(id);
            }
        } else {
            pinned_term_ids.retain(|term_id| term_id != &id);
        }
        Ok(())
    })
}
