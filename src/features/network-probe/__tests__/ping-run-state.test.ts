import { beforeEach, describe, expect, it, vi } from "vitest"

const { pingHost } = vi.hoisted(() => ({ pingHost: vi.fn() }))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { pingHost },
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(async () => () => {}),
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type { PingProbeResult } from "@/lib/tauri/types/network-probe"

function deferred<T>() {
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((_, rejectPromise) => {
    reject = rejectPromise
  })
  return { promise, reject }
}

const previousResult = {
  target: "127.0.0.1",
  resolvedIp: "127.0.0.1",
  packetsSent: 1,
  packetsReceived: 1,
  lossPercent: 0,
  minRttMs: 0,
  avgRttMs: 0,
  maxRttMs: 0,
  stddevRttMs: 0,
  samples: [],
  commandHint: "pingHost(local, '127.0.0.1', {count:1})",
} satisfies PingProbeResult

beforeEach(() => {
  pingHost.mockReset()
  useNetworkProbeStore.setState({
    loadingPing: false,
    pingResult: previousResult,
    pingStreamingSamples: [],
    commandLog: [],
    error: null,
  })
})

describe("network-probe ping run state", () => {
  it("clears the previous result before a rerun that fails", async () => {
    const request = deferred<PingProbeResult>()
    pingHost.mockReturnValue(request.promise)

    const run = networkProbeUseCases.runPing("-bad", 1)

    expect(useNetworkProbeStore.getState().pingResult).toBeNull()
    expect(useNetworkProbeStore.getState().loadingPing).toBe(true)

    request.reject(new Error("invalid host"))
    await run

    const state = useNetworkProbeStore.getState()
    expect(state.pingResult).toBeNull()
    expect(state.error?.key).toBe("networkProbe.errors.pingFailed")
    expect(state.loadingPing).toBe(false)
  })
})
