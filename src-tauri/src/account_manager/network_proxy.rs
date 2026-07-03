//! per-station 网络代理 URL 构建 helper。
//!
//! 给 `WebviewWindowBuilder::proxy_url` 与 `reqwest::Proxy` 用的统一 URL。
//! `username` / `password` 走 percent-encoding，避免 `@` / `:` / `/` 破坏 URL 解析。
use super::types::{NetworkProxyConfig, NetworkProxyType};

/// RFC 3986 userinfo 子分隔符（保留字符）。`percent_encoding` 不在依赖里，
/// 这里手写最小子集；user/password 不会包含所有合法字符，覆盖常见符号即可。
fn encode_userinfo(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        // unreserved = ALPHA / DIGIT / "-" / "." / "_" / "~"
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_' | '~') {
            out.push(c);
        } else {
            // percent-encode each byte (UTF-8)
            for b in c.to_string().as_bytes() {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

/// 构建 `scheme://[user[:pass]@]host:port` 形式的代理 URL。
/// `password` 为 None 时不附加凭证（仅 username 也会被 URL parser 拒绝，
/// 因此要求 username + password 同时出现才生成 auth 段）。
pub fn build_proxy_url(config: &NetworkProxyConfig, password: Option<&str>) -> String {
    let scheme = match config.proxy_type {
        NetworkProxyType::Http => "http",
        NetworkProxyType::Socks5 => "socks5",
    };

    let auth = match (&config.username, password) {
        (Some(u), Some(p)) if !u.is_empty() => {
            let user = encode_userinfo(u);
            let pass = encode_userinfo(p);
            format!("{user}:{pass}@")
        }
        _ => String::new(),
    };

    // host 若为 IPv6 形如 "::1" 需包 []；普通域名 / IPv4 直接拼。
    let host = if config.host.contains(':') && !config.host.starts_with('[') {
        format!("[{}]", config.host)
    } else {
        config.host.clone()
    };

    format!("{scheme}://{auth}{host}:{}", config.port)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(proxy_type: NetworkProxyType, host: &str, port: u16) -> NetworkProxyConfig {
        NetworkProxyConfig {
            proxy_type,
            host: host.to_string(),
            port,
            username: None,
            encrypted_password: None,
        }
    }

    #[test]
    fn http_no_auth() {
        let c = config(NetworkProxyType::Http, "127.0.0.1", 8080);
        assert_eq!(build_proxy_url(&c, None), "http://127.0.0.1:8080");
    }

    #[test]
    fn socks5_with_auth_special_chars() {
        let mut c = config(NetworkProxyType::Socks5, "proxy.example.com", 1080);
        c.username = Some("alice".to_string());
        let url = build_proxy_url(&c, Some("p@ss:word"));
        assert_eq!(url, "socks5://alice:p%40ss%3Aword@proxy.example.com:1080");
    }

    #[test]
    fn http_username_only_no_auth() {
        let mut c = config(NetworkProxyType::Http, "10.0.0.1", 8888);
        c.username = Some("orphan".to_string());
        // No password provided → auth segment is omitted entirely
        assert_eq!(build_proxy_url(&c, None), "http://10.0.0.1:8888");
    }

    #[test]
    fn ipv6_host_wrapped() {
        let c = config(NetworkProxyType::Http, "::1", 8080);
        assert_eq!(build_proxy_url(&c, None), "http://[::1]:8080");
    }
}
