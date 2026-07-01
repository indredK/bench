//! 历史的 token 抽取实现（设计文档 §3「架构结论」）。
//!
//! 当前主流程已改为「浏览器代理 / callback 转交」模型：bench 不再解析、持有或
//! 回传站点 token / cookie，只把 provider 重定向到的外部 App 原始 callback 转交回去。
//! 本模块仅作兼容保留，不应再扩展或接入新逻辑。
#![allow(dead_code)]

/// 登录完成后从 WebView 中提取凭证的 JS 脚本。
///
/// 根据 AuthProfile.authType 提取不同的凭证格式：
/// - sessionCookie:  从 document.cookie 提取全部 cookie
/// - bearerOAuth:    从 localStorage 提取 access_token / id_token
/// - saml/openIdConnect: 提取当前 URL 中的 authorization code
pub const TOKEN_EXTRACT_SCRIPT: &str = r#"
(function() {
  var result = {
    token: null,
    type: 'unknown',
    source: null
  };

  // 1. 优先从 cookie 提取
  var cookies = document.cookie.split('; ').filter(Boolean);
  var sessionCookies = cookies.filter(function(c) {
    return /session|auth|sid|token|connect\.sid|JSESSIONID|PHPSESSID/i.test(c.split('=')[0]);
  });
  if (sessionCookies.length > 0) {
    result.token = cookies.join('; ');
    result.type = 'cookie';
    result.source = 'cookie';
    return JSON.stringify(result);
  }

  // 2. 从 localStorage 提取 token
  try {
    var ls = Object.keys(localStorage);
    for (var i = 0; i < ls.length; i++) {
      if (/token|auth|session|jwt|access|id_token|refresh/i.test(ls[i])) {
        var val = localStorage.getItem(ls[i]);
        if (val && val.length > 0 && val.length < 10000) {
          result.token = val;
          result.type = 'bearer';
          result.source = 'localStorage:' + ls[i];
          return JSON.stringify(result);
        }
      }
    }
  } catch(e) {}

  // 3. 从当前 URL 提取 authorization code
  var match = window.location.href.match(/[?&](code|authorization_code)=([^&]+)/);
  if (match) {
    result.token = decodeURIComponent(match[2]);
    result.type = 'code';
    result.source = 'url';
    return JSON.stringify(result);
  }

  return JSON.stringify(result);
})();
"#;

/// 提取结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenExtractResult {
    pub token: Option<String>,
    #[serde(alias = "type")]
    pub token_type: String,
    pub source: Option<String>,
}

/// 将 JS 执行结果解析为 TokenExtractResult
pub fn parse_extract_result(raw: &str) -> Result<TokenExtractResult, String> {
    serde_json::from_str(raw).map_err(|e| format!("parse extract result: {e}"))
}

/// 根据 auth_type 决定是否应提取 cookie 而非单独的 token
pub fn should_extract_cookies(auth_type: &str) -> bool {
    matches!(auth_type, "sessionCookie" | "unknown")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_script_is_valid_js() {
        let script = TOKEN_EXTRACT_SCRIPT.trim();
        assert!(script.starts_with("(function"));
        assert!(script.ends_with(")();"));
    }

    #[test]
    fn parse_valid_extract_result() {
        let json = r#"{"token":"sess=abc123","type":"cookie","source":"cookie"}"#;
        let result = parse_extract_result(json).expect("should parse");
        assert_eq!(result.token, Some("sess=abc123".into()));
        assert_eq!(result.token_type, "cookie");
    }

    #[test]
    fn parse_empty_result() {
        let json = r#"{"token":null,"type":"unknown","source":null}"#;
        let result = parse_extract_result(json).expect("should parse");
        assert!(result.token.is_none());
        assert_eq!(result.token_type, "unknown");
    }

    #[test]
    fn session_cookie_should_extract() {
        assert!(should_extract_cookies("sessionCookie"));
        assert!(!should_extract_cookies("bearerOAuth"));
    }
}
