use crate::error::AppError;
use std::sync::Arc;
use std::sync::Mutex;
use tauri_plugin_updater::Update;
use tokio::sync::{watch, Notify};

/// Caches the `Update` handle returned by the most recent `check_for_app_update`
/// so `download_and_install_app_update` can reuse it instead of issuing a
/// second HTTP request to the update manifest. Reusing the cached handle also
/// prevents a race where the manifest publishes a new version between the
/// user's "check" and "install" clicks and the downloaded version diverges
/// from the version shown in the UI.
///
/// The cache also implements:
///   - **In-flight check de-duplication** (#050): concurrent
///     `check_for_app_update` calls coalesce onto a single underlying
///     manifest request via a `watch` channel. The first caller fires the
///     real check; the rest await the published result without making extra
///     HTTP calls.
///   - **Install-failure preservation** (#051): when `download_and_install`
///     fails, the consumed `Update` is replaced into the cache so the next
///     invocation can retry without re-checking the manifest.
///   - **Cancellation handle** (#052): a `Notify` is exposed so the install
///     command can `tokio::select!` against `cancel_signal.notified()`. The
///     dedicated `cancel_app_update_download` command pings the notifier.
pub struct UpdaterCache {
    /// The most recently observed `Update` handle. `None` means "no update
    /// known"; `Some` means a check (or a failed install retry) provided a
    /// concrete update we can install.
    pending: Mutex<Option<Update>>,
    /// In-flight check coalescing. `None` outside of an active check;
    /// `Some(rx)` while a check is running so other callers can subscribe.
    in_flight: Mutex<Option<watch::Receiver<Option<InFlightCheckResult>>>>,
    /// Cancellation signal used by `download_and_install_app_update` to
    /// short-circuit `tokio::select!` when the user clicks Cancel.
    cancel_signal: Arc<Notify>,
}

/// Result published over the in-flight `watch` channel. We keep the payload
/// `Clone` so multiple subscribers can read the same value, hence the
/// duplicated `metadata` fields rather than the original `Update` handle
/// (`Update` is not `Clone`).
#[derive(Debug, Clone)]
pub struct InFlightCheckResult {
    pub available: bool,
    pub version: Option<String>,
    pub date: Option<String>,
    pub body: Option<String>,
    pub error: Option<AppError>,
}

impl Default for UpdaterCache {
    fn default() -> Self {
        Self {
            pending: Mutex::new(None),
            in_flight: Mutex::new(None),
            cancel_signal: Arc::new(Notify::new()),
        }
    }
}

impl UpdaterCache {
    pub fn store(&self, update: Option<Update>) {
        let mut guard = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        *guard = update;
    }

    pub fn take(&self) -> Option<Update> {
        let mut guard = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        guard.take()
    }

    /// Returns a clone of the cancel signal so the command holds it across
    /// `await` points without keeping any cache mutex locked.
    pub fn cancel_signal(&self) -> Arc<Notify> {
        self.cancel_signal.clone()
    }

    /// Wake the current install future (if any). Idempotent: extra calls are
    /// a no-op when no installer is listening.
    pub fn signal_cancel(&self) {
        self.cancel_signal.notify_waiters();
    }

    /// Try to start a check. Returns `CheckTicket::Leader` if the caller is
    /// the first to enter the critical section and must perform the real
    /// HTTP work; returns `CheckTicket::Follower(rx)` if a check is already
    /// in flight and the caller should `rx.changed().await` for the result.
    pub fn begin_check(&self) -> CheckTicket {
        let mut guard = self.in_flight.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(existing) = guard.as_ref() {
            return CheckTicket::Follower(existing.clone());
        }
        let (tx, rx) = watch::channel(None);
        *guard = Some(rx);
        CheckTicket::Leader(InFlightLeader {
            tx,
            // Hand a reference to self so finish_check can clear the slot.
            // We cannot keep a borrow here, so finish_check below uses the
            // shared mutex directly.
        })
    }

    /// Called by the leader to publish its result and release the slot.
    /// Once `finish_check` returns, late followers see the published value
    /// via `rx.borrow()` and the slot is reset so the next call starts a
    /// fresh check.
    pub fn finish_check(&self, leader: InFlightLeader, value: InFlightCheckResult) {
        // Publish first so subscribers see the value as soon as they wake.
        let _ = leader.tx.send(Some(value));
        let mut guard = self.in_flight.lock().unwrap_or_else(|e| e.into_inner());
        *guard = None;
    }
}

/// Handle held by the leader of an in-flight check.
pub struct InFlightLeader {
    tx: watch::Sender<Option<InFlightCheckResult>>,
}

/// What `UpdaterCache::begin_check` returns.
pub enum CheckTicket {
    Leader(InFlightLeader),
    Follower(watch::Receiver<Option<InFlightCheckResult>>),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn begin_check_dedupes_concurrent_callers() {
        let cache = UpdaterCache::default();
        // First caller is leader.
        let t1 = cache.begin_check();
        match &t1 {
            CheckTicket::Leader(_) => {}
            _ => panic!("first ticket must be leader"),
        }
        // Second caller, while leader is still working, is follower.
        let t2 = cache.begin_check();
        let mut rx = match t2 {
            CheckTicket::Follower(rx) => rx,
            _ => panic!("second ticket must be follower"),
        };
        // Leader publishes.
        let leader = match t1 {
            CheckTicket::Leader(l) => l,
            _ => unreachable!(),
        };
        cache.finish_check(
            leader,
            InFlightCheckResult {
                available: true,
                version: Some("1.2.3".into()),
                date: None,
                body: None,
                error: None,
            },
        );
        // Follower wakes and reads.
        rx.changed().await.unwrap();
        let v = rx.borrow().clone().unwrap();
        assert_eq!(v.version.as_deref(), Some("1.2.3"));

        // A new third caller after finish_check is again a leader.
        let t3 = cache.begin_check();
        match t3 {
            CheckTicket::Leader(_) => {}
            _ => panic!("post-finish ticket must be a fresh leader"),
        }
    }

    #[tokio::test]
    async fn signal_cancel_wakes_a_waiting_listener() {
        let cache = UpdaterCache::default();
        let notify = cache.cancel_signal();
        let h = tokio::spawn(async move {
            notify.notified().await;
            "woke"
        });
        // Give the task a tick to register as a listener.
        tokio::task::yield_now().await;
        cache.signal_cancel();
        assert_eq!(h.await.unwrap(), "woke");
    }
}
