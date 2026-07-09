use std::collections::HashMap;
use std::sync::{Arc, OnceLock, RwLock};

use tokio::sync::Semaphore;

use super::crypto;
use super::crypto::EncryptedBlob;
use super::types::{
    AccountManagerError, AccountManagerResult, ExternalApp, ExternalAppBinding, RelayStation,
    StationAccount,
};

const PROBE_CONCURRENCY: usize = 2;

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
    init_error: RwLock<Option<String>>,
}

impl AccountManagerState {
    pub fn new() -> Self {
        Self {
            snapshot: RwLock::default(),
            probe_semaphore: Arc::new(Semaphore::new(PROBE_CONCURRENCY)),
            master_key: OnceLock::new(),
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

    pub fn master_key(&self) -> AccountManagerResult<[u8; 32]> {
        if let Some(k) = self.master_key.get() {
            return Ok(*k);
        }
        let k = crypto::get_or_create_master_key()?;
        let _ = self.master_key.set(k);
        Ok(k)
    }

    // ═══ Session Manager 新增方法 ═══

    pub fn set_session(&self, account_id: &str, blob: EncryptedBlob) {
        let mut snapshot = self.snapshot.write().unwrap_or_else(|e| e.into_inner());
        snapshot.sessions.insert(account_id.to_string(), blob);
    }

    pub fn get_session(&self, account_id: &str) -> Option<EncryptedBlob> {
        let snapshot = self.snapshot.read().unwrap_or_else(|e| e.into_inner());
        snapshot.sessions.get(account_id).cloned()
    }
}
