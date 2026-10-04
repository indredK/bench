//! Scan session registry for cancelScan (idempotent).

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;
use uuid::Uuid;

fn sessions() -> &'static Mutex<HashMap<String, bool>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Clears the registered session on every exit path, including errors and dropped futures.
#[must_use]
pub struct SessionGuard {
    session_id: String,
}

impl SessionGuard {
    pub fn new(session_id: impl Into<String>) -> Self {
        Self {
            session_id: session_id.into(),
        }
    }
}

impl Drop for SessionGuard {
    fn drop(&mut self) {
        clear_session(&self.session_id);
    }
}

pub fn new_session_id() -> String {
    let id = Uuid::new_v4().to_string();
    sessions()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .insert(id.clone(), false);
    id
}

/// Idempotent: repeated cancel for the same id is a no-op success.
pub fn cancel_scan(session_id: String) {
    let id = session_id.trim();
    if id.is_empty() {
        return;
    }
    let mut guard = sessions()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some(cancelled) = guard.get_mut(id) {
        *cancelled = true;
    }
}

pub fn is_cancelled(session_id: &str) -> bool {
    sessions()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .get(session_id)
        .copied()
        .unwrap_or(false)
}

/// Wait until a known active session is cancelled. Dropping this future is safe.
pub async fn wait_for_cancel(session_id: &str) {
    loop {
        if is_cancelled(session_id) {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
}

pub fn clear_session(session_id: &str) {
    sessions()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .remove(session_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_cancel_requests_do_not_create_session_entries() {
        let id = Uuid::new_v4().to_string();

        cancel_scan(id.clone());

        assert!(!is_cancelled(&id));
    }

    #[test]
    fn cancellation_only_applies_to_a_registered_session() {
        let id = new_session_id();

        assert!(!is_cancelled(&id));
        cancel_scan(id.clone());
        assert!(is_cancelled(&id));
        clear_session(&id);
        assert!(!is_cancelled(&id));
    }

    #[test]
    fn session_guard_clears_the_entry_on_scope_exit() {
        let id = new_session_id();
        assert!(sessions()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .contains_key(&id));

        {
            let _guard = SessionGuard::new(id.clone());
        }

        assert!(!sessions()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .contains_key(&id));
    }
}
