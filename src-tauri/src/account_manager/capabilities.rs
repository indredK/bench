use super::types::{AccountManagerCapabilities, AccountManagerCapability};

const REASON_PLATFORM_VALIDATION_PENDING: &str = "TARGET_PLATFORM_VALIDATION_PENDING";
const REASON_KEYRING_FAILED: &str = "CREDENTIAL_STORE_INITIALIZATION_FAILED";
const REASON_PLATFORM_UNSUPPORTED: &str = "PLATFORM_UNSUPPORTED";
const REASON_INDEXED_DB_LIMITED: &str = "INDEXED_DB_SITE_COMPATIBILITY_LIMITED";
const REASON_PROXY_MACOS_14: &str = "NETWORK_PROXY_REQUIRES_MACOS_14";
const REASON_PROXY_UNSUPPORTED: &str = "NETWORK_PROXY_UNSUPPORTED_PLATFORM";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Platform {
    Macos,
    Windows,
    Other,
}

pub fn current(keyring_ready: bool) -> AccountManagerCapabilities {
    let platform = match std::env::consts::OS {
        "macos" => Platform::Macos,
        "windows" => Platform::Windows,
        _ => Platform::Other,
    };

    for_platform(platform, keyring_ready, detected_macos_major())
}

pub fn network_proxy_available() -> bool {
    std::env::consts::OS == "macos" && detected_macos_major().is_some_and(|major| major >= 14)
}

fn detected_macos_major() -> Option<u32> {
    if std::env::consts::OS != "macos" {
        return None;
    }
    sysinfo::System::long_os_version()?
        .split(|character: char| !character.is_ascii_digit())
        .find(|part| !part.is_empty())?
        .parse()
        .ok()
}

fn for_platform(
    platform: Platform,
    keyring_ready: bool,
    macos_major: Option<u32>,
) -> AccountManagerCapabilities {
    let platform_name = match platform {
        Platform::Macos => "macos",
        Platform::Windows => "windows",
        Platform::Other => "unsupported",
    };

    if platform == Platform::Other {
        let unsupported = || AccountManagerCapability::unsupported(REASON_PLATFORM_UNSUPPORTED);
        return AccountManagerCapabilities {
            platform: platform_name.to_string(),
            credential_store: unsupported(),
            isolated_webview: unsupported(),
            cookie_session: unsupported(),
            web_storage: unsupported(),
            indexed_db: unsupported(),
            network_proxy: unsupported(),
            deep_link: unsupported(),
        };
    }

    let credential_store = if keyring_ready {
        AccountManagerCapability::partial(REASON_PLATFORM_VALIDATION_PENDING)
    } else {
        AccountManagerCapability::failed(REASON_KEYRING_FAILED)
    };
    let persisted_session = || {
        if keyring_ready {
            AccountManagerCapability::partial(REASON_PLATFORM_VALIDATION_PENDING)
        } else {
            AccountManagerCapability::failed(REASON_KEYRING_FAILED)
        }
    };

    AccountManagerCapabilities {
        platform: platform_name.to_string(),
        credential_store,
        isolated_webview: AccountManagerCapability::partial(REASON_PLATFORM_VALIDATION_PENDING),
        cookie_session: persisted_session(),
        web_storage: persisted_session(),
        indexed_db: if keyring_ready {
            AccountManagerCapability::partial(REASON_INDEXED_DB_LIMITED)
        } else {
            AccountManagerCapability::failed(REASON_KEYRING_FAILED)
        },
        network_proxy: match platform {
            Platform::Macos if macos_major.is_some_and(|major| major >= 14) => {
                AccountManagerCapability::partial(REASON_PROXY_MACOS_14)
            }
            Platform::Macos => AccountManagerCapability::unsupported(REASON_PROXY_MACOS_14),
            Platform::Windows => AccountManagerCapability::unsupported(REASON_PROXY_UNSUPPORTED),
            Platform::Other => unreachable!(),
        },
        deep_link: AccountManagerCapability::partial(REASON_PLATFORM_VALIDATION_PENDING),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::account_manager::types::CapabilityStatus;

    #[test]
    fn windows_keeps_webview_features_partial_and_proxy_unsupported() {
        let capabilities = for_platform(Platform::Windows, true, None);
        assert_eq!(
            capabilities.isolated_webview.status,
            CapabilityStatus::Partial
        );
        assert_eq!(
            capabilities.network_proxy.status,
            CapabilityStatus::Unsupported
        );
        assert_eq!(capabilities.platform, "windows");
    }

    #[test]
    fn keyring_failure_closes_persisted_session_capabilities() {
        let capabilities = for_platform(Platform::Macos, false, Some(14));
        assert_eq!(
            capabilities.credential_store.status,
            CapabilityStatus::Failed
        );
        assert_eq!(capabilities.cookie_session.status, CapabilityStatus::Failed);
        assert_eq!(capabilities.web_storage.status, CapabilityStatus::Failed);
        assert_eq!(capabilities.indexed_db.status, CapabilityStatus::Failed);
    }

    #[test]
    fn unsupported_platform_does_not_advertise_desktop_capabilities() {
        let capabilities = for_platform(Platform::Other, true, None);
        assert_eq!(
            capabilities.isolated_webview.status,
            CapabilityStatus::Unsupported
        );
        assert_eq!(capabilities.deep_link.status, CapabilityStatus::Unsupported);
    }

    #[test]
    fn old_macos_rejects_webview_proxy_instead_of_trying_it() {
        let capabilities = for_platform(Platform::Macos, true, Some(13));
        assert_eq!(
            capabilities.network_proxy.status,
            CapabilityStatus::Unsupported
        );
    }
}
