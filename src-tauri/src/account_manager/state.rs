use std::collections::{HashMap, VecDeque};
use std::fs::OpenOptions;
use std::sync::{Arc, Mutex, OnceLock, RwLock};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::{Notify, Semaphore};

use super::crypto;
use super::crypto::EncryptedBlob;
use super::types::{
    AccountManagerError, AccountManagerResult, ExternalApp, ExternalAppBinding, RelayStation,
    StationAccount,
};

const PROBE_CONCURRENCY: usize = 2;
const AUTH_PROXY_TICKET_TTL_SECONDS: i64 = 300;
const MAX_AUTH_PROXY_TICKETS: usize = 64;
const MAX_AUTH_PROXY_INBOX_ITEMS: usize = 32;
const MAX_AUTH_PROXY_URL_BYTES: usize = 32 * 1024;
const MAX_RECENT_AUTH_PROXY_REQUESTS: usize = 64;
const AUTH_PROXY_DEDUP_TTL_SECONDS: i64 = 300;

type ProbeFlightResult = AccountManagerResult<StationAccount>;
type ProbeFlightRegistry = Arc<Mutex<HashMap<String, Arc<InFlightProbe>>>>;

#[derive(Default)]
struct InFlightProbe {
    result: Mutex<Option<ProbeFlightResult>>,
    notify: Notify,
}

impl InFlightProbe {
    fn publish(&self, result: ProbeFlightResult) {
        let mut slot = self.result.lock().unwrap_or_else(|e| e.into_inner());
        if slot.is_none() {
            *slot = Some(result);
        }
        drop(slot);
        self.notify.notify_waiters();
    }

    async fn wait(&self) -> ProbeFlightResult {
        loop {
            let notified = self.notify.notified();
            if let Some(result) = self
                .result
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone()
            {
                return result;
            }
            notified.await;
        }
    }
}

pub(crate) enum ProbeFlight {
    Leader(ProbeFlightLeader),
    Follower(ProbeFlightFollower),
}

pub(crate) struct ProbeFlightFollower {
    flight: Arc<InFlightProbe>,
}

impl ProbeFlightFollower {
    pub(crate) async fn wait(self) -> ProbeFlightResult {
        self.flight.wait().await
    }
}

pub(crate) struct ProbeFlightLeader {
    account_id: String,
    flight: Arc<InFlightProbe>,
    registry: ProbeFlightRegistry,
    completed: bool,
}

impl ProbeFlightLeader {
    pub(crate) fn complete(mut self, result: ProbeFlightResult) {
        self.finish(result);
    }

    fn finish(&mut self, result: ProbeFlightResult) {
        if self.completed {
            return;
        }
        self.flight.publish(result);
        let mut registry = self.registry.lock().unwrap_or_else(|e| e.into_inner());
        if registry
            .get(&self.account_id)
            .is_some_and(|active| Arc::ptr_eq(active, &self.flight))
        {
            registry.remove(&self.account_id);
        }
        self.completed = true;
    }
}

impl Drop for ProbeFlightLeader {
    fn drop(&mut self) {
        self.finish(Err(AccountManagerError::store_fail(
            "probe operation was cancelled",
        )));
    }
}

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

#[derive(Debug, Clone, Copy, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthProxyInboxStatus {
    pub pending_count: usize,
    pub dropped_count: u32,
}

#[derive(Default)]
struct AuthProxyInbox {
    urls: VecDeque<QueuedAuthProxyUrl>,
    recent: VecDeque<([u8; 32], i64)>,
    dropped_count: u32,
}

struct QueuedAuthProxyUrl {
    url: String,
    fingerprint: [u8; 32],
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
    probe_flights: ProbeFlightRegistry,
    master_key: OnceLock<[u8; 32]>,
    master_key_init: Mutex<()>,
    auth_proxy_tickets: Mutex<HashMap<String, AuthProxyTicket>>,
    auth_proxy_inbox: Mutex<AuthProxyInbox>,
    init_error: RwLock<Option<String>>,
}

impl AccountManagerState {
    pub fn new() -> Self {
        Self {
            snapshot: RwLock::default(),
            probe_semaphore: Arc::new(Semaphore::new(PROBE_CONCURRENCY)),
            probe_flights: Arc::new(Mutex::new(HashMap::new())),
            master_key: OnceLock::new(),
            master_key_init: Mutex::new(()),
            auth_proxy_tickets: Mutex::new(HashMap::new()),
            auth_proxy_inbox: Mutex::new(AuthProxyInbox::default()),
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

    pub(crate) fn begin_probe_flight(&self, account_id: &str) -> ProbeFlight {
        let mut registry = self.probe_flights.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(flight) = registry.get(account_id) {
            return ProbeFlight::Follower(ProbeFlightFollower {
                flight: flight.clone(),
            });
        }

        let flight = Arc::new(InFlightProbe::default());
        registry.insert(account_id.to_string(), flight.clone());
        ProbeFlight::Leader(ProbeFlightLeader {
            account_id: account_id.to_string(),
            flight,
            registry: self.probe_flights.clone(),
            completed: false,
        })
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

    pub(crate) fn enqueue_auth_proxy_url(
        &self,
        url: String,
    ) -> AccountManagerResult<AuthProxyInboxStatus> {
        if url.len() > MAX_AUTH_PROXY_URL_BYTES {
            return Err(AccountManagerError::invalid_input(
                "auth proxy deep link exceeds size limit",
            ));
        }
        let parsed = url::Url::parse(&url)
            .map_err(|_| AccountManagerError::invalid_input("auth proxy deep link is invalid"))?;
        if parsed.scheme() != "bench-auth" {
            return Err(AccountManagerError::invalid_input(
                "auth proxy deep link scheme is not allowed",
            ));
        }

        let fingerprint: [u8; 32] = Sha256::digest(url.as_bytes()).into();
        let now = chrono::Utc::now().timestamp();
        let mut inbox = self
            .auth_proxy_inbox
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        inbox.recent.retain(|(_, expires_at)| *expires_at > now);
        let duplicate = inbox
            .urls
            .iter()
            .any(|queued| queued.fingerprint == fingerprint)
            || inbox
                .recent
                .iter()
                .any(|(recent, _)| recent == &fingerprint);
        if duplicate {
            return Ok(AuthProxyInboxStatus {
                pending_count: inbox.urls.len(),
                dropped_count: inbox.dropped_count,
            });
        }
        if inbox.urls.len() >= MAX_AUTH_PROXY_INBOX_ITEMS {
            inbox.urls.pop_front();
            inbox.dropped_count = inbox.dropped_count.saturating_add(1);
        }
        inbox
            .urls
            .push_back(QueuedAuthProxyUrl { url, fingerprint });
        Ok(AuthProxyInboxStatus {
            pending_count: inbox.urls.len(),
            dropped_count: inbox.dropped_count,
        })
    }

    pub(crate) fn auth_proxy_inbox_status(&self) -> AuthProxyInboxStatus {
        let inbox = self
            .auth_proxy_inbox
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        AuthProxyInboxStatus {
            pending_count: inbox.urls.len(),
            dropped_count: inbox.dropped_count,
        }
    }

    pub(crate) fn take_auth_proxy_url(&self) -> (Option<String>, AuthProxyInboxStatus) {
        let mut inbox = self
            .auth_proxy_inbox
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let queued = inbox.urls.pop_front();
        if let Some(queued) = queued.as_ref() {
            inbox.recent.push_back((
                queued.fingerprint,
                chrono::Utc::now().timestamp() + AUTH_PROXY_DEDUP_TTL_SECONDS,
            ));
            while inbox.recent.len() > MAX_RECENT_AUTH_PROXY_REQUESTS {
                inbox.recent.pop_front();
            }
        }
        let status = AuthProxyInboxStatus {
            pending_count: inbox.urls.len(),
            dropped_count: std::mem::take(&mut inbox.dropped_count),
        };
        (queued.map(|queued| queued.url), status)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn probe_flights(
        state: &AccountManagerState,
        account_id: &str,
    ) -> (ProbeFlightLeader, ProbeFlightFollower) {
        let leader = match state.begin_probe_flight(account_id) {
            ProbeFlight::Leader(leader) => leader,
            ProbeFlight::Follower(_) => panic!("first caller must lead the probe"),
        };
        let follower = match state.begin_probe_flight(account_id) {
            ProbeFlight::Follower(follower) => follower,
            ProbeFlight::Leader(_) => panic!("concurrent caller must follow the probe"),
        };
        (leader, follower)
    }

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

    #[test]
    fn auth_proxy_inbox_accepts_only_bounded_bench_auth_urls() {
        let state = AccountManagerState::new();
        assert!(state
            .enqueue_auth_proxy_url("https://example.com/login".into())
            .is_err());
        assert!(state.enqueue_auth_proxy_url("not a url".into()).is_err());
        assert!(state
            .enqueue_auth_proxy_url(format!(
                "bench-auth://authorize?target={}",
                "a".repeat(MAX_AUTH_PROXY_URL_BYTES)
            ))
            .is_err());

        let status = state
            .enqueue_auth_proxy_url("bench-auth://authorize?target=one".into())
            .expect("enqueue valid scheme");
        assert_eq!(status.pending_count, 1);
        assert_eq!(status.dropped_count, 0);
    }

    #[test]
    fn auth_proxy_inbox_is_fifo_and_drops_the_oldest_item_at_capacity() {
        let state = AccountManagerState::new();
        for index in 0..=MAX_AUTH_PROXY_INBOX_ITEMS {
            state
                .enqueue_auth_proxy_url(format!("bench-auth://authorize?target={index}"))
                .expect("enqueue");
        }

        let status = state.auth_proxy_inbox_status();
        assert_eq!(status.pending_count, MAX_AUTH_PROXY_INBOX_ITEMS);
        assert_eq!(status.dropped_count, 1);

        let (first, first_status) = state.take_auth_proxy_url();
        assert_eq!(first.as_deref(), Some("bench-auth://authorize?target=1"));
        assert_eq!(first_status.pending_count, MAX_AUTH_PROXY_INBOX_ITEMS - 1);
        assert_eq!(first_status.dropped_count, 1);

        let (second, second_status) = state.take_auth_proxy_url();
        assert_eq!(second.as_deref(), Some("bench-auth://authorize?target=2"));
        assert_eq!(second_status.dropped_count, 0);
    }

    #[test]
    fn auth_proxy_inbox_deduplicates_queued_and_recently_consumed_urls() {
        let state = AccountManagerState::new();
        let url = "bench-auth://authorize?target=one".to_string();
        state
            .enqueue_auth_proxy_url(url.clone())
            .expect("first enqueue");
        let queued_duplicate = state
            .enqueue_auth_proxy_url(url.clone())
            .expect("queued duplicate");
        assert_eq!(queued_duplicate.pending_count, 1);

        let (consumed, _) = state.take_auth_proxy_url();
        assert_eq!(consumed.as_deref(), Some(url.as_str()));
        let recent_duplicate = state.enqueue_auth_proxy_url(url).expect("recent duplicate");
        assert_eq!(recent_duplicate.pending_count, 0);
    }

    #[tokio::test]
    async fn concurrent_probe_callers_share_the_leader_result() {
        let state = AccountManagerState::new();
        let (leader, follower) = probe_flights(&state, "acct-1");

        leader.complete(Err(AccountManagerError::store_fail("probe failed")));

        let error = follower.wait().await.unwrap_err();
        assert!(matches!(
            error,
            AccountManagerError::StoreFail { message } if message == "probe failed"
        ));
        assert!(matches!(
            state.begin_probe_flight("acct-1"),
            ProbeFlight::Leader(_)
        ));
    }

    #[tokio::test]
    async fn cancelled_probe_leader_releases_waiters_and_registry() {
        let state = AccountManagerState::new();
        let (leader, follower) = probe_flights(&state, "acct-1");

        drop(leader);

        let error = follower.wait().await.unwrap_err();
        assert!(matches!(
            error,
            AccountManagerError::StoreFail { message } if message == "probe operation was cancelled"
        ));
        assert!(matches!(
            state.begin_probe_flight("acct-1"),
            ProbeFlight::Leader(_)
        ));
    }
}
