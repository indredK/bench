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
  const capabilityPacks = useNetworkProbeStore((s) => s.capabilityPacks)
  const packProgressText = useNetworkProbeStore((s) => s.packProgressText)
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
  const speedSources = useNetworkProbeStore((s) => s.speedSources)
  const speedResult = useNetworkProbeStore((s) => s.speedResult)
  const speedSample = useNetworkProbeStore((s) => s.speedSample)
  const speedCooldownUntil = useNetworkProbeStore((s) => s.speedCooldownUntil)
  const pollutionResult = useNetworkProbeStore((s) => s.pollutionResult)
  const whoisResult = useNetworkProbeStore((s) => s.whoisResult)
  const dnssecResult = useNetworkProbeStore((s) => s.dnssecResult)
  const portScanResult = useNetworkProbeStore((s) => s.portScanResult)
  const portScanStreaming = useNetworkProbeStore((s) => s.portScanStreaming)
  const natResult = useNetworkProbeStore((s) => s.natResult)
  const ntpResult = useNetworkProbeStore((s) => s.ntpResult)
  const lanResult = useNetworkProbeStore((s) => s.lanResult)
  const lanServicesResult = useNetworkProbeStore((s) => s.lanServicesResult)
  const pcapResult = useNetworkProbeStore((s) => s.pcapResult)
  const multiNodeDnsResult = useNetworkProbeStore((s) => s.multiNodeDnsResult)
  const probeNodes = useNetworkProbeStore((s) => s.probeNodes)
  const reportHistory = useNetworkProbeStore((s) => s.reportHistory)
  const securityAuthorized = useNetworkProbeStore((s) => s.securityAuthorized)
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
  const loadingSpeed = useNetworkProbeStore((s) => s.loadingSpeed)
  const loadingPollution = useNetworkProbeStore((s) => s.loadingPollution)
  const loadingWhois = useNetworkProbeStore((s) => s.loadingWhois)
  const loadingDnssec = useNetworkProbeStore((s) => s.loadingDnssec)
  const loadingPorts = useNetworkProbeStore((s) => s.loadingPorts)
  const loadingNat = useNetworkProbeStore((s) => s.loadingNat)
  const loadingNtp = useNetworkProbeStore((s) => s.loadingNtp)
  const loadingLan = useNetworkProbeStore((s) => s.loadingLan)
  const loadingLanServices = useNetworkProbeStore((s) => s.loadingLanServices)
  const loadingPcap = useNetworkProbeStore((s) => s.loadingPcap)
  const loadingMultiNode = useNetworkProbeStore((s) => s.loadingMultiNode)
  const loadingNodes = useNetworkProbeStore((s) => s.loadingNodes)
  const error = useNetworkProbeStore((s) => s.error)
  const setL1 = useNetworkProbeStore((s) => s.setL1)
  const setL2 = useNetworkProbeStore((s) => s.setL2)
  const setOfflineSub = useNetworkProbeStore((s) => s.setOfflineSub)
  const setSecurityAuthorized = useNetworkProbeStore((s) => s.setSecurityAuthorized)
  const clearReportHistory = useNetworkProbeStore((s) => s.clearReportHistory)

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
  const refreshCapabilityPacks = useCallback(
    () => networkProbeUseCases.refreshCapabilityPacks(),
    [],
  )
  const installCapabilityPack = useCallback(
    (packId: string) => networkProbeUseCases.installCapabilityPack(packId),
    [],
  )
  const uninstallCapabilityPack = useCallback(
    (packId: string) => networkProbeUseCases.uninstallCapabilityPack(packId),
    [],
  )
  const loadSpeedSources = useCallback(() => networkProbeUseCases.loadSpeedSources(), [])
  const runSpeedTest = useCallback(
    (sourceId: string) => networkProbeUseCases.runSpeedTest(sourceId),
    [],
  )
  const runPollutionCheck = useCallback(
    (domain: string) => networkProbeUseCases.runPollutionCheck(domain),
    [],
  )
  const runWhois = useCallback((query: string) => networkProbeUseCases.runWhois(query), [])
  const runDnssec = useCallback((domain: string) => networkProbeUseCases.runDnssec(domain), [])
  const runPortScan = useCallback(
    (target: string, ports: string) => networkProbeUseCases.runPortScan(target, ports),
    [],
  )
  const probeNat = useCallback(() => networkProbeUseCases.probeNat(), [])
  const probeNtp = useCallback(() => networkProbeUseCases.probeNtp(), [])
  const discoverLan = useCallback(() => networkProbeUseCases.discoverLan(), [])
  const browseLanServices = useCallback(() => networkProbeUseCases.browseLanServices(), [])
  const runPcapDiag = useCallback(
    (durationSecs?: number) => networkProbeUseCases.runPcapDiag(durationSecs),
    [],
  )
  const refreshProbeNodes = useCallback(() => networkProbeUseCases.refreshProbeNodes(), [])
  const compareDnsMulti = useCallback(
    (domain: string) => networkProbeUseCases.compareDnsMulti(domain),
    [],
  )
  const addAgent = useCallback(
    (label: string, endpoint: string) => networkProbeUseCases.addAgent(label, endpoint),
    [],
  )
  const removeAgent = useCallback(
    (agentId: string) => networkProbeUseCases.removeAgent(agentId),
    [],
  )
  const installCapabilityPackVerifyFail = useCallback(
    (packId: string) => networkProbeUseCases.installCapabilityPackVerifyFail(packId),
    [],
  )
  const authorizeSecurity = useCallback(() => setSecurityAuthorized(true), [setSecurityAuthorized])
  const revokeSecurity = useCallback(() => setSecurityAuthorized(false), [setSecurityAuthorized])
  const resetDefaults = useCallback(() => networkProbeUseCases.resetDefaults(), [])

  const l2Id = nav.l2ByL1[nav.l1Id]
  const tools = capabilities?.tools

  return {
    l1Id: nav.l1Id,
    l2Id,
    offlineSub: nav.offlineSub,
    capabilities,
    capabilityPacks,
    packProgressText,
    toolEnabled: {
      ping: toolEnabled(tools, "ping"),
      traceroute: toolEnabled(tools, "traceroute"),
      sitesProbe: toolEnabled(tools, "sitesProbe"),
      speedTest: toolEnabled(tools, "speedTest"),
      pollution: toolEnabled(tools, "pollution"),
      whois: toolEnabled(tools, "whois"),
      dnssec: toolEnabled(tools, "dnssec"),
      portScan: toolEnabled(tools, "portScan"),
      nat: toolEnabled(tools, "nat"),
      ntp: toolEnabled(tools, "ntp"),
      arp: toolEnabled(tools, "arp"),
      lanServices: toolEnabled(tools, "lanServices"),
      pcap: toolEnabled(tools, "pcap"),
      multiNode: toolEnabled(tools, "multiNode"),
    },
    toolStatus: {
      ping: toolStatus(tools, "ping"),
      traceroute: toolStatus(tools, "traceroute"),
      sitesProbe: toolStatus(tools, "sitesProbe"),
      speedTest: toolStatus(tools, "speedTest"),
      pollution: toolStatus(tools, "pollution"),
      whois: toolStatus(tools, "whois"),
      dnssec: toolStatus(tools, "dnssec"),
      portScan: toolStatus(tools, "portScan"),
      nat: toolStatus(tools, "nat"),
      ntp: toolStatus(tools, "ntp"),
      arp: toolStatus(tools, "arp"),
      lanServices: toolStatus(tools, "lanServices"),
      pcap: toolStatus(tools, "pcap"),
      multiNode: toolStatus(tools, "multiNode"),
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
    speedSources,
    speedResult,
    speedSample,
    speedCooldownUntil,
    pollutionResult,
    whoisResult,
    dnssecResult,
    portScanResult,
    portScanStreaming,
    natResult,
    ntpResult,
    lanResult,
    lanServicesResult,
    pcapResult,
    multiNodeDnsResult,
    probeNodes,
    reportHistory,
    securityAuthorized,
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
    loadingSpeed,
    loadingPollution,
    loadingWhois,
    loadingDnssec,
    loadingPorts,
    loadingNat,
    loadingNtp,
    loadingLan,
    loadingLanServices,
    loadingPcap,
    loadingMultiNode,
    loadingNodes,
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
    refreshCapabilityPacks,
    installCapabilityPack,
    uninstallCapabilityPack,
    loadSpeedSources,
    runSpeedTest,
    runPollutionCheck,
    runWhois,
    runDnssec,
    runPortScan,
    probeNat,
    probeNtp,
    discoverLan,
    browseLanServices,
    runPcapDiag,
    refreshProbeNodes,
    compareDnsMulti,
    addAgent,
    removeAgent,
    installCapabilityPackVerifyFail,
    authorizeSecurity,
    revokeSecurity,
    clearReportHistory,
    resetDefaults,
  }
}
