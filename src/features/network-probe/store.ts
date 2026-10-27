/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 */
import { create } from "zustand"
import { isNetworkProbeErrorVisible } from "@/features/network-probe/error-scope"
import type { LocalizedError } from "@/lib/errors"
import type {
  CaptivePortalResult,
  CapabilityPackInfo,
  CapabilityPackInstallResult,
  DnsLookupResult,
  FirewallStatus,
  FixResult,
  HealthCheckItem,
  HealthScanResult,
  HostsOverride,
  LocalNetworkSummary,
  NetworkProbeCapabilities,
  NetworkProbeDefaultsCatalog,
  PingProbeResult,
  PingSample,
  ProbeTargetResult,
  ProxyVpnStatus,
  PublicIpInfo,
  SitesProbeResult,
  SiteSampleResult,
  SpeedSampleEvent,
  SpeedSource,
  SpeedTestResult,
  PollutionReport,
  WhoisInfo,
  DnsSecCheckResult,
  PortSampleEvent,
  PortScanResult,
  NatProbeResult,
  NtpProbeResult,
  LanDiscoveryProgressEvent,
  LanDiscoveryResult,
  LanServicesProgressEvent,
  LanServicesResult,
  PcapDiagResult,
  MultiNodeDnsResult,
  GlobalpingMeasurementResult,
  ProbeNode,
  TcpConnectResult,
  TracerouteHop,
  TracerouteResult,
  Ipv6StackResult,
  PathMtuResult,
} from "@/lib/tauri/types/network-probe"

const SECURITY_AUTH_KEY = "network-probe:security-authorized"
const REPORT_HISTORY_KEY = "network-probe:report-history"
const MAX_REPORT_HISTORY_ENTRIES = 10
const MAX_REPORT_HISTORY_STORAGE_BYTES = 1_048_576
const MAX_REPORT_HISTORY_ITEMS = 256
const MAX_REPORT_HISTORY_OPINIONS = 128
const MAX_REPORT_HISTORY_RELATED_KEYS = 256

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return isString(value) && value.length <= maxLength
}

function isHealthCheckItem(value: unknown): value is HealthCheckItem {
  if (!isRecord(value)) return false
  return (
    isBoundedString(value.key, 256) &&
    value.key.length > 0 &&
    isBoundedString(value.layer, 64) &&
    value.layer.length > 0 &&
    isBoundedString(value.status, 64) &&
    value.status.length > 0 &&
    (value.detail === undefined || isString(value.detail)) &&
    (value.commandHint === undefined || isString(value.commandHint))
  )
}

function hasUniqueHealthItemKeys(items: unknown[]): boolean {
  const keys = new Set<string>()
  return items.every((item) => {
    if (!isHealthCheckItem(item) || keys.has(item.key)) return false
    keys.add(item.key)
    return true
  })
}

function isHealthOpinion(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.relatedKeys)) return false
  return (
    isBoundedString(value.id, 256) &&
    value.id.length > 0 &&
    isBoundedString(value.severity, 64) &&
    value.severity.length > 0 &&
    value.relatedKeys.length <= MAX_REPORT_HISTORY_RELATED_KEYS &&
    value.relatedKeys.every((key) => isBoundedString(key, 256) && key.length > 0) &&
    isBoundedString(value.titleKey, 256) &&
    value.titleKey.length > 0 &&
    isBoundedString(value.bodyKey, 256) &&
    value.bodyKey.length > 0
  )
}

function isHealthScanResult(value: unknown): value is HealthScanResult {
  if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.opinions))
    return false
  return (
    value.items.length <= MAX_REPORT_HISTORY_ITEMS &&
    hasUniqueHealthItemKeys(value.items) &&
    value.opinions.length <= MAX_REPORT_HISTORY_OPINIONS &&
    value.opinions.every(isHealthOpinion) &&
    typeof value.elapsedMs === "number" &&
    Number.isFinite(value.elapsedMs) &&
    value.elapsedMs >= 0 &&
    isBoundedString(value.sessionId, 256) &&
    value.sessionId.length > 0 &&
    typeof value.cancelled === "boolean" &&
    isString(value.commandHint)
  )
}

function loadSecurityAuthorized(): boolean {
  if (typeof localStorage === "undefined") return false
  try {
    return localStorage.getItem(SECURITY_AUTH_KEY) === "1"
  } catch {
    return false
  }
}

function persistSecurityAuthorized(value: boolean) {
  if (typeof localStorage === "undefined") return
  try {
    if (value) localStorage.setItem(SECURITY_AUTH_KEY, "1")
    else localStorage.removeItem(SECURITY_AUTH_KEY)
  } catch {
    // ignore
  }
}

function loadReportHistory(): HealthScanResult[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(REPORT_HISTORY_KEY)
    if (!raw) return []
    if (new TextEncoder().encode(raw).byteLength > MAX_REPORT_HISTORY_STORAGE_BYTES) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seenSessionIds = new Set<string>()
    return parsed
      .filter((scan): scan is HealthScanResult => {
        if (!isHealthScanResult(scan) || scan.cancelled || seenSessionIds.has(scan.sessionId))
          return false
        seenSessionIds.add(scan.sessionId)
        return true
      })
      .slice(0, MAX_REPORT_HISTORY_ENTRIES)
  } catch {
    return []
  }
}

function persistReportHistory(history: HealthScanResult[]): HealthScanResult[] {
  let retained = history.slice(0, MAX_REPORT_HISTORY_ENTRIES)
  let serialized = JSON.stringify(retained)
  while (
    retained.length > 0 &&
    new TextEncoder().encode(serialized).byteLength > MAX_REPORT_HISTORY_STORAGE_BYTES
  ) {
    retained = retained.slice(0, -1)
    serialized = JSON.stringify(retained)
  }
  if (typeof localStorage === "undefined") return retained
  try {
    localStorage.setItem(REPORT_HISTORY_KEY, serialized)
  } catch {
    // ignore
  }
  return retained
}

function fitsReportHistoryStorage(scan: HealthScanResult): boolean {
  const serialized = JSON.stringify([scan])
  return new TextEncoder().encode(serialized).byteLength <= MAX_REPORT_HISTORY_STORAGE_BYTES
}

export type NetworkProbeL1 = "basic" | "sites" | "test" | "security" | "discover"

/**
 * 会话归属的探测种类; 字面量与后端 `network-probe:scan-session` 事件的 `kind` 一致。
 * 注意与 `ProbeNode.kind`（local / remote-proxy / remote-agent）不是一回事——那是「探测原点」。
 */
export type NetworkProbeKind =
  | "health"
  | "sites"
  | "ping"
  | "traceroute"
  | "speed"
  | "ports"
  | "pcap"
  | "lan"
  | "lanServices"
  | "multiNode"

export type NetworkProbeError = LocalizedError & { scope?: NetworkProbeKind }

export type NetworkProbeOfflineSub =
  "all" | "captive" | "proxy" | "ipv6" | "mtu" | "egress" | "diff"

export type NetworkProbeL2ByL1 = Record<NetworkProbeL1, string>

export interface LatestSiteSample {
  sample: SiteSampleResult
  testedAt: number
}

const MAX_SITE_LATEST_TARGETS = 256

interface NetworkProbeState {
  nav: {
    l1Id: NetworkProbeL1
    l2ByL1: NetworkProbeL2ByL1
    offlineSub: NetworkProbeOfflineSub
  }
  capabilities: NetworkProbeCapabilities | null
  capabilityPacks: CapabilityPackInfo[]
  packProgressText: string | null
  packInstallResult: CapabilityPackInstallResult | null
  defaults: NetworkProbeDefaultsCatalog | null
  /** Version of the defaults snapshot, used to discard stale bootstrap responses. */
  defaultsSnapshotRevision: number
  summary: LocalNetworkSummary | null
  firewall: FirewallStatus | null
  hosts: HostsOverride[] | null
  tcpResult: TcpConnectResult | null
  pingResult: PingProbeResult | null
  pingStreamingSamples: PingSample[]
  dnsResult: DnsLookupResult | null
  probeResult: ProbeTargetResult | null
  sitesResult: SitesProbeResult | null
  sitesStreaming: SiteSampleResult[]
  siteLatestByTarget: Record<string, LatestSiteSample>
  siteSparklineById: Record<string, number[]>
  healthResult: HealthScanResult | null
  healthStreamingItems: HealthCheckItem[]
  networkServices: string[]
  loadingNetworkServices: boolean
  openingSystemNetworkSettings: boolean
  openingPrivacySettings: boolean
  fixResult: FixResult | null
  captiveResult: CaptivePortalResult | null
  publicIpInfo: PublicIpInfo | null
  proxyVpnStatus: ProxyVpnStatus | null
  tracerouteResult: TracerouteResult | null
  tracerouteStreamingHops: TracerouteHop[]
  ipv6Result: Ipv6StackResult | null
  mtuResult: PathMtuResult | null
  speedSources: SpeedSource[]
  speedResult: SpeedTestResult | null
  speedSample: SpeedSampleEvent | null
  speedCooldownUntil: number | null
  pollutionResult: PollutionReport | null
  whoisResult: WhoisInfo | null
  dnssecResult: DnsSecCheckResult | null
  portScanResult: PortScanResult | null
  portScanStreaming: PortSampleEvent[]
  natResult: NatProbeResult | null
  ntpResult: NtpProbeResult | null
  lanResult: LanDiscoveryResult | null
  lanProgress: LanDiscoveryProgressEvent | null
  lanServicesResult: LanServicesResult | null
  lanServicesProgress: LanServicesProgressEvent | null
  pcapResult: PcapDiagResult | null
  multiNodeDnsResult: MultiNodeDnsResult | null
  globalpingMeasurementResult: GlobalpingMeasurementResult | null
  globalpingTokenConfigured: boolean | null
  loadingGlobalpingToken: boolean
  probeNodes: ProbeNode[]
  /** Version of the live node list, used to discard stale bootstrap snapshots. */
  probeNodesRevision: number
  /** Version of the capability/pack snapshot, used to discard stale bootstrap results. */
  capabilitySnapshotRevision: number
  reportHistory: HealthScanResult[]
  securityAuthorized: boolean
  /** 按探测种类分槽的活动会话; 多类探测并发时取消目标各自独立, 不会互相抢占。 */
  activeSessionIdByKind: Record<NetworkProbeKind, string | null>
  /** 各探测种类已发出 cancel 请求的会话; 用于保证取消幂等 (A4-4)。 */
  cancelRequestedSessionIdByKind: Record<NetworkProbeKind, string | null>
  commandLog: string[]
  loadingSummary: boolean
  loadingCapabilityPacks: boolean
  loadingTcp: boolean
  loadingPing: boolean
  loadingDns: boolean
  loadingProbe: boolean
  loadingSites: boolean
  loadingHealth: boolean
  loadingFix: boolean
  loadingOffline: boolean
  loadingTraceroute: boolean
  loadingIpv6: boolean
  loadingMtu: boolean
  loadingSpeed: boolean
  loadingPollution: boolean
  loadingWhois: boolean
  loadingDnssec: boolean
  loadingPorts: boolean
  loadingNat: boolean
  loadingNtp: boolean
  loadingLan: boolean
  loadingLanServices: boolean
  loadingPcap: boolean
  loadingMultiNode: boolean
  loadingNodes: boolean
  error: NetworkProbeError | null
  overviewAutoLoadAttempted: boolean
  loadingBootstrap: boolean

  setL1: (l1Id: NetworkProbeL1) => void
  setL2: (l2Id: string, options?: { preserveError?: boolean }) => void
  setOfflineSub: (offlineSub: NetworkProbeOfflineSub) => void
  setCapabilities: (capabilities: NetworkProbeCapabilities | null) => void
  setCapabilityPacks: (capabilityPacks: CapabilityPackInfo[]) => void
  beginCapabilitySnapshotRefresh: () => void
  setCapabilitySnapshot: (
    capabilities: NetworkProbeCapabilities,
    capabilityPacks: CapabilityPackInfo[],
  ) => void
  setPackProgressText: (packProgressText: string | null) => void
  setPackInstallResult: (packInstallResult: CapabilityPackInstallResult | null) => void
  setDefaults: (defaults: NetworkProbeDefaultsCatalog | null) => void
  beginDefaultsSnapshotUpdate: () => void
  setSummary: (summary: LocalNetworkSummary | null) => void
  setFirewall: (firewall: FirewallStatus | null) => void
  setHosts: (hosts: HostsOverride[] | null) => void
  setTcpResult: (tcpResult: TcpConnectResult | null) => void
  setPingResult: (pingResult: PingProbeResult | null) => void
  resetPingStreaming: () => void
  appendPingSample: (sample: PingSample) => void
  setDnsResult: (dnsResult: DnsLookupResult | null) => void
  setProbeResult: (probeResult: ProbeTargetResult | null) => void
  setSitesResult: (sitesResult: SitesProbeResult | null) => void
  resetSitesStreaming: () => void
  upsertSiteSample: (sample: SiteSampleResult) => void
  mergeSiteLatestSamples: (samples: SiteSampleResult[]) => void
  clearSiteLatestByTargets: (targets: string[]) => void
  setHealthResult: (healthResult: HealthScanResult | null) => void
  resetHealthStreaming: () => void
  upsertHealthStreamingItem: (item: HealthCheckItem) => void
  setNetworkServices: (services: string[]) => void
  setLoadingNetworkServices: (loading: boolean) => void
  setOpeningSystemNetworkSettings: (opening: boolean) => void
  setOpeningPrivacySettings: (opening: boolean) => void
  setFixResult: (fixResult: FixResult | null) => void
  setCaptiveResult: (captiveResult: CaptivePortalResult | null) => void
  setPublicIpInfo: (publicIpInfo: PublicIpInfo | null) => void
  setProxyVpnStatus: (proxyVpnStatus: ProxyVpnStatus | null) => void
  setTracerouteResult: (tracerouteResult: TracerouteResult | null) => void
  resetTracerouteStreaming: () => void
  upsertTracerouteHop: (hop: TracerouteHop) => void
  setIpv6Result: (ipv6Result: Ipv6StackResult | null) => void
  setMtuResult: (mtuResult: PathMtuResult | null) => void
  setSpeedSources: (speedSources: SpeedSource[]) => void
  setSpeedResult: (speedResult: SpeedTestResult | null) => void
  setSpeedSample: (speedSample: SpeedSampleEvent | null) => void
  setSpeedCooldownUntil: (speedCooldownUntil: number | null) => void
  setPollutionResult: (pollutionResult: PollutionReport | null) => void
  setWhoisResult: (whoisResult: WhoisInfo | null) => void
  setDnssecResult: (dnssecResult: DnsSecCheckResult | null) => void
  setPortScanResult: (portScanResult: PortScanResult | null) => void
  resetPortScanStreaming: () => void
  upsertPortSample: (sample: PortSampleEvent) => void
  setNatResult: (natResult: NatProbeResult | null) => void
  setNtpResult: (ntpResult: NtpProbeResult | null) => void
  setLanProgress: (lanProgress: LanDiscoveryProgressEvent | null) => void
  setLanResult: (lanResult: LanDiscoveryResult | null) => void
  setLanServicesProgress: (lanServicesProgress: LanServicesProgressEvent | null) => void
  setLanServicesResult: (lanServicesResult: LanServicesResult | null) => void
  setPcapResult: (pcapResult: PcapDiagResult | null) => void
  setMultiNodeDnsResult: (multiNodeDnsResult: MultiNodeDnsResult | null) => void
  setGlobalpingMeasurementResult: (result: GlobalpingMeasurementResult | null) => void
  setGlobalpingTokenConfigured: (configured: boolean | null) => void
  setLoadingGlobalpingToken: (loading: boolean) => void
  setProbeNodes: (probeNodes: ProbeNode[]) => void
  pushReportHistory: (scan: HealthScanResult) => void
  clearReportHistory: () => void
  setSecurityAuthorized: (securityAuthorized: boolean) => void
  setActiveSessionId: (kind: NetworkProbeKind, sessionId: string | null) => void
  clearActiveSessionId: (kind: NetworkProbeKind, expectedSessionId?: string | null) => void
  setCancelRequestedSessionId: (kind: NetworkProbeKind, sessionId: string | null) => void
  clearCancelRequestedSessionId: (kind: NetworkProbeKind, expectedSessionId: string) => void
  appendCommandLog: (line: string) => void
  clearCommandLog: () => void
  setLoadingSummary: (loading: boolean) => void
  setLoadingCapabilityPacks: (loading: boolean) => void
  setLoadingBootstrap: (loading: boolean) => void
  claimOverviewAutoLoad: () => boolean
  setLoadingTcp: (loading: boolean) => void
  setLoadingPing: (loading: boolean) => void
  setLoadingDns: (loading: boolean) => void
  setLoadingProbe: (loading: boolean) => void
  setLoadingSites: (loading: boolean) => void
  setLoadingHealth: (loading: boolean) => void
  setLoadingFix: (loading: boolean) => void
  setLoadingOffline: (loading: boolean) => void
  setLoadingTraceroute: (loading: boolean) => void
  setLoadingIpv6: (loading: boolean) => void
  setLoadingMtu: (loading: boolean) => void
  setLoadingSpeed: (loading: boolean) => void
  setLoadingPollution: (loading: boolean) => void
  setLoadingWhois: (loading: boolean) => void
  setLoadingDnssec: (loading: boolean) => void
  setLoadingPorts: (loading: boolean) => void
  setLoadingNat: (loading: boolean) => void
  setLoadingNtp: (loading: boolean) => void
  setLoadingLan: (loading: boolean) => void
  setLoadingLanServices: (loading: boolean) => void
  setLoadingPcap: (loading: boolean) => void
  setLoadingMultiNode: (loading: boolean) => void
  setLoadingNodes: (loading: boolean) => void
  setError: (error: NetworkProbeError | null) => void
}

const DEFAULT_L2: NetworkProbeL2ByL1 = {
  basic: "overview",
  sites: "official",
  test: "ping",
  security: "ports",
  discover: "arp",
}

const OFFLINE_SUBS: NetworkProbeOfflineSub[] = [
  "all",
  "captive",
  "proxy",
  "ipv6",
  "mtu",
  "egress",
  "diff",
]

/** 会话槽初值: 一类探测一个槽, 并发探测各自只看得见自己那一个。 */
const EMPTY_SESSION_ID_SLOTS: Record<NetworkProbeKind, string | null> = {
  health: null,
  sites: null,
  ping: null,
  traceroute: null,
  speed: null,
  ports: null,
  pcap: null,
  lan: null,
  lanServices: null,
  multiNode: null,
}

function isOfflineSub(value: unknown): value is NetworkProbeOfflineSub {
  return typeof value === "string" && (OFFLINE_SUBS as string[]).includes(value)
}

function loadNav(): NetworkProbeState["nav"] {
  if (typeof sessionStorage === "undefined") {
    return { l1Id: "basic", l2ByL1: { ...DEFAULT_L2 }, offlineSub: "all" }
  }
  try {
    const raw = sessionStorage.getItem("network-probe:nav")
    if (!raw) return { l1Id: "basic", l2ByL1: { ...DEFAULT_L2 }, offlineSub: "all" }
    const parsed = JSON.parse(raw) as Partial<NetworkProbeState["nav"]>
    const l1Id =
      typeof parsed.l1Id === "string" &&
      Object.prototype.hasOwnProperty.call(DEFAULT_L2, parsed.l1Id)
        ? (parsed.l1Id as NetworkProbeL1)
        : "basic"
    return {
      l1Id,
      l2ByL1: { ...DEFAULT_L2, ...(parsed.l2ByL1 ?? {}) },
      offlineSub: isOfflineSub(parsed.offlineSub) ? parsed.offlineSub : "all",
    }
  } catch {
    return { l1Id: "basic", l2ByL1: { ...DEFAULT_L2 }, offlineSub: "all" }
  }
}

function persistNav(nav: NetworkProbeState["nav"]) {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.setItem("network-probe:nav", JSON.stringify(nav))
  } catch {
    // ignore quota / private mode
  }
}

function sparkMs(sample: SiteSampleResult): number | null {
  if (sample.icmpRttMs != null) return sample.icmpRttMs
  if (sample.httpTtfbMs != null) return sample.httpTtfbMs
  return null
}

function mergeLatestSiteSamples(
  previous: Record<string, LatestSiteSample>,
  samples: SiteSampleResult[],
  testedAt: number,
): Record<string, LatestSiteSample> {
  let next = previous
  for (const sample of samples) {
    const target = sample.target.trim()
    if (!target) continue
    if (next === previous) next = { ...previous }
    next[target] = { sample, testedAt }
  }

  const targets = Object.keys(next)
  if (targets.length <= MAX_SITE_LATEST_TARGETS) return next

  targets.sort((left, right) => next[left].testedAt - next[right].testedAt)
  for (const target of targets.slice(0, targets.length - MAX_SITE_LATEST_TARGETS)) {
    delete next[target]
  }
  return next
}

export const useNetworkProbeStore = create<NetworkProbeState>((set, get) => ({
  nav: loadNav(),
  capabilities: null,
  capabilityPacks: [],
  packProgressText: null,
  packInstallResult: null,
  defaults: null,
  defaultsSnapshotRevision: 0,
  summary: null,
  firewall: null,
  hosts: null,
  tcpResult: null,
  pingResult: null,
  pingStreamingSamples: [],
  dnsResult: null,
  probeResult: null,
  sitesResult: null,
  sitesStreaming: [],
  siteLatestByTarget: {},
  siteSparklineById: {},
  healthResult: null,
  healthStreamingItems: [],
  networkServices: [],
  loadingNetworkServices: false,
  openingSystemNetworkSettings: false,
  openingPrivacySettings: false,
  fixResult: null,
  captiveResult: null,
  publicIpInfo: null,
  proxyVpnStatus: null,
  tracerouteResult: null,
  tracerouteStreamingHops: [],
  ipv6Result: null,
  mtuResult: null,
  speedSources: [],
  speedResult: null,
  speedSample: null,
  speedCooldownUntil: null,
  pollutionResult: null,
  whoisResult: null,
  dnssecResult: null,
  portScanResult: null,
  portScanStreaming: [],
  natResult: null,
  ntpResult: null,
  lanResult: null,
  lanProgress: null,
  lanServicesResult: null,
  lanServicesProgress: null,
  pcapResult: null,
  multiNodeDnsResult: null,
  globalpingMeasurementResult: null,
  globalpingTokenConfigured: null,
  loadingGlobalpingToken: false,
  probeNodes: [],
  probeNodesRevision: 0,
  capabilitySnapshotRevision: 0,
  reportHistory: loadReportHistory(),
  securityAuthorized: loadSecurityAuthorized(),
  activeSessionIdByKind: { ...EMPTY_SESSION_ID_SLOTS },
  cancelRequestedSessionIdByKind: { ...EMPTY_SESSION_ID_SLOTS },
  commandLog: [],
  loadingSummary: false,
  loadingCapabilityPacks: false,
  loadingBootstrap: false,
  overviewAutoLoadAttempted: false,
  loadingTcp: false,
  loadingPing: false,
  loadingDns: false,
  loadingProbe: false,
  loadingSites: false,
  loadingHealth: false,
  loadingFix: false,
  loadingOffline: false,
  loadingTraceroute: false,
  loadingIpv6: false,
  loadingMtu: false,
  loadingSpeed: false,
  loadingPollution: false,
  loadingWhois: false,
  loadingDnssec: false,
  loadingPorts: false,
  loadingNat: false,
  loadingNtp: false,
  loadingLan: false,
  loadingLanServices: false,
  loadingPcap: false,
  loadingMultiNode: false,
  loadingNodes: false,
  error: null,

  setL1: (l1Id) => {
    const state = get()
    if (state.nav.l1Id === l1Id) return
    const nav = { ...state.nav, l1Id }
    persistNav(nav)
    set({ nav, error: null })
  },
  setL2: (l2Id, options) => {
    const { nav } = get()
    if (nav.l2ByL1[nav.l1Id] === l2Id) return
    const next = {
      ...nav,
      l2ByL1: { ...nav.l2ByL1, [nav.l1Id]: l2Id },
    }
    persistNav(next)
    set(options?.preserveError ? { nav: next } : { nav: next, error: null })
  },
  setOfflineSub: (offlineSub) => {
    const state = get()
    if (state.nav.offlineSub === offlineSub) return
    const nav = { ...state.nav, offlineSub }
    persistNav(nav)
    set({ nav, error: null })
  },
  setCapabilities: (capabilities) => set({ capabilities }),
  setCapabilityPacks: (capabilityPacks) => set({ capabilityPacks }),
  beginCapabilitySnapshotRefresh: () =>
    set((state) => ({ capabilitySnapshotRevision: state.capabilitySnapshotRevision + 1 })),
  setCapabilitySnapshot: (capabilities, capabilityPacks) =>
    set((state) => ({
      capabilities,
      capabilityPacks,
      capabilitySnapshotRevision: state.capabilitySnapshotRevision + 1,
    })),
  setPackProgressText: (packProgressText) => set({ packProgressText }),
  setPackInstallResult: (packInstallResult) => set({ packInstallResult }),
  setDefaults: (defaults) =>
    set((state) => ({
      defaults,
      defaultsSnapshotRevision: state.defaultsSnapshotRevision + 1,
    })),
  beginDefaultsSnapshotUpdate: () =>
    set((state) => ({ defaultsSnapshotRevision: state.defaultsSnapshotRevision + 1 })),
  setSummary: (summary) => set({ summary }),
  setFirewall: (firewall) => set({ firewall }),
  setHosts: (hosts) => set({ hosts }),
  setTcpResult: (tcpResult) => set({ tcpResult }),
  setPingResult: (pingResult) => set({ pingResult }),
  resetPingStreaming: () => set({ pingStreamingSamples: [] }),
  appendPingSample: (sample) =>
    set((state) => ({
      pingStreamingSamples: [
        ...state.pingStreamingSamples.filter((s) => s.seq !== sample.seq),
        sample,
      ].sort((a, b) => a.seq - b.seq),
    })),
  setDnsResult: (dnsResult) => set({ dnsResult }),
  setProbeResult: (probeResult) => set({ probeResult }),
  setSitesResult: (sitesResult) => set({ sitesResult }),
  resetSitesStreaming: () => set({ sitesStreaming: [] }),
  upsertSiteSample: (sample) =>
    set((state) => {
      const idx = state.sitesStreaming.findIndex((s) => s.id === sample.id)
      const sitesStreaming =
        idx < 0
          ? [...state.sitesStreaming, sample]
          : state.sitesStreaming.map((s, i) => (i === idx ? sample : s))
      const ms = sparkMs(sample)
      const prev = state.siteSparklineById[sample.id] ?? []
      const siteSparklineById =
        ms == null
          ? state.siteSparklineById
          : {
              ...state.siteSparklineById,
              [sample.id]: [...prev.slice(-19), ms],
            }
      const siteLatestByTarget = mergeLatestSiteSamples(
        state.siteLatestByTarget,
        [sample],
        Date.now(),
      )
      return { sitesStreaming, siteSparklineById, siteLatestByTarget }
    }),
  mergeSiteLatestSamples: (samples) =>
    set((state) => ({
      siteLatestByTarget: mergeLatestSiteSamples(state.siteLatestByTarget, samples, Date.now()),
    })),
  clearSiteLatestByTargets: (targets) =>
    set((state) => {
      const targetSet = new Set(targets.map((target) => target.trim()).filter(Boolean))
      if (targetSet.size === 0) return state
      const siteLatestByTarget = Object.fromEntries(
        Object.entries(state.siteLatestByTarget).filter(([target]) => !targetSet.has(target)),
      )
      return { siteLatestByTarget }
    }),
  setHealthResult: (healthResult) => set({ healthResult }),
  resetHealthStreaming: () => set({ healthStreamingItems: [] }),
  upsertHealthStreamingItem: (item) =>
    set((state) => {
      const idx = state.healthStreamingItems.findIndex((i) => i.key === item.key)
      if (idx < 0) {
        return { healthStreamingItems: [...state.healthStreamingItems, item] }
      }
      const next = state.healthStreamingItems.slice()
      next[idx] = item
      return { healthStreamingItems: next }
    }),
  setNetworkServices: (networkServices) => set({ networkServices }),
  setLoadingNetworkServices: (loadingNetworkServices) => set({ loadingNetworkServices }),
  setOpeningSystemNetworkSettings: (openingSystemNetworkSettings) =>
    set({ openingSystemNetworkSettings }),
  setOpeningPrivacySettings: (openingPrivacySettings) => set({ openingPrivacySettings }),
  setFixResult: (fixResult) => set({ fixResult }),
  setCaptiveResult: (captiveResult) => set({ captiveResult }),
  setPublicIpInfo: (publicIpInfo) => set({ publicIpInfo }),
  setProxyVpnStatus: (proxyVpnStatus) => set({ proxyVpnStatus }),
  setTracerouteResult: (tracerouteResult) => set({ tracerouteResult }),
  resetTracerouteStreaming: () => set({ tracerouteStreamingHops: [] }),
  upsertTracerouteHop: (hop) =>
    set((state) => {
      const idx = state.tracerouteStreamingHops.findIndex((h) => h.ttl === hop.ttl)
      if (idx < 0) {
        return {
          tracerouteStreamingHops: [...state.tracerouteStreamingHops, hop].sort(
            (a, b) => a.ttl - b.ttl,
          ),
        }
      }
      const next = state.tracerouteStreamingHops.slice()
      next[idx] = hop
      return { tracerouteStreamingHops: next }
    }),
  setIpv6Result: (ipv6Result) => set({ ipv6Result }),
  setMtuResult: (mtuResult) => set({ mtuResult }),
  setSpeedSources: (speedSources) => set({ speedSources }),
  setSpeedResult: (speedResult) => set({ speedResult }),
  setSpeedSample: (speedSample) => set({ speedSample }),
  setSpeedCooldownUntil: (speedCooldownUntil) => set({ speedCooldownUntil }),
  setPollutionResult: (pollutionResult) => set({ pollutionResult }),
  setWhoisResult: (whoisResult) => set({ whoisResult }),
  setDnssecResult: (dnssecResult) => set({ dnssecResult }),
  setPortScanResult: (portScanResult) => set({ portScanResult }),
  resetPortScanStreaming: () => set({ portScanStreaming: [] }),
  upsertPortSample: (sample) =>
    set((state) => {
      const idx = state.portScanStreaming.findIndex((s) => s.port === sample.port)
      if (idx < 0) {
        return { portScanStreaming: [...state.portScanStreaming, sample] }
      }
      const next = state.portScanStreaming.slice()
      next[idx] = sample
      return { portScanStreaming: next }
    }),
  setNatResult: (natResult) => set({ natResult }),
  setNtpResult: (ntpResult) => set({ ntpResult }),
  setLanProgress: (lanProgress) => set({ lanProgress }),
  setLanResult: (lanResult) => set({ lanResult }),
  setLanServicesProgress: (lanServicesProgress) => set({ lanServicesProgress }),
  setLanServicesResult: (lanServicesResult) => set({ lanServicesResult }),
  setPcapResult: (pcapResult) => set({ pcapResult }),
  setMultiNodeDnsResult: (multiNodeDnsResult) => set({ multiNodeDnsResult }),
  setGlobalpingMeasurementResult: (globalpingMeasurementResult) =>
    set({ globalpingMeasurementResult }),
  setGlobalpingTokenConfigured: (globalpingTokenConfigured) => set({ globalpingTokenConfigured }),
  setLoadingGlobalpingToken: (loadingGlobalpingToken) => set({ loadingGlobalpingToken }),
  setProbeNodes: (probeNodes) =>
    set((state) => ({ probeNodes, probeNodesRevision: state.probeNodesRevision + 1 })),
  pushReportHistory: (scan) =>
    set((state) => {
      if (scan.cancelled || !isHealthScanResult(scan) || !fitsReportHistoryStorage(scan)) {
        return state
      }
      const candidate = [
        scan,
        ...state.reportHistory.filter((existing) => existing.sessionId !== scan.sessionId),
      ]
      const reportHistory = persistReportHistory(candidate)
      return { reportHistory }
    }),
  clearReportHistory: () => {
    persistReportHistory([])
    set({ reportHistory: [] })
  },
  setSecurityAuthorized: (securityAuthorized) => {
    persistSecurityAuthorized(securityAuthorized)
    set({ securityAuthorized })
  },
  setActiveSessionId: (kind, sessionId) =>
    set((state) => {
      const prev = state.activeSessionIdByKind[kind]
      return {
        activeSessionIdByKind: { ...state.activeSessionIdByKind, [kind]: sessionId },
        // 该类探测换新会话时重置它的取消标记, 保证每个会话的取消可各发一次 (A4-4)。
        cancelRequestedSessionIdByKind:
          sessionId && sessionId !== prev
            ? { ...state.cancelRequestedSessionIdByKind, [kind]: null }
            : state.cancelRequestedSessionIdByKind,
      }
    }),
  clearActiveSessionId: (kind, expectedSessionId) =>
    set((state) => {
      const prev = state.activeSessionIdByKind[kind]
      // 只有当前值仍是自己那次才清: 否则先结束的那轮会把仍在跑的那轮的 Cancel 目标抹掉。
      if (expectedSessionId != null && prev !== expectedSessionId) return {}
      if (prev === null) return {}
      return { activeSessionIdByKind: { ...state.activeSessionIdByKind, [kind]: null } }
    }),
  setCancelRequestedSessionId: (kind, sessionId) =>
    set((state) => ({
      cancelRequestedSessionIdByKind: {
        ...state.cancelRequestedSessionIdByKind,
        [kind]: sessionId,
      },
    })),
  clearCancelRequestedSessionId: (kind, expectedSessionId) =>
    set((state) => {
      if (state.cancelRequestedSessionIdByKind[kind] !== expectedSessionId) return {}
      return {
        cancelRequestedSessionIdByKind: {
          ...state.cancelRequestedSessionIdByKind,
          [kind]: null,
        },
      }
    }),
  appendCommandLog: (line) =>
    set((state) => ({
      commandLog: [...state.commandLog.slice(-199), `${new Date().toISOString()} ${line}`],
    })),
  clearCommandLog: () => set({ commandLog: [] }),
  setLoadingSummary: (loadingSummary) => set({ loadingSummary }),
  setLoadingCapabilityPacks: (loadingCapabilityPacks) => set({ loadingCapabilityPacks }),
  setLoadingBootstrap: (loadingBootstrap) => set({ loadingBootstrap }),
  claimOverviewAutoLoad: () => {
    let claimed = false
    set((state) => {
      if (state.overviewAutoLoadAttempted) return state
      claimed = true
      return { overviewAutoLoadAttempted: true }
    })
    return claimed
  },
  setLoadingTcp: (loadingTcp) => set({ loadingTcp }),
  setLoadingPing: (loadingPing) => set({ loadingPing }),
  setLoadingDns: (loadingDns) => set({ loadingDns }),
  setLoadingProbe: (loadingProbe) => set({ loadingProbe }),
  setLoadingSites: (loadingSites) => set({ loadingSites }),
  setLoadingHealth: (loadingHealth) => set({ loadingHealth }),
  setLoadingFix: (loadingFix) => set({ loadingFix }),
  setLoadingOffline: (loadingOffline) => set({ loadingOffline }),
  setLoadingTraceroute: (loadingTraceroute) => set({ loadingTraceroute }),
  setLoadingIpv6: (loadingIpv6) => set({ loadingIpv6 }),
  setLoadingMtu: (loadingMtu) => set({ loadingMtu }),
  setLoadingSpeed: (loadingSpeed) => set({ loadingSpeed }),
  setLoadingPollution: (loadingPollution) => set({ loadingPollution }),
  setLoadingWhois: (loadingWhois) => set({ loadingWhois }),
  setLoadingDnssec: (loadingDnssec) => set({ loadingDnssec }),
  setLoadingPorts: (loadingPorts) => set({ loadingPorts }),
  setLoadingNat: (loadingNat) => set({ loadingNat }),
  setLoadingNtp: (loadingNtp) => set({ loadingNtp }),
  setLoadingLan: (loadingLan) => set({ loadingLan }),
  setLoadingLanServices: (loadingLanServices) => set({ loadingLanServices }),
  setLoadingPcap: (loadingPcap) => set({ loadingPcap }),
  setLoadingMultiNode: (loadingMultiNode) => set({ loadingMultiNode }),
  setLoadingNodes: (loadingNodes) => set({ loadingNodes }),
  setError: (error) =>
    set((state) => {
      if (error && state.error) {
        const { l1Id, l2ByL1, offlineSub } = state.nav
        const visibleL2 = l1Id === "basic" ? "integrated" : l2ByL1[l1Id]
        const visibleOfflineSub = l1Id === "basic" ? "all" : offlineSub
        const currentErrorVisible = isNetworkProbeErrorVisible(
          state.error,
          l1Id,
          visibleL2,
          visibleOfflineSub,
        )
        const nextErrorVisible = isNetworkProbeErrorVisible(
          error,
          l1Id,
          visibleL2,
          visibleOfflineSub,
        )

        // A late failure from another panel must not hide the active panel's error.
        if (currentErrorVisible && !nextErrorVisible) return state
      }

      return { error }
    }),
}))

export { OFFLINE_SUBS }
