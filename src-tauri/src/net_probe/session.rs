//! Scan session registry for cancelScan (idempotent).

use std::collections::HashSet;
use std::sync::OnceLock;
use std::sync::{Mutex, MutexGuard};
use uuid::Uuid;

#[derive(Default)]
struct SessionRegistry {
    active: HashSet<String>,
    cancelled: HashSet<String>,
}

fn registry() -> &'static Mutex<SessionRegistry> {
    static REGISTRY: OnceLock<Mutex<SessionRegistry>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(SessionRegistry::default()))
}

fn lock_registry() -> MutexGuard<'static, SessionRegistry> {
    registry()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// Removes session bookkeeping on every return path, including propagated errors.
pub struct SessionGuard {
    session_id: String,
}

impl SessionGuard {
    pub fn new(session_id: &str) -> Self {
        Self {
            session_id: session_id.to_string(),
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
    lock_registry().active.insert(id.clone());
    id
}

/// Idempotent: repeated cancel for the same id is a no-op success.
pub fn cancel_scan(session_id: String) {
    let id = session_id.trim();
    if id.is_empty() {
        return;
    }
    let mut guard = lock_registry();
    if guard.active.contains(id) {
        guard.cancelled.insert(id.to_string());
    }
}

pub fn is_cancelled(session_id: &str) -> bool {
    let guard = lock_registry();
    guard.active.contains(session_id) && guard.cancelled.contains(session_id)
}

/// Atomically observes a cancellation request and retires the session.
pub fn finish_session(session_id: &str) -> bool {
    let mut guard = lock_registry();
    let cancelled = guard.cancelled.remove(session_id);
    guard.active.remove(session_id);
    cancelled
}

pub fn clear_session(session_id: &str) {
    let mut guard = lock_registry();
    guard.active.remove(session_id);
    guard.cancelled.remove(session_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_is_idempotent_for_an_active_session() {
        let session_id = new_session_id();

        cancel_scan(session_id.clone());
        cancel_scan(session_id.clone());

        assert!(is_cancelled(&session_id));
        assert!(finish_session(&session_id));
        assert!(!is_cancelled(&session_id));
    }

    #[test]
    fn late_cancellation_does_not_retain_a_completed_session() {
        let session_id = new_session_id();
        assert!(!finish_session(&session_id));

        cancel_scan(session_id.clone());

        assert!(!is_cancelled(&session_id));
        let guard = lock_registry();
        assert!(!guard.active.contains(&session_id));
        assert!(!guard.cancelled.contains(&session_id));
    }

    #[test]
    fn session_guard_cleans_up_when_a_task_returns_early() {
        let session_id = new_session_id();
        cancel_scan(session_id.clone());

        {
            let _guard = SessionGuard::new(&session_id);
            assert!(is_cancelled(&session_id));
        }

        assert!(!is_cancelled(&session_id));
        let guard = lock_registry();
        assert!(!guard.active.contains(&session_id));
        assert!(!guard.cancelled.contains(&session_id));
    }
}
