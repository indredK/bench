pub mod commands;
pub mod linux;
pub mod macos;
pub mod state;
pub mod types;
pub mod utils;
pub mod windows;

pub use state::{record_operation, AppManagerState};
pub use types::{
    AllowedActions, AppInfo, InstallSource, OperationRecord, OperationResult, PlatformCapabilities,
    ScanResult, SourceType,
};
pub use utils::{deduplicate, get_last_modified, make_app_id, name_match_confidence};
