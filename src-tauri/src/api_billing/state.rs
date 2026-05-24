use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};

use tokio::sync::Semaphore;

use super::crypto;
use super::types::{ApiBillingResult, RelayStation, StationAccount};
use super::crypto::EncryptedBlob;

pub struct ApiBillingState {
    pub stations: Mutex<Vec<RelayStation>>,
    pub accounts: Mutex<Vec<StationAccount>>,
    pub secrets: Mutex<HashMap<String, EncryptedBlob>>,
    pub refresh_inflight: Mutex<HashSet<String>>,
    pub probe_semaphore: Arc<Semaphore>,
    master_key: OnceLock<[u8; 32]>,
}

impl ApiBillingState {
    pub fn new() -> Self {
        Self {
            stations: Mutex::default(),
            accounts: Mutex::default(),
            secrets: Mutex::default(),
            refresh_inflight: Mutex::default(),
            probe_semaphore: Arc::new(Semaphore::new(3)),
            master_key: OnceLock::new(),
        }
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