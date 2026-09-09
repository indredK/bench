//! Chrome/Edge/Firefox Native Messaging transport。
//!
//! 协议：每条消息 = 4 字节本机序 uint32 长度前缀 + UTF-8 JSON。
//! 浏览器 → host 单条上限（64 MiB，防御性收紧到 16 MiB）；
//! host → 浏览器单条上限 **1 MiB**（Chrome 硬约束），超限直接报错并提示
//! 改走 serve 模式（见实施手册 §3.2）。
//!
//! 消息信封：`{ "id": <调用方回执用>, "cmd": "<dispatcher 命令>", "params": {...} }`
//! 响应：`{ "id": ..., "ok": true, "data": ... }` 或 `{ "id": ..., "ok": false, "error": "..." }`

use std::io::{Read, Write};

use serde_json::{json, Value};

use crate::dispatcher;
use crate::HostConfig;

/// 浏览器 → host 的防御性上限（协议上限 64 MiB）。
const MAX_INCOMING_BYTES: usize = 16 * 1024 * 1024;
/// host → 浏览器的硬上限（Chrome Native Messaging 约束）。
const MAX_OUTGOING_BYTES: usize = 1024 * 1024;

pub fn run(config: HostConfig) -> Result<(), String> {
    let mut stdin = std::io::stdin().lock();
    let mut stdout = std::io::stdout().lock();
    loop {
        let Some(message) = read_message(&mut stdin)? else {
            return Ok(()); // EOF：浏览器断开端口，正常退出
        };
        let id = message.get("id").cloned().unwrap_or(Value::Null);
        let command = message.get("cmd").and_then(Value::as_str).unwrap_or("");
        let params = message.get("params").cloned().unwrap_or(json!({}));

        let response = if command.is_empty() {
            json!({ "id": id, "ok": false, "error": "INVALID_MESSAGE: missing cmd" })
        } else {
            match dispatcher::invoke(&config, command, &params) {
                Ok(data) => json!({ "id": id, "ok": true, "data": data }),
                Err(error) => json!({ "id": id, "ok": false, "error": error }),
            }
        };
        write_message(&mut stdout, &response)?;
    }
}

/// 读一条消息；EOF 返回 `None`。
fn read_message<R: Read>(reader: &mut R) -> Result<Option<Value>, String> {
    let mut len_buf = [0u8; 4];
    let mut read_total = 0;
    while read_total < 4 {
        let n = reader
            .read(&mut len_buf[read_total..])
            .map_err(|e| format!("stdin read failed: {e}"))?;
        if n == 0 {
            if read_total == 0 {
                return Ok(None);
            }
            return Err("stdin closed mid-frame".into());
        }
        read_total += n;
    }
    let len = u32::from_ne_bytes(len_buf) as usize;
    if len > MAX_INCOMING_BYTES {
        return Err(format!("message too large: {len} bytes"));
    }
    let mut body = vec![0u8; len];
    reader
        .read_exact(&mut body)
        .map_err(|e| format!("stdin body read failed: {e}"))?;
    Ok(Some(
        serde_json::from_slice(&body).map_err(|e| format!("message parse failed: {e}"))?,
    ))
}

fn write_message<W: Write>(writer: &mut W, value: &Value) -> Result<(), String> {
    let body = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    if body.len() > MAX_OUTGOING_BYTES {
        return Err(format!(
            "response exceeds 1MB Native Messaging limit ({} bytes); shrink payload or use serve mode",
            body.len()
        ));
    }
    writer
        .write_all(&(body.len() as u32).to_ne_bytes())
        .and_then(|_| writer.write_all(&body))
        .and_then(|_| writer.flush())
        .map_err(|e| format!("stdout write failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_roundtrip() {
        let value = json!({ "id": 1, "ok": true, "data": { "pong": true } });
        let mut buf = Vec::new();
        write_message(&mut buf, &value).unwrap();
        assert_eq!(buf[0..4].len(), 4);
        let len = u32::from_ne_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
        assert_eq!(len, buf.len() - 4);
        let mut cursor = std::io::Cursor::new(buf);
        let back = read_message(&mut cursor).unwrap().unwrap();
        assert_eq!(back, value);
    }

    #[test]
    fn oversized_response_is_rejected() {
        let big = json!({ "blob": "x".repeat(MAX_OUTGOING_BYTES + 1) });
        let mut buf = Vec::new();
        assert!(write_message(&mut buf, &big).is_err());
    }
}
