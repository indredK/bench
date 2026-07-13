//! 分层探针引擎 — HTTP HEAD probe + WebView 多源证据 probe + 自适应降级
use super::detection;
use super::session;
use super::state::AccountManagerState;
use super::storage;
use super::types::*;
use super::webview;
use reqwest::header::COOKIE;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;
use tokio::time::{sleep, timeout, Instant};

const HTTP_PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const HTTP_PROBE_MAX_BODY_BYTES: usize = 200_000;

fn init_script() -> String {
    format!("(function(){{window.__probeBillingSnapshot=function(){{var b=document.body;var r=(b&&b.innerText)?b.innerText:'';return r.length>{}?r.slice(0,{}):r;}};}})();", 200_000, 200_000)
}

async fn eval_text<R: Runtime>(window: &tauri::WebviewWindow<R>) -> AccountManagerResult<String> {
    let (tx, rx) = oneshot::channel::<String>();
    let slot: Arc<Mutex<Option<oneshot::Sender<String>>>> = Arc::new(Mutex::new(Some(tx)));
    window
        .eval_with_callback(
            "window.__probeBillingSnapshot?window.__probeBillingSnapshot():''",
            move |r| {
                if let Ok(mut g) = slot.lock() {
                    if let Some(s) = g.take() {
                        let _ = s.send(r);
                    }
                }
            },
        )
        .map_err(|e| AccountManagerError::store_fail(format!("eval: {e}")))?;
    let payload = timeout(Duration::from_millis(2000), rx)
        .await
        .map_err(|_| AccountManagerError::store_fail("timeout"))?
        .map_err(|_| AccountManagerError::store_fail("closed"))?;
    let text: String = serde_json::from_str(&payload)
        .map_err(|e| AccountManagerError::store_fail(format!("decode: {e}")))?;
    if text.is_empty() {
        return Err(AccountManagerError::store_fail("empty"));
    }
    Ok(text)
}

pub struct ProbeOutcome {
    pub status: AccountSessionStatus,
}

async fn run_http_probe(
    website: &str,
    config: &LoginDetectionConfig,
    saved_session: Option<&AccountSession>,
    proxy_url: Option<&str>,
) -> AccountManagerResult<Option<ProbeOutcome>> {
    let target = url::Url::parse(website)
        .map_err(|e| AccountManagerError::invalid_input(format!("url: {e}")))?;
    let mut client = reqwest::Client::builder()
        .timeout(HTTP_PROBE_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none());
    if let Some(proxy_url) = proxy_url {
        client = client.proxy(
            reqwest::Proxy::all(proxy_url)
                .map_err(|e| AccountManagerError::invalid_input(format!("proxy: {e}")))?,
        );
    }
    let client = client
        .build()
        .map_err(|e| AccountManagerError::store_fail(format!("HTTP probe client: {e}")))?;
    let cookie_header = saved_session
        .map(|session| cookie_header_for_url(session, &target))
        .filter(|header| !header.is_empty());
    let mut request = client.get(target);
    if let Some(header) = cookie_header {
        request = request.header(COOKIE, header);
    }
    let mut response = request
        .send()
        .await
        .map_err(|e| AccountManagerError::store_fail(format!("HTTP probe request: {e}")))?;
    if response.status().is_redirection() {
        return Ok(None);
    }
    if matches!(response.status().as_u16(), 401 | 403) {
        return Ok(Some(ProbeOutcome {
            status: AccountSessionStatus::LoginRequired,
        }));
    }
    if !response.status().is_success() {
        return Ok(None);
    }

    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| AccountManagerError::store_fail(format!("HTTP probe body: {e}")))?
    {
        let remaining = HTTP_PROBE_MAX_BODY_BYTES.saturating_sub(body.len());
        if remaining == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
    }
    let text = String::from_utf8_lossy(&body);
    Ok(detection::classify_confident(&text, config).map(|status| ProbeOutcome { status }))
}

fn cookie_header_for_url(session: &AccountSession, target: &url::Url) -> String {
    let Some(host) = target.host_str() else {
        return String::new();
    };
    let path = target.path();
    session
        .cookies
        .iter()
        .filter(|cookie| {
            let domain = cookie.domain.trim().trim_start_matches('.');
            let domain_matches = if domain.is_empty() {
                false
            } else if cookie.host_only {
                host.eq_ignore_ascii_case(domain)
            } else {
                host.eq_ignore_ascii_case(domain)
                    || host
                        .to_ascii_lowercase()
                        .ends_with(&format!(".{}", domain.to_ascii_lowercase()))
            };
            let cookie_path = if cookie.path.is_empty() {
                "/"
            } else {
                cookie.path.as_str()
            };
            domain_matches
                && path.starts_with(cookie_path)
                && (!cookie.secure || target.scheme() == "https")
        })
        .map(|cookie| format!("{}={}", cookie.name, cookie.value))
        .collect::<Vec<_>>()
        .join("; ")
}

pub fn probe_window_label(account_id: &str) -> String {
    format!("relay-probe-{account_id}")
}

/// 重置 station 的探针失败计数与策略（恢复为自动/默认）。
pub fn reset_probe_strategy<R: Runtime>(
    app: &AppHandle<R>,
    station_id: &str,
) -> AccountManagerResult<RelayStation> {
    let state = app.state::<AccountManagerState>();
    storage::with_state_mut(app, &state, |snapshot| {
        let station = snapshot
            .stations
            .iter_mut()
            .find(|s| s.id == station_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("station {station_id}")))?;
        station.probe_failure_count = 0;
        if let Some(ref mut profile) = station.auth_profile {
            // 恢复为默认的自动策略（HTTP 优先）
            profile.probe_strategy = ProbeStrategy::HttpFirst;
        }
        Ok(station.clone())
    })
}

/// 手动覆盖 station 的探针策略。
pub fn set_probe_strategy<R: Runtime>(
    app: &AppHandle<R>,
    station_id: &str,
    strategy: ProbeStrategy,
) -> AccountManagerResult<RelayStation> {
    let state = app.state::<AccountManagerState>();
    storage::with_state_mut(app, &state, |snapshot| {
        let station = snapshot
            .stations
            .iter_mut()
            .find(|s| s.id == station_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("station {station_id}")))?;
        // 确保 auth_profile 存在，再写入手动策略
        let profile = station
            .auth_profile
            .get_or_insert_with(AuthProfile::default);
        profile.probe_strategy = strategy;
        // 手动覆盖时重置失败计数，避免立刻被自适应降级覆盖
        station.probe_failure_count = 0;
        Ok(station.clone())
    })
}

#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
pub async fn run_probe<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    website: &str,
    config: &LoginDetectionConfig,
    strategy: ProbeStrategy,
    proxy_url: Option<&str>,
) -> AccountManagerResult<ProbeOutcome> {
    let saved_session = {
        let state = app.state::<AccountManagerState>();
        session::restore_session(&state, account_id)?
    };
    if matches!(
        strategy,
        ProbeStrategy::HttpFirst | ProbeStrategy::HttpOnly | ProbeStrategy::Hybrid
    ) {
        match run_http_probe(website, config, saved_session.as_ref(), proxy_url).await {
            Ok(Some(outcome))
                if strategy != ProbeStrategy::Hybrid
                    || outcome.status == AccountSessionStatus::Ready =>
            {
                return Ok(outcome);
            }
            Ok(Some(_)) => {}
            Ok(None) if strategy == ProbeStrategy::HttpOnly => {
                return Ok(ProbeOutcome {
                    status: AccountSessionStatus::FetchFailed,
                });
            }
            Err(error) if strategy == ProbeStrategy::HttpOnly => return Err(error),
            Ok(None) | Err(_) => {}
        }
    }

    let label = probe_window_label(account_id);
    if let Some(e) = app.get_webview_window(&label) {
        let _ = e.close();
    }
    let parsed: tauri::Url = website
        .parse()
        .map_err(|e| AccountManagerError::invalid_input(format!("url: {e}")))?;
    let blank: tauri::Url = "about:blank"
        .parse()
        .map_err(|e| AccountManagerError::invalid_input(format!("blank url: {e}")))?;
    let data_dir = webview::account_data_dir(app, account_id)?;
    if let Some(p) = data_dir.parent() {
        std::fs::create_dir_all(p)
            .map_err(|e| AccountManagerError::store_fail(format!("dir: {e}")))?;
    }
    let dead = Instant::now() + Duration::from_millis(5000);
    let (tx, rx) = oneshot::channel::<()>();
    let slot: Arc<Mutex<Option<oneshot::Sender<()>>>> = Arc::new(Mutex::new(Some(tx)));
    let window = {
        #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(unused_mut))]
        let mut b = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(blank))
            .visible(false)
            .data_directory(data_dir)
            .initialization_script(init_script())
            .on_page_load(move |_, p| {
                if !matches!(p.event(), tauri::webview::PageLoadEvent::Finished) {
                    return;
                }
                if p.url().scheme() == "about" {
                    return;
                }
                if let Ok(mut g) = slot.lock() {
                    if let Some(s) = g.take() {
                        let _ = s.send(());
                    }
                }
            });
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        {
            b = b.data_store_identifier(webview::account_data_store_identifier(account_id));
        }
        #[cfg(target_os = "macos")]
        if let Some(url) = proxy_url {
            let parsed_url = url.parse::<tauri::Url>().map_err(|e| {
                AccountManagerError::invalid_input(format!("invalid network proxy URL: {e}"))
            })?;
            b = b.proxy_url(parsed_url);
        }
        #[cfg(not(target_os = "macos"))]
        if proxy_url.is_some() {
            return Err(AccountManagerError::invalid_input(
                "network proxy is not supported for probe WebViews on this platform",
            ));
        }
        b.build()
            .map_err(|e| AccountManagerError::store_fail(format!("build: {e}")))?
    };
    if let Some(saved) = saved_session {
        session::inject_session(&window, &saved)?;
    }
    window
        .navigate(parsed)
        .map_err(|e| AccountManagerError::store_fail(format!("navigate: {e}")))?;
    let load = tokio::time::timeout_at(dead, rx).await;
    let out = match load {
        Err(_) | Ok(Err(_)) => None,
        Ok(Ok(())) => {
            let pd = Instant::now() + Duration::from_millis(8000);
            let mut lt: Option<String> = None;
            let mut out = None;
            let iv = Duration::from_millis(500);
            while Instant::now() < pd {
                match eval_text(&window).await {
                    Ok(t) => {
                        if let Some(s) = detection::classify_confident(&t, config) {
                            out = Some(s);
                            break;
                        }
                        lt = Some(t);
                    }
                    Err(_) => {
                        sleep(iv).await;
                        continue;
                    }
                }
                sleep(iv).await;
            }
            if out.is_none() {
                lt.map(|t| detection::classify(&t, config))
            } else {
                out
            }
        }
    };
    let _ = window.close();
    Ok(match out {
        Some(s) => ProbeOutcome { status: s },
        None => ProbeOutcome {
            status: AccountSessionStatus::FetchFailed,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cookie(name: &str, domain: &str, path: &str, secure: bool) -> CookieEntry {
        CookieEntry {
            name: name.into(),
            value: "value".into(),
            domain: domain.into(),
            path: path.into(),
            secure,
            ..Default::default()
        }
    }

    #[test]
    fn http_probe_only_sends_cookies_matching_target_scope() {
        let session = AccountSession {
            cookies: vec![
                cookie("root", ".example.com", "/", true),
                cookie("api", "api.example.com", "/v1", true),
                cookie("wrong-domain", "evil.example", "/", true),
                cookie("wrong-path", "api.example.com", "/admin", true),
            ],
            ..Default::default()
        };
        let target = url::Url::parse("https://api.example.com/v1/me").unwrap();

        assert_eq!(
            cookie_header_for_url(&session, &target),
            "root=value; api=value"
        );
    }

    #[test]
    fn secure_cookie_is_not_sent_over_http() {
        let session = AccountSession {
            cookies: vec![cookie("secure", "127.0.0.1", "/", true)],
            ..Default::default()
        };
        let target = url::Url::parse("http://127.0.0.1:3000/").unwrap();

        assert!(cookie_header_for_url(&session, &target).is_empty());
    }
}
