//! Extension 命令 ACL 注册表 + IPC 网关（P2，D-024）。
//!
//! **背景**：Tauri v2 对 `invoke_handler` 注册的**自定命令默认全窗口放行**，
//! capability 只约束 core/plugin 命令。本模块补上自定命令的
//! **deny-by-default 网关**：`ext-` 前缀窗口只能调用注册表内的命令，
//! 其余窗口（main / splashscreen）行为不变。
//!
//! 全局 allow-list 定义宿主可以暴露给 extension 的命令；运行时再要求
//! 命令同时出现在调用插件经验证的 `manifest.acl.commands` 中。

use std::collections::{HashMap, HashSet};
use std::sync::{OnceLock, RwLock};
use tauri::{ipc::Invoke, Manager, Runtime};

/// extension 窗口 label 前缀（`ext-<id>`）。
pub const EXT_WINDOW_PREFIX: &str = "ext-";

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

static EXTENSION_ACL: OnceLock<RwLock<HashMap<String, HashSet<String>>>> = OnceLock::new();

fn extension_acl() -> &'static RwLock<HashMap<String, HashSet<String>>> {
    EXTENSION_ACL.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Replace the effective ACL only after the host has verified a plugin's
/// signature and file-integrity manifest. Unknown host commands are dropped.
pub fn register_extension_permissions(extension_id: &str, commands: &[String]) {
    let permissions = commands
        .iter()
        .filter(|command| is_command_allowed(command))
        .cloned()
        .collect();
    extension_acl()
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(extension_id.to_string(), permissions);
}

/// Revoke a window's permissions when it is disabled or uninstalled.
pub fn revoke_extension_permissions(extension_id: &str) {
    extension_acl()
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(extension_id);
}

/// Return the effective, manifest-approved command set for one open plugin.
pub fn permissions_for_extension(extension_id: &str) -> Vec<String> {
    let mut commands = extension_acl()
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(extension_id)
        .map(|permissions| permissions.iter().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    commands.sort();
    commands
}

/// 命令是否在 extension 允许清单内。
pub fn is_command_allowed(command: &str) -> bool {
    EXTENSION_ALLOWED_COMMANDS.contains(&command)
}

pub fn is_command_allowed_for_extension(extension_id: &str, command: &str) -> bool {
    if !is_command_allowed(command) {
        return false;
    }
    // Host plumbing: the injected diagnostics script and read-only ACL
    // discovery endpoint work without being repeated in every extension ACL.
    if matches!(command, "ext_poc_report" | "ext_capabilities") {
        return true;
    }
    extension_acl()
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(extension_id)
        .is_some_and(|permissions| permissions.contains(command))
}

/// 窗口是否属于 extension 空间。
pub fn is_extension_window(label: &str) -> bool {
    label.starts_with(EXT_WINDOW_PREFIX)
}

/// IPC 网关：包装 `generate_handler` 生成的核心 handler。
///
/// - 非 extension 窗口：原样转发，行为与 P1 之前完全一致；
/// - extension 窗口：命令在宿主 allow-list 和调用插件已验证 ACL 内才转发，否则拒绝
///   （deny-by-default，拒绝信息进入插件页 console）并记 `acl_deny` 审计。
pub fn guarded<R: Runtime>(invoke: Invoke<R>, inner: impl FnOnce(Invoke<R>) -> bool) -> bool {
    let label = invoke.message.webview().label().to_string();
    if !is_extension_window(&label) {
        return inner(invoke);
    }
    let command = invoke.message.command().to_string();
    let extension_id = label.strip_prefix(EXT_WINDOW_PREFIX).unwrap_or(&label);
    if is_command_allowed_for_extension(extension_id, &command) {
        inner(invoke)
    } else {
        // P3.3：越权命令记审计（best-effort，拒绝本身不受影响）。
        let webview = invoke.message.webview();
        let app = webview.app_handle();
        let extension_id = extension_id.to_string();
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
        for command in ["handle_browser_open", "proxy_login", "ext_market_commit"] {
            assert!(!is_command_allowed(command));
        }
    }

    #[test]
    fn unknown_command_denied() {
        assert!(!is_command_allowed("totally_unknown_command"));
    }

    #[test]
    fn private_native_app_market_commands_are_host_only() {
        for command in [
            "native_app_market_list",
            "native_app_install",
            "native_app_uninstall",
            "native_app_open",
            "install_private_native_tool",
        ] {
            assert!(!is_command_allowed(command));
            assert!(!is_command_allowed_for_extension("app-manager", command));
        }
    }

    #[test]
    fn manifest_acl_is_enforced_and_revocable() {
        register_extension_permissions("acl-test", &["launch_app".to_string()]);
        assert!(is_command_allowed_for_extension("acl-test", "launch_app"));
        assert!(!is_command_allowed_for_extension("acl-test", "install_app"));
        assert!(is_command_allowed_for_extension(
            "acl-test",
            "ext_capabilities"
        ));
        assert!(is_command_allowed_for_extension(
            "acl-test",
            "ext_poc_report"
        ));
        assert!(!is_command_allowed_for_extension(
            "acl-test",
            "unknown_command"
        ));
        revoke_extension_permissions("acl-test");
        assert!(!is_command_allowed_for_extension("acl-test", "launch_app"));
        assert!(!is_command_allowed_for_extension(
            "photo-triage",
            "native_app_install"
        ));
    }
}
