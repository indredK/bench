use crate::app_manager::types::{AppInfo, ProviderState, ProviderStatus, UpdateInfo, UpdateSource};
use async_trait::async_trait;
use std::sync::Arc;

pub mod electron;
pub mod homebrew;
pub mod mac_app_store;
pub mod sparkle;

#[async_trait]
pub trait UpdaterSource: Send + Sync {
    fn id(&self) -> UpdateSource;

    /// Whether this source can produce an update for the given app.
    /// Cheap, synchronous check — no network or slow IO.
    fn applies_to(&self, app: &AppInfo) -> bool;

    /// Probe for an actually available update. Returns Ok(None) if up-to-date,
    /// Err for a real failure (so the registry can log/skip it cleanly).
    async fn check_for_update(&self, app: &AppInfo) -> Result<Option<UpdateInfo>, String>;
}

/// Aggregates registered sources and dispatches per-app checks across them.
pub struct SourceRegistry {
    sources: Vec<Arc<dyn UpdaterSource>>,
}

#[derive(Debug, Default)]
pub struct SourceCheckReport {
    pub updates: Vec<UpdateInfo>,
    pub providers: Vec<ProviderStatus>,
}

impl SourceRegistry {
    pub fn new() -> Self {
        Self {
            sources: Vec::new(),
        }
    }

    pub fn register(&mut self, source: Arc<dyn UpdaterSource>) {
        self.sources.push(source);
    }

    /// Default macOS registry: Homebrew + Mac App Store + Electron + Sparkle.
    /// Order matters — the first matching source wins for a given app.
    /// Sparkle is the catch-all; ElectronSource must run before it so apps with
    /// both an Electron framework and an SUFeedURL are routed to electron-updater.
    /// SparkleSource internally branches Squirrel.Mac via JSON detection.
    pub fn default_macos() -> Self {
        let mut reg = Self::new();
        reg.register(Arc::new(homebrew::HomebrewSource::new()));
        reg.register(Arc::new(mac_app_store::MacAppStoreSource::new()));
        reg.register(Arc::new(electron::ElectronSource::new()));
        reg.register(Arc::new(sparkle::SparkleSource::new()));
        reg
    }

    #[allow(dead_code)]
    pub fn sources(&self) -> &[Arc<dyn UpdaterSource>] {
        &self.sources
    }

    /// Find the first matching source for `app`, if any.
    pub fn match_source(&self, app: &AppInfo) -> Option<Arc<dyn UpdaterSource>> {
        self.sources.iter().find(|s| s.applies_to(app)).cloned()
    }

    /// Scan every app across every applicable source. Concurrency capped at
    /// `MAX_CONCURRENT` to keep memory + network pressure bounded.
    pub async fn check_all(&self, apps: &[AppInfo]) -> SourceCheckReport {
        const MAX_CONCURRENT: usize = 10;
        use tokio::sync::Semaphore;

        let sem = Arc::new(Semaphore::new(MAX_CONCURRENT));
        let mut handles = Vec::with_capacity(apps.len());

        for app in apps {
            let Some(source) = self.match_source(app) else {
                continue;
            };
            let app = app.clone();
            let sem = sem.clone();
            handles.push(tokio::spawn(async move {
                let provider = source.id();
                let _permit = sem
                    .acquire()
                    .await
                    .map_err(|_| "UPDATE_PROVIDER_CLOSED".to_string())?;
                source
                    .check_for_update(&app)
                    .await
                    .map(|update| (provider, update))
                    .map_err(|error| format!("{provider}:{error}"))
            }));
        }

        let mut results = SourceCheckReport::default();
        let mut provider_failures = std::collections::HashSet::new();
        let mut provider_successes = std::collections::HashSet::new();
        for h in handles {
            match h.await {
                Ok(Ok((provider, Some(update)))) => {
                    provider_successes.insert(provider);
                    results.updates.push(update);
                }
                Ok(Ok((provider, None))) => {
                    provider_successes.insert(provider);
                }
                Ok(Err(error)) => {
                    if let Some((provider, _)) = error.split_once(':') {
                        provider_failures.insert(provider.to_string());
                    }
                }
                Err(_) => {
                    provider_failures.insert("runtime".to_string());
                }
            }
        }

        for source in &self.sources {
            let provider = source.id();
            if !provider_successes.contains(&provider)
                && !provider_failures.contains(&provider.to_string())
            {
                results.providers.push(ProviderStatus {
                    provider: provider.to_string(),
                    state: ProviderState::Unsupported,
                    error_code: Some("UPDATE_PROVIDER_NOT_APPLICABLE".to_string()),
                });
                continue;
            }
            let failed = provider_failures.contains(&provider.to_string());
            results.providers.push(ProviderStatus {
                provider: provider.to_string(),
                state: if failed && provider_successes.contains(&provider) {
                    ProviderState::Partial
                } else if failed {
                    ProviderState::Failed
                } else {
                    ProviderState::Ok
                },
                error_code: failed.then(|| "UPDATE_PROVIDER_FAILED".to_string()),
            });
        }
        if provider_failures.contains("runtime") {
            results.providers.push(ProviderStatus {
                provider: "runtime".to_string(),
                state: ProviderState::Failed,
                error_code: Some("UPDATE_TASK_JOIN_FAILED".to_string()),
            });
        }
        results
    }
}

impl Default for SourceRegistry {
    fn default() -> Self {
        Self::new()
    }
}
