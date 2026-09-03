//! Shared helpers for account_manager commands: id/time, validation, reorder,
//! deletion metadata pruning, and per-station proxy URL construction.

use chrono::Local;
use rand::RngExt;
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Manager, Runtime};

use crate::account_manager::crypto;
use crate::account_manager::network_proxy;
use crate::account_manager::state::AccountManagerSnapshot;
use crate::account_manager::types::{
    AccountManagerError, AccountManagerResult, DeletionResourceKind, DeletionResourceResult,
    DeletionResourceStatus, RelayStation, StationAccount,
};

pub fn new_id(prefix: &str) -> String {
    let mut bytes = [0u8; 4];
    rand::rng().fill(&mut bytes);
    let suffix: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
    format!("{prefix}-{suffix}")
}

pub fn now_label() -> String {
    Local::now().format("%Y-%m-%d %H:%M").to_string()
}

pub(super) fn trim_or_invalid(input: &str, field: &str) -> AccountManagerResult<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AccountManagerError::invalid_input(format!(
            "{field} is required"
        )));
    }
    Ok(trimmed.to_string())
}

pub(super) fn normalize_optional(input: Option<String>) -> Option<String> {
    input.and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    })
}

pub(super) fn next_unique_remark(base: &str, existing: &mut HashSet<String>) -> String {
    if existing.insert(base.to_string()) {
        return base.to_string();
    }

    let trimmed = base.trim();
    let root = if trimmed.is_empty() {
        "中转站"
    } else {
        trimmed
    };
    let mut index = 1usize;
    loop {
        let candidate = format!("{root}{index}");
        if existing.insert(candidate.clone()) {
            return candidate;
        }
        index += 1;
    }
}

pub(super) trait HasId {
    fn id(&self) -> &str;
}

impl HasId for RelayStation {
    fn id(&self) -> &str {
        &self.id
    }
}

impl HasId for StationAccount {
    fn id(&self) -> &str {
        &self.id
    }
}

/// Validate that `ordered_ids` is an exact permutation of the ids in `current`,
/// then return `current` reordered to match. Rejects duplicates, missing ids,
/// and unknown ids — all map to `INVALID_INPUT`.
pub(super) fn reorder_by_ids<T: HasId + Clone>(
    current: &[T],
    ordered_ids: &[String],
    label: &str,
) -> AccountManagerResult<Vec<T>> {
    if ordered_ids.len() != current.len() {
        return Err(AccountManagerError::invalid_input(format!(
            "{label} reorder length mismatch: got {}, expected {}",
            ordered_ids.len(),
            current.len()
        )));
    }
    let mut seen: HashSet<&str> = HashSet::with_capacity(ordered_ids.len());
    for id in ordered_ids {
        if !seen.insert(id.as_str()) {
            return Err(AccountManagerError::invalid_input(format!(
                "{label} reorder duplicate id: {id}"
            )));
        }
    }
    let mut by_id: HashMap<&str, T> = current
        .iter()
        .map(|item| (item.id(), item.clone()))
        .collect();
    let mut out: Vec<T> = Vec::with_capacity(ordered_ids.len());
    for id in ordered_ids {
        let Some(item) = by_id.remove(id.as_str()) else {
            return Err(AccountManagerError::invalid_input(format!(
                "{label} reorder unknown id: {id}"
            )));
        };
        out.push(item);
    }
    Ok(out)
}

pub(super) fn error_code(error: &AccountManagerError) -> &'static str {
    match error {
        AccountManagerError::NotFound { .. } => "NOT_FOUND",
        AccountManagerError::InvalidInput { .. } => "INVALID_INPUT",
        AccountManagerError::StoreFail { .. } => "STORE_FAIL",
        AccountManagerError::KeyringUnavailable { .. } => "KEYRING_UNAVAILABLE",
        AccountManagerError::CryptoFail { .. } => "CRYPTO_FAIL",
        AccountManagerError::ClipboardFail { .. } => "CLIPBOARD_FAIL",
    }
}

pub(super) fn deletion_resource(
    resource: DeletionResourceKind,
    account_id: Option<String>,
    result: AccountManagerResult<()>,
) -> DeletionResourceResult {
    match result {
        Ok(()) => DeletionResourceResult {
            resource,
            account_id,
            status: DeletionResourceStatus::Succeeded,
            error_code: None,
        },
        Err(error) => DeletionResourceResult {
            resource,
            account_id,
            status: DeletionResourceStatus::Failed,
            error_code: Some(error_code(&error).to_string()),
        },
    }
}

pub(super) fn remove_station_metadata(
    snapshot: &mut AccountManagerSnapshot,
    id: &str,
) -> AccountManagerResult<usize> {
    let before = snapshot.stations.len();
    snapshot.stations.retain(|station| station.id != id);
    if snapshot.stations.len() == before {
        return Err(AccountManagerError::not_found(format!("station {id}")));
    }

    let mut dropped_account_ids = HashSet::new();
    snapshot.accounts.retain(|account| {
        if account.station_id == id {
            dropped_account_ids.insert(account.id.clone());
            false
        } else {
            true
        }
    });
    snapshot
        .secrets
        .retain(|account_id, _| !dropped_account_ids.contains(account_id));
    snapshot
        .sessions
        .retain(|account_id, _| !dropped_account_ids.contains(account_id));
    snapshot
        .external_app_bindings
        .retain(|binding| !dropped_account_ids.contains(&binding.account_id));
    prune_unbound_external_apps(snapshot);
    Ok(dropped_account_ids.len())
}

pub(super) fn remove_account_metadata(
    snapshot: &mut AccountManagerSnapshot,
    id: &str,
) -> AccountManagerResult<usize> {
    let before = snapshot.accounts.len();
    snapshot.accounts.retain(|account| account.id != id);
    if snapshot.accounts.len() == before {
        return Err(AccountManagerError::not_found(format!("account {id}")));
    }
    snapshot.secrets.remove(id);
    snapshot.sessions.remove(id);
    snapshot
        .external_app_bindings
        .retain(|binding| binding.account_id != id);
    prune_unbound_external_apps(snapshot);
    Ok(1)
}

pub(super) fn prune_unbound_external_apps(snapshot: &mut AccountManagerSnapshot) {
    let bound_app_ids = snapshot
        .external_app_bindings
        .iter()
        .map(|binding| binding.app_id.clone())
        .collect::<HashSet<_>>();
    snapshot
        .external_apps
        .retain(|external| bound_app_ids.contains(&external.id));
    for account in &mut snapshot.accounts {
        account
            .external_app_ids
            .retain(|app_id| bound_app_ids.contains(app_id));
    }
}

/// 从 station 的 network_proxy 配置构建代理 URL 字符串。
/// 返回 None 表示站点未配置代理。已配置代理时，密钥或解密失败必须 fail closed。
pub(super) fn build_proxy_url_for_station<R: Runtime>(
    app: &AppHandle<R>,
    station: &RelayStation,
) -> AccountManagerResult<Option<String>> {
    let Some(config) = station.network_proxy.as_ref() else {
        return Ok(None);
    };
    let state = app.state::<crate::account_manager::state::AccountManagerState>();
    let key = state.master_key()?;
    let password = match config.encrypted_password.as_ref() {
        Some(blob) => Some(crypto::decrypt(&key, blob)?),
        None => None,
    };
    Ok(Some(network_proxy::build_proxy_url(
        config,
        password.as_deref(),
    )))
}

#[cfg(test)]
pub(super) mod fixtures {
    use crate::account_manager::state::AccountManagerSnapshot;
    use crate::account_manager::types::{AccountSessionStatus, RelayStation, StationAccount};
    use std::collections::HashMap;

    pub(crate) fn make_station(id: &str) -> RelayStation {
        RelayStation {
            id: id.to_string(),
            remark: id.to_string(),
            website: format!("https://{id}.test"),
            created_at: "2026-01-01 00:00".to_string(),
            login_detection: crate::account_manager::types::LoginDetectionConfig::default(),
            exclusivity_mode: Default::default(),
            auth_profile: None,
            probe_failure_count: 0,
            session_ttl_hours: crate::account_manager::types::default_session_ttl_hours(),
            network_proxy: None,
        }
    }

    pub(crate) fn make_account(id: &str, station_id: &str) -> StationAccount {
        StationAccount {
            id: id.into(),
            station_id: station_id.into(),
            username: id.into(),
            notes: String::new(),
            phone: None,
            tg_account: None,
            linked_account: None,
            invite_link: None,
            login_methods: Vec::new(),
            status: AccountSessionStatus::Ready,
            last_login_at: None,
            last_refreshed_at: None,
            created_at: "2026-01-01 00:00".into(),
            has_password: false,
            account_type: Default::default(),
            website: None,
            session: None,
            exclusivity_group: None,
            proxy_enabled: false,
            external_app_ids: Vec::new(),
        }
    }

    pub(crate) fn snapshot_for_delete() -> AccountManagerSnapshot {
        AccountManagerSnapshot {
            stations: vec![make_station("a"), make_station("b")],
            accounts: vec![make_account("acct-a1", "a"), make_account("acct-b1", "b")],
            secrets: HashMap::new(),
            sessions: HashMap::new(),
            external_apps: Vec::new(),
            external_app_bindings: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_unique_remark_appends_numeric_suffix() {
        let mut existing = HashSet::from([
            "Alpha".to_string(),
            "Alpha1".to_string(),
            "Alpha2".to_string(),
        ]);
        assert_eq!(next_unique_remark("Alpha", &mut existing), "Alpha3");
        assert!(existing.contains("Alpha3"));
    }

    #[test]
    fn reorder_by_ids_returns_items_in_requested_order() {
        let current = vec![
            fixtures::make_station("a"),
            fixtures::make_station("b"),
            fixtures::make_station("c"),
        ];
        let ordered_ids = vec!["c".to_string(), "a".to_string(), "b".to_string()];
        let out = reorder_by_ids(&current, &ordered_ids, "station").expect("ok");
        let ids: Vec<&str> = out.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec!["c", "a", "b"]);
    }

    #[test]
    fn reorder_by_ids_rejects_length_mismatch() {
        let current = vec![fixtures::make_station("a"), fixtures::make_station("b")];
        let err = reorder_by_ids(&current, &["a".to_string()], "station").unwrap_err();
        assert!(matches!(err, AccountManagerError::InvalidInput { .. }));
    }

    #[test]
    fn reorder_by_ids_rejects_duplicate_id() {
        let current = vec![fixtures::make_station("a"), fixtures::make_station("b")];
        let ordered = vec!["a".to_string(), "a".to_string()];
        let err = reorder_by_ids(&current, &ordered, "station").unwrap_err();
        assert!(matches!(err, AccountManagerError::InvalidInput { .. }));
    }

    #[test]
    fn reorder_by_ids_rejects_unknown_id() {
        let current = vec![fixtures::make_station("a"), fixtures::make_station("b")];
        let ordered = vec!["a".to_string(), "z".to_string()];
        let err = reorder_by_ids(&current, &ordered, "station").unwrap_err();
        assert!(matches!(err, AccountManagerError::InvalidInput { .. }));
    }

    #[test]
    fn reorder_by_ids_empty_ok_on_empty_current() {
        let current: Vec<RelayStation> = vec![];
        let out = reorder_by_ids(&current, &[], "station").expect("ok");
        assert!(out.is_empty());
    }

    #[test]
    fn account_metadata_delete_keeps_other_accounts() {
        let mut snapshot = fixtures::snapshot_for_delete();
        assert_eq!(
            remove_account_metadata(&mut snapshot, "acct-a1").expect("delete"),
            1
        );
        assert_eq!(snapshot.accounts.len(), 1);
        assert_eq!(snapshot.accounts[0].id, "acct-b1");
        assert_eq!(snapshot.stations.len(), 2);
    }

    #[test]
    fn station_metadata_delete_removes_only_owned_accounts() {
        let mut snapshot = fixtures::snapshot_for_delete();
        assert_eq!(
            remove_station_metadata(&mut snapshot, "a").expect("delete"),
            1
        );
        assert_eq!(snapshot.stations.len(), 1);
        assert_eq!(snapshot.stations[0].id, "b");
        assert_eq!(snapshot.accounts.len(), 1);
        assert_eq!(snapshot.accounts[0].id, "acct-b1");
    }
}
