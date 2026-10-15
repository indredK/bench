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
        Ok(flush_dns_with(|program, args| {
            let output = Command::new(program)
                .args(args)
                .output()
                .map_err(|error| error.to_string())?;
            if output.status.success() {
                Ok(())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
            }
        }))
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

#[cfg(any(target_os = "macos", test))]
fn flush_dns_with<RunCommand>(mut run_command: RunCommand) -> FixResult
where
    RunCommand: FnMut(&str, &[&str]) -> Result<(), String>,
{
    let dscache = run_command("dscacheutil", &["-flushcache"])
        .map_err(|error| format_command_failure("dscacheutil", error));
    let mdns = run_command("killall", &["-HUP", "mDNSResponder"])
        .map_err(|error| format_command_failure("killall", error));
    let ok = dscache.is_ok() && mdns.is_ok();
    let message = [
        dscache
            .map(|()| "dscacheutil -flushcache: ok".to_string())
            .unwrap_or_else(|error| error),
        mdns.map(|()| "killall -HUP mDNSResponder: ok".to_string())
            .unwrap_or_else(|error| error),
    ]
    .join("; ");

    FixResult {
        action: "flushDns".into(),
        ok,
        message,
        command_hint: "flushDns()".into(),
    }
}

#[cfg(any(target_os = "macos", test))]
fn format_command_failure(program: &str, error: String) -> String {
    if error.trim().is_empty() {
        match program {
            "dscacheutil" => "dscacheutil -flushcache failed (may need privileges)".into(),
            "killall" => "killall mDNSResponder: failed (may need privileges)".into(),
            _ => format!("{program} failed"),
        }
    } else {
        match program {
            "dscacheutil" => format!("dscacheutil: {error}"),
            "killall" => format!("killall: {error}"),
            _ => format!("{program}: {error}"),
        }
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
    use super::{flush_dns_with, reset_network_stack_with, validate_network_service};
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
    fn flush_dns_requires_both_commands_and_preserves_partial_failure_details() {
        let calls = RefCell::new(Vec::new());
        let result = flush_dns_with(|program, args| {
            calls.borrow_mut().push((
                program.to_string(),
                args.iter().map(|arg| arg.to_string()).collect::<Vec<_>>(),
            ));
            match program {
                "dscacheutil" => Ok(()),
                "killall" => Err("permission denied".into()),
                _ => unreachable!("unexpected DNS flush command"),
            }
        });

        assert!(!result.ok);
        assert!(result.message.contains("dscacheutil -flushcache: ok"));
        assert!(result.message.contains("killall: permission denied"));
        assert_eq!(
            calls.into_inner(),
            vec![
                ("dscacheutil".to_string(), vec!["-flushcache".to_string()]),
                (
                    "killall".to_string(),
                    vec!["-HUP".to_string(), "mDNSResponder".to_string()]
                ),
            ]
        );
    }

    #[test]
    fn flush_dns_succeeds_only_when_both_commands_succeed() {
        let result = flush_dns_with(|_, _| Ok(()));

        assert!(result.ok);
        assert!(result.message.contains("dscacheutil -flushcache: ok"));
        assert!(result.message.contains("killall -HUP mDNSResponder: ok"));
    }

    #[test]
    fn flush_dns_still_runs_responder_notification_when_cache_flush_fails() {
        let calls = RefCell::new(Vec::new());
        let result = flush_dns_with(|program, _| {
            calls.borrow_mut().push(program.to_string());
            if program == "dscacheutil" {
                Err("cache flush failed".into())
            } else {
                Ok(())
            }
        });

        assert!(!result.ok);
        assert!(result.message.contains("dscacheutil: cache flush failed"));
        assert!(result.message.contains("killall -HUP mDNSResponder: ok"));
        assert_eq!(calls.into_inner(), vec!["dscacheutil", "killall"]);
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
