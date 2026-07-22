#[cfg(target_os = "macos")]
use super::defaults::builtin_defaults;
use super::types::FixResult;
use crate::error::{AppError, AppResult};
#[cfg(target_os = "macos")]
use std::net::IpAddr;
#[cfg(target_os = "macos")]
use std::process::Command;

/// List macOS Network Preferences service names (whitelist source).
pub fn list_network_services() -> AppResult<Vec<String>> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("networksetup")
            .args(["-listallnetworkservices"])
            .output()
            .map_err(|e| AppError::io(format!("networksetup: {e}")))?;
        if !output.status.success() {
            return Err(AppError::new(
                "NETWORKSETUP_FAILED",
                String::from_utf8_lossy(&output.stderr).trim().to_string(),
            ));
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let mut services = Vec::new();
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('*') || line.contains("An asterisk") {
                continue;
            }
            services.push(line.to_string());
        }
        Ok(services)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(AppError::unsupported(
            "Network service listing is only implemented on macOS for MVP",
        ))
    }
}

pub fn flush_dns() -> AppResult<FixResult> {
    #[cfg(target_os = "macos")]
    {
        let mut messages = Vec::new();
        // Idempotent: both may fail without privileges; report honestly.
        match Command::new("dscacheutil").args(["-flushcache"]).output() {
            Ok(o) if o.status.success() => messages.push("dscacheutil -flushcache: ok".into()),
            Ok(o) => messages.push(format!(
                "dscacheutil: {}",
                String::from_utf8_lossy(&o.stderr).trim()
            )),
            Err(e) => messages.push(format!("dscacheutil: {e}")),
        }
        match Command::new("killall")
            .args(["-HUP", "mDNSResponder"])
            .output()
        {
            Ok(o) if o.status.success() => messages.push("killall -HUP mDNSResponder: ok".into()),
            Ok(o) => {
                let err = String::from_utf8_lossy(&o.stderr).trim().to_string();
                messages.push(if err.is_empty() {
                    "killall mDNSResponder: failed (may need privileges)".into()
                } else {
                    format!("killall: {err}")
                });
            }
            Err(e) => messages.push(format!("killall: {e}")),
        }
        let ok = messages.iter().any(|m| m.contains(": ok"));
        Ok(FixResult {
            action: "flushDns".into(),
            ok,
            message: messages.join("; "),
            command_hint: "flushDns()".into(),
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(FixResult {
            action: "flushDns".into(),
            ok: false,
            message: "flushDns is only implemented on macOS for MVP".into(),
            command_hint: "flushDns()".into(),
        })
    }
}

pub fn switch_dns(service: String, servers: Vec<String>) -> AppResult<FixResult> {
    #[cfg(target_os = "macos")]
    {
        let service = service.trim().to_string();
        let allowed = list_network_services()?;
        if !allowed.iter().any(|s| s == &service) {
            return Err(AppError::invalid_input(format!(
                "Service not in whitelist: {service}"
            )));
        }
        if servers.is_empty() {
            return Err(AppError::invalid_input("DNS servers list cannot be empty"));
        }
        if servers.len() > 4 {
            return Err(AppError::invalid_input("At most 4 DNS servers allowed"));
        }
        let preset_ips: Vec<String> = builtin_defaults()?
            .dns_presets
            .into_iter()
            .map(|p| p.address)
            .collect();
        for s in &servers {
            let ip: IpAddr = s
                .parse()
                .map_err(|_| AppError::invalid_input(format!("Invalid DNS IP: {s}")))?;
            let ip_s = ip.to_string();
            if !preset_ips.iter().any(|p| p == &ip_s) {
                return Err(AppError::invalid_input(format!(
                    "DNS {ip_s} not in builtin preset whitelist"
                )));
            }
        }

        let mut args = vec!["-setdnsservers".to_string(), service.clone()];
        args.extend(servers.iter().cloned());
        let output = Command::new("networksetup")
            .args(&args)
            .output()
            .map_err(|e| AppError::io(format!("networksetup: {e}")))?;
        let ok = output.status.success();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(FixResult {
            action: "switchDns".into(),
            ok,
            message: if ok {
                format!("Set DNS on '{service}' to {}", servers.join(", "))
            } else if stderr.is_empty() {
                "networksetup -setdnsservers failed (may need privileges)".into()
            } else {
                stderr
            },
            command_hint: format!("switchDns('{service}', {:?})", servers),
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (service, servers);
        Ok(FixResult {
            action: "switchDns".into(),
            ok: false,
            message: "switchDns is only implemented on macOS for MVP".into(),
            command_hint: "switchDns(service, servers)".into(),
        })
    }
}

pub fn renew_dhcp(service: String) -> AppResult<FixResult> {
    #[cfg(target_os = "macos")]
    {
        let service = service.trim().to_string();
        let allowed = list_network_services()?;
        if !allowed.iter().any(|s| s == &service) {
            return Err(AppError::invalid_input(format!(
                "Service not in whitelist: {service}"
            )));
        }
        let output = Command::new("networksetup")
            .args(["-setdhcp", &service])
            .output()
            .map_err(|e| AppError::io(format!("networksetup: {e}")))?;
        let ok = output.status.success();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(FixResult {
            action: "renewDhcp".into(),
            ok,
            message: if ok {
                format!("Renewed DHCP on '{service}'")
            } else if stderr.is_empty() {
                "networksetup -setdhcp failed (may need privileges)".into()
            } else {
                stderr
            },
            command_hint: format!("renewDhcp('{service}')"),
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = service;
        Ok(FixResult {
            action: "renewDhcp".into(),
            ok: false,
            message: "renewDhcp is only implemented on macOS for MVP".into(),
            command_hint: "renewDhcp(service)".into(),
        })
    }
}

/// High-impact self-heal: flush DNS + renew DHCP on a whitelisted service.
/// UI triple-confirm is required; backend ignores any frontend "confirmed" flag
/// and re-validates the service whitelist on every call (idempotent).
pub fn reset_network_stack(service: String) -> AppResult<FixResult> {
    #[cfg(target_os = "macos")]
    {
        let service = service.trim().to_string();
        let allowed = list_network_services()?;
        if !allowed.iter().any(|s| s == &service) {
            return Err(AppError::invalid_input(format!(
                "Service not in whitelist: {service}"
            )));
        }

        let flush = flush_dns()?;
        let renew = renew_dhcp(service.clone())?;
        let ok = flush.ok && renew.ok;
        Ok(FixResult {
            action: "resetNetworkStack".into(),
            ok,
            message: format!(
                "flushDns: {} | renewDhcp('{service}'): {}",
                flush.message, renew.message
            ),
            command_hint: format!("resetNetworkStack('{service}')"),
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = service;
        Ok(FixResult {
            action: "resetNetworkStack".into(),
            ok: false,
            message: "resetNetworkStack is only implemented on macOS for MVP".into(),
            command_hint: "resetNetworkStack(service)".into(),
        })
    }
}
