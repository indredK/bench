use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use tokio::sync::Semaphore;

use super::crypto;
use super::crypto::EncryptedBlob;
use super::types::{ApiBillingResult, RelayStation, StationAccount};

const PROBE_CONCURRENCY: usize = 2;

pub struct ApiBillingState {
    pub stations: Mutex<Vec<RelayStation>>,
    pub accounts: Mutex<Vec<StationAccount>>,
    pub secrets: Mutex<HashMap<String, EncryptedBlob>>,
    pub probe_semaphore: Arc<Semaphore>,
    master_key: OnceLock<[u8; 32]>,
}

impl ApiBillingState {
    pub fn new() -> Self {
        Self {
            stations: Mutex::default(),
            accounts: Mutex::default(),
            secrets: Mutex::default(),
            probe_semaphore: Arc::new(Semaphore::new(PROBE_CONCURRENCY)),
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