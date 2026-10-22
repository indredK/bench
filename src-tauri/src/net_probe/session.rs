//! Scan session registry for cancelScan (idempotent).

use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use tokio::sync::watch;
use uuid::Uuid;

fn cancelled() -> &'static Mutex<HashSet<String>> {
    static CANCELLED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    CANCELLED.get_or_init(|| Mutex::new(HashSet::new()))
}

fn cancellable_sessions() -> &'static Mutex<HashMap<String, watch::Sender<bool>>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, watch::Sender<bool>>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn new_session_id() -> String {
    Uuid::new_v4().to_string()
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
    let id = Uuid::new_v4().to_string();
    let (cancel, receiver) = watch::channel(false);
    cancellable_sessions()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(id.clone(), cancel);
    CancellableSession {
        id,
        cancellation: receiver,
    }
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
    let cancel = cancellable_sessions()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(id)
        .cloned();
    if let Some(cancel) = cancel {
        cancel.send_replace(true);
    }
}

pub fn is_cancelled(session_id: &str) -> bool {
    let requested = cancelled()
        .lock()
        .map(|guard| guard.contains(session_id))
        .unwrap_or(false);
    let signaled = cancellable_sessions()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(session_id)
        .cloned();
    requested || signaled.map(|sender| *sender.borrow()).unwrap_or(false)
}

pub fn clear_session(session_id: &str) {
    if let Ok(mut guard) = cancelled().lock() {
        guard.remove(session_id);
    }
    cancellable_sessions()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(session_id);
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

    #[test]
    fn cancelling_an_unknown_session_does_not_create_a_cancellation_signal() {
        let unknown = format!("unknown-{}", Uuid::new_v4());
        cancel_scan(unknown.clone());
        assert!(is_cancelled(&unknown));
        clear_session(&unknown);
        assert!(!is_cancelled(&unknown));
    }
}
