/**
 * network-probe cancel idempotency test / 取消幂等测试 (A4-4):
 *   cancelScan 在无活动会话时 no-op；有活动会话时仅调用一次后端；
 *   会话结束后重复取消不产生额外 IPC；cancelled 扫描不进入历史报告。
 */
import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { cancelScan, runHealthScan, runSpeedTest } = vi.hoisted(() => ({
  cancelScan: vi.fn(),
  runHealthScan: vi.fn(),
  runSpeedTest: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    runHealthScan,
    runSpeedTest,
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
import type { SpeedTestResult } from "@/lib/tauri/types/network-probe"

function healthResult(sessionId: string, cancelled: boolean) {
  return {
    sessionId,
    cancelled,
    items: [{ id: "dns-resolver", title: "DNS", status: "ok" }],
    startedAt: "2026-09-03 10:00",
    finishedAt: "2026-09-03 10:00",
  } as unknown as Awaited<ReturnType<typeof runHealthScan>>
}

function speedResult(sessionId: string, cancelled: boolean): SpeedTestResult {
  return {
    sourceId: "self-hosted",
    sourceName: "Self-hosted",
    ok: !cancelled,
    cancelled,
    sessionId,
    commandHint: `startSpeedTest('self-hosted') // sessionId=${sessionId}`,
    ...(cancelled ? {} : { pingMs: 12 }),
  }
}

beforeEach(() => {
  listeners.clear()
  cancelScan.mockReset()
  runHealthScan.mockReset()
  runSpeedTest.mockReset()
  useNetworkProbeStore.setState({
    loadingHealth: false,
    loadingSpeed: false,
    healthResult: null,
    speedResult: null,
    speedSample: null,
    speedCooldownUntil: null,
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

  it("allows retrying cancellation after the IPC request fails", async () => {
    cancelScan.mockRejectedValueOnce(new Error("IPC unavailable")).mockResolvedValueOnce(true)
    useNetworkProbeStore.setState({
      activeSessionIdByKind: {
        health: "session-retry",
        sites: null,
        traceroute: null,
        speed: null,
        ports: null,
        pcap: null,
        lan: null,
      },
    })

    await act(async () => {
      await networkProbeUseCases.cancelScan("health")
    })

    expect(useNetworkProbeStore.getState().cancelRequestedSessionIdByKind.health).toBeNull()
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.cancelFailed")

    await act(async () => {
      await networkProbeUseCases.cancelScan("health")
    })

    expect(cancelScan).toHaveBeenCalledTimes(2)
    expect(cancelScan).toHaveBeenLastCalledWith("session-retry")
    expect(useNetworkProbeStore.getState().cancelRequestedSessionIdByKind.health).toBe(
      "session-retry",
    )
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

  it("does not push a cancelled health scan into report history", async () => {
    runHealthScan.mockResolvedValue(healthResult("session-2", true))

    await act(async () => {
      await networkProbeUseCases.runHealthScan()
    })

    expect(useNetworkProbeStore.getState().reportHistory).toHaveLength(0)
    expect(useNetworkProbeStore.getState().healthResult?.cancelled).toBe(true)
    expect(useNetworkProbeStore.getState().commandLog.join("\n")).toContain("healthScan cancelled")
  })

  it("clears the loading state and allows an immediate retry after speed-test cancellation", async () => {
    let resolveSpeedTest: (value: SpeedTestResult) => void = () => {}
    runSpeedTest.mockImplementation(
      () =>
        new Promise<SpeedTestResult>((resolve) => {
          resolveSpeedTest = resolve
        }),
    )
    cancelScan.mockResolvedValue(true)

    const cancelledRun = networkProbeUseCases.runSpeedTest("self-hosted")
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    act(() => {
      listeners.get(TAURI_EVENTS.networkProbe.scanSession)?.({
        payload: { sessionId: "speed-cancelled", kind: "speed" },
      })
    })

    await act(async () => {
      await networkProbeUseCases.cancelScan("speed")
    })
    expect(cancelScan).toHaveBeenCalledWith("speed-cancelled")

    await act(async () => {
      resolveSpeedTest(speedResult("speed-cancelled", true))
      await cancelledRun
    })
    expect(useNetworkProbeStore.getState().loadingSpeed).toBe(false)
    expect(useNetworkProbeStore.getState().speedCooldownUntil).toBeNull()

    runSpeedTest.mockResolvedValueOnce(speedResult("speed-retry", false))
    await act(async () => {
      await networkProbeUseCases.runSpeedTest("self-hosted")
    })

    expect(runSpeedTest).toHaveBeenCalledTimes(2)
    expect(useNetworkProbeStore.getState().speedResult?.sessionId).toBe("speed-retry")
  })

  it("cools down when ping works but neither bandwidth direction returns data", async () => {
    runSpeedTest.mockResolvedValueOnce({
      ...speedResult("speed-ping-only", false),
      ok: false,
      pingMs: 12,
    })
    const startedAt = Date.now()

    await act(async () => {
      await networkProbeUseCases.runSpeedTest("self-hosted")
    })

    expect(useNetworkProbeStore.getState().speedResult?.pingMs).toBe(12)
    expect(useNetworkProbeStore.getState().speedCooldownUntil).toBeGreaterThanOrEqual(
      Date.now() + 29_000,
    )
    expect(useNetworkProbeStore.getState().speedCooldownUntil).toBeLessThanOrEqual(
      startedAt + 31_000,
    )
  })
})
