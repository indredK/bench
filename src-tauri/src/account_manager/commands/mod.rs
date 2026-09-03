//! account_manager command surface, split by domain owner.
//!
//! Glob re-exports keep the `invoke_handler` registration list unchanged
//! (`$crate::account_manager::commands::<cmd>` — no IPC name changes, ROADMAP R01
//! 禁止项) and keep the hidden `__cmd__*` / `__tauri_command_name_*` wrapper
//! macros resolvable at the same path (tauri::command generates them next to the
//! fn and re-exports them only via the defining module).

mod account;
mod external_apps;
mod import_export;
mod proxy;
mod refresh;
mod shared;
mod station;

pub use account::*;
pub use external_apps::*;
pub use import_export::*;
pub use proxy::*;
pub use refresh::*;
pub use station::*;

// 供兄弟模块复用的时间标签（session.rs / detection.rs 经 super::commands::now_label 访问）。
pub use shared::now_label;
