//! 统一错误：`code` 供机器判断（SCREAMING_SNAKE_CASE），`message` 供人类阅读。
//!
//! serde 形状与主应用 `AppError` 一致（`{ "code": "...", "message": "..." }`），
//! 因此前端 `parseCommandError` 无需感知差异。

use std::fmt;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CapError {
    pub code: String,
    pub message: String,
}

impl CapError {
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

    /// 入参非法（校验失败）。
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new("INVALID_INPUT", message)
    }

    /// 目标资源不存在。
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new("NOT_FOUND", message)
    }

    /// 当前平台/环境不支持该操作。
    pub fn unsupported(message: impl Into<String>) -> Self {
        Self::new("UNSUPPORTED", message)
    }

    /// 路径不在白名单内（协议层的强制安全边界）。
    pub fn path_not_allowed(message: impl Into<String>) -> Self {
        Self::new("PATH_NOT_ALLOWED", message)
    }
}

impl fmt::Display for CapError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for CapError {}

impl From<std::io::Error> for CapError {
    fn from(e: std::io::Error) -> Self {
        CapError::internal(format!("IO: {e}"))
    }
}

pub type CapResult<T> = Result<T, CapError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_shape_matches_app_error() {
        let e = CapError::invalid_input("bad path");
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json["code"], "INVALID_INPUT");
        assert_eq!(json["message"], "bad path");
    }
}
