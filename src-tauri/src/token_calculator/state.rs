use std::sync::Mutex;

use crate::token_calculator::types::{
    PricingStandard, TokenCalculatorError, TokenCalculatorResult,
};

pub struct TokenCalculatorState {
    pub standards: Mutex<Vec<PricingStandard>>,
    init_error: Mutex<Option<String>>,
}

impl TokenCalculatorState {
    pub fn new() -> Self {
        Self {
            standards: Mutex::new(Vec::new()),
            init_error: Mutex::new(None),
        }
    }

    pub fn set_init_error(&self, message: String) {
        *self.init_error.lock().unwrap_or_else(|e| e.into_inner()) = Some(message);
    }

    pub fn clear_init_error(&self) {
        *self.init_error.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    pub fn ensure_ready(&self) -> TokenCalculatorResult<()> {
        if let Some(message) = self
            .init_error
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
        {
            return Err(TokenCalculatorError::StoreFail {
                message: format!("state initialization failed: {message}"),
            });
        }

        Ok(())
    }
}
