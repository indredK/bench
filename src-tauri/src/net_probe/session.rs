//! Scan session registry for cancelScan (idempotent and bounded to live sessions).

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, OnceLock};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Default)]
struct SessionRegistry {
    sessions: HashMap<String, CancellationToken>,
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

/// Owns a live scan session. Dropping it removes its registry entry,
/// including when an async operation exits early with an error.
pub struct ScanSession {
    id: String,
    cancellation: CancellationToken,
}

impl ScanSession {
    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn cancellation_token(&self) -> CancellationToken {
        self.cancellation.clone()
    }
}

impl Drop for ScanSession {
    fn drop(&mut self) {
        lock_registry().sessions.remove(&self.id);
    }
}

/// Creates and registers a unique session before its ID is emitted to the frontend.
pub fn new_session() -> ScanSession {
    let id = Uuid::new_v4().to_string();
    let cancellation = CancellationToken::new();
    lock_registry()
        .sessions
        .insert(id.clone(), cancellation.clone());
    ScanSession { id, cancellation }
}

/// Idempotent: repeated cancellation for the same active ID is a no-op success.
/// Unknown or already-finished IDs are ignored, so arbitrary IPC input cannot grow the registry.
pub fn cancel_scan(session_id: &str) {
    let id = session_id.trim();
    if id.is_empty() {
        return;
    }

    let cancellation = lock_registry().sessions.get(id).cloned();
    if let Some(cancellation) = cancellation {
        cancellation.cancel();
    }
}

pub fn is_cancelled(session_id: &str) -> bool {
    lock_registry()
        .sessions
        .get(session_id)
        .is_some_and(CancellationToken::is_cancelled)
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
        assert!(sessions.sessions.contains_key(&id));
        assert!(sessions.sessions[&id].is_cancelled());
        drop(sessions);

        drop(session);
        assert!(!is_cancelled(&id));
        let sessions = lock_registry();
        assert!(!sessions.sessions.contains_key(&id));
    }

    #[test]
    fn unknown_and_blank_ids_do_not_enter_the_registry() {
        let unknown_id = Uuid::new_v4().to_string();

        cancel_scan(&unknown_id);
        cancel_scan("  ");

        assert!(!is_cancelled(&unknown_id));
        let sessions = lock_registry();
        assert!(!sessions.sessions.contains_key(&unknown_id));
    }

    #[test]
    fn dropping_an_uncancelled_session_removes_its_active_marker() {
        let session = new_session();
        let id = session.id().to_owned();
        assert!(lock_registry().sessions.contains_key(&id));

        drop(session);

        assert!(!lock_registry().sessions.contains_key(&id));
    }

    #[tokio::test]
    async fn cancellation_wakes_waiters_without_polling() {
        let session = new_session();
        let id = session.id().to_owned();
        let cancellation = session.cancellation_token();
        let waiter = tokio::spawn(async move { cancellation.cancelled().await });

        cancel_scan(&id);

        tokio::time::timeout(std::time::Duration::from_secs(1), waiter)
            .await
            .expect("cancellation wakes waiter")
            .expect("waiter task completes");
        assert!(is_cancelled(&id));
    }
}
