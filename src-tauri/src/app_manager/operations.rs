use super::state::AppManagerState;
use super::types::OperationResult;

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

#[allow(clippy::too_many_arguments)]
pub fn record_operation_result(
    _state: &AppManagerState,
    action: &str,
    app_id: &str,
    app_name: &str,
    success: bool,
    output: &str,
    message: impl Into<String>,
    exit_code: Option<i32>,
) -> OperationResult {
    let _ = (action, app_id, app_name);
    let permission_issue = !success
        && (output.contains("permission denied")
            || output.contains("Permission denied")
            || output.contains("not permitted")
            || output.contains("root")
            || output.contains("sudo")
            || output.contains("administrator")
            || output.contains("Access is denied")
            || exit_code == Some(5));
    let error_code = if !success {
        if permission_issue {
            Some("PERMISSION_DENIED".into())
        } else if output.contains("not found") || output.contains("Not found") {
            Some("NOT_FOUND".into())
        } else if output.contains("locked") || output.contains("Lock") {
            Some("LOCKED".into())
        } else {
            Some("GENERIC_ERROR".into())
        }
    } else {
        None
    };

    let result = OperationResult {
        success,
        message: message.into(),
        exit_code,
        error_code,
        permission_issue,
    };
    result
}

#[allow(clippy::too_many_arguments)]
pub fn record_operation_result_with_error_code(
    _state: &AppManagerState,
    action: &str,
    app_id: &str,
    app_name: &str,
    success: bool,
    output: &str,
    message: impl Into<String>,
    exit_code: Option<i32>,
    failure_error_code: Option<&str>,
) -> OperationResult {
    let mut result = record_operation_result(
        _state,
        action,
        app_id,
        app_name,
        success,
        output,
        message,
        exit_code,
    );

    if !success {
        if let Some(error_code) = failure_error_code {
            result.error_code = Some(error_code.into());
        }
    }

    result
}
