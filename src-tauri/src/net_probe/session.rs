//! Scan session registry for cancelScan (idempotent).

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;
use uuid::Uuid;

fn sessions() -> &'static Mutex<HashMap<String, bool>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn new_session_id() -> String {
    let id = Uuid::new_v4().to_string();
    if let Ok(mut guard) = sessions().lock() {
        guard.insert(id.clone(), false);
    }
    id
}

/// Idempotent: repeated cancel for the same id is a no-op success.
pub fn cancel_scan(session_id: String) {
    let id = session_id.trim();
    if id.is_empty() {
        return;
    }
    if let Ok(mut guard) = sessions().lock() {
        if let Some(is_cancelled) = guard.get_mut(id) {
            *is_cancelled = true;
        }
    }
}

pub fn is_cancelled(session_id: &str) -> bool {
    sessions()
        .lock()
        .map(|g| g.get(session_id).copied().unwrap_or(false))
        .unwrap_or(false)
}

pub fn clear_session(session_id: &str) {
    if let Ok(mut guard) = sessions().lock() {
        guard.remove(session_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_is_scoped_to_live_sessions_and_late_cancel_is_ignored() {
        let first = new_session_id();
        let second = new_session_id();

        cancel_scan(first.clone());
        cancel_scan(first.clone());
        assert!(is_cancelled(&first));
        assert!(!is_cancelled(&second));

        clear_session(&first);
        cancel_scan(first.clone());
        assert!(!is_cancelled(&first));
        clear_session(&second);
    }
}
