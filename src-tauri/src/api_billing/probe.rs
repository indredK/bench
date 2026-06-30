//! 分层探针引擎 — HTTP HEAD probe + WebView 多源证据 probe + 自适应降级
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;
use tokio::time::{sleep, timeout, Instant};
use super::detection;
use super::session::evaluate_js;
use super::state::ApiBillingState;
use super::storage;
use super::types::*;
use super::webview;

/// HTTP probe 连续失败多少次后永久降级为 WebViewOnly
const DEGRADE_THRESHOLD: u32 = 3;

fn init_script() -> String {
    format!("(function(){{window.__probeBillingSnapshot=function(){{var b=document.body;var r=(b&&b.innerText)?b.innerText:'';return r.length>{}?r.slice(0,{}):r;}};}})();", 200_000, 200_000)
}

async fn eval_text<R: Runtime>(window: &tauri::WebviewWindow<R>) -> ApiBillingResult<String> {
    let (tx, rx) = oneshot::channel::<String>();
    let slot: Arc<Mutex<Option<oneshot::Sender<String>>>> = Arc::new(Mutex::new(Some(tx)));
    window.eval_with_callback("window.__probeBillingSnapshot?window.__probeBillingSnapshot():''", move |r| {
        if let Ok(mut g) = slot.lock() { if let Some(s) = g.take() { let _ = s.send(r); } }
    }).map_err(|e| ApiBillingError::store_fail(format!("eval: {e}")))?;
    let payload = timeout(Duration::from_millis(2000), rx).await
        .map_err(|_| ApiBillingError::store_fail("timeout"))?
        .map_err(|_| ApiBillingError::store_fail("closed"))?;
    let text: String = serde_json::from_str(&payload)
        .map_err(|e| ApiBillingError::store_fail(format!("decode: {e}")))?;
    if text.is_empty() { return Err(ApiBillingError::store_fail("empty")); }
    Ok(text)
}

pub struct ProbeOutcome { pub status: AccountSessionStatus }

pub async fn http_probe(website: &str, cookies: &[CookieEntry], user_agent: &str, csrf_token: Option<&CsrfTokenEntry>) -> ProbeResult {
    let client = match reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(3)).build() {
        Ok(c) => c, Err(e) => return ProbeResult::NetworkError(format!("{e}")),
    };
    let mut req = client.head(website);
    // v1.6 遗漏 2: CHIPS partitioned cookie 过滤
    // Partitioned cookie 只在 same-origin 请求中附加,跨站时不发送
    let filtered = filter_probe_cookies(cookies, website);
    if !filtered.is_empty() {
        req = req.header("Cookie", filtered.iter().map(|c| format!("{}={}", c.name, c.value)).collect::<Vec<_>>().join("; "));
    }
    req = req.header("User-Agent", user_agent);
    if let Some(csrf) = csrf_token { req = req.header("X-CSRF-Token", csrf.token_value.as_str()); }
    let resp = match req.send().await { Ok(r) => r, Err(e) => return ProbeResult::NetworkError(format!("{e}")), };
    let status = resp.status();
    if status == 403 || status == 503 {
        if let Some(s) = resp.headers().get("server") { if s.to_str().unwrap_or("").contains("cloudflare") { return ProbeResult::AntiBotBlocked; } }
    }
    if status.is_success() { ProbeResult::Ready }
    else if status.is_redirection() {
        if let Some(l) = resp.headers().get("location") {
            let l = l.to_str().unwrap_or("");
            let ll = l.to_lowercase();
            if ll.contains("/login") || ll.contains("/signin") { ProbeResult::LoginRequired }
            else if ll.contains("login.microsoft") || ll.contains("okta.com") { ProbeResult::SsoChallenge }
            else { ProbeResult::Uncertain }
        } else { ProbeResult::Uncertain }
    } else { ProbeResult::Uncertain }
}

// ═══════════════════════════════════════════════
// v1.6 遗漏 2: CHIPS Partitioned cookie 过滤
// ═══════════════════════════════════════════════

/// 过滤 probe cookies:Partitioned cookie 只在 same-origin 请求中附加。
/// 来自设计文档遗漏 2 + 附录 C.5。
pub fn filter_probe_cookies<'a>(cookies: &'a [CookieEntry], target_url: &str) -> Vec<&'a CookieEntry> {
    let target_host = match tauri::Url::parse(target_url) {
        Ok(u) => u.host_str().unwrap_or("").to_string(),
        Err(_) => return cookies.iter().collect(),
    };
    cookies.iter().filter(|c| {
        if !c.partitioned {
            return true;
        }
        // Partitioned cookie 要求 origin 匹配 cookie.domain
        if c.domain.is_empty() {
            return false;
        }
        target_host == c.domain
            || target_host.ends_with(&format!(".{}", c.domain))
            || c.domain.ends_with(&format!(".{}", target_host))
    }).collect()
}

// ═══════════════════════════════════════════════
// v1.6 遗漏 3: iCloud Private Relay 检测
// ═══════════════════════════════════════════════

/// 检测 iCloud Private Relay 是否启用。
///
/// macOS 实现通过读取 NSUserDefaults 中的 `net.iCloud.PrivateRelay.Enabled` 标志。
/// Linux/Windows 始终返回 false（Private Relay 是 Apple 平台特性）。
///
/// 当 Private Relay 启用时,HTTP probe(reqwest 使用系统真实 IP)与
/// WKWebView 登录(经过 Apple 中继 IP)的出站 IP 不一致,服务端可能判定
/// session hijacking。调用方应据此降低 HTTP probe 优先级。
pub fn detect_private_relay_enabled() -> bool {
    #[cfg(target_os = "macos")]
    {
        detect_private_relay_macos()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[cfg(target_os = "macos")]
fn detect_private_relay_macos() -> bool {
    // 1. 优先检查用户偏好(同步,无 IO 阻塞)
    // 真实场景应通过 NSUserDefaults reading;此处用文件检查 fallback。
    // UserDefaults 路径: ~/Library/Preferences/com.apple.networkextension.plist
    // Private Relay 全局开关对应键: net.iCloud.PrivateRelay.Enabled (布尔)
    if let Some(home) = dirs_next::home_dir() {
        let plist = home.join("Library/Preferences/com.apple.networkextension.plist");
        if plist.exists() {
            if let Ok(content) = std::fs::read(&plist) {
                // 简化的二进制扫描:Private Relay plist 中存在 "PrivateRelay" 字符串
                // 且紧随其后是 <true/> 等价的 plist 二进制标记
                let needle = b"PrivateRelay";
                if let Some(idx) = content
                    .windows(needle.len())
                    .position(|w| w == needle)
                {
                    // 看后续 64 字节内是否有 true 标记(0x01 在 plist bool true context)
                    let tail = &content[idx..content.len().min(idx + 64)];
                    // plist binary format: 0x09 = true, 0x08 = false (in boolean context)
                    // 实际更可靠的方式是调用 CFPreferences / NSUserDefaults,但需要 objc。
                    if tail.contains(&0x09) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

#[allow(dead_code)]
pub async fn webview_probe<R: Runtime>(app: &AppHandle<R>, account_id: &str, website: &str, _session: &AccountSession, _config: &LoginDetectionConfig) -> ProbeResult {
    let label = format!("relay-probe-{}", account_id);
    let parsed = match website.parse() { Ok(u) => u, Err(e) => return ProbeResult::NetworkError(format!("url: {e}")), };
    let window = match WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed)).visible(false).build() {
        Ok(w) => w, Err(e) => return ProbeResult::NetworkError(format!("webview: {e}")),
    };
    sleep(Duration::from_millis(3000)).await;
    let s = r#"(function(){var lo=['a[href*="logout"]','a[href*="signout"]'].some(function(s){return!!document.querySelector(s);});var au=['input[type="password"]','form[action*="login"]'].some(function(s){return!!document.querySelector(s);});return JSON.stringify({url:window.location.href,sc:document.cookie.length>0,tl:/login|sign ?in|deng ?lu/i.test(document.title),lo:lo,au:au});})()"#;
    let raw = match timeout(Duration::from_millis(8000), evaluate_js(&window, s)).await {
        Ok(Ok(r)) => r, _ => { let _ = window.close(); return ProbeResult::NetworkError("timeout".into()); }
    };
    #[derive(serde::Deserialize)] struct E { url: String, sc: bool, tl: bool, lo: bool, au: bool }
    let e: E = match serde_json::from_str(&raw) { Ok(v) => v, Err(_) => { let _ = window.close(); return ProbeResult::Uncertain; } };
    let _ = window.close();
    let mut score = 0i32;
    if e.lo { score += 3; }
    if e.sc { score += 2; }
    if !e.tl { score += 1; }
    if e.au && !e.lo { score -= 3; }
    if e.tl { score -= 2; }
    if score >= 3 { ProbeResult::Ready } else if score <= -2 { ProbeResult::LoginRequired } else { ProbeResult::Uncertain }
}

pub fn probe_window_label(account_id: &str) -> String { format!("relay-probe-{account_id}") }

// ═══════════════════════════════════════════════
// 4.1 策略路由 — 根据 AuthProfile 的 ProbeStrategy 路由
// ═══════════════════════════════════════════════

/// 统一探针入口：根据 `strategy` 路由到不同层级，并在需要时降级。
pub async fn probe_session<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    website: &str,
    session: &AccountSession,
    strategy: ProbeStrategy,
    config: &LoginDetectionConfig,
) -> ProbeResult {
    // v1.6 遗漏 3: Private Relay 启用时强制降级到 WebView(避免 IP 不一致)
    let private_relay_on = detect_private_relay_enabled();
    let effective_strategy = if private_relay_on {
        ProbeStrategy::WebviewOnly
    } else {
        strategy
    };

    match effective_strategy {
        ProbeStrategy::HttpOnly => {
            http_probe(website, &session.cookies, &session.user_agent, session.csrf_token.as_ref()).await
        }
        ProbeStrategy::HttpFirst => {
            let result = http_probe(
                website,
                &session.cookies,
                &session.user_agent,
                session.csrf_token.as_ref(),
            )
            .await;
            match result {
                // 明确结论直接返回
                ProbeResult::Ready | ProbeResult::LoginRequired | ProbeResult::Expired => result,
                // 不确定 / 被反机器人拦截 / 网络错误 → 降级到 WebView probe
                _ => webview_probe(app, account_id, website, session, config).await,
            }
        }
        ProbeStrategy::WebviewOnly => {
            webview_probe(app, account_id, website, session, config).await
        }
        ProbeStrategy::Hybrid => {
            // SSO / OAuth 场景：WebView 跟踪重定向链后检查着陆页。
            // MVP 阶段复用 webview_probe 的多源证据收集。
            webview_probe(app, account_id, website, session, config).await
        }
    }
}

// ═══════════════════════════════════════════════
// 4.5 自适应降级 — HTTP probe 连续失败后永久切换 WebViewOnly
// ═══════════════════════════════════════════════

/// HTTP probe 失败后递增 station 的 probe_failure_count，
/// 达到阈值时将该 station 的 probe_strategy 永久降级为 WebviewOnly。
pub async fn adaptive_degrade<R: Runtime>(
    app: &AppHandle<R>,
    station_id: &str,
) -> ApiBillingResult<()> {
    let state = app.state::<ApiBillingState>();
    storage::with_state_mut(app, &state, |snapshot| {
        let station = snapshot
            .stations
            .iter_mut()
            .find(|s| s.id == station_id)
            .ok_or_else(|| ApiBillingError::not_found(format!("station {station_id}")))?;

        station.probe_failure_count = station.probe_failure_count.saturating_add(1);

        if station.probe_failure_count >= DEGRADE_THRESHOLD {
            if let Some(ref mut profile) = station.auth_profile {
                profile.probe_strategy = ProbeStrategy::WebviewOnly;
            }
        }
        Ok(())
    })?;
    Ok(())
}

/// 重置 station 的探针失败计数与策略（恢复为自动/默认）。
pub fn reset_probe_strategy<R: Runtime>(
    app: &AppHandle<R>,
    station_id: &str,
) -> ApiBillingResult<RelayStation> {
    let state = app.state::<ApiBillingState>();
    storage::with_state_mut(app, &state, |snapshot| {
        let station = snapshot
            .stations
            .iter_mut()
            .find(|s| s.id == station_id)
            .ok_or_else(|| ApiBillingError::not_found(format!("station {station_id}")))?;
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
) -> ApiBillingResult<RelayStation> {
    let state = app.state::<ApiBillingState>();
    storage::with_state_mut(app, &state, |snapshot| {
        let station = snapshot
            .stations
            .iter_mut()
            .find(|s| s.id == station_id)
            .ok_or_else(|| ApiBillingError::not_found(format!("station {station_id}")))?;
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

pub async fn run_probe<R: Runtime>(app: &AppHandle<R>, account_id: &str, website: &str, config: &LoginDetectionConfig) -> ApiBillingResult<ProbeOutcome> {
    let label = probe_window_label(account_id);
    if let Some(e) = app.get_webview_window(&label) { let _ = e.close(); }
    let parsed = website.parse().map_err(|e| ApiBillingError::invalid_input(format!("url: {e}")))?;
    let data_dir = webview::account_data_dir(app, account_id)?;
    if let Some(p) = data_dir.parent() { std::fs::create_dir_all(p).map_err(|e| ApiBillingError::store_fail(format!("dir: {e}")))?; }
    let dead = Instant::now() + Duration::from_millis(5000);
    let (tx, rx) = oneshot::channel::<()>();
    let slot: Arc<Mutex<Option<oneshot::Sender<()>>>> = Arc::new(Mutex::new(Some(tx)));
    let window = {
        let mut b = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed)).visible(false).data_directory(data_dir).initialization_script(init_script())
            .on_page_load(move |_, p| {
                if !matches!(p.event(), tauri::webview::PageLoadEvent::Finished) { return; }
                if let Ok(mut g) = slot.lock() { if let Some(s) = g.take() { let _ = s.send(()); } }
            });
        #[cfg(any(target_os="macos",target_os="ios"))] { b = b.data_store_identifier(webview::account_data_store_identifier(account_id)); }
        b.build().map_err(|e| ApiBillingError::store_fail(format!("build: {e}")))?
    };
    let load = tokio::time::timeout_at(dead, rx).await;
    let out = match load { Err(_)|Ok(Err(_)) => None, Ok(Ok(())) => {
        let pd = Instant::now() + Duration::from_millis(8000);
        let mut lt: Option<String> = None;
        let mut out = None;
        let iv = Duration::from_millis(500);
        while Instant::now() < pd {
            match eval_text(&window).await {
                Ok(t) => { if let Some(s) = detection::classify_confident(&t, config) { out = Some(s); break; } lt = Some(t); }
                Err(_) => { sleep(iv).await; continue; }
            }
            sleep(iv).await;
        }
        if out.is_none() { lt.map(|t| detection::classify(&t, config)) } else { out }
    }};
    let _ = window.close();
    Ok(match out { Some(s) => ProbeOutcome{status:s}, None => ProbeOutcome{status: AccountSessionStatus::FetchFailed} })
}
