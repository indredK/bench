import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  detectCaptivePortal,
  getPublicIpInfo,
  getProxyVpnStatus,
  checkIpv6Stack,
  probePathMtu,
  listNetworkServices,
  getLocalNetworkSummary,
  getFirewallStatus,
  checkHostsOverrides,
  tcpConnect,
  listCapabilityPacks,
  getCapabilities,
  installCapabilityPack,
} = vi.hoisted(() => ({
  detectCaptivePortal: vi.fn(),
  getPublicIpInfo: vi.fn(),
  getProxyVpnStatus: vi.fn(),
  checkIpv6Stack: vi.fn(),
  probePathMtu: vi.fn(),
  listNetworkServices: vi.fn(),
  getLocalNetworkSummary: vi.fn(),
  getFirewallStatus: vi.fn(),
  checkHostsOverrides: vi.fn(),
  tcpConnect: vi.fn(),
  listCapabilityPacks: vi.fn(),
  getCapabilities: vi.fn(),
  installCapabilityPack: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    detectCaptivePortal,
    getPublicIpInfo,
    getProxyVpnStatus,
    checkIpv6Stack,
    probePathMtu,
    listNetworkServices,
    getLocalNetworkSummary,
    getFirewallStatus,
    checkHostsOverrides,
    tcpConnect,
    listCapabilityPacks,
    getCapabilities,
    installCapabilityPack,
  },
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(async () => () => undefined),
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

beforeEach(() => {
  for (const mock of [
    detectCaptivePortal,
    getPublicIpInfo,
    getProxyVpnStatus,
    checkIpv6Stack,
    probePathMtu,
    listNetworkServices,
    getLocalNetworkSummary,
    getFirewallStatus,
    checkHostsOverrides,
    tcpConnect,
    listCapabilityPacks,
    getCapabilities,
    installCapabilityPack,
  ]) {
    mock.mockReset()
  }
  useNetworkProbeStore.setState({
    loadingOffline: false,
    loadingIpv6: false,
    loadingMtu: false,
    captiveResult: null,
    publicIpInfo: null,
    proxyVpnStatus: null,
    ipv6Result: null,
    mtuResult: null,
    offlineErrors: {},
    networkServices: [],
    networkServicesStatus: "idle",
    loadingSummary: false,
    summary: null,
    firewall: null,
    hosts: null,
    overviewErrors: {},
    error: null,
  })
})

describe("network-probe MVP failure and re-entry handling", () => {
  it("keeps successful offline results and identifies failed checks", async () => {
    const captive = { status: "open" }
    const proxy = { proxyEnabled: false, vpnIfaces: [], defaultViaTunnel: false }
    const ipv6 = { status: "ok" }
    const mtu = { status: "ok" }
    useNetworkProbeStore.setState({
      publicIpInfo: { ip: "198.51.100.4", commandHint: "previous query" },
    })
    detectCaptivePortal.mockResolvedValue(captive)
    getPublicIpInfo.mockRejectedValue(new Error("provider unavailable"))
    getProxyVpnStatus.mockResolvedValue(proxy)
    checkIpv6Stack.mockResolvedValue(ipv6)
    probePathMtu.mockResolvedValue(mtu)

    await act(async () => {
      await networkProbeUseCases.runOfflineDiagnostics()
    })

    const state = useNetworkProbeStore.getState()
    expect(state.captiveResult).toBe(captive)
    expect(state.publicIpInfo).toBeNull()
    expect(state.proxyVpnStatus).toBe(proxy)
    expect(state.ipv6Result).toBe(ipv6)
    expect(state.mtuResult).toBe(mtu)
    expect(state.offlineErrors).toEqual({ egress: "provider unavailable" })
    expect(state.error?.key).toBe("networkProbe.errors.offlinePartialFailed")
    expect(state.loadingOffline).toBe(false)
    const log = state.commandLog.join("\n")
    expect(log).toContain("detectCaptivePortal()")
    expect(log).toContain("getPublicIpInfo()")
    expect(log).toContain("getProxyVpnStatus()")
    expect(log).toContain("checkIpv6Stack()")
    expect(log).toContain("probePathMtu()")
  })

  it("keeps previous offline results visible while a refresh is running", async () => {
    const previous = { ip: "198.51.100.4", commandHint: "previous query" }
    useNetworkProbeStore.setState({ publicIpInfo: previous })
    let resolvePublicIp: (value: typeof previous) => void = () => {}
    getPublicIpInfo.mockImplementation(() => new Promise((resolve) => (resolvePublicIp = resolve)))
    detectCaptivePortal.mockResolvedValue({ status: "open" })
    getProxyVpnStatus.mockResolvedValue({})
    checkIpv6Stack.mockResolvedValue({})
    probePathMtu.mockResolvedValue({})

    const refresh = networkProbeUseCases.runOfflineDiagnostics()
    expect(useNetworkProbeStore.getState().publicIpInfo).toBe(previous)

    resolvePublicIp({ ip: "203.0.113.8", commandHint: "current query" })
    await refresh
    expect(useNetworkProbeStore.getState().publicIpInfo?.ip).toBe("203.0.113.8")
  })

  it("keeps available overview data when another overview request fails", async () => {
    const summary = { interfaces: [], dnsServers: [] }
    const hosts: never[] = []
    getLocalNetworkSummary.mockResolvedValue(summary)
    getFirewallStatus.mockRejectedValue(new Error("firewall query unavailable"))
    checkHostsOverrides.mockResolvedValue(hosts)

    await act(async () => {
      await networkProbeUseCases.refreshOverview()
    })

    const state = useNetworkProbeStore.getState()
    expect(state.summary).toBe(summary)
    expect(state.firewall).toBeNull()
    expect(state.hosts).toBe(hosts)
    expect(state.overviewErrors).toEqual({ firewall: "firewall query unavailable" })
    expect(state.error?.key).toBe("networkProbe.errors.overviewPartialFailed")
    expect(state.loadingSummary).toBe(false)
    const log = state.commandLog.join("\n")
    expect(log).toContain("getLocalNetworkSummary()")
    expect(log).toContain("getFirewallStatus()")
    expect(log).toContain("checkHostsOverrides()")
  })

  it("does not start a second bulk run while the first is active", async () => {
    let resolveCaptive: (value: unknown) => void = () => {}
    detectCaptivePortal.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCaptive = resolve
        }),
    )
    getPublicIpInfo.mockResolvedValue({ ip: "203.0.113.1" })
    getProxyVpnStatus.mockResolvedValue({})
    checkIpv6Stack.mockResolvedValue({})
    probePathMtu.mockResolvedValue({})

    const firstRun = networkProbeUseCases.runOfflineDiagnostics()
    await networkProbeUseCases.runOfflineDiagnostics()
    expect(detectCaptivePortal).toHaveBeenCalledTimes(1)

    resolveCaptive({ status: "open" })
    await firstRun
    expect(useNetworkProbeStore.getState().loadingOffline).toBe(false)
  })

  it("single-flights network service loading and treats an empty list as a successful result", async () => {
    let resolveServices: (value: string[]) => void = () => {}
    listNetworkServices.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveServices = resolve
        }),
    )

    const firstLoad = networkProbeUseCases.loadNetworkServices()
    expect(useNetworkProbeStore.getState().networkServicesStatus).toBe("loading")
    await networkProbeUseCases.loadNetworkServices()
    expect(listNetworkServices).toHaveBeenCalledTimes(1)

    resolveServices([])
    await firstLoad
    expect(useNetworkProbeStore.getState().networkServices).toEqual([])
    expect(useNetworkProbeStore.getState().networkServicesStatus).toBe("ready")
    expect(
      useNetworkProbeStore
        .getState()
        .commandLog.filter((line) => line.endsWith("listNetworkServices()")),
    ).toHaveLength(1)
  })

  it("logs command names without copying user-entered targets into the history", async () => {
    tcpConnect.mockResolvedValue({ status: "ok" })

    await networkProbeUseCases.runTcpConnect("private-token-looking-target", 443)

    const log = useNetworkProbeStore.getState().commandLog.join("\n")
    expect(log).toContain("tcpConnect()")
    expect(log).not.toContain("private-token-looking-target")
  })

  it("keeps capability pack identifiers out of command history", async () => {
    installCapabilityPack.mockResolvedValue({
      ok: true,
      mode: "marker",
      commandHint: "installCapabilityPack('private-pack-id')",
    })
    listCapabilityPacks.mockResolvedValue([])
    getCapabilities.mockResolvedValue(null)

    await networkProbeUseCases.installCapabilityPack("private-pack-id")

    const log = useNetworkProbeStore.getState().commandLog.join("\n")
    expect(log).toContain("installCapabilityPack()")
    expect(log).toContain("installCapabilityPack done ok=true mode=marker")
    expect(log).not.toContain("private-pack-id")
  })

  it("single-flights capability pack refreshes and allows a later retry", async () => {
    let resolvePacks: (value: never[]) => void = () => {}
    listCapabilityPacks.mockImplementation(() => new Promise((resolve) => (resolvePacks = resolve)))
    getCapabilities.mockResolvedValue(null)

    const firstRefresh = networkProbeUseCases.refreshCapabilityPacks()
    const repeatedRefresh = networkProbeUseCases.refreshCapabilityPacks()

    expect(listCapabilityPacks).toHaveBeenCalledTimes(1)
    expect(getCapabilities).toHaveBeenCalledTimes(1)
    resolvePacks([])
    await Promise.all([firstRefresh, repeatedRefresh])

    listCapabilityPacks.mockResolvedValueOnce([])
    await networkProbeUseCases.refreshCapabilityPacks()
    expect(listCapabilityPacks).toHaveBeenCalledTimes(2)
    expect(getCapabilities).toHaveBeenCalledTimes(2)
  })

  it("exposes a failed network service load for retry", async () => {
    listNetworkServices.mockRejectedValue(new Error("networksetup failed"))

    await networkProbeUseCases.loadNetworkServices()

    expect(useNetworkProbeStore.getState().networkServicesStatus).toBe("error")
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.servicesFailed")
  })

  it("clears the service-load error when a retry succeeds", async () => {
    listNetworkServices.mockRejectedValueOnce(new Error("networksetup failed"))
    await networkProbeUseCases.loadNetworkServices()
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.servicesFailed")

    listNetworkServices.mockResolvedValueOnce(["Wi-Fi"])
    await networkProbeUseCases.loadNetworkServices()

    const state = useNetworkProbeStore.getState()
    expect(state.networkServicesStatus).toBe("ready")
    expect(state.networkServices).toEqual(["Wi-Fi"])
    expect(state.error).toBeNull()
  })
})
