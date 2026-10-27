import { beforeEach, describe, expect, it, vi } from "vitest"

const { browseLanServices, handlers } = vi.hoisted(() => ({
  browseLanServices: vi.fn(),
  handlers: new Map<string, Set<(event: { payload: unknown }) => void>>(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { browseLanServices },
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
import type { LanServicesProgressEvent, LanServicesResult } from "@/lib/tauri/types/network-probe"

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

function progress(sessionId: string): LanServicesProgressEvent {
  return { sessionId, phase: "mdns", discoveredServices: 1 }
}

beforeEach(() => {
  handlers.clear()
  browseLanServices.mockReset()
  useNetworkProbeStore.setState({
    loadingLanServices: false,
    lanServicesResult: null,
    lanServicesProgress: null,
    activeSessionIdByKind: {
      ...useNetworkProbeStore.getState().activeSessionIdByKind,
      lanServices: null,
    },
    commandLog: [],
    error: null,
  })
})

describe("LAN service discovery progress", () => {
  it("filters stale events, preserves cancelled results, and releases listeners", async () => {
    const pending = deferred<LanServicesResult>()
    browseLanServices.mockReturnValue(pending.promise)

    const run = networkProbeUseCases.browseLanServices()
    await new Promise((done) => setTimeout(done, 0))
    expect(browseLanServices).toHaveBeenCalledOnce()

    emit(TAURI_EVENTS.networkProbe.scanSession, {
      sessionId: "lan-services-session",
      kind: "lanServices",
    })
    emit(TAURI_EVENTS.networkProbe.lanServicesProgress, progress("old-session"))
    expect(useNetworkProbeStore.getState().lanServicesProgress).toBeNull()

    const activeProgress = progress("lan-services-session")
    emit(TAURI_EVENTS.networkProbe.lanServicesProgress, activeProgress)
    expect(useNetworkProbeStore.getState().lanServicesProgress).toEqual(activeProgress)

    const finalResult: LanServicesResult = {
      items: [],
      cancelled: true,
      sessionId: "lan-services-session",
      elapsedMs: 180,
      commandHint: "browseLanServices(local)",
    }
    pending.resolve(finalResult)
    await run

    expect(useNetworkProbeStore.getState().lanServicesResult).toEqual(finalResult)
    expect(useNetworkProbeStore.getState().lanServicesProgress).toBeNull()
    expect(useNetworkProbeStore.getState().loadingLanServices).toBe(false)
    expect(useNetworkProbeStore.getState().activeSessionIdByKind.lanServices).toBeNull()
    expect(handlers.get(TAURI_EVENTS.networkProbe.scanSession)?.size).toBe(0)
    expect(handlers.get(TAURI_EVENTS.networkProbe.lanServicesProgress)?.size).toBe(0)
  })
})
