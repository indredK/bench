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
        if detail.starts_with("DNS resolution failed")
            || detail.starts_with("DNS server configuration is unavailable")
            || detail.starts_with("Suspicious hosts overrides")
        {
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

    if status("diff.dns_vs_ip") == "warn" {
        let detail = items
            .iter()
            .find(|i| i.key == "diff.dns_vs_ip")
            .and_then(|i| i.detail.as_deref())
            .unwrap_or_default();
        if detail.starts_with("Name probe failed") {
            out.push(opinion(
                "name-probe-inconclusive",
                "warn",
                &[
                    "diff.dns_vs_ip",
                    "reach.public_name",
                    "dns.resolve_name",
                    "hosts.override",
                ],
                "networkProbe.advisor.nameProbeInconclusive.title",
                "networkProbe.advisor.nameProbeInconclusive.body",
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

    match status("reach.captive") {
        "fail" => out.push(opinion(
            "captive",
            "critical",
            &["reach.captive"],
            "networkProbe.advisor.captive.title",
            "networkProbe.advisor.captive.body",
        )),
        "warn" => out.push(opinion(
            "captive-unconfirmed",
            "warn",
            &["reach.captive"],
            "networkProbe.advisor.captiveUnconfirmed.title",
            "networkProbe.advisor.captiveUnconfirmed.body",
        )),
        _ => {}
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
        let opinions = build_opinions(&[item(
            "diff.dns_vs_ip",
            "fail",
            Some("DNS resolution failed while the public IP probe passed"),
        )]);
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
    fn captive_opinion_severity_tracks_probe_confidence() {
        let opinions = build_opinions(&[item(
            "reach.captive",
            "warn",
            Some("Unexpected response from connectivity check"),
        )]);

        let opinion = opinions
            .iter()
            .find(|opinion| opinion.id == "captive-unconfirmed")
            .expect("an inconclusive captive probe should remain visible to the user");
        assert_eq!(opinion.severity, "warn");
        assert_eq!(opinion.related_keys, ["reach.captive"]);

        let confirmed = build_opinions(&[item("reach.captive", "fail", None)]);
        let critical = confirmed
            .iter()
            .find(|opinion| opinion.id == "captive")
            .expect("a confirmed captive redirect should remain critical");
        assert_eq!(critical.severity, "critical");

        let unavailable = build_opinions(&[item("reach.captive", "skip", None)]);
        assert!(unavailable.is_empty());
    }

    #[test]
    fn maps_all_health_failure_families_to_stable_opinion_ids() {
        let opinions = build_opinions(&[
            item("link.iface", "fail", None),
            item("route.default", "fail", None),
            item("addr.ipv4", "fail", None),
            item("dns.resolve_name", "fail", None),
            item("hosts.override", "fail", None),
            item("proxy.system", "warn", None),
            item("dns.fake_ip", "warn", None),
            item("vpn.tunnel", "warn", None),
        ]);

        let ids: Vec<_> = opinions.iter().map(|opinion| opinion.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "link-down",
                "no-default-route",
                "no-ipv4",
                "dns-broken",
                "hosts-hijack",
                "proxy-on",
                "fake-ip-active",
                "vpn-active",
            ]
        );
        assert!(opinions[..5]
            .iter()
            .all(|opinion| opinion.severity == "critical"));
        assert!(opinions[5..]
            .iter()
            .all(|opinion| opinion.severity == "warn"));

        let no_dns_servers = build_opinions(&[item("dns.servers", "fail", None)]);
        assert!(no_dns_servers
            .iter()
            .any(|opinion| opinion.id == "dns-broken"));
    }

    #[test]
    fn classifies_each_synthetic_dns_vs_ip_failure_direction() {
        let cases = [
            (
                "DNS resolution failed while the public IP probe passed",
                "dns-vs-ip-dns",
                vec!["diff.dns_vs_ip", "dns.resolve_name", "hosts.override"],
            ),
            (
                "Public IP unreachable → uplink / ISP / firewall",
                "dns-vs-ip-uplink",
                vec!["diff.dns_vs_ip", "reach.public_ip"],
            ),
            (
                "Gateway unreachable → LAN / gateway / link issue",
                "dns-vs-ip-lan",
                vec!["diff.dns_vs_ip", "reach.gateway"],
            ),
        ];

        for (detail, expected_id, expected_related_keys) in cases {
            let opinions = build_opinions(&[item("diff.dns_vs_ip", "fail", Some(detail))]);
            let found = opinions
                .iter()
                .find(|opinion| opinion.id == expected_id)
                .unwrap_or_else(|| panic!("missing opinion {expected_id} for {detail}"));
            assert_eq!(found.severity, "critical");
            assert_eq!(found.related_keys, expected_related_keys);
        }

        let unknown_detail = build_opinions(&[item(
            "diff.dns_vs_ip",
            "fail",
            Some("Mixed signals with no classified direction"),
        )]);
        assert!(unknown_detail.is_empty());
    }

    #[test]
    fn inconclusive_name_probe_emits_warning_instead_of_dns_failure() {
        let opinions = build_opinions(&[item(
            "diff.dns_vs_ip",
            "warn",
            Some("Name probe failed, but DNS and hosts checks did not establish the cause"),
        )]);
        let warning = opinions
            .iter()
            .find(|opinion| opinion.id == "name-probe-inconclusive")
            .expect("an unclassified name probe failure should remain visible as a warning");

        assert_eq!(warning.severity, "warn");
        assert!(!opinions.iter().any(|opinion| opinion.id == "dns-vs-ip-dns"));
        assert_eq!(
            warning.related_keys,
            [
                "diff.dns_vs_ip",
                "reach.public_name",
                "dns.resolve_name",
                "hosts.override",
            ]
        );
    }

    #[test]
    fn does_not_show_all_clear_for_unknown_or_incomplete_health_results() {
        assert!(build_opinions(&[]).is_empty());
        assert!(build_opinions(&[item("diff.dns_vs_ip", "skip", None)]).is_empty());
        assert!(build_opinions(&[item("diff.dns_vs_ip", "warn", None)]).is_empty());

        let opinions = build_opinions(&[
            item("diff.dns_vs_ip", "pass", None),
            item("proxy.system", "warn", None),
        ]);
        assert_eq!(
            opinions
                .iter()
                .map(|opinion| opinion.id.as_str())
                .collect::<Vec<_>>(),
            ["proxy-on"]
        );
    }
}
