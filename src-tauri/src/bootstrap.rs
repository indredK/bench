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

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartupIssue {
    pub feature: String,
    pub code: String,
}

#[derive(Default)]
pub struct BootstrapState {
    main_ready: AtomicBool,
    startup_issues: RwLock<Vec<StartupIssue>>,
}

pub type SharedBootstrapState = Arc<BootstrapState>;

pub fn create_state() -> SharedBootstrapState {
    Arc::new(BootstrapState::default())
}

pub fn record_startup_issue(
    state: &SharedBootstrapState,
    feature: impl Into<String>,
    code: impl Into<String>,
) {
    let mut issues = state
        .startup_issues
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    let issue = StartupIssue {
        feature: feature.into(),
        code: code.into(),
    };
    if !issues.contains(&issue) {
        issues.push(issue);
    }
}

#[tauri::command]
pub fn mark_main_ready(state: tauri::State<'_, SharedBootstrapState>) {
    state.main_ready.store(true, Ordering::Release);
}

#[tauri::command]
pub fn is_main_ready(state: tauri::State<'_, SharedBootstrapState>) -> bool {
    state.main_ready.load(Ordering::Acquire)
}

#[tauri::command]
pub fn list_startup_issues(state: tauri::State<'_, SharedBootstrapState>) -> Vec<StartupIssue> {
    state
        .startup_issues
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
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

    #[test]
    fn startup_issues_are_recorded() {
        let state = create_state();
        record_startup_issue(&state, "account-manager", "ACCOUNT_MANAGER_INIT_FAILED");
        record_startup_issue(&state, "account-manager", "ACCOUNT_MANAGER_INIT_FAILED");

        let issues = state
            .startup_issues
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();

        assert_eq!(
            issues,
            vec![StartupIssue {
                feature: "account-manager".into(),
                code: "ACCOUNT_MANAGER_INIT_FAILED".into(),
            }]
        );
    }
}
