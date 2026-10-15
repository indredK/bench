import type {
  NetworkProbeError,
  NetworkProbeKind,
  NetworkProbeL1,
  NetworkProbeOfflineSub,
} from "@/features/network-probe/store"

interface ErrorRoute {
  l1: NetworkProbeL1
  l2: string
  offlineSubs?: readonly NetworkProbeOfflineSub[]
}

const route = (l1: NetworkProbeL1, l2: string): ErrorRoute => ({ l1, l2 })
const offlineRoute = (...offlineSubs: NetworkProbeOfflineSub[]): ErrorRoute => ({
  l1: "basic",
  l2: "offline",
  offlineSubs,
})

const ERROR_ROUTES: Record<string, readonly ErrorRoute[]> = {
  "networkProbe.errors.overviewFailed": [route("basic", "overview")],
  "networkProbe.errors.tcpFailed": [route("test", "tcp")],
  "networkProbe.errors.pingFailed": [route("test", "ping")],
  "networkProbe.errors.pingDnsResolutionFailed": [route("test", "ping")],
  "networkProbe.errors.icmpUnavailable": [route("test", "ping")],
  "networkProbe.errors.dnsFailed": [route("test", "dns")],
  "networkProbe.errors.probeFailed": [route("test", "custom")],
  "networkProbe.errors.sitesFailed": [route("sites", "official"), route("sites", "packs")],
  "networkProbe.errors.healthFailed": [route("basic", "tree")],
  "networkProbe.errors.cancelFailed": [
    route("basic", "tree"),
    route("sites", "official"),
    route("sites", "packs"),
    route("test", "traceroute"),
    route("test", "speed"),
    route("security", "ports"),
    route("security", "pcap"),
    route("discover", "arp"),
    route("discover", "nodes"),
  ],
  "networkProbe.errors.servicesFailed": [route("basic", "fix")],
  "networkProbe.errors.fixFailed": [route("basic", "fix")],
  "networkProbe.errors.defaultsFailed": [route("basic", "overview")],
  "networkProbe.errors.tracerouteFailed": [route("test", "traceroute")],
  "networkProbe.errors.ipv6Failed": [offlineRoute("all", "ipv6")],
  "networkProbe.errors.mtuFailed": [offlineRoute("all", "mtu"), route("test", "mtu")],
  "networkProbe.errors.offlineFailed": [
    offlineRoute("all", "captive", "proxy", "ipv6", "mtu", "egress", "diff"),
    route("test", "egress"),
  ],
  "networkProbe.errors.openSettingsFailed": [
    route("basic", "overview"),
    route("basic", "fix"),
    route("discover", "arp"),
  ],
  "networkProbe.errors.speedFailed": [route("test", "speed")],
  "networkProbe.errors.securityAuthRequired": [
    route("security", "ports"),
    route("security", "pollution"),
    route("security", "pcap"),
    route("security", "dnssec"),
    route("security", "whois"),
  ],
  "networkProbe.errors.pollutionFailed": [route("security", "pollution")],
  "networkProbe.errors.pcapFailed": [route("security", "pcap")],
  "networkProbe.errors.whoisFailed": [route("security", "whois")],
  "networkProbe.errors.dnssecFailed": [route("security", "dnssec")],
  "networkProbe.errors.portsFailed": [route("security", "ports")],
  "networkProbe.errors.natFailed": [route("discover", "nat")],
  "networkProbe.errors.ntpFailed": [route("discover", "ntp")],
  "networkProbe.errors.lanFailed": [route("discover", "arp")],
  "networkProbe.errors.lanSvcFailed": [route("discover", "lan-svc")],
  "networkProbe.errors.nodesFailed": [route("discover", "nodes")],
  "networkProbe.errors.multiNodeFailed": [route("discover", "nodes")],
  "networkProbe.errors.agentFailed": [route("discover", "nodes")],
  "networkProbe.errors.packsFailed": [route("sites", "packs")],
}

const CANCEL_ROUTES: Record<NetworkProbeKind, readonly ErrorRoute[]> = {
  health: [route("basic", "tree")],
  sites: [route("sites", "official"), route("sites", "packs")],
  ping: [route("test", "ping")],
  traceroute: [route("test", "traceroute")],
  speed: [route("test", "speed")],
  ports: [route("security", "ports")],
  pcap: [route("security", "pcap")],
  lan: [route("discover", "arp")],
  multiNode: [route("discover", "nodes")],
}

export function isNetworkProbeErrorVisible(
  error: NetworkProbeError | null,
  l1: NetworkProbeL1,
  l2: string,
  offlineSub: NetworkProbeOfflineSub,
): boolean {
  if (!error) return false

  const routes =
    error.key.endsWith(".cancelFailed") && error.scope
      ? CANCEL_ROUTES[error.scope]
      : ERROR_ROUTES[error.key]
  // Keep unclassified module-level errors visible until an explicit panel is assigned.
  if (!routes) return true

  return routes.some(
    (candidate) =>
      candidate.l1 === l1 &&
      candidate.l2 === l2 &&
      (!candidate.offlineSubs || candidate.offlineSubs.includes(offlineSub)),
  )
}
