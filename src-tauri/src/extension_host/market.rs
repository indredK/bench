//! Market 端到端闭环（P4，spec §6）：目录拉取 → 安装管线 → 诊断。
//!
//! **信任边界（D-007）**：renderer 只提交 `extension_id` + `version`；
//! 下载 URL / hash / 签名材料全部由宿主从自身拉取的 registry 解析。
//!
//! 安装管线（spec §6.1 步骤；验证失败清理临时产物，已安装版本保持不变）：
//! 1. 拉 registry（canonical 基址，env 配置）
//! 2. 解析条目（拒绝 `yanked`）
//! 3. 下载 zip 到缓存目录（体积上限 + content-length 预检）
//! 4. 校验整包 `sha256` + `size`
//! 5. 安全解压到临时目录（P3.3 extraction，路径穿越/zip bomb/symlink 防御）
//! 6. manifest v2 校验 + `id`/`version` 与请求绑定
//! 7. engines 兼容
//! 8. market 签名（canonical 文本 + trusted comment）
//! 9. 逐文件完整性（P3.1）
//! 10. 版本单调性（`new < installed` 拒绝；同版本重装允许）
//! 11. 可回滚替换 → 审计 `install`

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

use serde::Serialize;
use sha2::Digest;
use tauri::{AppHandle, Manager, Runtime};

use crate::error::{AppError, AppResult};

use super::{
    audit::{self, AuditEvent},
    commands::{close_extension_window, ext_list_installed, ExtensionSummary},
    extraction::{self, ExtractLimits},
    integrity,
    manifest::{ExtensionDistribution, ExtensionManifest, EXT_DISABLED_MARKER, MANIFEST_FILE},
    records,
    registry::{self, RegistryDoc, RegistryEntry, RegistryVersion},
    signature,
};

/// 整包下载上限（与解压总体积上限一致；registry 声明的 size 另行精确校验）。
const MAX_DOWNLOAD_BYTES: u64 = 256 * 1024 * 1024;
const MAX_REGISTRY_BYTES: usize = 4 * 1024 * 1024;

/// 下载缓存目录名（`$APPDATA/extension-cache`）。
const CACHE_DIR_NAME: &str = "extension-cache";
const MAX_HTTP_REDIRECTS: usize = 10;

static ACTIVE_MARKET_OPERATIONS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static PENDING_MARKET_PREVIEW: OnceLock<Mutex<Option<PendingMarketPreview>>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq)]
enum MarketPreviewPhase {
    Preparing,
    Ready,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PendingMarketPreview {
    extension_id: String,
    version: String,
    phase: MarketPreviewPhase,
}

fn pending_market_preview() -> &'static Mutex<Option<PendingMarketPreview>> {
    PENDING_MARKET_PREVIEW.get_or_init(|| Mutex::new(None))
}

/// The market UI has one trust dialog, so the backend permits only one active preview.
#[derive(Debug)]
struct MarketPreviewReservation {
    extension_id: String,
    version: String,
    ready: bool,
}

impl MarketPreviewReservation {
    fn acquire(extension_id: &str, version: &str) -> AppResult<Self> {
        let mut pending = pending_market_preview()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if pending.is_some() {
            return Err(super::commands::extension_transition_busy());
        }
        *pending = Some(PendingMarketPreview {
            extension_id: extension_id.to_owned(),
            version: version.to_owned(),
            phase: MarketPreviewPhase::Preparing,
        });
        Ok(Self {
            extension_id: extension_id.to_owned(),
            version: version.to_owned(),
            ready: false,
        })
    }

    fn mark_ready(&mut self) -> AppResult<()> {
        let mut pending = pending_market_preview()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match pending.as_mut() {
            Some(preview)
                if preview.extension_id == self.extension_id
                    && preview.version == self.version
                    && preview.phase == MarketPreviewPhase::Preparing =>
            {
                preview.phase = MarketPreviewPhase::Ready;
                self.ready = true;
                Ok(())
            }
            _ => Err(super::commands::extension_transition_busy()),
        }
    }
}

impl Drop for MarketPreviewReservation {
    fn drop(&mut self) {
        if self.ready {
            return;
        }
        let mut pending = pending_market_preview()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if pending.as_ref().is_some_and(|preview| {
            preview.extension_id == self.extension_id
                && preview.version == self.version
                && preview.phase == MarketPreviewPhase::Preparing
        }) {
            *pending = None;
        }
    }
}

fn require_pending_market_preview(extension_id: &str, version: &str) -> AppResult<()> {
    let pending = pending_market_preview()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    match pending.as_ref() {
        Some(preview)
            if preview.extension_id == extension_id
                && preview.version == version
                && preview.phase == MarketPreviewPhase::Ready =>
        {
            Ok(())
        }
        _ => Err(AppError::new(
            "EXTENSION_PREVIEW_EXPIRED",
            "install preview is no longer available — prepare again",
        )),
    }
}

fn clear_pending_market_preview(extension_id: &str, version: &str) {
    let mut pending = pending_market_preview()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if pending
        .as_ref()
        .is_some_and(|preview| preview.extension_id == extension_id && preview.version == version)
    {
        *pending = None;
    }
}

fn remove_preview_dir_if_exists(path: &Path) -> AppResult<()> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(AppError::io(format!(
            "remove install preview {}: {error}",
            path.display()
        ))),
    }
}

fn market_http_client(timeout: std::time::Duration) -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if can_follow_market_redirect(attempt.previous().len(), attempt.url().as_str()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|error| AppError::internal(format!("build market http client: {error}")))
}

fn can_follow_market_redirect(previous_redirects: usize, url: &str) -> bool {
    previous_redirects < MAX_HTTP_REDIRECTS && registry::validate_download_url(url).is_ok()
}

fn active_market_operations() -> &'static Mutex<HashSet<String>> {
    ACTIVE_MARKET_OPERATIONS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Serialize prepare and commit for one extension because they share its preview directory.
#[derive(Debug)]
struct MarketOperationGuard(String);

impl MarketOperationGuard {
    fn acquire(extension_id: &str) -> AppResult<Self> {
        let mut active = active_market_operations()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !active.insert(extension_id.to_owned()) {
            return Err(super::commands::extension_transition_busy());
        }
        Ok(Self(extension_id.to_owned()))
    }
}

impl Drop for MarketOperationGuard {
    fn drop(&mut self) {
        active_market_operations()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&self.0);
    }
}

/// market 列表（返回给插件中心；**不含下载 URL** —— renderer 不得提交地址）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketListing {
    pub updated_at: Option<String>,
    pub extensions: Vec<MarketExtensionDto>,
    /// 本次拉取时命中吊销并已强制禁用的已装插件（UI 显著警示）。
    pub revoked_hits: Vec<RevokedHitDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketExtensionDto {
    pub id: String,
    pub display_en: String,
    pub display_zh: Option<String>,
    pub description_en: Option<String>,
    pub description_zh: Option<String>,
    pub publisher_name: Option<String>,
    pub versions: Vec<MarketVersionDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketVersionDto {
    pub version: String,
    pub engines_bench: String,
    pub size: u64,
    pub published_at: Option<String>,
    pub yanked: bool,
    /// 宿主版本是否满足 engines（不满足禁止安装）。
    pub compatible: bool,
    /// 已安装（版本完全一致）。
    pub installed: bool,
    /// 已装版本低于该版本（可升级）。
    pub update_available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevokedHitDto {
    pub id: String,
    pub version: String,
    pub reason: String,
}

/// 拉取 registry 目录（async 命令；reqwest rustls）。
async fn fetch_registry() -> AppResult<RegistryDoc> {
    let base = registry::registry_base_url()?;
    let url = registry::registry_index_url(&base);
    let client = market_http_client(std::time::Duration::from_secs(30))?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::internal(format!("fetch registry {url}: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::internal(format!(
            "fetch registry {url}: HTTP {}",
            response.status()
        )));
    }
    let body = read_registry_body(response).await?;
    let doc: RegistryDoc = serde_json::from_slice(&body)
        .map_err(|e| AppError::invalid_input(format!("registry JSON invalid: {e}")))?;
    registry::validate_registry_doc(&doc)?;
    Ok(doc)
}

async fn read_registry_body(mut response: reqwest::Response) -> AppResult<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_REGISTRY_BYTES as u64)
    {
        return Err(registry_body_too_large());
    }

    let capacity = response
        .content_length()
        .unwrap_or_default()
        .min(MAX_REGISTRY_BYTES as u64) as usize;
    let mut body = Vec::with_capacity(capacity);
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| AppError::internal(format!("read registry body: {error}")))?
    {
        append_registry_chunk(&mut body, &chunk)?;
    }
    Ok(body)
}

fn append_registry_chunk(body: &mut Vec<u8>, chunk: &[u8]) -> AppResult<()> {
    if body
        .len()
        .checked_add(chunk.len())
        .is_none_or(|length| length > MAX_REGISTRY_BYTES)
    {
        return Err(registry_body_too_large());
    }
    body.extend_from_slice(chunk);
    Ok(())
}

fn registry_body_too_large() -> AppError {
    AppError::new(
        "EXTENSION_REGISTRY_TOO_LARGE",
        format!("registry response exceeds {MAX_REGISTRY_BYTES} bytes"),
    )
}

/// 浏览 market：拉目录 + 吊销强制禁用 + 与已装版本比对。
#[tauri::command]
pub async fn ext_market_list(app: AppHandle) -> AppResult<MarketListing> {
    let doc = fetch_registry().await?;

    // 吊销通道（spec §5.3）：强制禁用 + 警示信息回传。
    let installed = ext_list_installed(app.clone()).unwrap_or_default();
    let mut revoked_hits = Vec::new();
    for summary in &installed {
        if let Some(reason) = registry::revoke_hit(&doc, &summary.id, &summary.version) {
            if let Some(dir) = installed_extension_dir(&app, &summary.id) {
                if fs::write(dir.join(EXT_DISABLED_MARKER), "").is_ok() && summary.enabled {
                    audit::record(
                        &app,
                        AuditEvent::RevokeHit,
                        &summary.id,
                        Some(&summary.version),
                        Some(&reason),
                    );
                }
            }
            revoked_hits.push(RevokedHitDto {
                id: summary.id.clone(),
                version: summary.version.clone(),
                reason,
            });
        }
    }
    // 吊销后重读安装状态（禁用状态可能已变化）。
    let installed = ext_list_installed(app.clone()).unwrap_or_default();
    let installed_by_id: std::collections::BTreeMap<String, &ExtensionSummary> =
        installed.iter().map(|s| (s.id.clone(), s)).collect();
    let host_version = app.package_info().version.to_string();

    let mut extensions = Vec::new();
    for entry in &doc.extensions {
        let installed_version = installed_by_id.get(&entry.id).map(|s| s.version.clone());
        let versions = entry
            .versions
            .iter()
            .map(|version| {
                let manifest_like = ManifestEnginesProbe {
                    bench: version.engines.bench.clone(),
                };
                let compatible = manifest_like.satisfies(&host_version);
                let installed = installed_version
                    .as_deref()
                    .is_some_and(|v| v == version.version);
                let update_available = installed_version.as_deref().is_some_and(|v| {
                    super::manifest::semver_at_least(&version.version, v) && v != version.version
                });
                MarketVersionDto {
                    version: version.version.clone(),
                    engines_bench: version.engines.bench.clone(),
                    size: version.size,
                    published_at: version.published_at.clone(),
                    yanked: version.yanked,
                    compatible,
                    installed,
                    update_available,
                }
            })
            .collect();
        extensions.push(MarketExtensionDto {
            id: entry.id.clone(),
            display_en: entry.display.en.clone(),
            display_zh: entry.display.zh.clone(),
            description_en: entry.description.as_ref().map(|d| d.en.clone()),
            description_zh: entry.description.as_ref().and_then(|d| d.zh.clone()),
            publisher_name: entry.publisher.as_ref().map(|p| p.name.clone()),
            versions,
        });
    }

    Ok(MarketListing {
        updated_at: doc.updated_at.clone(),
        extensions,
        revoked_hits,
    })
}

/// engines 探针（复用 manifest 的 satisfies_engines 逻辑而不构造完整 manifest）。
struct ManifestEnginesProbe {
    bench: String,
}

impl ManifestEnginesProbe {
    fn satisfies(&self, host_version: &str) -> bool {
        let constraint = self.bench.trim();
        if constraint == "*" || constraint.is_empty() {
            return true;
        }
        match constraint.strip_prefix(">=") {
            Some(minimum) => {
                super::manifest::is_valid_semver(minimum)
                    && super::manifest::semver_at_least(host_version, minimum)
            }
            None => false,
        }
    }
}

/// `$APPDATA/extensions/<id>`（id 已校验）。
fn installed_extension_dir<R: Runtime>(app: &AppHandle<R>, extension_id: &str) -> Option<PathBuf> {
    if !super::manifest::is_valid_extension_id(extension_id) {
        return None;
    }
    let root = app.path().app_data_dir().ok()?;
    Some(root.join(super::assets::EXT_DIR_NAME).join(extension_id))
}

/// 下载缓存目录（`$APPDATA/extension-cache`）。
fn cache_dir<R: Runtime>(app: &AppHandle<R>) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("resolve app data dir failed: {e}")))?;
    let dir = dir.join(CACHE_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|e| AppError::io(format!("create cache dir: {e}")))?;
    Ok(dir)
}

/// market 安装预览（返回给确认弹窗；A4-1 信任披露数据源）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketInstallPreview {
    pub id: String,
    pub version: String,
    pub display_en: String,
    pub display_zh: Option<String>,
    pub publisher_name: Option<String>,
    pub size_bytes: u64,
    /// 产物 manifest 申请的宿主命令（ACL 披露）。
    pub acl_commands: Vec<String>,
}

/// 预览目录：`$APPDATA/extension-cache/preview/<id>-<version>/`。
fn preview_dir<R: Runtime>(
    app: &AppHandle<R>,
    extension_id: &str,
    version: &str,
) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("resolve app data dir failed: {e}")))?;
    let dir = dir
        .join(CACHE_DIR_NAME)
        .join("preview")
        .join(format!("{extension_id}-{version}"));
    Ok(dir)
}

/// 安装第一步（spec §6.1 步骤 1-9）：下载 → 校验 → 解压到预览目录，
/// 返回 ACL 披露信息；**不落位、不改水位** —— 用户确认后调
/// [`ext_market_commit`]。准备失败即清理预览目录；准备成功后只允许当前信任预览提交或取消。
#[tauri::command]
pub async fn ext_market_prepare(
    app: AppHandle,
    extension_id: String,
    version: String,
) -> AppResult<MarketInstallPreview> {
    if !super::manifest::is_valid_extension_id(&extension_id) {
        return Err(AppError::invalid_input(format!(
            "invalid extension id `{extension_id}`"
        )));
    }
    if !super::manifest::is_valid_semver(&version) {
        return Err(AppError::invalid_input(format!(
            "invalid extension version `{version}`"
        )));
    }
    let mut preview_reservation = MarketPreviewReservation::acquire(&extension_id, &version)?;
    let _operation = MarketOperationGuard::acquire(&extension_id)?;
    // 步骤 1-2：拉目录并解析条目（yanked 拒绝）。
    let doc = fetch_registry().await?;
    let entry: &RegistryEntry = doc
        .extensions
        .iter()
        .find(|e| e.id == extension_id)
        .ok_or_else(|| {
            AppError::not_found(format!("extension `{extension_id}` not found in registry"))
        })?;
    let version_entry: &RegistryVersion = entry
        .versions
        .iter()
        .find(|v| v.version == version)
        .ok_or_else(|| {
            AppError::not_found(format!(
                "extension `{extension_id}` version `{version}` not found in registry"
            ))
        })?;
    if version_entry.yanked {
        return Err(AppError::invalid_input(format!(
            "extension `{extension_id}` version `{version}` has been yanked"
        )));
    }
    // 吊销通道（spec §5.3）必须在安装入口也生效：列表路径只做「已装插件强制禁用 +
    // 警示」，prepare 不看 revoke 的话，红色吊销说明旁边那颗按钮照样能把产物装进来。
    if let Some(reason) = registry::revoke_hit(&doc, &extension_id, &version) {
        return Err(AppError::new(
            "EXTENSION_REVOKED",
            format!("extension `{extension_id}` version `{version}` has been revoked: {reason}"),
        ));
    }
    if registry::validate_download_url(&version_entry.download_url).is_err() {
        return Err(AppError::forbidden_path(format!(
            "registry download url rejected: {}",
            version_entry.download_url
        )));
    }
    // registry 声明的 engines 预检（与产物 manifest 双重校验）。
    let host_version = app.package_info().version.to_string();
    let probe = ManifestEnginesProbe {
        bench: version_entry.engines.bench.clone(),
    };
    if !probe.satisfies(&host_version) {
        return Err(AppError::unsupported(format!(
            "extension `{extension_id}` requires bench {}, current host is {host_version}",
            version_entry.engines.bench
        )));
    }

    let staging_dir = preview_dir(&app, &extension_id, &version)?;
    remove_preview_dir_if_exists(&staging_dir)?;
    fs::create_dir_all(&staging_dir)
        .map_err(|e| AppError::io(format!("create preview dir: {e}")))?;
    let zip_path = cache_dir(&app)?.join(format!("{extension_id}-{version}.zip"));

    // 管线主体；任一步失败 → 清理 staging + 临时 zip（prepare 无审计事件）。
    let prepared = async {
        // 步骤 3：下载（content-length 预检 + 流式上限）。
        let client = market_http_client(std::time::Duration::from_secs(300))?;
        let mut response = client
            .get(&version_entry.download_url)
            .send()
            .await
            .map_err(|e| {
                AppError::internal(format!("download {}: {e}", version_entry.download_url))
            })?;
        if !response.status().is_success() {
            return Err(AppError::internal(format!(
                "download {}: HTTP {}",
                version_entry.download_url,
                response.status()
            )));
        }
        if let Some(length) = response.content_length() {
            if length > MAX_DOWNLOAD_BYTES {
                return Err(AppError::forbidden_path(format!(
                    "download exceeds size limit (content-length {length})"
                )));
            }
        }
        let mut downloaded: u64 = 0;
        let mut zip_file = fs::File::create(&zip_path)
            .map_err(|e| AppError::io(format!("create temp zip: {e}")))?;
        use std::io::Write as _;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| AppError::internal(format!("read download chunk: {e}")))?
        {
            downloaded += chunk.len() as u64;
            if downloaded > MAX_DOWNLOAD_BYTES {
                return Err(AppError::forbidden_path(
                    "download exceeds size limit (possible malicious archive)",
                ));
            }
            zip_file
                .write_all(&chunk)
                .map_err(|e| AppError::io(format!("write temp zip: {e}")))?;
        }
        drop(zip_file);

        // 步骤 4-9：整包校验 → 解压 → manifest/签名/完整性（可测核心）。
        let official_source = registry::is_official_registry(&registry::registry_base_url()?);
        let manifest = verify_staged_package(
            &zip_path,
            &staging_dir,
            &extension_id,
            &version,
            version_entry,
            &host_version,
            None,
            official_source,
        )?;
        Ok(manifest)
    }
    .await;

    // 收尾：zip 总是可删；prepare 失败时预览目录一并清理。
    let _ = fs::remove_file(&zip_path);
    match prepared {
        Ok(manifest) => {
            if let Err(error) = preview_reservation.mark_ready() {
                let _ = fs::remove_dir_all(&staging_dir);
                return Err(error);
            }
            Ok(MarketInstallPreview {
                id: manifest.id.clone(),
                version: manifest.version.clone(),
                display_en: manifest.display_name("en").to_string(),
                display_zh: manifest.display.zh.clone(),
                publisher_name: entry.publisher.as_ref().map(|p| p.name.clone()),
                size_bytes: version_entry.size,
                acl_commands: manifest.acl.commands.clone(),
            })
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&staging_dir);
            audit::record(
                &app,
                AuditEvent::VerifyFail,
                &extension_id,
                Some(&version),
                Some(&error.message),
            );
            Err(error)
        }
    }
}

/// 取消信任披露并清理暂存包；幂等支持响应丢失后的重试。
#[tauri::command]
pub async fn ext_market_cancel(
    app: AppHandle,
    extension_id: String,
    version: String,
) -> AppResult<()> {
    if !super::manifest::is_valid_extension_id(&extension_id) {
        return Err(AppError::invalid_input(format!(
            "invalid extension id `{extension_id}`"
        )));
    }
    if !super::manifest::is_valid_semver(&version) {
        return Err(AppError::invalid_input(format!(
            "invalid extension version `{version}`"
        )));
    }
    let _operation = MarketOperationGuard::acquire(&extension_id)?;
    {
        let pending = pending_market_preview()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match pending.as_ref() {
            Some(preview)
                if preview.extension_id == extension_id
                    && preview.version == version
                    && preview.phase == MarketPreviewPhase::Ready => {}
            Some(_) => return Err(super::commands::extension_transition_busy()),
            None => {}
        }
    }
    remove_preview_dir_if_exists(&preview_dir(&app, &extension_id, &version)?)?;
    clear_pending_market_preview(&extension_id, &version);
    Ok(())
}

/// 安装第二步（spec §6.1 步骤 10-11，用户在信任弹窗确认后调用）：
/// 重新校验预览产物 → 版本单调性 → 可回滚替换 → 审计 install。
#[tauri::command]
pub async fn ext_market_commit(
    app: AppHandle,
    extension_id: String,
    version: String,
) -> AppResult<()> {
    if !super::manifest::is_valid_extension_id(&extension_id) {
        return Err(AppError::invalid_input(format!(
            "invalid extension id `{extension_id}`"
        )));
    }
    if !super::manifest::is_valid_semver(&version) {
        return Err(AppError::invalid_input(format!(
            "invalid extension version `{version}`"
        )));
    }
    let _operation = MarketOperationGuard::acquire(&extension_id)?;
    let acl_state = app.state::<super::acl::ExtensionAclState>();
    let _transition = acl_state
        .begin_transition(&extension_id)
        .ok_or_else(super::commands::extension_transition_busy)?;
    require_pending_market_preview(&extension_id, &version)?;
    let staging_dir = preview_dir(&app, &extension_id, &version)?;
    let result = async {
        let manifest_path = staging_dir.join(MANIFEST_FILE);
        if !manifest_path.is_file() {
            return Err(AppError::new(
                "EXTENSION_PREVIEW_EXPIRED",
                "install preview expired — prepare again",
            ));
        }
        let manifest_text = fs::read_to_string(&manifest_path)
            .map_err(|e| AppError::invalid_input(format!("read staged manifest: {e}")))?;
        let manifest = ExtensionManifest::parse(&manifest_text)?;
        validate_market_extension_acl(&manifest)?;
        if manifest.id != extension_id || manifest.version != version {
            return Err(AppError::forbidden_path(
                "staged manifest does not match the requested install",
            ));
        }
        manifest.ensure_supported_host()?;
        let host_version = app.package_info().version.to_string();
        if !manifest.satisfies_engines(&host_version) {
            return Err(AppError::unsupported(format!(
                "extension `{}` requires bench {}, current host is {host_version}",
                manifest.id, manifest.engines.bench
            )));
        }
        integrity::verify_bundle_integrity(&staging_dir, &manifest)?;
        records::check_version_monotonic(&app, &manifest.id, &manifest.version)?;

        let installed_dir = installed_extension_dir(&app, &extension_id).ok_or_else(|| {
            AppError::invalid_input(format!("invalid extension id `{extension_id}`"))
        })?;
        let extensions_root = installed_dir
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| AppError::internal("resolve extensions root failed"))?;
        let final_dir = extensions_root.join(&extension_id);
        close_extension_window(&app, &extension_id).await?;
        extraction::promote_staged_bundle_and_commit(&staging_dir, &final_dir, || {
            records::record_verified_version(&app, &manifest.id, &manifest.version)
        })?;
        audit::record(
            &app,
            AuditEvent::Install,
            &manifest.id,
            Some(&manifest.version),
            Some("market"),
        );
        Ok(())
    }
    .await;

    if let Err(error) = result {
        // 可重试错误保留已披露的同一份包；若事务已消费暂存目录，则使 UI 重新 prepare。
        if error.code == "EXTENSION_PREVIEW_EXPIRED" || !staging_dir.is_dir() {
            clear_pending_market_preview(&extension_id, &version);
            let _ = remove_preview_dir_if_exists(&staging_dir);
            audit::record(
                &app,
                AuditEvent::VerifyFail,
                &extension_id,
                Some(&version),
                Some(&error.message),
            );
            return Err(error);
        }
        audit::record(
            &app,
            AuditEvent::VerifyFail,
            &extension_id,
            Some(&version),
            Some(&error.message),
        );
        return Err(error);
    }
    clear_pending_market_preview(&extension_id, &version);
    Ok(())
}

/// 诊断数据（插件中心诊断面板用）：审计日志 + 插件运行时诊断的最近条目。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionDiagnostics {
    pub audit: Vec<String>,
    pub runtime: Vec<String>,
}

/// 读取插件子系统诊断（宿主窗口专用；未加入 ext 网关白名单）。
#[tauri::command]
pub fn ext_diagnostics(app: AppHandle) -> AppResult<ExtensionDiagnostics> {
    let audit_lines = audit::read_recent(&app, 200)?;
    let runtime_path = app
        .path()
        .app_data_dir()
        .map(|dir| dir.join(super::commands::POC_RESULT_FILE))
        .map_err(|e| AppError::internal(format!("resolve app data dir failed: {e}")))?;
    let runtime = match fs::read_to_string(&runtime_path) {
        Ok(text) => {
            let lines: Vec<String> = text.lines().map(str::to_string).collect();
            let start = lines.len().saturating_sub(200);
            lines[start..].to_vec()
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(e) => return Err(AppError::io(format!("read diagnostics: {e}"))),
    };
    Ok(ExtensionDiagnostics {
        audit: audit_lines,
        runtime,
    })
}

/// 安装管线核心（步骤 4-9，纯文件系统 + 密码学，无 AppHandle —— 便于单测）：
///
/// 4. 整包 sha256 + size 与 registry 声明比对；
/// 5. 安全解压到 `staging_dir`（必须为空或不存在）；
/// 6. manifest v2 校验 + `id`/`version` 与请求绑定 + distribution=market；
/// 7. engines 兼容；
/// 8. market 签名（canonical 文本 + trusted comment）；
/// 9. 逐文件完整性。
///
/// 返回解析后的 manifest（供调用方做水位记录）。
#[allow(clippy::too_many_arguments)] // 校验管线参数均为必要上下文（registry 绑定 + 环境覆盖）
fn verify_staged_package(
    zip_path: &Path,
    staging_dir: &Path,
    extension_id: &str,
    version: &str,
    version_entry: &RegistryVersion,
    host_version: &str,
    pubkey_override: Option<&str>,
    official_source: bool,
) -> AppResult<ExtensionManifest> {
    // 步骤 4：整包 sha256 + size。
    let (hash, size) = sha256_and_size(zip_path)?;
    if size != version_entry.size {
        return Err(AppError::new(
            "EXTENSION_INTEGRITY_FAILED",
            format!(
                "downloaded package size mismatch (registry {}, got {size})",
                version_entry.size
            ),
        ));
    }
    if hash != version_entry.sha256 {
        return Err(AppError::new(
            "EXTENSION_INTEGRITY_FAILED",
            "downloaded package sha256 mismatch (corrupted or tampered)",
        ));
    }

    // 步骤 5：安全解压到 staging（目标必须为空 —— staging 全新创建）。
    extraction::extract_extension_zip(zip_path, staging_dir, &ExtractLimits::default())?;

    // 步骤 6：manifest v2 校验 + 与请求绑定。
    let manifest_text = fs::read_to_string(staging_dir.join(MANIFEST_FILE))
        .map_err(|e| AppError::invalid_input(format!("read staged manifest: {e}")))?;
    let manifest = ExtensionManifest::parse(&manifest_text)?;
    if manifest.id != extension_id {
        return Err(AppError::forbidden_path(format!(
            "staged manifest id `{}` does not match requested `{extension_id}`",
            manifest.id
        )));
    }
    if manifest.version != version {
        return Err(AppError::forbidden_path(format!(
            "staged manifest version `{}` does not match requested `{version}`",
            manifest.version
        )));
    }
    // registry 分发的产物必须是 market 形态（bundled 由应用包内分发）。
    if manifest.distribution != ExtensionDistribution::Market {
        return Err(AppError::forbidden_path(
            "registry package manifest must declare distribution `market`",
        ));
    }
    validate_market_extension_acl(&manifest)?;
    manifest.ensure_supported_host()?;

    // 步骤 7：engines。
    if !manifest.satisfies_engines(host_version) {
        return Err(AppError::unsupported(format!(
            "extension `{}` requires bench {}, current host is {host_version}",
            manifest.id, manifest.engines.bench
        )));
    }

    // 步骤 8：签名（canonical 文本 + trusted comment）。
    let canonical = signature::canonical_manifest_text(&manifest_text)?;
    match pubkey_override {
        // 测试 / selfhost 注入公钥路径。
        Some(pubkey) => {
            signature::verify_signature_with(&manifest, &canonical, Some(pubkey), false)?
        }
        // 官方默认源（P5）：registry.json 由官方 org 托管（https + sha256 + files
        // 清单双通道完整性），官方条目免 minisign；第三方 registry 一律强制验签。
        None if official_source => {}
        None => signature::verify_distribution_signature(&manifest, &canonical)?,
    }

    // 步骤 9：逐文件完整性。
    integrity::verify_bundle_integrity(staging_dir, &manifest)?;
    Ok(manifest)
}

/// New market packages may request only extension capabilities. Host lifecycle IPC remains
/// parseable for legacy installed manifests so users can still inspect and remove them.
fn validate_market_extension_acl(manifest: &ExtensionManifest) -> AppResult<()> {
    if let Some(command) = manifest
        .acl
        .commands
        .iter()
        .find(|command| !super::acl::is_command_allowed(command))
    {
        return Err(AppError::forbidden_path(format!(
            "market extension ACL cannot request host-only command `{command}`"
        )));
    }
    Ok(())
}

/// 流式计算文件 sha256 + 大小（与 integrity 模块一致的 hex 规则）。
fn sha256_and_size(path: &Path) -> AppResult<(String, u64)> {
    let mut file =
        fs::File::open(path).map_err(|e| AppError::io(format!("open {}: {e}", path.display())))?;
    use std::io::Read as _;
    let mut hasher = sha2::Sha256::new();
    let mut size: u64 = 0;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| AppError::io(format!("read {}: {e}", path.display())))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        size += read as u64;
    }
    let digest = hasher.finalize();
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    Ok((hex, size))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::Write,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };

    /// 与 signature.rs 同源的确定性测试公钥（seed 全 0x07，仅测试用）。
    const PIPELINE_PUBKEY: &str = "untrusted comment: bench test key\nRWQBAgMEBQYHCOpKbGPinFIKvvVQexMuxfmVR3auvr57kkIe6mkURtIs";

    /// market 产物 manifest（fixture 3：签名对象 = 删 signature 后键升序紧凑 JSON，
    /// files 指向内容为 "test" 的 index.html）。
    const PIPELINE_MANIFEST: &str = r#"{
  "id": "fake-ext",
  "version": "1.0.0",
  "schemaVersion": 2,
  "display": { "en": "Fake Ext" },
  "distribution": "market",
  "entry": { "index": "index.html" },
  "acl": { "commands": [] },
  "engines": { "bench": "*" },
  "files": [
    { "path": "index.html", "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "size": 4 }
  ],
  "signature": "untrusted comment: bench test sig\nRUQBAgMEBQYHCEBrRau//nbRO+afsKe966zXO5HvL25WTHSyPlEDVa9Xh2sPHyu0JPVvKeOG7jwpaSFImZHcUbJ8aRSauSXTvAo=\ntrusted comment: fake-ext@1.0.0\nIMRjs1pxhOrlYHZUrCJk+Ou6htk77gEwX66NzVZvR2RpyPQ/9VI8QCJ/8bET4l9qOprMMfeW2xDOHmI+9hCbCg==\n"
}"#;

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn market_redirects_stay_https_public_and_bounded() {
        assert!(can_follow_market_redirect(
            0,
            "https://release-assets.githubusercontent.com/package.zip"
        ));
        assert!(!can_follow_market_redirect(
            0,
            "http://cdn.example.com/package.zip"
        ));
        assert!(!can_follow_market_redirect(0, "https://[::1]/package.zip"));
        assert!(!can_follow_market_redirect(
            0,
            "https://user@cdn.example.com/package.zip"
        ));
        assert!(!can_follow_market_redirect(
            MAX_HTTP_REDIRECTS,
            "https://cdn.example.com/package.zip"
        ));
    }

    #[test]
    fn registry_response_body_limit_is_enforced_incrementally() {
        let mut body = Vec::new();
        let maximum = vec![b'x'; MAX_REGISTRY_BYTES];
        append_registry_chunk(&mut body, &maximum).expect("exact limit is allowed");
        assert_eq!(body.len(), MAX_REGISTRY_BYTES);
        assert_eq!(
            append_registry_chunk(&mut body, b"x").unwrap_err().code,
            "EXTENSION_REGISTRY_TOO_LARGE"
        );
    }

    fn temp_root(tag: &str) -> PathBuf {
        let unique = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "bench-ext-market-{tag}-{}-{unique}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp root");
        dir
    }

    /// 组装插件 zip（manifest + index.html 内容可变，便于构造校验用例）。
    fn build_zip(tag: &str, index_html: &[u8]) -> (PathBuf, String, u64) {
        build_zip_with_manifest(tag, index_html, PIPELINE_MANIFEST)
    }

    fn build_zip_with_manifest(
        tag: &str,
        index_html: &[u8],
        manifest_json: &str,
    ) -> (PathBuf, String, u64) {
        let root = temp_root(tag);
        let zip_path = root.join("plugin.zip");
        {
            let file = fs::File::create(&zip_path).expect("create zip");
            let mut writer = zip::ZipWriter::new(file);
            writer
                .start_file("manifest.json", zip::write::SimpleFileOptions::default())
                .expect("start manifest");
            writer
                .write_all(manifest_json.as_bytes())
                .expect("write manifest");
            writer
                .start_file("index.html", zip::write::SimpleFileOptions::default())
                .expect("start index");
            writer.write_all(index_html).expect("write index");
            writer.finish().expect("finish zip");
        }
        let (hash, size) = sha256_and_size(&zip_path).expect("hash zip");
        (zip_path, hash, size)
    }

    fn registry_version(hash: &str, size: u64) -> RegistryVersion {
        RegistryVersion {
            version: "1.0.0".into(),
            engines: super::super::registry::RegistryEngines { bench: "*".into() },
            download_url: "https://cdn.example.com/fake-ext-1.0.0.zip".into(),
            sha256: hash.into(),
            size,
            published_at: None,
            yanked: false,
        }
    }

    #[test]
    fn pipeline_rejects_package_for_another_host_platform() {
        let unsupported_platform = if super::super::manifest::host_platform() == "macos" {
            "windows"
        } else {
            "macos"
        };
        let manifest_json = PIPELINE_MANIFEST.replace(
            "\"engines\"",
            &format!("\"platforms\": [\"{unsupported_platform}\"], \"engines\""),
        );
        let (zip_path, hash, size) = build_zip_with_manifest("platform", b"test", &manifest_json);
        let entry = registry_version(&hash, size);
        let staging = temp_root("platform").join("staging");
        let err = verify_staged_package(
            &zip_path,
            &staging,
            "fake-ext",
            "1.0.0",
            &entry,
            "1.30.0",
            Some(PIPELINE_PUBKEY),
            false,
        )
        .unwrap_err();
        assert_eq!(err.code, "UNSUPPORTED");
        assert!(err
            .message
            .contains(super::super::manifest::host_platform()));
        fs::remove_dir_all(zip_path.parent().unwrap()).ok();
    }

    #[test]
    fn pipeline_accepts_valid_signed_package() {
        let (zip_path, hash, size) = build_zip("valid", b"test");
        let entry = registry_version(&hash, size);
        let staging = temp_root("valid").join("staging");
        let manifest = verify_staged_package(
            &zip_path,
            &staging,
            "fake-ext",
            "1.0.0",
            &entry,
            "1.30.0",
            Some(PIPELINE_PUBKEY),
            false,
        )
        .expect("valid package passes full pipeline");
        assert_eq!(manifest.id, "fake-ext");
        assert!(staging.join("index.html").is_file());
        fs::remove_dir_all(zip_path.parent().unwrap()).ok();
    }

    #[test]
    fn market_packages_cannot_request_host_lifecycle_commands() {
        let manifest_json =
            PIPELINE_MANIFEST.replace("\"commands\": []", "\"commands\": [\"ext_uninstall\"]");
        let (zip_path, hash, size) =
            build_zip_with_manifest("host-lifecycle-acl", b"test", &manifest_json);
        let entry = registry_version(&hash, size);
        let staging = temp_root("host-lifecycle-acl").join("staging");
        let error = verify_staged_package(
            &zip_path,
            &staging,
            "fake-ext",
            "1.0.0",
            &entry,
            "1.30.0",
            Some(PIPELINE_PUBKEY),
            false,
        )
        .expect_err("market package must not acquire host lifecycle IPC");

        assert_eq!(error.code, "FORBIDDEN_PATH");
        assert!(error.message.contains("host-only command `ext_uninstall`"));
        fs::remove_dir_all(zip_path.parent().unwrap()).ok();
    }

    #[test]
    fn market_operations_for_the_same_extension_are_serialized() {
        let first = MarketOperationGuard::acquire("fake-ext").expect("first operation");
        let second = MarketOperationGuard::acquire("fake-ext").expect_err("duplicate operation");
        assert_eq!(second.code, "EXTENSION_BUSY");
        drop(first);
        MarketOperationGuard::acquire("fake-ext").expect("operation can retry after completion");
    }

    #[test]
    fn trust_preview_reservation_prevents_overwrite_and_expires_on_clear() {
        let extension_id = format!("preview-test-{}", std::process::id());
        let version = "1.2.3";
        let mut reservation =
            MarketPreviewReservation::acquire(&extension_id, version).expect("reserve preview");
        let competing = MarketPreviewReservation::acquire("another-preview", version)
            .expect_err("only one trust prompt may be pending");
        assert_eq!(competing.code, "EXTENSION_BUSY");

        reservation.mark_ready().expect("mark preview ready");
        drop(reservation);
        require_pending_market_preview(&extension_id, version)
            .expect("same preview is commit-ready");
        assert_eq!(
            require_pending_market_preview(&extension_id, "9.9.9")
                .expect_err("another version cannot consume the preview")
                .code,
            "EXTENSION_PREVIEW_EXPIRED"
        );
        clear_pending_market_preview(&extension_id, version);
        assert_eq!(
            require_pending_market_preview(&extension_id, version)
                .expect_err("cleared preview must not be committed")
                .code,
            "EXTENSION_PREVIEW_EXPIRED"
        );
    }

    #[test]
    fn pipeline_rejects_whole_package_sha_mismatch() {
        let (zip_path, hash, size) = build_zip("sha", b"test");
        // registry 声明的整包哈希与实际不符（传输损坏 / 内容投喂）。
        let entry = registry_version(
            "1111111111111111111111111111111111111111111111111111111111111111",
            size,
        );
        let staging = temp_root("sha").join("staging");
        let err = verify_staged_package(
            &zip_path,
            &staging,
            "fake-ext",
            "1.0.0",
            &entry,
            "1.30.0",
            Some(PIPELINE_PUBKEY),
            false,
        )
        .unwrap_err();
        assert_eq!(err.code, "EXTENSION_INTEGRITY_FAILED");
        assert!(err.message.contains("sha256 mismatch"));
        let _ = hash;
        fs::remove_dir_all(zip_path.parent().unwrap()).ok();
    }

    #[test]
    fn pipeline_rejects_tampered_content_despite_valid_signature() {
        // 同字节数篡改 index.html（"xxxx"）：整包哈希随 zip 重算一致，
        // 但 manifest.files 的逐文件 sha256 不再匹配 → 步骤 9 拒绝。
        let (zip_path, hash, size) = build_zip("tamper", b"xxxx");
        let entry = registry_version(&hash, size);
        let staging = temp_root("tamper").join("staging");
        let err = verify_staged_package(
            &zip_path,
            &staging,
            "fake-ext",
            "1.0.0",
            &entry,
            "1.30.0",
            Some(PIPELINE_PUBKEY),
            false,
        )
        .unwrap_err();
        assert_eq!(err.code, "EXTENSION_INTEGRITY_FAILED");
        assert!(err.message.contains("sha256 mismatch"));
        fs::remove_dir_all(zip_path.parent().unwrap()).ok();
    }

    #[test]
    fn pipeline_rejects_version_binding_mismatch() {
        let (zip_path, hash, size) = build_zip("bind", b"test");
        let entry = registry_version(&hash, size);
        let staging = temp_root("bind").join("staging");
        // 请求版本与 manifest 版本不一致（防目录/条目错位投喂）。
        let err = verify_staged_package(
            &zip_path,
            &staging,
            "fake-ext",
            "0.9.0",
            &entry,
            "1.30.0",
            Some(PIPELINE_PUBKEY),
            false,
        )
        .unwrap_err();
        assert_eq!(err.code, "FORBIDDEN_PATH");
        assert!(err.message.contains("does not match requested"));
        fs::remove_dir_all(zip_path.parent().unwrap()).ok();
    }
}
