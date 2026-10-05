/**
 * network-probe cancel idempotency test / 取消幂等测试 (A4-4):
 *   cancelScan 在无活动会话时 no-op；有活动会话时仅调用一次后端；
 *   会话结束后重复取消不产生额外 IPC；cancelled 扫描不进入历史报告。
 */
import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { cancelScan, runHealthScan } = vi.hoisted(() => ({
  cancelScan: vi.fn(),
  runHealthScan: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    runHealthScan,
    cancelScan,
  },
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
import { TAURI_EVENTS } from "@/lib/tauri/contracts"

function healthResult(sessionId: string, cancelled: boolean) {
  return {
    sessionId,
    cancelled,
    items: [{ id: "dns-resolver", title: "DNS", status: "ok" }],
    startedAt: "2026-09-03 10:00",
    finishedAt: "2026-09-03 10:00",
  } as unknown as Awaited<ReturnType<typeof runHealthScan>>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  listeners.clear()
  cancelScan.mockReset()
  runHealthScan.mockReset()
  useNetworkProbeStore.setState({
    loadingHealth: false,
    healthResult: null,
    activeSessionIdByKind: {
      health: null,
      sites: null,
      traceroute: null,
      speed: null,
      ports: null,
      pcap: null,
      lan: null,
    },
    cancelRequestedSessionIdByKind: {
      health: null,
      sites: null,
      traceroute: null,
      speed: null,
      ports: null,
      pcap: null,
      lan: null,
    },
    reportHistory: [],
    commandLog: [],
    error: null,
    errors: [],
  })
})

describe("network-probe cancel idempotency (A4-4)", () => {
  it("no-ops when there is no active session", async () => {
    await act(async () => {
      await networkProbeUseCases.cancelScan("health")
    })
    expect(cancelScan).not.toHaveBeenCalled()
    expect(useNetworkProbeStore.getState().error).toBeNull()
  })

  it("cancels the active session exactly once and is idempotent afterwards", async () => {
    let resolveScan: (value: unknown) => void = () => {}
    runHealthScan.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve
        }),
    )
    cancelScan.mockResolvedValue(true)

    const scanPromise = networkProbeUseCases.runHealthScan()
    // scanSession 事件把活动会话写进 health 那一槽。
    act(() => {
      listeners.get(TAURI_EVENTS.networkProbe.scanSession)?.({
        payload: { sessionId: "session-1", kind: "health" },
      })
    })
    expect(useNetworkProbeStore.getState().activeSessionIdByKind.health).toBe("session-1")

    await act(async () => {
      await networkProbeUseCases.cancelScan("health")
      await networkProbeUseCases.cancelScan("health")
    })
    expect(cancelScan).toHaveBeenCalledTimes(1)
    expect(cancelScan).toHaveBeenCalledWith("session-1")

    // 会话在 finally 中被清理, 之后重复取消 no-op (幂等)。
    resolveScan(healthResult("session-1", true))
    await scanPromise
    expect(useNetworkProbeStore.getState().activeSessionIdByKind.health).toBeNull()

    await act(async () => {
      await networkProbeUseCases.cancelScan("health")
    })
    expect(cancelScan).toHaveBeenCalledTimes(1)
  })

  it("allows the user to retry after the cancel request fails", async () => {
    let resolveScan: (value: unknown) => void = () => {}
    runHealthScan.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve
        }),
    )
    cancelScan.mockRejectedValueOnce(new Error("temporary IPC failure")).mockResolvedValueOnce(true)

    const scanPromise = networkProbeUseCases.runHealthScan()
    act(() => {
      listeners.get(TAURI_EVENTS.networkProbe.scanSession)?.({
        payload: { sessionId: "retry-session", kind: "health" },
      })
    })

    await act(async () => {
      await networkProbeUseCases.cancelScan("health")
    })
    const failedCancelState = useNetworkProbeStore.getState()
    expect(failedCancelState.cancelRequestedSessionIdByKind.health).toBeNull()
    expect(failedCancelState.error?.key).toBe("networkProbe.errors.cancelFailed")

    await act(async () => {
      await networkProbeUseCases.cancelScan("health")
    })
    const retriedCancelState = useNetworkProbeStore.getState()
    expect(cancelScan).toHaveBeenCalledTimes(2)
    expect(cancelScan).toHaveBeenNthCalledWith(1, "retry-session")
    expect(cancelScan).toHaveBeenNthCalledWith(2, "retry-session")
    expect(retriedCancelState.cancelRequestedSessionIdByKind.health).toBe("retry-session")
    expect(retriedCancelState.error).toBeNull()

    resolveScan(healthResult("retry-session", true))
    await scanPromise
  })

  it("does not let a late cancel failure clear a newer session's request", async () => {
    const firstScan = deferred<unknown>()
    const secondScan = deferred<unknown>()
    const firstCancel = deferred<boolean>()
    runHealthScan.mockReturnValueOnce(firstScan.promise).mockReturnValueOnce(secondScan.promise)
    cancelScan.mockReturnValueOnce(firstCancel.promise).mockResolvedValueOnce(true)

    const firstScanPromise = networkProbeUseCases.runHealthScan()
    act(() => {
      listeners.get(TAURI_EVENTS.networkProbe.scanSession)?.({
        payload: { sessionId: "old-session", kind: "health" },
      })
    })
    const firstCancelPromise = networkProbeUseCases.cancelScan("health")

    firstScan.resolve(healthResult("old-session", false))
    await firstScanPromise

    const secondScanPromise = networkProbeUseCases.runHealthScan()
    act(() => {
      listeners.get(TAURI_EVENTS.networkProbe.scanSession)?.({
        payload: { sessionId: "new-session", kind: "health" },
      })
    })
    await networkProbeUseCases.cancelScan("health")
    expect(useNetworkProbeStore.getState().cancelRequestedSessionIdByKind.health).toBe(
      "new-session",
    )

    firstCancel.reject(new Error("late IPC failure"))
    await firstCancelPromise
    const state = useNetworkProbeStore.getState()
    expect(state.cancelRequestedSessionIdByKind.health).toBe("new-session")
    expect(state.error).toBeNull()

    secondScan.resolve(healthResult("new-session", true))
    await secondScanPromise
  })

  it("does not push a cancelled health scan into report history", async () => {
    runHealthScan.mockResolvedValue(healthResult("session-2", true))

    await act(async () => {
      await networkProbeUseCases.runHealthScan()
    })

    expect(useNetworkProbeStore.getState().reportHistory).toHaveLength(0)
    expect(useNetworkProbeStore.getState().healthResult?.cancelled).toBe(true)
    expect(useNetworkProbeStore.getState().commandLog.join("\n")).toContain("healthScan cancelled")
  })
})
