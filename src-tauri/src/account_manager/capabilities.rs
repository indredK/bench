use super::types::{AccountManagerCapabilities, AccountManagerCapability};

const REASON_PLATFORM_VALIDATION_PENDING: &str = "TARGET_PLATFORM_VALIDATION_PENDING";
const REASON_KEYRING_FAILED: &str = "CREDENTIAL_STORE_INITIALIZATION_FAILED";
const REASON_PLATFORM_UNSUPPORTED: &str = "PLATFORM_UNSUPPORTED";
const REASON_INDEXED_DB_LIMITED: &str = "INDEXED_DB_SITE_COMPATIBILITY_LIMITED";
const REASON_PROXY_MACOS_14: &str = "NETWORK_PROXY_REQUIRES_MACOS_14";
const REASON_PROXY_UNSUPPORTED: &str = "NETWORK_PROXY_UNSUPPORTED_PLATFORM";
/// 互通（browser_session）：本机未探测到可用的 Chromium 系浏览器。
const REASON_NO_CHROMIUM_BROWSER: &str = "NO_CHROMIUM_BROWSER";

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

    for_platform(
        platform,
        keyring_ready,
        detected_macos_major(),
        !super::browser_session::browser::supported_installations().is_empty(),
    )
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
    chromium_available: bool,
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
            browser_session_open: unsupported(),
            browser_session_capture: unsupported(),
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

    // 互通（browser_session）：会话解密依赖 keyring，且需要一个受支持的 Chromium 系浏览器。
    // 两者任一不满足都 fail-closed，避免前端在不可用平台上暴露入口。
    let browser_session = || {
        if !keyring_ready {
            AccountManagerCapability::failed(REASON_KEYRING_FAILED)
        } else if !chromium_available {
            AccountManagerCapability::failed(REASON_NO_CHROMIUM_BROWSER)
        } else {
            AccountManagerCapability::partial(REASON_PLATFORM_VALIDATION_PENDING)
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
            // 不依赖上方早退守卫的隐式不变式：显式降级，避免生产路径 panic。
            Platform::Other => AccountManagerCapability::unsupported(REASON_PROXY_UNSUPPORTED),
        },
        deep_link: AccountManagerCapability::partial(REASON_PLATFORM_VALIDATION_PENDING),
        browser_session_open: browser_session(),
        browser_session_capture: browser_session(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::account_manager::types::CapabilityStatus;

    #[test]
    fn windows_keeps_webview_features_partial_and_proxy_unsupported() {
        let capabilities = for_platform(Platform::Windows, true, None, true);
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
        let capabilities = for_platform(Platform::Macos, false, Some(14), true);
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
        let capabilities = for_platform(Platform::Other, true, None, true);
        assert_eq!(
            capabilities.isolated_webview.status,
            CapabilityStatus::Unsupported
        );
        assert_eq!(capabilities.deep_link.status, CapabilityStatus::Unsupported);
    }

    #[test]
    fn old_macos_rejects_webview_proxy_instead_of_trying_it() {
        let capabilities = for_platform(Platform::Macos, true, Some(13), true);
        assert_eq!(
            capabilities.network_proxy.status,
            CapabilityStatus::Unsupported
        );
    }

    #[test]
    fn browser_session_is_partial_when_platform_and_browser_are_ready() {
        let capabilities = for_platform(Platform::Macos, true, Some(14), true);
        assert_eq!(
            capabilities.browser_session_open.status,
            CapabilityStatus::Partial
        );
        assert_eq!(
            capabilities.browser_session_capture.status,
            CapabilityStatus::Partial
        );
    }

    #[test]
    fn browser_session_fails_closed_without_chromium_browser() {
        let capabilities = for_platform(Platform::Macos, true, Some(14), false);
        assert_eq!(
            capabilities.browser_session_open.status,
            CapabilityStatus::Failed
        );
        assert_eq!(
            capabilities.browser_session_open.reason_code.as_deref(),
            Some(REASON_NO_CHROMIUM_BROWSER)
        );
        assert_eq!(
            capabilities.browser_session_capture.status,
            CapabilityStatus::Failed
        );
    }

    #[test]
    fn browser_session_fails_closed_when_keyring_is_unavailable() {
        // keyring 失败优先于浏览器可用性：无法解密会话时不应暴露浏览器入口。
        let capabilities = for_platform(Platform::Macos, false, Some(14), true);
        assert_eq!(
            capabilities.browser_session_capture.reason_code.as_deref(),
            Some(REASON_KEYRING_FAILED)
        );
    }

    #[test]
    fn unsupported_platform_rejects_browser_session() {
        let capabilities = for_platform(Platform::Other, true, None, true);
        assert_eq!(
            capabilities.browser_session_open.status,
            CapabilityStatus::Unsupported
        );
        assert_eq!(
            capabilities.browser_session_capture.status,
            CapabilityStatus::Unsupported
        );
    }
}
