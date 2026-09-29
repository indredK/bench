/**
 * Use Cases / 用例: orchestrate feature flows; 只编排业务流.
 */
import { networkProbeRepository } from "@/features/network-probe/services/network-probe.repository"
import { type NetworkProbeKind, useNetworkProbeStore } from "@/features/network-probe/store"
import i18n from "@/i18n/config"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import { getErrorMessage } from "@/lib/tauri/errors"
import type {
  CapabilityPackProgress,
  ProbeServer,
  HealthCheckItem,
  PingSample,
  SiteSampleResult,
  SitesProbeResult,
  SpeedSampleEvent,
  PortSampleEvent,
  TracerouteHop,
  GlobalpingMeasurementType,
  GlobalpingMeasurementResult,
  AgentMeasurementResult,
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

export const networkProbeUseCases = {
  async bootstrap() {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
    store.setProbeNodesLoadStatus("loading")
    const results = await Promise.allSettled([
      networkProbeRepository.getCapabilities(),
      networkProbeRepository.getDefaults(),
      networkProbeRepository.listCapabilityPacks(),
      networkProbeRepository.listProbeNodes(),
    ])
    const [capabilities, defaults, packs, nodes] = results
    const failures: unknown[] = []
    if (capabilities.status === "fulfilled") store.setCapabilities(capabilities.value)
    else failures.push(capabilities.reason)
    if (defaults.status === "fulfilled") store.setDefaults(defaults.value)
    else failures.push(defaults.reason)
    if (packs.status === "fulfilled") store.setCapabilityPacks(packs.value)
    else failures.push(packs.reason)
    if (nodes.status === "fulfilled") {
      store.setProbeNodes(nodes.value)
      store.setProbeNodesLoadStatus("loaded")
    } else {
      store.setProbeNodesLoadStatus("failed")
      failures.push(nodes.reason)
    }
    if (failures.length > 0) {
      const detail = failures.map((error) => getErrorMessage(error)).join("; ")
      store.setError({
        key: "networkProbe.errors.bootstrapFailed",
        fallback: detail,
      })
    }
  },

  async refreshOverview() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSummary) return
    store.setLoadingSummary(true)
    store.setError(null)
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
    store.setError(null)
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
    store.setError(null)
    store.resetPingStreaming()
    store.appendCommandLog(`pingHost('${target.trim()}', ${count})`)
    let unlisten: (() => void) | undefined
    try {
      unlisten = await listenToPlatformEvent<PingSample>(
        TAURI_EVENTS.networkProbe.pingSample,
        (event) => {
          useNetworkProbeStore.getState().appendPingSample(event.payload)
        },
      )
      const result = await networkProbeRepository.pingHost(target.trim(), count)
      store.setPingResult(result)
      if (result.packetsReceived === 0) {
        store.appendCommandLog(
          "pingHost // hint: Local Network permission may be required on macOS",
        )
      }
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.pingFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlisten?.()
      useNetworkProbeStore.getState().setLoadingPing(false)
    }
  },

  async runDnsLookup(domain: string, rrType: string, resolver?: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingDns) return
    store.setLoadingDns(true)
    store.setError(null)
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
    store.setError(null)
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

  async runSitesProbe(packId: string): Promise<SitesProbeResult | null> {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSites) return null
    store.setLoadingSites(true)
    store.setError(null)
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
      return result
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.sitesFailed",
        fallback: getErrorMessage(error),
      })
      return null
    } finally {
      unlistenSample?.()
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingSites(false)
    }
  },

  async runSitesProbeCustom(targets: string[]): Promise<SitesProbeResult | null> {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSites) return null
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
      store.setSitesResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `sitesProbeCustom cancelled sessionId=${result.sessionId}`
          : `sitesProbeCustom done n=${result.results.length}`,
      )
      return result
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.sitesFailed",
        fallback: getErrorMessage(error),
      })
      return null
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
    store.setCancelRequestedSessionId(kind, sessionId)
    store.appendCommandLog(`cancelScan('${sessionId}')`)
    try {
      await networkProbeRepository.cancelScan(sessionId)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.cancelFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async loadNetworkServices() {
    const store = useNetworkProbeStore.getState()
    if (store.networkServicesLoadStatus === "loading") return
    store.setNetworkServicesLoadStatus("loading")
    store.setError(null)
    try {
      const services = await networkProbeRepository.listNetworkServices()
      store.setNetworkServices(services)
      store.setNetworkServicesLoadStatus("loaded")
    } catch (error) {
      useNetworkProbeStore.getState().setNetworkServicesLoadStatus("failed")
      store.setError({
        key: "networkProbe.errors.servicesFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async flushDns() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingFix) return
    store.setLoadingFix(true)
    store.setError(null)
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
    store.setError(null)
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
    store.setError(null)
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
    store.setError(null)
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
    store.setError(null)
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
    if (store.loadingIpv6) return
    store.setLoadingIpv6(true)
    store.setError(null)
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
    if (store.loadingMtu) return
    store.setLoadingMtu(true)
    store.setError(null)
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
    if (store.loadingOffline) return
    store.setLoadingOffline(true)
    store.setError(null)
    try {
      const [captive, publicIp, proxyVpn, ipv6, mtu] = await Promise.all([
        networkProbeRepository.detectCaptivePortal(),
        networkProbeRepository.getPublicIpInfo(),
        networkProbeRepository.getProxyVpnStatus(),
        networkProbeRepository.checkIpv6Stack(),
        networkProbeRepository.probePathMtu("1.1.1.1"),
      ])
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
    store.setError(null)
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
    if (store.loadingSystemSettings) return
    store.setLoadingSystemSettings(true)
    store.setError(null)
    try {
      await networkProbeRepository.openSystemNetworkSettings()
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.openSettingsFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingSystemSettings(false)
    }
  },

  async refreshCapabilityPacks() {
    const store = useNetworkProbeStore.getState()
    try {
      const [packs, capabilities] = await Promise.all([
        networkProbeRepository.listCapabilityPacks(),
        networkProbeRepository.getCapabilities(),
      ])
      store.setCapabilityPacks(packs)
      store.setCapabilities(capabilities)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.packsFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async installCapabilityPack(packId: string) {
    const store = useNetworkProbeStore.getState()
    const operationId = crypto.randomUUID()
    store.setError(null)
    store.setPackProgress(null)
    store.setPackProgressText(null)
    store.appendCommandLog(`installCapabilityPack('${packId}')`)
    let unlisten: (() => void) | undefined
    try {
      unlisten = await listenToPlatformEvent<CapabilityPackProgress>(
        TAURI_EVENTS.networkProbe.packProgress,
        (event) => {
          const p = event.payload
          if (p.operationId !== operationId || p.packId !== packId) return
          useNetworkProbeStore.getState().setPackProgress(p)
        },
      )
      const result = await networkProbeRepository.installCapabilityPack(packId, operationId)
      store.appendCommandLog(result.commandHint)
      if (!result.ok) {
        store.appendCommandLog(result.message)
        store.setError({
          key: "networkProbe.errors.packInstallFailed",
          fallback: result.message,
        })
      }
      await networkProbeUseCases.refreshCapabilityPacks()
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.packsFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlisten?.()
      useNetworkProbeStore.getState().setPackProgress(null)
      useNetworkProbeStore.getState().setPackProgressText(null)
    }
  },

  async uninstallCapabilityPack(packId: string) {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
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
    store.setError(null)
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
    store.setError(null)
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
    store.setError(null)
    store.resetPortScanStreaming()
    store.setPortScanResult(null)
    store.setPortFingerprintResult(null)
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

  async runPortFingerprint(target: string, ports: string, includeOs: boolean) {
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
    store.setPortFingerprintResult(null)
    const sessions = createScanSessionTracker("ports")
    store.appendCommandLog(
      `fingerprint(local, '${target.trim()}', '${ports.trim()}', includeOs=${includeOs})`,
    )
    try {
      await sessions.start()
      const result = await networkProbeRepository.fingerprintTarget(
        target.trim(),
        ports.trim(),
        includeOs,
      )
      store.setPortFingerprintResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `fingerprint cancelled sessionId=${result.sessionId}`
          : `fingerprint done services=${result.services.length} os=${result.osStatus}`,
      )
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.fingerprintFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      sessions.stop()
      useNetworkProbeStore.getState().setLoadingPorts(false)
    }
  },

  async probeNat() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingNat) return
    store.setLoadingNat(true)
    store.setError(null)
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
    store.setError(null)
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
    store.setError(null)
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
    store.setError(null)
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
    store.setError(null)
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
    if (store.loadingNodes || store.agentMutation || store.probeNodesLoadStatus === "loading") {
      return
    }
    store.setLoadingNodes(true)
    store.setProbeNodesLoadStatus("loading")
    store.setError(null)
    try {
      const nodes = await networkProbeRepository.listProbeNodes()
      store.setProbeNodes(nodes)
      store.setProbeNodesLoadStatus("loaded")
    } catch (error) {
      useNetworkProbeStore.getState().setProbeNodesLoadStatus("failed")
      store.setError({
        key: "networkProbe.errors.nodesFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingNodes(false)
    }
  },

  async runGlobalpingMeasurement(
    measurementType: GlobalpingMeasurementType,
    target: string,
    locations: string[],
  ) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingMultiNode) return
    store.setLoadingMultiNode(true)
    store.setError(null)
    store.setGlobalpingResult(null)
    store.appendCommandLog(`globalping(${measurementType})`)
    let unlisten: (() => void) | undefined
    try {
      try {
        unlisten = await listenToPlatformEvent<GlobalpingMeasurementResult>(
          TAURI_EVENTS.networkProbe.globalpingProgress,
          (event) => {
            useNetworkProbeStore.getState().setGlobalpingResult(event.payload)
          },
        )
      } catch {
        // A missing progress listener should not prevent the final measurement result.
      }
      const result = await networkProbeRepository.runGlobalpingMeasurement(
        measurementType,
        target.trim(),
        locations,
      )
      store.setGlobalpingResult(result)
      store.appendCommandLog(result.commandHint)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.multiNodeFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlisten?.()
      useNetworkProbeStore.getState().setLoadingMultiNode(false)
    }
  },

  async getGlobalpingTokenStatus(): Promise<boolean | null> {
    try {
      return await networkProbeRepository.manageGlobalpingToken("status")
    } catch (error) {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.globalpingTokenFailed",
        fallback: getErrorMessage(error),
      })
      return null
    }
  },

  async saveGlobalpingToken(token: string): Promise<boolean> {
    try {
      const configured = await networkProbeRepository.manageGlobalpingToken("save", token)
      useNetworkProbeStore.getState().setError(null)
      useNetworkProbeStore.getState().appendCommandLog("globalpingToken(save)")
      return configured
    } catch (error) {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.globalpingTokenFailed",
        fallback: getErrorMessage(error),
      })
      return false
    }
  },

  async clearGlobalpingToken(): Promise<boolean> {
    try {
      await networkProbeRepository.manageGlobalpingToken("clear")
      useNetworkProbeStore.getState().setError(null)
      useNetworkProbeStore.getState().appendCommandLog("globalpingToken(clear)")
      return true
    } catch (error) {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.globalpingTokenFailed",
        fallback: getErrorMessage(error),
      })
      return false
    }
  },

  async addAgent(label: string, endpoint: string, token: string): Promise<boolean> {
    const store = useNetworkProbeStore.getState()
    if (store.agentMutation || store.loadingNodes || store.probeNodesLoadStatus === "loading")
      return false
    store.setAgentMutation({ kind: "add" })
    store.setError(null)
    store.appendCommandLog("addAgent()")
    let mutationSucceeded = false
    try {
      const addedNode = await networkProbeRepository.addAgent(label, endpoint, token)
      mutationSucceeded = true
      const current = useNetworkProbeStore.getState()
      current.setProbeNodes([
        ...current.probeNodes.filter((node) => node.id !== addedNode.id),
        addedNode,
      ])
      current.setProbeNodesLoadStatus("loading")
      const nodes = await networkProbeRepository.listProbeNodes()
      const latest = useNetworkProbeStore.getState()
      latest.setProbeNodes(nodes)
      latest.setProbeNodesLoadStatus("loaded")
    } catch (error) {
      const current = useNetworkProbeStore.getState()
      if (current.probeNodesLoadStatus === "loading") {
        current.setProbeNodesLoadStatus("failed")
      }
      store.setError({
        key: mutationSucceeded
          ? "networkProbe.errors.nodesFailed"
          : "networkProbe.errors.agentFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setAgentMutation(null)
    }
    return mutationSucceeded
  },

  async setAgentToken(agentId: string, token: string): Promise<boolean> {
    const store = useNetworkProbeStore.getState()
    if (store.agentMutation || store.loadingNodes || store.probeNodesLoadStatus === "loading")
      return false
    if (store.agentMeasurementLoadingById[agentId]) return false
    store.setAgentMutation({ kind: "set-token", agentId })
    store.setError(null)
    try {
      await networkProbeRepository.setAgentToken(agentId, token)
      return true
    } catch (error) {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.agentTokenFailed",
        fallback: getErrorMessage(error),
      })
      return false
    } finally {
      useNetworkProbeStore.getState().setAgentMutation(null)
    }
  },

  async runAgentMeasurement(
    agentId: string,
    measurementType: GlobalpingMeasurementType,
    target: string,
  ): Promise<AgentMeasurementResult | null> {
    const store = useNetworkProbeStore.getState()
    const activeRuns = Object.values(store.agentMeasurementLoadingById).filter(Boolean).length
    if (store.agentMeasurementLoadingById[agentId] || activeRuns >= 3) return null
    store.setError(null)
    store.setAgentMeasurementLoading(agentId, true)
    store.setAgentMeasurementResult(agentId, null)
    store.appendCommandLog(`agent ${measurementType}`)
    try {
      const result = await networkProbeRepository.runAgentMeasurement(
        agentId,
        measurementType,
        target.trim(),
      )
      useNetworkProbeStore.getState().setAgentMeasurementResult(agentId, result)
      return result
    } catch (error) {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.agentMeasurementFailed",
        fallback: getErrorMessage(error),
      })
      return null
    } finally {
      useNetworkProbeStore.getState().setAgentMeasurementLoading(agentId, false)
    }
  },

  async removeAgent(agentId: string): Promise<boolean> {
    const store = useNetworkProbeStore.getState()
    if (store.agentMutation || store.loadingNodes || store.probeNodesLoadStatus === "loading")
      return false
    if (store.agentMeasurementLoadingById[agentId]) return false
    store.setAgentMutation({ kind: "remove", agentId })
    store.setError(null)
    store.appendCommandLog(`removeAgent('${agentId}')`)
    let mutationSucceeded = false
    try {
      await networkProbeRepository.removeAgent(agentId)
      mutationSucceeded = true
      const current = useNetworkProbeStore.getState()
      current.setProbeNodes(current.probeNodes.filter((node) => node.id !== agentId))
      current.setAgentMeasurementResult(agentId, null)
      current.setAgentMeasurementLoading(agentId, false)
      current.setProbeNodesLoadStatus("loading")
      const nodes = await networkProbeRepository.listProbeNodes()
      const latest = useNetworkProbeStore.getState()
      latest.setProbeNodes(nodes)
      latest.setProbeNodesLoadStatus("loaded")
    } catch (error) {
      const current = useNetworkProbeStore.getState()
      if (current.probeNodesLoadStatus === "loading") {
        current.setProbeNodesLoadStatus("failed")
      }
      store.setError({
        key: mutationSucceeded
          ? "networkProbe.errors.nodesFailed"
          : "networkProbe.errors.agentFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setAgentMutation(null)
    }
    return mutationSucceeded
  },

  async installCapabilityPackVerifyFail(packId: string) {
    const store = useNetworkProbeStore.getState()
    const operationId = crypto.randomUUID()
    store.setError(null)
    store.appendCommandLog(`installCapabilityPack('${packId}') // hash-mismatch test`)
    try {
      const result = await networkProbeRepository.installCapabilityPackVerifyFail(
        packId,
        operationId,
      )
      store.setPackProgressText(i18n.t("networkProbe.packs.hashMismatch"))
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
    store.setError(null)
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

  async saveDiscoveryDefaults(stunServers: ProbeServer[], ntpServers: ProbeServer[]) {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
    store.appendCommandLog("saveNetworkProbeDiscoveryDefaults()")
    try {
      await networkProbeRepository.saveDefaultsOverride({ stunServers, ntpServers })
      store.setDefaults(await networkProbeRepository.getDefaults())
      return true
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.defaultsFailed",
        fallback: getErrorMessage(error),
      })
      return false
    }
  },

  async resetDiscoveryDefaults() {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
    store.appendCommandLog("resetNetworkProbeDiscoveryDefaults()")
    try {
      await networkProbeRepository.resetDiscoveryDefaults()
      store.setDefaults(await networkProbeRepository.getDefaults())
      return true
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.defaultsFailed",
        fallback: getErrorMessage(error),
      })
      return false
    }
  },
}
