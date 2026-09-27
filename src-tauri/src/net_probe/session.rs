//! Scan session registry for cancelScan (idempotent and bounded to live sessions).

use std::collections::HashSet;
use std::sync::{Mutex, MutexGuard, OnceLock};
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

/// Owns a live scan session. Dropping it removes both its active and cancelled markers,
/// including when an async operation exits early with an error.
pub struct ScanSession {
    id: String,
}

impl ScanSession {
    pub fn id(&self) -> &str {
        &self.id
    }
}

impl Drop for ScanSession {
    fn drop(&mut self) {
        let mut sessions = lock_registry();
        sessions.active.remove(&self.id);
        sessions.cancelled.remove(&self.id);
    }
}

/// Creates and registers a unique session before its ID is emitted to the frontend.
pub fn new_session() -> ScanSession {
    let id = Uuid::new_v4().to_string();
    lock_registry().active.insert(id.clone());
    ScanSession { id }
}

/// Idempotent: repeated cancellation for the same active ID is a no-op success.
/// Unknown or already-finished IDs are ignored, so arbitrary IPC input cannot grow the registry.
pub fn cancel_scan(session_id: &str) {
    let id = session_id.trim();
    if id.is_empty() {
        return;
    }

    let mut sessions = lock_registry();
    if sessions.active.contains(id) {
        sessions.cancelled.insert(id.to_string());
    }
}

pub fn is_cancelled(session_id: &str) -> bool {
    lock_registry().cancelled.contains(session_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_cancel_only_marks_an_active_session_once() {
        let session = new_session();
        let id = session.id().to_owned();

        cancel_scan(&id);
        cancel_scan(&id);

        let sessions = lock_registry();
        assert!(sessions.active.contains(&id));
        assert!(sessions.cancelled.contains(&id));
        drop(sessions);

        drop(session);
        assert!(!is_cancelled(&id));
        let sessions = lock_registry();
        assert!(!sessions.active.contains(&id));
        assert!(!sessions.cancelled.contains(&id));
    }

    #[test]
    fn unknown_and_blank_ids_do_not_enter_the_registry() {
        let unknown_id = Uuid::new_v4().to_string();

        cancel_scan(&unknown_id);
        cancel_scan("  ");

        assert!(!is_cancelled(&unknown_id));
        let sessions = lock_registry();
        assert!(!sessions.active.contains(&unknown_id));
        assert!(!sessions.cancelled.contains(&unknown_id));
    }

    #[test]
    fn dropping_an_uncancelled_session_removes_its_active_marker() {
        let session = new_session();
        let id = session.id().to_owned();
        assert!(lock_registry().active.contains(&id));

        drop(session);

        assert!(!lock_registry().active.contains(&id));
    }
}
