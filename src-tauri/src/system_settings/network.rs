use super::helpers::*;
use crate::error::{AppError, AppResult};

fn validate_host(host: &str) -> AppResult<()> {
    if host.is_empty() {
        return Err(AppError::invalid_input("Host cannot be empty"));
    }
    if host.starts_with('-') {
        return Err(AppError::invalid_input(
            "Invalid host: must not start with '-'",
        ));
    }
    let forbidden = [
        ';', '|', '&', '$', '`', '(', ')', '<', '>', '\n', '\r', '"', '\'', '\\', ' ',
    ];
    if host.chars().any(|c| forbidden.contains(&c)) {
        return Err(AppError::invalid_input(
            "Invalid host: contains forbidden characters",
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn set_network_firewall_state(enable: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if enable { "on" } else { "off" };
        sudo_cmd(&format!(
            "/usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate {}",
            val
        ))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_network_firewall_state: {e}")))?
}

#[tauri::command]
pub async fn set_network_ssh_state(enable: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if enable { "on" } else { "off" };
        sudo_cmd(&format!("systemsetup -setremotelogin {}", val))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_network_ssh_state: {e}")))?
}

#[tauri::command]
pub async fn set_network_screen_sharing_state(enable: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        if enable {
            sudo_cmd(
                "launchctl load -w /System/Library/LaunchDaemons/com.apple.screensharing.plist",
            )?;
        } else {
            sudo_cmd(
                "launchctl unload -w /System/Library/LaunchDaemons/com.apple.screensharing.plist",
            )?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_network_screen_sharing_state: {e}")))?
}

#[tauri::command]
pub async fn set_network_airdrop_disabled(disable: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if disable { "true" } else { "false" };
        defaults_write("com.apple.NetworkBrowser", "DisableAirDrop", val)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_network_airdrop_disabled: {e}")))?
}

#[tauri::command]
pub async fn ping_host(host: String, count: u32) -> AppResult<super::types::PingResult> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_host(&host)?;
        let output = run_cmd("ping", &["-c", &count.to_string(), &host])?;
        let mut result = super::types::PingResult {
            host: host.clone(),
            packets_sent: count,
            packets_received: 0,
            min_rtt: 0.0,
            avg_rtt: 0.0,
            max_rtt: 0.0,
            loss_percent: 100.0,
        };
        for line in output.lines() {
            if line.contains("packets received") {
                if let Some(n) = line.split_whitespace().next() {
                    result.packets_received = n.parse().unwrap_or(0);
                }
            }
            if line.contains("min/avg/max") {
                let parts: Vec<&str> = line
                    .split('=')
                    .next_back()
                    .unwrap_or("")
                    .split('/')
                    .collect();
                if parts.len() >= 3 {
                    result.min_rtt = parts[0].trim().parse().unwrap_or(0.0);
                    result.avg_rtt = parts[1].trim().parse().unwrap_or(0.0);
                    result.max_rtt = parts[2].trim().parse().unwrap_or(0.0);
                }
            }
        }
        if result.packets_sent > 0 {
            result.loss_percent =
                100.0 * (1.0 - result.packets_received as f64 / result.packets_sent as f64);
        }
        Ok(result)
    })
    .await
    .map_err(|e| AppError::internal(format!("ping_host: {e}")))?
}

#[tauri::command]
pub async fn port_check(host: String, port: u16) -> AppResult<super::types::PortCheckResult> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_host(&host)?;
        let output = std::process::Command::new("nc")
            .args(["-z", "-w", "3", &host, &port.to_string()])
            .output()
            .map_err(|e| AppError::internal(format!("nc: {e}")))?;
        Ok(super::types::PortCheckResult {
            host,
            port,
            open: output.status.success(),
            error: if output.status.success() {
                None
            } else {
                Some("Connection refused or timed out".to_string())
            },
        })
    })
    .await
    .map_err(|e| AppError::internal(format!("port_check: {e}")))?
}

#[tauri::command]
pub async fn get_local_ip() -> AppResult<super::types::IpInfo> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "macos")]
        {
            let local = run_cmd("ipconfig", &["getifaddr", "en0"]).unwrap_or_default();
            Ok(super::types::IpInfo {
                local_ip: local,
                external_ip: None,
            })
        }
        #[cfg(not(target_os = "macos"))]
        {
            Err(AppError::unsupported("Not supported on this platform"))
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("get_local_ip: {e}")))?
}

#[tauri::command]
pub async fn get_wifi_info() -> AppResult<super::types::WifiInfo> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "macos")]
        {
            let airport = "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport";
            let output = run_cmd(airport, &["-I"])?;
            let mut info = super::types::WifiInfo {
                ssid: String::new(), signal_strength: None, channel: None, frequency: None, security: None,
            };
            for line in output.lines() {
                let parts: Vec<&str> = line.splitn(2, ':').collect();
                if parts.len() != 2 { continue; }
                let key = parts[0].trim();
                let val = parts[1].trim();
                match key {
                    " SSID" => info.ssid = val.to_string(),
                    " agrCtlRSSI" => info.signal_strength = val.parse().ok(),
                    " channel" => info.channel = Some(val.to_string()),
                    _ => {}
                }
            }
            Ok(info)
        }
        #[cfg(not(target_os = "macos"))]
        {
            Err(AppError::unsupported("WiFi info is only supported on macOS"))
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("get_wifi_info: {e}")))?
}
