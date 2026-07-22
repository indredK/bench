use super::types::TcpConnectResult;
use super::validate::validate_host;
use crate::error::{AppError, AppResult};
use std::net::ToSocketAddrs;
use std::time::{Duration, Instant};
use tokio::net::TcpStream;
use tokio::time::timeout;

const MAX_TIMEOUT_MS: u64 = 30_000;
const DEFAULT_TIMEOUT_MS: u64 = 3_000;

pub async fn tcp_connect(
    host: String,
    port: u16,
    timeout_ms: Option<u64>,
) -> AppResult<TcpConnectResult> {
    validate_host(&host)?;
    if port == 0 {
        return Err(AppError::invalid_input("Port must be 1..=65535"));
    }
    let timeout_ms = timeout_ms
        .unwrap_or(DEFAULT_TIMEOUT_MS)
        .clamp(100, MAX_TIMEOUT_MS);
    let command_hint = format!("tcpConnect(local, '{host}', {port}, {timeout_ms})");

    let addr_str = format!("{host}:{port}");
    let addrs = match tokio::task::spawn_blocking({
        let addr_str = addr_str.clone();
        move || {
            addr_str
                .to_socket_addrs()
                .map(|iter| iter.collect::<Vec<_>>())
        }
    })
    .await
    {
        Ok(Ok(addrs)) if !addrs.is_empty() => addrs,
        Ok(Ok(_)) => {
            return Ok(TcpConnectResult {
                host,
                port,
                status: "dns_failed".into(),
                rtt_ms: None,
                message: Some("No addresses resolved".into()),
                command_hint,
            });
        }
        Ok(Err(e)) => {
            return Ok(TcpConnectResult {
                host,
                port,
                status: "dns_failed".into(),
                rtt_ms: None,
                message: Some(e.to_string()),
                command_hint,
            });
        }
        Err(e) => {
            return Err(AppError::task_failed(format!("dns resolve: {e}")));
        }
    };

    let started = Instant::now();
    let connect = timeout(
        Duration::from_millis(timeout_ms),
        TcpStream::connect(addrs[0]),
    )
    .await;
    match connect {
        Ok(Ok(_stream)) => Ok(TcpConnectResult {
            host,
            port,
            status: "ok".into(),
            rtt_ms: Some(started.elapsed().as_secs_f64() * 1000.0),
            message: None,
            command_hint,
        }),
        Ok(Err(e)) => {
            let status = match e.kind() {
                std::io::ErrorKind::ConnectionRefused => "refused",
                std::io::ErrorKind::NetworkUnreachable
                | std::io::ErrorKind::HostUnreachable
                | std::io::ErrorKind::AddrNotAvailable => "unreachable",
                _ => "error",
            };
            Ok(TcpConnectResult {
                host,
                port,
                status: status.into(),
                rtt_ms: None,
                message: Some(e.to_string()),
                command_hint,
            })
        }
        Err(_) => Ok(TcpConnectResult {
            host,
            port,
            status: "timeout".into(),
            rtt_ms: None,
            message: Some(format!("Timed out after {timeout_ms}ms")),
            command_hint,
        }),
    }
}
