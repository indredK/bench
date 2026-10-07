/**
 * Network Probe result reset tests / 探测重跑状态复位测试:
 * failed result-producing probes clear stale results; overview refresh preserves its last good snapshot.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { repository } = vi.hoisted(() => ({
  repository: {
    getLocalNetworkSummary: vi.fn(),
    getFirewallStatus: vi.fn(),
    checkHostsOverrides: vi.fn(),
    tcpConnect: vi.fn(),
    pingHost: vi.fn(),
    dnsLookup: vi.fn(),
    probeTarget: vi.fn(),
    detectCaptivePortal: vi.fn(),
    getPublicIpInfo: vi.fn(),
    getProxyVpnStatus: vi.fn(),
    checkIpv6Stack: vi.fn(),
    probePathMtu: vi.fn(),
    runPollutionCheck: vi.fn(),
    probeNat: vi.fn(),
    probeNtp: vi.fn(),
    browseLanServices: vi.fn(),
    compareDnsMulti: vi.fn(),
  },
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: repository,
}))

const { listeners } = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(
    async (event: string, handler: (e: { payload: unknown }) => void) => {
      listeners.set(event, handler)
      return () => listeners.delete(event)
    },
  ),
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

const stale = { staleSnapshot: true }

function currentValue(key: string) {
  return (useNetworkProbeStore.getState() as unknown as Record<string, unknown>)[key]
}

const singleProbeCases = [
  {
    name: "TCP connect",
    resultKey: "tcpResult",
    loadingKey: "loadingTcp",
    request: repository.tcpConnect,
    run: () => networkProbeUseCases.runTcpConnect("example.com", 443),
  },
  {
    name: "ping",
    resultKey: "pingResult",
    loadingKey: "loadingPing",
    request: repository.pingHost,
    run: () => networkProbeUseCases.runPing("1.1.1.1", 1),
  },
  {
    name: "DNS lookup",
    resultKey: "dnsResult",
    loadingKey: "loadingDns",
    request: repository.dnsLookup,
    run: () => networkProbeUseCases.runDnsLookup("example.com", "A"),
  },
  {
    name: "custom target probe",
    resultKey: "probeResult",
    loadingKey: "loadingProbe",
    request: repository.probeTarget,
    run: () => networkProbeUseCases.runProbeTarget("https://example.com"),
  },
  {
    name: "IPv6 check",
    resultKey: "ipv6Result",
    loadingKey: "loadingIpv6",
    request: repository.checkIpv6Stack,
    run: () => networkProbeUseCases.checkIpv6Stack(),
  },
  {
    name: "path MTU probe",
    resultKey: "mtuResult",
    loadingKey: "loadingMtu",
    request: repository.probePathMtu,
    run: () => networkProbeUseCases.probePathMtu("1.1.1.1"),
  },
  {
    name: "public egress refresh",
    resultKey: "publicIpInfo",
    loadingKey: "loadingOffline",
    request: repository.getPublicIpInfo,
    run: () => networkProbeUseCases.refreshPublicIp(),
  },
  {
    name: "pollution check",
    resultKey: "pollutionResult",
    loadingKey: "loadingPollution",
    request: repository.runPollutionCheck,
    run: () => networkProbeUseCases.runPollutionCheck("example.com"),
  },
  {
    name: "NAT probe",
    resultKey: "natResult",
    loadingKey: "loadingNat",
    request: repository.probeNat,
    run: () => networkProbeUseCases.probeNat(),
  },
  {
    name: "NTP probe",
    resultKey: "ntpResult",
    loadingKey: "loadingNtp",
    request: repository.probeNtp,
    run: () => networkProbeUseCases.probeNtp(),
  },
  {
    name: "LAN service browse",
    resultKey: "lanServicesResult",
    loadingKey: "loadingLanServices",
    request: repository.browseLanServices,
    run: () => networkProbeUseCases.browseLanServices(),
  },
  {
    name: "multi-node DNS comparison",
    resultKey: "multiNodeDnsResult",
    loadingKey: "loadingMultiNode",
    request: repository.compareDnsMulti,
    run: () => networkProbeUseCases.compareDnsMulti("example.com"),
  },
]

beforeEach(() => {
  listeners.clear()
  for (const request of Object.values(repository)) request.mockReset()
  useNetworkProbeStore.setState({
    loadingSummary: false,
    loadingTcp: false,
    loadingPing: false,
    loadingDns: false,
    loadingProbe: false,
    loadingOffline: false,
    loadingIpv6: false,
    loadingMtu: false,
    loadingPollution: false,
    loadingNat: false,
    loadingNtp: false,
    loadingLanServices: false,
    loadingMultiNode: false,
    securityAuthorized: true,
    error: null,
    errors: [],
    commandLog: [],
  })
})

describe("network-probe result reset before rerun", () => {
  it.each(singleProbeCases)("clears stale $name data when the new request fails", async (probe) => {
    useNetworkProbeStore.setState({
      [probe.resultKey]: stale,
      [probe.loadingKey]: false,
    } as never)
    probe.request.mockRejectedValueOnce(new Error("simulated IPC failure"))

    await probe.run()

    expect(currentValue(probe.resultKey)).toBeNull()
    expect(useNetworkProbeStore.getState().error).not.toBeNull()
  })

  it("logs custom target failures without URL secrets", async () => {
    repository.probeTarget.mockRejectedValueOnce(new Error("simulated IPC failure"))

    await networkProbeUseCases.runProbeTarget(
      "https://user:secret@example.com/health?token=private#section",
    )

    const commandLog = useNetworkProbeStore.getState().commandLog.join("\n")
    expect(commandLog).toContain("probeTarget(local, 'https://example.com/health?…#…')")
    expect(commandLog).not.toContain("secret")
    expect(commandLog).not.toContain("private")
  })

  it("preserves all overview snapshots when a refresh fails", async () => {
    const staleHosts = [stale]
    useNetworkProbeStore.setState({ summary: stale, firewall: stale, hosts: staleHosts } as never)
    repository.getLocalNetworkSummary.mockRejectedValueOnce(new Error("offline"))
    repository.getFirewallStatus.mockResolvedValueOnce(stale)
    repository.checkHostsOverrides.mockResolvedValueOnce([stale])

    await networkProbeUseCases.refreshOverview()

    expect(useNetworkProbeStore.getState().summary).toBe(stale)
    expect(useNetworkProbeStore.getState().firewall).toBe(stale)
    expect(useNetworkProbeStore.getState().hosts).toBe(staleHosts)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.overviewFailed")
  })

  it("keeps unrelated probe errors visible across retries and concurrent failures", async () => {
    repository.pingHost.mockRejectedValueOnce(new Error("ping IPC failed"))
    await networkProbeUseCases.runPing("192.0.2.1", 1)

    let rejectDns!: (reason?: unknown) => void
    const dnsRequest = new Promise<never>((_, reject) => {
      rejectDns = reject
    })
    repository.dnsLookup.mockReturnValueOnce(dnsRequest)
    const dnsRun = networkProbeUseCases.runDnsLookup("invalid.example", "A")

    expect(useNetworkProbeStore.getState().errors.map((error) => error.key)).toContain(
      "networkProbe.errors.pingFailed",
    )
    rejectDns(new Error("DNS IPC failed"))
    await dnsRun

    expect(useNetworkProbeStore.getState().errors.map((error) => error.key)).toEqual(
      expect.arrayContaining(["networkProbe.errors.pingFailed", "networkProbe.errors.dnsFailed"]),
    )
  })

  it("keeps the offline diagnostic all-or-nothing when a refresh fails", async () => {
    useNetworkProbeStore.setState({
      captiveResult: stale,
      publicIpInfo: stale,
      proxyVpnStatus: stale,
      ipv6Result: stale,
      mtuResult: stale,
    } as never)
    repository.detectCaptivePortal.mockResolvedValueOnce(stale)
    repository.getPublicIpInfo.mockRejectedValueOnce(new Error("offline"))
    repository.getProxyVpnStatus.mockResolvedValueOnce(stale)
    repository.checkIpv6Stack.mockResolvedValueOnce(stale)
    repository.probePathMtu.mockResolvedValueOnce(stale)

    await networkProbeUseCases.runOfflineDiagnostics()

    const state = useNetworkProbeStore.getState()
    expect(state.captiveResult).toBeNull()
    expect(state.publicIpInfo).toBeNull()
    expect(state.proxyVpnStatus).toBeNull()
    expect(state.ipv6Result).toBeNull()
    expect(state.mtuResult).toBeNull()
  })

  it("keeps the shared result-slot lock until slow sibling probes settle after failure", async () => {
    let resolveMtu!: (value: typeof stale) => void
    const slowMtu = new Promise<typeof stale>((resolve) => {
      resolveMtu = resolve
    })
    repository.detectCaptivePortal.mockResolvedValueOnce(stale)
    repository.getPublicIpInfo.mockRejectedValueOnce(new Error("offline"))
    repository.getProxyVpnStatus.mockResolvedValueOnce(stale)
    repository.checkIpv6Stack.mockResolvedValueOnce(stale)
    repository.probePathMtu.mockReturnValueOnce(slowMtu)

    const offlineRun = networkProbeUseCases.runOfflineDiagnostics()

    expect(useNetworkProbeStore.getState().loadingOffline).toBe(true)
    await networkProbeUseCases.probePathMtu("example.com")
    expect(repository.probePathMtu).toHaveBeenCalledTimes(1)

    resolveMtu(stale)
    await offlineRun

    expect(useNetworkProbeStore.getState().loadingOffline).toBe(false)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.offlineFailed")
  })

  it.each(["loadingIpv6", "loadingMtu"] as const)(
    "does not start offline diagnostics while %s owns a shared result slot",
    async (loadingKey) => {
      useNetworkProbeStore.setState({ [loadingKey]: true } as never)

      await networkProbeUseCases.runOfflineDiagnostics()

      expect(repository.detectCaptivePortal).not.toHaveBeenCalled()
      expect(repository.getPublicIpInfo).not.toHaveBeenCalled()
      expect(repository.checkIpv6Stack).not.toHaveBeenCalled()
      expect(repository.probePathMtu).not.toHaveBeenCalled()
      expect(useNetworkProbeStore.getState().loadingOffline).toBe(false)
    },
  )

  it.each([
    {
      name: "IPv6",
      loadingKey: "loadingIpv6",
      request: repository.checkIpv6Stack,
      run: () => networkProbeUseCases.checkIpv6Stack(),
      resultKey: "ipv6Result",
    },
    {
      name: "MTU",
      loadingKey: "loadingMtu",
      request: repository.probePathMtu,
      run: () => networkProbeUseCases.probePathMtu("example.com"),
      resultKey: "mtuResult",
    },
  ])(
    "does not start standalone $name while offline diagnostics own the result slot",
    async (probe) => {
      useNetworkProbeStore.setState({
        loadingOffline: true,
        [probe.resultKey]: stale,
      } as never)

      await probe.run()

      expect(probe.request).not.toHaveBeenCalled()
      expect(currentValue(probe.resultKey)).toEqual(stale)
      expect(currentValue(probe.loadingKey)).toBe(false)
    },
  )
})
