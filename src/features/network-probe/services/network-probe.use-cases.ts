/**
 * Use Cases / 用例: orchestrate feature flows; 只编排业务流.
 */
import { networkProbeRepository } from "@/features/network-probe/services/network-probe.repository"
import { redactCommandTarget } from "@/features/network-probe/redact-command-target"
import { type NetworkProbeKind, useNetworkProbeStore } from "@/features/network-probe/store"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import { getErrorCode, getErrorMessage } from "@/lib/tauri/errors"
import type {
  CapabilityPackInstallResult,
  CapabilityPackProgress,
  HealthCheckItem,
  LanDiscoveryProgressEvent,
  LanServicesProgressEvent,
  PingSampleEvent,
  SiteSampleResult,
  SpeedSampleEvent,
  PortSampleEvent,
  ProbeNode,
  MultiNodeDnsResult,
  GlobalpingMeasurementResult,
  TracerouteHop,
  DefaultsOverride,
  NetworkProbeDefaultsCatalog,
} from "@/lib/tauri/types/network-probe"
import { listenToPlatformEvent } from "@/platform/events"

/**
 * 订阅 scan-session 事件, 把后端回传的会话只写进「本类探测专属」的槽位。
 * 分槽的原因: 体检 / 端口扫描等可以并发跑, 共用一个槽会让 Cancel 打错目标,
 * 或先结束的那轮无条件清空槽, 令仍在跑的面板失去取消能力。
 */
function createScanSessionTracker(kind: NetworkProbeKind) {
  let sessionId: string | null = null
  let unlisten: (() => void) | undefined
  return {
    async start() {
      // 起跑先占位清空, 槽里之后只可能是本轮会话, 取消目标不会串到上一轮。
      useNetworkProbeStore.getState().setActiveSessionId(kind, null)
      unlisten = await listenToPlatformEvent<{ sessionId: string; kind: string }>(
        TAURI_EVENTS.networkProbe.scanSession,
        (event) => {
          if (event.payload.kind !== kind) return
          sessionId = event.payload.sessionId
          useNetworkProbeStore.getState().setActiveSessionId(kind, sessionId)
        },
      )
    },
    stop() {
      unlisten?.()
      unlisten = undefined
      // 只清自己这轮占的槽, 别的探测进度不受影响。
      useNetworkProbeStore.getState().clearActiveSessionId(kind, sessionId)
    },
  }
}

function upsertProbeNode(nodes: ProbeNode[], updatedNode: ProbeNode): ProbeNode[] {
  const index = nodes.findIndex((node) => node.id === updatedNode.id)
  if (index < 0) return [...nodes, updatedNode]

  const nextNodes = [...nodes]
  nextNodes[index] = updatedNode
  return nextNodes
}

function pingErrorKey(error: unknown): string {
  const code = getErrorCode(error)
  if (code === "ICMP_UNAVAILABLE") return "networkProbe.errors.icmpUnavailable"
  if (code === "DNS_RESOLUTION_FAILED") return "networkProbe.errors.pingDnsResolutionFailed"
  return "networkProbe.errors.pingFailed"
}

function agentRegistryErrorKey(error: unknown): string | null {
  const code = getErrorCode(error)
  if (code === "AGENT_LIMIT_REACHED") return "networkProbe.errors.agentLimitReached"
  if (code === "AGENT_REGISTRY_ENTRY_LIMIT_EXCEEDED") {
    return "networkProbe.errors.agentRegistryLimitExceeded"
  }
  if (code === "AGENT_REGISTRY_TOO_LARGE") return "networkProbe.errors.agentRegistryTooLarge"
  return null
}

function isBootstrapErrorKey(key: string): boolean {
  return (
    key === "networkProbe.errors.bootstrapFailed" ||
    key === "networkProbe.errors.agentLimitReached" ||
    key === "networkProbe.errors.agentRegistryLimitExceeded" ||
    key === "networkProbe.errors.agentRegistryTooLarge"
  )
}

function pcapErrorKey(error: unknown): string {
  const code = getErrorCode(error)
  if (code === "PCAP_PRIVILEGE") return "networkProbe.errors.pcapPermissionRequired"
  if (code === "PCAP_NO_TCPDUMP") return "networkProbe.errors.pcapTcpdumpUnavailable"
  return "networkProbe.errors.pcapFailed"
}

function packFailureResult(packId: string, message: string): CapabilityPackInstallResult {
  return {
    packId,
    ok: false,
    mode: "failed",
    message,
    commandHint: `installCapabilityPack('${packId}') // failed`,
  }
}

export const networkProbeUseCases = {
  async bootstrap() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingBootstrap) return
    const probeNodesRevisionAtStart = store.probeNodesRevision
    const defaultsSnapshotRevisionAtStart = store.defaultsSnapshotRevision
    const capabilitySnapshotRevisionAtStart = store.capabilitySnapshotRevision
    store.setLoadingBootstrap(true)
    try {
      const results = await Promise.allSettled([
        networkProbeRepository.getCapabilities(),
        networkProbeRepository.getDefaults(),
        networkProbeRepository.listCapabilityPacks(),
        networkProbeRepository.listProbeNodes(),
      ] as const)

      const [capabilities, defaults, packs, nodes] = results
      if (
        useNetworkProbeStore.getState().capabilitySnapshotRevision ===
        capabilitySnapshotRevisionAtStart
      ) {
        if (capabilities.status === "fulfilled") store.setCapabilities(capabilities.value)
        if (packs.status === "fulfilled") store.setCapabilityPacks(packs.value)
      }
      if (
        defaults.status === "fulfilled" &&
        useNetworkProbeStore.getState().defaultsSnapshotRevision === defaultsSnapshotRevisionAtStart
      ) {
        store.setDefaults(defaults.value)
      }
      if (nodes.status === "fulfilled") {
        // Bootstrap is a snapshot request. Do not let a slow response overwrite a
        // registry refresh/add/remove that completed while the other bootstrap
        // sources were still loading.
        if (useNetworkProbeStore.getState().probeNodesRevision === probeNodesRevisionAtStart) {
          store.setProbeNodes(nodes.value)
        }
      }

      const sources = ["capabilities", "defaults", "packs", "nodes"] as const
      const failures = results.flatMap((result, index) => {
        if (result.status === "fulfilled") return []
        const source = sources[index] ?? "unknown"
        return [`${source}: ${getErrorMessage(result.reason)}`]
      })
      const registryError = nodes.status === "rejected" ? agentRegistryErrorKey(nodes.reason) : null
      if (failures.length) {
        useNetworkProbeStore.getState().setError({
          key: registryError ?? "networkProbe.errors.bootstrapFailed",
          fallback: failures.join("; "),
        })
      } else {
        const currentError = useNetworkProbeStore.getState().error
        if (currentError && isBootstrapErrorKey(currentError.key)) store.setError(null)
      }
    } catch (error) {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.bootstrapFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingBootstrap(false)
    }
  },

  async refreshOverview() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSummary) return
    store.setLoadingSummary(true)
    store.setError(null)
    try {
      let failureReported = false
      const observe = <T>(request: Promise<T>) =>
        request.catch((error: unknown) => {
          if (!failureReported) {
            failureReported = true
            useNetworkProbeStore.getState().setError({
              key: "networkProbe.errors.overviewFailed",
              fallback: getErrorMessage(error),
            })
          }
          throw error
        })
      const outcomes = await Promise.allSettled([
        observe(Promise.resolve().then(() => networkProbeRepository.getLocalNetworkSummary())),
        observe(Promise.resolve().then(() => networkProbeRepository.getFirewallStatus())),
        observe(Promise.resolve().then(() => networkProbeRepository.checkHostsOverrides())),
      ] as const)
      const firstFailure = outcomes.find(
        (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
      )
      if (firstFailure) {
        // Keep single-flight until the slow siblings settle, but show the failure immediately.
        store.setError({
          key: "networkProbe.errors.overviewFailed",
          fallback: getErrorMessage(firstFailure.reason),
        })
        return
      }
      const unwrap = <T>(outcome: PromiseSettledResult<T>): T => {
        if (outcome.status === "rejected") throw outcome.reason
        return outcome.value
      }
      const summary = unwrap(outcomes[0])
      const firewall = unwrap(outcomes[1])
      const hosts = unwrap(outcomes[2])
      store.setSummary(summary)
      store.setFirewall(firewall)
      store.setHosts(hosts)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.overviewFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingSummary(false)
    }
  },

  async autoLoadOverview() {
    if (!useNetworkProbeStore.getState().claimOverviewAutoLoad()) return
    await networkProbeUseCases.refreshOverview()
  },

  async runTcpConnect(host: string, port: number) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingTcp) return
    store.setLoadingTcp(true)
    store.setError(null)
    // Keep a failed rerun from leaving a previous host:port result visible as current.
    store.setTcpResult(null)
    store.appendCommandLog(`tcpConnect(local, '${redactCommandTarget(host)}', ${port})`)
    try {
      const result = await networkProbeRepository.tcpConnect(host.trim(), port)
      store.setTcpResult(result)
      store.appendCommandLog(
        `tcpConnect done status=${result.status} rttMs=${result.rttMs?.toFixed(0) ?? "n/a"}`,
      )
    } catch (error) {
      store.appendCommandLog("tcpConnect failed")
      store.setError({
        key: "networkProbe.errors.tcpFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingTcp(false)
    }
  },

  async runPing(target: string, count: number) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingPing) return
    store.setLoadingPing(true)
    store.setError(null)
    // A failed rerun must not leave a previous target's success visible as if it were current.
    store.setPingResult(null)
    store.resetPingStreaming()
    store.appendCommandLog(`pingHost('${redactCommandTarget(target)}', ${count})`)
    const sessions = createScanSessionTracker("ping")
    let unlisten: (() => void) | undefined
    try {
      await sessions.start()
      unlisten = await listenToPlatformEvent<PingSampleEvent>(
        TAURI_EVENTS.networkProbe.pingSample,
        (event) => {
          const current = useNetworkProbeStore.getState()
          if (current.activeSessionIdByKind.ping !== event.payload.sessionId) return
          current.appendPingSample(event.payload.sample)
        },
      )
      const result = await networkProbeRepository.pingHost(target.trim(), count)
      store.setPingResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `pingHost cancelled sessionId=${result.sessionId}`
          : `pingHost done sessionId=${result.sessionId} samples=${result.samples.length}`,
      )
      if (result.packetsReceived === 0) {
        store.appendCommandLog(
          "pingHost // hint: Local Network permission may be required on macOS",
        )
      }
    } catch (error) {
      store.appendCommandLog("pingHost failed")
      store.setError({
        key: pingErrorKey(error),
        fallback: getErrorMessage(error),
      })
    } finally {
      unlisten?.()
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingPing(false)
    }
  },

  async runDnsLookup(domain: string, rrType: string, resolver?: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingDns) return
    store.setLoadingDns(true)
    store.setError(null)
    // Do not let a failed query leave the previous domain's DNS records looking current.
    store.setDnsResult(null)
    store.appendCommandLog(
      `dnsLookup(local, '${redactCommandTarget(domain)}', {rrType:'${redactCommandTarget(rrType)}', resolver:'${redactCommandTarget(resolver || "system")}'})`,
    )
    try {
      const result = await networkProbeRepository.dnsLookup(domain.trim(), rrType, resolver)
      store.setDnsResult(result)
      store.appendCommandLog(
        `dnsLookup done records=${result.records.length} elapsedMs=${result.elapsedMs.toFixed(0)}`,
      )
    } catch (error) {
      store.appendCommandLog("dnsLookup failed")
      store.setError({
        key: "networkProbe.errors.dnsFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingDns(false)
    }
  },

  async runProbeTarget(input: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingProbe) return
    store.setLoadingProbe(true)
    store.setError(null)
    // A failed rerun must not leave the previous host or URL result visible as current.
    store.setProbeResult(null)
    store.appendCommandLog(`probeTarget(local, '${redactCommandTarget(input)}')`)
    try {
      const result = await networkProbeRepository.probeTarget(input.trim())
      store.setProbeResult(result)
      store.appendCommandLog(`probeTarget done kind=${result.kind}`)
    } catch (error) {
      store.appendCommandLog("probeTarget failed")
      store.setError({
        key: "networkProbe.errors.probeFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingProbe(false)
    }
  },

  async runSitesProbe(packId: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSites) return
    store.setLoadingSites(true)
    store.setError(null)
    store.resetSitesStreaming()
    store.clearSiteLatestByTargets(
      store.defaults?.sitePacks[packId]?.map((site) => site.target) ?? [],
    )
    // 重跑先清空上一轮结果, 否则面板会优先渲染旧结果而遮蔽本轮流式进度。
    store.setSitesResult(null)
    const sessions = createScanSessionTracker("sites")
    store.appendCommandLog(`startSitesProbe(local, '${packId}')`)
    let unlistenSample: (() => void) | undefined
    try {
      await sessions.start()
      unlistenSample = await listenToPlatformEvent<SiteSampleResult>(
        TAURI_EVENTS.networkProbe.siteSample,
        (event) => {
          useNetworkProbeStore.getState().upsertSiteSample(event.payload)
        },
      )
      const result = await networkProbeRepository.sitesProbe(packId)
      store.mergeSiteLatestSamples(result.results)
      store.setSitesResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `sitesProbe cancelled sessionId=${result.sessionId}`
          : `sitesProbe done pack=${result.packId} n=${result.results.length}`,
      )
    } catch (error) {
      store.appendCommandLog("sitesProbe failed")
      store.setError({
        key: "networkProbe.errors.sitesFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlistenSample?.()
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingSites(false)
    }
  },

  async runSitesProbeCustom(targets: string[]) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSites) return
    store.setLoadingSites(true)
    store.setError(null)
    store.resetSitesStreaming()
    // 同上: 单站重测也要先清掉整包结果, 避免旧数据顶替本轮进度。
    store.setSitesResult(null)
    const sessions = createScanSessionTracker("sites")
    store.appendCommandLog(`startSitesProbe(local, custom[${targets.length}])`)
    let unlistenSample: (() => void) | undefined
    try {
      await sessions.start()
      unlistenSample = await listenToPlatformEvent<SiteSampleResult>(
        TAURI_EVENTS.networkProbe.siteSample,
        (event) => {
          useNetworkProbeStore.getState().upsertSiteSample(event.payload)
        },
      )
      const result = await networkProbeRepository.sitesProbeCustom(targets)
      store.mergeSiteLatestSamples(result.results)
      store.setSitesResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `sitesProbeCustom cancelled sessionId=${result.sessionId}`
          : `sitesProbeCustom done n=${result.results.length}`,
      )
    } catch (error) {
      store.appendCommandLog("sitesProbeCustom failed")
      store.setError({
        key: "networkProbe.errors.sitesFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlistenSample?.()
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingSites(false)
    }
  },

  monitorSites(targets: string[]) {
    return networkProbeRepository.monitorSites(targets)
  },

  async runHealthScan() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingHealth) return
    store.setLoadingHealth(true)
    store.setError(null)
    store.resetHealthStreaming()
    // 重跑体检先清空上一轮结论: 报告 / 意见面板有各自空态, 不该继续显示旧扫描。
    store.setHealthResult(null)
    const sessions = createScanSessionTracker("health")
    store.appendCommandLog("startHealthScan(local)")
    let unlistenItem: (() => void) | undefined
    try {
      await sessions.start()
      unlistenItem = await listenToPlatformEvent<HealthCheckItem>(
        TAURI_EVENTS.networkProbe.healthItem,
        (event) => {
          useNetworkProbeStore.getState().upsertHealthStreamingItem(event.payload)
        },
      )
      const result = await networkProbeRepository.runHealthScan()
      store.setHealthResult(result)
      if (!result.cancelled) {
        store.pushReportHistory(result)
      }
      store.appendCommandLog(
        result.cancelled
          ? `healthScan cancelled sessionId=${result.sessionId}`
          : `healthScan done sessionId=${result.sessionId} items=${result.items.length}`,
      )
    } catch (error) {
      store.appendCommandLog("healthScan failed")
      store.setError({
        key: "networkProbe.errors.healthFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlistenItem?.()
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingHealth(false)
    }
  },

  /**
   * 取消某一类探测: 目标只从该类的槽位取, 因此体检与端口扫描并发时各取消各的。
   * 槽为空（该类没在跑）时保持 no-op, 不报错。
   */
  async cancelScan(kind: NetworkProbeKind) {
    const store = useNetworkProbeStore.getState()
    const sessionId = store.activeSessionIdByKind[kind]
    if (!sessionId) return
    // 幂等 (A4-4): 同一会话只允许发出一次 cancel 请求。
    if (store.cancelRequestedSessionIdByKind[kind] === sessionId) return
    store.setError(null)
    store.setCancelRequestedSessionId(kind, sessionId)
    store.appendCommandLog(`cancelScan('${sessionId}')`)
    try {
      await networkProbeRepository.cancelScan(sessionId)
      store.appendCommandLog(`cancelScan accepted sessionId=${sessionId}`)
    } catch (error) {
      store.appendCommandLog(`cancelScan failed sessionId=${sessionId}`)
      // Clear only this request: a newer session may already have its own cancel marker.
      store.clearCancelRequestedSessionId(kind, sessionId)
      store.setError({
        key: "networkProbe.errors.cancelFailed",
        fallback: getErrorMessage(error),
        scope: kind,
      })
    }
  },

  async loadNetworkServices() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingNetworkServices) return
    store.setLoadingNetworkServices(true)
    if (store.error?.key === "networkProbe.errors.servicesFailed") store.setError(null)
    try {
      const services = await networkProbeRepository.listNetworkServices()
      store.setNetworkServices(services)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.servicesFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingNetworkServices(false)
    }
  },

  async flushDns() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingFix) return
    store.setLoadingFix(true)
    store.setError(null)
    store.setFixResult(null)
    store.appendCommandLog("flushDns(local)")
    try {
      const result = await networkProbeRepository.flushDns()
      store.setFixResult(result)
      store.appendCommandLog(`flushDns done ok=${result.ok}`)
    } catch (error) {
      store.appendCommandLog("flushDns failed")
      store.setError({
        key: "networkProbe.errors.fixFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingFix(false)
    }
  },

  async switchDns(service: string, servers: string[]) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingFix) return
    store.setLoadingFix(true)
    store.setError(null)
    store.setFixResult(null)
    store.appendCommandLog(`switchDns(local, service='[selected]', servers=${servers.length})`)
    try {
      const result = await networkProbeRepository.switchDns(service, servers)
      store.setFixResult(result)
      store.appendCommandLog(`switchDns done ok=${result.ok}`)
    } catch (error) {
      store.appendCommandLog("switchDns failed")
      store.setError({
        key: "networkProbe.errors.fixFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingFix(false)
    }
  },

  async renewDhcp(service: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingFix) return
    store.setLoadingFix(true)
    store.setError(null)
    store.setFixResult(null)
    store.appendCommandLog("renewDhcp(local, service='[selected]')")
    try {
      const result = await networkProbeRepository.renewDhcp(service)
      store.setFixResult(result)
      store.appendCommandLog(`renewDhcp done ok=${result.ok}`)
    } catch (error) {
      store.appendCommandLog("renewDhcp failed")
      store.setError({
        key: "networkProbe.errors.fixFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingFix(false)
    }
  },

  async resetNetworkStack(service: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingFix) return
    store.setLoadingFix(true)
    store.setError(null)
    store.setFixResult(null)
    store.appendCommandLog("resetNetworkStack(local, service='[selected]')")
    try {
      const result = await networkProbeRepository.resetNetworkStack(service)
      store.setFixResult(result)
      store.appendCommandLog(`resetNetworkStack done ok=${result.ok}`)
    } catch (error) {
      store.appendCommandLog("resetNetworkStack failed")
      store.setError({
        key: "networkProbe.errors.fixFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingFix(false)
    }
  },

  async runTraceroute(target: string, maxTtl: number, rounds: number) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingTraceroute) return
    store.setLoadingTraceroute(true)
    store.setError(null)
    store.resetTracerouteStreaming()
    // 重跑先清掉上一轮跳数结果, 让本轮 streaming 可见。
    store.setTracerouteResult(null)
    const sessions = createScanSessionTracker("traceroute")
    store.appendCommandLog(
      `startTraceroute(local, '${redactCommandTarget(target)}', {maxTtl:${maxTtl},rounds:${rounds}})`,
    )
    let unlistenHop: (() => void) | undefined
    try {
      await sessions.start()
      unlistenHop = await listenToPlatformEvent<TracerouteHop>(
        TAURI_EVENTS.networkProbe.tracerouteHop,
        (event) => {
          useNetworkProbeStore.getState().upsertTracerouteHop(event.payload)
        },
      )
      const result = await networkProbeRepository.runTraceroute(target.trim(), maxTtl, rounds)
      store.setTracerouteResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `traceroute cancelled sessionId=${result.sessionId}`
          : `traceroute done hops=${result.hops.length} mode=${result.privilegeMode}`,
      )
    } catch (error) {
      store.appendCommandLog("startTraceroute failed")
      store.setError({
        key: "networkProbe.errors.tracerouteFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlistenHop?.()
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingTraceroute(false)
    }
  },

  async checkIpv6Stack() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingOffline || store.loadingIpv6) return
    store.setLoadingIpv6(true)
    store.setError(null)
    // Do not leave the previous IPv6 snapshot visible if this check fails.
    store.setIpv6Result(null)
    store.appendCommandLog("checkIpv6Stack(local)")
    try {
      const result = await networkProbeRepository.checkIpv6Stack()
      store.setIpv6Result(result)
      store.appendCommandLog(`checkIpv6Stack done status=${result.status}`)
    } catch (error) {
      store.appendCommandLog("checkIpv6Stack failed")
      store.setError({
        key: "networkProbe.errors.ipv6Failed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingIpv6(false)
    }
  },

  async probePathMtu(target: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingOffline || store.loadingMtu) return
    store.setLoadingMtu(true)
    store.setError(null)
    // A failed rerun must not leave measurements from the previous path visible as current.
    store.setMtuResult(null)
    const probeTarget = target.trim() || "1.1.1.1"
    store.appendCommandLog(`probePathMtu(local, '${redactCommandTarget(probeTarget)}')`)
    try {
      const result = await networkProbeRepository.probePathMtu(probeTarget)
      store.setMtuResult(result)
      store.appendCommandLog(
        `probePathMtu done status=${result.status} elapsedMs=${result.elapsedMs.toFixed(0)}`,
      )
    } catch (error) {
      store.appendCommandLog("probePathMtu failed")
      store.setError({
        key: "networkProbe.errors.mtuFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingMtu(false)
    }
  },

  async runOfflineDiagnostics() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingOffline || store.loadingIpv6 || store.loadingMtu) return
    store.setLoadingOffline(true)
    store.setError(null)
    // An atomic rerun replaces the whole bundle. Clear every previous card first so a failed
    // subrequest cannot leave old results looking like they came from this run.
    store.setCaptiveResult(null)
    store.setPublicIpInfo(null)
    store.setProxyVpnStatus(null)
    store.setIpv6Result(null)
    store.setMtuResult(null)
    store.appendCommandLog("runOfflineDiagnostics(local)")
    try {
      let failureReported = false
      const observe = <T>(request: Promise<T>) =>
        request.catch((error: unknown) => {
          if (!failureReported) {
            failureReported = true
            useNetworkProbeStore.getState().setError({
              key: "networkProbe.errors.offlineFailed",
              fallback: getErrorMessage(error),
            })
          }
          throw error
        })
      const outcomes = await Promise.allSettled([
        observe(Promise.resolve().then(() => networkProbeRepository.detectCaptivePortal())),
        observe(Promise.resolve().then(() => networkProbeRepository.getPublicIpInfo())),
        observe(Promise.resolve().then(() => networkProbeRepository.getProxyVpnStatus())),
        observe(Promise.resolve().then(() => networkProbeRepository.checkIpv6Stack())),
        observe(Promise.resolve().then(() => networkProbeRepository.probePathMtu("1.1.1.1"))),
      ] as const)
      const firstFailure = outcomes.find(
        (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
      )
      if (firstFailure) {
        store.appendCommandLog("runOfflineDiagnostics failed")
        // Reassert the failure after all children settle in case another panel cleared the
        // shared error banner while this bundle was still draining its requests.
        store.setError({
          key: "networkProbe.errors.offlineFailed",
          fallback: getErrorMessage(firstFailure.reason),
        })
        return
      }
      const unwrap = <T>(outcome: PromiseSettledResult<T>): T => {
        if (outcome.status === "rejected") throw outcome.reason
        return outcome.value
      }
      // Keep loadingOffline held until every child request settles. Promise.all would unlock
      // after the first rejection while slower children still run, allowing an overlapping retry.
      const captive = unwrap(outcomes[0])
      const publicIp = unwrap(outcomes[1])
      const proxyVpn = unwrap(outcomes[2])
      const ipv6 = unwrap(outcomes[3])
      const mtu = unwrap(outcomes[4])
      store.setCaptiveResult(captive)
      store.setPublicIpInfo(publicIp)
      store.setProxyVpnStatus(proxyVpn)
      store.setIpv6Result(ipv6)
      store.setMtuResult(mtu)
      store.appendCommandLog(
        `runOfflineDiagnostics done captive=${captive.status} ipv6=${ipv6.status} mtu=${mtu.status}`,
      )
    } catch (error) {
      store.appendCommandLog("runOfflineDiagnostics failed")
      store.setError({
        key: "networkProbe.errors.offlineFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingOffline(false)
    }
  },

  async refreshPublicIp() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingOffline) return
    store.setLoadingOffline(true)
    store.setError(null)
    // Keep a failed egress refresh from presenting the last IP as the current result.
    store.setPublicIpInfo(null)
    store.appendCommandLog("getPublicIpInfo()")
    try {
      const publicIp = await networkProbeRepository.getPublicIpInfo()
      store.setPublicIpInfo(publicIp)
      store.appendCommandLog(`getPublicIpInfo done available=${Boolean(publicIp.ip)}`)
    } catch (error) {
      store.appendCommandLog("getPublicIpInfo failed")
      store.setError({
        key: "networkProbe.errors.offlineFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingOffline(false)
    }
  },

  async openSystemNetworkSettings() {
    const store = useNetworkProbeStore.getState()
    if (store.openingSystemNetworkSettings) return
    store.setOpeningSystemNetworkSettings(true)
    store.setError(null)
    try {
      await networkProbeRepository.openSystemNetworkSettings()
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.openSettingsFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setOpeningSystemNetworkSettings(false)
    }
  },

  async openLocalNetworkPrivacySettings() {
    const store = useNetworkProbeStore.getState()
    if (store.openingPrivacySettings) return
    store.setOpeningPrivacySettings(true)
    store.setError(null)
    try {
      await networkProbeRepository.openPrivacySecuritySettings()
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.openSettingsFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setOpeningPrivacySettings(false)
    }
  },

  async refreshCapabilityPacks() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingCapabilityPacks) return
    store.setLoadingCapabilityPacks(true)
    store.beginCapabilitySnapshotRefresh()
    if (store.error?.key === "networkProbe.errors.packsFailed") store.setError(null)
    try {
      let failureReported = false
      const observe = <T>(request: Promise<T>) =>
        request.catch((error: unknown) => {
          if (!failureReported) {
            failureReported = true
            useNetworkProbeStore.getState().setError({
              key: "networkProbe.errors.packsFailed",
              fallback: getErrorMessage(error),
            })
          }
          throw error
        })
      const outcomes = await Promise.allSettled([
        observe(Promise.resolve().then(() => networkProbeRepository.listCapabilityPacks())),
        observe(Promise.resolve().then(() => networkProbeRepository.getCapabilities())),
      ] as const)
      const firstFailure = outcomes.find(
        (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
      )
      if (firstFailure) {
        store.setError({
          key: "networkProbe.errors.packsFailed",
          fallback: getErrorMessage(firstFailure.reason),
        })
        return
      }
      const unwrap = <T>(outcome: PromiseSettledResult<T>): T => {
        if (outcome.status === "rejected") throw outcome.reason
        return outcome.value
      }
      const packs = unwrap(outcomes[0])
      const capabilities = unwrap(outcomes[1])
      store.setCapabilitySnapshot(capabilities, packs)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.packsFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingCapabilityPacks(false)
    }
  },

  async installCapabilityPack(packId: string) {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
    store.setPackInstallResult(null)
    store.setPackProgressText(null)
    store.appendCommandLog(`installCapabilityPack('${packId}')`)
    let unlisten: (() => void) | undefined
    try {
      unlisten = await listenToPlatformEvent<CapabilityPackProgress>(
        TAURI_EVENTS.networkProbe.packProgress,
        (event) => {
          const p = event.payload
          useNetworkProbeStore
            .getState()
            .setPackProgressText(`${p.packId} ${p.phase} ${p.bytes}/${p.totalBytes}`)
        },
      )
      const result = await networkProbeRepository.installCapabilityPack(packId)
      store.setPackInstallResult(result)
      store.appendCommandLog(result.commandHint)
      store.appendCommandLog(
        result.ok ? `pack install done mode=${result.mode}` : `pack install failed: ${result.mode}`,
      )
      await networkProbeUseCases.refreshCapabilityPacks()
    } catch (error) {
      store.appendCommandLog("pack install failed")
      store.setPackInstallResult(packFailureResult(packId, getErrorMessage(error)))
      store.setError({
        key: "networkProbe.errors.packsFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlisten?.()
      useNetworkProbeStore.getState().setPackProgressText(null)
    }
  },

  async uninstallCapabilityPack(packId: string) {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
    store.setPackInstallResult(null)
    store.appendCommandLog(`uninstallCapabilityPack('${packId}')`)
    try {
      await networkProbeRepository.uninstallCapabilityPack(packId)
      store.setPackInstallResult({
        packId,
        ok: true,
        mode: "uninstalled",
        message: "",
        commandHint: `uninstallCapabilityPack('${packId}')`,
      })
      store.appendCommandLog("uninstallCapabilityPack done")
      await networkProbeUseCases.refreshCapabilityPacks()
    } catch (error) {
      store.appendCommandLog("uninstallCapabilityPack failed")
      store.setPackInstallResult(packFailureResult(packId, getErrorMessage(error)))
      store.setError({
        key: "networkProbe.errors.packsFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async loadSpeedSources() {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
    try {
      const sources = await networkProbeRepository.listSpeedSources()
      store.setSpeedSources(sources)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.speedFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async runSpeedTest(sourceId: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSpeed) return
    if (store.speedCooldownUntil != null && store.speedCooldownUntil > Date.now()) return
    store.setLoadingSpeed(true)
    store.setError(null)
    store.setSpeedSample(null)
    store.setSpeedResult(null)
    const sessions = createScanSessionTracker("speed")
    store.appendCommandLog(`startSpeedTest('${sourceId}')`)
    let unlistenSample: (() => void) | undefined
    try {
      await sessions.start()
      unlistenSample = await listenToPlatformEvent<SpeedSampleEvent>(
        TAURI_EVENTS.networkProbe.speedSample,
        (event) => {
          useNetworkProbeStore.getState().setSpeedSample(event.payload)
        },
      )
      const result = await networkProbeRepository.runSpeedTest(sourceId)
      store.setSpeedResult(result)
      if (!result.ok && !result.cancelled) {
        store.setSpeedCooldownUntil(Date.now() + 30_000)
        store.appendCommandLog("speedTest // degraded: source unavailable → 30s cooldown")
      } else {
        store.setSpeedCooldownUntil(null)
      }
      store.appendCommandLog(
        result.cancelled
          ? `speedTest cancelled sessionId=${result.sessionId}`
          : `speedTest done ok=${result.ok} dl=${result.downloadMbps ?? "—"} ul=${result.uploadMbps ?? "—"}`,
      )
    } catch (error) {
      store.appendCommandLog("speedTest failed")
      useNetworkProbeStore.getState().setSpeedCooldownUntil(Date.now() + 30_000)
      store.setError({
        key: "networkProbe.errors.speedFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlistenSample?.()
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingSpeed(false)
    }
  },

  async runPollutionCheck(domain: string) {
    const store = useNetworkProbeStore.getState()
    if (!store.securityAuthorized) {
      store.setError({
        key: "networkProbe.errors.securityAuthRequired",
        fallback: "Authorize the Security tab first.",
      })
      return
    }
    if (store.loadingPollution) return
    store.setLoadingPollution(true)
    store.setError(null)
    store.setPollutionResult(null)
    store.appendCommandLog(`detectPollution(local, '${redactCommandTarget(domain)}')`)
    try {
      const result = await networkProbeRepository.runPollutionCheck(domain.trim())
      store.setPollutionResult(result)
      store.appendCommandLog("detectPollution done")
    } catch (error) {
      store.appendCommandLog("detectPollution failed")
      store.setError({
        key: "networkProbe.errors.pollutionFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingPollution(false)
    }
  },

  async runWhois(query: string) {
    const store = useNetworkProbeStore.getState()
    if (!store.securityAuthorized) {
      store.setError({
        key: "networkProbe.errors.securityAuthRequired",
        fallback: "Authorize the Security tab first.",
      })
      return
    }
    if (store.loadingWhois) return
    store.setLoadingWhois(true)
    store.setError(null)
    store.setWhoisResult(null)
    store.appendCommandLog(`whois('${redactCommandTarget(query)}')`)
    try {
      const result = await networkProbeRepository.whoisLookup(query.trim())
      store.setWhoisResult(result)
      store.appendCommandLog("whois done")
    } catch (error) {
      store.appendCommandLog("whois failed")
      store.setError({
        key: "networkProbe.errors.whoisFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingWhois(false)
    }
  },

  async runDnssec(domain: string) {
    const store = useNetworkProbeStore.getState()
    if (!store.securityAuthorized) {
      store.setError({
        key: "networkProbe.errors.securityAuthRequired",
        fallback: "Authorize the Security tab first.",
      })
      return
    }
    if (store.loadingDnssec) return
    store.setLoadingDnssec(true)
    store.setError(null)
    store.setDnssecResult(null)
    store.appendCommandLog(`checkDnsSec('${redactCommandTarget(domain)}')`)
    try {
      const result = await networkProbeRepository.checkDnssec(domain.trim())
      store.setDnssecResult(result)
      store.appendCommandLog("checkDnsSec done")
    } catch (error) {
      store.appendCommandLog("checkDnsSec failed")
      store.setError({
        key: "networkProbe.errors.dnssecFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingDnssec(false)
    }
  },

  async runPortScan(target: string, ports: string) {
    const store = useNetworkProbeStore.getState()
    if (!store.securityAuthorized) {
      store.setError({
        key: "networkProbe.errors.securityAuthRequired",
        fallback: "Authorize the Security tab first.",
      })
      return
    }
    if (store.loadingPorts) return
    store.setLoadingPorts(true)
    store.setError(null)
    store.resetPortScanStreaming()
    store.setPortScanResult(null)
    const sessions = createScanSessionTracker("ports")
    store.appendCommandLog(`scanPorts(local, '${redactCommandTarget(target)}', ports=<redacted>)`)
    let unlistenSample: (() => void) | undefined
    try {
      await sessions.start()
      unlistenSample = await listenToPlatformEvent<PortSampleEvent>(
        TAURI_EVENTS.networkProbe.portSample,
        (event) => {
          useNetworkProbeStore.getState().upsertPortSample(event.payload)
        },
      )
      const result = await networkProbeRepository.scanPorts(target.trim(), ports.trim())
      store.setPortScanResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `scanPorts cancelled sessionId=${result.sessionId}`
          : `scanPorts done open=${result.openPorts.join(",") || "none"} mode=${result.mode}`,
      )
    } catch (error) {
      store.appendCommandLog("scanPorts failed")
      store.setError({
        key: "networkProbe.errors.portsFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlistenSample?.()
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingPorts(false)
    }
  },

  async probeNat() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingNat) return
    store.setLoadingNat(true)
    store.setError(null)
    store.setNatResult(null)
    store.appendCommandLog("probeNat(local)")
    try {
      const result = await networkProbeRepository.probeNat()
      store.setNatResult(result)
      store.appendCommandLog("probeNat done")
    } catch (error) {
      store.appendCommandLog("probeNat failed")
      store.setError({
        key: "networkProbe.errors.natFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingNat(false)
    }
  },

  async probeNtp() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingNtp) return
    store.setLoadingNtp(true)
    store.setError(null)
    store.setNtpResult(null)
    store.appendCommandLog("probeNtp(local)")
    try {
      const result = await networkProbeRepository.probeNtp()
      store.setNtpResult(result)
      store.appendCommandLog("probeNtp done")
    } catch (error) {
      store.appendCommandLog("probeNtp failed")
      store.setError({
        key: "networkProbe.errors.ntpFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingNtp(false)
    }
  },

  async discoverLan() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingLan) return
    store.setLoadingLan(true)
    store.setError(null)
    store.setLanResult(null)
    store.setLanProgress(null)
    const sessions = createScanSessionTracker("lan")
    let unlistenProgress: (() => void) | undefined
    store.appendCommandLog("scanLan(local)")
    try {
      await sessions.start()
      unlistenProgress = await listenToPlatformEvent<LanDiscoveryProgressEvent>(
        TAURI_EVENTS.networkProbe.lanDiscoveryProgress,
        (event) => {
          const activeSessionId = useNetworkProbeStore.getState().activeSessionIdByKind.lan
          if (event.payload.sessionId !== activeSessionId) return
          useNetworkProbeStore.getState().setLanProgress(event.payload)
        },
      )
      const result = await networkProbeRepository.discoverLan()
      store.setLanResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `scanLan cancelled sessionId=${result.sessionId}`
          : `scanLan done neighbors=${result.neighbors.length}`,
      )
    } catch (error) {
      store.appendCommandLog("scanLan failed")
      store.setError({
        key: "networkProbe.errors.lanFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlistenProgress?.()
      sessions.stop()
      const currentStore = useNetworkProbeStore.getState()
      currentStore.setLanProgress(null)
      currentStore.setLoadingLan(false)
    }
  },

  async browseLanServices() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingLanServices) return
    store.setLoadingLanServices(true)
    store.setError(null)
    store.setLanServicesResult(null)
    store.setLanServicesProgress(null)
    const sessions = createScanSessionTracker("lanServices")
    let unlistenProgress: (() => void) | undefined
    store.appendCommandLog("browseLanServices(local)")
    try {
      await sessions.start()
      unlistenProgress = await listenToPlatformEvent<LanServicesProgressEvent>(
        TAURI_EVENTS.networkProbe.lanServicesProgress,
        (event) => {
          const activeSessionId = useNetworkProbeStore.getState().activeSessionIdByKind.lanServices
          if (event.payload.sessionId !== activeSessionId) return
          useNetworkProbeStore.getState().setLanServicesProgress(event.payload)
        },
      )
      const result = await networkProbeRepository.browseLanServices()
      store.setLanServicesResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `browseLanServices cancelled sessionId=${result.sessionId}`
          : `browseLanServices done services=${result.items.filter((item) => item.serviceType || item.host).length}`,
      )
    } catch (error) {
      store.appendCommandLog("browseLanServices failed")
      store.setError({
        key: "networkProbe.errors.lanSvcFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlistenProgress?.()
      sessions.stop()
      const currentStore = useNetworkProbeStore.getState()
      currentStore.setLanServicesProgress(null)
      currentStore.setLoadingLanServices(false)
    }
  },

  async runPcapDiag(durationSecs?: number) {
    const store = useNetworkProbeStore.getState()
    if (!store.securityAuthorized) {
      store.setError({
        key: "networkProbe.errors.securityAuthRequired",
        fallback: "Authorize the Security tab first.",
      })
      return
    }
    if (store.loadingPcap) return
    store.setLoadingPcap(true)
    store.setError(null)
    store.setPcapResult(null)
    const sessions = createScanSessionTracker("pcap")
    store.appendCommandLog(`startPacketCapture(local, {secs:${durationSecs ?? 5}})`)
    try {
      await sessions.start()
      const result = await networkProbeRepository.runPcapDiag(durationSecs ?? 5)
      store.setPcapResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `startPacketCapture cancelled sessionId=${result.sessionId}`
          : `startPacketCapture done packets=${result.packets}`,
      )
    } catch (error) {
      store.appendCommandLog("startPacketCapture failed")
      store.setError({
        key: pcapErrorKey(error),
        fallback: getErrorMessage(error),
      })
    } finally {
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingPcap(false)
    }
  },

  async refreshProbeNodes() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingNodes) return
    store.setLoadingNodes(true)
    store.setError(null)
    try {
      const nodes = await networkProbeRepository.listProbeNodes()
      store.setProbeNodes(nodes)
    } catch (error) {
      store.setError({
        key: agentRegistryErrorKey(error) ?? "networkProbe.errors.nodesFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingNodes(false)
    }
  },

  async compareDnsMulti(domain: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingMultiNode) return
    store.setLoadingMultiNode(true)
    store.setError(null)
    store.setMultiNodeDnsResult(null)
    store.setGlobalpingMeasurementResult(null)
    store.appendCommandLog(`dnsLookup(multi, '${redactCommandTarget(domain)}')`)
    const sessions = createScanSessionTracker("multiNode")
    let unlistenProgress: (() => void) | undefined
    try {
      await sessions.start()
      unlistenProgress = await listenToPlatformEvent<MultiNodeDnsResult>(
        TAURI_EVENTS.networkProbe.multiNodeProgress,
        (event) => {
          const state = useNetworkProbeStore.getState()
          if (event.payload.sessionId !== state.activeSessionIdByKind.multiNode) return
          state.setMultiNodeDnsResult(event.payload)
        },
      )
      const result = await networkProbeRepository.compareDnsMulti(domain.trim(), [
        "world",
        "US",
        "Europe",
      ])
      store.setMultiNodeDnsResult(result)
      if (result.cancelled) {
        store.appendCommandLog(`dnsLookup(multi) stopped waiting sessionId=${result.sessionId}`)
      } else {
        store.appendCommandLog(`dnsLookup(multi) done answers=${result.answers.length}`)
      }
    } catch (error) {
      store.appendCommandLog("dnsLookup(multi) failed")
      store.setError(
        getErrorCode(error) === "INVALID_INPUT"
          ? {
              key: "networkProbe.nodes.targetInvalid",
              fallback: getErrorMessage(error),
            }
          : {
              key: "networkProbe.errors.multiNodeFailed",
              fallback: getErrorMessage(error),
            },
      )
    } finally {
      unlistenProgress?.()
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingMultiNode(false)
    }
  },

  async measureGlobalping(
    measurementType: "ping" | "http",
    target: string,
    httpMethod?: "GET" | "HEAD",
  ) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingMultiNode) return
    store.setLoadingMultiNode(true)
    store.setError(null)
    store.setMultiNodeDnsResult(null)
    store.setGlobalpingMeasurementResult(null)
    const methodHint = measurementType === "http" ? ` method=${httpMethod ?? "GET"}` : ""
    store.appendCommandLog(
      `globalping ${measurementType} '${redactCommandTarget(target)}'${methodHint}`,
    )
    const sessions = createScanSessionTracker("multiNode")
    let unlistenProgress: (() => void) | undefined
    try {
      await sessions.start()
      unlistenProgress = await listenToPlatformEvent<GlobalpingMeasurementResult>(
        TAURI_EVENTS.networkProbe.globalpingProgress,
        (event) => {
          const state = useNetworkProbeStore.getState()
          if (event.payload.sessionId !== state.activeSessionIdByKind.multiNode) return
          state.setGlobalpingMeasurementResult(event.payload)
        },
      )
      const result = await networkProbeRepository.globalpingMeasure(
        measurementType,
        target.trim(),
        httpMethod,
        ["world", "US", "Europe"],
      )
      store.setGlobalpingMeasurementResult(result)
      if (result.cancelled) {
        store.appendCommandLog(
          `globalping ${measurementType} stopped waiting sessionId=${result.sessionId}`,
        )
      } else {
        store.appendCommandLog(`globalping ${measurementType} done probes=${result.probes.length}`)
      }
    } catch (error) {
      store.appendCommandLog(`globalping ${measurementType} failed`)
      store.setError(
        getErrorCode(error) === "INVALID_INPUT"
          ? {
              key: "networkProbe.nodes.targetInvalid",
              fallback: getErrorMessage(error),
            }
          : {
              key: "networkProbe.errors.multiNodeFailed",
              fallback: getErrorMessage(error),
            },
      )
    } finally {
      unlistenProgress?.()
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingMultiNode(false)
    }
  },

  async refreshGlobalpingTokenStatus() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingGlobalpingToken) return false
    store.setLoadingGlobalpingToken(true)
    store.setError(null)
    try {
      const configured = await networkProbeRepository.getGlobalpingTokenStatus()
      useNetworkProbeStore.getState().setGlobalpingTokenConfigured(configured)
      return true
    } catch (error) {
      useNetworkProbeStore.getState().setGlobalpingTokenConfigured(null)
      store.setError({
        key: "networkProbe.errors.globalpingTokenFailed",
        fallback: getErrorMessage(error),
        scope: "multiNode",
      })
      return false
    } finally {
      useNetworkProbeStore.getState().setLoadingGlobalpingToken(false)
    }
  },

  async saveGlobalpingToken(token: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingGlobalpingToken || !token.trim()) return false
    store.setLoadingGlobalpingToken(true)
    store.setError(null)
    try {
      await networkProbeRepository.saveGlobalpingToken(token)
      useNetworkProbeStore.getState().setGlobalpingTokenConfigured(true)
      return true
    } catch (error) {
      useNetworkProbeStore.getState().setGlobalpingTokenConfigured(null)
      store.setError({
        key: "networkProbe.errors.globalpingTokenFailed",
        fallback: getErrorMessage(error),
        scope: "multiNode",
      })
      return false
    } finally {
      useNetworkProbeStore.getState().setLoadingGlobalpingToken(false)
    }
  },

  async clearGlobalpingToken() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingGlobalpingToken) return false
    store.setLoadingGlobalpingToken(true)
    store.setError(null)
    try {
      await networkProbeRepository.clearGlobalpingToken()
      useNetworkProbeStore.getState().setGlobalpingTokenConfigured(false)
      return true
    } catch (error) {
      useNetworkProbeStore.getState().setGlobalpingTokenConfigured(null)
      store.setError({
        key: "networkProbe.errors.globalpingTokenFailed",
        fallback: getErrorMessage(error),
        scope: "multiNode",
      })
      return false
    } finally {
      useNetworkProbeStore.getState().setLoadingGlobalpingToken(false)
    }
  },

  async addAgent(label: string, endpoint: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingNodes) return
    store.setLoadingNodes(true)
    store.setError(null)
    store.appendCommandLog(
      `addAgent(label='[redacted]', endpoint='${redactCommandTarget(endpoint)}')`,
    )
    try {
      const addedNode = await networkProbeRepository.addAgent(label, endpoint)
      store.appendCommandLog("addAgent done")
      const currentNodes = useNetworkProbeStore.getState().probeNodes
      if (currentNodes.length === 0) {
        // Bootstrap may have failed or still be loading. Rehydrate the local and
        // Globalping entries so the new agent cannot become the only probe origin.
        const nodes = await networkProbeRepository.listProbeNodes()
        store.setProbeNodes(nodes)
      } else {
        // Registration already checked this endpoint. Keep its result and avoid
        // reopening every agent's HTTPS/WSS connection after a successful add.
        store.setProbeNodes(upsertProbeNode(currentNodes, addedNode))
      }
    } catch (error) {
      store.appendCommandLog("addAgent failed")
      store.setError({
        key:
          getErrorCode(error) === "SSRF_BLOCKED"
            ? "networkProbe.errors.agentMetadataBlocked"
            : (agentRegistryErrorKey(error) ?? "networkProbe.errors.agentFailed"),
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingNodes(false)
    }
  },

  async removeAgent(agentId: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingNodes) return
    store.setLoadingNodes(true)
    store.setError(null)
    store.appendCommandLog(`removeAgent('${agentId}')`)
    try {
      await networkProbeRepository.removeAgent(agentId)
      const currentNodes = useNetworkProbeStore.getState().probeNodes
      store.setProbeNodes(currentNodes.filter((node) => node.id !== agentId))
      store.appendCommandLog("removeAgent done")
    } catch (error) {
      store.appendCommandLog("removeAgent failed")
      store.setError({
        key: "networkProbe.errors.agentFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingNodes(false)
    }
  },

  async installCapabilityPackVerifyFail(packId: string) {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
    store.setPackInstallResult(null)
    store.setPackProgressText(null)
    store.appendCommandLog(`installCapabilityPack('${packId}') // hash-mismatch test`)
    try {
      const result = await networkProbeRepository.installCapabilityPackVerifyFail(packId)
      store.setPackInstallResult(result)
      if (!result.ok) {
        store.appendCommandLog(`pack verify fail: ${result.mode}`)
      } else {
        store.appendCommandLog("pack verification unexpectedly passed")
      }
    } catch (error) {
      store.appendCommandLog("pack verification failed")
      store.setPackInstallResult(packFailureResult(packId, getErrorMessage(error)))
      store.setError({
        key: "networkProbe.errors.packsFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async saveDefaultsOverride(overrideData: DefaultsOverride): Promise<boolean> {
    const store = useNetworkProbeStore.getState()
    store.beginDefaultsSnapshotUpdate()
    const revision = useNetworkProbeStore.getState().defaultsSnapshotRevision
    store.setError(null)
    store.appendCommandLog("saveNetworkProbeDefaultsOverride()")
    try {
      await networkProbeRepository.saveDefaultsOverride(overrideData)
      const defaults = await networkProbeRepository.getDefaults()
      if (useNetworkProbeStore.getState().defaultsSnapshotRevision === revision) {
        store.setDefaults(defaults)
      }
      store.appendCommandLog("saveNetworkProbeDefaultsOverride done")
      return true
    } catch (error) {
      store.appendCommandLog("saveNetworkProbeDefaultsOverride failed")
      store.setError({
        key: "networkProbe.errors.defaultsFailed",
        fallback: getErrorMessage(error),
      })
      return false
    }
  },

  async resetDefaults(): Promise<NetworkProbeDefaultsCatalog | null> {
    const store = useNetworkProbeStore.getState()
    store.beginDefaultsSnapshotUpdate()
    const revision = useNetworkProbeStore.getState().defaultsSnapshotRevision
    store.setError(null)
    store.appendCommandLog("resetNetworkProbeDefaults()")
    try {
      await networkProbeRepository.resetDefaults()
      const defaults = await networkProbeRepository.getDefaults()
      if (useNetworkProbeStore.getState().defaultsSnapshotRevision === revision) {
        store.setDefaults(defaults)
      }
      store.appendCommandLog("resetNetworkProbeDefaults done")
      return useNetworkProbeStore.getState().defaults ?? defaults
    } catch (error) {
      store.appendCommandLog("resetNetworkProbeDefaults failed")
      store.setError({
        key: "networkProbe.errors.defaultsFailed",
        fallback: getErrorMessage(error),
      })
      return null
    }
  },
}
