//! Scan session registry for cancellation with idempotent signaling and RAII cleanup.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tokio::sync::watch;
use uuid::Uuid;

fn sessions() -> &'static Mutex<HashMap<String, watch::Sender<bool>>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, watch::Sender<bool>>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_session() -> (String, watch::Sender<bool>, watch::Receiver<bool>) {
    let id = Uuid::new_v4().to_string();
    let (cancel, receiver) = watch::channel(false);
    sessions()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .insert(id.clone(), cancel.clone());
    (id, cancel, receiver)
}

pub fn new_session_id() -> String {
    register_session().0
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

/// A speed-test session with an immediate cancellation signal and RAII cleanup.
pub struct CancellableSession {
    pub id: String,
    pub cancellation: watch::Receiver<bool>,
}

impl Drop for CancellableSession {
    fn drop(&mut self) {
        clear_session(&self.id);
    }
}

pub fn new_cancellable_session() -> CancellableSession {
    let (id, _cancel, receiver) = register_session();
    CancellableSession {
        id,
        cancellation: receiver,
    }
}

/// Unknown or repeated IDs are harmless; active sessions receive an immediate signal.
pub fn cancel_scan(session_id: String) {
    let id = session_id.trim();
    if id.is_empty() {
        return;
    }

    let cancel = sessions()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .get(id)
        .cloned();
    if let Some(cancel) = cancel {
        cancel.send_replace(true);
    }
}

pub fn is_cancelled(session_id: &str) -> bool {
    let cancel = sessions()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .get(session_id)
        .cloned();
    cancel.map(|signal| *signal.borrow()).unwrap_or(false)
}

/// Wait for an immediate cancellation signal from a registered session.
pub async fn wait_for_cancel(session_id: &str) {
    let Some(cancel) = sessions()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .get(session_id)
        .cloned()
    else {
        return;
    };
    let mut receiver = cancel.subscribe();

    loop {
        if *receiver.borrow() || receiver.changed().await.is_err() {
            return;
        }
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
    fn cancel_is_idempotent_and_session_cleanup_allows_reuse() {
        let session_id = new_session_id();
        let _guard = SessionGuard::new(session_id.clone());
        assert!(!is_cancelled(&session_id));

        cancel_scan(session_id.clone());
        cancel_scan(session_id.clone());
        assert!(is_cancelled(&session_id));

        clear_session(&session_id);
        assert!(!is_cancelled(&session_id));
    }

    #[test]
    fn blank_and_unknown_session_ids_are_ignored() {
        let unknown = Uuid::new_v4().to_string();
        cancel_scan(" \t ".into());
        cancel_scan(unknown.clone());
        assert!(!is_cancelled(""));
        assert!(!is_cancelled(" \t "));
        assert!(!is_cancelled(&unknown));
        assert!(sessions()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .is_empty());
    }

    #[tokio::test]
    async fn cancellation_signal_reaches_active_session_receivers() {
        let mut session = new_cancellable_session();
        let session_id = session.id.clone();

        cancel_scan(session_id.clone());

        assert!(session.cancellation.changed().await.is_ok());
        assert!(*session.cancellation.borrow());
        assert!(is_cancelled(&session_id));

        clear_session(&session_id);
        assert!(!is_cancelled(&session_id));
    }

    #[tokio::test]
    async fn wait_for_cancel_returns_on_the_first_signal() {
        let session_id = new_session_id();
        let _guard = SessionGuard::new(session_id.clone());
        let wait = wait_for_cancel(&session_id);
        cancel_scan(session_id.clone());
        tokio::time::timeout(std::time::Duration::from_millis(100), wait)
            .await
            .expect("active session cancellation should wake immediately");
    }

    #[test]
    fn session_guard_clears_the_entry_on_scope_exit() {
        let session_id = new_session_id();
        assert!(sessions()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .contains_key(&session_id));

        {
            let _guard = SessionGuard::new(session_id.clone());
        }

        assert!(!sessions()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .contains_key(&session_id));
    }
}
