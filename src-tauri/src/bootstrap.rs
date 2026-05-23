// Bootstrap handshake helpers.
//
// The splash window and the main window race during startup: the main
// window's React tree fires `app-bootstrap-main-ready` when it has finished
// mounting, but the splash window registers its event listener
// asynchronously (a dynamic import of `@tauri-apps/api/event`). On fast
// machines (or under cached imports) the emit can finish before the listener
// is attached, leaving the splash visible until the fallback timer expires.
//
// This module exposes a small backend-side flag so both ends can agree on
// the bootstrap state without depending on event timing:
//   - The main window calls `mark_main_ready` once its tree is mounted.
//   - The splash window calls `is_main_ready` immediately after it attaches
//     its listener; if the flag is already set it can reveal the main
//     window without waiting for the (possibly missed) event.
//
// The flag is `AtomicBool` rather than `RwLock<bool>` because the handshake
// has only two transitions (false→true) and we want lock-free reads from
// either window.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Default)]
pub struct BootstrapState {
    main_ready: AtomicBool,
}

pub type SharedBootstrapState = Arc<BootstrapState>;

pub fn create_state() -> SharedBootstrapState {
    Arc::new(BootstrapState::default())
}

#[tauri::command]
pub fn mark_main_ready(state: tauri::State<'_, SharedBootstrapState>) {
    state.main_ready.store(true, Ordering::Release);
}

#[tauri::command]
pub fn is_main_ready(state: tauri::State<'_, SharedBootstrapState>) -> bool {
    state.main_ready.load(Ordering::Acquire)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_ready_defaults_to_false() {
        let state = BootstrapState::default();
        assert!(!state.main_ready.load(Ordering::Acquire));
    }

    #[test]
    fn mark_then_read_is_true() {
        let state = BootstrapState::default();
        state.main_ready.store(true, Ordering::Release);
        assert!(state.main_ready.load(Ordering::Acquire));
    }
}
