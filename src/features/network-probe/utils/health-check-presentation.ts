import type { HealthCheckItem } from "@/lib/tauri/types/network-probe"

type HealthCheckStatus = HealthCheckItem["status"]

export interface HealthCheckPresentation {
  labelKey: string
  detailKey?: string
  detailValues?: Record<string, string | number>
  technicalDetail?: string
  commandHint?: string
  checkKey: string
}

const CHECK_LABEL_KEYS: Record<string, string> = {
  "link.iface": "networkProbe.health.checks.activeInterfaces",
  "link.wifi_or_wired": "networkProbe.health.checks.linkType",
  "addr.ipv4": "networkProbe.health.checks.ipv4Address",
  "addr.ipv6": "networkProbe.health.checks.ipv6Address",
  "addr.dhcp_or_static": "networkProbe.health.checks.addressAssignment",
  "route.default": "networkProbe.health.checks.defaultRoute",
  "dns.servers": "networkProbe.health.checks.dnsServers",
  "dns.resolve_name": "networkProbe.health.checks.dnsResolution",
  "hosts.override": "networkProbe.health.checks.hostsOverrides",
  "proxy.system": "networkProbe.health.checks.systemProxy",
  "dns.fake_ip": "networkProbe.health.checks.fakeIp",
  "vpn.tunnel": "networkProbe.health.checks.vpnTunnel",
  "firewall.status": "networkProbe.health.checks.firewall",
  "svc.network": "networkProbe.health.checks.networkService",
  "reach.gateway": "networkProbe.health.checks.gatewayReachability",
  "reach.public_ip": "networkProbe.health.checks.publicIpReachability",
  "reach.public_name": "networkProbe.health.checks.domainReachability",
  "diff.dns_vs_ip": "networkProbe.health.checks.connectionDiagnosis",
  "reach.captive": "networkProbe.health.checks.captivePortal",
  "reach.public_egress": "networkProbe.health.checks.publicEgress",
  "reach.mtu": "networkProbe.health.checks.pathMtu",
}

const FALLBACK_DETAIL_KEYS: Partial<Record<HealthCheckStatus, string>> = {
  warn: "networkProbe.health.details.genericWarning",
  fail: "networkProbe.health.details.genericFailure",
  skip: "networkProbe.health.details.genericSkipped",
  error: "networkProbe.health.details.genericError",
}

const detail = (
  key: string,
  values?: Record<string, string | number>,
): Pick<HealthCheckPresentation, "detailKey" | "detailValues"> => ({
  detailKey: `networkProbe.health.details.${key}`,
  detailValues: values,
})

function match(value: string, pattern: RegExp): RegExpExecArray | null {
  return pattern.exec(value)
}

function parseAddressDetail(value: string, noAddressMessage: string, prefix: string) {
  if (value === "No summary") return detail("summaryUnavailable")
  if (value === noAddressMessage) return detail(`${prefix}Unavailable`)
  if (value.startsWith("APIPA only: ")) {
    return detail("apipaOnly", { address: value.slice("APIPA only: ".length) })
  }
  return detail("addressValue", { address: value })
}

export function presentHealthCheckItem(item: HealthCheckItem): HealthCheckPresentation {
  const raw = item.detail?.trim() ?? ""
  let localized: Pick<HealthCheckPresentation, "detailKey" | "detailValues"> | undefined

  switch (item.key) {
    case "link.iface": {
      const count = match(raw, /^(\d+) active interface\(s\)$/)
      if (count) localized = detail("activeInterfaceCount", { count: Number(count[1]) })
      else if (raw === "No active non-loopback interface") localized = detail("noActiveInterfaces")
      else if (raw === "Failed to read interfaces") localized = detail("interfacesUnavailable")
      break
    }
    case "link.wifi_or_wired": {
      const wifi = match(raw, /^Wi. Fi SSID=(.*?)(?:, (-?\d+) dBm)?$/)
      if (wifi) {
        localized = wifi[2]
          ? detail("wifiConnectedWithSignal", { ssid: wifi[1], signalDbm: Number(wifi[2]) })
          : detail("wifiConnected", { ssid: wifi[1] })
      } else if (raw === "Wired or Wi‑Fi without readable SSID") localized = detail("linkDetected")
      else if (raw === "Medium type unclear") localized = detail("linkTypeUnknown")
      break
    }
    case "addr.ipv4":
      localized = parseAddressDetail(raw, "No IPv4 address", "ipv4")
      break
    case "addr.ipv6":
      localized =
        raw === "No summary"
          ? detail("summaryUnavailable")
          : raw === "No global IPv6 address"
            ? detail("ipv6Unavailable")
            : detail("addressValue", { address: raw })
      break
    case "addr.dhcp_or_static":
      if (raw.includes("DHCP vs static not fully readable")) localized = detail("dhcpStaticUnknown")
      else if (raw === "Not implemented on this platform")
        localized = detail("notImplementedPlatform")
      break
    case "route.default": {
      if (raw === "No default route") localized = detail("noDefaultRoute")
      else if (/VPN\/tunnel default/.test(raw)) localized = detail("defaultRouteViaTunnel")
      else if (raw) localized = detail("defaultRoutePresent")
      break
    }
    case "dns.servers":
      if (raw === "DNS server list empty") localized = detail("dnsServersEmpty")
      else if (raw === "No summary") localized = detail("summaryUnavailable")
      else if (raw) localized = detail("dnsServersValue", { servers: raw })
      break
    case "dns.resolve_name": {
      const resolved = match(raw, /^(\d+) record\(s\) in ([\d.]+)ms$/)
      if (resolved) {
        localized = detail("dnsResolved", {
          count: Number(resolved[1]),
          ms: Number(resolved[2]),
        })
      } else if (raw === "Empty A answer for cloudflare.com") localized = detail("dnsEmptyAnswer")
      break
    }
    case "hosts.override": {
      const clean = match(raw, /^(\d+) hosts entries, none suspicious$/)
      const suspicious = match(raw, /^(\d+) suspicious:/)
      if (clean) localized = detail("hostsClean", { count: Number(clean[1]) })
      else if (suspicious) localized = detail("hostsSuspicious", { count: Number(suspicious[1]) })
      else if (raw.includes("could not be read")) localized = detail("hostsUnavailable")
      break
    }
    case "proxy.system":
      if (raw.startsWith("No system proxy")) localized = detail("proxyDisabled")
      else if (raw.startsWith("Local system proxy") || raw.startsWith("System proxy enabled")) {
        localized = detail("proxyEnabled")
      }
      break
    case "dns.fake_ip":
      localized = raw.startsWith("No Fake-IP")
        ? detail("fakeIpNotDetected")
        : detail("fakeIpDetected")
      break
    case "vpn.tunnel":
      if (raw === "No VPN-like tunnel detected") localized = detail("vpnNotDetected")
      else if (raw.startsWith("Default route via tunnel")) localized = detail("vpnDefaultRoute")
      else if (raw.startsWith("VPN-like ifaces present")) localized = detail("vpnInterfacesPresent")
      else if (raw.includes("only implemented on macOS"))
        localized = detail("notImplementedPlatform")
      break
    case "firewall.status": {
      const state = match(raw, /^firewall=(.+)$/)
      if (state?.[1] === "on") localized = detail("firewallOn")
      else if (state?.[1] === "off") localized = detail("firewallOff")
      else if (state) localized = detail("firewallStateUnknown")
      else if (raw === "Firewall status unavailable") localized = detail("firewallUnavailable")
      break
    }
    case "svc.network":
      localized = detail("networkServiceNotProbed")
      break
    case "reach.gateway": {
      const rtt = match(raw, /^rtt≈([\d.]+)ms$/)
      const loss = match(raw, /^loss=([\d.]+)%$/)
      if (rtt) localized = detail("gatewayRtt", { ms: Number(rtt[1]) })
      else if (loss) localized = detail("packetLoss", { percent: Number(loss[1]) })
      else if (raw.startsWith("Default via tunnel")) localized = detail("gatewayTunnel")
      else if (raw === "No gateway to ping") localized = detail("gatewayUnavailable")
      break
    }
    case "reach.public_ip": {
      const rtt = match(raw, /^rtt≈([\d.]+)ms$/)
      const loss = match(raw, /^loss=([\d.]+)%$/)
      if (rtt) localized = detail("publicIpRtt", { ms: Number(rtt[1]) })
      else if (loss) localized = detail("packetLoss", { percent: Number(loss[1]) })
      break
    }
    case "reach.public_name": {
      const icmp = match(raw, /^ICMP ok rtt≈([\d.]+)ms$/)
      const http = match(raw, /^HTTP (\d+) TTFB≈([\d.]+)ms/)
      if (icmp) localized = detail("domainIcmpRtt", { ms: Number(icmp[1]) })
      else if (http)
        localized = detail("domainHttp", { status: Number(http[1]), ms: Number(http[2]) })
      break
    }
    case "diff.dns_vs_ip":
      if (raw.startsWith("Gateway unreachable")) localized = detail("diagnosisGateway")
      else if (raw.startsWith("Public IP unreachable")) localized = detail("diagnosisPublicIp")
      else if (
        raw.startsWith("DNS resolution failed") ||
        raw.startsWith("DNS server configuration is unavailable")
      )
        localized = detail("diagnosisDns")
      else if (raw.startsWith("Suspicious hosts overrides")) localized = detail("diagnosisHosts")
      else if (raw.startsWith("Name probe failed")) localized = detail("diagnosisNameProbe")
      else if (raw.startsWith("Public path OK")) localized = detail("diagnosisPublicPath")
      else if (raw.startsWith("Basic reachability OK"))
        localized = detail("diagnosisReachabilityOk")
      else if (raw.startsWith("Mixed signals")) localized = detail("diagnosisMixed")
      break
    case "reach.captive": {
      const possible = match(raw, /^Possible captive portal \(HTTP (\d+)\)$/)
      const status = match(raw, /^Unexpected status (\d+|\?)$/)
      if (raw.startsWith("No captive portal detected")) localized = detail("captiveNotDetected")
      else if (raw.startsWith("Unexpected redirect")) localized = detail("captiveRedirect")
      else if (possible) localized = detail("captivePossible", { status: Number(possible[1]) })
      else if (status) localized = detail("captiveUnexpectedStatus", { status: status[1] })
      else if (raw === "Captive probe unavailable") localized = detail("captiveUnavailable")
      break
    }
    case "reach.public_egress": {
      const reachable = match(raw, /^Egress API reachable \(HTTP (\d+), TTFB≈([\d.]+)ms\)$/)
      if (reachable) {
        localized = detail("publicEgressReachable", {
          status: Number(reachable[1]),
          ms: Number(reachable[2]),
        })
      } else if (raw === "Egress probe unavailable") localized = detail("publicEgressUnavailable")
      break
    }
    case "reach.mtu": {
      const pathMtu = match(raw, /^pathMtu=(\d+)(?:;.*)?$/)
      if (pathMtu) localized = detail("pathMtuValue", { mtu: Number(pathMtu[1]) })
      break
    }
  }

  const labelKey = Object.hasOwn(CHECK_LABEL_KEYS, item.key)
    ? CHECK_LABEL_KEYS[item.key]
    : "networkProbe.health.checks.unknown"
  const fallbackDetailKey = Object.hasOwn(FALLBACK_DETAIL_KEYS, item.status)
    ? FALLBACK_DETAIL_KEYS[item.status]
    : undefined
  const detailKey = localized?.detailKey ?? fallbackDetailKey

  return {
    labelKey,
    ...(detailKey ? { detailKey } : {}),
    ...(localized?.detailValues ? { detailValues: localized.detailValues } : {}),
    ...(item.detail ? { technicalDetail: item.detail } : {}),
    ...(item.commandHint ? { commandHint: item.commandHint } : {}),
    checkKey: item.key,
  }
}
