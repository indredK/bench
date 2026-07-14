use tauri::{AppHandle, Emitter, Manager, Runtime};

use super::state::{AccountManagerState, AuthProxyInboxStatus};

pub const AUTH_PROXY_PENDING_EVENT: &str = "account-manager:auth-proxy-pending";

fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

fn enqueue_urls<R, I>(app: &AppHandle<R>, urls: I)
where
    R: Runtime,
    I: IntoIterator<Item = String>,
{
    let state = app.state::<AccountManagerState>();
    let mut latest_status: Option<AuthProxyInboxStatus> = None;
    for url in urls {
        match state.enqueue_auth_proxy_url(url) {
            Ok(status) => latest_status = Some(status),
            Err(_) => eprintln!("[account_manager] rejected invalid auth proxy deep link"),
        }
    }

    if let Some(status) = latest_status {
        focus_main_window(app);
        if app.emit(AUTH_PROXY_PENDING_EVENT, status).is_err() {
            eprintln!("[account_manager] failed to emit auth proxy inbox event");
        }
    }
}

#[cfg(target_os = "windows")]
pub fn handle_second_instance<R: Runtime>(app: &AppHandle<R>, args: Vec<String>) {
    focus_main_window(app);
    let urls = args.into_iter().filter_map(|arg| {
        url::Url::parse(&arg)
            .ok()
            .filter(|parsed| parsed.scheme() == "bench-auth")
            .map(|parsed| parsed.to_string())
    });
    enqueue_urls(app, urls);
}

#[cfg(desktop)]
pub fn setup<R: Runtime>(app: &tauri::App<R>) {
    use tauri_plugin_deep_link::DeepLinkExt;

    let listener_handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        enqueue_urls(
            &listener_handle,
            event.urls().into_iter().map(|url| url.to_string()),
        );
    });

    match app.deep_link().get_current() {
        Ok(Some(urls)) => enqueue_urls(app.handle(), urls.into_iter().map(|url| url.to_string())),
        Ok(None) => {}
        Err(_) => eprintln!("[account_manager] failed to read startup auth proxy deep link"),
    }
}
