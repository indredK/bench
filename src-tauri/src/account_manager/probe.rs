//! 分层探针引擎 — HTTP HEAD probe + WebView 多源证据 probe + 自适应降级
use super::detection;
use super::session;
use super::state::AccountManagerState;
use super::storage;
use super::types::*;
use super::webview;
use reqwest::header::{HeaderMap, COOKIE, RETRY_AFTER, USER_AGENT};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;
use tokio::time::{sleep, timeout, Instant};

const HTTP_PROBE_REQUEST_TIMEOUT: Duration = Duration::from_secs(4);
const HTTP_PROBE_TOTAL_TIMEOUT: Duration = Duration::from_secs(10);
const HTTP_PROBE_MAX_BODY_BYTES: usize = 200_000;
const HTTP_PROBE_MAX_ATTEMPTS: u32 = 3;
const HTTP_PROBE_BACKOFF_BASE_MS: u64 = 200;
const HTTP_PROBE_BACKOFF_MAX_MS: u64 = 2_000;
const HTTP_PROBE_MAX_RETRY_AFTER: Duration = Duration::from_secs(2);

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

fn parse_probe_target(website: &str) -> AccountManagerResult<url::Url> {
    let target = url::Url::parse(website)
        .map_err(|e| AccountManagerError::invalid_input(format!("url: {e}")))?;
    if !matches!(target.scheme(), "http" | "https") || target.host_str().is_none() {
        return Err(AccountManagerError::invalid_input(
            "probe URL must use http or https and include a host",
        ));
    }
    if !target.username().is_empty() || target.password().is_some() {
        return Err(AccountManagerError::invalid_input(
            "probe URL must not contain embedded credentials",
        ));
    }
    Ok(target)
}

fn is_retryable_status(status: reqwest::StatusCode) -> bool {
    matches!(status.as_u16(), 408 | 429 | 500 | 502 | 503 | 504)
}

fn is_retryable_request_error(error: &reqwest::Error) -> bool {
    error.is_connect() || error.is_timeout()
}

fn parse_retry_after(headers: &HeaderMap, now: chrono::DateTime<chrono::Utc>) -> Option<Duration> {
    let value = headers.get(RETRY_AFTER)?.to_str().ok()?.trim();
    if let Ok(seconds) = value.parse::<u64>() {
        return Some(Duration::from_secs(seconds));
    }
    let retry_at = chrono::DateTime::parse_from_rfc2822(value)
        .ok()?
        .with_timezone(&chrono::Utc);
    let delay_ms = retry_at
        .signed_duration_since(now)
        .num_milliseconds()
        .max(0) as u64;
    Some(Duration::from_millis(delay_ms))
}

fn full_jitter_delay(attempt: u32) -> Duration {
    let multiplier = 1u64.checked_shl(attempt).unwrap_or(u64::MAX);
    let cap = HTTP_PROBE_BACKOFF_BASE_MS
        .saturating_mul(multiplier)
        .min(HTTP_PROBE_BACKOFF_MAX_MS);
    Duration::from_millis(rand::random_range(0..=cap))
}

fn retry_delay(
    headers: Option<&HeaderMap>,
    attempt: u32,
    now: chrono::DateTime<chrono::Utc>,
) -> Option<Duration> {
    if let Some(server_delay) = headers.and_then(|headers| parse_retry_after(headers, now)) {
        return (server_delay <= HTTP_PROBE_MAX_RETRY_AFTER).then_some(server_delay);
    }
    Some(full_jitter_delay(attempt))
}

async fn classify_http_response(
    mut response: reqwest::Response,
    config: &LoginDetectionConfig,
) -> AccountManagerResult<Option<ProbeOutcome>> {
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

async fn run_http_probe(
    target: &url::Url,
    config: &LoginDetectionConfig,
    saved_session: Option<&AccountSession>,
    proxy_url: Option<&str>,
) -> AccountManagerResult<Option<ProbeOutcome>> {
    let mut client = reqwest::Client::builder()
        .timeout(HTTP_PROBE_REQUEST_TIMEOUT)
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
        .map(|session| cookie_header_for_url(session, target))
        .filter(|header| !header.is_empty());
    let user_agent = saved_session
        .map(|session| session.user_agent.trim())
        .filter(|user_agent| !user_agent.is_empty());

    timeout(HTTP_PROBE_TOTAL_TIMEOUT, async {
        for attempt in 0..HTTP_PROBE_MAX_ATTEMPTS {
            let mut request = client.get(target.clone());
            if let Some(header) = cookie_header.as_deref() {
                request = request.header(COOKIE, header);
            }
            if let Some(user_agent) = user_agent {
                request = request.header(USER_AGENT, user_agent);
            }

            match request.send().await {
                Ok(response) if is_retryable_status(response.status()) => {
                    if attempt + 1 >= HTTP_PROBE_MAX_ATTEMPTS {
                        return Ok(None);
                    }
                    let Some(delay) =
                        retry_delay(Some(response.headers()), attempt, chrono::Utc::now())
                    else {
                        return Ok(None);
                    };
                    sleep(delay).await;
                }
                Ok(response) => return classify_http_response(response, config).await,
                Err(error)
                    if is_retryable_request_error(&error)
                        && attempt + 1 < HTTP_PROBE_MAX_ATTEMPTS =>
                {
                    let delay =
                        retry_delay(None, attempt, chrono::Utc::now()).unwrap_or(Duration::ZERO);
                    sleep(delay).await;
                }
                Err(error) => {
                    return Err(AccountManagerError::store_fail(format!(
                        "HTTP probe request: {error}"
                    )));
                }
            }
        }
        Ok(None)
    })
    .await
    .map_err(|_| AccountManagerError::store_fail("HTTP probe deadline exceeded"))?
}

fn cookie_path_matches(cookie_path: &str, request_path: &str) -> bool {
    let cookie_path = if cookie_path.starts_with('/') {
        cookie_path
    } else {
        "/"
    };
    cookie_path == request_path
        || (request_path.starts_with(cookie_path)
            && (cookie_path.ends_with('/')
                || request_path.as_bytes().get(cookie_path.len()) == Some(&b'/')))
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
                && cookie_path_matches(cookie_path, path)
                && (!cookie.secure || target.scheme() == "https")
                && !cookie.partitioned
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
    let target = parse_probe_target(website)?;
    let saved_session = {
        let state = app.state::<AccountManagerState>();
        session::restore_session(&state, account_id)?
    };
    if matches!(
        strategy,
        ProbeStrategy::HttpFirst | ProbeStrategy::HttpOnly | ProbeStrategy::Hybrid
    ) {
        match run_http_probe(&target, config, saved_session.as_ref(), proxy_url).await {
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
    let parsed: tauri::Url = target;
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
    let restore_script = saved_session
        .as_ref()
        .map(|saved| {
            let state = app.state::<AccountManagerState>();
            super::browser_storage::restore_initialization_script(&state, saved)
        })
        .transpose()?
        .flatten();
    let wait_for_storage_restore = restore_script.is_some();
    let mut initialization_script = init_script();
    if let Some(script) = restore_script {
        initialization_script.push_str(&script);
    }
    let window = {
        #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(unused_mut))]
        let mut b = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(blank))
            .visible(false)
            .data_directory(data_dir)
            .initialization_script(initialization_script)
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
        if let Some(url) = proxy_url {
            if !super::capabilities::network_proxy_available() {
                return Err(AccountManagerError::invalid_input(
                    "network proxy is not supported for probe WebViews on this platform",
                ));
            }
            #[cfg(target_os = "macos")]
            {
                let parsed_url = url.parse::<tauri::Url>().map_err(|e| {
                    AccountManagerError::invalid_input(format!("invalid network proxy URL: {e}"))
                })?;
                b = b.proxy_url(parsed_url);
            }
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
            if wait_for_storage_restore {
                super::browser_storage::wait_for_restore(&window).await?;
            }
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
    use std::io::{Read, Write};

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

    fn read_http_request(stream: &mut std::net::TcpStream) -> String {
        const MAX_REQUEST_HEADER_BYTES: usize = 16 * 1024;
        let mut request = Vec::new();
        let mut buffer = [0_u8; 1024];
        while request.len() < MAX_REQUEST_HEADER_BYTES {
            let read = stream.read(&mut buffer).unwrap();
            if read == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..read]);
            if request.windows(4).any(|window| window == b"\r\n\r\n") {
                break;
            }
        }
        String::from_utf8_lossy(&request).to_string()
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

    #[test]
    fn cookie_path_match_requires_a_segment_boundary() {
        let session = AccountSession {
            cookies: vec![cookie("scoped", "example.com", "/foo", false)],
            ..Default::default()
        };

        let sibling = url::Url::parse("https://example.com/foobar").unwrap();
        let child = url::Url::parse("https://example.com/foo/bar").unwrap();

        assert!(cookie_header_for_url(&session, &sibling).is_empty());
        assert_eq!(cookie_header_for_url(&session, &child), "scoped=value");
    }

    #[test]
    fn partitioned_cookie_is_not_sent_without_a_partition_key() {
        let mut partitioned = cookie("partitioned", "example.com", "/", true);
        partitioned.partitioned = true;
        let session = AccountSession {
            cookies: vec![partitioned],
            ..Default::default()
        };
        let target = url::Url::parse("https://example.com/").unwrap();

        assert!(cookie_header_for_url(&session, &target).is_empty());
    }

    #[test]
    fn probe_target_rejects_non_http_schemes_and_embedded_credentials() {
        assert!(parse_probe_target("file:///tmp/session").is_err());
        assert!(parse_probe_target("https://user:secret@example.com/").is_err());
        assert!(parse_probe_target("http://127.0.0.1:3000/").is_ok());
    }

    #[test]
    fn retry_policy_is_limited_to_transient_statuses() {
        for status in [408, 429, 500, 502, 503, 504] {
            assert!(is_retryable_status(
                reqwest::StatusCode::from_u16(status).unwrap()
            ));
        }
        for status in [400, 401, 403, 404, 501, 505] {
            assert!(!is_retryable_status(
                reqwest::StatusCode::from_u16(status).unwrap()
            ));
        }
    }

    #[test]
    fn excessive_retry_after_stops_retrying() {
        let mut headers = HeaderMap::new();
        headers.insert(RETRY_AFTER, "60".parse().unwrap());

        assert!(retry_delay(Some(&headers), 0, chrono::Utc::now()).is_none());

        headers.insert(RETRY_AFTER, "1".parse().unwrap());
        assert_eq!(
            retry_delay(Some(&headers), 0, chrono::Utc::now()),
            Some(Duration::from_secs(1))
        );
    }

    #[test]
    fn jitter_backoff_never_exceeds_the_configured_cap() {
        for attempt in 0..20 {
            assert!(full_jitter_delay(attempt) <= Duration::from_millis(2_000));
        }
    }

    #[tokio::test]
    async fn http_probe_retries_transient_status_with_the_same_session_headers() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let mut requests = Vec::new();
            for attempt in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                requests.push(read_http_request(&mut stream));

                if attempt == 0 {
                    stream
                        .write_all(
                            b"HTTP/1.1 503 Service Unavailable\r\nRetry-After: 0\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                        )
                        .unwrap();
                } else {
                    stream
                        .write_all(
                            b"HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\nAUTH_OK",
                        )
                        .unwrap();
                }
            }
            requests
        });
        let target = url::Url::parse(&format!("http://{address}/session")).unwrap();
        let session = AccountSession {
            cookies: vec![cookie("session", "127.0.0.1", "/", false)],
            user_agent: "Bench-Probe-Test/1.0".into(),
            ..Default::default()
        };
        let config = LoginDetectionConfig {
            mode: LoginDetectionMode::Custom,
            logged_out_rule: LoginDetectionRule::default(),
            logged_in_rule: LoginDetectionRule {
                presence: LoginDetectionPresence::Present,
                text: "AUTH_OK".into(),
            },
        };

        let outcome = run_http_probe(&target, &config, Some(&session), None)
            .await
            .unwrap()
            .unwrap();
        let requests = server.join().unwrap();

        assert_eq!(outcome.status, AccountSessionStatus::Ready);
        assert_eq!(requests.len(), 2);
        for request in requests {
            let request = request.to_ascii_lowercase();
            assert!(request.contains("cookie: session=value"));
            assert!(request.contains("user-agent: bench-probe-test/1.0"));
        }
    }
}
