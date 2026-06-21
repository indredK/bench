use std::collections::HashMap;
use std::sync::{Arc, OnceLock, RwLock};

use tokio::sync::Semaphore;

use super::crypto;
use super::crypto::EncryptedBlob;
use super::types::{ApiBillingError, ApiBillingResult, RelayStation, StationAccount};

const PROBE_CONCURRENCY: usize = 2;

#[derive(Clone, Default)]
pub struct ApiBillingSnapshot {
    pub stations: Vec<RelayStation>,
    pub accounts: Vec<StationAccount>,
    pub secrets: HashMap<String, EncryptedBlob>,
}

pub struct ApiBillingState {
    pub snapshot: RwLock<ApiBillingSnapshot>,
    pub probe_semaphore: Arc<Semaphore>,
    master_key: OnceLock<[u8; 32]>,
    init_error: RwLock<Option<String>>,
}

impl ApiBillingState {
    pub fn new() -> Self {
        Self {
            snapshot: RwLock::default(),
            probe_semaphore: Arc::new(Semaphore::new(PROBE_CONCURRENCY)),
            master_key: OnceLock::new(),
            init_error: RwLock::default(),
        }
    }

    pub fn read_snapshot(&self) -> ApiBillingSnapshot {
        self.snapshot
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn read_snapshot_checked(&self) -> ApiBillingResult<ApiBillingSnapshot> {
        self.ensure_ready()?;
        Ok(self.read_snapshot())
    }

    pub fn replace_snapshot(&self, snapshot: ApiBillingSnapshot) {
        *self.snapshot.write().unwrap_or_else(|e| e.into_inner()) = snapshot;
    }

    pub fn set_init_error(&self, message: String) {
        *self
            .init_error
            .write()
            .unwrap_or_else(|e| e.into_inner()) = Some(message);
    }

    pub fn clear_init_error(&self) {
        *self
            .init_error
            .write()
            .unwrap_or_else(|e| e.into_inner()) = None;
    }

    pub fn ensure_ready(&self) -> ApiBillingResult<()> {
        if let Some(message) = self
            .init_error
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
        {
            return Err(ApiBillingError::store_fail(format!(
                "state initialization failed: {message}"
            )));
        }

        Ok(())
    }

    pub fn master_key(&self) -> ApiBillingResult<[u8; 32]> {
        if let Some(k) = self.master_key.get() {
            return Ok(*k);
        }
        let k = crypto::get_or_create_master_key()?;
        let _ = self.master_key.set(k);
        Ok(k)
    }
}
