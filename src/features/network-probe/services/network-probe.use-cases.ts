/**
 * Use Cases / 用例: orchestrate feature flows; 只编排业务流.
 */
import { networkProbeRepository } from "@/features/network-probe/services/network-probe.repository"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import { getErrorMessage } from "@/lib/tauri/errors"
import type {
  HealthCheckItem,
  SiteSampleResult,
  TracerouteHop,
} from "@/lib/tauri/types/network-probe"
import { listenToPlatformEvent } from "@/platform/events"

export const networkProbeUseCases = {
  async bootstrap() {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
    try {
      const [capabilities, defaults] = await Promise.all([
        networkProbeRepository.getCapabilities(),
        networkProbeRepository.getDefaults(),
      ])
      store.setCapabilities(capabilities)
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
    store.appendCommandLog(`pingHost('${target.trim()}', ${count})`)
    try {
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

  async runSitesProbe(packId: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSites) return
    store.setLoadingSites(true)
    store.setError(null)
    store.resetSitesStreaming()
    store.setActiveSessionId(null)
    store.appendCommandLog(`startSitesProbe(local, '${packId}')`)
    let unlistenSample: (() => void) | undefined
    let unlistenSession: (() => void) | undefined
    try {
      unlistenSession = await listenToPlatformEvent<{ sessionId: string; kind: string }>(
        TAURI_EVENTS.networkProbe.scanSession,
        (event) => {
          if (event.payload.kind === "sites") {
            useNetworkProbeStore.getState().setActiveSessionId(event.payload.sessionId)
          }
        },
      )
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
      unlistenSession?.()
      useNetworkProbeStore.getState().setActiveSessionId(null)
      useNetworkProbeStore.getState().setLoadingSites(false)
    }
  },

  async runSitesProbeCustom(targets: string[]) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSites) return
    store.setLoadingSites(true)
    store.setError(null)
    store.resetSitesStreaming()
    store.setActiveSessionId(null)
    store.appendCommandLog(`startSitesProbe(local, custom[${targets.length}])`)
    let unlistenSample: (() => void) | undefined
    let unlistenSession: (() => void) | undefined
    try {
      unlistenSession = await listenToPlatformEvent<{ sessionId: string; kind: string }>(
        TAURI_EVENTS.networkProbe.scanSession,
        (event) => {
          if (event.payload.kind === "sites") {
            useNetworkProbeStore.getState().setActiveSessionId(event.payload.sessionId)
          }
        },
      )
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
      unlistenSession?.()
      useNetworkProbeStore.getState().setActiveSessionId(null)
      useNetworkProbeStore.getState().setLoadingSites(false)
    }
  },

  async runHealthScan() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingHealth) return
    store.setLoadingHealth(true)
    store.setError(null)
    store.resetHealthStreaming()
    store.setActiveSessionId(null)
    store.appendCommandLog("startHealthScan(local)")
    let unlistenItem: (() => void) | undefined
    let unlistenSession: (() => void) | undefined
    try {
      unlistenSession = await listenToPlatformEvent<{ sessionId: string; kind: string }>(
        TAURI_EVENTS.networkProbe.scanSession,
        (event) => {
          if (event.payload.kind === "health") {
            useNetworkProbeStore.getState().setActiveSessionId(event.payload.sessionId)
          }
        },
      )
      unlistenItem = await listenToPlatformEvent<HealthCheckItem>(
        TAURI_EVENTS.networkProbe.healthItem,
        (event) => {
          useNetworkProbeStore.getState().upsertHealthStreamingItem(event.payload)
        },
      )
      const result = await networkProbeRepository.runHealthScan()
      store.setHealthResult(result)
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
      unlistenSession?.()
      useNetworkProbeStore.getState().setActiveSessionId(null)
      useNetworkProbeStore.getState().setLoadingHealth(false)
    }
  },

  async cancelScan() {
    const store = useNetworkProbeStore.getState()
    const sessionId = store.activeSessionId
    if (!sessionId) return
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
    try {
      const services = await networkProbeRepository.listNetworkServices()
      store.setNetworkServices(services)
    } catch (error) {
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
    store.setActiveSessionId(null)
    store.appendCommandLog(
      `startTraceroute(local, '${target.trim()}', {maxTtl:${maxTtl},rounds:${rounds}})`,
    )
    let unlistenHop: (() => void) | undefined
    let unlistenSession: (() => void) | undefined
    try {
      unlistenSession = await listenToPlatformEvent<{ sessionId: string; kind: string }>(
        TAURI_EVENTS.networkProbe.scanSession,
        (event) => {
          if (event.payload.kind === "traceroute") {
            useNetworkProbeStore.getState().setActiveSessionId(event.payload.sessionId)
          }
        },
      )
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
      unlistenSession?.()
      useNetworkProbeStore.getState().setActiveSessionId(null)
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
    store.setError(null)
    try {
      await networkProbeRepository.openSystemNetworkSettings()
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.openSettingsFailed",
        fallback: getErrorMessage(error),
      })
    }
  },
}
