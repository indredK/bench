//! Deep-link auth proxy inbox: validate external URLs, issue tickets, and drain queued requests.

use tauri::{AppHandle, Runtime, State};
use tauri_plugin_shell::ShellExt;

use crate::account_manager::proxy::protocol;
use crate::account_manager::state::{AccountManagerState, AuthProxyInboxStatus};
use crate::account_manager::types::{AccountManagerError, AccountManagerResult};

const MAX_BROWSER_OPEN_URL_BYTES: usize = 32 * 1024;

/// `handle_browser_open` 的统一返回结构。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserOpenResult {
    pub ticket_id: String,
    pub expires_at_ts: i64,
    pub host: String,
    pub is_authorize: bool,
    pub has_return_url: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_scheme: Option<String>,
    pub matches: Vec<crate::account_manager::proxy::matching::AuthProxyMatch>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthProxyDrainResult {
    pub request: Option<BrowserOpenResult>,
    pub pending_count: usize,
    pub dropped_count: u32,
    pub rejected_count: u32,
}

/// 接收一次“用 Bench 打开”的登录 URL，校验返回地址并签发一次性代理登录 ticket。
fn prepare_browser_open(
    state: &AccountManagerState,
    url: &str,
) -> AccountManagerResult<BrowserOpenResult> {
    if url.len() > MAX_BROWSER_OPEN_URL_BYTES {
        return Err(AccountManagerError::invalid_input(
            "browser open URL exceeds size limit",
        ));
    }

    let (target, return_url, request_state) = if url.starts_with("bench-auth://") {
        let req =
            protocol::parse_auth_proxy_url(url).map_err(AccountManagerError::invalid_input)?;
        (req.target, Some(req.return_url), req.state)
    } else {
        let ret = protocol::extract_loopback_callback(url);
        (url.to_string(), ret, None)
    };

    let target = protocol::validate_target_url(&target)
        .map_err(AccountManagerError::invalid_input)?
        .to_string();
    let request_state = url::Url::parse(&target)
        .ok()
        .and_then(|parsed| {
            parsed
                .query_pairs()
                .find(|(key, _)| key == "state")
                .map(|(_, value)| value.into_owned())
        })
        .or(request_state);
    let snapshot = state.read_snapshot_checked()?;
    if let Some(ref ret) = return_url {
        protocol::validate_return_url(ret, &snapshot.external_apps)
            .map_err(AccountManagerError::invalid_input)?;
    }

    let host = url::Url::parse(&target)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_lowercase))
        .unwrap_or_default();
    let is_authorize = protocol::is_oauth_authorize_like(&target);
    let matches = crate::account_manager::proxy::matching::match_target_to_stations(
        &target,
        &snapshot.stations,
        &snapshot.accounts,
    );
    // The match DTO includes both automatic matches and all manually selectable
    // stations. Bind exact account-to-station pairs from that same snapshot so
    // hidden accounts and later station reassignment cannot borrow this ticket.
    let allowed_account_stations = matches
        .iter()
        .flat_map(|matched_station| {
            matched_station
                .accounts
                .iter()
                .map(move |account| (account.id.clone(), matched_station.station_id.clone()))
        })
        .collect::<Vec<_>>();
    let ticket = state.issue_auth_proxy_ticket(
        target.clone(),
        return_url.clone(),
        request_state,
        host.clone(),
        allowed_account_stations,
    );

    protocol::audit_log(
        "handle_browser_open",
        &[
            ("host", &host),
            ("is_authorize", if is_authorize { "true" } else { "false" }),
            ("matches", &matches.len().to_string()),
        ],
    );

    let return_scheme = return_url
        .as_deref()
        .and_then(|value| url::Url::parse(value).ok())
        .map(|value| value.scheme().to_string());

    Ok(BrowserOpenResult {
        ticket_id: ticket.id,
        expires_at_ts: ticket.expires_at_ts,
        host,
        is_authorize,
        has_return_url: return_scheme.is_some(),
        return_scheme,
        matches,
    })
}

#[tauri::command]
pub fn handle_browser_open(
    state: State<'_, AccountManagerState>,
    url: String,
) -> AccountManagerResult<BrowserOpenResult> {
    prepare_browser_open(&state, &url)
}

#[tauri::command]
pub fn get_auth_proxy_inbox_status(
    state: State<'_, AccountManagerState>,
) -> AccountManagerResult<AuthProxyInboxStatus> {
    state.ensure_ready()?;
    Ok(state.auth_proxy_inbox_status())
}

#[tauri::command]
pub fn drain_auth_proxy_request(
    state: State<'_, AccountManagerState>,
) -> AccountManagerResult<AuthProxyDrainResult> {
    state.ensure_ready()?;
    Ok(drain_auth_proxy_request_impl(&state))
}

/// Open the previously validated return URL without exposing it to the renderer.
#[tauri::command]
#[allow(deprecated)]
pub fn open_auth_proxy_return_url<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    ticket_id: String,
) -> AccountManagerResult<()> {
    let return_url = state.auth_proxy_return_url(&ticket_id)?;
    app.shell()
        .open(return_url, None)
        .map_err(|_| AccountManagerError::store_fail("failed to open auth proxy return app"))
}

pub(crate) fn drain_auth_proxy_request_impl(state: &AccountManagerState) -> AuthProxyDrainResult {
    let mut dropped_count = 0u32;
    let mut rejected_count = 0u32;

    loop {
        let (url, status) = state.take_auth_proxy_url();
        dropped_count = dropped_count.saturating_add(status.dropped_count);
        let Some(url) = url else {
            return AuthProxyDrainResult {
                request: None,
                pending_count: status.pending_count,
                dropped_count,
                rejected_count,
            };
        };

        match prepare_browser_open(state, &url) {
            Ok(request) => {
                return AuthProxyDrainResult {
                    request: Some(request),
                    pending_count: status.pending_count,
                    dropped_count,
                    rejected_count,
                };
            }
            Err(_) => {
                rejected_count = rejected_count.saturating_add(1);
                eprintln!("[account_manager] discarded malformed auth proxy deep link");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::account_manager::state::AccountManagerSnapshot;
    use crate::account_manager::types::{
        AccountSessionStatus, AccountType, LoginDetectionConfig, RelayStation, StationAccount,
    };

    fn make_station(id: &str, website: &str) -> RelayStation {
        RelayStation {
            id: id.into(),
            remark: id.into(),
            website: website.into(),
            created_at: String::new(),
            login_detection: LoginDetectionConfig::default(),
            exclusivity_mode: Default::default(),
            auth_profile: None,
            probe_failure_count: 0,
            session_ttl_hours: crate::account_manager::types::default_session_ttl_hours(),
            network_proxy: None,
            login_fingerprint: None,
        }
    }

    fn make_account(id: &str, station_id: &str, proxy_enabled: bool) -> StationAccount {
        StationAccount {
            id: id.into(),
            station_id: station_id.into(),
            username: format!("user-{id}"),
            notes: String::new(),
            phone: None,
            tg_account: None,
            linked_account: None,
            invite_link: None,
            login_methods: Vec::new(),
            status: AccountSessionStatus::Ready,
            last_login_at: None,
            last_refreshed_at: None,
            created_at: String::new(),
            has_password: false,
            account_type: AccountType::Persistent,
            website: None,
            session: None,
            exclusivity_group: None,
            proxy_enabled,
            external_app_ids: Vec::new(),
            refresh_schedule: None,
            next_refresh_at_ts: None,
            first_login_at: None,
            status_reason: None,
        }
    }

    #[test]
    fn auth_proxy_drain_skips_malformed_entries_and_returns_the_next_valid_request() {
        let state = AccountManagerState::new();
        state
            .enqueue_auth_proxy_url("bench-auth://authorize".into())
            .expect("enqueue malformed request");
        state
            .enqueue_auth_proxy_url(
                "bench-auth://authorize?target=https%3A%2F%2Fexample.com%2Foauth%2Fauthorize%3Fstate%3Dtarget-secret%26token%3Dbearer-secret&return=demo%3A%2Fcallback%3Fstate%3Dreturn-secret"
                    .into(),
            )
            .expect("enqueue valid request");

        let result = drain_auth_proxy_request_impl(&state);

        assert_eq!(result.rejected_count, 1);
        assert_eq!(result.pending_count, 0);
        let request = result.request.expect("valid request");
        assert_eq!(request.host, "example.com");
        assert!(request.has_return_url);
        assert_eq!(request.return_scheme.as_deref(), Some("demo"));
        assert!(!request.ticket_id.is_empty());
        let serialized = serde_json::to_string(&request).expect("serialize safe DTO");
        assert!(!serialized.contains("target-secret"));
        assert!(!serialized.contains("bearer-secret"));
        assert!(!serialized.contains("return-secret"));
        assert!(!serialized.contains("targetUrl"));
        assert!(!serialized.contains("returnUrl"));
        assert_eq!(
            state.auth_proxy_return_url(&request.ticket_id).unwrap(),
            "demo:/callback?state=return-secret"
        );
    }

    #[test]
    fn auth_proxy_ticket_scopes_all_displayed_candidates_and_excludes_hidden_accounts() {
        let state = AccountManagerState::new();
        let matched_station = make_station("matched", "https://example.com/login?tenant=work");
        let unmatched_station = make_station("unmatched", "https://other.example");
        state.replace_snapshot(AccountManagerSnapshot {
            stations: vec![matched_station.clone(), unmatched_station.clone()],
            accounts: vec![
                make_account("matched-account", &matched_station.id, true),
                make_account("unmatched-account", &unmatched_station.id, true),
                make_account("disabled-account", &matched_station.id, false),
                make_account("orphan-account", "missing-station", true),
            ],
            ..AccountManagerSnapshot::default()
        });

        let request = prepare_browser_open(&state, "https://example.com/oauth/authorize")
            .expect("valid target should issue a ticket");
        assert_eq!(request.matches.len(), 2);
        assert_eq!(request.matches[0].accounts.len(), 1);
        assert_eq!(request.matches[0].accounts[0].id, "matched-account");
        assert_eq!(
            request.matches[1].confidence,
            crate::account_manager::proxy::matching::MatchConfidence::Manual
        );
        assert_eq!(request.matches[1].accounts[0].id, "unmatched-account");

        assert!(state
            .consume_auth_proxy_ticket(&request.ticket_id, Some("orphan-account"), false)
            .is_err());
        assert!(state
            .consume_auth_proxy_ticket(&request.ticket_id, Some("disabled-account"), false)
            .is_err());
        assert!(state
            .consume_auth_proxy_ticket(&request.ticket_id, Some("matched-account"), false)
            .is_ok());

        let manual_request = prepare_browser_open(&state, "https://example.com/oauth/authorize")
            .expect("valid target should issue a ticket for manual candidates");
        assert!(state
            .consume_auth_proxy_ticket(&manual_request.ticket_id, Some("unmatched-account"), false,)
            .is_ok());
    }
}
