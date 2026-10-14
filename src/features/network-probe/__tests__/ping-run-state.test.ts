import { beforeEach, describe, expect, it, vi } from "vitest"

const { pingHost, eventListeners } = vi.hoisted(() => ({
  pingHost: vi.fn(),
  eventListeners: new Map<string, (event: { payload: unknown }) => void>(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { pingHost },
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(
    async (name: string, handler: (event: { payload: unknown }) => void) => {
      eventListeners.set(name, handler)
      return () => eventListeners.delete(name)
    },
  ),
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
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
  sessionId: "session-previous",
  cancelled: false,
  commandHint: "pingHost(local, '127.0.0.1', {count:1})",
} satisfies PingProbeResult

beforeEach(() => {
  pingHost.mockReset()
  eventListeners.clear()
  useNetworkProbeStore.setState({
    loadingPing: false,
    pingResult: previousResult,
    pingStreamingSamples: [],
    activeSessionIdByKind: {
      health: null,
      sites: null,
      ping: null,
      traceroute: null,
      speed: null,
      ports: null,
      pcap: null,
      lan: null,
    },
    cancelRequestedSessionIdByKind: {
      health: null,
      sites: null,
      ping: null,
      traceroute: null,
      speed: null,
      ports: null,
      pcap: null,
      lan: null,
    },
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

  it("only stores samples from the active ping session", async () => {
    const activeSample = { seq: 0, ok: true, rttMs: 1.2 }
    pingHost.mockImplementation(async () => {
      eventListeners.get(TAURI_EVENTS.networkProbe.scanSession)?.({
        payload: { sessionId: "ping-session-1", kind: "ping" },
      })
      eventListeners.get(TAURI_EVENTS.networkProbe.pingSample)?.({
        payload: { sessionId: "stale-session", sample: { seq: 99, ok: true, rttMs: 99 } },
      })
      eventListeners.get(TAURI_EVENTS.networkProbe.pingSample)?.({
        payload: { sessionId: "ping-session-1", sample: activeSample },
      })
      return { ...previousResult, sessionId: "ping-session-1", samples: [activeSample] }
    })

    await networkProbeUseCases.runPing("127.0.0.1", 1)

    const state = useNetworkProbeStore.getState()
    expect(state.pingStreamingSamples).toEqual([activeSample])
    expect(state.activeSessionIdByKind.ping).toBeNull()
    expect(state.pingResult?.sessionId).toBe("ping-session-1")
  })
})
