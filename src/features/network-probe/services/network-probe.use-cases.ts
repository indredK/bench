/**
 * Use Cases / 用例: orchestrate feature flows; 只编排业务流.
 */
import { networkProbeRepository } from "@/features/network-probe/services/network-probe.repository"
import { formatTcpConnectCommand } from "@/features/network-probe/utils/tcp-command"
import { redactProbeTargetForDisplay } from "@/features/network-probe/utils/probe-target-display"
import {
  type NetworkProbeKind,
  type SiteProbeResultOwner,
  useNetworkProbeStore,
} from "@/features/network-probe/store"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import { getErrorCode, getErrorMessage } from "@/lib/tauri/errors"
import type {
  CapabilityPackProgress,
  HealthCheckItem,
  PingSampleEvent,
  SiteSampleResult,
  SitesProbeResult,
  SpeedSampleEvent,
  PortSampleEvent,
  TracerouteHop,
} from "@/lib/tauri/types/network-probe"
import { listenToPlatformEvent } from "@/platform/events"

async function settle<T>(operation: () => Promise<T>) {
  try {
    return { ok: true as const, value: await operation() }
  } catch (error) {
    return { ok: false as const, error: getErrorMessage(error) }
  }
}

/** Log the IPC contract name only; never persist user-entered targets or credentials. */
function logCommand(commandName: string) {
  useNetworkProbeStore.getState().appendCommandLog(`${commandName}()`)
}

let bootstrapInFlight: Promise<void> | null = null
let capabilityPacksRefreshInFlight: Promise<void> | null = null
const activeScanCancelRequestByKind = new Map<NetworkProbeKind, () => void>()

/**
 * 订阅 scan-session 事件, 把后端回传的会话只写进「本类探测专属」的槽位。
 * 分槽的原因: 体检 / 端口扫描等可以并发跑, 共用一个槽会让 Cancel 打错目标,
 * 或先结束的那轮无条件清空槽, 令仍在跑的面板失去取消能力。
 */
function createScanSessionTracker(kind: NetworkProbeKind, onSession?: (sessionId: string) => void) {
  let sessionId: string | null = null
  let unlisten: (() => void) | undefined
  let cancelWhenSessionArrives = false
  let active = false
  const requestCancel = () => {
    if (!active) return
    if (sessionId) {
      void networkProbeUseCases.cancelScan(kind)
    } else {
      cancelWhenSessionArrives = true
    }
  }
  return {
    async start() {
      active = true
      activeScanCancelRequestByKind.set(kind, requestCancel)
      // 起跑先占位清空, 槽里之后只可能是本轮会话, 取消目标不会串到上一轮。
      useNetworkProbeStore.getState().setActiveSessionId(kind, null)
      unlisten = await listenToPlatformEvent<{ sessionId: string; kind: string }>(
        TAURI_EVENTS.networkProbe.scanSession,
        (event) => {
          if (!active) return
          if (event.payload.kind !== kind) return
          sessionId = event.payload.sessionId
          useNetworkProbeStore.getState().setActiveSessionId(kind, sessionId)
          if (cancelWhenSessionArrives) {
            cancelWhenSessionArrives = false
            void networkProbeUseCases.cancelScan(kind)
          }
        },
      )
    },
    stop() {
      active = false
      cancelWhenSessionArrives = false
      if (activeScanCancelRequestByKind.get(kind) === requestCancel) {
        activeScanCancelRequestByKind.delete(kind)
      }
      unlisten?.()
      unlisten = undefined
      // 只清自己这轮占的槽, 别的探测进度不受影响。
      useNetworkProbeStore.getState().clearActiveSessionId(kind, sessionId)
    },
  }
}

function isSecurityAuthorizationCurrent(revision: number): boolean {
  const state = useNetworkProbeStore.getState()
  return state.securityAuthorized && state.securityAuthorizationRevision === revision
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
    if (bootstrapInFlight) return bootstrapInFlight

    const store = useNetworkProbeStore.getState()
    const probeNodesRevision = store.probeNodesRevision
    const shouldLoadNodes = !store.loadingNodes
    const task = (async () => {
      store.setError(null)
      if (shouldLoadNodes) {
        store.setLoadingNodes(true)
        store.setProbeNodesLoadError(null)
      }
      try {
        logCommand("getNetworkProbeCapabilities")
        logCommand("getNetworkProbeDefaults")
        logCommand("listCapabilityPacks")
        if (shouldLoadNodes) logCommand("listProbeNodes")
        const [capabilities, defaults, packs, nodes] = await Promise.all([
          settle(() => networkProbeRepository.getCapabilities()),
          settle(() => networkProbeRepository.getDefaults()),
          settle(() => networkProbeRepository.listCapabilityPacks()),
          shouldLoadNodes
            ? settle(() => networkProbeRepository.listProbeNodes())
            : Promise.resolve(null),
        ])
        const failures: string[] = []
        if (capabilities.ok) store.setCapabilities(capabilities.value)
        else failures.push(`getNetworkProbeCapabilities: ${capabilities.error}`)
        if (defaults.ok) store.setDefaults(defaults.value)
        else failures.push(`getNetworkProbeDefaults: ${defaults.error}`)
        if (packs.ok) store.setCapabilityPacks(packs.value)
        else failures.push(`listCapabilityPacks: ${packs.error}`)

        if (nodes) {
          const latest = useNetworkProbeStore.getState()
          if (latest.probeNodesRevision === probeNodesRevision) {
            if (nodes.ok) {
              latest.setProbeNodes(nodes.value)
              latest.setProbeNodesLoadError(null)
            } else {
              latest.setProbeNodesLoadError(nodes.error)
              failures.push(`listProbeNodes: ${nodes.error}`)
            }
          } else {
            latest.setProbeNodesLoadError(null)
          }
        }

        if (failures.length > 0) {
          store.setError({
            key: "networkProbe.errors.bootstrapFailed",
            fallback: failures.join(" · "),
          })
        }
      } catch (error) {
        store.setError({
          key: "networkProbe.errors.bootstrapFailed",
          fallback: getErrorMessage(error),
        })
      } finally {
        if (shouldLoadNodes) useNetworkProbeStore.getState().setLoadingNodes(false)
      }
    })()
    bootstrapInFlight = task
    try {
      await task
    } finally {
      if (bootstrapInFlight === task) bootstrapInFlight = null
    }
  },

  async refreshOverview() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSummary) return
    store.setLoadingSummary(true)
    store.setOverviewErrors({})
    store.setError(null)
    try {
      logCommand("getLocalNetworkSummary")
      logCommand("getFirewallStatus")
      logCommand("checkHostsOverrides")
      const [summary, firewall, hosts] = await Promise.all([
        settle(() => networkProbeRepository.getLocalNetworkSummary()),
        settle(() => networkProbeRepository.getFirewallStatus()),
        settle(() => networkProbeRepository.checkHostsOverrides()),
      ])
      const errors: NonNullable<typeof store.overviewErrors> = {}
      if (summary.ok) store.setSummary(summary.value)
      else {
        useNetworkProbeStore.getState().setSummary(null)
        errors.summary = summary.error
      }
      if (firewall.ok) store.setFirewall(firewall.value)
      else {
        useNetworkProbeStore.getState().setFirewall(null)
        errors.firewall = firewall.error
      }
      if (hosts.ok) store.setHosts(hosts.value)
      else {
        useNetworkProbeStore.getState().setHosts(null)
        errors.hosts = hosts.error
      }
      store.setOverviewErrors(errors)
      if (Object.keys(errors).length > 0) {
        store.setError({
          key: "networkProbe.errors.overviewPartialFailed",
          fallback: Object.values(errors).join(" · "),
        })
      }
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
    logCommand("tcpConnect")
    try {
      const result = await networkProbeRepository.tcpConnect(host.trim(), port)
      store.setTcpResult(result)
    } catch (error) {
      useNetworkProbeStore.getState().setTcpResult(null)
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
    store.setPingResult(null)
    store.resetPingStreaming()
    let unlisten: (() => void) | undefined
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
      logCommand("probePingHost")
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
        code: getErrorCode(error),
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
    store.setError(null)
    logCommand("probeDnsLookup")
    try {
      const result = await networkProbeRepository.dnsLookup(domain.trim(), rrType, resolver)
      store.setDnsResult(result)
    } catch (error) {
      useNetworkProbeStore.getState().setDnsResult(null)
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
    logCommand("probeTarget")
    try {
      const result = await networkProbeRepository.probeTarget(input.trim())
      store.setProbeResult(result)
    } catch (error) {
      useNetworkProbeStore.getState().setProbeResult(null)
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
    store.clearError("networkProbe.errors.sitesFailed")
    store.resetSitesStreaming()
    if (isOfficial) {
      store.resetOfficialSiteSamples()
      store.setOfficialSitePendingTargets(
        (store.defaults?.sitePacks?.[packId] ?? []).map((site) => site.target),
      )
    }
    // 重跑先清空上一轮结果, 否则面板会优先渲染旧结果而遮蔽本轮流式进度。
    store.setSitesResult(null)
    const sessions = createScanSessionTracker("sites")
    let unlistenSample: (() => void) | undefined
    try {
      await sessions.start()
      unlistenSample = await listenToPlatformEvent<SiteSampleResult>(
        TAURI_EVENTS.networkProbe.siteSample,
        (event) => {
          const current = useNetworkProbeStore.getState()
          current.upsertSiteSample(event.payload)
          if (isOfficial) current.upsertOfficialSiteSample(event.payload)
        },
      )
      logCommand("sitesProbe")
      const result = await networkProbeRepository.sitesProbe(packId)
      store.setSitesResult(result)
      if (isOfficial) {
        for (const sample of result.results) {
          useNetworkProbeStore.getState().upsertOfficialSiteSample(sample)
        }
      }
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
      const current = useNetworkProbeStore.getState()
      current.setLoadingSites(false)
      if (isOfficial) current.setOfficialSitePendingTargets([])
    }
  },

  async runSitesProbeCustom(targets: string[]): Promise<SitesProbeResult | null> {
    const store = useNetworkProbeStore.getState()
    if (store.loadingSites) return null
    store.setLoadingSites(true)
    store.clearError("networkProbe.errors.sitesFailed")
    store.resetSitesStreaming()
    if (resultOwner === "official") {
      store.removeOfficialSiteSamples(targets)
      store.setOfficialSitePendingTargets(targets)
    }
    // 同上: 单站重测也要先清掉整包结果, 避免旧数据顶替本轮进度。
    store.setSitesResult(null)
    const sessions = createScanSessionTracker("sites")
    let unlistenSample: (() => void) | undefined
    try {
      await sessions.start()
      unlistenSample = await listenToPlatformEvent<SiteSampleResult>(
        TAURI_EVENTS.networkProbe.siteSample,
        (event) => {
          const current = useNetworkProbeStore.getState()
          current.upsertSiteSample(event.payload)
          if (resultOwner === "official") current.upsertOfficialSiteSample(event.payload)
        },
      )
      logCommand("sitesProbeCustom")
      const result = await networkProbeRepository.sitesProbeCustom(targets)
      store.setSitesResult(result)
      if (resultOwner === "official") {
        for (const sample of result.results) {
          useNetworkProbeStore.getState().upsertOfficialSiteSample(sample)
        }
      }
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
      const current = useNetworkProbeStore.getState()
      current.setLoadingSites(false)
      if (resultOwner === "official") current.setOfficialSitePendingTargets([])
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
    let unlistenItem: (() => void) | undefined
    try {
      await sessions.start()
      unlistenItem = await listenToPlatformEvent<HealthCheckItem>(
        TAURI_EVENTS.networkProbe.healthItem,
        (event) => {
          useNetworkProbeStore.getState().upsertHealthStreamingItem(event.payload)
        },
      )
      logCommand("runHealthScan")
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
    if (!sessionId) {
      activeScanCancelRequestByKind.get(kind)?.()
      return
    }
    // 幂等 (A4-4): 同一会话只允许发出一次 cancel 请求。
    if (store.cancelRequestedSessionIdByKind[kind] === sessionId) return
    store.clearError("networkProbe.errors.cancelFailed")
    store.setCancelRequestedSessionId(kind, sessionId)
    logCommand("cancelScan")
    try {
      await networkProbeRepository.cancelScan(sessionId)
    } catch (error) {
      const latest = useNetworkProbeStore.getState()
      if (
        latest.activeSessionIdByKind[kind] === sessionId &&
        latest.cancelRequestedSessionIdByKind[kind] === sessionId
      ) {
        latest.setCancelRequestedSessionId(kind, null)
      }
      store.setError({
        key: "networkProbe.errors.cancelFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async revokeSecurityAuthorization() {
    const store = useNetworkProbeStore.getState()
    if (!store.securityAuthorized) return

    store.setSecurityAuthorized(false)
    const revokedStore = useNetworkProbeStore.getState()
    revokedStore.setPollutionResult(null)
    revokedStore.setWhoisResult(null)
    revokedStore.setDnssecResult(null)
    revokedStore.setPortScanResult(null)
    revokedStore.resetPortScanStreaming()
    revokedStore.setPcapResult(null)
    for (const key of [
      "networkProbe.errors.securityAuthRequired",
      "networkProbe.errors.pollutionFailed",
      "networkProbe.errors.whoisFailed",
      "networkProbe.errors.dnssecFailed",
      "networkProbe.errors.portsFailed",
      "networkProbe.errors.pcapFailed",
    ]) {
      revokedStore.clearError(key)
    }

    // Panels unmount immediately on revoke, so stop long-running scans from their session slots here.
    await Promise.all([
      networkProbeUseCases.cancelScan("ports"),
      networkProbeUseCases.cancelScan("pcap"),
    ])
  },

  async loadNetworkServices() {
    const store = useNetworkProbeStore.getState()
    if (store.networkServicesStatus === "loading") return
    store.setNetworkServicesStatus("loading")
    store.setError(null)
    logCommand("listNetworkServices")
    try {
      const services = await networkProbeRepository.listNetworkServices()
      store.setNetworkServices(services)
      useNetworkProbeStore.getState().setNetworkServicesStatus("ready")
    } catch (error) {
      useNetworkProbeStore.getState().setNetworkServicesStatus("error")
      store.setError({
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
    store.setError(null)
    logCommand("flushDns")
    try {
      const result = await networkProbeRepository.flushDns()
      store.setFixResult(result)
    } catch (error) {
      useNetworkProbeStore.getState().setFixResult(null)
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
    logCommand("switchDns")
    try {
      const result = await networkProbeRepository.switchDns(service, servers)
      store.setFixResult(result)
    } catch (error) {
      useNetworkProbeStore.getState().setFixResult(null)
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
    logCommand("renewDhcp")
    try {
      const result = await networkProbeRepository.renewDhcp(service)
      store.setFixResult(result)
    } catch (error) {
      useNetworkProbeStore.getState().setFixResult(null)
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
    logCommand("resetNetworkStack")
    try {
      const result = await networkProbeRepository.resetNetworkStack(service)
      store.setFixResult(result)
    } catch (error) {
      useNetworkProbeStore.getState().setFixResult(null)
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
    let unlistenHop: (() => void) | undefined
    try {
      await sessions.start()
      unlistenHop = await listenToPlatformEvent<TracerouteHop>(
        TAURI_EVENTS.networkProbe.tracerouteHop,
        (event) => {
          useNetworkProbeStore.getState().upsertTracerouteHop(event.payload)
        },
      )
      logCommand("runTraceroute")
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
    if (store.loadingIpv6 || store.loadingOffline) return
    store.setLoadingIpv6(true)
    const offlineErrors = { ...store.offlineErrors }
    delete offlineErrors.ipv6
    store.setOfflineErrors(offlineErrors)
    store.setError(null)
    logCommand("checkIpv6Stack")
    try {
      const result = await networkProbeRepository.checkIpv6Stack()
      store.setIpv6Result(result)
    } catch (error) {
      const latest = useNetworkProbeStore.getState()
      latest.setIpv6Result(null)
      latest.setOfflineErrors({
        ...latest.offlineErrors,
        ipv6: getErrorMessage(error),
      })
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
    if (store.loadingMtu || store.loadingOffline) return
    store.setLoadingMtu(true)
    const offlineErrors = { ...store.offlineErrors }
    delete offlineErrors.mtu
    store.setOfflineErrors(offlineErrors)
    store.setError(null)
    logCommand("probePathMtu")
    try {
      const result = await networkProbeRepository.probePathMtu(target.trim() || "1.1.1.1")
      store.setMtuResult(result)
    } catch (error) {
      const latest = useNetworkProbeStore.getState()
      latest.setMtuResult(null)
      latest.setOfflineErrors({
        ...latest.offlineErrors,
        mtu: getErrorMessage(error),
      })
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
    store.setOfflineErrors({})
    store.setError(null)
    logCommand("detectCaptivePortal")
    logCommand("getPublicIpInfo")
    logCommand("getProxyVpnStatus")
    logCommand("checkIpv6Stack")
    logCommand("probePathMtu")
    try {
      const [captive, publicIp, proxyVpn, ipv6, mtu] = await Promise.all([
        settle(() => networkProbeRepository.detectCaptivePortal()),
        settle(() => networkProbeRepository.getPublicIpInfo()),
        settle(() => networkProbeRepository.getProxyVpnStatus()),
        settle(() => networkProbeRepository.checkIpv6Stack()),
        settle(() => networkProbeRepository.probePathMtu("1.1.1.1")),
      ])
      const errors: NonNullable<typeof store.offlineErrors> = {}
      const latest = useNetworkProbeStore.getState()
      if (captive.ok) store.setCaptiveResult(captive.value)
      else {
        latest.setCaptiveResult(null)
        errors.captive = captive.error
      }
      if (publicIp.ok) store.setPublicIpInfo(publicIp.value)
      else {
        latest.setPublicIpInfo(null)
        errors.egress = publicIp.error
      }
      if (proxyVpn.ok) store.setProxyVpnStatus(proxyVpn.value)
      else {
        latest.setProxyVpnStatus(null)
        errors.proxy = proxyVpn.error
      }
      if (ipv6.ok) store.setIpv6Result(ipv6.value)
      else {
        latest.setIpv6Result(null)
        errors.ipv6 = ipv6.error
      }
      if (mtu.ok) store.setMtuResult(mtu.value)
      else {
        latest.setMtuResult(null)
        errors.mtu = mtu.error
      }
      store.setOfflineErrors(errors)
      if (Object.keys(errors).length > 0) {
        store.setError({
          key: "networkProbe.errors.offlinePartialFailed",
          fallback: Object.values(errors).join(" · "),
        })
      }
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
    const offlineErrors = { ...store.offlineErrors }
    delete offlineErrors.egress
    store.setOfflineErrors(offlineErrors)
    store.setError(null)
    logCommand("getPublicIpInfo")
    try {
      const publicIp = await networkProbeRepository.getPublicIpInfo()
      store.setPublicIpInfo(publicIp)
    } catch (error) {
      const latest = useNetworkProbeStore.getState()
      latest.setPublicIpInfo(null)
      latest.setOfflineErrors({
        ...latest.offlineErrors,
        egress: getErrorMessage(error),
      })
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
    logCommand("openSystemNetworkSettings")
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

  async openLocalNetworkPrivacySettings() {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
    logCommand("openPrivacySecuritySettings")
    try {
      await networkProbeRepository.openLocalNetworkPrivacySettings()
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.openSettingsFailed",
        fallback: getErrorMessage(error),
      })
    }
  },

  async refreshCapabilityPacks() {
    if (capabilityPacksRefreshInFlight) return capabilityPacksRefreshInFlight
    const store = useNetworkProbeStore.getState()
    const task = (async () => {
      try {
        logCommand("listCapabilityPacks")
        logCommand("getNetworkProbeCapabilities")
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
    })()
    capabilityPacksRefreshInFlight = task
    try {
      await task
    } finally {
      if (capabilityPacksRefreshInFlight === task) capabilityPacksRefreshInFlight = null
    }
  },

  async installCapabilityPack(packId: string) {
    const store = useNetworkProbeStore.getState()
    store.clearError("networkProbe.errors.packsFailed")
    store.setPackProgressText(null)
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
      logCommand("installCapabilityPack")
      const result = await networkProbeRepository.installCapabilityPack(packId)
      store.appendCommandLog(`installCapabilityPack done ok=${result.ok} mode=${result.mode}`)
      if (!result.ok) {
        store.setError({
          key:
            result.mode === "hash-mismatch"
              ? "networkProbe.errors.packHashMismatch"
              : "networkProbe.errors.packsFailed",
        })
        return
      }
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
    logCommand("uninstallCapabilityPack")
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
      logCommand("listSpeedSources")
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
    let unlistenSample: (() => void) | undefined
    try {
      await sessions.start()
      unlistenSample = await listenToPlatformEvent<SpeedSampleEvent>(
        TAURI_EVENTS.networkProbe.speedSample,
        (event) => {
          useNetworkProbeStore.getState().setSpeedSample(event.payload)
        },
      )
      logCommand("runSpeedTest")
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
    const authorizationRevision = store.securityAuthorizationRevision
    if (store.loadingPollution) return
    store.setLoadingPollution(true)
    store.setError(null)
    logCommand("runPollutionCheck")
    try {
      const result = await networkProbeRepository.runPollutionCheck(domain.trim())
      if (isSecurityAuthorizationCurrent(authorizationRevision)) {
        useNetworkProbeStore.getState().setPollutionResult(result)
      }
    } catch (error) {
      useNetworkProbeStore.getState().setPollutionResult(null)
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
    const authorizationRevision = store.securityAuthorizationRevision
    if (store.loadingWhois) return
    store.setLoadingWhois(true)
    store.setError(null)
    logCommand("whoisLookup")
    try {
      const result = await networkProbeRepository.whoisLookup(query.trim())
      if (isSecurityAuthorizationCurrent(authorizationRevision)) {
        useNetworkProbeStore.getState().setWhoisResult(result)
      }
    } catch (error) {
      useNetworkProbeStore.getState().setWhoisResult(null)
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
    const authorizationRevision = store.securityAuthorizationRevision
    if (store.loadingDnssec) return
    store.setLoadingDnssec(true)
    store.setError(null)
    logCommand("checkDnssec")
    try {
      const result = await networkProbeRepository.checkDnssec(domain.trim())
      if (isSecurityAuthorizationCurrent(authorizationRevision)) {
        useNetworkProbeStore.getState().setDnssecResult(result)
      }
    } catch (error) {
      useNetworkProbeStore.getState().setDnssecResult(null)
      store.setError({
        key: "networkProbe.errors.dnssecFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingDnssec(false)
    }
  },

  async runPortScan(target: string, ports: string, fingerprint = false, highRiskConfirmed = false) {
    const store = useNetworkProbeStore.getState()
    if (!store.securityAuthorized) {
      store.setError({
        key: "networkProbe.errors.securityAuthRequired",
        fallback: "Authorize the Security tab first.",
      })
      return
    }
    const authorizationRevision = store.securityAuthorizationRevision
    if (store.loadingPorts) return
    store.setLoadingPorts(true)
    store.clearError("networkProbe.errors.portsFailed")
    store.resetPortScanStreaming()
    store.setPortScanResult(null)
    const sessions = createScanSessionTracker("ports")
    let unlistenSample: (() => void) | undefined
    try {
      await sessions.start()
      unlistenSample = await listenToPlatformEvent<PortSampleEvent>(
        TAURI_EVENTS.networkProbe.portSample,
        (event) => {
          if (isSecurityAuthorizationCurrent(authorizationRevision)) {
            useNetworkProbeStore.getState().upsertPortSample(event.payload)
          }
        },
      )
      logCommand("scanPorts")
      const result = await networkProbeRepository.scanPorts(
        target.trim(),
        ports.trim(),
        fingerprint,
        highRiskConfirmed,
      )
      store.setPortScanResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `scanPorts cancelled sessionId=${result.sessionId}`
          : `scanPorts done open=${result.openPorts.join(",") || "none"} mode=${result.mode}`,
      )
    } catch (error) {
      store.setError({
        key:
          getErrorCode(error) === "HIGH_RISK_CONFIRMATION_REQUIRED"
            ? "networkProbe.errors.highRiskConfirmationRequired"
            : getErrorCode(error) === "PORT_SCAN_SINGLE_HOST_REQUIRED"
              ? "networkProbe.errors.singleHostPortScanOnly"
              : "networkProbe.errors.portsFailed",
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
    logCommand("probeNat")
    try {
      const result = await networkProbeRepository.probeNat()
      store.setNatResult(result)
    } catch (error) {
      useNetworkProbeStore.getState().setNatResult(null)
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
    logCommand("probeNtp")
    try {
      const result = await networkProbeRepository.probeNtp()
      store.setNtpResult(result)
    } catch (error) {
      useNetworkProbeStore.getState().setNtpResult(null)
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
    try {
      await sessions.start()
      logCommand("discoverLan")
      const result = await networkProbeRepository.discoverLan()
      store.setLanResult(result)
      store.appendCommandLog(
        result.cancelled
          ? `scanLan cancelled sessionId=${result.sessionId}`
          : `scanLan done neighbors=${result.neighbors.length}`,
      )
    } catch (error) {
      useNetworkProbeStore.getState().setLanResult(null)
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
    logCommand("browseLanServices")
    try {
      const result = await networkProbeRepository.browseLanServices()
      store.setLanServicesResult(result)
    } catch (error) {
      useNetworkProbeStore.getState().setLanServicesResult(null)
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
    const authorizationRevision = store.securityAuthorizationRevision
    if (store.loadingPcap) return
    store.setLoadingPcap(true)
    store.setError(null)
    const sessions = createScanSessionTracker("pcap")
    try {
      await sessions.start()
      logCommand("runPcapDiag")
      const result = await networkProbeRepository.runPcapDiag(durationSecs ?? 5)
      if (isSecurityAuthorizationCurrent(authorizationRevision)) {
        useNetworkProbeStore.getState().setPcapResult(result)
      }
    } catch (error) {
      useNetworkProbeStore.getState().setPcapResult(null)
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
    if (store.loadingNodes || store.agentMutation) return
    const probeNodesRevision = store.probeNodesRevision
    store.setLoadingNodes(true)
    store.setProbeNodesLoadError(null)
    store.setError(null)
    try {
      logCommand("listProbeNodes")
      const nodes = await networkProbeRepository.listProbeNodes()
      const latest = useNetworkProbeStore.getState()
      if (latest.probeNodesRevision === probeNodesRevision) latest.setProbeNodes(nodes)
      latest.setProbeNodesLoadError(null)
    } catch (error) {
      const latest = useNetworkProbeStore.getState()
      if (latest.probeNodesRevision === probeNodesRevision) {
        const message = getErrorMessage(error)
        latest.setProbeNodesLoadError(message)
        latest.setError({ key: "networkProbe.errors.nodesFailed", fallback: message })
      }
    } finally {
      useNetworkProbeStore.getState().setLoadingNodes(false)
    }
  },

  async compareDnsMulti(domain: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingMultiNode) return
    store.setLoadingMultiNode(true)
    store.setError(null)
    logCommand("compareDnsMulti")
    try {
      const result = await networkProbeRepository.compareDnsMulti(domain.trim(), [
        "world",
        "US",
        "Europe",
      ])
      store.setMultiNodeDnsResult(result)
    } catch (error) {
      useNetworkProbeStore.getState().setMultiNodeDnsResult(null)
      store.setError({
        key: "networkProbe.errors.multiNodeFailed",
        fallback: getErrorMessage(error),
      })
    } finally {
      useNetworkProbeStore.getState().setLoadingMultiNode(false)
    }
  },

  async runGlobalpingMeasurement(kind: "ping" | "http", target: string, method?: string) {
    const store = useNetworkProbeStore.getState()
    if (store.loadingGlobalpingMeasurement) return
    store.setLoadingGlobalpingMeasurement(true)
    store.setGlobalpingMeasurementResult(null)
    store.setError(null)
    logCommand("runGlobalpingMeasurement")
    try {
      const result = await networkProbeRepository.runGlobalpingMeasurement(
        kind,
        target.trim(),
        method,
      )
      useNetworkProbeStore.getState().setGlobalpingMeasurementResult(result)
    } catch (error) {
      const key =
        getErrorCode(error) === "INVALID_INPUT"
          ? "networkProbe.errors.globalpingInvalidTarget"
          : "networkProbe.errors.globalpingFailed"
      useNetworkProbeStore.getState().setError({ key, fallback: getErrorMessage(error) })
    } finally {
      useNetworkProbeStore.getState().setLoadingGlobalpingMeasurement(false)
    }
  },

  async refreshGlobalpingTokenStatus() {
    const store = useNetworkProbeStore.getState()
    if (store.loadingGlobalpingToken) return null
    store.setLoadingGlobalpingToken(true)
    store.setError(null)
    try {
      const configured = await networkProbeRepository.isGlobalpingTokenConfigured()
      useNetworkProbeStore.getState().setGlobalpingTokenConfigured(configured)
      return configured
    } catch (error) {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.globalpingTokenFailed",
        fallback: getErrorMessage(error),
      })
      return null
    } finally {
      useNetworkProbeStore.getState().setLoadingGlobalpingToken(false)
    }
  },

  async saveGlobalpingToken(token: string) {
    const store = useNetworkProbeStore.getState()
    if (store.savingGlobalpingToken) return false
    store.setSavingGlobalpingToken(true)
    store.setError(null)
    try {
      await networkProbeRepository.saveGlobalpingToken(token)
      useNetworkProbeStore.getState().setGlobalpingTokenConfigured(true)
      return true
    } catch (error) {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.globalpingTokenFailed",
        fallback: getErrorMessage(error),
      })
      return false
    } finally {
      useNetworkProbeStore.getState().setSavingGlobalpingToken(false)
    }
  },

  async removeGlobalpingToken() {
    const store = useNetworkProbeStore.getState()
    if (store.savingGlobalpingToken) return false
    store.setSavingGlobalpingToken(true)
    store.setError(null)
    try {
      await networkProbeRepository.removeGlobalpingToken()
      useNetworkProbeStore.getState().setGlobalpingTokenConfigured(false)
      return true
    } catch (error) {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.globalpingTokenFailed",
        fallback: getErrorMessage(error),
      })
      return false
    } finally {
      useNetworkProbeStore.getState().setSavingGlobalpingToken(false)
    }
  },

  async addAgent(label: string, endpoint: string) {
    const store = useNetworkProbeStore.getState()
    if (store.agentMutation) return null
    store.setAgentMutation({ kind: "add" })
    store.setError(null)
    store.appendCommandLog("addAgent()")
    try {
      const node = await networkProbeRepository.addAgent(label, endpoint)
      const latest = useNetworkProbeStore.getState()
      latest.setProbeNodes([
        ...latest.probeNodes.filter((existing) => existing.id !== node.id),
        node,
      ])
      latest.setProbeNodesLoadError(null)
      return node
    } catch (error) {
      store.setError({
        key:
          getErrorCode(error) === "INVALID_INPUT"
            ? "networkProbe.errors.agentInvalidInput"
            : "networkProbe.errors.agentFailed",
        fallback: getErrorMessage(error),
      })
      return null
    } finally {
      useNetworkProbeStore.getState().setAgentMutation(null)
    }
  },

  async removeAgent(agentId: string) {
    const store = useNetworkProbeStore.getState()
    if (store.agentMutation) return false
    store.setAgentMutation({ kind: "remove", agentId })
    store.setError(null)
    logCommand("removeAgent")
    try {
      await networkProbeRepository.removeAgent(agentId)
      const latest = useNetworkProbeStore.getState()
      latest.setProbeNodes(latest.probeNodes.filter((node) => node.id !== agentId))
      latest.setProbeNodesLoadError(null)
      return true
    } catch (error) {
      store.setError({
        key: "networkProbe.errors.agentFailed",
        fallback: getErrorMessage(error),
      })
      return false
    } finally {
      useNetworkProbeStore.getState().setAgentMutation(null)
    }
  },

  async installCapabilityPackVerifyFail(packId: string) {
    const store = useNetworkProbeStore.getState()
    store.setError(null)
    store.setPackProgressText(null)
    logCommand("installCapabilityPackVerifyFail")
    try {
      const result = await networkProbeRepository.installCapabilityPackVerifyFail(packId)
      if (!result.ok) {
        store.setError({ key: "networkProbe.errors.packHashMismatch" })
        store.appendCommandLog(`pack verify fail: ${result.mode}`)
      } else {
        store.setError({ key: "networkProbe.errors.packsFailed" })
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
    logCommand("resetNetworkProbeDefaults")
    try {
      await networkProbeRepository.resetDefaults()
      logCommand("getNetworkProbeDefaults")
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
