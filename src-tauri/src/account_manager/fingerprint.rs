//! 登录指纹（F2）— 登录态确定性证据的采集与判定。
//!
//! 指纹只记录特征（cookie name/domain/path、storage 键名），**绝不记录值**。
//! 判定原则：全部特征缺失 → 确定性未登录；至少一项存在 → 仍需原探针验证。
//! 相关设计见 planned/account-manager.md F2 与 design.md §3（恢复后必须 probe 的红线例外）。

use tauri::{Runtime, WebviewWindow};

use super::session::evaluate_js;
use super::types::*;

/// 指纹 L0 短路判定「未登录」的来源标记（D1/方案 A）。
/// 写入 `StationAccount.status_reason`，前端徽标据此显示 tooltip 来源。
pub const FINGERPRINT_MISSING_REASON: &str = "fingerprintMissing";

/// 采集 storage 键名与值长度的 JS：token/auth/session/jwt/access/id_token/refresh 命中的
/// localStorage + sessionStorage 键（去重，附值长度作形态特征），
/// 并返回采样页是否存在登出元素（登录佐证）。
const CAPTURE_STORAGE_SCRIPT: &str = r#"
(function() {
  'use strict';
  var re = /token|auth|session|jwt|access|id_token|refresh/i;
  function entriesOf(store) {
    var out = [];
    try {
      var raw = Object.keys(store);
      for (var i = 0; i < raw.length; i++) {
        if (re.test(raw[i])) {
          var v = store.getItem(raw[i]);
          out.push({ k: raw[i], l: v ? String(v).length : 0 });
        }
      }
    } catch (e) {}
    return out;
  }
  var all = [];
  try { all = all.concat(entriesOf(localStorage)); } catch (e) {}
  try { all = all.concat(entriesOf(sessionStorage)); } catch (e) {}
  var seen = {};
  all = all.filter(function(e) { return seen[e.k] ? false : (seen[e.k] = true); });
  var logout = !!document.querySelector(
    'a[href*="logout"], a[href*="signout"], a[href*="sign-out"], button[data-testid="logout"], [aria-label*="logout"], [data-action="logout"]'
  );
  return JSON.stringify({ entries: all, logout: logout });
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
            value_len: c.value().len(),
        })
        .collect::<Vec<_>>();

    let mut storage_keys: Vec<String> = Vec::new();
    let mut storage_key_lens: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();
    let mut logout_evidence = false;
    let raw = evaluate_js(window, CAPTURE_STORAGE_SCRIPT).await;
    if let Ok(payload) = raw {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&payload) {
            if let Some(entries) = value.get("entries").and_then(|v| v.as_array()) {
                for entry in entries {
                    if let Some(key) = entry.get("k").and_then(|k| k.as_str()) {
                        storage_keys.push(key.to_string());
                        storage_key_lens.insert(
                            key.to_string(),
                            entry.get("l").and_then(|l| l.as_u64()).unwrap_or(0) as usize,
                        );
                    }
                }
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
        storage_key_lens,
        sampled_at: super::commands::now_label(),
        sampled_by_account: account_id.to_string(),
    };
    Ok(FingerprintCapture {
        fingerprint,
        logout_evidence,
    })
}

/// 值形态匹配：当前值长度与采样值长度同量级（≥ 采样的一半，至少 4 字符）。
/// 用于区分「长串密钥的登录态」与「短占位/空的未登录态」。
/// sample_len == 0 表示旧数据未记录长度，不校验（保持兼容）。
pub(crate) fn value_shape_matches(sample_len: usize, current_len: usize) -> bool {
    if sample_len == 0 {
        return true;
    }
    current_len >= sample_len / 2 && current_len >= 4
}

/// 在线判定：窗口当前是否仍具备指纹中的任一特征（含值形态匹配）。
/// - 任一 cookie 特征：name/domain 匹配 且 值长度与采样同量级 → true。
/// - 任一 storage 键：键名匹配 且 值长度与采样同量级 → true。
/// - 全部缺失或形态不符（短占位/空）→ false。
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
            let domain_ok = if c.domain().is_some() {
                c.domain().unwrap_or("") == feature.domain
            } else {
                // host-only：采样时以 capture_host 存储，此处域名相同或为空均视为等同。
                feature.domain == capture_host || feature.domain.is_empty()
            };
            domain_ok && value_shape_matches(feature.value_len, c.value().len())
        });
        if matched {
            return Ok(true);
        }
    }

    if !fingerprint.storage_keys.is_empty() {
        let payload = evaluate_js(window, CAPTURE_STORAGE_SCRIPT).await;
        if let Ok(payload) = payload {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&payload) {
                if let Some(entries) = value.get("entries").and_then(|v| v.as_array()) {
                    let any = fingerprint.storage_keys.iter().any(|wanted| {
                        entries.iter().any(|entry| {
                            entry.get("k").and_then(|k| k.as_str()) == Some(wanted.as_str())
                                && value_shape_matches(
                                    fingerprint
                                        .storage_key_lens
                                        .get(wanted)
                                        .copied()
                                        .unwrap_or(0),
                                    entry.get("l").and_then(|l| l.as_u64()).unwrap_or(0) as usize,
                                )
                        })
                    });
                    if any {
                        return Ok(true);
                    }
                }
            }
        }
    }
    Ok(false)
}

/// 轮询等待指纹特征出现（SPA 站点 cookie/localStorage 可能延迟就绪）。
/// 判定为"存在"即提前返回；耗尽 attempts 仍无则返回 false。
pub(crate) async fn wait_for_any_feature_present<R: Runtime>(
    window: &WebviewWindow<R>,
    target_url: &str,
    fingerprint: &LoginFingerprint,
    attempts: usize,
    interval_ms: u64,
) -> AccountManagerResult<bool> {
    for _ in 0..attempts {
        if any_feature_present_in_window(window, target_url, fingerprint).await? {
            return Ok(true);
        }
        tokio::time::sleep(std::time::Duration::from_millis(interval_ms)).await;
    }
    Ok(false)
}

/// L0a 判定（HTTP 路径）：恢复的 canonical session 是否缺失全部指纹特征（含值形态）。
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
        !session.cookies.iter().any(|c| {
            c.name == feature.name
                && c.domain == feature.domain
                && c.path == feature.path
                && value_shape_matches(feature.value_len, c.value.len())
        })
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
            value_len: 0,
        }
    }

    fn feature_len(name: &str, domain: &str, path: &str, value_len: usize) -> CookieFeature {
        CookieFeature {
            name: name.into(),
            domain: domain.into(),
            path: path.into(),
            http_only: false,
            value_len,
        }
    }

    fn cookie(name: &str, domain: &str, value: &str) -> super::super::types::CookieEntry {
        super::super::types::CookieEntry {
            name: name.into(),
            value: value.into(),
            domain: domain.into(),
            host_only: false,
            path: "/".into(),
            http_only: false,
            secure: true,
            same_site: None,
            partitioned: false,
            expires: None,
            expires_at_ts: None,
        }
    }

    #[test]
    fn missing_when_all_cookie_features_absent() {
        let session = AccountSession {
            cookies: vec![cookie("other", "example.com", "v")],
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
            cookies: vec![cookie("sid", "example.com", "v")],
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
    fn short_placeholder_value_does_not_match_long_key_shape() {
        // 采样值 48 字符(长串密钥);当前同名 cookie 仅 2 字符占位 → 形态不符,视为缺失。
        let session = AccountSession {
            cookies: vec![cookie("sid", "example.com", "x")],
            ..Default::default()
        };
        let fp = LoginFingerprint {
            cookie_features: vec![feature_len("sid", "example.com", "/", 48)],
            storage_keys: vec![],
            ..Default::default()
        };
        assert!(all_features_missing_from_session(&session, &fp));
    }

    #[test]
    fn long_key_value_matches_shape() {
        let long_token = "abcdef0123456789abcdef0123456789"; // 32 chars
        let session = AccountSession {
            cookies: vec![cookie("sid", "example.com", long_token)],
            ..Default::default()
        };
        let fp = LoginFingerprint {
            cookie_features: vec![feature_len("sid", "example.com", "/", 40)],
            storage_keys: vec![],
            ..Default::default()
        };
        // 32 >= 40/2=20 且 >=4 → 形态匹配 → 非缺失。
        assert!(!all_features_missing_from_session(&session, &fp));
    }

    #[test]
    fn value_shape_matches_requires_minimum_and_half() {
        assert!(value_shape_matches(0, 0)); // 旧数据不校验
        assert!(value_shape_matches(40, 20)); // 正好一半
        assert!(value_shape_matches(40, 24));
        assert!(!value_shape_matches(40, 19)); // 不足一半
        assert!(!value_shape_matches(40, 3)); // 低于最小 4
        assert!(!value_shape_matches(40, 0)); // 空值
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
