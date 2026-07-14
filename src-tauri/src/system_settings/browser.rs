use crate::error::{AppError, AppResult};

const MAX_BUNDLE_ID_LEN: usize = 255;

fn canonicalize_bundle_id(bundle_id: &str) -> AppResult<String> {
    let value = bundle_id.trim();
    if value.is_empty() || value.len() > MAX_BUNDLE_ID_LEN {
        return Err(AppError::invalid_input("Invalid browser bundle identifier"));
    }

    let segments: Vec<&str> = value.split('.').collect();
    if segments.len() < 2
        || segments.iter().any(|segment| {
            segment.is_empty()
                || segment.starts_with('-')
                || segment.ends_with('-')
                || !segment
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
    {
        return Err(AppError::invalid_input("Invalid browser bundle identifier"));
    }

    Ok(value.to_ascii_lowercase())
}

#[cfg(target_os = "macos")]
mod launch_services {
    use super::*;
    use core_foundation::{
        base::{OSStatus, TCFType},
        string::{CFString, CFStringRef},
    };

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSCopyDefaultHandlerForURLScheme(scheme: CFStringRef) -> CFStringRef;
        fn LSSetDefaultHandlerForURLScheme(
            scheme: CFStringRef,
            handler_bundle_id: CFStringRef,
        ) -> OSStatus;
    }

    fn status_result(operation: &str, status: OSStatus) -> AppResult<()> {
        if status == 0 {
            Ok(())
        } else {
            Err(AppError::new(
                "DEFAULT_BROWSER_CHANGE_FAILED",
                format!("LaunchServices {operation} failed with status {status}"),
            ))
        }
    }

    pub fn get_handler(scheme: &str) -> AppResult<String> {
        let scheme = CFString::new(scheme);
        let handler_ref = unsafe { LSCopyDefaultHandlerForURLScheme(scheme.as_concrete_TypeRef()) };
        if handler_ref.is_null() {
            return Err(AppError::new(
                "DEFAULT_BROWSER_UNKNOWN",
                "macOS did not report a default browser",
            ));
        }

        let handler = unsafe { CFString::wrap_under_create_rule(handler_ref) };
        canonicalize_bundle_id(&handler.to_string())
    }

    fn set_handler(scheme: &str, bundle_id: &CFString) -> AppResult<()> {
        let scheme = CFString::new(scheme);
        let status = unsafe {
            LSSetDefaultHandlerForURLScheme(
                scheme.as_concrete_TypeRef(),
                bundle_id.as_concrete_TypeRef(),
            )
        };
        status_result("set handler", status)
    }

    pub fn set_default_browser(bundle_id: &str) -> AppResult<String> {
        let canonical = canonicalize_bundle_id(bundle_id)?;
        let previous_http = get_handler("http").ok();
        let previous_https = get_handler("https").ok();
        let bundle_id = CFString::new(&canonical);

        if let Err(error) =
            set_handler("http", &bundle_id).and_then(|_| set_handler("https", &bundle_id))
        {
            if let Some(previous) = previous_http {
                let _ = set_handler("http", &CFString::new(&previous));
            }
            if let Some(previous) = previous_https {
                let _ = set_handler("https", &CFString::new(&previous));
            }
            return Err(error);
        }

        let actual_http = get_handler("http")?;
        let actual_https = get_handler("https")?;
        if actual_http != canonical || actual_https != canonical {
            return Err(AppError::new(
                "DEFAULT_BROWSER_CHANGE_REQUIRES_USER_ACTION",
                "macOS did not accept the default browser change; open System Settings to finish it",
            ));
        }

        Ok(actual_https)
    }
}

#[tauri::command]
pub async fn get_default_browser() -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "macos")]
        {
            launch_services::get_handler("https")
        }

        #[cfg(not(target_os = "macos"))]
        {
            Err(AppError::unsupported(
                "Default browser management is only supported on macOS",
            ))
        }
    })
    .await
    .map_err(|error| AppError::task_failed(format!("get_default_browser: {error}")))?
}

#[tauri::command]
pub async fn set_default_browser(bundle_id: String) -> AppResult<String> {
    canonicalize_bundle_id(&bundle_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        {
            launch_services::set_default_browser(&bundle_id)
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = bundle_id;
            Err(AppError::unsupported(
                "Default browser management is only supported on macOS",
            ))
        }
    })
    .await
    .map_err(|error| AppError::task_failed(format!("set_default_browser: {error}")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonicalizes_bundle_identifier_case() {
        assert_eq!(
            canonicalize_bundle_id(" com.Google.Chrome ").unwrap(),
            "com.google.chrome"
        );
    }

    #[test]
    fn rejects_shell_text_and_malformed_identifiers() {
        for invalid in ["", "Safari", ".com.apple", "com..apple", "com.apple;open"] {
            assert!(canonicalize_bundle_id(invalid).is_err(), "{invalid}");
        }
    }
}
