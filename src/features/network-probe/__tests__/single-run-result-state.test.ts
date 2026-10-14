import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  dnsLookup,
  probeTarget,
  probePathMtu,
  detectCaptivePortal,
  getPublicIpInfo,
  getProxyVpnStatus,
  checkIpv6Stack,
} = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
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
    probeTarget,
    probePathMtu,
    detectCaptivePortal,
    getPublicIpInfo,
    getProxyVpnStatus,
    checkIpv6Stack,
  },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type {
  DnsLookupResult,
  CaptivePortalResult,
  Ipv6StackResult,
  PathMtuResult,
  ProxyVpnStatus,
  PublicIpInfo,
  ProbeTargetResult,
} from "@/lib/tauri/types/network-probe"

function deferred<T>() {
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((_, rejectPromise) => {
    reject = rejectPromise
  })
  return { promise, reject }
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
  vpnIfaces: [],
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
})
