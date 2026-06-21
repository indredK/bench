use std::collections::HashMap;
use std::sync::{Arc, OnceLock, RwLock};

use tokio::sync::Semaphore;

use super::crypto;
use super::crypto::EncryptedBlob;
use super::types::{ApiBillingResult, RelayStation, StationAccount};

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
}

impl ApiBillingState {
    pub fn new() -> Self {
        Self {
            snapshot: RwLock::default(),
            probe_semaphore: Arc::new(Semaphore::new(PROBE_CONCURRENCY)),
            master_key: OnceLock::new(),
        }
    }

    pub fn read_snapshot(&self) -> ApiBillingSnapshot {
        self.snapshot
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn replace_snapshot(&self, snapshot: ApiBillingSnapshot) {
        *self.snapshot.write().unwrap_or_else(|e| e.into_inner()) = snapshot;
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
