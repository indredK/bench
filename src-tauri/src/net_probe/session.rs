//! Scan session registry for cancelScan (idempotent).

use std::collections::HashSet;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::sync::OnceLock;
use uuid::Uuid;

fn cancelled() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn lock_cancelled() -> MutexGuard<'static, HashSet<String>> {
    lock_unpoisoned(cancelled())
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
    lock_cancelled().insert(id.to_string());
}

pub fn is_cancelled(session_id: &str) -> bool {
    lock_cancelled().contains(session_id)
}

pub fn clear_session(session_id: &str) {
    lock_cancelled().remove(session_id);
}

#[cfg(test)]
mod tests {
    use super::{cancel_scan, clear_session, is_cancelled, lock_unpoisoned, new_session_id};
    use std::panic::{catch_unwind, AssertUnwindSafe};
    use std::sync::Mutex;

    #[test]
    fn cancellation_is_idempotent_until_the_session_is_cleared() {
        let session_id = new_session_id();
        cancel_scan(format!(" {session_id} "));
        cancel_scan(session_id.clone());
        assert!(is_cancelled(&session_id));

        clear_session(&session_id);
        assert!(!is_cancelled(&session_id));
    }

    #[test]
    fn poisoned_mutex_can_be_recovered() {
        let mutex = Mutex::new(false);
        let poison_result = catch_unwind(AssertUnwindSafe(|| {
            let _guard = lock_unpoisoned(&mutex);
            panic!("poison the local mutex for recovery test");
        }));
        assert!(poison_result.is_err());

        *lock_unpoisoned(&mutex) = true;
        assert!(*lock_unpoisoned(&mutex));
    }
}
