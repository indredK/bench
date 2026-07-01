//! Shared application error / 统一错误类型
//!
//! 所有 Tauri 命令的错误都应收敛到 [`AppError`]，序列化为
//! `{ "code": "SCREAMING_SNAKE_CASE", "message": "human readable" }`。
//! 前端通过 `src/lib/tauri/errors.ts` 的 `parseCommandError` 统一解析，
//! 用 `code` 做机器判断、`message` 做兜底展示。
//!
//! 现有的领域错误枚举（如 `TokenCalculatorError`、`TerminologyError`、
//! `ApiBillingError`）已经采用 `#[serde(tag = "code")]` 输出同构的
//! `{ code, message }`，因此与本类型在前端侧完全兼容，可按模块逐步迁移。

use std::fmt;

use serde::Serialize;

/// 统一错误：`code` 供前端机器判断，`message` 供人类阅读。
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    /// 未预期的内部错误。
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("INTERNAL", message)
    }

    // 以下三个构造器属于共享错误词汇，供其它模块逐步迁移到 AppError 时使用，
    // 当前尚无内部调用方，先 allow(dead_code) 保留完整 API。
    /// 入参非法（校验失败）。
    #[allow(dead_code)]
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new("INVALID_INPUT", message)
    }

    /// 目标资源不存在。
    #[allow(dead_code)]
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new("NOT_FOUND", message)
    }

    /// 当前平台/环境不支持该操作。
    #[allow(dead_code)]
    pub fn unsupported(message: impl Into<String>) -> Self {
        Self::new("UNSUPPORTED", message)
    }

    /// IO / 文件系统错误。
    pub fn io(message: impl Into<String>) -> Self {
        Self::new("IO_ERROR", message)
    }

    /// 路径越过沙箱允许范围。
    pub fn forbidden_path(message: impl Into<String>) -> Self {
        Self::new("FORBIDDEN_PATH", message)
    }

    /// 后台阻塞任务失败（如 spawn_blocking JoinError）。
    pub fn task_failed(message: impl Into<String>) -> Self {
        Self::new("TASK_FAILED", message)
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::io(e.to_string())
    }
}

impl From<String> for AppError {
    fn from(message: String) -> Self {
        Self::internal(message)
    }
}

impl From<&str> for AppError {
    fn from(message: &str) -> Self {
        Self::internal(message.to_string())
    }
}

/// 统一命令返回类型。
pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_to_code_and_message() {
        let err = AppError::invalid_input("bad path");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "INVALID_INPUT");
        assert_eq!(json["message"], "bad path");
    }

    #[test]
    fn from_io_error_maps_to_io_code() {
        let io = std::io::Error::new(std::io::ErrorKind::NotFound, "nope");
        let err: AppError = io.into();
        assert_eq!(err.code, "IO_ERROR");
    }

    #[test]
    fn display_includes_code() {
        let err = AppError::not_found("x");
        assert_eq!(err.to_string(), "[NOT_FOUND] x");
    }
}
