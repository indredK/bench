//! bench-capabilities / Bench 能力内核。
//!
//! 平台无关的业务逻辑层：不依赖 Tauri、不依赖任何协议（MCP / Native Messaging / CLI）。
//! 单一事实来源 —— `src-tauri`（Tauri 命令薄壳）与 `bench-host`（协议层二进制）都依赖本 crate。
//!
//! 错误类型 [`error::CapError`] 与主应用 `AppError` 的 serde 形状同构
//! （`{ code, message }`），由上层做 `From` 转换，本 crate 不反向依赖宿主。

pub mod clean_space;
pub mod error;
pub mod guard;
pub mod photo_triage;
pub mod terminology;

pub use error::{CapError, CapResult};
pub use guard::PathGuard;
pub use terminology::StoreLocator;
