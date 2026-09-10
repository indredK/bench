//! 会话新鲜度仲裁（互通 I0 地基）。
//!
//! 互通引入第三个浏览态存放点后，最大的风险是**用陈旧浏览态覆盖更新的 canonical
//! 会话**。仲裁规则把「谁能写 S1」这件事收敛为一个可单测的纯函数：
//!
//! - `force = false` 且 Bench 已有会话**不早于**本次回采 → `Conflict`，把决定权
//!   交回用户（UI 二次确认），绝不静默覆盖。
//! - `force = true`（用户在冲突弹窗中显式确认）→ `Accept`。
//! - Bench 无会话，或已有会话更旧 → `Accept`。
//!
//! 时间基准优先取 `captured_at_ts`（UTC 秒），缺失时回退解析 `captured_at`
//! 字符串，与 TTL 计算的回退策略保持一致。

use super::types::AccountSession;

/// 仲裁结论。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Arbitration {
    /// 允许写入。
    Accept,
    /// 已存在更新的会话，需用户确认。
    Conflict {
        existing_captured_at_ts: i64,
        existing_origin: Option<String>,
    },
}

/// 读取会话的采集时间（UTC 秒）。`captured_at` 形如 `%Y-%m-%d %H:%M`（本地）。
pub fn captured_at_ts(session: &AccountSession) -> Option<i64> {
    if let Some(ts) = session.captured_at_ts {
        return Some(ts);
    }
    let raw = session.captured_at.trim();
    if raw.is_empty() {
        return None;
    }
    for format in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"] {
        if let Ok(parsed) = chrono::NaiveDateTime::parse_from_str(raw, format) {
            return Some(parsed.and_utc().timestamp());
        }
    }
    None
}

/// 仲裁一次回采写入。
///
/// `incoming_captured_at_ts` 是本次回采的采集时间；`force` 表示用户已显式确认覆盖。
pub fn arbitrate(
    existing: Option<&AccountSession>,
    incoming_captured_at_ts: i64,
    force: bool,
) -> Arbitration {
    if force {
        return Arbitration::Accept;
    }
    let Some(existing) = existing else {
        return Arbitration::Accept;
    };
    let Some(existing_ts) = captured_at_ts(existing) else {
        // 无法判断新鲜度时按「可写」处理：错过更新比拒绝更新更糟。
        return Arbitration::Accept;
    };
    if existing_ts >= incoming_captured_at_ts {
        return Arbitration::Conflict {
            existing_captured_at_ts: existing_ts,
            existing_origin: existing
                .session_origin
                .map(|origin| origin.as_str().to_string()),
        };
    }
    Arbitration::Accept
}

#[cfg(test)]
mod tests {
    use super::super::types::SessionOrigin;
    use super::*;

    fn session(captured_at_ts: Option<i64>, origin: Option<SessionOrigin>) -> AccountSession {
        AccountSession {
            captured_at_ts,
            session_origin: origin,
            ..Default::default()
        }
    }

    #[test]
    fn accepts_when_no_existing_session() {
        assert_eq!(arbitrate(None, 1_000, false), Arbitration::Accept);
    }

    #[test]
    fn accepts_when_existing_session_is_older() {
        let existing = session(Some(500), Some(SessionOrigin::WebviewKeeper));
        assert_eq!(
            arbitrate(Some(&existing), 1_000, false),
            Arbitration::Accept
        );
    }

    #[test]
    fn rejects_when_existing_session_is_newer() {
        let existing = session(Some(2_000), Some(SessionOrigin::WebviewKeeper));
        assert_eq!(
            arbitrate(Some(&existing), 1_000, false),
            Arbitration::Conflict {
                existing_captured_at_ts: 2_000,
                existing_origin: Some("webviewKeeper".to_string()),
            }
        );
    }

    #[test]
    fn ties_are_treated_as_conflict() {
        // 同一秒内无法判断先后：保守地要求用户确认，避免并发写入互相覆盖。
        let existing = session(Some(1_000), None);
        assert!(matches!(
            arbitrate(Some(&existing), 1_000, false),
            Arbitration::Conflict { .. }
        ));
    }

    #[test]
    fn force_overrides_conflict() {
        let existing = session(Some(2_000), Some(SessionOrigin::WebviewLogin));
        assert_eq!(arbitrate(Some(&existing), 1_000, true), Arbitration::Accept);
    }

    #[test]
    fn missing_timestamp_is_treated_as_writable() {
        let existing = AccountSession::default();
        assert_eq!(
            arbitrate(Some(&existing), 1_000, false),
            Arbitration::Accept
        );
    }

    #[test]
    fn captured_at_string_is_used_as_fallback() {
        let mut existing = AccountSession {
            captured_at: "2026-09-10 12:00".to_string(),
            ..Default::default()
        };
        let ts = captured_at_ts(&existing).expect("parse fallback");
        assert!(ts > 0);
        // 回采时间更早 → 冲突
        assert!(matches!(
            arbitrate(Some(&existing), ts - 10, false),
            Arbitration::Conflict { .. }
        ));
        // 回采时间更晚 → 接受
        existing.captured_at_ts = None;
        assert_eq!(
            arbitrate(Some(&existing), ts + 10, false),
            Arbitration::Accept
        );
    }

    #[test]
    fn unparsable_timestamp_does_not_block_writes() {
        let existing = AccountSession {
            captured_at: "not a timestamp".to_string(),
            ..Default::default()
        };
        assert_eq!(captured_at_ts(&existing), None);
        assert_eq!(
            arbitrate(Some(&existing), 1_000, false),
            Arbitration::Accept
        );
    }

    #[test]
    fn conflict_reports_existing_origin_for_ui() {
        let existing = session(Some(2_000), Some(SessionOrigin::BrowserCdp));
        match arbitrate(Some(&existing), 1_000, false) {
            Arbitration::Conflict {
                existing_origin, ..
            } => {
                assert_eq!(existing_origin.as_deref(), Some("browserCdp"));
            }
            other => panic!("expected conflict, got {other:?}"),
        }
    }
}
