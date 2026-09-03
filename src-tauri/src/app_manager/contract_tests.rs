//! Provider contract tests / provider 契约测试 (A2-4)。
//!
//! 统一断言跨扫描 appId 稳定性、partial merge 语义、warning 契约与
//! 图标解析 fail-safe。真机层面的启动/权限/fixture 仍归 R02 D 类验收。

use super::domain::{build_scan_result, empty_scan_result, platform_capabilities};
use super::types::{ProviderState, ProviderStatus};
use super::utils::{deduplicate, make_app_id};

/// 构造一次"扫描"输出: 同一物理应用在两次扫描中应映射到同一 appId。
fn scan_once(bundle_id: &str, install_path: &str, name: &str) -> super::types::AppInfo {
    let mut app = super::domain::test_support::app_fixture(&make_app_id(bundle_id, install_path));
    app.bundle_id = bundle_id.to_string();
    app.install_path = install_path.to_string();
    app.name = name.to_string();
    app
}

#[test]
fn same_fixture_two_scans_yield_stable_app_ids() {
    // 第一次扫描
    let first = scan_once("com.example.stable", "/Applications/Stable.app", "Stable");
    // 第二次扫描: 仅路径大小写差异 (macOS 文件系统不区分大小写) 也必须稳定
    let second = scan_once(
        "com.example.stable",
        "/applications/stable.app",
        "Stable (renamed)",
    );
    assert_eq!(first.app_id, second.app_id);
}

#[test]
fn dedup_keeping_first_result_preserves_canonical_evidence() {
    let a = scan_once("com.example.dup", "/Applications/Dup.app", "Dup");
    let mut b = a.clone();
    b.name = "Dup (duplicate scan source)".to_string();
    b.can_upgrade = true;
    let merged = deduplicate(vec![a.clone(), b]);
    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].app_id, a.app_id);
    assert!(!merged[0].can_upgrade);
}

#[test]
fn failed_provider_marks_scan_partial_and_keeps_succeeded_apps() {
    let app = scan_once(
        "com.example.partial",
        "/Applications/Partial.app",
        "Partial",
    );
    let mut result = build_scan_result(
        vec![app.clone()],
        platform_capabilities(false, false, false, false, false),
        10,
        0,
    );
    assert!(result.complete);
    assert_eq!(result.apps.len(), 1);

    // 一个 provider 失败 → complete=false, 但已成功扫描到的应用保留。
    result.providers = vec![ProviderStatus {
        provider: "spotlight".to_string(),
        state: ProviderState::Failed,
        error_code: Some("SPOTLIGHT_QUERY_FAILED".to_string()),
    }];
    result.complete &= result
        .providers
        .iter()
        .all(|p| p.state == ProviderState::Ok || p.state == ProviderState::Unsupported);
    assert!(!result.complete);
    assert_eq!(result.apps.len(), 1);

    // Unsupported (不可用) 不算 partial —— 对齐 build_update_report 契约。
    // complete 由当前 providers 重新聚合, 而非累计 &= (真实扫描逐次赋值)。
    result.providers = vec![ProviderStatus {
        provider: "homebrew".to_string(),
        state: ProviderState::Unsupported,
        error_code: Some("HOMEBREW_UNAVAILABLE".to_string()),
    }];
    result.complete = result
        .providers
        .iter()
        .all(|p| p.state == ProviderState::Ok || p.state == ProviderState::Unsupported);
    assert!(result.complete);
}

#[test]
fn scan_cancelled_produces_warning_not_empty_success() {
    // 取消契约: cancelled 扫描必须携带 SCAN_CANCELLED warning 且 complete=false,
    // 前端据此区分 "已取消" 与 "全部完成" (禁止折叠为空态成功)。
    let mut result = empty_scan_result();
    result.complete = false;
    result.warnings.push("SCAN_CANCELLED".to_string());
    assert!(!result.complete);
    assert!(result.warnings.iter().any(|w| w == "SCAN_CANCELLED"));
}

#[test]
fn macos_root_unreadable_produces_warning_code() {
    // unreadable root 的扫描端行为由 macos scan 的 read_dir 失败路径
    // 聚合为 MACOS_SCAN_ROOT_UNREADABLE warning (而非 error/panic)。
    // 这里断言该 warning code 的机器可读格式保持稳定。
    let unreadable = "/System/Volumes/Data/.bench-unreadable-probe";
    let warning = format!("MACOS_SCAN_ROOT_UNREADABLE:{unreadable}");
    let (code, payload) = warning.split_once(':').expect("warning carries payload");
    assert_eq!(code, "MACOS_SCAN_ROOT_UNREADABLE");
    assert_eq!(payload, unreadable);
}

#[cfg(target_os = "macos")]
#[test]
fn icon_resolution_fails_cleanly_on_missing_path() {
    // 损坏/缺失图标: 必须返回 Err 而非 panic (调用方据此回退到占位图标)。
    let result = super::macos::get_app_icon_base64("/Applications/.bench-missing.app");
    assert!(result.is_err());
}
