//! Scan session registry for cancelScan (idempotent).

use std::collections::HashSet;
use std::sync::Mutex;
use std::sync::OnceLock;
use uuid::Uuid;

fn cancelled() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn new_session_id() -> String {
    Uuid::new_v4().to_string()
}

/// Idempotent: repeated cancel for the same id is a no-op success.
pub fn cancel_scan(session_id: String) {
    let id = session_id.trim();
    if id.is_empty() {
        return;
    }
    if let Ok(mut guard) = cancelled().lock() {
        guard.insert(id.to_string());
    }
}

pub fn is_cancelled(session_id: &str) -> bool {
    cancelled()
        .lock()
        .map(|g| g.contains(session_id))
        .unwrap_or(false)
}

pub fn clear_session(session_id: &str) {
    if let Ok(mut guard) = cancelled().lock() {
        guard.remove(session_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_is_idempotent_and_session_cleanup_allows_reuse() {
        let session_id = format!("test-{}", Uuid::new_v4());
        assert!(!is_cancelled(&session_id));

        cancel_scan(session_id.clone());
        cancel_scan(session_id.clone());
        assert!(is_cancelled(&session_id));

        clear_session(&session_id);
        assert!(!is_cancelled(&session_id));
    }

    #[test]
    fn blank_session_ids_are_ignored() {
        cancel_scan(" \t ".into());
        assert!(!is_cancelled(""));
        assert!(!is_cancelled(" \t "));
    }
}
