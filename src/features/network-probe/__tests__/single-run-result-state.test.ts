import { beforeEach, describe, expect, it, vi } from "vitest"

const { dnsLookup, probeTarget, probePathMtu } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  probeTarget: vi.fn(),
  probePathMtu: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { dnsLookup, probeTarget, probePathMtu },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type {
  DnsLookupResult,
  PathMtuResult,
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

beforeEach(() => {
  dnsLookup.mockReset()
  probeTarget.mockReset()
  probePathMtu.mockReset()
  useNetworkProbeStore.setState({
    loadingDns: false,
    dnsResult: previousDnsResult,
    loadingProbe: false,
    probeResult: previousProbeResult,
    loadingMtu: false,
    mtuResult: previousMtuResult,
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
})
