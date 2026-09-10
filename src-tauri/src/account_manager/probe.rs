//! 分层探针引擎 — HTTP HEAD probe + WebView 多源证据 probe + 自适应降级
use super::detection;
use super::fingerprint;
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

/// HTTP 401/403 判定未登录的来源标记(服务端强证据,指纹存在也不升级)。
const HTTP_AUTH_STATUS_REASON: &str = "httpAuthStatus";

/// loginCheck（规则包 S1 服务端权威探针）判定的来源标记。
const LOGIN_CHECK_REASON: &str = "loginCheck";

pub(crate) fn init_script() -> String {
    format!("(function(){{window.__probeBillingSnapshot=function(){{var b=document.body;var r=(b&&b.innerText)?b.innerText:'';return r.length>{}?r.slice(0,{}):r;}};}})();", 200_000, 200_000)
}

pub(crate) async fn eval_text<R: Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> AccountManagerResult<String> {
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
    /// 判定来源（F2/D1）：仅指纹 L0 短路时填 `fingerprintMissing`，其余为 None。
    pub reason: Option<&'static str>,
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
    rule: Option<&super::login_rules::LoginRuleDoc>,
) -> AccountManagerResult<Option<ProbeOutcome>> {
    if response.status().is_redirection() {
        return Ok(None);
    }
    if matches!(response.status().as_u16(), 401 | 403) {
        // HTTP 401/403 是服务端强证据:即使指纹存在也判未登录(与文本分类弱证据区分)。
        return Ok(Some(ProbeOutcome {
            status: AccountSessionStatus::LoginRequired,
            reason: Some(HTTP_AUTH_STATUS_REASON),
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
    Ok(
        classify_effective_confident(&text, config, rule).map(|status| ProbeOutcome {
            status,
            reason: None,
        }),
    )
}

async fn run_http_probe(
    target: &url::Url,
    config: &LoginDetectionConfig,
    rule: Option<&super::login_rules::LoginRuleDoc>,
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
                Ok(response) => return classify_http_response(response, config, rule).await,
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

// ═══════════════════════════════════════════════
// 判定融合（优先级见 login-rulepack-spec §6）：
// 用户手配（Custom 非空）> 规则包 fallback（弱）> 旧预设文本。
// 证据分层不变：loginCheck（强）> HTTP 401/403（强）> 指纹否定短路（强）> 文本（弱）。
// ═══════════════════════════════════════════════

/// 站点是否手配了非空 Custom 文本规则。
fn has_custom_rules(config: &LoginDetectionConfig) -> bool {
    config.mode == LoginDetectionMode::Custom
        && (!config.logged_in_rule.text.trim().is_empty()
            || !config.logged_out_rule.text.trim().is_empty())
}

/// 确定性文本分类（有确定倾向才返回 Some）。
fn classify_effective_confident(
    page_text: &str,
    config: &LoginDetectionConfig,
    rule: Option<&super::login_rules::LoginRuleDoc>,
) -> Option<AccountSessionStatus> {
    if has_custom_rules(config) {
        return detection::classify_confident(page_text, config);
    }
    if let Some(rule) = rule {
        if let Some(status) = super::login_rules::classify_fallback_text_confident(page_text, rule)
        {
            return Some(status);
        }
    }
    detection::classify_confident(page_text, config)
}

/// 文本分类兜底（无确定倾向时返回 Expired）。
fn classify_effective(
    page_text: &str,
    config: &LoginDetectionConfig,
    rule: Option<&super::login_rules::LoginRuleDoc>,
) -> AccountSessionStatus {
    if has_custom_rules(config) {
        return detection::classify(page_text, config);
    }
    if let Some(rule) = rule {
        return super::login_rules::classify_fallback_text(page_text, rule);
    }
    detection::classify(page_text, config)
}

/// S1 服务端权威探针：用账号凭证请求站点自己的鉴权接口（规则包声明，
/// 加载器已校验 https + 同可注册域 + GET/POST 白名单）。
///
/// 强判据：判定成功即短路返回；请求失败/超时/结果不明确一律 None
///（不定论，静默走后续证据链），不产生用户可见错误。
async fn run_login_check(
    check: &super::login_rules::LoginCheckSpec,
    saved_session: Option<&AccountSession>,
    proxy_url: Option<&str>,
) -> Option<AccountSessionStatus> {
    let url = url::Url::parse(&check.url).ok()?;
    let mut client = reqwest::Client::builder()
        .timeout(HTTP_PROBE_REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none());
    if let Some(proxy_url) = proxy_url {
        client = client.proxy(reqwest::Proxy::all(proxy_url).ok()?);
    }
    let client = client.build().ok()?;
    let cookie_header = saved_session
        .map(|session| cookie_header_for_url(session, &url))
        .filter(|header| !header.is_empty());
    let user_agent = saved_session
        .map(|session| session.user_agent.trim())
        .filter(|user_agent| !user_agent.is_empty());

    let mut request = match check.method.as_str() {
        "POST" => client.post(url.clone()),
        _ => client.get(url.clone()),
    };
    if let Some(header) = cookie_header.as_deref() {
        request = request.header(COOKIE, header);
    }
    if let Some(user_agent) = user_agent {
        request = request.header(USER_AGENT, user_agent);
    }
    let mut response = timeout(HTTP_PROBE_TOTAL_TIMEOUT, request.send())
        .await
        .ok()?
        .ok()?;
    let status = response.status().as_u16();

    let expect = &check.expect;
    if expect.kind == "status" {
        let hit = |side: &[serde_json::Value]| {
            side.iter()
                .filter_map(|v| v.as_u64())
                .any(|c| c == u64::from(status))
        };
        return if hit(&expect.logged_in) {
            Some(AccountSessionStatus::Ready)
        } else if hit(&expect.logged_out) {
            Some(AccountSessionStatus::LoginRequired)
        } else {
            None
        };
    }

    // jsonBool / bodyContains 需要读响应体（大小受限）。
    let mut body = Vec::new();
    while let Ok(Some(chunk)) = response.chunk().await {
        let remaining = HTTP_PROBE_MAX_BODY_BYTES.saturating_sub(body.len());
        if remaining == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
    }
    if expect.kind == "jsonBool" {
        let value: serde_json::Value = serde_json::from_slice(&body).ok()?;
        let path = expect.path.as_deref()?;
        return match super::login_rules::json_bool_path(&value, path) {
            Some(true) => Some(AccountSessionStatus::Ready),
            Some(false) => Some(AccountSessionStatus::LoginRequired),
            None => None,
        };
    }
    if expect.kind == "bodyContains" {
        let text = String::from_utf8_lossy(&body);
        let hit = |side: &[serde_json::Value]| {
            side.iter()
                .filter_map(|v| v.as_str())
                .any(|indicator| text.contains(indicator))
        };
        return if hit(&expect.logged_in) {
            Some(AccountSessionStatus::Ready)
        } else if hit(&expect.logged_out) {
            Some(AccountSessionStatus::LoginRequired)
        } else {
            None
        };
    }
    None
}

/// WebView 内检查 CSS 选择器存在性（规则包 fallback 的 selector 弱证据）。
async fn eval_selector_exists<R: Runtime>(
    window: &tauri::WebviewWindow<R>,
    selector: &str,
) -> AccountManagerResult<bool> {
    let script = format!(
        "!!document.querySelector({})",
        serde_json::to_string(selector)
            .map_err(|e| AccountManagerError::store_fail(format!("selector encode: {e}")))?
    );
    let (tx, rx) = oneshot::channel::<String>();
    let slot: Arc<Mutex<Option<oneshot::Sender<String>>>> = Arc::new(Mutex::new(Some(tx)));
    window
        .eval_with_callback(&script, move |r| {
            if let Ok(mut g) = slot.lock() {
                if let Some(s) = g.take() {
                    let _ = s.send(r);
                }
            }
        })
        .map_err(|e| AccountManagerError::store_fail(format!("eval selector: {e}")))?;
    let payload = timeout(Duration::from_millis(2000), rx)
        .await
        .map_err(|_| AccountManagerError::store_fail("selector timeout"))?
        .map_err(|_| AccountManagerError::store_fail("selector closed"))?;
    let result: bool = serde_json::from_str(&payload)
        .map_err(|e| AccountManagerError::store_fail(format!("selector decode: {e}")))?;
    Ok(result)
}

/// 轮询页面文本（+规则包 selector DOM 检查）并按融合优先级分类。
///
/// `classify_effective_confident` 有确定性结果即提前返回；超时回退
/// `classify_effective`（返回 Expired 等确定值）。probe 与 keeper 共用。
pub(crate) async fn poll_effective_classification<R: Runtime>(
    config: &LoginDetectionConfig,
    rule: Option<&super::login_rules::LoginRuleDoc>,
    window: &tauri::WebviewWindow<R>,
) -> Option<AccountSessionStatus> {
    let selectors = |side| {
        rule.map(|r| super::login_rules::selector_conditions(r, side))
            .unwrap_or_default()
    };
    let logged_in_selectors = selectors(super::login_rules::FallbackSide::LoggedIn);
    let logged_out_selectors = selectors(super::login_rules::FallbackSide::LoggedOut);
    let has_selectors = !logged_in_selectors.is_empty() || !logged_out_selectors.is_empty();

    let poll_deadline = Instant::now() + Duration::from_millis(8000);
    let mut last_text: Option<String> = None;
    let mut confident: Option<AccountSessionStatus> = None;
    let interval = Duration::from_millis(500);
    while Instant::now() < poll_deadline {
        match eval_text(window).await {
            Ok(text) => {
                if let Some(status) = classify_effective_confident(&text, config, rule) {
                    confident = Some(status);
                    break;
                }
                last_text = Some(text);
            }
            Err(_) => {
                sleep(interval).await;
                continue;
            }
        }
        if has_selectors {
            // DOM selector 弱证据：loggedOut 命中优先（与 fallback 语义一致）。
            let mut dom_status = None;
            for selector in &logged_out_selectors {
                if eval_selector_exists(window, selector)
                    .await
                    .unwrap_or(false)
                {
                    dom_status = Some(AccountSessionStatus::LoginRequired);
                    break;
                }
            }
            if dom_status.is_none() {
                for selector in &logged_in_selectors {
                    if eval_selector_exists(window, selector)
                        .await
                        .unwrap_or(false)
                    {
                        dom_status = Some(AccountSessionStatus::Ready);
                        break;
                    }
                }
            }
            if let Some(status) = dom_status {
                confident = Some(status);
                break;
            }
        }
        sleep(interval).await;
    }
    confident.or_else(|| last_text.map(|text| classify_effective(&text, config, rule)))
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

// 注：8 个参数是分层证据管线（账号/站点/配置/策略/代理/指纹/规则包）的自然形态；
// 拆结构体的收益低于可读性损失，此处豁免 clippy::too_many_arguments。
#[allow(clippy::too_many_arguments)]
#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
pub async fn run_probe<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    website: &str,
    config: &LoginDetectionConfig,
    strategy: ProbeStrategy,
    proxy_url: Option<&str>,
    fingerprint: Option<&LoginFingerprint>,
    rule: Option<&super::login_rules::LoginRuleDoc>,
) -> AccountManagerResult<ProbeOutcome> {
    let target = parse_probe_target(website)?;
    let saved_session = {
        let state = app.state::<AccountManagerState>();
        session::restore_session(&state, account_id)?
    };
    // L0a 预检（HTTP 路径）：
    // - 指纹全缺失（纯 cookie 指纹）→ 确定性未登录。HttpOnly 直接返回;
    //   其余策略跳过 HTTP 请求、走 WebView L0b 复核(避免 canonical session 为空
    //   但 WebView data dir 有登录态残留的账号被误判,见 7242 案例)。
    // - 指纹存在 → 不短路,但 HTTP 弱证据(文本分类)不得覆盖指纹,见下方升级逻辑。
    let fingerprint_missing = match (fingerprint, saved_session.as_ref()) {
        (Some(fp), Some(saved)) if !fp.is_empty() => {
            fingerprint::all_features_missing_from_session(saved, fp)
        }
        _ => false,
    };
    if fingerprint_missing && strategy == ProbeStrategy::HttpOnly {
        return Ok(ProbeOutcome {
            status: AccountSessionStatus::LoginRequired,
            reason: Some(super::fingerprint::FINGERPRINT_MISSING_REASON),
        });
    }
    let fingerprint_present = fingerprint.is_some_and(|fp| !fp.is_empty());
    // S1 loginCheck（规则包强判据）：站点自己的鉴权接口是最高置信证据
    // （前置调研 §4：唯一 3/3 全对方案）。不受 probe_strategy 限制——目标
    // 是规则声明的站点自身 API 端点（同可注册域 + GET/POST 白名单由加载器保证）。
    if let Some(rule) = rule {
        if let Some(check) = rule.detection.login_check.as_ref() {
            if let Some(status) = run_login_check(check, saved_session.as_ref(), proxy_url).await {
                return Ok(ProbeOutcome {
                    status,
                    reason: Some(LOGIN_CHECK_REASON),
                });
            }
        }
    }
    if matches!(
        strategy,
        ProbeStrategy::HttpFirst | ProbeStrategy::HttpOnly | ProbeStrategy::Hybrid
    ) && !fingerprint_missing
    {
        match run_http_probe(&target, config, rule, saved_session.as_ref(), proxy_url).await {
            // HTTP 强证据(401/403)或 Ready:直接返回。
            // 弱证据(文本分类 LoginRequired/Expired)且指纹存在:不轻信,升级 WebView 复核。
            Ok(Some(outcome))
                if (strategy != ProbeStrategy::Hybrid
                    || outcome.status == AccountSessionStatus::Ready)
                    && !(fingerprint_present
                        && outcome.reason != Some(HTTP_AUTH_STATUS_REASON)
                        && matches!(
                            outcome.status,
                            AccountSessionStatus::LoginRequired | AccountSessionStatus::Expired
                        )) =>
            {
                return Ok(outcome);
            }
            Ok(Some(_)) => {}
            Ok(None) if strategy == ProbeStrategy::HttpOnly => {
                return Ok(ProbeOutcome {
                    status: AccountSessionStatus::FetchFailed,
                    reason: None,
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
    // WebView 加载预算：SPA 站点(如 trae.cn)需要更长时间;与 detect/capture 的 15s 对齐。
    let dead = Instant::now() + Duration::from_millis(15000);
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
            // L0b 预检（WebView 路径）：以采样指纹为登录态证据（含值形态匹配）——
            // 轮询等待特征就绪(SPA 延迟写 cookie/localStorage)。
            // 修复（前置调研 P0）：特征 present 是「弱肯定」——不得直接判 Ready
            //（trae.cn 误判根因：残留/匿名即有的特征被当定论），仅保留
            // 「全缺失 → 确定性未登录」的否定短路，present 继续走文本分类链。
            if let Some(fp) = fingerprint {
                if !fp.is_empty() {
                    let present =
                        fingerprint::wait_for_any_feature_present(&window, website, fp, 6, 500)
                            .await?;
                    if !present {
                        let _ = window.close();
                        return Ok(ProbeOutcome {
                            status: AccountSessionStatus::LoginRequired,
                            reason: Some(super::fingerprint::FINGERPRINT_MISSING_REASON),
                        });
                    }
                }
            }
            // 文本/selector 融合分类（8s 预算；probe 与 keeper 共用）。
            poll_effective_classification(config, rule, &window).await
        }
    };
    let _ = window.close();
    Ok(match out {
        Some(s) => ProbeOutcome {
            status: s,
            reason: None,
        },
        None => ProbeOutcome {
            status: AccountSessionStatus::FetchFailed,
            reason: None,
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

        let outcome = run_http_probe(&target, &config, None, Some(&session), None)
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
