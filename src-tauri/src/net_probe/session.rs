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
    let mut guard = sessions().lock().unwrap_or_else(|error| error.into_inner());
    loop {
        let session_id = Uuid::new_v4().to_string();
        if !guard.contains_key(&session_id) {
            guard.insert(session_id.clone(), false);
            return session_id;
        }
    }
}

/// Clears an active cancellation record on every function exit path.
#[must_use = "dropping the guard is what clears the cancellation record"]
pub struct SessionGuard {
    session_id: String,
}

impl SessionGuard {
    pub fn new() -> Self {
        Self {
            session_id: new_session_id(),
        }
    }

    pub fn id(&self) -> &str {
        &self.session_id
    }
}

impl Drop for SessionGuard {
    fn drop(&mut self) {
        clear_session(&self.session_id);
    }
}

/// Idempotent: repeated cancel for an active session is a no-op success.
/// Unknown and already-finished IDs are ignored without retaining caller input.
pub fn cancel_scan(session_id: String) {
    let id = session_id.trim();
    if id.is_empty() {
        return;
    }
    let mut guard = sessions().lock().unwrap_or_else(|error| error.into_inner());
    if let Some(cancelled) = guard.get_mut(id) {
        *cancelled = true;
    }
}

pub fn is_cancelled(session_id: &str) -> bool {
    *sessions()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(session_id)
        .unwrap_or(&false)
}

pub fn clear_session(session_id: &str) {
    sessions()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .remove(session_id);
}

#[cfg(test)]
mod tests {
    use super::{cancel_scan, clear_session, is_cancelled, new_session_id, sessions, SessionGuard};
    use std::sync::PoisonError;

    fn has_session(session_id: &str) -> bool {
        sessions()
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .contains_key(session_id)
    }

    #[test]
    fn cancellation_only_marks_active_sessions() {
        let unknown_id = "session-that-never-existed".to_string();
        cancel_scan(unknown_id.clone());
        assert!(!is_cancelled(&unknown_id));

        let session_id = new_session_id();
        assert!(!is_cancelled(&session_id));

        cancel_scan(session_id.clone());
        assert!(is_cancelled(&session_id));
        cancel_scan(session_id.clone());
        assert!(is_cancelled(&session_id));

        clear_session(&session_id);
        assert!(!is_cancelled(&session_id));
        cancel_scan(session_id.clone());
        assert!(!is_cancelled(&session_id));
    }

    #[test]
    fn session_guard_clears_the_registry_on_scope_exit() {
        let session_id;
        {
            let guard = SessionGuard::new();
            session_id = guard.id().to_string();
            assert!(has_session(&session_id));
        }
        assert!(!has_session(&session_id));
    }
}
