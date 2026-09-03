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

beforeEach(() => {
  listeners.clear()
  cancelScan.mockReset()
  runHealthScan.mockReset()
  useNetworkProbeStore.setState({
    loadingHealth: false,
    healthResult: null,
    activeSessionId: null,
    reportHistory: [],
    commandLog: [],
    error: null,
  })
})

describe("network-probe cancel idempotency (A4-4)", () => {
  it("no-ops when there is no active session", async () => {
    await act(async () => {
      await networkProbeUseCases.cancelScan()
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
    // scanSession 事件把活动会话写入 store。
    act(() => {
      listeners.get(TAURI_EVENTS.networkProbe.scanSession)?.({
        payload: { sessionId: "session-1", kind: "health" },
      })
    })
    expect(useNetworkProbeStore.getState().activeSessionId).toBe("session-1")

    await act(async () => {
      await networkProbeUseCases.cancelScan()
      await networkProbeUseCases.cancelScan()
    })
    expect(cancelScan).toHaveBeenCalledTimes(1)
    expect(cancelScan).toHaveBeenCalledWith("session-1")

    // 会话在 finally 中被清理, 之后重复取消 no-op (幂等)。
    resolveScan(healthResult("session-1", true))
    await scanPromise
    expect(useNetworkProbeStore.getState().activeSessionId).toBeNull()

    await act(async () => {
      await networkProbeUseCases.cancelScan()
    })
    expect(cancelScan).toHaveBeenCalledTimes(1)
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
