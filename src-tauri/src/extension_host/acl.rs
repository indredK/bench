//! Extension 命令 ACL 注册表 + IPC 网关（P2，D-024）。
//!
//! **背景**：Tauri v2 对 `invoke_handler` 注册的**自定命令默认全窗口放行**，
//! capability 只约束 core/plugin 命令。本模块补上自定命令的
//! **deny-by-default 网关**：`ext-` 前缀窗口只能调用注册表内的命令，
//! 其余窗口（main / splashscreen）行为不变。
//!
//! 注册表语义：**允许暴露给 extension 空间的命令全集**。单个插件的
//! `manifest.acl.commands` 必须是本表的子集（见 [manifest]）。

use tauri::{ipc::Invoke, Manager, Runtime};

/// extension 窗口 label 前缀（`ext-<id>`）。
pub const EXT_WINDOW_PREFIX: &str = "ext-";

/// 允许暴露给 extension 空间的命令全集（deny-by-default）。
///
/// 新增条目时必须同步：
/// 1. 命令实现本身已存在于 `invoke_handler`；
/// 2. 该命令对插件场景是安全的（无凭据读写、无跨账号、无系统级破坏面）；
/// 3. `docs/extension-workflow.md` 的能力面章节。
pub const EXTENSION_ALLOWED_COMMANDS: &[&str] = &[
    // extension host 自身
    "ext_poc_report",
    "ext_list_installed",
    "ext_open",
    "ext_set_enabled",
    "ext_uninstall",
    "ext_data_dir",
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
];

/// 命令是否在 extension 允许清单内。
pub fn is_command_allowed(command: &str) -> bool {
    EXTENSION_ALLOWED_COMMANDS.contains(&command)
}

/// 窗口是否属于 extension 空间。
pub fn is_extension_window(label: &str) -> bool {
    label.starts_with(EXT_WINDOW_PREFIX)
}

/// IPC 网关：包装 `generate_handler` 生成的核心 handler。
///
/// - 非 extension 窗口：原样转发，行为与 P1 之前完全一致；
/// - extension 窗口：命令在注册表内才转发，否则以 IPC 错误响应拒绝
///   （deny-by-default，拒绝信息进入插件页 console）并记 `acl_deny` 审计。
pub fn guarded<R: Runtime>(invoke: Invoke<R>, inner: impl FnOnce(Invoke<R>) -> bool) -> bool {
    let label = invoke.message.webview().label().to_string();
    if !is_extension_window(&label) {
        return inner(invoke);
    }
    let command = invoke.message.command().to_string();
    if is_command_allowed(&command) {
        inner(invoke)
    } else {
        // P3.3：越权命令记审计（best-effort，拒绝本身不受影响）。
        let webview = invoke.message.webview();
        let app = webview.app_handle();
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
    fn photo_triage_commands_all_allowed() {
        for command in [
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
        ] {
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
        ] {
            assert!(is_command_allowed(command));
        }
    }

    #[test]
    fn unknown_command_denied() {
        assert!(!is_command_allowed("totally_unknown_command"));
    }
}
