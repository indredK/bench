//! Shell Utilities / Shell 工具
//!
//! Shared helpers for shelling out to system commands safely.

/// Shell-escape a path or argument for use inside `sh -c "..."`.
///
/// Wraps the value in single quotes and escapes any embedded single quotes
/// using the standard `'\''` sequence. This is the only fully safe way to
/// embed arbitrary data in a shell command string.
pub(crate) fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
