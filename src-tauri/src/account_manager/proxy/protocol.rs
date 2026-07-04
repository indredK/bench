use serde::{Deserialize, Serialize};

use super::super::types::ExternalApp;

/// Parsed `bench-auth://authorize?target=...&return=...&state=...&site=...`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthProxyRequest {
    pub target: String,
    pub return_url: String,
    pub state: Option<String>,
    pub site: Option<String>,
}

/// 外部登录代理的结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthProxyResult {
    pub token: String,
    pub token_type: String,
    pub state: Option<String>,
    pub station_id: String,
    pub account_id: String,
}

/// 解析 bench-auth://authorize URL 并提取参数。
/// 格式: bench-auth://authorize?target=<url>&return=<url>&state=<str>&site=<station-id>
pub fn parse_auth_proxy_url(input: &str) -> Result<AuthProxyRequest, String> {
    let url = url::Url::parse(input).map_err(|e| format!("invalid proxy URL: {e}"))?;

    if url.scheme() != "bench-auth" {
        return Err("scheme must be bench-auth".into());
    }
    if url.host_str() != Some("authorize") {
        return Err("host must be authorize".into());
    }

    let params: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();

    let target = params
        .get("target")
        .ok_or_else(|| "missing target param".to_string())?
        .clone();
    let return_url = params
        .get("return")
        .ok_or_else(|| "missing return param".to_string())?
        .clone();
    let state = params.get("state").cloned();
    let site = params.get("site").cloned();

    Ok(AuthProxyRequest { target, return_url, state, site })
}

/// Phase 4 安全:校验 return_url 是否被允许。
///
/// 校验逻辑:
/// 1. return_url 必须是合法 URL,且 scheme 不能为 http/https/bench-auth
///    (防止回调到浏览器或 bench 自身)
/// 2. 若 `apps` 中存在 ExternalApp.url_scheme 与 return_url 的 scheme 匹配:
///    a. 若 ExternalApp.return_hosts 非空,则 return_url 的 host 必须在 allowlist 中
///    b. 否则视为已注册且无 host 限制,允许
/// 3. 若未注册,返回 `Ok(false)` 表示"未注册,需用户确认"
///    (调用方应弹首次确认对话框,确认后由 `record_proxy_usage` 自动登记)
///
/// 返回:
/// - `Ok(true)` — 已注册且通过校验,可直接放行
/// - `Ok(false)` — 未注册,需用户首次确认
/// - `Err(msg)` — return_url 不合法或违反安全约束(被拒绝)
pub fn validate_return_url(return_url: &str, apps: &[ExternalApp]) -> Result<bool, String> {
    let parsed = url::Url::parse(return_url)
        .map_err(|e| format!("invalid return URL: {e}"))?;

    let scheme = parsed.scheme().to_lowercase();
    let host = parsed.host_str().unwrap_or("").to_lowercase();

    // 始终禁止的危险 scheme。
    if matches!(scheme.as_str(), "bench-auth" | "file" | "javascript") {
        return Err(format!("return URL scheme '{scheme}' is not allowed"));
    }
    if scheme.is_empty() {
        return Err("return URL has no scheme".into());
    }

    // http/https 仅允许 loopback(RFC 8252 native-app loopback,如 Trae/GitHub CLI/VS Code)。
    // 非 loopback 的 http/https 一律拒绝(防止把回调打到任意网站)。
    if matches!(scheme.as_str(), "http" | "https") {
        if is_loopback_host(&host) {
            return Ok(true);
        }
        return Err(format!(
            "return URL scheme '{scheme}' only allowed for loopback (127.0.0.1/localhost)"
        ));
    }

    // 查找已注册的 ExternalApp
    let Some(app) = apps.iter().find(|a| a.url_scheme.eq_ignore_ascii_case(&scheme)) else {
        // 未注册 — 调用方应弹首次确认对话框
        return Ok(false);
    };

    // 已注册 — 若设置了 return_hosts allowlist,校验 host
    if !app.return_hosts.is_empty() {
        if host.is_empty() {
            return Err(format!(
                "return URL for scheme '{}' must have a host (allowlist is set)",
                app.url_scheme
            ));
        }
        if !app
            .return_hosts
            .iter()
            .any(|allowed| allowed.eq_ignore_ascii_case(&host))
        {
            return Err(format!(
                "return URL host '{host}' not in allowlist for app '{}'",
                app.name
            ));
        }
    }

    Ok(true)
}

/// 判断 host 是否为 loopback(127.0.0.0/8、localhost、IPv6 ::1）。
pub fn is_loopback_host(host: &str) -> bool {
    let h = host.trim().trim_start_matches('[').trim_end_matches(']').to_lowercase();
    h == "localhost" || h == "::1" || h == "127.0.0.1" || h.starts_with("127.")
}

/// 判断一个完整 URL 是否指向 loopback。用于在登录 WebView 中识别 OAuth
/// native-app loopback 回调(如 http://127.0.0.1:56290/authorize?code=...）。
pub fn is_loopback_url(url: &str) -> bool {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(is_loopback_host))
        .unwrap_or(false)
}

/// 从一个 OAuth authorize/login 目标 URL 的 query 中提取「回调地址」。
///
/// 兼容多种命名:`auth_callback_url`、`redirect_uri`、`redirect_url`、
/// `callback_url`、`callback`、`redirect`(忽略纯数字/布尔等占位值)。
/// 只在解析出的值是合法 URL 时返回。
pub fn extract_loopback_callback(target: &str) -> Option<String> {
    let parsed = url::Url::parse(target).ok()?;
    const KEYS: &[&str] = &[
        "auth_callback_url",
        "redirect_uri",
        "redirect_url",
        "callback_url",
        "callback",
        "redirect",
    ];
    for (k, v) in parsed.query_pairs() {
        let key = k.to_lowercase();
        if KEYS.contains(&key.as_str()) {
            let val = v.to_string();
            if url::Url::parse(&val).is_ok() {
                return Some(val);
            }
        }
    }
    None
}

/// 启发式判断一个 URL 是否「像」OAuth/OIDC/登录 authorize 链接。
/// 用于把外部软件交给 bench 打开的普通网页与真正的登录链接区分开。
pub fn is_oauth_authorize_like(target: &str) -> bool {
    let Ok(parsed) = url::Url::parse(target) else {
        return false;
    };
    let path = parsed.path().to_lowercase();
    let path_hit = ["authorize", "authorization", "oauth", "/signin", "/login", "/auth"]
        .iter()
        .any(|p| path.contains(p));

    let mut has_client = false;
    let mut has_redirect = false;
    let mut has_pkce = false;
    for (k, _) in parsed.query_pairs() {
        match k.to_lowercase().as_str() {
            "client_id" => has_client = true,
            "redirect_uri" | "auth_callback_url" | "redirect_url" | "callback_url" => {
                has_redirect = true
            }
            "code_challenge" | "code_challenge_method" => has_pkce = true,
            _ => {}
        }
    }

    path_hit || has_client || has_pkce || (has_redirect && parsed.scheme() == "https")
}

/// Phase 4 安全:audit log 入口。打印结构化条目到 stderr。
///
/// 注: 当前实现是简单的 stderr 输出。未来可扩展为持久化到 store
/// 或写入系统日志(macOS unified logging)。
pub fn audit_log(event: &str, fields: &[(&str, &str)]) {
    let pairs: Vec<String> = fields
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect();
    eprintln!("[auth-proxy audit] {event} {}", pairs.join(" "));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_app(id: &str, scheme: &str, hosts: &[&str]) -> ExternalApp {
        ExternalApp {
            id: id.into(),
            name: id.into(),
            url_scheme: scheme.into(),
            return_hosts: hosts.iter().map(|h| h.to_string()).collect(),
            first_used_at: String::new(),
            last_used_at: String::new(),
            use_count: 0,
        }
    }

    #[test]
    fn parse_valid_url() {
        let raw = "bench-auth://authorize?target=https%3A%2F%2Fgithub.com%2Flogin%2Foauth%2Fauthorize%3Fclient_id%3Dxxx&return=myapp%3A%2F%2Fauth-callback&state=abc123";
        let req = parse_auth_proxy_url(raw).expect("should parse");
        assert_eq!(req.target, "https://github.com/login/oauth/authorize?client_id=xxx");
        assert_eq!(req.return_url, "myapp://auth-callback");
        assert_eq!(req.state, Some("abc123".into()));
        assert!(req.site.is_none());
    }

    #[test]
    fn parse_with_site_hint() {
        let raw = "bench-auth://authorize?target=https%3A%2F%2Fexample.com%2Flogin&return=myapp%3A%2F%2Fcb&site=station-1";
        let req = parse_auth_proxy_url(raw).expect("should parse");
        assert_eq!(req.site, Some("station-1".into()));
    }

    #[test]
    fn reject_bad_scheme() {
        let raw = "https://example.com/authorize?target=...&return=...";
        assert!(parse_auth_proxy_url(raw).is_err());
    }

    #[test]
    fn validate_rejects_dangerous_scheme() {
        let apps: Vec<ExternalApp> = vec![];
        // 非 loopback 的 http/https 仍被拒绝
        assert!(validate_return_url("https://example.com/cb", &apps).is_err());
        assert!(validate_return_url("http://example.com/cb", &apps).is_err());
        assert!(validate_return_url("file:///etc/passwd", &apps).is_err());
        assert!(validate_return_url("javascript:alert(1)", &apps).is_err());
        assert!(validate_return_url("bench-auth://callback", &apps).is_err());
    }

    #[test]
    fn validate_allows_loopback_http() {
        let apps: Vec<ExternalApp> = vec![];
        assert_eq!(
            validate_return_url("http://127.0.0.1:56290/authorize", &apps),
            Ok(true)
        );
        assert_eq!(
            validate_return_url("http://localhost:8080/cb", &apps),
            Ok(true)
        );
        assert_eq!(
            validate_return_url("https://127.0.0.1:9000/oauth", &apps),
            Ok(true)
        );
    }

    #[test]
    fn loopback_url_detection() {
        assert!(is_loopback_url("http://127.0.0.1:56290/authorize?code=abc"));
        assert!(is_loopback_url("http://localhost:3000/cb"));
        assert!(is_loopback_url("http://127.0.0.5/x"));
        assert!(!is_loopback_url("https://www.trae.cn/authorization"));
        assert!(!is_loopback_url("https://example.com/127.0.0.1"));
    }

    #[test]
    fn extract_loopback_callback_from_trae_url() {
        let trae = "https://www.trae.cn/authorization?login_version=1&auth_from=trae&\
            client_id=ono9krqynydwx5&redirect=0&\
            auth_callback_url=http://127.0.0.1:56290/authorize&\
            code_challenge=pyoPLxGPALVoqBuoAT5w3fwk-VfN9GlbjLDOm3h3y80&code_challenge_method=S256";
        assert_eq!(
            extract_loopback_callback(trae).as_deref(),
            Some("http://127.0.0.1:56290/authorize")
        );
        // redirect=0 这种占位值不应被误当成回调
        assert_eq!(
            extract_loopback_callback("https://x.com/a?redirect=0"),
            None
        );
    }

    #[test]
    fn authorize_like_detection() {
        let trae = "https://www.trae.cn/authorization?client_id=x&\
            auth_callback_url=http://127.0.0.1:1/cb&code_challenge=abc&code_challenge_method=S256";
        assert!(is_oauth_authorize_like(trae));
        assert!(is_oauth_authorize_like(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&redirect_uri=y"
        ));
        assert!(!is_oauth_authorize_like("https://www.example.com/blog/post-1"));
    }

    #[test]
    fn validate_unregistered_returns_false() {
        let apps: Vec<ExternalApp> = vec![];
        let result = validate_return_url("myapp://cb", &apps);
        assert_eq!(result, Ok(false));
    }

    #[test]
    fn validate_registered_no_allowlist_returns_true() {
        let apps = vec![make_app("app-1", "myapp", &[])];
        let result = validate_return_url("myapp://cb", &apps);
        assert_eq!(result, Ok(true));
    }

    #[test]
    fn validate_registered_with_allowlist_passes_match() {
        let apps = vec![make_app("app-1", "myapp", &["auth-callback", "alt-cb"])];
        let result = validate_return_url("myapp://auth-callback", &apps);
        assert_eq!(result, Ok(true));
    }

    #[test]
    fn validate_registered_with_allowlist_rejects_unknown_host() {
        let apps = vec![make_app("app-1", "myapp", &["auth-callback"])];
        let result = validate_return_url("myapp://evil-host", &apps);
        assert!(result.is_err());
    }
}
