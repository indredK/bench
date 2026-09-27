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

    if status("reach.captive") == "fail" || status("reach.captive") == "warn" {
        let st = status("reach.captive");
        if st == "fail" {
            out.push(opinion(
                "captive",
                "critical",
                &["reach.captive"],
                "networkProbe.advisor.captive.title",
                "networkProbe.advisor.captive.body",
            ));
        }
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

    fn opinion_ids(items: &[HealthCheckItem]) -> Vec<String> {
        build_opinions(items).into_iter().map(|o| o.id).collect()
    }

    #[test]
    fn maps_each_health_signal_to_its_expected_opinion() {
        let cases: Vec<(&str, &str, Option<&str>, &[&str])> = vec![
            ("link.iface", "fail", None, &["link-down"]),
            ("route.default", "fail", None, &["no-default-route"]),
            ("addr.ipv4", "fail", None, &["no-ipv4"]),
            ("dns.servers", "fail", None, &["dns-broken"]),
            ("dns.resolve_name", "fail", None, &["dns-broken"]),
            ("hosts.override", "fail", None, &["hosts-hijack"]),
            (
                "diff.dns_vs_ip",
                "fail",
                Some("DNS or hosts issue"),
                &["dns-vs-ip-dns"],
            ),
            (
                "diff.dns_vs_ip",
                "fail",
                Some("Public IP does not match expected uplink"),
                &["dns-vs-ip-uplink"],
            ),
            (
                "diff.dns_vs_ip",
                "fail",
                Some("Gateway or LAN reachability differs"),
                &["dns-vs-ip-lan"],
            ),
            ("proxy.system", "warn", None, &["proxy-on"]),
            ("dns.fake_ip", "warn", None, &["fake-ip-active"]),
            ("vpn.tunnel", "warn", None, &["vpn-active"]),
            ("reach.captive", "fail", None, &["captive"]),
            // A warning is inconclusive; only a confirmed captive result produces advice.
            ("reach.captive", "warn", None, &[]),
            ("diff.dns_vs_ip", "pass", Some("ok"), &["all-clear"]),
            ("diff.dns_vs_ip", "fail", Some("unclassified detail"), &[]),
            ("link.iface", "skip", None, &[]),
        ];

        for (key, status, detail, expected) in cases {
            assert_eq!(
                opinion_ids(&[item(key, status, detail)]),
                expected
                    .iter()
                    .map(|id| (*id).to_string())
                    .collect::<Vec<_>>(),
                "unexpected advice for {key}={status}, detail={detail:?}"
            );
        }
    }

    #[test]
    fn combines_independent_findings_without_claiming_all_clear() {
        let opinions = build_opinions(&[
            item("link.iface", "fail", None),
            item("route.default", "fail", None),
            item("diff.dns_vs_ip", "pass", Some("ok")),
        ]);

        assert_eq!(
            opinions.iter().map(|o| o.id.as_str()).collect::<Vec<_>>(),
            ["link-down", "no-default-route"]
        );
        assert!(opinions
            .iter()
            .all(|opinion| opinion.severity == "critical"));
        assert!(opinions.iter().all(|opinion| !opinion.title_key.is_empty()));
        assert!(opinions.iter().all(|opinion| !opinion.body_key.is_empty()));
    }

    #[test]
    fn warning_advice_keeps_warning_severity_and_related_health_keys() {
        let opinions = build_opinions(&[
            item("proxy.system", "warn", None),
            item("dns.fake_ip", "warn", None),
            item("vpn.tunnel", "warn", None),
        ]);

        assert_eq!(
            opinions.iter().map(|o| o.id.as_str()).collect::<Vec<_>>(),
            ["proxy-on", "fake-ip-active", "vpn-active"]
        );
        assert!(opinions.iter().all(|opinion| opinion.severity == "warn"));
        assert_eq!(opinions[0].related_keys, ["proxy.system"]);
        assert_eq!(
            opinions[1].related_keys,
            ["dns.fake_ip", "proxy.system", "vpn.tunnel"]
        );
        assert_eq!(opinions[2].related_keys, ["vpn.tunnel"]);
    }
}
