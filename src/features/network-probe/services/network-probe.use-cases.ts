/**
 * Use Cases / 用例: orchestrate feature flows; 只编排业务流.
 */
import { networkProbeRepository } from "@/features/network-probe/services/network-probe.repository"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import { getErrorMessage } from "@/lib/tauri/errors"
import type {
  CapabilityPackProgress,
  HealthCheckItem,
  PingSample,
  SiteSampleResult,
  SpeedSampleEvent,
  PortSampleEvent,
  TracerouteHop,
} from "@/lib/tauri/types/network-probe"
import { listenToPlatformEvent } from "@/platform/events"

export const networkProbeUseCases = {
  async bootstrap() {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
    try {
      const [capabilities, defaults, packs, nodes] = await Promise.all([
        networkProbeRepository.getCapabilities(),
        networkProbeRepository.getDefaults(),
        networkProbeRepository.listCapabilityPacks(),
        networkProbeRepository.listProbeNodes(),
      ])
      store.setCapabilities(capabilities)
      store.setDefaults(defaults)
      store.setCapabilityPacks(packs)
      store.setProbeNodes(nodes)
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
    store.setError(null)
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
    store.setActiveSessionId(null)
    store.appendCommandLog(`startSpeedTest('${sourceId}')`)
    let unlistenSample: (() => void) | undefined
    let unlistenSession: (() => void) | undefined
    try {
      unlistenSession = await listenToPlatformEvent<{ sessionId: string; kind: string }>(
        TAURI_EVENTS.networkProbe.scanSession,
        (event) => {
          if (event.payload.kind === "speed") {
            useNetworkProbeStore.getState().setActiveSessionId(event.payload.sessionId)
          }
        },
      )
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
      unlistenSession?.()
      useNetworkProbeStore.getState().setActiveSessionId(null)
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
    store.setActiveSessionId(null)
    store.appendCommandLog(`scanPorts(local, '${target.trim()}', '${ports.trim()}')`)
    let unlistenSample: (() => void) | undefined
    let unlistenSession: (() => void) | undefined
    try {
      unlistenSession = await listenToPlatformEvent<{ sessionId: string; kind: string }>(
        TAURI_EVENTS.networkProbe.scanSession,
        (event) => {
          if (event.payload.kind === "ports") {
            useNetworkProbeStore.getState().setActiveSessionId(event.payload.sessionId)
          }
        },
      )
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
      unlistenSession?.()
      useNetworkProbeStore.getState().setActiveSessionId(null)
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
    store.setActiveSessionId(null)
    store.appendCommandLog("scanLan(local)")
    let unlistenSession: (() => void) | undefined
    try {
      unlistenSession = await listenToPlatformEvent<{ sessionId: string; kind: string }>(
        TAURI_EVENTS.networkProbe.scanSession,
        (event) => {
          if (event.payload.kind === "lan") {
            useNetworkProbeStore.getState().setActiveSessionId(event.payload.sessionId)
          }
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
      store.setError({
        key: "networkProbe.errors.lanFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlistenSession?.()
      useNetworkProbeStore.getState().setActiveSessionId(null)
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
    store.setActiveSessionId(null)
    store.appendCommandLog(`startPacketCapture(local, {secs:${durationSecs ?? 5}})`)
    let unlistenSession: (() => void) | undefined
    try {
      unlistenSession = await listenToPlatformEvent<{ sessionId: string; kind: string }>(
        TAURI_EVENTS.networkProbe.scanSession,
        (event) => {
          if (event.payload.kind === "pcap") {
            useNetworkProbeStore.getState().setActiveSessionId(event.payload.sessionId)
          }
        },
      )
      const result = await networkProbeRepository.runPcapDiag(durationSecs ?? 5)
      store.setPcapResult(result)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.pcapFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      unlistenSession?.()
      useNetworkProbeStore.getState().setActiveSessionId(null)
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
        key: "networkProbe.errors.nodesFailed",
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
    store.setError(null)
    store.appendCommandLog(`addAgent('${label}', '${endpoint}')`)
    try {
      await networkProbeRepository.addAgent(label, endpoint)
      const nodes = await networkProbeRepository.listProbeNodes()
      store.setProbeNodes(nodes)
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.agentFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async removeAgent(agentId: string) {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
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
    }
  },

  async installCapabilityPackVerifyFail(packId: string) {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
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
}
