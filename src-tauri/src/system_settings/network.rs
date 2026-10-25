use super::helpers::*;
use crate::error::{AppError, AppResult};

fn parse_firewall_state(output: &str) -> Result<bool, String> {
    let normalized = output.to_ascii_lowercase();
    if normalized.contains("state = 1") || normalized.contains("state = 2") {
        Ok(true)
    } else if normalized.contains("state = 0") {
        Ok(false)
    } else {
        Err("unrecognized firewall state".to_string())
    }
}

fn parse_remote_login_state(output: &str) -> Result<bool, String> {
    let normalized = output.to_ascii_lowercase();
    if normalized.contains("remote login: on") {
        Ok(true)
    } else if normalized.contains("remote login: off") {
        Ok(false)
    } else {
        Err("remote login state requires administrator access".to_string())
    }
}

pub(crate) fn read_network_firewall_state() -> Result<bool, String> {
    run_cmd_err(
        "/usr/libexec/ApplicationFirewall/socketfilterfw",
        &["--getglobalstate"],
    )
    .and_then(|output| parse_firewall_state(&output))
}

#[cfg(target_os = "macos")]
pub(crate) fn read_network_ssh_state() -> Result<bool, String> {
    run_cmd_err("systemsetup", &["-getremotelogin"])
        .and_then(|output| parse_remote_login_state(&output))
}

pub(crate) fn read_network_screen_sharing_state() -> Result<bool, String> {
    match run_cmd_err("launchctl", &["print", "system/com.apple.screensharing"]) {
        Ok(_) => Ok(true),
        Err(error) if error.contains("Could not find service") || error.contains("Bad request") => {
            Ok(false)
        }
        Err(error) => Err(error),
    }
}

pub(crate) fn read_network_airdrop_disabled() -> Result<bool, String> {
    defaults_read_bool_or("com.apple.NetworkBrowser", "DisableAirDrop", false)
}

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
        verify_setting(&enable, read_network_firewall_state)
            .map_err(|error| setting_verification_error("network.firewall", error))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_network_firewall_state: {e}")))?
}

#[tauri::command]
pub async fn set_network_ssh_state(enable: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if enable { "on" } else { "off" };
        let output = sudo_cmd(&format!(
            "systemsetup -setremotelogin {val} && systemsetup -getremotelogin"
        ))?;
        let actual = parse_remote_login_state(&output)
            .map_err(|error| setting_verification_error("network.ssh", error))?;
        if actual != enable {
            return Err(setting_verification_error(
                "network.ssh",
                "read-after-write mismatch",
            ));
        }
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
        verify_setting(&enable, read_network_screen_sharing_state)
            .map_err(|error| setting_verification_error("network.screen_sharing", error))?;
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
        verify_setting(&disable, read_network_airdrop_disabled)
            .map_err(|error| setting_verification_error("network.airdrop_disabled", error))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_network_airdrop_disabled: {e}")))?
}

#[cfg(test)]
mod settings_tests {
    use super::*;

    #[test]
    fn parses_firewall_state_without_localized_labels() {
        assert!(parse_firewall_state("Firewall is enabled. (State = 1)").unwrap());
        assert!(!parse_firewall_state("Firewall is disabled. (State = 0)").unwrap());
        assert!(parse_firewall_state("unknown").is_err());
    }

    #[test]
    fn rejects_unreadable_remote_login_state() {
        assert!(parse_remote_login_state("Remote Login: On").unwrap());
        assert!(!parse_remote_login_state("Remote Login: Off").unwrap());
        assert!(parse_remote_login_state("administrator access required").is_err());
    }
}

#[tauri::command]
pub async fn ping_host(host: String, count: u32) -> AppResult<super::types::PingResult> {
    // Thin wrap → network-probe SSoT (design §13). Keep legacy PingResult shape.
    let count = count.clamp(1, 20);
    let r = crate::net_probe::ping::ping_host(host, Some(count), Some(1_000)).await?;
    Ok(super::types::PingResult {
        host: r.target,
        packets_sent: r.packets_sent,
        packets_received: r.packets_received,
        min_rtt: r.min_rtt_ms.unwrap_or(0.0),
        avg_rtt: r.avg_rtt_ms.unwrap_or(0.0),
        max_rtt: r.max_rtt_ms.unwrap_or(0.0),
        loss_percent: r.loss_percent,
    })
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
    tauri::async_runtime::spawn_blocking(read_wifi_info)
        .await
        .map_err(|e| AppError::internal(format!("get_wifi_info: {e}")))?
}

/// Read the current Wi-Fi interface once for both the system-tools command and
/// network-probe summary. Missing SSID is normal when disconnected or when
/// macOS privacy authorization is unavailable, so it is represented as empty.
pub(crate) fn read_wifi_info() -> AppResult<super::types::WifiInfo> {
    #[cfg(target_os = "macos")]
    {
        use objc2_core_wlan::CWWiFiClient;

        let client = unsafe {
            // SAFETY: CoreWLAN provides a process-wide shared client; the returned
            // Objective-C objects stay on this blocking worker thread.
            CWWiFiClient::sharedWiFiClient()
        };
        let Some(interface) = (unsafe {
            // SAFETY: querying the default interface is a read-only CoreWLAN call.
            client.interface()
        }) else {
            return Ok(empty_wifi_info());
        };

        let ssid = unsafe {
            // SAFETY: the borrowed NSString is retained by the returned wrapper.
            interface.ssid()
        }
        .map(|value| value.to_string())
        .unwrap_or_default();
        let rssi = unsafe {
            // SAFETY: read-only query; CoreWLAN reports 0 when disconnected/unavailable.
            interface.rssiValue()
        } as i32;
        let channel = unsafe {
            // SAFETY: read-only query; None is returned when no current channel exists.
            interface.wlanChannel()
        }
        .and_then(|channel| {
            let number = unsafe {
                // SAFETY: channel is a retained CoreWLAN value returned by this interface.
                channel.channelNumber()
            };
            (number > 0).then(|| number.to_string())
        });

        Ok(super::types::WifiInfo {
            ssid,
            signal_strength: (rssi < 0).then_some(rssi),
            channel,
            frequency: None,
            security: None,
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(AppError::unsupported(
            "WiFi info is only supported on macOS",
        ))
    }
}

#[cfg(target_os = "macos")]
fn empty_wifi_info() -> super::types::WifiInfo {
    super::types::WifiInfo {
        ssid: String::new(),
        signal_strength: None,
        channel: None,
        frequency: None,
        security: None,
    }
}
