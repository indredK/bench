/**
 * Controller Hook / 控制器: connect store and use-cases; 连接状态与用例.
 */
import { useCallback, useEffect } from "react"
import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import {
  type NetworkProbeL1,
  type NetworkProbeOfflineSub,
  useNetworkProbeStore,
} from "@/features/network-probe/store"
import { canUseTauriCommands } from "@/platform/capabilities"

function toolStatus(tools: Record<string, string> | undefined, key: string): string | undefined {
  return tools?.[key]
}

function toolEnabled(tools: Record<string, string> | undefined, key: string): boolean {
  const status = toolStatus(tools, key)
  return status === "supported" || status === "partial" || status === "degraded"
}

export function useNetworkProbeController() {
  const nav = useNetworkProbeStore((s) => s.nav)
  const capabilities = useNetworkProbeStore((s) => s.capabilities)
  const defaults = useNetworkProbeStore((s) => s.defaults)
  const summary = useNetworkProbeStore((s) => s.summary)
  const firewall = useNetworkProbeStore((s) => s.firewall)
  const hosts = useNetworkProbeStore((s) => s.hosts)
  const tcpResult = useNetworkProbeStore((s) => s.tcpResult)
  const pingResult = useNetworkProbeStore((s) => s.pingResult)
  const dnsResult = useNetworkProbeStore((s) => s.dnsResult)
  const probeResult = useNetworkProbeStore((s) => s.probeResult)
  const sitesResult = useNetworkProbeStore((s) => s.sitesResult)
  const sitesStreaming = useNetworkProbeStore((s) => s.sitesStreaming)
  const siteSparklineById = useNetworkProbeStore((s) => s.siteSparklineById)
  const healthResult = useNetworkProbeStore((s) => s.healthResult)
  const healthStreamingItems = useNetworkProbeStore((s) => s.healthStreamingItems)
  const networkServices = useNetworkProbeStore((s) => s.networkServices)
  const fixResult = useNetworkProbeStore((s) => s.fixResult)
  const captiveResult = useNetworkProbeStore((s) => s.captiveResult)
  const publicIpInfo = useNetworkProbeStore((s) => s.publicIpInfo)
  const proxyVpnStatus = useNetworkProbeStore((s) => s.proxyVpnStatus)
  const tracerouteResult = useNetworkProbeStore((s) => s.tracerouteResult)
  const tracerouteStreamingHops = useNetworkProbeStore((s) => s.tracerouteStreamingHops)
  const ipv6Result = useNetworkProbeStore((s) => s.ipv6Result)
  const mtuResult = useNetworkProbeStore((s) => s.mtuResult)
  const activeSessionId = useNetworkProbeStore((s) => s.activeSessionId)
  const commandLog = useNetworkProbeStore((s) => s.commandLog)
  const loadingSummary = useNetworkProbeStore((s) => s.loadingSummary)
  const loadingTcp = useNetworkProbeStore((s) => s.loadingTcp)
  const loadingPing = useNetworkProbeStore((s) => s.loadingPing)
  const loadingDns = useNetworkProbeStore((s) => s.loadingDns)
  const loadingProbe = useNetworkProbeStore((s) => s.loadingProbe)
  const loadingSites = useNetworkProbeStore((s) => s.loadingSites)
  const loadingHealth = useNetworkProbeStore((s) => s.loadingHealth)
  const loadingFix = useNetworkProbeStore((s) => s.loadingFix)
  const loadingOffline = useNetworkProbeStore((s) => s.loadingOffline)
  const loadingTraceroute = useNetworkProbeStore((s) => s.loadingTraceroute)
  const loadingIpv6 = useNetworkProbeStore((s) => s.loadingIpv6)
  const loadingMtu = useNetworkProbeStore((s) => s.loadingMtu)
  const error = useNetworkProbeStore((s) => s.error)
  const setL1 = useNetworkProbeStore((s) => s.setL1)
  const setL2 = useNetworkProbeStore((s) => s.setL2)
  const setOfflineSub = useNetworkProbeStore((s) => s.setOfflineSub)

  useEffect(() => {
    if (!canUseTauriCommands()) return
    void networkProbeUseCases.bootstrap()
  }, [])

  const selectL1 = useCallback(
    (id: NetworkProbeL1) => {
      setL1(id)
    },
    [setL1],
  )

  const selectL2 = useCallback(
    (id: string) => {
      setL2(id)
    },
    [setL2],
  )

  const selectOfflineSub = useCallback(
    (id: NetworkProbeOfflineSub) => {
      setOfflineSub(id)
    },
    [setOfflineSub],
  )

  const refreshOverview = useCallback(() => networkProbeUseCases.refreshOverview(), [])
  const runTcpConnect = useCallback(
    (host: string, port: number) => networkProbeUseCases.runTcpConnect(host, port),
    [],
  )
  const runPing = useCallback(
    (target: string, count: number) => networkProbeUseCases.runPing(target, count),
    [],
  )
  const runDnsLookup = useCallback(
    (domain: string, rrType: string, resolver?: string) =>
      networkProbeUseCases.runDnsLookup(domain, rrType, resolver),
    [],
  )
  const runProbeTarget = useCallback(
    (input: string) => networkProbeUseCases.runProbeTarget(input),
    [],
  )
  const runSitesProbe = useCallback(
    (packId: string) => networkProbeUseCases.runSitesProbe(packId),
    [],
  )
  const runSitesProbeCustom = useCallback(
    (targets: string[]) => networkProbeUseCases.runSitesProbeCustom(targets),
    [],
  )
  const runHealthScan = useCallback(() => networkProbeUseCases.runHealthScan(), [])
  const cancelScan = useCallback(() => networkProbeUseCases.cancelScan(), [])
  const clearCommandLog = useCallback(() => {
    useNetworkProbeStore.getState().clearCommandLog()
  }, [])
  const loadNetworkServices = useCallback(() => networkProbeUseCases.loadNetworkServices(), [])
  const flushDns = useCallback(() => networkProbeUseCases.flushDns(), [])
  const switchDns = useCallback(
    (service: string, servers: string[]) => networkProbeUseCases.switchDns(service, servers),
    [],
  )
  const renewDhcp = useCallback((service: string) => networkProbeUseCases.renewDhcp(service), [])
  const resetNetworkStack = useCallback(
    (service: string) => networkProbeUseCases.resetNetworkStack(service),
    [],
  )
  const runOfflineDiagnostics = useCallback(() => networkProbeUseCases.runOfflineDiagnostics(), [])
  const runTraceroute = useCallback(
    (target: string, maxTtl: number, rounds: number) =>
      networkProbeUseCases.runTraceroute(target, maxTtl, rounds),
    [],
  )
  const checkIpv6Stack = useCallback(() => networkProbeUseCases.checkIpv6Stack(), [])
  const probePathMtu = useCallback(
    (target: string) => networkProbeUseCases.probePathMtu(target),
    [],
  )
  const refreshPublicIp = useCallback(() => networkProbeUseCases.refreshPublicIp(), [])
  const openSystemNetworkSettings = useCallback(
    () => networkProbeUseCases.openSystemNetworkSettings(),
    [],
  )

  const l2Id = nav.l2ByL1[nav.l1Id]
  const tools = capabilities?.tools

  return {
    l1Id: nav.l1Id,
    l2Id,
    offlineSub: nav.offlineSub,
    capabilities,
    toolEnabled: {
      ping: toolEnabled(tools, "ping"),
      traceroute: toolEnabled(tools, "traceroute"),
      sitesProbe: toolEnabled(tools, "sitesProbe"),
    },
    toolStatus: {
      ping: toolStatus(tools, "ping"),
      traceroute: toolStatus(tools, "traceroute"),
      sitesProbe: toolStatus(tools, "sitesProbe"),
    },
    defaults,
    summary,
    firewall,
    hosts,
    tcpResult,
    pingResult,
    dnsResult,
    probeResult,
    sitesResult,
    sitesStreaming,
    siteSparklineById,
    healthResult,
    healthStreamingItems,
    networkServices,
    fixResult,
    captiveResult,
    publicIpInfo,
    proxyVpnStatus,
    tracerouteResult,
    tracerouteStreamingHops,
    ipv6Result,
    mtuResult,
    activeSessionId,
    commandLog,
    loadingSummary,
    loadingTcp,
    loadingPing,
    loadingDns,
    loadingProbe,
    loadingSites,
    loadingHealth,
    loadingFix,
    loadingOffline,
    loadingTraceroute,
    loadingIpv6,
    loadingMtu,
    error,
    selectL1,
    selectL2,
    selectOfflineSub,
    refreshOverview,
    runTcpConnect,
    runPing,
    runDnsLookup,
    runProbeTarget,
    runSitesProbe,
    runSitesProbeCustom,
    runHealthScan,
    cancelScan,
    clearCommandLog,
    loadNetworkServices,
    flushDns,
    switchDns,
    renewDhcp,
    resetNetworkStack,
    runOfflineDiagnostics,
    runTraceroute,
    checkIpv6Stack,
    probePathMtu,
    refreshPublicIp,
    openSystemNetworkSettings,
  }
}
