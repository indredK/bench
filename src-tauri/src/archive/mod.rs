//! Shared archive safety policy used by plugin and application installers.

mod permissions;

pub(crate) use permissions::safe_archive_unix_mode;
