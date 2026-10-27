use super::defaults::get_defaults;
use super::probe::probe_http_target;
use super::types::{CaptivePortalResult, CaptiveProbe, ProxyVpnStatus, PublicIpApi, PublicIpInfo};
use crate::error::AppResult;
use reqwest::redirect::Policy;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::time::{Duration, Instant};

const MAX_PUBLIC_IP_BODY_BYTES: usize = 16 * 1024;

pub(super) struct PublicIpApiResponse {
    pub ip: String,
    pub status: u16,
    pub elapsed_ms: f64,
}

pub async fn detect_captive_portal() -> AppResult<CaptivePortalResult> {
    let catalog = get_defaults()?;
    Ok(detect_captive_portal_with_probes(&catalog.captive_probes).await)
}

pub(super) async fn detect_captive_portal_with_probes(
    probes: &[CaptiveProbe],
) -> CaptivePortalResult {
    let mut details = Vec::new();
    let mut captive_hits = 0usize;
    let mut ok_hits = 0usize;
    let mut fail_hits = 0usize;

    for probe in probes {
        let (http, _) = probe_http_target(&probe.url).await;
        match http {
            Some(h)
                if has_left_probe_host(&probe.url, h.final_url.as_deref())
                    || h.status.is_some_and(|status| (300..400).contains(&status)) =>
            {
                captive_hits += 1;
                details.push(format!(
                    "{}: redirected status={:?} final={}",
                    probe.id,
                    h.status,
                    h.final_url.unwrap_or_default()
                ));
            }
            Some(h) if h.ok && h.status == Some(probe.expect_status) => {
                ok_hits += 1;
                details.push(format!("{}: ok status={}", probe.id, probe.expect_status));
            }
            Some(h) => {
                fail_hits += 1;
                details.push(format!(
                    "{}: status={:?} err={}",
                    probe.id,
                    h.status,
                    h.error.unwrap_or_default()
                ));
            }
            None => {
                fail_hits += 1;
                details.push(format!("{}: no response", probe.id));
            }
        }
    }

    let (status, message) = if probes.is_empty() {
        (
            "unknown",
            "No captive portal probes are configured".to_string(),
        )
    } else if captive_hits > 0 && ok_hits == 0 {
        (
            "captive",
            "Likely captive portal (redirected connectivity probes)".to_string(),
        )
    } else if ok_hits > 0 {
        (
            "open",
            "Connectivity probes matched expected responses".to_string(),
        )
    } else if fail_hits == probes.len() {
        (
            "offline",
            "All captive probes failed — likely offline / no route".to_string(),
        )
    } else {
        ("unknown", "Mixed captive probe results".to_string())
    };

    CaptivePortalResult {
        status: status.into(),
        detail: Some(format!("{message}; {}", details.join("; "))),
        command_hint: "detectCaptivePortal(local)".into(),
    }
}

fn has_left_probe_host(probe_url: &str, final_url: Option<&str>) -> bool {
    let Some(final_url) = final_url else {
        return false;
    };
    let Ok(probe) = url::Url::parse(probe_url) else {
        return false;
    };
    let Ok(final_url) = url::Url::parse(final_url) else {
        return false;
    };
    probe.host_str() != final_url.host_str()
}

pub async fn get_public_ip_info() -> AppResult<PublicIpInfo> {
    let catalog = get_defaults()?;
    if catalog.public_ip_apis.is_empty() {
        return Ok(PublicIpInfo {
            ip: None,
            source: None,
            asn: None,
            org: None,
            detail: Some("No public IP APIs are configured".into()),
            command_hint: "getPublicIpInfo(local)".into(),
        });
    }
    let client = public_ip_client()?;

    for api in &catalog.public_ip_apis {
        let Ok(result) = fetch_public_ip_api(&client, api).await else {
            continue;
        };
        let mut info = PublicIpInfo {
            ip: Some(result.ip.clone()),
            source: Some(api.id.clone()),
            asn: None,
            org: None,
            detail: None,
            command_hint: "getPublicIpInfo(local)".into(),
        };
        if let Ok(addr) = result.ip.parse::<std::net::IpAddr>() {
            if let Some(asn) = super::asn::lookup_asn(addr).await {
                info.asn = Some(format!("AS{}", asn.asn));
                info.org = asn.as_name.or(asn.prefix);
            }
        }
        return Ok(info);
    }

    Ok(PublicIpInfo {
        ip: None,
        source: None,
        asn: None,
        org: None,
        detail: Some("All public IP APIs failed".into()),
        command_hint: "getPublicIpInfo(local)".into(),
    })
}

pub(super) fn public_ip_client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(8))
        .redirect(Policy::custom(|attempt| {
            if should_follow_public_ip_redirect(attempt.previous().len(), attempt.url().scheme()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
        .map_err(|error| {
            crate::error::AppError::internal(format!("build public IP client: {error}"))
        })
}

fn should_follow_public_ip_redirect(previous_redirects: usize, scheme: &str) -> bool {
    previous_redirects < 3 && scheme == "https"
}

pub(super) async fn fetch_public_ip_api(
    client: &reqwest::Client,
    api: &PublicIpApi,
) -> Result<PublicIpApiResponse, String> {
    let started = Instant::now();
    let response = client
        .get(&api.url)
        .send()
        .await
        .map_err(|error| error.without_url().to_string())?;
    let status = response.status().as_u16();
    if !response.status().is_success() {
        return Err(format!("HTTP {status}"));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_PUBLIC_IP_BODY_BYTES as u64)
    {
        return Err("response exceeds 16 KiB".into());
    }
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    let body = read_limited_body(response)
        .await
        .map_err(|_| "response body is invalid or exceeds 16 KiB".to_string())?;
    let text = std::str::from_utf8(&body).map_err(|_| "response is not UTF-8".to_string())?;
    let ip = extract_ip(text, &api.format).ok_or_else(|| {
        format!(
            "response does not contain an IP in the configured {} format",
            api.format
        )
    })?;
    Ok(PublicIpApiResponse {
        ip,
        status,
        elapsed_ms,
    })
}

async fn read_limited_body(mut response: reqwest::Response) -> Result<Vec<u8>, ()> {
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ())? {
        if body.len().saturating_add(chunk.len()) > MAX_PUBLIC_IP_BODY_BYTES {
            return Err(());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn extract_ip(text: &str, format: &str) -> Option<String> {
    let trimmed = text.trim();
    let candidate = match format {
        "json-ip" => serde_json::from_str::<serde_json::Value>(trimmed)
            .ok()?
            .get("ip")?
            .as_str()?
            .to_string(),
        "text" => trimmed.lines().next()?.trim().to_string(),
        _ => return None,
    };
    candidate
        .parse::<std::net::IpAddr>()
        .ok()
        .map(|address| address.to_string())
}

#[cfg(test)]
mod defaults_tests {
    use super::{extract_ip, has_left_probe_host, should_follow_public_ip_redirect};

    #[test]
    fn public_ip_parsing_obeys_the_configured_format_and_validates_ip_values() {
        assert_eq!(
            extract_ip(r#"{"ip":"203.0.113.8"}"#, "json-ip"),
            Some("203.0.113.8".into())
        );
        assert_eq!(
            extract_ip("2001:db8::1\n", "text"),
            Some("2001:db8::1".into())
        );
        assert_eq!(extract_ip("203.0.113.8", "json-ip"), None);
        assert_eq!(extract_ip(r#"{"ip":"not an ip"}"#, "json-ip"), None);
        assert_eq!(extract_ip("<html>203.0.113.8</html>", "text"), None);
    }

    #[test]
    fn captive_probe_redirect_detection_compares_hosts_without_leaking_credentials() {
        assert!(has_left_probe_host(
            "http://connectivity.example/check",
            Some("https://login.example/sign-in")
        ));
        assert!(!has_left_probe_host(
            "http://connectivity.example/check",
            Some("https://connectivity.example/another-path")
        ));
        assert!(!has_left_probe_host(
            "bad url",
            Some("https://login.example/")
        ));
    }

    #[test]
    fn public_ip_api_redirects_are_https_only_and_limited_to_three_hops() {
        assert!(should_follow_public_ip_redirect(0, "https"));
        assert!(should_follow_public_ip_redirect(2, "https"));
        assert!(!should_follow_public_ip_redirect(3, "https"));
        assert!(!should_follow_public_ip_redirect(0, "http"));
    }
}

pub fn get_proxy_vpn_status() -> AppResult<ProxyVpnStatus> {
    #[cfg(target_os = "macos")]
    {
        let mut proxy_enabled = false;
        let mut proxy_status_known = false;
        let proxy_output = super::summary::run_system_network_command(
            "scutil --proxy",
            Command::new("/usr/sbin/scutil").args(["--proxy"]),
        );
        let proxy_detail = match proxy_output {
            Ok(output)
                if output.status.success()
                    && output.stdout.iter().any(|byte| !byte.is_ascii_whitespace()) =>
            {
                let text = String::from_utf8_lossy(&output.stdout);
                let http = text.contains("HTTPEnable : 1");
                let https = text.contains("HTTPSEnable : 1");
                let socks = text.contains("SOCKSEnable : 1");
                let pac = text.contains("ProxyAutoConfigEnable : 1");
                proxy_enabled = http || https || socks || pac;
                proxy_status_known = true;
                Some(format!("HTTP={http} HTTPS={https} SOCKS={socks} PAC={pac}"))
            }
            Ok(_) | Err(_) => None,
        };

        let mut vpn_ifaces = Vec::new();
        let mut vpn_interfaces_known = false;
        if let Ok(ifaces) = if_addrs::get_if_addrs() {
            vpn_interfaces_known = true;
            for iface in ifaces {
                let n = iface.name.to_ascii_lowercase();
                if (n.starts_with("utun")
                    || n.starts_with("ipsec")
                    || n.starts_with("ppp")
                    || n.starts_with("wg"))
                    && !vpn_ifaces.contains(&iface.name)
                {
                    vpn_ifaces.push(iface.name);
                }
            }
        }

        let mut default_via_tunnel = false;
        let mut default_route_known = false;
        if let Ok(route) = super::summary::collect_default_route() {
            default_route_known = true;
            if let Some(iface) = route.interface {
                let lower = iface.to_ascii_lowercase();
                default_via_tunnel = lower.starts_with("utun")
                    || lower.starts_with("ipsec")
                    || lower.starts_with("ppp")
                    || lower.starts_with("wg");
            }
        }

        Ok(ProxyVpnStatus {
            proxy_enabled,
            proxy_status_known,
            proxy_detail,
            vpn_interfaces_known,
            vpn_ifaces,
            default_route_known,
            default_via_tunnel,
            command_hint: "getProxyVpnStatus(local)".into(),
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(ProxyVpnStatus {
            proxy_enabled: false,
            proxy_status_known: false,
            proxy_detail: None,
            vpn_interfaces_known: false,
            vpn_ifaces: vec![],
            default_route_known: false,
            default_via_tunnel: false,
            command_hint: "getProxyVpnStatus(local)".into(),
        })
    }
}
