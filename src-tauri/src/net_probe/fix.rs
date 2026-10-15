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
        let service = validate_network_service(service, &list_network_services()?)?;
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
        let service = validate_network_service(service, &list_network_services()?)?;
        Ok(renew_dhcp_for_validated_service(&service))
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
        reset_network_stack_with(service, list_network_services, flush_dns, |service| {
            renew_dhcp_for_validated_service(service)
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

#[cfg(any(target_os = "macos", test))]
fn validate_network_service(service: String, allowed: &[String]) -> AppResult<String> {
    let service = service.trim().to_string();
    if allowed
        .iter()
        .any(|allowed_service| allowed_service == &service)
    {
        Ok(service)
    } else {
        Err(AppError::invalid_input(format!(
            "Service not in whitelist: {service}"
        )))
    }
}

#[cfg(target_os = "macos")]
fn renew_dhcp_for_validated_service(service: &str) -> FixResult {
    let result = Command::new("networksetup")
        .args(["-setdhcp", service])
        .output();
    let (ok, message) = match result {
        Ok(output) if output.status.success() => (true, format!("Renewed DHCP on '{service}'")),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            (
                false,
                if stderr.is_empty() {
                    "networksetup -setdhcp failed (may need privileges)".into()
                } else {
                    stderr
                },
            )
        }
        Err(error) => (false, format!("networksetup: {error}")),
    };
    FixResult {
        action: "renewDhcp".into(),
        ok,
        message,
        command_hint: format!("renewDhcp('{service}')"),
    }
}

#[cfg(any(target_os = "macos", test))]
fn reset_network_stack_with<ListServices, FlushDns, RenewDhcp>(
    service: String,
    list_services: ListServices,
    flush_dns: FlushDns,
    renew_dhcp: RenewDhcp,
) -> AppResult<FixResult>
where
    ListServices: FnOnce() -> AppResult<Vec<String>>,
    FlushDns: FnOnce() -> AppResult<FixResult>,
    RenewDhcp: FnOnce(&str) -> FixResult,
{
    let service = validate_network_service(service, &list_services()?)?;
    let flush = flush_dns()?;
    let renew = renew_dhcp(&service);
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

#[cfg(test)]
mod tests {
    use super::{reset_network_stack_with, validate_network_service};
    use crate::error::AppResult;
    use crate::net_probe::types::FixResult;
    use std::cell::RefCell;

    fn fix_result(action: &str, ok: bool, message: &str) -> FixResult {
        FixResult {
            action: action.into(),
            ok,
            message: message.into(),
            command_hint: format!("{action}()"),
        }
    }

    #[test]
    fn network_service_validation_trims_but_requires_an_exact_whitelist_match() {
        let allowed = vec!["Wi-Fi".to_string(), "USB Ethernet".to_string()];
        assert_eq!(
            validate_network_service(" Wi-Fi ".into(), &allowed).unwrap(),
            "Wi-Fi"
        );
        assert!(validate_network_service("Wi-Fi;open -a Calculator".into(), &allowed).is_err());
        assert!(validate_network_service("".into(), &allowed).is_err());
    }

    #[test]
    fn reset_checks_whitelist_before_effects_and_preserves_partial_results() {
        let calls = RefCell::new(Vec::new());
        let result = reset_network_stack_with(
            " Wi-Fi ".into(),
            || {
                calls.borrow_mut().push("list".to_string());
                Ok(vec!["Wi-Fi".to_string()])
            },
            || {
                calls.borrow_mut().push("flush".to_string());
                Ok(fix_result("flushDns", true, "cache cleared"))
            },
            |service| {
                calls.borrow_mut().push(format!("dhcp:{service}"));
                fix_result("renewDhcp", false, "DHCP command failed")
            },
        )
        .unwrap();

        assert_eq!(calls.into_inner(), vec!["list", "flush", "dhcp:Wi-Fi"]);
        assert!(!result.ok);
        assert!(result.message.contains("cache cleared"));
        assert!(result.message.contains("DHCP command failed"));
    }

    #[test]
    fn reset_rejects_an_unlisted_service_before_running_any_effect() {
        let calls = RefCell::new(Vec::new());
        let result: AppResult<FixResult> = reset_network_stack_with(
            "Ethernet".into(),
            || {
                calls.borrow_mut().push("list".to_string());
                Ok(vec!["Wi-Fi".to_string()])
            },
            || {
                calls.borrow_mut().push("flush".to_string());
                Ok(fix_result("flushDns", true, "cache cleared"))
            },
            |service| {
                calls.borrow_mut().push(format!("dhcp:{service}"));
                fix_result("renewDhcp", true, "renewed")
            },
        );

        assert!(result.is_err());
        assert_eq!(calls.into_inner(), vec!["list"]);
    }

    #[test]
    fn completed_reset_can_be_repeated_without_retained_run_state() {
        let calls = RefCell::new(Vec::new());
        for _ in 0..2 {
            let result = reset_network_stack_with(
                "Wi-Fi".into(),
                || {
                    calls.borrow_mut().push("list".to_string());
                    Ok(vec!["Wi-Fi".to_string()])
                },
                || {
                    calls.borrow_mut().push("flush".to_string());
                    Ok(fix_result("flushDns", true, "cache cleared"))
                },
                |service| {
                    calls.borrow_mut().push(format!("dhcp:{service}"));
                    fix_result("renewDhcp", true, "renewed")
                },
            )
            .unwrap();
            assert!(result.ok);
            assert!(result.message.contains("Wi-Fi"));
        }

        assert_eq!(
            calls.into_inner(),
            vec!["list", "flush", "dhcp:Wi-Fi", "list", "flush", "dhcp:Wi-Fi"]
        );
    }
}
