//! douyin_content_assets JSON 持久化（宿主单写入方，D-037）。
//!
//! 布局：`$APPDATA/extension-data/douyin-content-assets/`
//! ├─ items.json   采集条目（版本化 + `atomic_write`）
//! ├─ assets.json  本地视频资产元数据
//! └─ media/<assetId>/source.<ext>  媒体本体
//!
//! 所有读写走进程级互斥锁，避免并发 `atomic_write` 互相覆盖；
//! 写失败保留旧文件（atomic_write 语义），不让前端看到半写状态。

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::persistence::{atomic_write, ensure_file_size};
use crate::{
    douyin_content_assets::types::{
        store_fail, DouyinAssetsResult, CURRENT_SCHEMA, EXTENSION_ID, MAX_STORE_FILE_BYTES,
    },
    extension_host::{manifest::is_valid_extension_id, EXT_DATA_DIR_NAME},
};

const ITEMS_FILE: &str = "items.json";
const ASSETS_FILE: &str = "assets.json";
const MEDIA_DIR: &str = "media";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ItemsFile {
    pub schema_version: u32,
    pub items: Vec<crate::douyin_content_assets::types::CapturedItem>,
}

impl Default for ItemsFile {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA,
            items: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AssetsFile {
    pub schema_version: u32,
    pub assets: Vec<crate::douyin_content_assets::types::VideoAsset>,
}

impl Default for AssetsFile {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA,
            assets: Vec::new(),
        }
    }
}

/// 进程级写锁： douyin 存储的单一写入方（阻塞 I/O 很短，Mutex 足够）。
fn store_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

/// 插件私有数据目录（不存在则创建）。
///
/// 与 `ext_data_dir` 命令同一约定：`$APPDATA/extension-data/<id>/`
/// （spec §9.3）。这里按常量 ID 直接解析（不走窗口 label 推导），
/// ID 合法性在编译期由常量决定、运行期再校验一次以防常量被误改。
pub fn data_dir<R: Runtime>(app: &AppHandle<R>) -> DouyinAssetsResult<PathBuf> {
    debug_assert!(is_valid_extension_id(EXTENSION_ID));
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| store_fail(format!("resolve app data dir failed: {e}")))?;
    let dir = base.join(EXT_DATA_DIR_NAME).join(EXTENSION_ID);
    std::fs::create_dir_all(&dir).map_err(|e| store_fail(format!("create data dir: {e}")))?;
    Ok(dir)
}

/// 媒体子目录（不存在则创建）。
pub fn media_dir<R: Runtime>(app: &AppHandle<R>) -> DouyinAssetsResult<PathBuf> {
    let dir = data_dir(app)?.join(MEDIA_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| store_fail(format!("create media dir: {e}")))?;
    Ok(dir)
}

fn store_path<R: Runtime>(app: &AppHandle<R>, file: &str) -> DouyinAssetsResult<PathBuf> {
    Ok(data_dir(app)?.join(file))
}

fn load_file<T: DeserializeOwned + Default, R: Runtime>(
    app: &AppHandle<R>,
    file: &str,
    label: &str,
) -> DouyinAssetsResult<T> {
    let path = store_path(app, file)?;
    if !path.exists() {
        return Ok(T::default());
    }
    ensure_file_size(&path, MAX_STORE_FILE_BYTES)
        .map_err(|_| store_fail(format!("{label} exceeds size limit")))?;
    let bytes = std::fs::read(&path).map_err(|e| store_fail(format!("read {label}: {e}")))?;
    serde_json::from_slice(&bytes).map_err(|e| store_fail(format!("parse {label}: {e}")))
}

fn save_file<T: Serialize, R: Runtime>(
    app: &AppHandle<R>,
    file: &str,
    label: &str,
    value: &T,
) -> DouyinAssetsResult<()> {
    let path = store_path(app, file)?;
    let bytes =
        serde_json::to_vec_pretty(value).map_err(|e| store_fail(format!("encode {label}: {e}")))?;
    atomic_write(&path, &bytes).map_err(|e| store_fail(format!("write {label}: {e}")))
}

/// schema fail-closed：比当前更新的版本直接报错，不做静默降级。
fn validate_schema(schema: u32) -> DouyinAssetsResult<()> {
    if schema > CURRENT_SCHEMA {
        Err(store_fail(format!(
            "store schema {schema} is newer than supported schema {CURRENT_SCHEMA}"
        )))
    } else {
        Ok(())
    }
}

/// 在写锁内读取 → 变更 → `atomic_write` 持久化；闭包返回值透传。
pub fn with_items_mut<R, F, T>(app: &AppHandle<R>, f: F) -> DouyinAssetsResult<T>
where
    R: Runtime,
    F: FnOnce(&mut Vec<crate::douyin_content_assets::types::CapturedItem>) -> DouyinAssetsResult<T>,
{
    let _guard = store_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut file: ItemsFile = load_file(app, ITEMS_FILE, "items")?;
    validate_schema(file.schema_version)?;
    let mut items = std::mem::take(&mut file.items);
    let result = f(&mut items)?;
    file.items = items;
    file.schema_version = CURRENT_SCHEMA;
    save_file(app, ITEMS_FILE, "items", &file)?;
    Ok(result)
}

/// 在写锁内读取 → 变更 → `atomic_write` 持久化（资产表）。
pub fn with_assets_mut<R, F, T>(app: &AppHandle<R>, f: F) -> DouyinAssetsResult<T>
where
    R: Runtime,
    F: FnOnce(&mut Vec<crate::douyin_content_assets::types::VideoAsset>) -> DouyinAssetsResult<T>,
{
    let _guard = store_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut file: AssetsFile = load_file(app, ASSETS_FILE, "assets")?;
    validate_schema(file.schema_version)?;
    let mut assets = std::mem::take(&mut file.assets);
    let result = f(&mut assets)?;
    file.assets = assets;
    file.schema_version = CURRENT_SCHEMA;
    save_file(app, ASSETS_FILE, "assets", &file)?;
    Ok(result)
}

/// 只读加载（无需写锁；读端容忍瞬时写导致的眼泪读由 atomic_write 保证不发生）。
pub fn load_items<R: Runtime>(app: &AppHandle<R>) -> DouyinAssetsResult<ItemsFile> {
    let file: ItemsFile = load_file(app, ITEMS_FILE, "items")?;
    validate_schema(file.schema_version)?;
    Ok(file)
}

pub fn load_assets<R: Runtime>(app: &AppHandle<R>) -> DouyinAssetsResult<AssetsFile> {
    let file: AssetsFile = load_file(app, ASSETS_FILE, "assets")?;
    validate_schema(file.schema_version)?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn future_schema_is_fail_closed() {
        assert!(validate_schema(CURRENT_SCHEMA).is_ok());
        assert!(validate_schema(CURRENT_SCHEMA + 1).is_err());
    }

    #[test]
    fn default_files_carry_current_schema() {
        let value = serde_json::to_value(ItemsFile::default()).expect("serialize");
        assert_eq!(value["schemaVersion"], CURRENT_SCHEMA);
        let value = serde_json::to_value(AssetsFile::default()).expect("serialize");
        assert_eq!(value["schemaVersion"], CURRENT_SCHEMA);
    }
}
