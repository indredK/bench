import { beforeEach, describe, expect, it, vi } from "vitest"

const { discoverLan, handlers } = vi.hoisted(() => ({
  discoverLan: vi.fn(),
  handlers: new Map<string, Set<(event: { payload: unknown }) => void>>(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { discoverLan },
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(
    async (event: string, handler: (event: { payload: unknown }) => void) => {
      let listeners = handlers.get(event)
      if (!listeners) {
        listeners = new Set()
        handlers.set(event, listeners)
      }
      listeners.add(handler)
      return () => listeners?.delete(handler)
    },
  ),
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import type { LanDiscoveryProgressEvent, LanDiscoveryResult } from "@/lib/tauri/types/network-probe"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function emit<T>(eventName: string, payload: T) {
  handlers.get(eventName)?.forEach((handler) => handler({ payload }))
}

function progress(sessionId: string): LanDiscoveryProgressEvent {
  return {
    sessionId,
    phase: "scanning",
    checkedHosts: 32,
    totalHosts: 253,
    discoveredNeighbors: 3,
  }
}

function result(sessionId: string): LanDiscoveryResult {
  return {
    mode: "arp-cache+tcp-sweep",
    neighbors: [{ ip: "192.168.0.1", source: "arp-cache" }],
    cidr: "192.168.0.0/24",
    cancelled: false,
    sessionId,
    elapsedMs: 120,
    commandHint: "scanLan(local)",
  }
}

beforeEach(() => {
  handlers.clear()
  discoverLan.mockReset()
  useNetworkProbeStore.setState({
    loadingLan: false,
    lanResult: null,
    lanProgress: null,
    activeSessionIdByKind: {
      ...useNetworkProbeStore.getState().activeSessionIdByKind,
      lan: null,
    },
    commandLog: [],
    error: null,
  })
})

describe("LAN discovery progress", () => {
  it("accepts only the active scan session and releases both listeners on completion", async () => {
    const pending = deferred<LanDiscoveryResult>()
    discoverLan.mockReturnValue(pending.promise)

    const run = networkProbeUseCases.discoverLan()
    await new Promise((done) => setTimeout(done, 0))
    expect(discoverLan).toHaveBeenCalledOnce()

    emit(TAURI_EVENTS.networkProbe.scanSession, { sessionId: "lan-session", kind: "lan" })
    emit(TAURI_EVENTS.networkProbe.lanDiscoveryProgress, progress("stale-session"))
    expect(useNetworkProbeStore.getState().lanProgress).toBeNull()

    const activeProgress = progress("lan-session")
    emit(TAURI_EVENTS.networkProbe.lanDiscoveryProgress, activeProgress)
    expect(useNetworkProbeStore.getState().lanProgress).toEqual(activeProgress)

    const finalResult = result("lan-session")
    pending.resolve(finalResult)
    await run

    expect(useNetworkProbeStore.getState().lanResult).toEqual(finalResult)
    expect(useNetworkProbeStore.getState().lanProgress).toBeNull()
    expect(useNetworkProbeStore.getState().loadingLan).toBe(false)
    expect(useNetworkProbeStore.getState().activeSessionIdByKind.lan).toBeNull()
    expect(handlers.get(TAURI_EVENTS.networkProbe.scanSession)?.size).toBe(0)
    expect(handlers.get(TAURI_EVENTS.networkProbe.lanDiscoveryProgress)?.size).toBe(0)
  })
})
