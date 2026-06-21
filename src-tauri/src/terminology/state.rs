use std::sync::Mutex;

use super::types::{Industry, Term, TerminologyError, TerminologyResult};

pub struct TerminologyState {
    pub industries: Mutex<Vec<Industry>>,
    pub terms: Mutex<Vec<Term>>,
    pub pinned_term_ids: Mutex<Vec<String>>,
    init_error: Mutex<Option<String>>,
}

impl TerminologyState {
    pub fn new() -> Self {
        Self {
            industries: Mutex::new(Vec::new()),
            terms: Mutex::new(Vec::new()),
            pinned_term_ids: Mutex::new(Vec::new()),
            init_error: Mutex::new(None),
        }
    }

    pub fn set_init_error(&self, message: String) {
        *self.init_error.lock().unwrap_or_else(|e| e.into_inner()) = Some(message);
    }

    pub fn clear_init_error(&self) {
        *self.init_error.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    pub fn ensure_ready(&self) -> TerminologyResult<()> {
        if let Some(message) = self
            .init_error
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
        {
            return Err(TerminologyError::StoreFail {
                message: format!("state initialization failed: {message}"),
            });
        }

        Ok(())
    }
}
