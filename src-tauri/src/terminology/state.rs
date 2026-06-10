use std::sync::Mutex;

use super::types::{Industry, Term};

pub struct TerminologyState {
    pub industries: Mutex<Vec<Industry>>,
    pub terms: Mutex<Vec<Term>>,
    pub pinned_term_ids: Mutex<Vec<String>>,
}

impl TerminologyState {
    pub fn new() -> Self {
        Self {
            industries: Mutex::new(Vec::new()),
            terms: Mutex::new(Vec::new()),
            pinned_term_ids: Mutex::new(Vec::new()),
        }
    }
}
