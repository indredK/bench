use super::state::AppManagerState;
use super::types::{OperationRecord, OperationResult};

pub fn operation_result(
    success: bool,
    message: impl Into<String>,
    exit_code: Option<i32>,
    error_code: Option<String>,
    permission_issue: bool,
) -> OperationResult {
    OperationResult {
        success,
        message: message.into(),
        exit_code,
        error_code,
        permission_issue,
    }
}

pub fn locked_operation_result() -> OperationResult {
    operation_result(
        false,
        "This application is currently being modified. Please wait.",
        None,
        Some("LOCKED".into()),
        false,
    )
}

pub fn record_operation_result(
    state: &AppManagerState,
    action: &str,
    app_id: &str,
    app_name: &str,
    success: bool,
    output: &str,
    message: impl Into<String>,
    exit_code: Option<i32>,
) -> OperationResult {
    let record = OperationRecord::new(action, app_id, app_name, success, output, exit_code);
    let result = OperationResult {
        success,
        message: message.into(),
        exit_code,
        error_code: record.error_code.clone(),
        permission_issue: record.permission_issue,
    };
    state.record_operation(record);
    result
}

#[allow(clippy::too_many_arguments)]
pub fn record_operation_result_with_error_code(
    state: &AppManagerState,
    action: &str,
    app_id: &str,
    app_name: &str,
    success: bool,
    output: &str,
    message: impl Into<String>,
    exit_code: Option<i32>,
    failure_error_code: Option<&str>,
) -> OperationResult {
    let mut record = OperationRecord::new(action, app_id, app_name, success, output, exit_code);
    if !success {
        if let Some(error_code) = failure_error_code {
            record.error_code = Some(error_code.into());
        }
    }

    let result = OperationResult {
        success,
        message: message.into(),
        exit_code,
        error_code: record.error_code.clone(),
        permission_issue: record.permission_issue,
    };
    state.record_operation(record);
    result
}
