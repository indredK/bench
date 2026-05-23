use crate::app_manager::types::{AppInfo, UpdateInfo, UpdateSource};
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
    pub async fn check_all(&self, apps: &[AppInfo]) -> Vec<UpdateInfo> {
        const MAX_CONCURRENT: usize = 10;
        use tokio::sync::Semaphore;

        let sem = Arc::new(Semaphore::new(MAX_CONCURRENT));
        let mut handles = Vec::with_capacity(apps.len());

        for app in apps.iter().cloned() {
            let Some(source) = self.match_source(&app) else {
                continue;
            };
            let sem = sem.clone();
            handles.push(tokio::spawn(async move {
                let _permit = sem.acquire().await.ok()?;
                match source.check_for_update(&app).await {
                    Ok(opt) => opt,
                    Err(err) => {
                        eprintln!("[updater] {} {} failed: {}", source.id(), app.app_id, err);
                        None
                    }
                }
            }));
        }

        let mut results = Vec::new();
        for h in handles {
            if let Ok(Some(update)) = h.await {
                results.push(update);
            }
        }
        results
    }
}

impl Default for SourceRegistry {
    fn default() -> Self {
        Self::new()
    }
}
