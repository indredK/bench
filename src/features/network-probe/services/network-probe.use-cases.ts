/**
 * Use Cases / 用例: orchestrate feature flows; 只编排业务流.
 */
import { networkProbeRepository } from "@/features/network-probe/services/network-probe.repository"
import { formatTcpConnectCommand } from "@/features/network-probe/utils/tcp-command"
import { redactProbeTargetForDisplay } from "@/features/network-probe/utils/probe-target-display"
import { type NetworkProbeKind, useNetworkProbeStore } from "@/features/network-probe/store"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import { getErrorCode, getErrorMessage } from "@/lib/tauri/errors"
import type {
  CapabilityPackProgress,
  HealthCheckItem,
  PingSampleEvent,
  SiteSampleResult,
  SpeedSampleEvent,
  PortSampleEvent,
  TracerouteHop,
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

function unwrapSettled<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "rejected") throw result.reason
  return result.value
}

type CapabilityPackSnapshot = [
  Awaited<ReturnType<typeof networkProbeRepository.listCapabilityPacks>>,
  Awaited<ReturnType<typeof networkProbeRepository.getCapabilities>>,
]
type ProbeNodesSnapshot = Awaited<ReturnType<typeof networkProbeRepository.listProbeNodes>>

let capabilityPackSnapshotRequest: Promise<CapabilityPackSnapshot> | null = null
let probeNodesSnapshotRequest: Promise<ProbeNodesSnapshot> | null = null

const GLOBALPING_ERROR_CODES = [
  "GP_AUTH_FAILED",
  "GP_CLIENT",
  "GP_CREDENTIAL_STORE",
  "GP_NO_PROBES",
  "GP_PACKET_COUNT_INVALID",
  "GP_PARSE",
  "GP_PROBE_FAILED",
  "GP_RATE_LIMITED",
  "GP_READ",
  "GP_REQUEST_FAILED",
  "GP_RESPONSE_TOO_LARGE",
  "GP_TIMEOUT",
  "GP_TARGET_INVALID",
  "GP_URL",
  "GP_TOKEN_INVALID",
] as const

function clearGlobalpingErrors() {
  const store = useNetworkProbeStore.getState()
  store.clearError("networkProbe.errors.globalpingFailed")
  store.clearError("errors.INVALID_INPUT")
  for (const code of GLOBALPING_ERROR_CODES) store.clearError(`errors.${code}`)
}

function globalpingErrorKey(error: unknown): string {
  const code = getErrorCode(error)
  if (code === "INVALID_INPUT") return "errors.INVALID_INPUT"
  if ((GLOBALPING_ERROR_CODES as readonly string[]).includes(code)) return `errors.${code}`
  return "networkProbe.errors.globalpingFailed"
}

function loadCapabilityPackSnapshot(): Promise<CapabilityPackSnapshot> {
  if (capabilityPackSnapshotRequest) return capabilityPackSnapshotRequest

  useNetworkProbeStore.getState().setLoadingCapabilityPacks(true)
  const request: Promise<CapabilityPackSnapshot> = Promise.resolve()
    .then(() =>
      Promise.all([
        networkProbeRepository.listCapabilityPacks(),
        networkProbeRepository.getCapabilities(),
      ]),
    )
    .then(([packs, capabilities]) => {
      useNetworkProbeStore.getState().setCapabilityPackSnapshot(packs, capabilities)
      return [packs, capabilities] as CapabilityPackSnapshot
    })
  let trackedRequest: Promise<CapabilityPackSnapshot>
  trackedRequest = request.finally(() => {
    if (capabilityPackSnapshotRequest !== trackedRequest) return
    capabilityPackSnapshotRequest = null
    useNetworkProbeStore.getState().setLoadingCapabilityPacks(false)
  })
  capabilityPackSnapshotRequest = trackedRequest
  return trackedRequest
}

function loadProbeNodesSnapshot(): Promise<ProbeNodesSnapshot> {
  if (probeNodesSnapshotRequest) return probeNodesSnapshotRequest

  useNetworkProbeStore.getState().setLoadingNodes(true)
  const request: Promise<ProbeNodesSnapshot> = Promise.resolve()
    .then(() => networkProbeRepository.listProbeNodes())
    .then((nodes) => {
      useNetworkProbeStore.getState().setProbeNodes(nodes)
      return nodes
    })
  let trackedRequest: Promise<ProbeNodesSnapshot>
  trackedRequest = request.finally(() => {
    if (probeNodesSnapshotRequest !== trackedRequest) return
    probeNodesSnapshotRequest = null
    useNetworkProbeStore.getState().setLoadingNodes(false)
  })
  probeNodesSnapshotRequest = trackedRequest
  return trackedRequest
}

export const networkProbeUseCases = {
  async bootstrap() {
    const store = useNetworkProbeStore.getState()
    store.clearError("networkProbe.errors.bootstrapFailed")
    try {
      const [, defaults] = await Promise.all([
        loadCapabilityPackSnapshot(),
        networkProbeRepository.getDefaults(),
        loadProbeNodesSnapshot(),
      ])
      store.setDefaults(defaults)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.bootstrapFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async refreshOverview() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSummary) return
    store.setLoadingSummary(true)
    store.clearError("networkProbe.errors.overviewFailed")
    try {
      const [summary, firewall, hosts] = await Promise.all([
        networkProbeRepository.getLocalNetworkSummary(),
        networkProbeRepository.getFirewallStatus(),
        networkProbeRepository.checkHostsOverrides(),
      ])
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

  async runTcpConnect(host: string, port: number) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingTcp) return
    store.setLoadingTcp(true)
    store.clearError("networkProbe.errors.tcpFailed")
    store.setTcpResult(null)
    store.appendCommandLog(formatTcpConnectCommand(host, port))
    try {
      const result = await networkProbeRepository.tcpConnect(host.trim(), port)
      store.setTcpResult(result)
    } catch (error) {
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
    store.clearError("networkProbe.errors.pingFailed")
    store.setPingResult(null)
    store.setGlobalpingPingResult(null)
    store.resetPingStreaming()
    store.appendCommandLog(`pingHost('${target.trim()}', ${count})`)
    const sessions = createScanSessionTracker("ping")
    let unlistenSamples: (() => void) | undefined
    try {
      await sessions.start()
      unlistenSamples = await listenToPlatformEvent<PingSampleEvent>(
        TAURI_EVENTS.networkProbe.pingSample,
        (event) => {
          const current = useNetworkProbeStore.getState()
          if (event.payload.sessionId !== current.activeSessionIdByKind.ping) return
          current.appendPingSample(event.payload.sample)
        },
      )
      const result = await networkProbeRepository.pingHost(target.trim(), count)
      store.setPingResult(result)
      if (result.cancelled) {
        store.appendCommandLog(
          `pingHost cancelled sessionId=${result.sessionId ?? "unknown"} packets=${result.packetsSent}`,
        )
      }
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.pingFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlistenSamples?.()
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingPing(false)
    }
  },

  async runGlobalpingPing(target: string, packets: number, location: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingPing) return
    store.setLoadingPing(true)
    clearGlobalpingErrors()
    store.setPingResult(null)
    store.setGlobalpingPingResult(null)
    store.resetPingStreaming()
    store.appendCommandLog(`globalpingPing('${target.trim()}', ${packets}, '${location}')`)
    try {
      const result = await networkProbeRepository.globalpingPing(target.trim(), packets, location)
      store.setGlobalpingPingResult(result)
    } catch (error) {
      store.setError({
        key: globalpingErrorKey(error),
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingPing(false)
    }
  },

  async runDnsLookup(domain: string, rrType: string, resolver?: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingDns) return
    store.setLoadingDns(true)
    store.clearError("networkProbe.errors.dnsFailed")
    store.setDnsResult(null)
    try {
      const result = await networkProbeRepository.dnsLookup(domain.trim(), rrType, resolver)
      store.setDnsResult(result)
    } catch (error) {
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
    store.clearError("networkProbe.errors.probeFailed")
    store.setProbeResult(null)
    store.setGlobalpingHttpResult(null)
    store.appendCommandLog(`probeTarget(local, '${redactProbeTargetForDisplay(input)}')`)
    try {
      const result = await networkProbeRepository.probeTarget(input.trim())
      store.setProbeResult(result)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.probeFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingProbe(false)
    }
  },

  async runGlobalpingHttp(input: string, location: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingProbe) return
    store.setLoadingProbe(true)
    clearGlobalpingErrors()
    store.setProbeResult(null)
    store.setGlobalpingHttpResult(null)
    // The URL may contain a signed query; never copy it into the in-app command log.
    store.appendCommandLog(`globalpingHttp(target redacted, '${location}')`)
    try {
      const result = await networkProbeRepository.globalpingHttp(input.trim(), location)
      store.setGlobalpingHttpResult(result)
    } catch (error) {
      store.setError({
        key: globalpingErrorKey(error),
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingProbe(false)
    }
  },

  clearProbeOriginResults() {
    const store = useNetworkProbeStore.getState()
    store.setPingResult(null)
    store.setGlobalpingPingResult(null)
    store.setProbeResult(null)
    store.setGlobalpingHttpResult(null)
    store.resetPingStreaming()
  },

  getGlobalpingTokenStatus() {
    return networkProbeRepository.isGlobalpingTokenConfigured()
  },

  saveGlobalpingToken(token: string) {
    return networkProbeRepository.saveGlobalpingToken(token)
  },

  deleteGlobalpingToken() {
    return networkProbeRepository.deleteGlobalpingToken()
  },

  async runSitesProbe(packId: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSites) return
    store.setLoadingSites(true)
    store.clearError("networkProbe.errors.sitesFailed")
    store.resetSitesStreaming()
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
      store.setSitesResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `sitesProbe cancelled sessionId=${result.sessionId}`
          : `sitesProbe done pack=${result.packId} n=${result.results.length}`,
      )
    } catch (error) {
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
    store.clearError("networkProbe.errors.sitesFailed")
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
      store.setSitesResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `sitesProbeCustom cancelled sessionId=${result.sessionId}`
          : `sitesProbeCustom done n=${result.results.length}`,
      )
    } catch (error) {
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

  async runHealthScan() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingHealth) return
    store.setLoadingHealth(true)
    store.clearError("networkProbe.errors.healthFailed")
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
    store.clearError("networkProbe.errors.cancelFailed")
    store.setCancelRequestedSessionId(kind, sessionId)
    store.appendCommandLog(`cancelScan('${sessionId}')`)
    try {
      await networkProbeRepository.cancelScan(sessionId)
    } catch (error) {
      const currentStore = useNetworkProbeStore.getState()
      // 失败后恢复重试能力，但不能清除后来启动的新会话的取消标记。
      if (currentStore.cancelRequestedSessionIdByKind[kind] === sessionId) {
        currentStore.setCancelRequestedSessionId(kind, null)
      }
      // 如果本会话已经结束或槽位已属于新会话，这个迟到的错误不再对用户有用。
      if (currentStore.activeSessionIdByKind[kind] === sessionId) {
        currentStore.setError({
          key: "networkProbe.errors.cancelFailed",
          fallback: getErrorMessage(error),
        })
      }
    }
  },

  async loadNetworkServices() {
    const store = useNetworkProbeStore.getState()
    if (store.networkServicesLoadState === "loading") return
    store.setNetworkServicesLoadState("loading")
    store.clearError("networkProbe.errors.servicesFailed")
    try {
      const services = await networkProbeRepository.listNetworkServices()
      useNetworkProbeStore.getState().setNetworkServices(services)
    } catch (error) {
      const currentStore = useNetworkProbeStore.getState()
      currentStore.setError({
        key: "networkProbe.errors.servicesFailed",
        fallback: getErrorMessage(error),
      })
      currentStore.setNetworkServicesLoadState("failed")
    }
  },

  async flushDns() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingFix) return
    store.setLoadingFix(true)
    store.clearError("networkProbe.errors.fixFailed")
    try {
      const result = await networkProbeRepository.flushDns()
      store.setFixResult(result)
    } catch (error) {
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
    store.clearError("networkProbe.errors.fixFailed")
    try {
      const result = await networkProbeRepository.switchDns(service, servers)
      store.setFixResult(result)
    } catch (error) {
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
    store.clearError("networkProbe.errors.fixFailed")
    try {
      const result = await networkProbeRepository.renewDhcp(service)
      store.setFixResult(result)
    } catch (error) {
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
    store.clearError("networkProbe.errors.fixFailed")
    try {
      const result = await networkProbeRepository.resetNetworkStack(service)
      store.setFixResult(result)
    } catch (error) {
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
    store.clearError("networkProbe.errors.tracerouteFailed")
    store.resetTracerouteStreaming()
    // 重跑先清掉上一轮跳数结果, 让本轮 streaming 可见。
    store.setTracerouteResult(null)
    const sessions = createScanSessionTracker("traceroute")
    store.appendCommandLog(
      `startTraceroute(local, '${target.trim()}', {maxTtl:${maxTtl},rounds:${rounds}})`,
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
    // This result is also written by the composite offline diagnostic.
    if (store.loadingIpv6 || store.loadingOffline) return
    store.setLoadingIpv6(true)
    store.clearError("networkProbe.errors.ipv6Failed")
    store.setIpv6Result(null)
    try {
      const result = await networkProbeRepository.checkIpv6Stack()
      store.setIpv6Result(result)
    } catch (error) {
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
    // The standalone Test panel shares this result slot with the offline bundle.
    if (store.loadingMtu || store.loadingOffline) return
    store.setLoadingMtu(true)
    store.clearError("networkProbe.errors.mtuFailed")
    store.setMtuResult(null)
    try {
      const result = await networkProbeRepository.probePathMtu(target.trim() || "1.1.1.1")
      store.setMtuResult(result)
    } catch (error) {
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
    // Reserve every result slot before starting; standalone IPv6/MTU panels can
    // be reached from other tabs while the composite request is still running.
    if (store.loadingOffline || store.loadingIpv6 || store.loadingMtu) return
    store.setLoadingOffline(true)
    store.clearError("networkProbe.errors.offlineFailed")
    // all-or-nothing: a failed refresh must not leave an older composite diagnosis visible.
    store.setCaptiveResult(null)
    store.setPublicIpInfo(null)
    store.setProxyVpnStatus(null)
    store.setIpv6Result(null)
    store.setMtuResult(null)
    try {
      // allSettled keeps the shared result-slot lock until every child request
      // finishes, even when one fails early. Otherwise Promise.all would unlock
      // while its remaining Tauri commands were still running.
      const [captiveResult, publicIpResult, proxyVpnResult, ipv6Result, mtuResult] =
        await Promise.allSettled([
          networkProbeRepository.detectCaptivePortal(),
          networkProbeRepository.getPublicIpInfo(),
          networkProbeRepository.getProxyVpnStatus(),
          networkProbeRepository.checkIpv6Stack(),
          networkProbeRepository.probePathMtu("1.1.1.1"),
        ])
      const captive = unwrapSettled(captiveResult)
      const publicIp = unwrapSettled(publicIpResult)
      const proxyVpn = unwrapSettled(proxyVpnResult)
      const ipv6 = unwrapSettled(ipv6Result)
      const mtu = unwrapSettled(mtuResult)
      store.setCaptiveResult(captive)
      store.setPublicIpInfo(publicIp)
      store.setProxyVpnStatus(proxyVpn)
      store.setIpv6Result(ipv6)
      store.setMtuResult(mtu)
    } catch (error) {
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
    store.clearError("networkProbe.errors.offlineFailed")
    store.setPublicIpInfo(null)
    try {
      const publicIp = await networkProbeRepository.getPublicIpInfo()
      store.setPublicIpInfo(publicIp)
    } catch (error) {
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
    store.clearError("networkProbe.errors.openSettingsFailed")
    try {
      await networkProbeRepository.openSystemNetworkSettings()
    } catch (error) {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.openSettingsFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setOpeningSystemNetworkSettings(false)
    }
  },

  async refreshCapabilityPacks() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingCapabilityPacks) return
    store.clearError("networkProbe.errors.packsFailed")
    try {
      await loadCapabilityPackSnapshot()
    } catch (error) {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.packsFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async installCapabilityPack(packId: string) {
    const store = useNetworkProbeStore.getState()
    store.clearError("networkProbe.errors.packsFailed")
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
      store.appendCommandLog(result.commandHint)
      await networkProbeUseCases.refreshCapabilityPacks()
    } catch (error) {
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
    store.clearError("networkProbe.errors.packsFailed")
    store.appendCommandLog(`uninstallCapabilityPack('${packId}')`)
    try {
      await networkProbeRepository.uninstallCapabilityPack(packId)
      await networkProbeUseCases.refreshCapabilityPacks()
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.packsFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async loadSpeedSources() {
    const store = useNetworkProbeStore.getState()
    if (store.speedSourcesLoadState === "loading") return
    store.setSpeedSourcesLoadState("loading")
    store.clearError("networkProbe.errors.speedSourcesFailed")
    try {
      const sources = await networkProbeRepository.listSpeedSources()
      store.setSpeedSources(sources)
    } catch (error) {
      const currentStore = useNetworkProbeStore.getState()
      currentStore.setSpeedSourcesLoadState("failed")
      currentStore.setError({
        key: "networkProbe.errors.speedSourcesFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async runSpeedTest(sourceId: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSpeed) return
    if (store.speedCooldownUntil != null && store.speedCooldownUntil > Date.now()) return
    store.setLoadingSpeed(true)
    store.clearError("networkProbe.errors.speedFailed")
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
    store.clearError("networkProbe.errors.pollutionFailed")
    store.setPollutionResult(null)
    store.appendCommandLog(`detectPollution(local, '${domain.trim()}')`)
    try {
      const result = await networkProbeRepository.runPollutionCheck(domain.trim())
      store.setPollutionResult(result)
    } catch (error) {
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
    store.clearError("networkProbe.errors.whoisFailed")
    store.setWhoisResult(null)
    store.appendCommandLog(`whois('${query.trim()}')`)
    try {
      const result = await networkProbeRepository.whoisLookup(query.trim())
      store.setWhoisResult(result)
    } catch (error) {
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
    store.clearError("networkProbe.errors.dnssecFailed")
    store.setDnssecResult(null)
    store.appendCommandLog(`checkDnsSec('${domain.trim()}')`)
    try {
      const result = await networkProbeRepository.checkDnssec(domain.trim())
      store.setDnssecResult(result)
    } catch (error) {
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
    store.clearError("networkProbe.errors.portsFailed")
    store.resetPortScanStreaming()
    store.setPortScanResult(null)
    const sessions = createScanSessionTracker("ports")
    store.appendCommandLog(`scanPorts(local, '${target.trim()}', '${ports.trim()}')`)
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
    store.clearError("networkProbe.errors.natFailed")
    store.setNatResult(null)
    store.appendCommandLog("probeNat(local)")
    try {
      const result = await networkProbeRepository.probeNat()
      store.setNatResult(result)
    } catch (error) {
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
    store.clearError("networkProbe.errors.ntpFailed")
    store.setNtpResult(null)
    store.appendCommandLog("probeNtp(local)")
    try {
      const result = await networkProbeRepository.probeNtp()
      store.setNtpResult(result)
    } catch (error) {
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
    store.clearError("networkProbe.errors.lanFailed")
    store.setLanResult(null)
    const sessions = createScanSessionTracker("lan")
    store.appendCommandLog("scanLan(local)")
    try {
      await sessions.start()
      const result = await networkProbeRepository.discoverLan()
      store.setLanResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `scanLan cancelled sessionId=${result.sessionId}`
          : `scanLan done neighbors=${result.neighbors.length}`,
      )
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.lanFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingLan(false)
    }
  },

  async browseLanServices() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingLanServices) return
    store.setLoadingLanServices(true)
    store.clearError("networkProbe.errors.lanServicesFailed")
    store.setLanServicesResult(null)
    store.appendCommandLog("browseLanServices(local)")
    try {
      const result = await networkProbeRepository.browseLanServices()
      store.setLanServicesResult(result)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.lanSvcFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingLanServices(false)
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
    store.clearError("networkProbe.errors.pcapFailed")
    store.setPcapResult(null)
    const sessions = createScanSessionTracker("pcap")
    store.appendCommandLog(`startPacketCapture(local, {secs:${durationSecs ?? 5}})`)
    try {
      await sessions.start()
      const result = await networkProbeRepository.runPcapDiag(durationSecs ?? 5)
      store.setPcapResult(result)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.pcapFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingPcap(false)
    }
  },

  async refreshProbeNodes() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingNodes || store.agentAction) return
    store.clearError("networkProbe.errors.nodesFailed")
    try {
      await loadProbeNodesSnapshot()
    } catch (error) {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.nodesFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async compareDnsMulti(domain: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingMultiNode) return
    store.setLoadingMultiNode(true)
    store.clearError("networkProbe.errors.multiNodeFailed")
    store.setMultiNodeDnsResult(null)
    store.appendCommandLog(`dnsLookup(multi, '${domain.trim()}')`)
    try {
      const result = await networkProbeRepository.compareDnsMulti(domain.trim(), [
        "world",
        "US",
        "Europe",
      ])
      store.setMultiNodeDnsResult(result)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.multiNodeFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingMultiNode(false)
    }
  },

  async addAgent(label: string, endpoint: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingNodes || store.agentAction) return
    store.setAgentAction({ kind: "add" })
    store.clearError("networkProbe.errors.agentFailed")
    store.clearError("networkProbe.errors.agentInvalidInput")
    store.appendCommandLog("addAgent(label, endpoint)")
    try {
      const node = await networkProbeRepository.addAgent(label, endpoint)
      const nodes = useNetworkProbeStore.getState().probeNodes
      useNetworkProbeStore
        .getState()
        .setProbeNodes([...nodes.filter((current) => current.id !== node.id), node])
    } catch (error) {
      store.setError({
        key:
          getErrorCode(error) === "INVALID_INPUT"
            ? "networkProbe.errors.agentInvalidInput"
            : "networkProbe.errors.agentFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setAgentAction(null)
    }
  },

  async removeAgent(agentId: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingNodes || store.agentAction) return
    store.setAgentAction({ kind: "remove", agentId })
    store.clearError("networkProbe.errors.agentFailed")
    store.clearError("networkProbe.errors.agentInvalidInput")
    store.appendCommandLog(`removeAgent('${agentId}')`)
    try {
      await networkProbeRepository.removeAgent(agentId)
      const nodes = await networkProbeRepository.listProbeNodes()
      store.setProbeNodes(nodes)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.agentFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setAgentAction(null)
    }
  },

  async installCapabilityPackVerifyFail(packId: string) {
    const store = useNetworkProbeStore.getState()
    store.clearError("networkProbe.errors.packsFailed")
    store.appendCommandLog(`installCapabilityPack('${packId}') // hash-mismatch test`)
    try {
      const result = await networkProbeRepository.installCapabilityPackVerifyFail(packId)
      store.setPackProgressText(result.message)
      if (!result.ok) {
        store.appendCommandLog(`pack verify fail: ${result.mode}`)
      }
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.packsFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async resetDefaults() {
    const store = useNetworkProbeStore.getState()
    store.clearError("networkProbe.errors.defaultsFailed")
    store.appendCommandLog("resetNetworkProbeDefaults()")
    try {
      await networkProbeRepository.resetDefaults()
      const defaults = await networkProbeRepository.getDefaults()
      store.setDefaults(defaults)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.defaultsFailed",
        fallback: getErrorMessage(error),
      })
    }
  },
}
