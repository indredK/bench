use std::collections::HashMap;
use std::fs::OpenOptions;
use std::sync::{Arc, Mutex, OnceLock, RwLock};

use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::Semaphore;

use super::crypto;
use super::crypto::EncryptedBlob;
use super::types::{
    AccountManagerError, AccountManagerResult, ExternalApp, ExternalAppBinding, RelayStation,
    StationAccount,
};

const PROBE_CONCURRENCY: usize = 2;
const AUTH_PROXY_TICKET_TTL_SECONDS: i64 = 300;
const MAX_AUTH_PROXY_TICKETS: usize = 64;

#[derive(Debug, Clone)]
pub struct AuthProxyTicket {
    pub id: String,
    pub target_url: String,
    pub return_url: Option<String>,
    pub request_state: Option<String>,
    pub host: String,
    pub allowed_account_ids: Vec<String>,
    pub expires_at_ts: i64,
}

#[derive(Clone, Default)]
pub struct AccountManagerSnapshot {
    pub stations: Vec<RelayStation>,
    pub accounts: Vec<StationAccount>,
    pub secrets: HashMap<String, EncryptedBlob>,
    pub sessions: HashMap<String, EncryptedBlob>,
    // Phase 3: 外部登录代理 — 已授权的外部 App + 绑定关系
    pub external_apps: Vec<ExternalApp>,
    pub external_app_bindings: Vec<ExternalAppBinding>,
}

pub struct AccountManagerState {
    pub snapshot: RwLock<AccountManagerSnapshot>,
    pub probe_semaphore: Arc<Semaphore>,
    master_key: OnceLock<[u8; 32]>,
    master_key_init: Mutex<()>,
    auth_proxy_tickets: Mutex<HashMap<String, AuthProxyTicket>>,
    init_error: RwLock<Option<String>>,
}

impl AccountManagerState {
    pub fn new() -> Self {
        Self {
            snapshot: RwLock::default(),
            probe_semaphore: Arc::new(Semaphore::new(PROBE_CONCURRENCY)),
            master_key: OnceLock::new(),
            master_key_init: Mutex::new(()),
            auth_proxy_tickets: Mutex::new(HashMap::new()),
            init_error: RwLock::default(),
        }
    }

    pub fn read_snapshot(&self) -> AccountManagerSnapshot {
        self.snapshot
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn read_snapshot_checked(&self) -> AccountManagerResult<AccountManagerSnapshot> {
        self.ensure_ready()?;
        Ok(self.read_snapshot())
    }

    pub fn replace_snapshot(&self, snapshot: AccountManagerSnapshot) {
        *self.snapshot.write().unwrap_or_else(|e| e.into_inner()) = snapshot;
    }

    pub fn set_init_error(&self, message: String) {
        *self.init_error.write().unwrap_or_else(|e| e.into_inner()) = Some(message);
    }

    pub fn clear_init_error(&self) {
        *self.init_error.write().unwrap_or_else(|e| e.into_inner()) = None;
    }

    pub fn ensure_ready(&self) -> AccountManagerResult<()> {
        if let Some(message) = self
            .init_error
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
        {
            return Err(AccountManagerError::store_fail(format!(
                "state initialization failed: {message}"
            )));
        }
        Ok(())
    }

    pub fn initialize_master_key<R: Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> AccountManagerResult<()> {
        if let Some(k) = self.master_key.get() {
            let _ = k;
            return Ok(());
        }

        let _init_guard = self
            .master_key_init
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if self.master_key.get().is_some() {
            return Ok(());
        }

        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AccountManagerError::keyring_unavailable(format!("app data dir: {e}")))?;
        std::fs::create_dir_all(&app_data_dir).map_err(|e| {
            AccountManagerError::keyring_unavailable(format!("create app data dir: {e}"))
        })?;
        let lock_file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(app_data_dir.join("account-manager-key.lock"))
            .map_err(|e| AccountManagerError::keyring_unavailable(format!("open key lock: {e}")))?;
        lock_file.lock().map_err(|e| {
            AccountManagerError::keyring_unavailable(format!("acquire key lock: {e}"))
        })?;
        let key_result = crypto::get_or_create_master_key();
        let unlock_result = lock_file.unlock();
        let key = key_result?;
        unlock_result.map_err(|e| {
            AccountManagerError::keyring_unavailable(format!("release key lock: {e}"))
        })?;

        self.master_key.set(key).map_err(|_| {
            AccountManagerError::keyring_unavailable("master key initialized concurrently")
        })
    }

    pub fn master_key(&self) -> AccountManagerResult<[u8; 32]> {
        self.master_key.get().copied().ok_or_else(|| {
            AccountManagerError::keyring_unavailable("master key is not initialized")
        })
    }

    pub fn get_session(&self, account_id: &str) -> Option<EncryptedBlob> {
        let snapshot = self.snapshot.read().unwrap_or_else(|e| e.into_inner());
        snapshot.sessions.get(account_id).cloned()
    }

    pub fn issue_auth_proxy_ticket(
        &self,
        target_url: String,
        return_url: Option<String>,
        request_state: Option<String>,
        host: String,
        allowed_account_ids: Vec<String>,
    ) -> AuthProxyTicket {
        let now = chrono::Utc::now().timestamp();
        let ticket = AuthProxyTicket {
            id: uuid::Uuid::new_v4().to_string(),
            target_url,
            return_url,
            request_state,
            host,
            allowed_account_ids,
            expires_at_ts: now + AUTH_PROXY_TICKET_TTL_SECONDS,
        };
        let mut tickets = self
            .auth_proxy_tickets
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        tickets.retain(|_, existing| existing.expires_at_ts > now);
        if tickets.len() >= MAX_AUTH_PROXY_TICKETS {
            if let Some(oldest_id) = tickets
                .iter()
                .min_by_key(|(_, existing)| existing.expires_at_ts)
                .map(|(id, _)| id.clone())
            {
                tickets.remove(&oldest_id);
            }
        }
        tickets.insert(ticket.id.clone(), ticket.clone());
        ticket
    }

    pub fn consume_auth_proxy_ticket(
        &self,
        ticket_id: &str,
        account_id: Option<&str>,
        allow_new_account: bool,
    ) -> AccountManagerResult<AuthProxyTicket> {
        let now = chrono::Utc::now().timestamp();
        let mut tickets = self
            .auth_proxy_tickets
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        tickets.retain(|_, existing| existing.expires_at_ts > now);
        let ticket = tickets.remove(ticket_id).ok_or_else(|| {
            AccountManagerError::invalid_input("auth proxy ticket is invalid, expired, or used")
        })?;
        if !allow_new_account {
            let account_id = account_id.ok_or_else(|| {
                AccountManagerError::invalid_input("auth proxy account is required")
            })?;
            if !ticket
                .allowed_account_ids
                .iter()
                .any(|allowed| allowed == account_id)
            {
                return Err(AccountManagerError::invalid_input(
                    "account is not authorized by this auth proxy ticket",
                ));
            }
        }
        Ok(ticket)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_proxy_ticket_is_single_use_and_account_scoped() {
        let state = AccountManagerState::new();
        let ticket = state.issue_auth_proxy_ticket(
            "https://example.com/login".into(),
            Some("demo:/callback".into()),
            Some("state".into()),
            "example.com".into(),
            vec!["acct-1".into()],
        );
        assert!(state
            .consume_auth_proxy_ticket(&ticket.id, Some("acct-2"), false)
            .is_err());
        assert!(state
            .consume_auth_proxy_ticket(&ticket.id, Some("acct-1"), false)
            .is_err());

        let valid = state.issue_auth_proxy_ticket(
            "https://example.com/login".into(),
            None,
            None,
            "example.com".into(),
            vec!["acct-1".into()],
        );
        assert!(state
            .consume_auth_proxy_ticket(&valid.id, Some("acct-1"), false)
            .is_ok());
        assert!(state
            .consume_auth_proxy_ticket(&valid.id, Some("acct-1"), false)
            .is_err());
    }
}
