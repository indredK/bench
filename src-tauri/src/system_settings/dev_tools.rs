use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn json_format(input: String, indent: bool) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let parsed: serde_json::Value = serde_json::from_str(&input)
            .map_err(|e| AppError::invalid_input(format!("Invalid JSON: {e}")))?;
        if indent {
            serde_json::to_string_pretty(&parsed)
                .map_err(|e| AppError::internal(format!("serde: {e}")))
        } else {
            serde_json::to_string(&parsed).map_err(|e| AppError::internal(format!("serde: {e}")))
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("json_format: {e}")))?
}

#[tauri::command]
pub async fn base64_encode(input: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(input.as_bytes()))
    })
    .await
    .map_err(|e| AppError::internal(format!("base64_encode: {e}")))?
}

#[tauri::command]
pub async fn base64_decode(input: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(input.trim())
            .map_err(|e| AppError::invalid_input(format!("Invalid base64: {e}")))?;
        String::from_utf8(bytes).map_err(|e| AppError::invalid_input(format!("Invalid UTF-8: {e}")))
    })
    .await
    .map_err(|e| AppError::internal(format!("base64_decode: {e}")))?
}

#[tauri::command]
pub async fn generate_uuid() -> AppResult<String> {
    Ok(uuid::Uuid::new_v4().to_string())
}

#[tauri::command]
pub async fn calculate_hash(input: String, algorithm: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        use sha2::{Digest, Sha256, Sha384, Sha512};
        let hex = |bytes: &[u8]| {
            bytes
                .iter()
                .map(|b| format!("{:02x}", b))
                .collect::<String>()
        };
        match algorithm.to_lowercase().as_str() {
            "md5" => {
                let result = md5::compute(input.as_bytes());
                Ok(format!("{:x}", result))
            }
            "sha1" => {
                use sha1::Digest;
                let mut hasher = sha1::Sha1::new();
                hasher.update(input.as_bytes());
                Ok(hex(&hasher.finalize()))
            }
            "sha256" | "sha2" => {
                let mut hasher = Sha256::new();
                hasher.update(input.as_bytes());
                Ok(hex(&hasher.finalize()))
            }
            "sha384" => {
                let mut hasher = Sha384::new();
                hasher.update(input.as_bytes());
                Ok(hex(&hasher.finalize()))
            }
            "sha512" => {
                let mut hasher = Sha512::new();
                hasher.update(input.as_bytes());
                Ok(hex(&hasher.finalize()))
            }
            _ => Err(AppError::invalid_input(format!(
                "Unsupported algorithm: {algorithm}"
            ))),
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("calculate_hash: {e}")))?
}

#[tauri::command]
pub async fn timestamp_convert(ts: i64, format: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dt = chrono::DateTime::from_timestamp(ts, 0)
            .ok_or_else(|| AppError::invalid_input("Invalid timestamp"))?;
        let naive = dt.naive_utc();
        let formatted = match format.as_str() {
            "iso" | "iso8601" => naive.format("%Y-%m-%dT%H:%M:%S").to_string(),
            "date" => naive.format("%Y-%m-%d").to_string(),
            "time" => naive.format("%H:%M:%S").to_string(),
            "datetime" | "full" => naive.format("%Y-%m-%d %H:%M:%S").to_string(),
            "unix" => ts.to_string(),
            _ => naive.format("%Y-%m-%d %H:%M:%S").to_string(),
        };
        Ok(formatted)
    })
    .await
    .map_err(|e| AppError::internal(format!("timestamp_convert: {e}")))?
}
