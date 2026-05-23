pub mod commands;
pub mod domain;
pub mod installer;
pub mod linux;
pub mod macos;
pub mod operations;
pub mod sources;
pub mod state;
pub mod types;
pub mod utils;
pub mod windows;

pub use domain::{
    build_app_info, build_scan_result, empty_scan_result, platform_capabilities,
    resolve_linux_source, resolve_macos_source, resolve_windows_source, AppInfoInput,
};
pub use operations::{
    locked_operation_result, operation_result, record_operation_result,
    record_operation_result_with_error_code,
};
pub use state::AppManagerState;
pub use types::{AppInfo, InstallSource, OperationResult, ScanResult, SourceType};
#[allow(unused_imports)]
pub use types::{UpdateInfo, UpdateSource};
pub use utils::{deduplicate, get_last_modified, make_app_id};
