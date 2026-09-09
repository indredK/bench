//! 登录指纹（F2）— 登录态确定性证据的采集与判定。
//!
//! 指纹只记录特征（cookie name/domain/path、storage 键名），**绝不记录值**。
//! 判定原则：全部特征缺失 → 确定性未登录；至少一项存在 → 仍需原探针验证。
//! 相关设计见 planned/account-manager.md F2 与 design.md §3（恢复后必须 probe 的红线例外）。

use tauri::{Runtime, WebviewWindow};

use super::session::evaluate_js;
use super::types::*;

/// 采集 storage 键名的 JS：token/auth/session/jwt/access/id_token/refresh 命中的
/// localStorage + sessionStorage 键（去重），并返回采样页是否存在登出元素（登录佐证）。
const CAPTURE_STORAGE_SCRIPT: &str = r#"
(function() {
  'use strict';
  var re = /token|auth|session|jwt|access|id_token|refresh/i;
  function keysOf(store) {
    var out = [];
    try {
      var raw = Object.keys(store);
      for (var i = 0; i < raw.length; i++) {
        if (re.test(raw[i])) out.push(raw[i]);
      }
    } catch (e) {}
    return out;
  }
  var all = [];
  try { all = all.concat(keysOf(localStorage)); } catch (e) {}
  try { all = all.concat(keysOf(sessionStorage)); } catch (e) {}
  var seen = {};
  all = all.filter(function(k) { return seen[k] ? false : (seen[k] = true); });
  var logout = !!document.querySelector(
    'a[href*="logout"], a[href*="signout"], a[href*="sign-out"], button[data-testid="logout"], [aria-label*="logout"], [data-action="logout"]'
  );
  return JSON.stringify({ keys: all, logout: logout });
})()
"#;

/// 一次采集的结果：指纹 + 采样页登录佐证（登出元素是否存在）。
#[derive(Debug, Clone)]
pub struct FingerprintCapture {
    pub fingerprint: LoginFingerprint,
    pub logout_evidence: bool,
}

/// 从已加载目标页面的窗口采集指纹（cookie 特征 + storage 键名）。
/// cookie 从原生 `cookies_for_url` 获取（含 HttpOnly）；storage 键名走 JS。
pub(crate) async fn capture_from_window<R: Runtime>(
    window: &WebviewWindow<R>,
    target_url: &str,
    account_id: &str,
) -> AccountManagerResult<FingerprintCapture> {
    let parsed: tauri::Url = target_url
        .parse()
        .map_err(|e| AccountManagerError::invalid_input(format!("fingerprint url: {e}")))?;
    let capture_host = parsed.host_str().unwrap_or_default().to_string();

    let cookies = window
        .cookies_for_url(parsed)
        .map_err(|e| AccountManagerError::store_fail(format!("cookies_for_url: {e}")))?;
    let cookie_features = cookies
        .into_iter()
        .map(|c| CookieFeature {
            name: c.name().to_string(),
            domain: c.domain().unwrap_or(&capture_host).to_string(),
            path: c.path().unwrap_or("/").to_string(),
            http_only: c.http_only().unwrap_or(false),
        })
        .collect::<Vec<_>>();

    let mut storage_keys: Vec<String> = Vec::new();
    let mut logout_evidence = false;
    let raw = evaluate_js(window, CAPTURE_STORAGE_SCRIPT).await;
    if let Ok(payload) = raw {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&payload) {
            if let Some(keys) = value.get("keys").and_then(|v| v.as_array()) {
                storage_keys = keys
                    .iter()
                    .filter_map(|k| k.as_str().map(|s| s.to_string()))
                    .collect();
            }
            logout_evidence = value
                .get("logout")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
        }
    }

    let fingerprint = LoginFingerprint {
        cookie_features,
        storage_keys,
        sampled_at: super::commands::now_label(),
        sampled_by_account: account_id.to_string(),
    };
    Ok(FingerprintCapture {
        fingerprint,
        logout_evidence,
    })
}

/// 在线判定：窗口当前是否仍具备指纹中的任一特征。
/// - 任一 cookie 特征匹配（name 为主，domain/path 宽松）→ true。
/// - 任一 storage 键名匹配 → true。
/// - 全部缺失 → false。
pub(crate) async fn any_feature_present_in_window<R: Runtime>(
    window: &WebviewWindow<R>,
    target_url: &str,
    fingerprint: &LoginFingerprint,
) -> AccountManagerResult<bool> {
    if fingerprint.is_empty() {
        return Ok(true);
    }
    let parsed: tauri::Url = target_url
        .parse()
        .map_err(|e| AccountManagerError::invalid_input(format!("fingerprint url: {e}")))?;
    let capture_host = parsed.host_str().unwrap_or_default().to_string();
    let cookies = window
        .cookies_for_url(parsed)
        .map_err(|e| AccountManagerError::store_fail(format!("cookies_for_url: {e}")))?;

    for feature in &fingerprint.cookie_features {
        let matched = cookies.iter().any(|c| {
            if c.name() != feature.name {
                return false;
            }
            if c.domain().is_some() {
                c.domain().unwrap_or("") == feature.domain
            } else {
                // host-only：采样时以 capture_host 存储，此处域名相同或为空均视为等同。
                feature.domain == capture_host || feature.domain.is_empty()
            }
        });
        if matched {
            return Ok(true);
        }
    }

    if !fingerprint.storage_keys.is_empty() {
        let payload = evaluate_js(window, CAPTURE_STORAGE_SCRIPT).await;
        if let Ok(payload) = payload {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&payload) {
                if let Some(keys) = value.get("keys").and_then(|v| v.as_array()) {
                    let present: Vec<&str> = keys.iter().filter_map(|k| k.as_str()).collect();
                    let any = fingerprint
                        .storage_keys
                        .iter()
                        .any(|wanted| present.contains(&wanted.as_str()));
                    if any {
                        return Ok(true);
                    }
                }
            }
        }
    }
    Ok(false)
}

/// L0a 判定（HTTP 路径）：恢复的 canonical session 是否缺失全部指纹特征。
///
/// 保守边界：storage 键名在恢复 session 中为密文、无法轻量核对，
/// 因此只要指纹含 storage 键即视为「可能存在」不短路；
/// 纯 cookie 站点才可据此确定性判未登录。
pub(crate) fn all_features_missing_from_session(
    session: &AccountSession,
    fingerprint: &LoginFingerprint,
) -> bool {
    if fingerprint.is_empty() || !fingerprint.storage_keys.is_empty() {
        return false;
    }
    fingerprint.cookie_features.iter().all(|feature| {
        !session
            .cookies
            .iter()
            .any(|c| c.name == feature.name && c.domain == feature.domain && c.path == feature.path)
    })
}

/// 判定结果摘要（前端只展示计数，不回传特征名列表）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginFingerprintSummary {
    pub cookie_count: usize,
    pub storage_key_count: usize,
    pub sampled_at: String,
    pub has_logout_evidence: bool,
}

impl LoginFingerprintSummary {
    pub fn from_capture(capture: &FingerprintCapture) -> Self {
        Self {
            cookie_count: capture.fingerprint.cookie_features.len(),
            storage_key_count: capture.fingerprint.storage_keys.len(),
            sampled_at: capture.fingerprint.sampled_at.clone(),
            has_logout_evidence: capture.logout_evidence,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feature(name: &str, domain: &str, path: &str) -> CookieFeature {
        CookieFeature {
            name: name.into(),
            domain: domain.into(),
            path: path.into(),
            http_only: false,
        }
    }

    #[test]
    fn missing_when_all_cookie_features_absent() {
        let session = AccountSession {
            cookies: vec![super::super::types::CookieEntry {
                name: "other".into(),
                value: "v".into(),
                domain: "example.com".into(),
                host_only: false,
                path: "/".into(),
                http_only: false,
                secure: true,
                same_site: None,
                partitioned: false,
                expires: None,
                expires_at_ts: None,
            }],
            ..Default::default()
        };
        let fp = LoginFingerprint {
            cookie_features: vec![feature("sid", "example.com", "/")],
            storage_keys: vec![],
            ..Default::default()
        };
        assert!(all_features_missing_from_session(&session, &fp));
    }

    #[test]
    fn present_when_any_cookie_feature_matches() {
        let session = AccountSession {
            cookies: vec![super::super::types::CookieEntry {
                name: "sid".into(),
                value: "v".into(),
                domain: "example.com".into(),
                host_only: false,
                path: "/".into(),
                http_only: true,
                secure: true,
                same_site: None,
                partitioned: false,
                expires: None,
                expires_at_ts: None,
            }],
            ..Default::default()
        };
        let fp = LoginFingerprint {
            cookie_features: vec![feature("sid", "example.com", "/")],
            storage_keys: vec![],
            ..Default::default()
        };
        assert!(!all_features_missing_from_session(&session, &fp));
    }

    #[test]
    fn storage_keys_block_http_shortcut() {
        let session = AccountSession::default();
        let fp = LoginFingerprint {
            cookie_features: vec![feature("sid", "example.com", "/")],
            storage_keys: vec!["access_token".into()],
            ..Default::default()
        };
        // storage 键密文不可核对 → 保守不短路。
        assert!(!all_features_missing_from_session(&session, &fp));
    }

    #[test]
    fn empty_fingerprint_never_short_circuits() {
        assert!(!all_features_missing_from_session(
            &AccountSession::default(),
            &LoginFingerprint::default()
        ));
    }
}
