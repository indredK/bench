/**
 * network-probe cancel idempotency test / 取消幂等测试 (A4-4):
 *   cancelScan 在无活动会话时 no-op；有活动会话时仅调用一次后端；
 *   会话结束后重复取消不产生额外 IPC；cancelled 扫描不进入历史报告。
 */
import { act, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { cancelScan, runHealthScan, tcpConnect } = vi.hoisted(() => ({
  cancelScan: vi.fn(),
  runHealthScan: vi.fn(),
  tcpConnect: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    runHealthScan,
    cancelScan,
    tcpConnect,
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
  tcpConnect.mockReset()
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
    errors: [],
  })
})

describe("network-probe cancel idempotency (A4-4)", () => {
  it("no-ops when there is no active session", async () => {
    await act(async () => {
      await networkProbeUseCases.cancelScan("health")
    })
    expect(cancelScan).not.toHaveBeenCalled()
    expect(useNetworkProbeStore.getState().errors).toHaveLength(0)
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

  it("keeps concurrent operation failures separate and clears only the retried operation", async () => {
    runHealthScan.mockRejectedValue(new Error("health scan unavailable"))
    tcpConnect.mockRejectedValue(new Error("TCP target unreachable"))

    await act(async () => {
      await Promise.all([
        networkProbeUseCases.runHealthScan(),
        networkProbeUseCases.runTcpConnect("example.com", 443),
      ])
    })

    expect(
      useNetworkProbeStore
        .getState()
        .errors.map((error) => error.key)
        .sort(),
    ).toEqual(["networkProbe.errors.healthFailed", "networkProbe.errors.tcpFailed"])

    runHealthScan.mockResolvedValue(healthResult("session-3", false))
    await act(async () => {
      await networkProbeUseCases.runHealthScan()
    })

    expect(useNetworkProbeStore.getState().errors.map((error) => error.key)).toEqual([
      "networkProbe.errors.tcpFailed",
    ])
  })

  it("allows a failed cancellation request to be retried", async () => {
    let resolveScan: (value: unknown) => void = () => {}
    runHealthScan.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve
        }),
    )
    cancelScan
      .mockRejectedValueOnce(new Error("temporary cancel failure"))
      .mockResolvedValueOnce(true)

    const scanPromise = networkProbeUseCases.runHealthScan()
    act(() => {
      listeners.get(TAURI_EVENTS.networkProbe.scanSession)?.({
        payload: { sessionId: "session-retry", kind: "health" },
      })
    })

    await act(async () => {
      await networkProbeUseCases.cancelScan("health")
    })
    expect(useNetworkProbeStore.getState().cancelRequestedSessionIdByKind.health).toBeNull()
    expect(useNetworkProbeStore.getState().errors.map((error) => error.key)).toEqual([
      "networkProbe.errors.cancelFailed",
    ])
    expect(useNetworkProbeStore.getState().errors[0]?.scope).toBe("health")

    await act(async () => {
      await networkProbeUseCases.cancelScan("health")
    })
    expect(cancelScan).toHaveBeenCalledTimes(2)
    expect(cancelScan).toHaveBeenNthCalledWith(2, "session-retry")
    expect(useNetworkProbeStore.getState().errors).toHaveLength(0)

    resolveScan(healthResult("session-retry", true))
    await scanPromise
  })

  it("keeps cancellation failures separate across concurrent scan kinds", async () => {
    useNetworkProbeStore.getState().setActiveSessionId("health", "health-session")
    useNetworkProbeStore.getState().setActiveSessionId("ports", "ports-session")
    cancelScan
      .mockRejectedValueOnce(new Error("health cancel failed"))
      .mockRejectedValueOnce(new Error("port cancel failed"))

    await Promise.all([
      networkProbeUseCases.cancelScan("health"),
      networkProbeUseCases.cancelScan("ports"),
    ])

    expect(
      useNetworkProbeStore
        .getState()
        .errors.map(({ key, scope }) => `${key}:${scope}`)
        .sort(),
    ).toEqual(["networkProbe.errors.cancelFailed:health", "networkProbe.errors.cancelFailed:ports"])

    cancelScan.mockResolvedValueOnce(undefined)
    await networkProbeUseCases.cancelScan("health")

    expect(useNetworkProbeStore.getState().errors.map((error) => error.scope)).toEqual(["ports"])
  })

  it("does not let a late cancellation failure clear the next session request", async () => {
    const scanResolvers: Array<(value: unknown) => void> = []
    let rejectFirstCancel: (error: Error) => void = () => {}
    runHealthScan.mockImplementation(
      () =>
        new Promise((resolve) => {
          scanResolvers.push(resolve)
        }),
    )
    cancelScan
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirstCancel = reject
          }),
      )
      .mockResolvedValueOnce(undefined)

    const firstScan = networkProbeUseCases.runHealthScan()
    await waitFor(() => expect(scanResolvers).toHaveLength(1))
    act(() => {
      listeners.get(TAURI_EVENTS.networkProbe.scanSession)?.({
        payload: { sessionId: "session-old", kind: "health" },
      })
    })
    const firstCancel = networkProbeUseCases.cancelScan("health")

    scanResolvers[0](healthResult("session-old", false))
    await firstScan

    const secondScan = networkProbeUseCases.runHealthScan()
    await waitFor(() => expect(scanResolvers).toHaveLength(2))
    act(() => {
      listeners.get(TAURI_EVENTS.networkProbe.scanSession)?.({
        payload: { sessionId: "session-new", kind: "health" },
      })
    })
    const secondCancel = networkProbeUseCases.cancelScan("health")
    expect(useNetworkProbeStore.getState().cancelRequestedSessionIdByKind.health).toBe(
      "session-new",
    )

    rejectFirstCancel(new Error("late cancellation failure"))
    await firstCancel

    expect(useNetworkProbeStore.getState().cancelRequestedSessionIdByKind.health).toBe(
      "session-new",
    )
    expect(useNetworkProbeStore.getState().errors).toHaveLength(0)
    await networkProbeUseCases.cancelScan("health")
    expect(cancelScan).toHaveBeenCalledTimes(2)

    await secondCancel
    scanResolvers[1](healthResult("session-new", true))
    await secondScan
  })
})
