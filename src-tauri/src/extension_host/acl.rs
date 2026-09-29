//! Extension 命令 ACL 注册表 + IPC 网关（P2，D-024）。
//!
//! **背景**：Tauri v2 对 `invoke_handler` 注册的**自定命令默认全窗口放行**，
//! capability 只约束 core/plugin 命令。本模块补上自定命令的
//! **deny-by-default 网关**：`ext-` 前缀窗口只能调用注册表内的命令，
//! 其余窗口（main / splashscreen）行为不变。
//!
//! 注册表语义：**允许暴露给 extension 空间的命令全集**。业务命令还必须列入
//! 创建该窗口时验证的 `manifest.acl.commands`；能力发现和宿主诊断接口例外。

use std::{
    collections::{HashMap, HashSet},
    sync::{Mutex, RwLock},
};

use tauri::{ipc::Invoke, Manager, Runtime};

/// extension 窗口 label 前缀（`ext-<id>`）。
pub const EXT_WINDOW_PREFIX: &str = "ext-";

/// 经完整校验、当前已打开的插件窗口权限。
///
/// 按窗口 label 隔离，而不是按插件 id 临时读取磁盘 manifest：正在运行的
/// WebView 必须继续使用创建该窗口时校验过的权限；权限状态缺失或锁中毒均拒绝。
#[derive(Default)]
pub struct ExtensionAclState {
    grants: RwLock<HashMap<String, HashSet<String>>>,
    transitions: Mutex<HashSet<String>>,
}

/// Exclusive lifecycle transition for one extension (open, update, disable, or uninstall).
/// Serializing these operations prevents a newly opened WebView from racing a bundle swap.
pub struct ExtensionTransitionGuard<'a> {
    state: &'a ExtensionAclState,
    extension_id: String,
}

impl ExtensionAclState {
    /// 为即将创建的插件窗口登记已校验的 manifest 权限。
    pub fn grant(&self, label: &str, commands: &[String]) -> bool {
        let Ok(mut grants) = self.grants.write() else {
            return false;
        };
        grants.insert(label.to_string(), commands.iter().cloned().collect());
        true
    }

    /// 撤销已关闭、禁用或卸载的插件窗口权限。
    pub fn revoke(&self, label: &str) {
        if let Ok(mut grants) = self.grants.write() {
            grants.remove(label);
        }
    }

    /// Copy the current grant for rollback if a forced close fails before a bundle swap.
    pub fn snapshot(&self, label: &str) -> Option<Vec<String>> {
        self.grants
            .read()
            .ok()?
            .get(label)
            .map(|commands| commands.iter().cloned().collect())
    }

    /// Acquire an exclusive transition slot. Poisoning or a duplicate transition fails closed.
    pub fn begin_transition(&self, extension_id: &str) -> Option<ExtensionTransitionGuard<'_>> {
        let mut active = self.transitions.lock().ok()?;
        if !active.insert(extension_id.to_string()) {
            return None;
        }
        drop(active);
        Some(ExtensionTransitionGuard {
            state: self,
            extension_id: extension_id.to_string(),
        })
    }

    /// 窗口必须同时命中宿主白名单与 manifest 授权。
    pub fn allows(&self, label: &str, command: &str) -> bool {
        let Ok(grants) = self.grants.read() else {
            return false;
        };
        grants
            .get(label)
            .is_some_and(|commands| command_allowed_for_manifest(commands, command))
    }
}

impl Drop for ExtensionTransitionGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut active) = self.state.transitions.lock() {
            active.remove(&self.extension_id);
        }
    }
}

/// 允许暴露给 extension 空间的命令全集（deny-by-default）。
///
/// 新增条目时必须同步：
/// 1. 命令实现本身已存在于 `invoke_handler`；
/// 2. 该命令对插件场景是安全的（无凭据读写、无跨账号、无系统级破坏面）；
/// 3. `docs/explanation/extension-workflow.md` 的能力面章节。
pub const EXTENSION_ALLOWED_COMMANDS: &[&str] = &[
    // extension host 自身
    "ext_poc_report",
    "ext_list_installed",
    "ext_open",
    "ext_set_enabled",
    "ext_uninstall",
    "ext_data_dir",
    // 能力面自助发现（返回本注册表快照，spec §9.4）
    "ext_capabilities",
    // photo-triage 能力面（15 条，IPC 命令名不变，D-024）
    "photo_triage_scan",
    "photo_triage_scan_status",
    "photo_triage_list_recent",
    "photo_triage_open",
    "photo_triage_capabilities",
    "photo_triage_ensure_proxy",
    "photo_triage_original_path",
    "photo_triage_trash",
    "photo_triage_restore",
    "photo_triage_move",
    "photo_triage_reveal",
    "photo_triage_prune",
    "photo_triage_empty_dirs",
    "photo_triage_delete_empty_dirs",
    "photo_triage_export",
    // terminology 能力面（14 条 CRUD，P5 迁移；数据存储仍在宿主核心）
    "list_terminology_data",
    "create_industry",
    "update_industry",
    "delete_industry",
    "create_category",
    "update_category",
    "delete_category",
    "create_subcategory",
    "update_subcategory",
    "delete_subcategory",
    "create_term",
    "update_term",
    "delete_term",
    "set_term_pinned",
    // clean-space 能力面（8 条，P5 迁移；含 dev-cleaner 子能力 6 条 = 14）
    "scan_storage_overview",
    "scan_storage_stream",
    "get_category_items",
    "execute_category_cleanup",
    "scan_custom_folder",
    "open_system_storage_settings",
    "get_cleanup_records",
    "add_cleanup_record",
    "scan_dev_projects",
    "cleanup_projects",
    "stop_scan",
    "get_custom_cleanup_commands",
    "execute_custom_cleanup",
    "stop_custom_cleanup",
    // token-calculator 能力面（4 条计费标准 CRUD，P5 迁移；宿主核心实现）
    "list_pricing_standards",
    "create_pricing_standard",
    "update_pricing_standard",
    "delete_pricing_standard",
    // douyin-content-assets 能力面（4 条采集条目查询/本地视频导入/软删，DCA-01；D-037）。
    // 媒体路径由宿主解析，插件只接触资产 ID；无凭据读写、无系统级破坏面。
    "douyin_assets_get_capabilities",
    "douyin_assets_list_items",
    "douyin_assets_import_files",
    "douyin_assets_delete_items",
    // app-manager / quick-launch 能力面（19 条应用清单与启停，P5 迁移）。
    // ⚠️ 含 install/uninstall/upgrade 等系统级操作：宿主内置功能原本即具备，
    // 插件化后能力面不变，风险由安装时的信任披露（ACL 列表）向用户明示。
    "scan_installed_apps",
    "cancel_app_inventory_scan",
    "get_cached_app_inventory",
    "get_app_icon_base64",
    "launch_app",
    "reveal_app_in_finder",
    "authorize_mac_app",
    "check_managed_app_updates",
    "upgrade_app",
    "uninstall_app",
    "batch_upgrade_apps",
    "batch_uninstall_apps",
    "install_app",
    "cancel_batch_operation",
    "check_all_app_updates",
    "open_in_mac_app_store",
    "open_in_mac_app_store_updates",
    "install_app_update",
    "cancel_app_update",
    // hardware 为纯前端插件（零 IPC，acl.commands 为空，P5 迁移）
];

/// 命令是否在 extension 允许清单内。
pub fn is_command_allowed(command: &str) -> bool {
    EXTENSION_ALLOWED_COMMANDS.contains(&command)
}

/// 判断命令是否既在宿主能力面内，也由当前插件明确声明。
/// `ext_capabilities` 是无副作用的能力面自助发现接口；`ext_poc_report` 是宿主
/// 注入的诊断脚本使用的本地日志上报接口。两者不是插件业务能力，不要求重复声明。
fn command_allowed_for_manifest(commands: &HashSet<String>, command: &str) -> bool {
    is_command_allowed(command)
        && (matches!(command, "ext_capabilities" | "ext_poc_report") || commands.contains(command))
}

/// 窗口是否属于 extension 空间。
pub fn is_extension_window(label: &str) -> bool {
    label.starts_with(EXT_WINDOW_PREFIX)
}

/// IPC 网关：包装 `generate_handler` 生成的核心 handler。
///
/// - 非 extension 窗口：原样转发，行为与 P1 之前完全一致；
/// - extension 窗口：命令必须同时在宿主注册表及该窗口 manifest ACL 内；
///   `ext_capabilities`（能力发现）与 `ext_poc_report`（宿主诊断上报）是基础接口例外。其它请求以 IPC 错误拒绝
///   （deny-by-default，拒绝信息进入插件页 console）并记 `acl_deny` 审计。
pub fn guarded<R: Runtime>(invoke: Invoke<R>, inner: impl FnOnce(Invoke<R>) -> bool) -> bool {
    let label = invoke.message.webview().label().to_string();
    if !is_extension_window(&label) {
        return inner(invoke);
    }
    let command = invoke.message.command().to_string();
    let webview = invoke.message.webview();
    let app = webview.app_handle();
    let allowed = app
        .try_state::<ExtensionAclState>()
        .is_some_and(|state| state.allows(&label, &command));
    if allowed {
        inner(invoke)
    } else {
        // P3.3：越权命令记审计（best-effort，拒绝本身不受影响）。
        let extension_id = label
            .strip_prefix(EXT_WINDOW_PREFIX)
            .unwrap_or(&label)
            .to_string();
        super::audit::record(
            app,
            super::audit::AuditEvent::AclDeny,
            &extension_id,
            None,
            Some(&command),
        );
        let error = tauri::ipc::InvokeError(serde_json::Value::String(format!(
            "[extension_host] command `{command}` is not allowed for extension window `{label}`"
        )));
        invoke
            .resolver
            .respond(Err::<tauri::ipc::InvokeResponseBody, _>(error));
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_prefix_detection() {
        assert!(is_extension_window("ext-bench-poc"));
        assert!(is_extension_window("ext-photo-triage"));
        assert!(!is_extension_window("main"));
        assert!(!is_extension_window("splashscreen"));
        assert!(!is_extension_window("extension-center"));
    }

    #[test]
    fn extension_transitions_are_exclusive_per_id_and_released_on_drop() {
        let state = ExtensionAclState::default();
        let first = state
            .begin_transition("photo-triage")
            .expect("first transition");
        assert!(state.begin_transition("photo-triage").is_none());
        assert!(state.begin_transition("terminology").is_some());
        drop(first);
        assert!(state.begin_transition("photo-triage").is_some());
    }

    #[test]
    fn capability_face_all_allowed() {
        let clean_space = [
            "scan_storage_overview",
            "scan_storage_stream",
            "get_category_items",
            "execute_category_cleanup",
            "scan_custom_folder",
            "open_system_storage_settings",
            "get_cleanup_records",
            "add_cleanup_record",
            "scan_dev_projects",
            "cleanup_projects",
            "stop_scan",
            "get_custom_cleanup_commands",
            "execute_custom_cleanup",
            "stop_custom_cleanup",
        ];
        let photo_triage = [
            "photo_triage_scan",
            "photo_triage_scan_status",
            "photo_triage_list_recent",
            "photo_triage_open",
            "photo_triage_capabilities",
            "photo_triage_ensure_proxy",
            "photo_triage_original_path",
            "photo_triage_trash",
            "photo_triage_restore",
            "photo_triage_move",
            "photo_triage_reveal",
            "photo_triage_prune",
            "photo_triage_empty_dirs",
            "photo_triage_delete_empty_dirs",
            "photo_triage_export",
        ];
        let terminology = [
            "list_terminology_data",
            "create_industry",
            "update_industry",
            "delete_industry",
            "create_category",
            "update_category",
            "delete_category",
            "create_subcategory",
            "update_subcategory",
            "delete_subcategory",
            "create_term",
            "update_term",
            "delete_term",
            "set_term_pinned",
        ];
        for command in photo_triage
            .into_iter()
            .chain(terminology)
            .chain(clean_space)
        {
            assert!(
                is_command_allowed(command),
                "`{command}` should be in the extension allow-list"
            );
        }
    }

    #[test]
    fn dangerous_commands_denied() {
        for command in [
            "shutdown_now",
            "reboot_now",
            "reset_tcc_permission",
            "empty_trash",
            "handle_browser_open",
            "open_login_window",
            "proxy_login",
        ] {
            assert!(
                !is_command_allowed(command),
                "`{command}` must NOT be exposed to extension windows"
            );
        }
    }

    #[test]
    fn ext_host_commands_allowed() {
        for command in [
            "ext_poc_report",
            "ext_list_installed",
            "ext_open",
            "ext_set_enabled",
            "ext_uninstall",
            "ext_data_dir",
            "ext_capabilities",
        ] {
            assert!(is_command_allowed(command));
        }
    }

    #[test]
    fn manifest_acl_is_enforced_with_runtime_interface_exceptions() {
        let no_permissions = HashSet::new();
        assert!(!command_allowed_for_manifest(
            &no_permissions,
            "photo_triage_capabilities"
        ));
        assert!(command_allowed_for_manifest(
            &no_permissions,
            "ext_capabilities"
        ));
        assert!(command_allowed_for_manifest(
            &no_permissions,
            "ext_poc_report"
        ));

        let declared = HashSet::from(["photo_triage_capabilities".to_string()]);
        assert!(command_allowed_for_manifest(
            &declared,
            "photo_triage_capabilities"
        ));
        assert!(!command_allowed_for_manifest(&declared, "cleanup_projects"));
    }

    #[test]
    fn window_grants_are_isolated_and_revoked() {
        let state = ExtensionAclState::default();
        assert!(state.grant("ext-first", &["photo_triage_capabilities".to_string()]));
        assert!(state.allows("ext-first", "photo_triage_capabilities"));
        assert!(!state.allows("ext-second", "photo_triage_capabilities"));

        state.revoke("ext-first");
        assert!(!state.allows("ext-first", "photo_triage_capabilities"));
    }

    #[test]
    fn douyin_assets_commands_allowed() {
        for command in [
            "douyin_assets_get_capabilities",
            "douyin_assets_list_items",
            "douyin_assets_import_files",
            "douyin_assets_delete_items",
        ] {
            assert!(is_command_allowed(command));
        }
        // 越权面回归：桥接/账号控制面命令不得因新路由混入插件白名单。
        for command in [
            "handle_browser_open",
            "proxy_login",
            "ext_market_commit",
            "ext_market_cancel",
        ] {
            assert!(!is_command_allowed(command));
        }
    }

    #[test]
    fn unknown_command_denied() {
        assert!(!is_command_allowed("totally_unknown_command"));
    }
}
