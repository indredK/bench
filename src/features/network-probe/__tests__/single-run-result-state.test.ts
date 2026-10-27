import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  dnsLookup,
  tcpConnect,
  probeTarget,
  probePathMtu,
  detectCaptivePortal,
  getPublicIpInfo,
  getProxyVpnStatus,
  checkIpv6Stack,
} = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  tcpConnect: vi.fn(),
  probeTarget: vi.fn(),
  probePathMtu: vi.fn(),
  detectCaptivePortal: vi.fn(),
  getPublicIpInfo: vi.fn(),
  getProxyVpnStatus: vi.fn(),
  checkIpv6Stack: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    dnsLookup,
    tcpConnect,
    probeTarget,
    probePathMtu,
    detectCaptivePortal,
    getPublicIpInfo,
    getProxyVpnStatus,
    checkIpv6Stack,
  },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { isNetworkProbeErrorVisible } from "@/features/network-probe/error-scope"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type {
  DnsLookupResult,
  TcpConnectResult,
  CaptivePortalResult,
  Ipv6StackResult,
  PathMtuResult,
  ProxyVpnStatus,
  PublicIpInfo,
  ProbeTargetResult,
} from "@/lib/tauri/types/network-probe"

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const previousDnsResult = {
  domain: "example.com",
  rrType: "A",
  resolver: "system",
  elapsedMs: 1,
  records: [{ name: "example.com", rrType: "A", ttl: 60, data: "93.184.216.34" }],
  commandHint: "dnsLookup(local, 'example.com', {rrType:'A',resolver:'system'})",
} satisfies DnsLookupResult

const previousProbeResult = {
  input: "http://127.0.0.1:3200/",
  kind: "url",
  http: { ok: true, status: 200, ttfbMs: 5, finalUrl: "http://127.0.0.1:3200/" },
  commandHint: "probeTarget(local, 'http://127.0.0.1:3200/')",
} satisfies ProbeTargetResult

const previousMtuResult = {
  target: "127.0.0.1",
  resolvedIp: "127.0.0.1",
  status: "ok",
  pathMtu: 1500,
  maxPayload: 1472,
  method: "ping-df-binary",
  steps: [],
  elapsedMs: 41,
  commandHint: "probePathMtu(local, '127.0.0.1')",
} satisfies PathMtuResult

const previousPublicIp = {
  ip: "203.0.113.7",
  commandHint: "getPublicIpInfo()",
} satisfies PublicIpInfo

const previousCaptive = {
  status: "online",
  commandHint: "detectCaptivePortal()",
} satisfies CaptivePortalResult

const previousProxyVpn = {
  proxyEnabled: false,
  proxyStatusKnown: true,
  vpnInterfacesKnown: true,
  vpnIfaces: [],
  defaultRouteKnown: true,
  defaultViaTunnel: false,
  commandHint: "getProxyVpnStatus()",
} satisfies ProxyVpnStatus

const previousIpv6 = {
  status: "ok",
  linkLocal: [],
  global: [],
  aaaaOk: true,
  aaaaAddrs: ["2001:db8::1"],
  dualStack: { ipv4Ok: true, ipv6Ok: true, detail: "previous result" },
  ndpStatus: "ok",
  elapsedMs: 1,
  commandHint: "checkIpv6Stack()",
} satisfies Ipv6StackResult

beforeEach(() => {
  dnsLookup.mockReset()
  tcpConnect.mockReset()
  probeTarget.mockReset()
  probePathMtu.mockReset()
  detectCaptivePortal.mockReset()
  getPublicIpInfo.mockReset()
  getProxyVpnStatus.mockReset()
  checkIpv6Stack.mockReset()
  useNetworkProbeStore.setState({
    loadingDns: false,
    dnsResult: previousDnsResult,
    loadingProbe: false,
    probeResult: previousProbeResult,
    loadingMtu: false,
    mtuResult: previousMtuResult,
    loadingOffline: false,
    loadingIpv6: false,
    captiveResult: previousCaptive,
    publicIpInfo: previousPublicIp,
    proxyVpnStatus: previousProxyVpn,
    ipv6Result: previousIpv6,
    commandLog: [],
    error: null,
  })
})

describe("network-probe single-run result state", () => {
  it("clears previous DNS records before a failed query", async () => {
    const request = deferred<DnsLookupResult>()
    dnsLookup.mockReturnValue(request.promise)

    const run = networkProbeUseCases.runDnsLookup("-bad", "A")

    expect(useNetworkProbeStore.getState().dnsResult).toBeNull()
    expect(useNetworkProbeStore.getState().loadingDns).toBe(true)

    request.reject(new Error("invalid domain"))
    await run

    const state = useNetworkProbeStore.getState()
    expect(state.dnsResult).toBeNull()
    expect(state.error?.key).toBe("networkProbe.errors.dnsFailed")
    expect(state.loadingDns).toBe(false)
  })

  it("clears the previous host result before a failed custom probe", async () => {
    const request = deferred<ProbeTargetResult>()
    probeTarget.mockReturnValue(request.promise)

    const run = networkProbeUseCases.runProbeTarget("-bad")

    expect(useNetworkProbeStore.getState().probeResult).toBeNull()
    expect(useNetworkProbeStore.getState().loadingProbe).toBe(true)

    request.reject(new Error("invalid target"))
    await run

    const state = useNetworkProbeStore.getState()
    expect(state.probeResult).toBeNull()
    expect(state.error?.key).toBe("networkProbe.errors.probeFailed")
    expect(state.loadingProbe).toBe(false)
  })

  it("logs a custom URL without credentials, path, query, or fragment values", async () => {
    probeTarget.mockResolvedValue(previousProbeResult)

    await networkProbeUseCases.runProbeTarget(
      "https://alice:secret@example.com/private/reset-token?api_key=secret#session",
    )

    const log = useNetworkProbeStore.getState().commandLog.join("\n")
    expect(log).toContain("https://example.com/[redacted-path]?[redacted]#[redacted]")
    expect(log).not.toContain("alice")
    expect(log).not.toContain("secret")
    expect(log).not.toContain("reset-token")
    expect(log).toContain("probeTarget done kind=url")
  })

  it("clears the previous IPv6 snapshot before a failed check", async () => {
    const request = deferred<Ipv6StackResult>()
    checkIpv6Stack.mockReturnValue(request.promise)

    const run = networkProbeUseCases.checkIpv6Stack()

    expect(useNetworkProbeStore.getState().ipv6Result).toBeNull()
    expect(useNetworkProbeStore.getState().loadingIpv6).toBe(true)

    request.reject(new Error("IPv6 probe failed"))
    await run

    const state = useNetworkProbeStore.getState()
    expect(state.ipv6Result).toBeNull()
    expect(state.error?.key).toBe("networkProbe.errors.ipv6Failed")
    expect(state.loadingIpv6).toBe(false)
  })

  it("clears the previous path measurement before a failed MTU probe", async () => {
    const request = deferred<PathMtuResult>()
    probePathMtu.mockReturnValue(request.promise)

    const run = networkProbeUseCases.probePathMtu("-bad")

    expect(useNetworkProbeStore.getState().mtuResult).toBeNull()
    expect(useNetworkProbeStore.getState().loadingMtu).toBe(true)

    request.reject(new Error("invalid target"))
    await run

    const state = useNetworkProbeStore.getState()
    expect(state.mtuResult).toBeNull()
    expect(state.error?.key).toBe("networkProbe.errors.mtuFailed")
    expect(state.loadingMtu).toBe(false)
  })

  it("clears an old public IP before a failed refresh", async () => {
    const request = deferred<PublicIpInfo>()
    getPublicIpInfo.mockReturnValue(request.promise)

    const run = networkProbeUseCases.refreshPublicIp()

    expect(useNetworkProbeStore.getState().publicIpInfo).toBeNull()
    expect(useNetworkProbeStore.getState().loadingOffline).toBe(true)

    request.reject(new Error("egress lookup failed"))
    await run

    const state = useNetworkProbeStore.getState()
    expect(state.publicIpInfo).toBeNull()
    expect(state.error?.key).toBe("networkProbe.errors.offlineFailed")
    expect(state.loadingOffline).toBe(false)
  })

  it("clears prior offline diagnostics before an atomic rerun that fails", async () => {
    const failingProxyRequest = deferred<ProxyVpnStatus>()
    detectCaptivePortal.mockResolvedValue({ status: "online", commandHint: "fresh captive" })
    getPublicIpInfo.mockResolvedValue({ ip: "198.51.100.9", commandHint: "fresh egress" })
    getProxyVpnStatus.mockReturnValue(failingProxyRequest.promise)
    checkIpv6Stack.mockResolvedValue(previousIpv6)
    probePathMtu.mockResolvedValue(previousMtuResult)

    const run = networkProbeUseCases.runOfflineDiagnostics()

    const loadingState = useNetworkProbeStore.getState()
    expect(loadingState.loadingOffline).toBe(true)
    expect(loadingState.captiveResult).toBeNull()
    expect(loadingState.publicIpInfo).toBeNull()
    expect(loadingState.proxyVpnStatus).toBeNull()
    expect(loadingState.ipv6Result).toBeNull()
    expect(loadingState.mtuResult).toBeNull()

    failingProxyRequest.reject(new Error("proxy status failed"))
    await run

    const state = useNetworkProbeStore.getState()
    expect(state.loadingOffline).toBe(false)
    expect(state.error?.key).toBe("networkProbe.errors.offlineFailed")
    expect(state.captiveResult).toBeNull()
    expect(state.publicIpInfo).toBeNull()
    expect(state.proxyVpnStatus).toBeNull()
    expect(state.ipv6Result).toBeNull()
    expect(state.mtuResult).toBeNull()
  })

  it("keeps the offline bundle locked until every child settles after an early failure", async () => {
    const failingProxyRequest = deferred<ProxyVpnStatus>()
    const pendingPublicIpRequest = deferred<PublicIpInfo>()
    detectCaptivePortal.mockResolvedValue({ status: "online", commandHint: "fresh captive" })
    getPublicIpInfo.mockReturnValue(pendingPublicIpRequest.promise)
    getProxyVpnStatus.mockReturnValue(failingProxyRequest.promise)
    checkIpv6Stack.mockResolvedValue(previousIpv6)
    probePathMtu.mockResolvedValue(previousMtuResult)

    const run = networkProbeUseCases.runOfflineDiagnostics()
    failingProxyRequest.reject(new Error("proxy status failed"))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useNetworkProbeStore.getState().loadingOffline).toBe(true)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.offlineFailed")
    await networkProbeUseCases.runOfflineDiagnostics()
    await networkProbeUseCases.refreshPublicIp()
    expect(detectCaptivePortal).toHaveBeenCalledTimes(1)
    expect(getPublicIpInfo).toHaveBeenCalledTimes(1)

    pendingPublicIpRequest.resolve({ ip: "198.51.100.10", commandHint: "fresh egress" })
    await run

    const state = useNetworkProbeStore.getState()
    expect(state.loadingOffline).toBe(false)
    expect(state.error?.key).toBe("networkProbe.errors.offlineFailed")
    expect(state.captiveResult).toBeNull()
    expect(state.publicIpInfo).toBeNull()
  })

  it.each(["loadingIpv6", "loadingMtu"] as const)(
    "does not start the offline bundle while a standalone %s check is running",
    async (loadingFlag) => {
      useNetworkProbeStore.setState({ [loadingFlag]: true })

      await networkProbeUseCases.runOfflineDiagnostics()

      const state = useNetworkProbeStore.getState()
      expect(detectCaptivePortal).not.toHaveBeenCalled()
      expect(getPublicIpInfo).not.toHaveBeenCalled()
      expect(getProxyVpnStatus).not.toHaveBeenCalled()
      expect(checkIpv6Stack).not.toHaveBeenCalled()
      expect(probePathMtu).not.toHaveBeenCalled()
      expect(state.loadingOffline).toBe(false)
      expect(state.captiveResult).toEqual(previousCaptive)
      expect(state.publicIpInfo).toEqual(previousPublicIp)
      expect(state.proxyVpnStatus).toEqual(previousProxyVpn)
      expect(state.ipv6Result).toEqual(previousIpv6)
      expect(state.mtuResult).toEqual(previousMtuResult)
    },
  )

  it("does not start standalone IPv6 or MTU checks while offline diagnostics are running", async () => {
    useNetworkProbeStore.setState({ loadingOffline: true })

    await networkProbeUseCases.checkIpv6Stack()
    await networkProbeUseCases.probePathMtu("1.1.1.1")

    const state = useNetworkProbeStore.getState()
    expect(checkIpv6Stack).not.toHaveBeenCalled()
    expect(probePathMtu).not.toHaveBeenCalled()
    expect(state.loadingIpv6).toBe(false)
    expect(state.loadingMtu).toBe(false)
    expect(state.ipv6Result).toEqual(previousIpv6)
    expect(state.mtuResult).toEqual(previousMtuResult)
  })

  it("keeps the active panel error when an older request fails later", async () => {
    const dnsRequest = deferred<DnsLookupResult>()
    const tcpRequest = deferred<TcpConnectResult>()
    dnsLookup.mockReturnValue(dnsRequest.promise)
    tcpConnect.mockReturnValue(tcpRequest.promise)

    const store = useNetworkProbeStore.getState()
    store.setL1("test")
    store.setL2("tcp")

    const dnsRun = networkProbeUseCases.runDnsLookup("example.com", "A")
    const tcpRun = networkProbeUseCases.runTcpConnect("127.0.0.1", 1)

    tcpRequest.reject(new Error("TCP connection refused"))
    await tcpRun
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.tcpFailed")

    dnsRequest.reject(new Error("DNS lookup failed"))
    await dnsRun

    const state = useNetworkProbeStore.getState()
    expect(state.error?.key).toBe("networkProbe.errors.tcpFailed")
    expect(isNetworkProbeErrorVisible(state.error, "test", "tcp", state.nav.offlineSub)).toBe(true)
  })
})
