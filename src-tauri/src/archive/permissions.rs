//! Permissions from untrusted ZIP metadata must never enable privileged bits.

/// Keeps owner read/write/execute and group/other read/execute permissions.
/// This intentionally strips SUID, SGID, sticky, and group/world write bits.
pub(crate) fn safe_archive_unix_mode(mode: u32) -> u32 {
    mode & 0o755
}

#[cfg(test)]
mod tests {
    use super::safe_archive_unix_mode;

    #[test]
    fn strips_privileged_and_group_world_write_bits() {
        assert_eq!(safe_archive_unix_mode(0o6777), 0o755);
        assert_eq!(safe_archive_unix_mode(0o4755), 0o755);
        assert_eq!(safe_archive_unix_mode(0o2755), 0o755);
        assert_eq!(safe_archive_unix_mode(0o644), 0o644);
    }
}
