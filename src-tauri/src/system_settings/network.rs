use super::helpers::*;

/// 校验主机名/IP (规范 A-1:防止 flag 注入)
/// 拒绝以 `-` 开头的输入 (会被 ping/dig/nc/traceroute 解释为选项)
/// 拒绝含 shell 元字符或空白的输入
fn validate_host(host: &str) -> Result<(), String> {
    if host.is_empty() {
        return Err("Host cannot be empty".to_string());
    }
    if host.starts_with('-') {
        return Err("Invalid host: must not start with '-'".to_string());
    }
    let forbidden = [';', '|', '&', '$', '`', '(', ')', '<', '>', '\n', '\r', '"', '\'', '\\', ' '];
    if host.chars().any(|c| forbidden.contains(&c)) {
        return Err("Invalid host: contains forbidden characters".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn set_network_firewall_state(enable: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if enable { "on" } else { "off" };
        sudo_cmd(&format!(
            "/usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate {}",
            val
        ))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_network_ssh_state(enable: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if enable { "on" } else { "off" };
        sudo_cmd(&format!("systemsetup -setremotelogin {}", val))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_network_screen_sharing_state(enable: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if enable {
            sudo_cmd("launchctl load -w /System/Library/LaunchDaemons/com.apple.screensharing.plist")?;
        } else {
            sudo_cmd("launchctl unload -w /System/Library/LaunchDaemons/com.apple.screensharing.plist")?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_network_airdrop_disabled(disable: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if disable { "true" } else { "false" };
        defaults_write("com.apple.NetworkBrowser", "DisableAirDrop", val)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ping_host(host: String, count: u32) -> Result<super::types::PingResult, String> {
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
                let parts: Vec<&str> = line.split('=').next_back().unwrap_or("").split('/').collect();
                if parts.len() >= 3 {
                    result.min_rtt = parts[0].trim().parse().unwrap_or(0.0);
                    result.avg_rtt = parts[1].trim().parse().unwrap_or(0.0);
                    result.max_rtt = parts[2].trim().parse().unwrap_or(0.0);
                }
            }
        }
        if result.packets_sent > 0 {
            result.loss_percent = 100.0 * (1.0 - result.packets_received as f64 / result.packets_sent as f64);
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn port_check(host: String, port: u16) -> Result<super::types::PortCheckResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_host(&host)?;
        let output = std::process::Command::new("nc")
            .args(["-z", "-w", "3", &host, &port.to_string()])
            .output()
            .map_err(|e| format!("nc: {}", e))?;
        Ok(super::types::PortCheckResult {
            host,
            port,
            open: output.status.success(),
            error: if output.status.success() { None } else { Some("Connection refused or timed out".to_string()) },
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_local_ip() -> Result<super::types::IpInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "macos")]
        {
            let local = run_cmd("ipconfig", &["getifaddr", "en0"]).unwrap_or_default();
            // 规范 P-1/P-2:禁止主动外发用户数据。
            // 旧实现调用 `curl ifconfig.me` 获取公网 IP,会将用户 IP 泄露给第三方服务。
            // 现改为仅返回本地 IP,external_ip 留空;如需公网 IP 应由前端显式触发并经用户确认。
            Ok(super::types::IpInfo { local_ip: local, external_ip: None })
        }
        #[cfg(not(target_os = "macos"))]
        {
            Err("Not supported on this platform".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_wifi_info() -> Result<super::types::WifiInfo, String> {
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
            Err("WiFi info is only supported on macOS".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
