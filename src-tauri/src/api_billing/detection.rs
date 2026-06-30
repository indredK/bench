use serde::Deserialize;
use tauri::{Runtime, WebviewWindow};

use super::session::evaluate_js;
use super::types::*;

/// 登录成功后执行的 JS 检测脚本
///
/// v1.6 修正：
/// - WebSocket 检测改用 Proxy + try/catch 包装（避免页面已无新建 WS 时无法感知）
/// - localStorage 大值截断（>1MB 用占位符）
/// - try/catch 容错 Private Browsing 模式
pub const DETECTION_SCRIPT: &str = r#"
(function() { 'use strict';
    var cookies = document.cookie.split('; ').filter(Boolean);
    var sessionNames = cookies.map(function(c) { return c.split('=')[0]; })
        .filter(function(n) { return /session|auth|sid|token|connect\.sid|JSESSIONID|PHPSESSID/i.test(n); });
    var lsKeys;
    try { lsKeys = Object.keys(localStorage); } catch(e) { lsKeys = []; }
    var tokenKeys = lsKeys.filter(function(k) { return /token|auth|session|jwt|access|id_token|refresh/i.test(k); });
    var lsTokens = {};
    tokenKeys.forEach(function(k) {
        try {
            var raw = localStorage.getItem(k) || '';
            // v1.6 遗漏 6: 大值截断
            lsTokens[k] = raw.length > 1000000 ? '[TRUNCATED:' + raw.length + ' bytes]' : raw.substring(0, 30) + '...';
        } catch(e) { lsTokens[k] = '[READ_ERROR]'; }
    });
    var ssKeys;
    try { ssKeys = Object.keys(sessionStorage); } catch(e) { ssKeys = []; }
    var ssTokenKeys = ssKeys.filter(function(k) { return /token|auth|session/i.test(k); });
    var csrfMeta = document.querySelector('meta[name="csrf-token"], meta[name="_csrf"], meta[name="csrf"], meta[name="csrf-param"]');
    var csrfInput = document.querySelector('input[name="_csrf"], input[name="csrf_token"], input[name="csrfmiddlewaretoken"]');
    var logoutEls = ['a[href*="logout"]', 'a[href*="signout"]', 'a[href*="sign-out"]', 'button[data-testid="logout"]', '[aria-label*="logout"]', '[data-action="logout"]'].map(function(s) {
        var el = document.querySelector(s);
        return el ? { selector: s, text: (el.textContent||'').trim().substring(0,50) } : null;
    }).filter(Boolean);
    var url = window.location.href;
    var sso = null;
    if (/login\.(microsoft|microsoftonline|okta|auth0)\.com/i.test(url) || /\/saml\/|\/oauth2\/|\/openid\//i.test(url)) {
        if (/microsoft/i.test(url)) sso = 'azure_ad';
        else if (/okta/i.test(url)) sso = 'okta';
        else if (/auth0/i.test(url)) sso = 'auth0';
        else sso = 'unknown';
    }
    var cf = !!document.querySelector('#challenge-form, #cf-challenge, [id*="cf-chl"]');
    var turnstile = !!document.querySelector('.cf-turnstile');
    var recaptcha = !!document.querySelector('.g-recaptcha');
    var hasSW = !!(navigator.serviceWorker && navigator.serviceWorker.controller);

    // v1.6 WebSocket 检测:用 Proxy 包装原生构造函数,捕获新建立的连接
    var wsDetected = false;
    try {
        if (typeof window.WebSocket === 'function') {
            var OrigWS = window.WebSocket;
            var proxied = new Proxy(OrigWS, {
                construct: function(target, args) { wsDetected = true; return new target(args); }
            });
            // 只在 try 块内替换,失败不影响页面
            Object.defineProperty(window, 'WebSocket', { value: proxied, configurable: true, writable: true });
        }
    } catch(e) { /* CSP 或其它限制,忽略 */ }

    return JSON.stringify({
        sessionCookieNames: sessionNames, totalCookies: cookies.length,
        tokenKeys: tokenKeys, localStorageTokens: lsTokens,
        sessionTokenKeys: ssTokenKeys,
        csrf: { metaName: csrfMeta ? csrfMeta.getAttribute('name') : null,
                metaContent: csrfMeta ? (csrfMeta.getAttribute('content')||'').substring(0,20) : null,
                inputName: csrfInput ? csrfInput.getAttribute('name') : null,
                inputValue: csrfInput ? (csrfInput.getAttribute('value')||'').substring(0,20) : null },
        logoutElements: logoutEls, ssoProvider: sso,
        cloudflare: { challenge: cf, turnstile: turnstile, recaptcha: recaptcha },
        websocketDetected: wsDetected,
        url: url, title: document.title, hasSW: hasSW,
        hasServiceWorker: hasSW
    });
})()
"#;

/// 执行检测脚本并生成 AuthProfile
pub async fn detect_auth_profile<R: Runtime>(
    window: &WebviewWindow<R>,
) -> ApiBillingResult<AuthProfile> {
    let raw = evaluate_js(window, DETECTION_SCRIPT).await?;
    let d: DetectionInput = serde_json::from_str(&raw)
        .map_err(|e| ApiBillingError::store_fail(format!("parse detection: {e}")))?;
    Ok(classify_auth(d))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct DetectionInput {
    session_cookie_names: Vec<String>,
    total_cookies: usize,
    token_keys: Vec<String>,
    #[serde(default)]
    local_storage_tokens: serde_json::Value,
    session_token_keys: Vec<String>,
    csrf: CsrfInput,
    #[serde(default)]
    logout_elements: serde_json::Value,
    sso_provider: Option<String>,
    cloudflare: CfInput,
    #[serde(default)]
    websocket_detected: bool,
    url: String,
    title: String,
    #[serde(rename = "hasSW", default)]
    has_sw: bool,
    #[serde(default)]
    has_service_worker: bool,
}

#[derive(Debug, Deserialize)]
struct CsrfInput {
    meta_name: Option<String>,
    #[allow(dead_code)]
    meta_content: Option<String>,
    input_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CfInput {
    challenge: bool,
    turnstile: bool,
    recaptcha: bool,
}

/// 分类引擎
fn classify_auth(d: DetectionInput) -> AuthProfile {
    let mut p = AuthProfile {
        cookie_based: !d.session_cookie_names.is_empty() || d.total_cookies > 0,
        ..Default::default()
    };

    let has_ls = !d.token_keys.is_empty();
    let has_ss = !d.session_token_keys.is_empty();
    if has_ls && has_ss {
        p.token_storage = TokenStorage::Multiple;
    } else if has_ls {
        p.token_storage = TokenStorage::LocalStorage;
    } else if has_ss {
        p.token_storage = TokenStorage::SessionStorage;
    } else if p.cookie_based {
        p.token_storage = TokenStorage::Cookie;
    }

    // CSRF
    if d.csrf.meta_name.is_some() || d.csrf.input_name.is_some() {
        p.csrf_protection = true;
        let name = d.csrf.meta_name.clone().unwrap_or_else(|| d.csrf.input_name.clone().unwrap_or_default());
        p.csrf_extraction = Some(CsrfExtraction {
            source: if d.csrf.meta_name.is_some() { "meta".into() } else { "input".into() },
            name: name.clone(),
            header_name: format!("X-{}", name.to_uppercase().replace('_', "-")),
        });
    }

    // Auth type
    p.auth_type = if d.sso_provider.is_some() {
        match d.sso_provider.as_deref() {
            Some("azure_ad") => AuthType::Saml,
            Some("okta") | Some("auth0") => AuthType::OpenIdConnect,
            _ => AuthType::Unknown,
        }
    } else if d.websocket_detected {
        AuthType::WebSocket
    } else if has_ls {
        AuthType::BearerOAuth
    } else {
        AuthType::SessionCookie
    };

    // Fingerprinting
    p.fingerprinting = if d.cloudflare.challenge || d.cloudflare.turnstile {
        FingerprintingLevel::Strict
    } else if d.has_sw || d.has_service_worker {
        FingerprintingLevel::Basic
    } else {
        FingerprintingLevel::None
    };

    // Anti-bot
    p.anti_bot = d.cloudflare.challenge || d.cloudflare.turnstile || d.cloudflare.recaptcha;
    p.anti_bot_provider = if d.cloudflare.challenge {
        Some(AntiBotProvider::Cloudflare)
    } else if d.cloudflare.turnstile {
        Some(AntiBotProvider::CloudflareTurnstile)
    } else if d.cloudflare.recaptcha {
        Some(AntiBotProvider::Recaptcha)
    } else {
        None
    };

    // SSO
    p.sso_provider = d.sso_provider.clone().map(|s| match s.as_str() {
        "azure_ad" => SsoProvider::AzureAd,
        "okta" => SsoProvider::Okta,
        "auth0" => SsoProvider::Auth0,
        o => SsoProvider::Custom(o.to_string()),
    });

    // Probe strategy
    p.probe_strategy = if p.anti_bot
        || p.fingerprinting == FingerprintingLevel::Strict
        || p.auth_type == AuthType::Saml
        || d.has_service_worker
    {
        ProbeStrategy::WebviewOnly
    } else if p.auth_type == AuthType::OpenIdConnect {
        ProbeStrategy::Hybrid
    } else {
        ProbeStrategy::HttpFirst
    };

    p.detected_at = super::commands::now_label();
    p.confidence = calculate_confidence(&d, &p);

    p
}

/// 基于检测证据计算置信度 (0.0-1.0)
fn calculate_confidence(d: &DetectionInput, p: &AuthProfile) -> f32 {
    let mut score = 0.5f32;
    if !d.session_cookie_names.is_empty() { score += 0.15; }
    if !d.token_keys.is_empty() { score += 0.15; }
    // logout UI 明确 → 登录状态确定
    if d.logout_elements.as_array().map(|a| !a.is_empty()).unwrap_or(false) { score += 0.1; }
    if d.sso_provider.is_some() { score += 0.1; }
    if d.cloudflare.challenge || d.cloudflare.turnstile { score += 0.05; }
    if p.auth_type != AuthType::Unknown { score += 0.05; }
    score.min(1.0)
}

/// 保留旧版的检测签名（向前兼容 probe.rs 引用）
pub fn classify(page_text: &str, config: &LoginDetectionConfig) -> AccountSessionStatus {
    super::detection_legacy::classify(page_text, config)
}

pub fn classify_confident(page_text: &str, config: &LoginDetectionConfig) -> Option<AccountSessionStatus> {
    super::detection_legacy::classify_confident(page_text, config)
}
