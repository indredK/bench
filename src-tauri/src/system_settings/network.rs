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
pub async fn get_network_firewall_state() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = run_cmd(
            "/usr/libexec/ApplicationFirewall/socketfilterfw",
            &["--getglobalstate"],
        )?;
        Ok(output.contains("enabled"))
    })
    .await
    .map_err(|e| e.to_string())?
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
pub async fn get_network_ssh_state() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = sudo_cmd("systemsetup -getremotelogin")?;
        Ok(output.contains("On"))
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
pub async fn get_network_screen_sharing_state() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        // Method 1: Check if the plist file exists (most reliable)
        let plist_path = "/System/Library/LaunchDaemons/com.apple.screensharing.plist";
        if !std::path::Path::new(plist_path).exists() {
            return Ok(false);
        }

        // Method 2: Check via launchctl print (more accurate than launchctl list)
        let output = std::process::Command::new("launchctl")
            .args(["print", "system/com.apple.screensharing"])
            .output();
        match output {
            Ok(o) => {
                let stdout = String::from_utf8_lossy(&o.stdout);
                // If the service is loaded, it will contain "state" info
                // If not loaded, it will say "Could not find service"
                if o.status.success() && !stdout.contains("Could not find") {
                    return Ok(true);
                }
                // Fallback: check if the service is disabled via launchctl list
                let list_output = std::process::Command::new("launchctl")
                    .args(["list", "com.apple.screensharing"])
                    .output();
                if let Ok(lo) = list_output {
                    let list_stdout = String::from_utf8_lossy(&lo.stdout);
                    return Ok(!list_stdout.is_empty() && !list_stdout.contains("Could not find"));
                }
                Ok(false)
            }
            Err(_) => Ok(false),
        }
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
pub async fn get_network_airdrop_disabled() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(defaults_read_bool("com.apple.NetworkBrowser", "DisableAirDrop")))
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
pub async fn dns_lookup(domain: String, record_type: String) -> Result<Vec<super::types::DnsRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_host(&domain)?;
        validate_host(&record_type)?;
        let output = run_cmd("dig", &[&domain, &record_type, "+short"])?;
        Ok(output.lines().filter(|l| !l.is_empty()).map(|l| super::types::DnsRecord {
            record_type: record_type.clone(),
            value: l.trim().to_string(),
        }).collect())
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
pub async fn traceroute_host(host: String) -> Result<Vec<super::types::TracerouteHop>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_host(&host)?;
        let output = run_cmd("traceroute", &["-m", "15", &host])?;
        let mut hops = Vec::new();
        for line in output.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 { continue; }
            let hop_num: u32 = parts[0].parse().unwrap_or(0);
            let hostname = if parts[1] == "*" { None } else { Some(parts[1].to_string()) };
            let rtt: Vec<f64> = parts[2..].iter().filter_map(|p| p.trim_end_matches("ms").parse().ok()).collect();
            hops.push(super::types::TracerouteHop { hop: hop_num, host: hostname, rtt });
        }
        Ok(hops)
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
