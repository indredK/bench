//! Extension host commands —— P2 命令面 + P3.1 完整性校验链（D-024）。
//!
//! P1 的 `ext_poc_open` / `ext_poc_report` 保留语义；通用命令：
//! - `ext_list_installed`：扫描 `$APPDATA/extensions/*/manifest.json`，返回摘要；
//! - `ext_open`：按插件 id 打开独立 WebView（**全量校验链**：manifest v2 →
//!   engines 兼容 → market 签名（canonical 文本 + trusted comment）→ 逐文件
//!   完整性 → 抬升版本水位）；
//! - `ext_set_enabled`：以 `.disabled` 标记文件实现启用/禁用（禁用时关闭已开窗口）；
//! - `ext_uninstall`：关窗 + 删产物目录（**默认保留插件数据目录**）+ 清版本水位；
//! - `ext_data_dir`：向插件窗口提供其私有数据目录（`$APPDATA/extension-data/<id>/`，
//!   spec §9.3 —— 产物目录只读，数据必须写在这里）。
//! - `ext_capabilities`：返回宿主开放给插件空间的 IPC 命令清单（能力面快照），
//!   供插件运行时自助发现可用命令，无需依赖仓库同目录或试错式调用。
//!
//! 所有入口都 fail-closed：manifest 解析/校验失败、id 非法、ACL 越权、
//! 完整性不符一律拒绝。已注册命令受 [super::acl] 网关保护。

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::{AppError, AppResult};

use super::{
    assets::EXT_DIR_NAME,
    audit::{self, AuditEvent},
    integrity,
    manifest::{ExtensionDistribution, ExtensionManifest, EXT_DISABLED_MARKER, MANIFEST_FILE},
    records, registry, signature,
    url::{extension_url, extension_window_label},
    EXT_DATA_DIR_NAME,
};

/// POC 插件 id（P1 spike，保留作网关/回写验证入口）。
pub const POC_EXTENSION_ID: &str = "bench-poc";

/// 插件诊断落盘文件名（P3.3 起**追加式 JSONL**：boot 不再覆盖先前 error）。
pub const POC_RESULT_FILE: &str = "ext-diagnostics.jsonl";
const MAX_DIAGNOSTIC_MESSAGE_CHARS: usize = 4000;
const MAX_DIAGNOSTIC_URL_CHARS: usize = 2048;
const MAX_DIAGNOSTIC_SOURCE_CHARS: usize = 1024;

/// 插件窗口错误捕获脚本。
///
/// 注入到每个插件窗口：捕获未处理异常 / Promise 拒绝 / console.error，
/// 经 `ext_poc_report` 回写宿主（ACL 注册表已放行）。
/// 这是插件调试基建（P3.3 起落盘改为追加式），生产构建同样保留——
/// 错误数据只落本机应用数据目录，无外发。
pub const EXT_ERROR_CAPTURE_SCRIPT: &str = r#"(() => {
  const MAX_MESSAGE_LENGTH = 4000;
  const send = (payload) => {
    try {
      const record = { ...payload, ts: new Date().toISOString() };
      if (typeof record.message === "string") {
        record.message = record.message.slice(0, MAX_MESSAGE_LENGTH);
      }
      const pending = window.__TAURI_INTERNALS__?.invoke?.("ext_poc_report", { payload: record });
      // invoke 返回的 Promise 若拒绝会再次触发 unhandledrejection，形成诊断递归。
      if (pending && typeof pending.catch === "function") pending.catch(() => {});
    } catch (_) { /* IPC 未就绪时丢弃（仅调试数据） */ }
  };
  const fmt = (value) => {
    try {
      if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ""}`;
      return typeof value === "object" ? JSON.stringify(value) : String(value);
    } catch (_) {
      return String(value);
    }
  };
  window.addEventListener("error", (e) => {
    send({ type: "ext-diagnostic", kind: "window-error", url: location.href,
      message: String(e.message), source: String(e.filename ?? ""), line: e.lineno ?? 0 });
  });
  window.addEventListener("unhandledrejection", (e) => {
    send({ type: "ext-diagnostic", kind: "unhandled-rejection", url: location.href,
      message: fmt(e.reason) });
  });
  const originalError = console.error.bind(console);
  console.error = (...args) => {
    send({ type: "ext-diagnostic", kind: "console.error", url: location.href,
      message: args.map(fmt).join(" ") });
    originalError(...args);
  };
  window.addEventListener("load", () => {
    send({ type: "ext-diagnostic", kind: "boot", url: location.href, message: "window load" });
  });
})();"#;

/// 已安装插件摘要（返回给插件中心）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionSummary {
    pub id: String,
    pub version: String,
    pub display_zh: String,
    pub display_en: String,
    pub distribution: ExtensionDistribution,
    pub enabled: bool,
    /// 宿主版本是否满足 `engines.bench`（不兼容时禁止打开）。
    pub compatible: bool,
    /// 原始 manifest 兼容约束，用于详情页解释兼容要求。
    pub engines_bench: String,
    /// 原始 manifest ACL；由 UI 与当前宿主能力清单求交集展示。
    pub acl_commands: Vec<String>,
    /// 安装时 registry 声明的发布者。该字段是来源声明，不代表独立身份认证。
    pub publisher_name: Option<String>,
    /// 安装时宿主实际使用的信任策略；旧安装或记录版本不匹配时未知。
    pub verification_method: Option<String>,
}

/// 插件根目录：`$APPDATA/extensions`。
fn extensions_root(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("resolve app data dir failed: {e}")))?;
    Ok(dir.join(EXT_DIR_NAME))
}

/// 校验插件 id 并返回其产物目录（拒绝路径穿越）。
fn extension_dir(app: &AppHandle, extension_id: &str) -> AppResult<PathBuf> {
    if !super::manifest::is_valid_extension_id(extension_id) {
        return Err(AppError::invalid_input(format!(
            "invalid extension id `{extension_id}`"
        )));
    }
    Ok(extensions_root(app)?.join(extension_id))
}

/// 插件私有数据目录：`$APPDATA/extension-data/<id>/`（spec §9.3）。
///
/// 数据目录不参与完整性校验，卸载默认保留。
pub(crate) fn extension_data_dir(app: &AppHandle, extension_id: &str) -> AppResult<PathBuf> {
    if !super::manifest::is_valid_extension_id(extension_id) {
        return Err(AppError::invalid_input(format!(
            "invalid extension id `{extension_id}`"
        )));
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("resolve app data dir failed: {e}")))?;
    Ok(dir.join(EXT_DATA_DIR_NAME).join(extension_id))
}

/// 读取并校验某插件的 manifest（fail-closed），返回 manifest 与 canonical 文本。
///
/// canonical 文本是 market 签名的验签对象（spec §4.1）：删 `signature` 字段、
/// 键升序、紧凑 JSON —— **不是** manifest 文件原样字节。
fn read_manifest(dir: &Path) -> AppResult<(ExtensionManifest, String)> {
    let path = dir.join(MANIFEST_FILE);
    let text = fs::read_to_string(&path)
        .map_err(|e| AppError::not_found(format!("read {}: {e}", path.display())))?;
    let manifest = ExtensionManifest::parse(&text)?;
    let canonical = signature::canonical_manifest_text(&text)?;
    Ok((manifest, canonical))
}

/// 列出已安装插件（读每个产物的 manifest，跳过损坏条目并在错误信息中带过）。
#[tauri::command]
pub fn ext_list_installed(app: AppHandle) -> AppResult<Vec<ExtensionSummary>> {
    let root = extensions_root(&app)?;
    let mut summaries = Vec::new();
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        // 首次启动目录不存在：返回空列表而非报错。
        Err(_) => return Ok(summaries),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let (manifest, _canonical) = match read_manifest(&path) {
            Ok(result) => result,
            Err(error) => {
                eprintln!(
                    "[extension_host] skip invalid extension at {}: {error}",
                    path.display()
                );
                continue;
            }
        };
        // 平台门控（P5，spec §3.1 platforms）：声明不含当前平台的插件不出现在
        // 已装列表（能力判定由宿主做，renderer 不自行决定 —— D-007）。
        if !manifest.supports_host_platform() {
            continue;
        }
        let enabled = !path.join(EXT_DISABLED_MARKER).exists();
        let compatible = manifest.satisfies_engines(&app.package_info().version.to_string());
        let (publisher_name, verification_method) = match manifest.distribution {
            ExtensionDistribution::Bundled => (None, Some("bundledWithApp".to_string())),
            ExtensionDistribution::Market => {
                match records::read_source_record(&app, &manifest.id) {
                    Ok(Some(record)) if record.version == manifest.version => (
                        record.publisher_name,
                        Some(
                            match record.verification_method {
                                records::VerificationMethod::OfficialRegistryHashes => {
                                    "officialRegistryHashes"
                                }
                                records::VerificationMethod::Minisign => "minisign",
                                records::VerificationMethod::DevelopmentUnsigned => {
                                    "developmentUnsigned"
                                }
                            }
                            .to_string(),
                        ),
                    ),
                    Ok(_) => (None, None),
                    Err(error) => {
                        eprintln!(
                            "[extension_host] read source record for `{}` failed: {error}",
                            manifest.id
                        );
                        (None, None)
                    }
                }
            }
        };
        // display.zh 可选（v2 起）：缺失回退 en。先取展示名再移动其余字段。
        let display_en = manifest.display_name("en").to_string();
        let display_zh = manifest.display_name("zh").to_string();
        let engines_bench = manifest.engines.bench.clone();
        let acl_commands = manifest.acl.commands.clone();
        summaries.push(ExtensionSummary {
            id: manifest.id,
            version: manifest.version,
            display_zh,
            display_en,
            distribution: manifest.distribution,
            enabled,
            compatible,
            engines_bench,
            acl_commands,
            publisher_name,
            verification_method,
        });
    }
    summaries.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(summaries)
}

/// 打开插件窗口（label `ext-<id>`），返回窗口 label。
///
/// - `locale`：宿主前端语言（i18n.language），经 init script 注入
///   `window.__BENCH_EXT_LOCALE`（dev/prod 跨 origin 下 localStorage 不共享，
///   由 Rust 注入是唯一可靠通道）；
/// - 校验链（全部 fail-closed，spec §3.4 顺序）：
///   manifest v2（含 `expiresAt` 过期）→ engines 兼容 → market 签名
///   （canonical 文本 + trusted comment）→ **逐文件完整性**（P3.1）→
///   抬升版本水位（重放防护的记录侧；拒绝侧在 P4 安装路径）。
#[tauri::command]
pub fn ext_open(app: AppHandle, extension_id: String, locale: Option<String>) -> AppResult<String> {
    // 校验链封装为闭包：任一步失败 → `verify_fail` 审计（P3.3）后再拒绝。
    let open_verified = || -> AppResult<(ExtensionManifest, PathBuf)> {
        let dir = extension_dir(&app, &extension_id)?;
        let (manifest, canonical_text) = read_manifest(&dir)?;

        let host_version = app.package_info().version.to_string();
        if !manifest.satisfies_engines(&host_version) {
            return Err(AppError::unsupported(format!(
                "extension `{}` requires bench {}, current host is {host_version}",
                manifest.id, manifest.engines.bench
            )));
        }
        // 与安装路径（market.rs）保持一致：官方 registry 豁免 minisign 验签
        // （完整性由 registry sha256 + 包内 files 清单双通道兜底，spec §5.4）；
        // 第三方源仍强制验签（fail-closed）。
        let official_source = registry::is_official_registry(&registry::registry_base_url()?);
        if !official_source {
            signature::verify_distribution_signature(&manifest, &canonical_text)?;
        }
        // 逐文件 hash 校验 + 清单外文件拒绝（P3.1 核心：开窗前最后一道完整性闸门）。
        integrity::verify_bundle_integrity(&dir, &manifest)?;
        if manifest.distribution == ExtensionDistribution::Market {
            // market 插件开窗即运行：版本低于已验证水位 = 重放/降级，拒绝
            // （防御纵深；安装路径的强制检查见 records 模块文档 / P4）。
            records::check_version_monotonic(&app, &manifest.id, &manifest.version)?;
        }
        // 完整校验通过 → 抬升已验证版本水位（拒绝侧见 records 模块文档）。
        records::record_verified_version(&app, &manifest.id, &manifest.version)?;
        Ok((manifest, dir))
    };
    let (manifest, dir) = match open_verified() {
        Ok(result) => result,
        Err(error) => {
            audit::record(
                &app,
                AuditEvent::VerifyFail,
                &extension_id,
                None,
                Some(&error.message),
            );
            return Err(error);
        }
    };

    if dir.join(EXT_DISABLED_MARKER).exists() {
        return Err(AppError::invalid_input(format!(
            "extension `{}` is disabled",
            manifest.id
        )));
    }

    let label = extension_window_label(&manifest.id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        return Ok(label);
    }

    let url = extension_url(&manifest.id, &manifest.entry.index)?;
    let locale_script = format!(
        "window.__BENCH_EXT_LOCALE = {};",
        serde_json::to_string(&locale).unwrap_or_else(|_| "null".to_string())
    );
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::CustomProtocol(url))
        .title(format!("{} · Bench Extension", manifest.display_name("en")))
        .inner_size(960.0, 680.0)
        .center()
        .initialization_script(locale_script)
        .initialization_script(EXT_ERROR_CAPTURE_SCRIPT)
        .build()
        .map_err(|e| AppError::internal(format!("open extension window failed: {e}")))?;
    Ok(label)
}

/// 卸载插件：关闭窗口并删除产物目录（含禁用标记）。
///
/// **默认保留插件私有数据目录**（`$APPDATA/extension-data/<id>/`，spec §9.3）；
/// 「清除残留数据」独立入口属插件中心 P4 项。同时清除版本水位，
/// 使重装旧版本不被历史水位卡死。
#[tauri::command]
pub fn ext_uninstall(app: AppHandle, extension_id: String) -> AppResult<()> {
    let dir = extension_dir(&app, &extension_id)?;
    // 仅允许删除合法插件目录（防止误删任意路径）。
    let (manifest, _canonical) = read_manifest(&dir)?;
    if let Some(existing) = app.get_webview_window(extension_window_label(&extension_id).as_str()) {
        let _ = existing.close();
    }
    fs::remove_dir_all(&dir).map_err(|e| AppError::io(format!("uninstall {extension_id}: {e}")))?;
    // 产物已删除；水位清理失败不阻断卸载（仅记录）。
    if let Err(error) = records::clear_record(&app, &extension_id) {
        eprintln!("[extension_host] clear version record for `{extension_id}` failed: {error}");
    }
    audit::record(
        &app,
        AuditEvent::Uninstall,
        &manifest.id,
        Some(&manifest.version),
        None,
    );
    Ok(())
}

/// 启用/禁用插件（以 `.disabled` 标记实现；禁用时关闭已开窗口），返回新状态。
#[tauri::command]
pub fn ext_set_enabled(app: AppHandle, extension_id: String, enabled: bool) -> AppResult<bool> {
    let dir = extension_dir(&app, &extension_id)?;
    // id 合法性之外再确认插件存在（manifest 可读）。
    let (manifest, _canonical) = read_manifest(&dir)?;
    let marker = dir.join(EXT_DISABLED_MARKER);
    if enabled {
        if marker.exists() {
            fs::remove_file(&marker).map_err(|e| AppError::io(format!("remove marker: {e}")))?;
        }
    } else {
        fs::write(&marker, "").map_err(|e| AppError::io(format!("write marker: {e}")))?;
        if let Some(existing) =
            app.get_webview_window(extension_window_label(&extension_id).as_str())
        {
            let _ = existing.close();
        }
    }
    audit::record(
        &app,
        if enabled {
            AuditEvent::Enable
        } else {
            AuditEvent::Disable
        },
        &manifest.id,
        Some(&manifest.version),
        None,
    );
    Ok(enabled)
}

/// 返回调用方插件窗口的私有数据目录（`$APPDATA/extension-data/<id>/`），
/// 不存在则创建（spec §9.3：路径经 IPC 提供给插件）。
///
/// 目录从窗口 label（`ext-<id>`）推导，**不信任调用参数**；非插件窗口
/// 调用一律拒绝。
#[tauri::command]
pub fn ext_data_dir(webview: tauri::WebviewWindow) -> AppResult<String> {
    let label = webview.label().to_string();
    let Some(extension_id) = label.strip_prefix(super::acl::EXT_WINDOW_PREFIX) else {
        return Err(AppError::invalid_input(
            "ext_data_dir is only available to extension windows",
        ));
    };
    let dir = extension_data_dir(webview.app_handle(), extension_id)?;
    fs::create_dir_all(&dir).map_err(|e| AppError::io(format!("create data dir: {e}")))?;
    Ok(dir.to_string_lossy().into_owned())
}

/// 宿主开放给插件空间的 IPC 命令清单（能力面快照，spec §7 / §9.4）。
///
/// 供插件在运行时自助发现可用命令，无需依赖「两仓库同目录」或试错式调用。
/// 等价于 `acl::EXTENSION_ALLOWED_COMMANDS` 的只读视图（deny-by-default 白名单）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostCapability {
    /// 允许 `ext-*` 窗口调用的全部命令名。
    pub commands: Vec<String>,
}

/// 返回宿主当前开放给插件空间的 IPC 命令清单（能力面）。
///
/// 命令名集合即 `acl::EXTENSION_ALLOWED_COMMANDS`；本命令自身也在该白名单内，
/// 因此插件窗口可直接 `invoke("ext_capabilities")` 拉取后校验自身 `acl.commands`，
/// 在调用前给出友好报错而非靠网关拒绝反推（spec §9.4）。
#[tauri::command]
pub fn ext_capabilities() -> AppResult<HostCapability> {
    let commands = super::acl::EXTENSION_ALLOWED_COMMANDS
        .iter()
        .map(|s| s.to_string())
        .collect();
    Ok(HostCapability { commands })
}

/// P1 语义保留：打开 POC 插件窗口（等价 `ext_open("bench-poc")`）。
#[tauri::command]
pub fn ext_poc_open(app: AppHandle) -> AppResult<String> {
    let root = extensions_root(&app)?;
    let index = root.join(POC_EXTENSION_ID).join("index.html");
    if !index.exists() {
        return Err(AppError::not_found(format!(
            "POC extension bundle not found: {} — run `pnpm run poc:extension` first",
            index.display()
        )));
    }
    ext_open(app, POC_EXTENSION_ID.to_string(), None)
}

/// 接收插件页诊断上报并**追加**落盘（P3.3：由覆盖式改为追加式 JSONL，
/// boot 事件不再覆盖先前 error；沿用审计日志的 2MB 环形滚动）。
#[tauri::command]
pub async fn ext_poc_report(app: AppHandle, payload: Value) -> AppResult<()> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal(format!("resolve app data dir failed: {e}")))?;
    let path = dir.join(POC_RESULT_FILE);
    let record = sanitize_diagnostic_payload(&payload);
    let line = serde_json::to_string(&record)
        .map_err(|e| AppError::internal(format!("serialize diagnostic payload: {e}")))?;
    tauri::async_runtime::spawn_blocking(move || audit::append_diagnostic(&path, &line))
        .await
        .map_err(|error| AppError::task_failed(format!("write diagnostics task failed: {error}")))?
}

fn sanitize_diagnostic_payload(payload: &Value) -> Value {
    let mut record = serde_json::Map::new();
    record.insert("type".into(), Value::String("ext-diagnostic".into()));
    record.insert("ts".into(), Value::String(chrono::Utc::now().to_rfc3339()));

    for (key, max_chars) in [
        ("kind", 80),
        ("url", MAX_DIAGNOSTIC_URL_CHARS),
        ("message", MAX_DIAGNOSTIC_MESSAGE_CHARS),
        ("source", MAX_DIAGNOSTIC_SOURCE_CHARS),
    ] {
        if let Some(value) = payload.get(key).and_then(Value::as_str) {
            record.insert(key.into(), Value::String(truncate_chars(value, max_chars)));
        }
    }
    if let Some(line) = payload.get("line").and_then(Value::as_u64) {
        record.insert("line".into(), Value::from(line));
    }

    Value::Object(record)
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let prefix: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{prefix}…")
    } else {
        prefix
    }
}

#[cfg(test)]
mod diagnostics_tests {
    use super::*;

    #[test]
    fn diagnostic_report_is_timestamped_allowlisted_and_bounded() {
        let payload = serde_json::json!({
            "type": "forged-type",
            "ts": "forged-time",
            "kind": "window-error",
            "url": "u".repeat(5000),
            "message": "💥".repeat(5000),
            "source": "s".repeat(2000),
            "line": -1,
            "privatePayload": "must not be persisted"
        });

        let record = sanitize_diagnostic_payload(&payload);
        assert_eq!(record["type"], "ext-diagnostic");
        assert_eq!(record["kind"], "window-error");
        assert!(record["ts"].as_str().unwrap().contains('T'));
        assert_eq!(record["message"].as_str().unwrap().chars().count(), 4001);
        assert_eq!(record["url"].as_str().unwrap().chars().count(), 2049);
        assert_eq!(record["source"].as_str().unwrap().chars().count(), 1025);
        assert!(record.get("privatePayload").is_none());
        assert!(record.get("line").is_none());

        let serialized = serde_json::to_string(&record).unwrap();
        assert!(serialized.len() < 64 * 1024);
    }
}
