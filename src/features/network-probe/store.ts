/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 */
import { create } from "zustand"
import type { LocalizedError } from "@/lib/errors"
import type {
  CaptivePortalResult,
  CapabilityPackInfo,
  CapabilityPackProgress,
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
  LanDiscoveryResult,
  LanServicesResult,
  PcapDiagResult,
  MultiNodeDnsResult,
  ProbeNode,
  TcpConnectResult,
  TracerouteHop,
  TracerouteResult,
  Ipv6StackResult,
  PathMtuResult,
} from "@/lib/tauri/types/network-probe"
import {
  createHealthReportSnapshot,
  decodeReportHistory,
  encodeReportHistory,
  REPORT_HISTORY_LIMIT,
  type HealthReportSnapshot,
} from "@/features/network-probe/report-history"

const SECURITY_AUTH_KEY = "network-probe:security-authorized"
export const REPORT_HISTORY_KEY = "network-probe:report-history"
export const REPORT_HISTORY_ENABLED_KEY = "network-probe:report-history-enabled"

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

function loadReportHistoryEnabled(): boolean {
  if (typeof localStorage === "undefined") return true
  try {
    return localStorage.getItem(REPORT_HISTORY_ENABLED_KEY) !== "0"
  } catch {
    return true
  }
}

function persistReportHistoryEnabled(enabled: boolean) {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(REPORT_HISTORY_ENABLED_KEY, enabled ? "1" : "0")
  } catch {
    // ignore
  }
}

function loadReportHistory(enabled: boolean): HealthReportSnapshot[] {
  if (typeof localStorage === "undefined") return []
  try {
    if (!enabled) {
      localStorage.removeItem(REPORT_HISTORY_KEY)
      return []
    }
    const raw = localStorage.getItem(REPORT_HISTORY_KEY)
    const history = decodeReportHistory(raw)
    if (raw && history.length > 0) {
      const migrated = encodeReportHistory(history)
      if (migrated !== raw) {
        try {
          localStorage.setItem(REPORT_HISTORY_KEY, migrated)
        } catch {
          // Keep the sanitized in-memory history if browser storage is unavailable.
        }
      }
    }
    return history
  } catch {
    return []
  }
}

function persistReportHistory(history: HealthReportSnapshot[]) {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(REPORT_HISTORY_KEY, encodeReportHistory(history))
  } catch {
    // ignore
  }
}

export type NetworkProbeL1 = "basic" | "sites" | "test" | "security" | "discover"

/**
 * 会话归属的探测种类; 字面量与后端 `network-probe:scan-session` 事件的 `kind` 一致。
 * 注意与 `ProbeNode.kind`（local / remote-proxy / remote-agent）不是一回事——那是「探测原点」。
 */
export type NetworkProbeKind =
  "health" | "sites" | "traceroute" | "speed" | "ports" | "pcap" | "lan"

export type NetworkProbeOfflineSub =
  "all" | "captive" | "proxy" | "ipv6" | "mtu" | "egress" | "diff"

export type NetworkServicesLoadStatus = "idle" | "loading" | "loaded" | "failed"
export type ProbeNodesLoadStatus = "idle" | "loading" | "loaded" | "failed"
export type AgentMutation = { kind: "add" } | { kind: "remove"; agentId: string } | null

export type NetworkProbeL2ByL1 = Record<NetworkProbeL1, string>

interface NetworkProbeState {
  nav: {
    l1Id: NetworkProbeL1
    l2ByL1: NetworkProbeL2ByL1
    offlineSub: NetworkProbeOfflineSub
  }
  capabilities: NetworkProbeCapabilities | null
  capabilityPacks: CapabilityPackInfo[]
  packProgress: CapabilityPackProgress | null
  packProgressText: string | null
  defaults: NetworkProbeDefaultsCatalog | null
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
  siteSparklineByTarget: Record<string, Array<number | null>>
  healthResult: HealthScanResult | null
  healthStreamingItems: HealthCheckItem[]
  networkServices: string[]
  networkServicesLoadStatus: NetworkServicesLoadStatus
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
  lanServicesResult: LanServicesResult | null
  pcapResult: PcapDiagResult | null
  multiNodeDnsResult: MultiNodeDnsResult | null
  probeNodes: ProbeNode[]
  probeNodesLoadStatus: ProbeNodesLoadStatus
  reportHistory: HealthReportSnapshot[]
  reportHistoryEnabled: boolean
  securityAuthorized: boolean
  /** 按探测种类分槽的活动会话; 多类探测并发时取消目标各自独立, 不会互相抢占。 */
  activeSessionIdByKind: Record<NetworkProbeKind, string | null>
  /** 各探测种类已发出 cancel 请求的会话; 用于保证取消幂等 (A4-4)。 */
  cancelRequestedSessionIdByKind: Record<NetworkProbeKind, string | null>
  commandLog: string[]
  loadingSummary: boolean
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
  loadingSystemSettings: boolean
  agentMutation: AgentMutation
  error: LocalizedError | null

  setL1: (l1Id: NetworkProbeL1) => void
  setL2: (l2Id: string) => void
  setOfflineSub: (offlineSub: NetworkProbeOfflineSub) => void
  setCapabilities: (capabilities: NetworkProbeCapabilities | null) => void
  setCapabilityPacks: (capabilityPacks: CapabilityPackInfo[]) => void
  setPackProgress: (packProgress: CapabilityPackProgress | null) => void
  setPackProgressText: (packProgressText: string | null) => void
  setDefaults: (defaults: NetworkProbeDefaultsCatalog | null) => void
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
  setHealthResult: (healthResult: HealthScanResult | null) => void
  resetHealthStreaming: () => void
  upsertHealthStreamingItem: (item: HealthCheckItem) => void
  setNetworkServices: (services: string[]) => void
  setNetworkServicesLoadStatus: (status: NetworkServicesLoadStatus) => void
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
  setLanResult: (lanResult: LanDiscoveryResult | null) => void
  setLanServicesResult: (lanServicesResult: LanServicesResult | null) => void
  setPcapResult: (pcapResult: PcapDiagResult | null) => void
  setMultiNodeDnsResult: (multiNodeDnsResult: MultiNodeDnsResult | null) => void
  setProbeNodes: (probeNodes: ProbeNode[]) => void
  setProbeNodesLoadStatus: (status: ProbeNodesLoadStatus) => void
  pushReportHistory: (scan: HealthScanResult) => void
  clearReportHistory: () => void
  setReportHistoryEnabled: (enabled: boolean) => void
  syncReportHistoryFromStorage: () => void
  setSecurityAuthorized: (securityAuthorized: boolean) => void
  setActiveSessionId: (kind: NetworkProbeKind, sessionId: string | null) => void
  clearActiveSessionId: (kind: NetworkProbeKind, expectedSessionId?: string | null) => void
  setCancelRequestedSessionId: (kind: NetworkProbeKind, sessionId: string | null) => void
  appendCommandLog: (line: string) => void
  clearCommandLog: () => void
  setLoadingSummary: (loading: boolean) => void
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
  setLoadingSystemSettings: (loading: boolean) => void
  setAgentMutation: (mutation: AgentMutation) => void
  setError: (error: LocalizedError | null) => void
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
  traceroute: null,
  speed: null,
  ports: null,
  pcap: null,
  lan: null,
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
    return {
      l1Id: parsed.l1Id && parsed.l1Id in DEFAULT_L2 ? parsed.l1Id : "basic",
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
  if (sample.httpTtfbMs != null) return sample.httpTtfbMs
  if (sample.icmpRttMs != null) return sample.icmpRttMs
  return null
}

export const useNetworkProbeStore = create<NetworkProbeState>((set, get) => ({
  nav: loadNav(),
  capabilities: null,
  capabilityPacks: [],
  packProgress: null,
  packProgressText: null,
  defaults: null,
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
  siteSparklineByTarget: {},
  healthResult: null,
  healthStreamingItems: [],
  networkServices: [],
  networkServicesLoadStatus: "idle",
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
  lanServicesResult: null,
  pcapResult: null,
  multiNodeDnsResult: null,
  probeNodes: [],
  probeNodesLoadStatus: "idle",
  reportHistoryEnabled: loadReportHistoryEnabled(),
  reportHistory: loadReportHistory(loadReportHistoryEnabled()),
  securityAuthorized: loadSecurityAuthorized(),
  activeSessionIdByKind: { ...EMPTY_SESSION_ID_SLOTS },
  cancelRequestedSessionIdByKind: { ...EMPTY_SESSION_ID_SLOTS },
  commandLog: [],
  loadingSummary: false,
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
  loadingSystemSettings: false,
  agentMutation: null,
  error: null,

  setL1: (l1Id) => {
    const nav = { ...get().nav, l1Id }
    persistNav(nav)
    set({ nav })
  },
  setL2: (l2Id) => {
    const { nav } = get()
    const next = {
      ...nav,
      l2ByL1: { ...nav.l2ByL1, [nav.l1Id]: l2Id },
    }
    persistNav(next)
    set({ nav: next })
  },
  setOfflineSub: (offlineSub) => {
    const nav = { ...get().nav, offlineSub }
    persistNav(nav)
    set({ nav })
  },
  setCapabilities: (capabilities) => set({ capabilities }),
  setCapabilityPacks: (capabilityPacks) => set({ capabilityPacks }),
  setPackProgress: (packProgress) => set({ packProgress }),
  setPackProgressText: (packProgressText) => set({ packProgressText }),
  setDefaults: (defaults) => set({ defaults }),
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
      const target = sample.target.trim()
      const prev = state.siteSparklineByTarget[target] ?? []
      const retained = Object.entries(state.siteSparklineByTarget).filter(([key]) => key !== target)
      // Bound in-memory history even when users repeatedly add arbitrary custom targets.
      const siteSparklineByTarget = Object.fromEntries([
        ...retained.slice(-99),
        [target, [...prev.slice(-19), sample.ok ? ms : null]],
      ])
      return { sitesStreaming, siteSparklineByTarget }
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
  setNetworkServicesLoadStatus: (networkServicesLoadStatus) => set({ networkServicesLoadStatus }),
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
  setLanResult: (lanResult) => set({ lanResult }),
  setLanServicesResult: (lanServicesResult) => set({ lanServicesResult }),
  setPcapResult: (pcapResult) => set({ pcapResult }),
  setMultiNodeDnsResult: (multiNodeDnsResult) => set({ multiNodeDnsResult }),
  setProbeNodes: (probeNodes) => set({ probeNodes }),
  setProbeNodesLoadStatus: (probeNodesLoadStatus) => set({ probeNodesLoadStatus }),
  pushReportHistory: (scan) =>
    set((state) => {
      const persistedEnabled = loadReportHistoryEnabled()
      if (!state.reportHistoryEnabled || !persistedEnabled) {
        if (!persistedEnabled) {
          persistReportHistory([])
          return { reportHistoryEnabled: false, reportHistory: [] }
        }
        return state
      }
      const reportHistory = [
        createHealthReportSnapshot(scan, Date.now()),
        ...state.reportHistory,
      ].slice(0, REPORT_HISTORY_LIMIT)
      persistReportHistory(reportHistory)
      // Another window can turn history off between the pre-write check and setItem.
      // Recheck after writing so a stale window cannot restore snapshots after opt-out.
      if (!loadReportHistoryEnabled()) {
        persistReportHistory([])
        return { reportHistoryEnabled: false, reportHistory: [] }
      }
      return { reportHistory }
    }),
  clearReportHistory: () => {
    persistReportHistory([])
    set({ reportHistory: [] })
  },
  setReportHistoryEnabled: (reportHistoryEnabled) => {
    persistReportHistoryEnabled(reportHistoryEnabled)
    if (!reportHistoryEnabled) {
      persistReportHistory([])
      set({ reportHistoryEnabled, reportHistory: [] })
      return
    }
    set({ reportHistoryEnabled })
  },
  syncReportHistoryFromStorage: () => {
    const reportHistoryEnabled = loadReportHistoryEnabled()
    const reportHistory = loadReportHistory(reportHistoryEnabled)
    set({ reportHistoryEnabled, reportHistory })
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
  appendCommandLog: (line) =>
    set((state) => ({
      commandLog: [...state.commandLog.slice(-199), `${new Date().toISOString()} ${line}`],
    })),
  clearCommandLog: () => set({ commandLog: [] }),
  setLoadingSummary: (loadingSummary) => set({ loadingSummary }),
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
  setLoadingSystemSettings: (loadingSystemSettings) => set({ loadingSystemSettings }),
  setAgentMutation: (agentMutation) => set({ agentMutation }),
  setError: (error) => set({ error }),
}))

export { OFFLINE_SUBS }
