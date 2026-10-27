import { beforeEach, describe, expect, it, vi } from "vitest"

const { compareDnsMulti, globalpingMeasure, handlers } = vi.hoisted(() => ({
  compareDnsMulti: vi.fn(),
  globalpingMeasure: vi.fn(),
  handlers: new Map<string, Set<(event: { payload: unknown }) => void>>(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { compareDnsMulti, globalpingMeasure },
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
import type {
  GlobalpingMeasurementResult,
  MultiNodeDnsResult,
} from "@/lib/tauri/types/network-probe"

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

function result(sessionId: string, nodeId: string): MultiNodeDnsResult {
  return {
    domain: "example.com",
    answers: [
      {
        nodeId,
        nodeLabel: nodeId === "local" ? "This Mac" : "Globalping · Frankfurt/DE",
        ok: true,
        answers: ["A 203.0.113.9"],
      },
    ],
    elapsedMs: 120,
    sessionId,
    cancelled: false,
    commandHint: "dnsLookup(multi, 'example.com')",
  }
}

function remoteResult(sessionId: string): GlobalpingMeasurementResult {
  return {
    target: "https://example.com/health",
    measurementType: "http",
    probes: [
      {
        nodeId: "gp-0",
        nodeLabel: "Globalping · Frankfurt/DE",
        status: "finished",
        httpStatusCode: 200,
      },
    ],
    elapsedMs: 180,
    sessionId,
    cancelled: false,
    commandHint: "globalping http",
  }
}

beforeEach(() => {
  handlers.clear()
  compareDnsMulti.mockReset()
  globalpingMeasure.mockReset()
  useNetworkProbeStore.setState({
    loadingMultiNode: false,
    multiNodeDnsResult: null,
    globalpingMeasurementResult: null,
    activeSessionIdByKind: {
      ...useNetworkProbeStore.getState().activeSessionIdByKind,
      multiNode: null,
    },
    commandLog: [],
    error: null,
  })
})

describe("Globalping partial results", () => {
  it("shows only progress for the active session and unsubscribes when complete", async () => {
    const pending = deferred<MultiNodeDnsResult>()
    compareDnsMulti.mockReturnValue(pending.promise)
    useNetworkProbeStore.setState({ globalpingMeasurementResult: remoteResult("old-session") })

    const run = networkProbeUseCases.compareDnsMulti("example.com")
    expect(useNetworkProbeStore.getState().globalpingMeasurementResult).toBeNull()
    await new Promise((done) => setTimeout(done, 0))
    expect(compareDnsMulti).toHaveBeenCalledTimes(1)

    emit(TAURI_EVENTS.networkProbe.scanSession, { sessionId: "session-a", kind: "multiNode" })
    emit(TAURI_EVENTS.networkProbe.multiNodeProgress, result("session-old", "local"))
    expect(useNetworkProbeStore.getState().multiNodeDnsResult).toBeNull()

    const partial = result("session-a", "local")
    emit(TAURI_EVENTS.networkProbe.multiNodeProgress, partial)
    expect(useNetworkProbeStore.getState().multiNodeDnsResult).toEqual(partial)

    const final = result("session-a", "gp-0")
    pending.resolve(final)
    await run

    expect(useNetworkProbeStore.getState().multiNodeDnsResult).toEqual(final)
    expect(useNetworkProbeStore.getState().loadingMultiNode).toBe(false)
    expect(handlers.get(TAURI_EVENTS.networkProbe.multiNodeProgress)?.size).toBe(0)
  })

  it("isolates Globalping Ping/HTTP progress by session and unsubscribes when complete", async () => {
    const pending = deferred<GlobalpingMeasurementResult>()
    globalpingMeasure.mockReturnValue(pending.promise)

    const run = networkProbeUseCases.measureGlobalping("http", "https://example.com/health", "HEAD")
    await new Promise((done) => setTimeout(done, 0))

    expect(globalpingMeasure).toHaveBeenCalledWith("http", "https://example.com/health", "HEAD", [
      "world",
      "US",
      "Europe",
    ])
    emit(TAURI_EVENTS.networkProbe.scanSession, { sessionId: "remote-session", kind: "multiNode" })
    emit(TAURI_EVENTS.networkProbe.globalpingProgress, remoteResult("stale-session"))
    expect(useNetworkProbeStore.getState().globalpingMeasurementResult).toBeNull()

    const partial = remoteResult("remote-session")
    emit(TAURI_EVENTS.networkProbe.globalpingProgress, partial)
    expect(useNetworkProbeStore.getState().globalpingMeasurementResult).toEqual(partial)

    const final = remoteResult("remote-session")
    pending.resolve(final)
    await run

    expect(useNetworkProbeStore.getState().globalpingMeasurementResult).toEqual(final)
    expect(useNetworkProbeStore.getState().loadingMultiNode).toBe(false)
    expect(handlers.get(TAURI_EVENTS.networkProbe.globalpingProgress)?.size).toBe(0)
  })

  it("localizes invalid public target errors instead of exposing backend English", async () => {
    globalpingMeasure.mockRejectedValue({
      code: "INVALID_INPUT",
      message: "Only public internet targets can be measured remotely",
    })

    await networkProbeUseCases.measureGlobalping("ping", "127.0.0.1")

    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.nodes.targetInvalid")
    expect(useNetworkProbeStore.getState().loadingMultiNode).toBe(false)
  })
})
