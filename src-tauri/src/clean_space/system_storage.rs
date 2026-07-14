//! System Storage Scanner / 系统存储扫描
//!
//! macOS implementation using `du` and standard paths.
//! Platform abstraction: front-end only sees `StorageOverview`.
//!
//! All `du`/`df` calls run in parallel via `std::thread::scope`
//! so the blocking window is reduced to the single slowest path.

use std::cmp::Reverse;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::shell_util::shell_escape;
use super::types::{
    CleanupProtectionKind, PriorityTier, RiskLevel, StorageCategory, StorageItem, StorageOverview,
};
use crate::error::AppResult;
use crate::subprocess::run_output_with_timeout;

/// Event emitted when streaming scan starts.
#[derive(Debug, Clone, Serialize)]
pub struct ScanStartPayload {
    pub disk_total_bytes: u64,
    pub disk_used_bytes: u64,
}

/// Event names for streaming scan.
const EVENT_SCAN_START: &str = "clean-space:scan-start";
const EVENT_SCAN_CATEGORY: &str = "clean-space:scan-category";
const EVENT_SCAN_COMPLETE: &str = "clean-space:scan-complete";
const OVERVIEW_CACHE_VERSION: u32 = 1;
const OVERVIEW_CACHE_MAX_AGE_SECS: u64 = 7 * 24 * 60 * 60;
const DISK_INFO_TIMEOUT: Duration = Duration::from_secs(10);
const SIZE_COMMAND_TIMEOUT: Duration = Duration::from_secs(120);
const SNAPSHOT_COMMAND_TIMEOUT: Duration = Duration::from_secs(30);

/// Query `df -k /` once and return (total_bytes, used_bytes).
///
/// Single invocation avoids the duplicate `df` call that the previous
/// separate `get_disk_total_bytes` / `get_disk_used_bytes` functions issued.
///
/// **APFS multi-volume caveat (macOS)**: APFS packs multiple volumes into a
/// single container that shares free space. The volume mounted at `/` is the
/// read-only system volume (e.g. `Macintosh HD`), whose `Used` column only
/// reflects that one volume (~15 GB of system files), NOT the whole container.
/// The user's data lives on a separate data volume mounted at
/// `/System/Volumes/Data`.
///
/// Both `1K-blocks` and `Available` are container-level (identical across all
/// volumes in the container), so the correct container-level used bytes is
/// `total - available`. Reading the `Used` column directly would under-report
/// used space by hundreds of GB, making "Free" appear far larger than what
/// macOS System Settings shows.
fn get_disk_info() -> (u64, u64) {
    let output =
        run_output_with_timeout(Command::new("df").args(["-k", "/"]), DISK_INFO_TIMEOUT).ok();
    if let Some(out) = output {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            // df columns: Filesystem 1K-blocks Used Available Capacity Mounted on
            // We need parts[3] (Available), so require at least 4 columns.
            if parts.len() >= 4 {
                let total_kb = parts[1].parse::<u64>().unwrap_or(0);
                let available_kb = parts[3].parse::<u64>().unwrap_or(0);
                // Derive container-level used as total − available. On APFS
                // this is correct because both values are container-scoped.
                let used_kb = total_kb.saturating_sub(available_kb);
                return (total_kb * 1024, used_kb * 1024);
            }
        }
    }
    (0, 0)
}

/// Estimate directory size using `du -skx <path>`.
///
/// `-x` is critical on macOS with APFS: without it, `du /System` would
/// traverse `/System/Volumes/Data` (the data volume mount point) and report
/// the entire disk's usage as the size of `/System` (often 400+ GB instead
/// of the actual ~12 GB system volume). `-x` prevents crossing filesystem
/// boundaries, so each `du` call stays within its intended volume.
pub(crate) fn du_size_bytes(path: &str) -> u64 {
    let output = run_output_with_timeout(
        Command::new("du").args(["-skx", path]),
        SIZE_COMMAND_TIMEOUT,
    )
    .ok();
    if let Some(out) = output {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Some(first_line) = s.lines().next() {
            let parts: Vec<&str> = first_line.split_whitespace().collect();
            if let Some(kb) = parts.first().and_then(|k| k.parse::<u64>().ok()) {
                return kb * 1024;
            }
        }
    }
    0
}

fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/Users/unknown"))
}

#[derive(Debug, Clone)]
struct LocalSnapshotInfo {
    count: usize,
    size_bytes: u64,
}

fn local_snapshot_info() -> LocalSnapshotInfo {
    let snapshot_count = run_output_with_timeout(
        Command::new("tmutil").args(["listlocalsnapshots", "/"]),
        SNAPSHOT_COMMAND_TIMEOUT,
    )
    .ok()
    .map(|out| {
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter(|line| line.contains("com.apple.TimeMachine"))
            .count()
    })
    .unwrap_or(0);

    let snapshot_size = run_output_with_timeout(
        Command::new("diskutil").args(["apfs", "listSnapshots", "/", "-plist"]),
        SNAPSHOT_COMMAND_TIMEOUT,
    )
    .ok()
    .and_then(|out| {
        if out.status.success() {
            plist::Value::from_reader_xml(out.stdout.as_slice()).ok()
        } else {
            None
        }
    })
    .and_then(|value| sum_snapshot_bytes(&value));

    LocalSnapshotInfo {
        count: snapshot_count,
        size_bytes: snapshot_size.unwrap_or(0),
    }
}

fn sum_snapshot_bytes(value: &plist::Value) -> Option<u64> {
    match value {
        plist::Value::Dictionary(dict) => {
            let mut total = 0_u64;
            for (key, value) in dict {
                if key.contains("Snapshot")
                    && (key.contains("Size") || key.contains("Capacity") || key.contains("Bytes"))
                {
                    total += plist_integer_to_u64(value).unwrap_or(0);
                }
                total += sum_snapshot_bytes(value).unwrap_or(0);
            }
            Some(total)
        }
        plist::Value::Array(values) => Some(values.iter().filter_map(sum_snapshot_bytes).sum()),
        _ => None,
    }
}

fn plist_integer_to_u64(value: &plist::Value) -> Option<u64> {
    match value {
        plist::Value::Integer(value) => value.as_unsigned(),
        _ => None,
    }
}

#[derive(Clone)]
struct StoragePaths {
    home: PathBuf,
    apps: PathBuf,
    docs: PathBuf,
    downloads: PathBuf,
    desktop: PathBuf,
    music: PathBuf,
    pictures: PathBuf,
    movies: PathBuf,
    lib_caches: PathBuf,
    lib_logs: PathBuf,
    trash: PathBuf,
    vm: PathBuf,
    private_var_logs: PathBuf,
    private_var_folders: PathBuf,
    updates: PathBuf,
    mobile_backups: PathBuf,
    mail: PathBuf,
    messages: PathBuf,
    spotlight: PathBuf,
    app_support: PathBuf,
    containers: PathBuf,
    group_containers: PathBuf,
    shared: PathBuf,
    xcode_derived: PathBuf,
    xcode_archives: PathBuf,
    docker: PathBuf,
    homebrew_as: PathBuf,
    homebrew_intel: PathBuf,
}

impl StoragePaths {
    fn new(home: &Path) -> Self {
        Self {
            home: home.to_path_buf(),
            apps: PathBuf::from("/Applications"),
            docs: home.join("Documents"),
            downloads: home.join("Downloads"),
            desktop: home.join("Desktop"),
            music: home.join("Music"),
            pictures: home.join("Pictures"),
            movies: home.join("Movies"),
            lib_caches: home.join("Library/Caches"),
            lib_logs: home.join("Library/Logs"),
            trash: home.join(".Trash"),
            vm: PathBuf::from("/private/var/vm"),
            private_var_logs: PathBuf::from("/private/var/log"),
            private_var_folders: PathBuf::from("/private/var/folders"),
            updates: PathBuf::from("/Library/Updates"),
            mobile_backups: home.join("Library/Application Support/MobileSync/Backup"),
            mail: home.join("Library/Mail"),
            messages: home.join("Library/Messages"),
            spotlight: PathBuf::from("/System/Volumes/Data/.Spotlight-V100"),
            app_support: home.join("Library/Application Support"),
            containers: home.join("Library/Containers"),
            group_containers: home.join("Library/Group Containers"),
            shared: PathBuf::from("/Users/Shared"),
            xcode_derived: home.join("Library/Developer/Xcode/DerivedData"),
            xcode_archives: home.join("Library/Developer/Xcode/Archives"),
            docker: home.join("Library/Containers/com.docker.docker"),
            homebrew_as: PathBuf::from("/opt/homebrew"),
            homebrew_intel: PathBuf::from("/usr/local"),
        }
    }

    fn overview_paths(&self) -> Vec<PathBuf> {
        let mut paths = vec![
            self.apps.clone(),
            self.docs.clone(),
            self.downloads.clone(),
            self.desktop.clone(),
            self.music.clone(),
            self.pictures.clone(),
            self.movies.clone(),
            self.lib_caches.clone(),
            self.lib_logs.clone(),
            self.trash.clone(),
            self.vm.clone(),
            self.private_var_logs.clone(),
            self.private_var_folders.clone(),
            self.updates.clone(),
            self.mobile_backups.clone(),
            self.mail.clone(),
            self.messages.clone(),
            self.spotlight.clone(),
            self.app_support.clone(),
            self.containers.clone(),
            self.group_containers.clone(),
            self.shared.clone(),
            self.xcode_derived.clone(),
            self.xcode_archives.clone(),
            self.docker.clone(),
            self.homebrew_as.clone(),
            self.homebrew_intel.clone(),
        ];
        paths.extend(self.developer_cache_paths());
        paths
    }

    fn document_paths(&self) -> [PathBuf; 5] {
        [
            self.docs.clone(),
            self.desktop.clone(),
            self.music.clone(),
            self.pictures.clone(),
            self.movies.clone(),
        ]
    }

    fn cleanable_system_data_paths(&self) -> [PathBuf; 3] {
        [
            self.lib_caches.clone(),
            self.lib_logs.clone(),
            self.trash.clone(),
        ]
    }

    fn protected_system_data_paths(&self) -> [PathBuf; 8] {
        [
            self.vm.clone(),
            self.private_var_logs.clone(),
            self.private_var_folders.clone(),
            self.updates.clone(),
            self.mobile_backups.clone(),
            self.mail.clone(),
            self.messages.clone(),
            self.spotlight.clone(),
        ]
    }

    fn system_data_paths(&self) -> Vec<PathBuf> {
        let mut paths = self.cleanable_system_data_paths().to_vec();
        paths.extend(self.protected_system_data_paths());
        paths
    }

    fn app_data_paths(&self) -> [PathBuf; 3] {
        [
            self.app_support.clone(),
            self.containers.clone(),
            self.group_containers.clone(),
        ]
    }

    fn developer_paths(&self) -> [PathBuf; 5] {
        [
            self.xcode_derived.clone(),
            self.xcode_archives.clone(),
            self.docker.clone(),
            self.homebrew_as.clone(),
            self.homebrew_intel.clone(),
        ]
    }

    fn developer_cache_paths(&self) -> Vec<PathBuf> {
        developer_cache_specs(&self.home)
            .iter()
            .map(|(_, _, path, _)| path.clone())
            .collect()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct OverviewTotals {
    disk_total: u64,
    disk_used: u64,
    apps: u64,
    downloads: u64,
    documents: u64,
    system_data: u64,
    app_data: u64,
    other_users: u64,
    developer: u64,
}

impl OverviewTotals {
    fn known_bytes(&self) -> u64 {
        self.apps
            + self.downloads
            + self.documents
            + self.system_data
            + self.app_data
            + self.other_users
            + self.developer
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct StorageOverviewCache {
    version: u32,
    created_at: u64,
    disk_total_bytes: u64,
    disk_used_bytes: u64,
    categories: Vec<StorageCategory>,
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn overview_cache_path() -> Option<PathBuf> {
    dirs::cache_dir().map(|dir| dir.join("bench").join("clean-space").join("overview.json"))
}

fn load_cached_overview(disk_total: u64, disk_used: u64) -> Option<StorageOverview> {
    let path = overview_cache_path()?;
    let content = fs::read_to_string(path).ok()?;
    let cache: StorageOverviewCache = serde_json::from_str(&content).ok()?;
    if cache.version != OVERVIEW_CACHE_VERSION {
        return None;
    }
    if cache.disk_total_bytes != disk_total {
        return None;
    }
    if now_unix_secs().saturating_sub(cache.created_at) > OVERVIEW_CACHE_MAX_AGE_SECS {
        return None;
    }

    Some(rebalance_macos_remainder(
        StorageOverview {
            disk_total_bytes: disk_total,
            categories: cache.categories,
        },
        disk_used,
    ))
}

fn write_cached_overview(overview: &StorageOverview, disk_used: u64) {
    let Some(path) = overview_cache_path() else {
        return;
    };
    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }

    let cache = StorageOverviewCache {
        version: OVERVIEW_CACHE_VERSION,
        created_at: now_unix_secs(),
        disk_total_bytes: overview.disk_total_bytes,
        disk_used_bytes: disk_used,
        categories: overview.categories.clone(),
    };
    if let Ok(json) = serde_json::to_string_pretty(&cache) {
        let _ = fs::write(path, json);
    }
}

fn rebalance_macos_remainder(mut overview: StorageOverview, disk_used: u64) -> StorageOverview {
    let known_without_macos: u64 = overview
        .categories
        .iter()
        .filter(|category| category.id != "macos")
        .map(|category| category.total_bytes)
        .sum();
    let macos_total = disk_used.saturating_sub(known_without_macos);

    if let Some(macos) = overview
        .categories
        .iter_mut()
        .find(|category| category.id == "macos")
    {
        macos.total_bytes = macos_total;
        if macos.items.len() == 1 {
            if let Some(item) = macos.items.first_mut() {
                item.size_bytes = macos_total;
            }
        }
    } else {
        overview.categories.push(category_stub(
            "macos",
            "macOS",
            "var(--chart-7)",
            macos_total,
        ));
    }
    sort_overview_categories(&mut overview.categories);
    overview
}

fn cached_known_non_macos_bytes(disk_total: u64, disk_used: u64) -> Option<u64> {
    load_cached_overview(disk_total, disk_used).map(|overview| {
        overview
            .categories
            .iter()
            .filter(|category| category.id != "macos")
            .map(|category| category.total_bytes)
            .sum()
    })
}

fn category_order(id: &str) -> usize {
    match id {
        "applications" => 0,
        "downloads" => 1,
        "documents" => 2,
        "system_data" => 3,
        "app_data" => 4,
        "other_users" => 5,
        "macos" => 6,
        "developer" => 7,
        _ => usize::MAX,
    }
}

fn sort_overview_categories(categories: &mut [StorageCategory]) {
    categories.sort_by_key(|category| category_order(&category.id));
}

fn category_stub(
    id: impl Into<String>,
    name: impl Into<String>,
    color: impl Into<String>,
    total_bytes: u64,
) -> StorageCategory {
    StorageCategory {
        id: id.into(),
        name: name.into(),
        color: color.into(),
        total_bytes,
        items: vec![],
    }
}

fn build_overview(totals: OverviewTotals) -> StorageOverview {
    let mut categories = vec![
        category_stub(
            "applications",
            "Applications",
            "var(--chart-1)",
            totals.apps,
        ),
        category_stub("downloads", "Downloads", "var(--chart-2)", totals.downloads),
        category_stub("documents", "Documents", "var(--chart-3)", totals.documents),
        category_stub(
            "system_data",
            "System Data",
            "var(--chart-4)",
            totals.system_data,
        ),
        category_stub("app_data", "App Data", "var(--chart-5)", totals.app_data),
        category_stub(
            "other_users",
            "Other Users & Shared",
            "var(--chart-6)",
            totals.other_users,
        ),
        category_stub(
            "macos",
            "macOS",
            "var(--chart-7)",
            totals.disk_used.saturating_sub(totals.known_bytes()),
        ),
        category_stub("developer", "Developer", "var(--chart-8)", totals.developer),
    ];
    sort_overview_categories(&mut categories);
    StorageOverview {
        disk_total_bytes: totals.disk_total,
        categories,
    }
}

fn fast_overview(disk_total: u64, disk_used: u64) -> StorageOverview {
    build_overview(OverviewTotals {
        disk_total,
        disk_used,
        apps: 0,
        downloads: 0,
        documents: 0,
        system_data: 0,
        app_data: 0,
        other_users: 0,
        developer: 0,
    })
}

fn emit_overview(app: &AppHandle, overview: &StorageOverview) {
    let mut categories = overview.categories.clone();
    sort_overview_categories(&mut categories);
    let mut macos_category = None;
    for category in categories {
        if category.id == "macos" {
            macos_category = Some(category);
            continue;
        }
        let _ = app.emit(EVENT_SCAN_CATEGORY, &category);
    }
    if let Some(category) = macos_category {
        let _ = app.emit(EVENT_SCAN_CATEGORY, &category);
    }
}

fn parse_du_size(line: &str) -> Option<u64> {
    let trimmed = line.trim_start();
    let split_idx = trimmed.find(char::is_whitespace)?;
    trimmed[..split_idx].parse::<u64>().ok().map(|kb| kb * 1024)
}

fn parse_du_line(line: &str) -> Option<(u64, String)> {
    let trimmed = line.trim_start();
    let split_idx = trimmed.find(char::is_whitespace)?;
    let size_bytes = parse_du_size(trimmed)?;
    let path = trimmed[split_idx..].trim_start();
    if path.is_empty() {
        return None;
    }
    Some((size_bytes, path.to_string()))
}

fn du_sizes_for_paths(paths: &[PathBuf]) -> Vec<(PathBuf, u64)> {
    let mut sizes = Vec::new();
    let existing_paths: Vec<PathBuf> = paths.iter().filter(|path| path.exists()).cloned().collect();

    for chunk in existing_paths.chunks(128) {
        let output = run_output_with_timeout(
            Command::new("du").arg("-skx").args(chunk),
            SIZE_COMMAND_TIMEOUT,
        )
        .ok();
        if let Some(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let mut sizes_by_path: HashMap<String, u64> = HashMap::new();
            for line in stdout.lines() {
                if let Some((size, path)) = parse_du_line(line) {
                    sizes_by_path.insert(path.trim_end_matches('/').to_string(), size);
                }
            }

            for path in chunk {
                let key = path.to_string_lossy().trim_end_matches('/').to_string();
                let size = sizes_by_path.get(&key).copied().unwrap_or(0);
                sizes.push((path.clone(), size));
            }
        }
    }
    sizes
}

fn du_size_lookup(paths: &[PathBuf]) -> HashMap<PathBuf, u64> {
    du_sizes_for_paths(paths).into_iter().collect()
}

fn lookup_size(sizes: &HashMap<PathBuf, u64>, path: &Path) -> u64 {
    sizes.get(path).copied().unwrap_or(0)
}

fn sum_path_sizes(sizes: &HashMap<PathBuf, u64>, paths: &[PathBuf]) -> u64 {
    paths.iter().map(|path| lookup_size(sizes, path)).sum()
}

fn sum_paths_inside(sizes: &HashMap<PathBuf, u64>, paths: &[PathBuf], roots: &[PathBuf]) -> u64 {
    paths
        .iter()
        .filter(|path| roots.iter().any(|root| path.starts_with(root)))
        .map(|path| lookup_size(sizes, path))
        .sum()
}

fn developer_specific_paths(paths: &StoragePaths) -> Vec<PathBuf> {
    let mut developer_paths = paths.developer_paths().to_vec();
    developer_paths.extend(paths.developer_cache_paths());
    developer_paths
}

fn system_data_total_from_lookup(
    sizes: &HashMap<PathBuf, u64>,
    system_paths: &[PathBuf],
    developer_paths: &[PathBuf],
    snapshot_bytes: u64,
) -> u64 {
    sum_path_sizes(sizes, system_paths)
        .saturating_sub(sum_paths_inside(sizes, developer_paths, system_paths))
        .saturating_add(snapshot_bytes)
}

fn app_data_total_from_lookup(
    sizes: &HashMap<PathBuf, u64>,
    app_data_paths: &[PathBuf],
    system_paths: &[PathBuf],
    developer_paths: &[PathBuf],
) -> u64 {
    let mut specific_paths = system_paths.to_vec();
    specific_paths.extend(developer_paths.iter().cloned());
    sum_path_sizes(sizes, app_data_paths).saturating_sub(sum_paths_inside(
        sizes,
        &specific_paths,
        app_data_paths,
    ))
}

fn developer_total_from_lookup(sizes: &HashMap<PathBuf, u64>, developer_paths: &[PathBuf]) -> u64 {
    sum_path_sizes(sizes, developer_paths)
}

fn lookup_paths_with_overlaps(roots: &[PathBuf], specific_paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut paths = roots.to_vec();
    paths.extend(
        specific_paths
            .iter()
            .filter(|path| roots.iter().any(|root| path.starts_with(root)))
            .cloned(),
    );
    paths
}

fn total_with_overlaps_subtracted(
    roots: &[PathBuf],
    specific_paths: &[PathBuf],
) -> (HashMap<PathBuf, u64>, u64) {
    let lookup_paths = lookup_paths_with_overlaps(roots, specific_paths);
    let sizes = du_size_lookup(&lookup_paths);
    let total = sum_path_sizes(&sizes, roots).saturating_sub(sum_paths_inside(
        &sizes,
        specific_paths,
        roots,
    ));
    (sizes, total)
}

fn take_bounded(value: u64, remaining: &mut u64) -> u64 {
    let taken = value.min(*remaining);
    *remaining = remaining.saturating_sub(taken);
    taken
}

fn direct_child_sizes<F>(dir: &str, limit: usize, min_bytes: u64, include: F) -> Vec<(PathBuf, u64)>
where
    F: Fn(&Path) -> bool,
{
    let paths: Vec<PathBuf> = fs::read_dir(dir)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(Result::ok))
        .map(|entry| entry.path())
        .filter(|path| include(path))
        .collect();

    let mut sizes: Vec<(PathBuf, u64)> = du_sizes_for_paths(&paths)
        .into_iter()
        .filter(|(_, size)| *size >= min_bytes)
        .collect();
    sizes.sort_by_key(|item| Reverse(item.1));
    sizes.truncate(limit);
    sizes
}

struct StorageItemSpec {
    id: String,
    name: String,
    category_id: String,
    risk: RiskLevel,
    size: u64,
    command: String,
    path: String,
    reason: String,
}

impl StorageItemSpec {
    fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        category_id: impl Into<String>,
        risk: RiskLevel,
        size: u64,
        path: impl Into<String>,
        reason: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            category_id: category_id.into(),
            risk,
            size,
            command: String::new(),
            path: path.into(),
            reason: reason.into(),
        }
    }

    fn with_command(mut self, command: impl Into<String>) -> Self {
        self.command = command.into();
        self
    }

    fn build(self) -> StorageItem {
        let is_cleanable = !self.command.trim().is_empty();
        StorageItem {
            id: self.id,
            name: self.name,
            category_id: self.category_id,
            risk_level: self.risk,
            size_bytes: self.size,
            command: self.command,
            is_cleanable,
            protection_kind: if is_cleanable {
                CleanupProtectionKind::None
            } else {
                CleanupProtectionKind::MissingCleanupRule
            },
            protection_reason: if is_cleanable {
                String::new()
            } else {
                "No safe cleanup rule is available for this item".to_string()
            },
            path: self.path,
            files: String::new(),
            reason: self.reason,
            priority: PriorityTier::P2,
            score: 0.0,
        }
    }

    fn build_protected(
        mut self,
        protection_kind: CleanupProtectionKind,
        protection_reason: impl Into<String>,
    ) -> StorageItem {
        self.command.clear();
        StorageItem {
            id: self.id,
            name: self.name,
            category_id: self.category_id,
            risk_level: self.risk,
            size_bytes: self.size,
            command: String::new(),
            is_cleanable: false,
            protection_kind,
            protection_reason: protection_reason.into(),
            path: self.path,
            files: String::new(),
            reason: self.reason,
            priority: PriorityTier::P2,
            score: 0.0,
        }
    }
}

/// List individual .app bundles in /Applications with their sizes.
/// Uses a single `du` invocation for all apps (much faster than per-app calls).
fn list_app_items() -> Vec<StorageItem> {
    let apps_dir = "/Applications";
    let mut items: Vec<StorageItem> = direct_child_sizes(apps_dir, 80, 1, |path| {
        path.extension()
            .map(|ext| ext.eq_ignore_ascii_case("app"))
            .unwrap_or(false)
    })
    .into_iter()
    .map(|(path_buf, size)| {
        let path_str = path_buf.to_string_lossy().to_string();
        let name = path_buf
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path_str.clone());
        let id = format!("app_{}", name.to_lowercase().replace(' ', "_"));
        StorageItemSpec::new(
            id,
            name,
            "applications",
            RiskLevel::Medium,
            size,
            path_str,
            "Installed application bundle",
        )
        .build_protected(
            CleanupProtectionKind::AppBundle,
            "Applications must be removed through the app manager or system uninstall flow",
        )
    })
    .collect();

    // Sort by size descending
    items.sort_by_key(|item| Reverse(item.size_bytes));

    // Fallback: always show at least one entry
    if items.is_empty() {
        items.push(
            StorageItemSpec::new(
                "apps_all",
                "Applications",
                "applications",
                RiskLevel::Medium,
                0,
                apps_dir,
                "Installed applications",
            )
            .build_protected(
                CleanupProtectionKind::AppBundle,
                "Applications must be removed through the app manager or system uninstall flow",
            ),
        );
    }
    items
}

/// List items under Downloads directory.
fn list_downloads_items(downloads_path: &str) -> Vec<StorageItem> {
    let mut items: Vec<StorageItem> = direct_child_sizes(downloads_path, 50, 1024, |_| true)
        .into_iter()
        .map(|(path_buf, size)| {
            let path_str = path_buf.to_string_lossy().to_string();
            let name = path_buf
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone());
            let id = format!("dl_{}", name.to_lowercase().replace(' ', "_"));
            StorageItemSpec::new(
                id,
                name,
                "downloads",
                RiskLevel::Low,
                size,
                &path_str,
                "Downloaded file/folder",
            )
            .with_command(format!("rm -rf {}", shell_escape(&path_str)))
            .build()
        })
        .collect();
    items.sort_by_key(|item| Reverse(item.size_bytes));
    if items.is_empty() {
        items.push(
            StorageItemSpec::new(
                "downloads_empty",
                "Downloads",
                "downloads",
                RiskLevel::Safe,
                0,
                downloads_path,
                "Downloads folder (empty)",
            )
            .build(),
        );
    }
    items
}

/// List sub-directories of Documents (including Desktop, Music, Pictures, Movies).
///
/// Uses a single `du` call for all 5 sub-dirs instead of 5 separate calls,
/// cutting process-spawn overhead roughly in half.
fn list_documents_items(docs_path: &str, home_str: &str) -> Vec<StorageItem> {
    let sub_dirs = [
        (
            "docs_documents",
            "Documents",
            docs_path.to_string(),
            RiskLevel::Low,
        ),
        (
            "docs_desktop",
            "Desktop",
            format!("{}/Desktop", home_str),
            RiskLevel::Low,
        ),
        (
            "docs_music",
            "Music",
            format!("{}/Music", home_str),
            RiskLevel::Low,
        ),
        (
            "docs_pictures",
            "Pictures",
            format!("{}/Pictures", home_str),
            RiskLevel::Low,
        ),
        (
            "docs_movies",
            "Movies",
            format!("{}/Movies", home_str),
            RiskLevel::Low,
        ),
    ];

    // Build a single du command: `du -skx path1 path2 path3 ...`
    // This spawns one process instead of N, which is much faster on macOS
    // where process creation is relatively expensive.
    let mut args: Vec<String> = vec!["-skx".to_string()];
    for (_, _, path, _) in &sub_dirs {
        args.push(path.clone());
    }

    let output = run_output_with_timeout(Command::new("du").args(&args), SIZE_COMMAND_TIMEOUT).ok();

    // Parse du output: each line is "<size_kb> <path>"
    let mut size_map: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    if let Some(out) = output {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines() {
            if let Some((size, path)) = parse_du_line(line) {
                size_map.insert(path.trim_end_matches('/').to_string(), size);
            }
        }
    }

    let mut items: Vec<StorageItem> = sub_dirs
        .iter()
        .map(|(id, name, path, risk)| {
            let size = size_map.get(path).copied().unwrap_or(0);
            StorageItemSpec::new(
                *id,
                *name,
                "documents",
                *risk,
                size,
                path,
                format!("{} folder", name),
            )
            .build_protected(
                CleanupProtectionKind::UserData,
                "User documents are shown for storage attribution and are not batch-cleaned",
            )
        })
        .filter(|item| item.size_bytes > 0)
        .collect();

    items.sort_by_key(|item| Reverse(item.size_bytes));
    if items.is_empty() {
        items.push(
            StorageItemSpec::new(
                "docs_all",
                "Documents",
                "documents",
                RiskLevel::Low,
                0,
                docs_path,
                "User documents folder",
            )
            .build_protected(
                CleanupProtectionKind::UserData,
                "User documents are shown for storage attribution and are not batch-cleaned",
            ),
        );
    }
    items
}

/// List items under App Data (Application Support, Containers, Group Containers).
fn list_app_data_items(paths: &StoragePaths) -> Vec<StorageItem> {
    let app_support_path = paths.app_support.to_string_lossy().to_string();
    let containers_path = paths.containers.to_string_lossy().to_string();
    let group_containers_path = paths.group_containers.to_string_lossy().to_string();
    let mobile_sync = paths
        .mobile_backups
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| paths.mobile_backups.clone());

    let mut items: Vec<StorageItem> =
        direct_child_sizes(&app_support_path, 30, 1024 * 1024, |path| {
            !path.starts_with(&mobile_sync)
        })
        .into_iter()
        .map(|(path_buf, size)| {
            let path_str = path_buf.to_string_lossy().to_string();
            let name = path_buf
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone());
            let id = format!("as_{}", name.to_lowercase().replace(' ', "_"));
            StorageItemSpec::new(
                id,
                name,
                "app_data",
                RiskLevel::Medium,
                size,
                &path_str,
                "Application support data",
            )
            .build_protected(
                CleanupProtectionKind::AppState,
                "Application support folders may contain licenses, databases, and user settings",
            )
        })
        .collect();

    // Containers & Group Containers as aggregate items
    let container_sizes = du_size_lookup(&[paths.containers.clone(), paths.docker.clone()]);
    let containers_size = lookup_size(&container_sizes, &paths.containers)
        .saturating_sub(lookup_size(&container_sizes, &paths.docker));
    if containers_size > 0 {
        items.push(
            StorageItemSpec::new(
                "app_containers",
                "Containers",
                "app_data",
                RiskLevel::Medium,
                containers_size,
                &containers_path,
                "App sandbox containers",
            )
            .build_protected(
                CleanupProtectionKind::AppState,
                "App containers may contain active app databases and sandboxed documents",
            ),
        );
    }
    let gc_size = du_size_bytes(&group_containers_path);
    if gc_size > 0 {
        items.push(
            StorageItemSpec::new(
                "app_group_containers",
                "Group Containers",
                "app_data",
                RiskLevel::Medium,
                gc_size,
                &group_containers_path,
                "Shared app group containers",
            )
            .build_protected(
                CleanupProtectionKind::AppState,
                "Group containers are shared app state and are not safe to bulk-delete",
            ),
        );
    }

    items.sort_by_key(|item| Reverse(item.size_bytes));
    if items.is_empty() {
        items.push(
            StorageItemSpec::new(
                "app_data_empty",
                "Application Data",
                "app_data",
                RiskLevel::Medium,
                0,
                &app_support_path,
                "Application support data (empty)",
            )
            .build_protected(
                CleanupProtectionKind::AppState,
                "Application support folders may contain licenses, databases, and user settings",
            ),
        );
    }
    items
}

struct ProtectedSystemDataSpec {
    id: &'static str,
    name: &'static str,
    path: PathBuf,
    reason: &'static str,
    protection_kind: CleanupProtectionKind,
    protection_reason: &'static str,
}

fn protected_system_data_specs(paths: &StoragePaths) -> [ProtectedSystemDataSpec; 8] {
    [
        ProtectedSystemDataSpec {
            id: "sys_vm",
            name: "Virtual Memory",
            path: paths.vm.clone(),
            reason: "Swap files and sleep image managed by macOS",
            protection_kind: CleanupProtectionKind::SystemCritical,
            protection_reason:
                "Virtual memory is managed by macOS and deleting it can destabilize the system",
        },
        ProtectedSystemDataSpec {
            id: "sys_var_logs",
            name: "System Logs",
            path: paths.private_var_logs.clone(),
            reason: "System diagnostic logs under /private/var/log",
            protection_kind: CleanupProtectionKind::SystemCritical,
            protection_reason: "System logs are under a protected path and are needed for diagnostics",
        },
        ProtectedSystemDataSpec {
            id: "sys_private_var_folders",
            name: "System Temp & Caches",
            path: paths.private_var_folders.clone(),
            reason: "Per-user and system temporary caches under /private/var/folders",
            protection_kind: CleanupProtectionKind::SystemCritical,
            protection_reason:
                "This directory contains active system and app temporary state; macOS reclaims it opportunistically",
        },
        ProtectedSystemDataSpec {
            id: "sys_updates",
            name: "System Update Staging",
            path: paths.updates.clone(),
            reason: "macOS update staging and installer assets",
            protection_kind: CleanupProtectionKind::SystemCritical,
            protection_reason:
                "System update assets should be managed by Software Update, not bulk-deleted",
        },
        ProtectedSystemDataSpec {
            id: "sys_mobile_backups",
            name: "iPhone & iPad Backups",
            path: paths.mobile_backups.clone(),
            reason: "Local iOS/iPadOS device backups",
            protection_kind: CleanupProtectionKind::UserData,
            protection_reason: "Device backups may be the only local restore point for a phone or tablet",
        },
        ProtectedSystemDataSpec {
            id: "sys_mail",
            name: "Mail Data",
            path: paths.mail.clone(),
            reason: "Mail downloads, envelopes, and local mailbox data",
            protection_kind: CleanupProtectionKind::UserData,
            protection_reason: "Mail data can contain downloaded messages and attachments",
        },
        ProtectedSystemDataSpec {
            id: "sys_messages",
            name: "Messages Data",
            path: paths.messages.clone(),
            reason: "Messages attachments, chat databases, and sync state",
            protection_kind: CleanupProtectionKind::UserData,
            protection_reason: "Messages data can contain chat history and attachments",
        },
        ProtectedSystemDataSpec {
            id: "sys_spotlight",
            name: "Spotlight Index",
            path: paths.spotlight.clone(),
            reason: "Search index maintained by Spotlight",
            protection_kind: CleanupProtectionKind::SystemCritical,
            protection_reason:
                "Spotlight indexes are system-maintained and should be rebuilt through system tooling",
        },
    ]
}

fn list_protected_system_data_items(paths: &StoragePaths) -> Vec<StorageItem> {
    let snapshot_info = local_snapshot_info();
    let mut items = Vec::new();
    if snapshot_info.count > 0 || snapshot_info.size_bytes > 0 {
        let reason = if snapshot_info.count > 0 {
            format!("{} local Time Machine snapshots", snapshot_info.count)
        } else {
            "Local Time Machine snapshots".to_string()
        };
        items.push(
            StorageItemSpec::new(
                "sys_local_snapshots",
                "Time Machine Local Snapshots",
                "system_data",
                RiskLevel::Medium,
                snapshot_info.size_bytes,
                "/",
                reason,
            )
            .build_protected(
                CleanupProtectionKind::SystemCritical,
                "Local snapshots are managed by Time Machine and APFS; they are purgeable but should not be bulk-deleted by Bench",
            ),
        );
    }

    let specs = protected_system_data_specs(paths);
    let lookup_paths: Vec<PathBuf> = specs.iter().map(|spec| spec.path.clone()).collect();
    let sizes = du_size_lookup(&lookup_paths);
    items.extend(specs.into_iter().filter_map(|spec| {
        let size = lookup_size(&sizes, &spec.path);
        if size == 0 {
            return None;
        }
        let path_str = spec.path.to_string_lossy().to_string();
        Some(
            StorageItemSpec::new(
                spec.id,
                spec.name,
                "system_data",
                RiskLevel::Medium,
                size,
                path_str,
                spec.reason,
            )
            .build_protected(spec.protection_kind, spec.protection_reason),
        )
    }));
    items
}

fn list_system_data_items(paths: &StoragePaths) -> Vec<StorageItem> {
    let cleanable_paths = paths.cleanable_system_data_paths();
    let developer_paths = developer_specific_paths(paths);
    let (_, caches_total) =
        total_with_overlaps_subtracted(std::slice::from_ref(&paths.lib_caches), &developer_paths);
    let cleanable_sizes = du_size_lookup(&cleanable_paths);
    let mut items = vec![
        StorageItemSpec::new(
            "sys_caches",
            "Library Caches",
            "system_data",
            RiskLevel::Safe,
            caches_total,
            paths.lib_caches.to_string_lossy().to_string(),
            "Application cache files excluding protected developer caches",
        )
        .with_command(format!(
            "clean children of {} except protected cache roots",
            shell_escape(paths.lib_caches.to_string_lossy().as_ref())
        ))
        .build(),
        StorageItemSpec::new(
            "sys_logs",
            "Library Logs",
            "system_data",
            RiskLevel::Safe,
            lookup_size(&cleanable_sizes, &paths.lib_logs),
            paths.lib_logs.to_string_lossy().to_string(),
            "System log files older than 30 days",
        )
        .with_command(format!(
            "find {} -type f -name '*.log' -mtime +30 -delete",
            shell_escape(paths.lib_logs.to_string_lossy().as_ref())
        ))
        .build(),
    ];

    let trash_size = lookup_size(&cleanable_sizes, &paths.trash);
    if trash_size > 0 {
        items.push(
            StorageItemSpec::new(
                "sys_trash",
                "Trash",
                "system_data",
                RiskLevel::Safe,
                trash_size,
                paths.trash.to_string_lossy().to_string(),
                "Files in Trash",
            )
            .with_command(format!(
                "rm -rf {}/*",
                shell_escape(paths.trash.to_string_lossy().as_ref())
            ))
            .build(),
        );
    }

    items.extend(list_protected_system_data_items(paths));
    items.sort_by_key(|item| Reverse(item.size_bytes));
    items
}

/// Build the macOS category from the APFS container-level remainder.
///
/// `disk_used` is the container-level used bytes from `df`. `known_total`
/// is the sum of all other categories' `total_bytes`. The macOS category
/// absorbs the remainder: `macos_total = disk_used - known_total`.
///
/// System Data owns VM, system logs, update staging, local snapshots and
/// other diagnostic/user-state contributors. Developer owns Homebrew and
/// package-manager caches. macOS therefore only explains the protected OS
/// footprint plus a bounded "Other macOS Files" remainder.
fn build_macos_category(paths: &StoragePaths, disk_used: u64, known_total: u64) -> StorageCategory {
    let macos_total = disk_used.saturating_sub(known_total);
    let library_overlap_paths = [paths.updates.clone()];
    let library_lookup_paths = [PathBuf::from("/Library"), paths.updates.clone()];
    let size_map = du_size_lookup(&[
        PathBuf::from("/System"),
        PathBuf::from("/Library"),
        paths.updates.clone(),
    ]);
    let mut remaining = macos_total;
    let system_size = take_bounded(lookup_size(&size_map, Path::new("/System")), &mut remaining);
    let library_raw = lookup_size(&size_map, Path::new("/Library"));
    let library_size = take_bounded(
        library_raw.saturating_sub(sum_paths_inside(
            &size_map,
            &library_overlap_paths,
            &library_lookup_paths[..1],
        )),
        &mut remaining,
    );
    let macos_other = remaining;

    StorageCategory {
        id: "macos".into(),
        name: "macOS".into(),
        color: "var(--chart-7)".into(),
        total_bytes: macos_total,
        items: vec![
            StorageItemSpec::new(
                "macos_system",
                "macOS System",
                "macos",
                RiskLevel::Safe,
                system_size,
                "/System",
                "macOS system files (read-only, not deletable)",
            )
            .build_protected(
                CleanupProtectionKind::ReadOnlySystem,
                "macOS system files are required for system stability",
            ),
            StorageItemSpec::new(
                "macos_library",
                "System Library",
                "macos",
                RiskLevel::Safe,
                library_size,
                "/Library",
                "System-level frameworks and libraries",
            )
            .build_protected(
                CleanupProtectionKind::SystemCritical,
                "System-level libraries and frameworks are required by installed apps and macOS",
            ),
            StorageItemSpec::new(
                "macos_other",
                "Other macOS Files",
                "macos",
                RiskLevel::Safe,
                macos_other,
                "/",
                "APFS metadata, preboot/recovery volumes, Unix binaries, and uncategorized protected OS files",
            )
            .build_protected(
                CleanupProtectionKind::SystemCritical,
                "This aggregate contains system-managed data and cannot be safely bulk-deleted",
            ),
        ],
    }
}

fn developer_cache_specs(home: &Path) -> [(&'static str, &'static str, PathBuf, &'static str); 5] {
    [
        (
            "dev_npm_cache",
            "npm Cache",
            home.join(".npm"),
            "Node package manager cache",
        ),
        (
            "dev_pnpm_store",
            "pnpm Store",
            home.join("Library/pnpm/store"),
            "pnpm content-addressable package store",
        ),
        (
            "dev_yarn_cache",
            "Yarn Cache",
            home.join("Library/Caches/Yarn"),
            "Yarn package cache",
        ),
        (
            "dev_cargo_registry",
            "Cargo Registry",
            home.join(".cargo/registry"),
            "Rust crate registry cache",
        ),
        (
            "dev_go_pkg_mod",
            "Go Module Cache",
            home.join("go/pkg/mod"),
            "Go module download cache",
        ),
    ]
}

fn list_developer_cache_items(home: &Path) -> Vec<StorageItem> {
    let specs = developer_cache_specs(home);
    let paths: Vec<PathBuf> = specs.iter().map(|(_, _, path, _)| path.clone()).collect();
    let sizes = du_size_lookup(&paths);

    specs
        .into_iter()
        .filter_map(|(id, name, path, reason)| {
            let size = lookup_size(&sizes, &path);
            if size == 0 {
                return None;
            }
            let path_str = path.to_string_lossy().to_string();
            Some(
                StorageItemSpec::new(
                    id,
                    name,
                    "developer",
                    RiskLevel::Medium,
                    size,
                    path_str,
                    reason,
                )
                .build_protected(
                    CleanupProtectionKind::AppState,
                    "Package-manager caches are shown for attribution; use the package manager's own prune command to avoid corrupting active tool state",
                ),
            )
        })
        .collect()
}

fn list_homebrew_items(paths: &StoragePaths) -> Vec<StorageItem> {
    let specs = [
        (
            "homebrew_as",
            "Homebrew (Apple Silicon)",
            paths.homebrew_as.clone(),
        ),
        (
            "homebrew_intel",
            "Homebrew (Intel)",
            paths.homebrew_intel.clone(),
        ),
    ];
    let lookup_paths: Vec<PathBuf> = specs.iter().map(|(_, _, path)| path.clone()).collect();
    let sizes = du_size_lookup(&lookup_paths);

    specs
        .into_iter()
        .filter_map(|(id, name, path)| {
            let size = lookup_size(&sizes, &path);
            if size == 0 {
                return None;
            }
            let path_str = path.to_string_lossy().to_string();
            Some(
                StorageItemSpec::new(
                    id,
                    name,
                    "developer",
                    RiskLevel::Medium,
                    size,
                    path_str,
                    "Homebrew packages and dependencies",
                )
                .build_protected(
                    CleanupProtectionKind::AppState,
                    "Homebrew packages can be dependencies for active developer tools and should be managed by Homebrew",
                ),
            )
        })
        .collect()
}

fn scan_overview_totals(paths: &StoragePaths) -> OverviewTotals {
    let ((disk_total, disk_used), size_map) = thread::scope(|s| {
        let t_disk = s.spawn(get_disk_info);
        let overview_paths = paths.overview_paths();
        let t_sizes = s.spawn(move || du_size_lookup(&overview_paths));
        (
            t_disk.join().unwrap_or((0, 0)),
            t_sizes.join().unwrap_or_default(),
        )
    });
    let system_paths = paths.system_data_paths();
    let app_data_paths = paths.app_data_paths();
    let developer_paths = developer_specific_paths(paths);
    let snapshots = local_snapshot_info();
    let system_data = system_data_total_from_lookup(
        &size_map,
        &system_paths,
        &developer_paths,
        snapshots.size_bytes,
    );
    let app_data =
        app_data_total_from_lookup(&size_map, &app_data_paths, &system_paths, &developer_paths);
    let developer = developer_total_from_lookup(&size_map, &developer_paths);

    OverviewTotals {
        disk_total,
        disk_used,
        apps: lookup_size(&size_map, &paths.apps),
        downloads: lookup_size(&size_map, &paths.downloads),
        documents: sum_path_sizes(&size_map, &paths.document_paths()),
        system_data,
        app_data,
        other_users: lookup_size(&size_map, &paths.shared),
        developer,
    }
}

/// Scan storage overview for macOS.
///
/// Returns 8 categories matching macOS System Settings storage view:
/// applications, downloads, documents, system_data, app_data, other_users, macos, developer.
///
/// All `du` calls run in parallel via `std::thread::scope`.
pub fn scan_overview() -> AppResult<StorageOverview> {
    let home = home_dir();
    let paths = StoragePaths::new(&home);
    // One batched `du` process is measurably cheaper and more consistent than
    // spawning a process per category path. Disk capacity is independent and
    // remains instant, so it still runs in parallel.
    let totals = scan_overview_totals(&paths);
    Ok(build_overview(totals))
}

/// Hybrid streaming scan: emit a fast overview immediately, then refine it.
///
/// Event flow:
/// 1. `clean-space:scan-start`    → `{ disk_total_bytes, disk_used_bytes }`
/// 2. `clean-space:scan-category` → cached/estimated categories for instant UI
/// 3. Background exact `du` scan emits replacement categories by id
/// 4. `clean-space:scan-complete` → exact refresh finished
///
/// macOS System Settings can feel instant because it relies on system-maintained
/// metadata and private caches. Bench keeps to public filesystem APIs: use APFS
/// capacity data and Bench's own last exact overview for the first paint, then
/// refresh with an exact same-filesystem `du -skx` pass in the background.
pub fn scan_overview_stream(app: AppHandle) -> AppResult<()> {
    let (disk_total, disk_used) = get_disk_info();
    let _ = app.emit(
        EVENT_SCAN_START,
        ScanStartPayload {
            disk_total_bytes: disk_total,
            disk_used_bytes: disk_used,
        },
    );

    let initial = load_cached_overview(disk_total, disk_used)
        .unwrap_or_else(|| fast_overview(disk_total, disk_used));
    emit_overview(&app, &initial);

    let app_for_refresh = app.clone();
    thread::spawn(move || match scan_overview() {
        Ok(overview) => {
            write_cached_overview(&overview, disk_used);
            emit_overview(&app_for_refresh, &overview);
            let _ = app_for_refresh.emit(EVENT_SCAN_COMPLETE, ());
        }
        Err(err) => {
            eprintln!("[clean-space] background overview refresh failed: {}", err);
            let _ = app_for_refresh.emit(EVENT_SCAN_COMPLETE, ());
        }
    });
    Ok(())
}

/// Get items for a specific category.
///
/// Only scans the requested category, not the whole disk. This is much
/// faster than a full overview scan, especially for categories like
/// Applications or App Data that involve traversing many files.
pub fn get_category_items(category_id: &str) -> AppResult<Vec<StorageItem>> {
    let home = home_dir();
    let home_str = home.to_string_lossy().to_string();

    let items = match category_id {
        "applications" => list_app_items(),
        "downloads" => {
            let downloads_path = format!("{}/Downloads", home_str);
            list_downloads_items(&downloads_path)
        }
        "documents" => {
            let docs_path = format!("{}/Documents", home_str);
            list_documents_items(&docs_path, &home_str)
        }
        "system_data" => {
            let paths = StoragePaths::new(&home);
            list_system_data_items(&paths)
        }
        "app_data" => {
            let paths = StoragePaths::new(&home);
            list_app_data_items(&paths)
        }
        "other_users" => {
            let shared_path = "/Users/Shared".to_string();
            let shared_size = du_size_bytes(&shared_path);
            vec![
                StorageItemSpec::new(
                    "shared_folder",
                    "Shared Folder",
                    "other_users",
                    RiskLevel::Low,
                    shared_size,
                    shared_path.as_str(),
                    "Shared user data",
                )
                .build_protected(
                    CleanupProtectionKind::CrossUserData,
                    "Shared and other-user data may belong to another account and cannot be batch-cleaned",
                ),
            ]
        }
        "macos" => {
            let paths = StoragePaths::new(&home);
            let (disk_total, disk_used) = get_disk_info();
            let known_bytes = cached_known_non_macos_bytes(disk_total, disk_used)
                .unwrap_or_else(|| scan_overview_totals(&paths).known_bytes());
            build_macos_category(&paths, disk_used, known_bytes).items
        }
        "developer" => {
            let xcode_derived = format!("{}/Library/Developer/Xcode/DerivedData", home_str);
            let xcode_archives = format!("{}/Library/Developer/Xcode/Archives", home_str);
            let docker_path = format!("{}/Library/Containers/com.docker.docker", home_str);
            let xd_size = du_size_bytes(&xcode_derived);
            let xa_size = du_size_bytes(&xcode_archives);
            let docker_size = du_size_bytes(&docker_path);
            let mut items = vec![
                StorageItemSpec::new(
                    "xcode_derived",
                    "Xcode DerivedData",
                    "developer",
                    RiskLevel::Medium,
                    xd_size,
                    xcode_derived.as_str(),
                    "Xcode build artifacts",
                )
                .with_command(format!("rm -rf {}/*", shell_escape(&xcode_derived)))
                .build(),
                StorageItemSpec::new(
                    "xcode_archives",
                    "Xcode Archives",
                    "developer",
                    RiskLevel::Medium,
                    xa_size,
                    xcode_archives.as_str(),
                    "Xcode archive files",
                )
                .build_protected(
                    CleanupProtectionKind::UserData,
                    "Xcode archives can be needed for distribution, crash symbolication, or release history",
                ),
                StorageItemSpec::new(
                    "docker_data",
                    "Docker Data",
                    "developer",
                    RiskLevel::High,
                    docker_size,
                    docker_path.as_str(),
                    "Docker images, containers and volumes",
                )
                .with_command("docker system prune -af")
                .build(),
            ];
            items.extend(list_developer_cache_items(&home));
            let paths = StoragePaths::new(&home);
            items.extend(list_homebrew_items(&paths));
            items.sort_by_key(|item| Reverse(item.size_bytes));
            items
        }
        _ => vec![],
    };

    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn totals(disk_used: u64) -> OverviewTotals {
        OverviewTotals {
            disk_total: 1_000,
            disk_used,
            apps: 100,
            downloads: 20,
            documents: 30,
            system_data: 40,
            app_data: 50,
            other_users: 10,
            developer: 25,
        }
    }

    #[test]
    fn overview_builder_uses_one_stable_category_order() {
        let overview = build_overview(totals(500));
        let ids = overview
            .categories
            .iter()
            .map(|category| category.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            ids,
            vec![
                "applications",
                "downloads",
                "documents",
                "system_data",
                "app_data",
                "other_users",
                "macos",
                "developer",
            ]
        );
        assert_eq!(overview.categories[6].total_bytes, 225);
    }

    #[test]
    fn macos_remainder_saturates_when_known_categories_exceed_disk_usage() {
        let overview = build_overview(totals(100));
        let macos = overview
            .categories
            .iter()
            .find(|category| category.id == "macos")
            .expect("macOS category");
        assert_eq!(macos.total_bytes, 0);
    }

    #[test]
    fn fast_overview_uses_the_same_category_builder() {
        let overview = fast_overview(1_000, 400);
        assert_eq!(overview.categories.len(), 8);
        assert_eq!(overview.categories[6].id, "macos");
        assert_eq!(overview.categories[6].total_bytes, 400);
    }
}
