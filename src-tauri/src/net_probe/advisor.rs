use super::types::{HealthCheckItem, HealthOpinion};

pub fn build_opinions(items: &[HealthCheckItem]) -> Vec<HealthOpinion> {
    let mut out = Vec::new();
    let status = |key: &str| {
        items
            .iter()
            .find(|i| i.key == key)
            .map(|i| i.status.as_str())
            .unwrap_or("skip")
    };

    if status("link.iface") == "fail" {
        out.push(opinion(
            "link-down",
            "critical",
            &["link.iface"],
            "networkProbe.advisor.linkDown.title",
            "networkProbe.advisor.linkDown.body",
        ));
    }

    if status("route.default") == "fail" {
        out.push(opinion(
            "no-default-route",
            "critical",
            &["route.default"],
            "networkProbe.advisor.noDefaultRoute.title",
            "networkProbe.advisor.noDefaultRoute.body",
        ));
    }

    if status("addr.ipv4") == "fail" {
        out.push(opinion(
            "no-ipv4",
            "critical",
            &["addr.ipv4"],
            "networkProbe.advisor.noIpv4.title",
            "networkProbe.advisor.noIpv4.body",
        ));
    }

    if status("dns.servers") == "fail" || status("dns.resolve_name") == "fail" {
        out.push(opinion(
            "dns-broken",
            "critical",
            &["dns.servers", "dns.resolve_name"],
            "networkProbe.advisor.dnsBroken.title",
            "networkProbe.advisor.dnsBroken.body",
        ));
    }

    if status("hosts.override") == "fail" {
        out.push(opinion(
            "hosts-hijack",
            "critical",
            &["hosts.override"],
            "networkProbe.advisor.hostsHijack.title",
            "networkProbe.advisor.hostsHijack.body",
        ));
    }

    if status("diff.dns_vs_ip") == "fail" {
        let detail = items
            .iter()
            .find(|i| i.key == "diff.dns_vs_ip")
            .and_then(|i| i.detail.clone())
            .unwrap_or_default();
        if detail.contains("DNS or hosts") {
            out.push(opinion(
                "dns-vs-ip-dns",
                "critical",
                &["diff.dns_vs_ip", "dns.resolve_name", "hosts.override"],
                "networkProbe.advisor.dnsVsIpDns.title",
                "networkProbe.advisor.dnsVsIpDns.body",
            ));
        } else if detail.contains("uplink") || detail.contains("Public IP") {
            out.push(opinion(
                "dns-vs-ip-uplink",
                "critical",
                &["diff.dns_vs_ip", "reach.public_ip"],
                "networkProbe.advisor.dnsVsIpUplink.title",
                "networkProbe.advisor.dnsVsIpUplink.body",
            ));
        } else if detail.contains("Gateway") || detail.contains("LAN") {
            out.push(opinion(
                "dns-vs-ip-lan",
                "critical",
                &["diff.dns_vs_ip", "reach.gateway"],
                "networkProbe.advisor.dnsVsIpLan.title",
                "networkProbe.advisor.dnsVsIpLan.body",
            ));
        }
    }

    if status("proxy.system") == "warn" {
        out.push(opinion(
            "proxy-on",
            "warn",
            &["proxy.system"],
            "networkProbe.advisor.proxyOn.title",
            "networkProbe.advisor.proxyOn.body",
        ));
    }

    if status("dns.fake_ip") == "warn" {
        out.push(opinion(
            "fake-ip-active",
            "warn",
            &["dns.fake_ip", "proxy.system", "vpn.tunnel"],
            "networkProbe.advisor.fakeIpActive.title",
            "networkProbe.advisor.fakeIpActive.body",
        ));
    }

    if status("vpn.tunnel") == "warn" {
        out.push(opinion(
            "vpn-active",
            "warn",
            &["vpn.tunnel"],
            "networkProbe.advisor.vpnActive.title",
            "networkProbe.advisor.vpnActive.body",
        ));
    }

    let captive_status = status("reach.captive");
    if captive_status == "fail" || captive_status == "warn" {
        out.push(opinion(
            "captive",
            if captive_status == "fail" {
                "critical"
            } else {
                "warn"
            },
            &["reach.captive"],
            "networkProbe.advisor.captive.title",
            "networkProbe.advisor.captive.body",
        ));
    }

    if out.is_empty() && status("diff.dns_vs_ip") == "pass" {
        out.push(opinion(
            "all-clear",
            "info",
            &["diff.dns_vs_ip"],
            "networkProbe.advisor.allClear.title",
            "networkProbe.advisor.allClear.body",
        ));
    }

    out
}

fn opinion(
    id: &str,
    severity: &str,
    related: &[&str],
    title_key: &str,
    body_key: &str,
) -> HealthOpinion {
    HealthOpinion {
        id: id.into(),
        severity: severity.into(),
        related_keys: related.iter().map(|s| (*s).to_string()).collect(),
        title_key: title_key.into(),
        body_key: body_key.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(key: &str, status: &str, detail: Option<&str>) -> HealthCheckItem {
        HealthCheckItem {
            key: key.into(),
            layer: "L0".into(),
            status: status.into(),
            detail: detail.map(str::to_string),
            command_hint: None,
        }
    }

    #[test]
    fn link_down_emits_critical_opinion() {
        let opinions = build_opinions(&[item("link.iface", "fail", None)]);
        assert!(opinions.iter().any(|o| o.id == "link-down"));
    }

    #[test]
    fn all_clear_when_diff_pass() {
        let opinions = build_opinions(&[item("diff.dns_vs_ip", "pass", Some("ok"))]);
        assert!(opinions.iter().any(|o| o.id == "all-clear"));
    }

    #[test]
    fn dns_vs_ip_dns_branch() {
        let opinions =
            build_opinions(&[item("diff.dns_vs_ip", "fail", Some("DNS or hosts issue"))]);
        assert!(opinions.iter().any(|o| o.id == "dns-vs-ip-dns"));
    }

    #[test]
    fn fake_ip_emits_warn_opinion() {
        let opinions = build_opinions(&[item(
            "dns.fake_ip",
            "warn",
            Some("Fake-IP / enhanced mode likely"),
        )]);
        assert!(opinions.iter().any(|o| o.id == "fake-ip-active"));
    }

    #[test]
    fn captive_warning_emits_a_non_critical_advisory() {
        let opinions = build_opinions(&[item(
            "reach.captive",
            "warn",
            Some("Unexpected redirect to a portal-like page"),
        )]);
        let captive = opinions.iter().find(|o| o.id == "captive").unwrap();

        assert_eq!(captive.severity, "warn");
        assert_eq!(captive.related_keys, ["reach.captive"]);
    }

    #[test]
    fn captive_failure_emits_a_critical_advisory() {
        let opinions = build_opinions(&[item(
            "reach.captive",
            "fail",
            Some("Possible captive portal (HTTP 302)"),
        )]);
        let captive = opinions.iter().find(|o| o.id == "captive").unwrap();

        assert_eq!(captive.severity, "critical");
    }

    #[test]
    fn dns_resolver_failure_emits_dns_advisory() {
        let opinions = build_opinions(&[item("dns.resolve_name", "fail", None)]);

        assert!(opinions.iter().any(|o| o.id == "dns-broken"));
    }

    #[test]
    fn dns_ip_comparison_maps_uplink_and_lan_details() {
        for (detail, expected_id) in [
            ("Public IP lookup failed", "dns-vs-ip-uplink"),
            ("Gateway unavailable", "dns-vs-ip-lan"),
        ] {
            let opinions = build_opinions(&[item("diff.dns_vs_ip", "fail", Some(detail))]);
            assert!(opinions.iter().any(|o| o.id == expected_id), "{detail}");
        }
    }

    #[test]
    fn incomplete_or_unrecognized_results_do_not_claim_all_clear() {
        let opinions = build_opinions(&[
            item("diff.dns_vs_ip", "skip", None),
            item("reach.captive", "skip", Some("Probe unavailable")),
        ]);

        assert!(opinions.is_empty());
    }
}
