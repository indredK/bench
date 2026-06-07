use std::sync::Mutex;

use crate::token_calculator::types::PricingStandard;

pub struct TokenCalculatorState {
    pub standards: Mutex<Vec<PricingStandard>>,
}

impl TokenCalculatorState {
    pub fn new() -> Self {
        Self {
            standards: Mutex::new(Vec::new()),
        }
    }
}
