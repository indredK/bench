import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { portCheck, queryPortProcesses, sendNotification, isPermissionGranted } = vi.hoisted(() => ({
  portCheck: vi.fn(),
  queryPortProcesses: vi.fn(),
  sendNotification: vi.fn(),
  isPermissionGranted: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-notification", () => ({ sendNotification, isPermissionGranted }))
vi.mock("@/platform/capabilities", () => ({ canUseDesktopFeatures: () => true }))
vi.mock("@/features/port-manager/services/port-manager.use-cases", () => ({
  portManagerUseCases: { portCheck, queryPortProcesses },
}))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { usePortManagerStore } from "@/features/port-manager/store"
import { usePortOccupationAlerts } from "@/features/port-manager/hooks/usePortOccupationAlerts"

const occupied = (port: number) => ({
  port,
  pids: [42],
  process_trees: [],
  fingerprint: null,
  error: null,
})
const free = (port: number) => ({
  port,
  pids: [],
  process_trees: [],
  fingerprint: null,
  error: null,
})
const failed = (port: number) => ({
  port,
  pids: [],
  process_trees: [],
  fingerprint: null,
  error: "Failed to query: permission denied",
})

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function pollAgain() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  portCheck.mockReset()
  queryPortProcesses.mockReset()
  sendNotification.mockReset()
  isPermissionGranted.mockReset().mockResolvedValue(true)
  usePortManagerStore.setState({
    alertsEnabled: true,
    alertsError: null,
    scanMode: "local",
    remoteHost: "",
    portStates: [{ port: 80, status: "success" }],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("usePortOccupationAlerts", () => {
  it("resets the baseline when a port is removed and re-added between polls", async () => {
    queryPortProcesses.mockResolvedValueOnce([free(80)]).mockResolvedValueOnce([occupied(80)])

    const { unmount } = renderHook(() => usePortOccupationAlerts())
    await flushPromises()

    act(() => usePortManagerStore.setState({ portStates: [] }))
    act(() => usePortManagerStore.setState({ portStates: [{ port: 80, status: "success" }] }))

    await pollAgain()
    expect(queryPortProcesses).toHaveBeenCalledTimes(2)
    expect(sendNotification).not.toHaveBeenCalled()
    unmount()
  })

  it("uses a fresh baseline when the monitored port set changes", async () => {
    queryPortProcesses
      .mockResolvedValueOnce([occupied(80)])
      .mockResolvedValueOnce([occupied(80), occupied(443)])
      .mockResolvedValueOnce([occupied(80), free(443)])
      .mockResolvedValueOnce([occupied(80), occupied(443)])

    const { unmount } = renderHook(() => usePortOccupationAlerts())
    await flushPromises()

    usePortManagerStore.setState({
      portStates: [
        { port: 80, status: "success" },
        { port: 443, status: "success" },
      ],
    })
    await pollAgain()
    expect(sendNotification).not.toHaveBeenCalled()

    await pollAgain()
    expect(sendNotification).not.toHaveBeenCalled()

    await pollAgain()
    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect(sendNotification).toHaveBeenCalledWith({
      title: "portManager.occupationAlertTitle",
      body: "portManager.occupationAlertBody",
    })
    unmount()
  })

  it("turns alerts off when notification permission is revoked without a port transition", async () => {
    queryPortProcesses.mockResolvedValue([free(80)])
    isPermissionGranted.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const { unmount } = renderHook(() => usePortOccupationAlerts())
    await flushPromises()
    expect(usePortManagerStore.getState().alertsEnabled).toBe(true)

    await pollAgain()

    expect(queryPortProcesses).toHaveBeenCalledOnce()
    expect(sendNotification).not.toHaveBeenCalled()
    expect(usePortManagerStore.getState().alertsEnabled).toBe(false)
    expect(usePortManagerStore.getState().alertsError).toEqual({
      key: "portManager.alertsPermissionRevoked",
    })
    unmount()
  })

  it("turns alerts off with an explanatory error when permission status cannot be checked", async () => {
    isPermissionGranted.mockRejectedValueOnce(new Error("notification service unavailable"))

    const { unmount } = renderHook(() => usePortOccupationAlerts())
    await flushPromises()

    expect(queryPortProcesses).not.toHaveBeenCalled()
    expect(usePortManagerStore.getState().alertsEnabled).toBe(false)
    expect(usePortManagerStore.getState().alertsError).toEqual({
      key: "portManager.alertsPermissionFailed",
    })
    unmount()
  })

  it("turns alerts off and explains when permission is revoked before delivery", async () => {
    queryPortProcesses.mockResolvedValueOnce([free(80)]).mockResolvedValueOnce([occupied(80)])
    isPermissionGranted
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const { unmount } = renderHook(() => usePortOccupationAlerts())
    await flushPromises()
    await pollAgain()

    expect(sendNotification).not.toHaveBeenCalled()
    expect(usePortManagerStore.getState().alertsEnabled).toBe(false)
    expect(usePortManagerStore.getState().alertsError).toEqual({
      key: "portManager.alertsPermissionRevoked",
    })
    unmount()
  })

  it("turns alerts off and explains when system notification delivery throws", async () => {
    queryPortProcesses.mockResolvedValueOnce([free(80)]).mockResolvedValueOnce([occupied(80)])
    sendNotification.mockImplementationOnce(() => {
      throw new Error("notification denied")
    })

    const { unmount } = renderHook(() => usePortOccupationAlerts())
    await flushPromises()
    await pollAgain()

    expect(usePortManagerStore.getState().alertsEnabled).toBe(false)
    expect(usePortManagerStore.getState().alertsError).toEqual({
      key: "portManager.alertsDeliveryFailed",
    })
    unmount()
  })

  it.each(["local", "remote"] as const)(
    "preserves the last complete %s baseline when a poll has per-port errors",
    async (scanMode) => {
      usePortManagerStore.setState({
        scanMode,
        remoteHost: scanMode === "remote" ? "example.test" : "",
        portStates: [
          { port: 80, status: "success" },
          { port: 443, status: "success" },
        ],
      })

      if (scanMode === "local") {
        queryPortProcesses
          .mockResolvedValueOnce([occupied(80), free(443)])
          .mockResolvedValueOnce([failed(80), free(443)])
          .mockResolvedValueOnce([occupied(80), free(443)])
      } else {
        portCheck
          .mockResolvedValueOnce([
            { port: 80, open: true, error: null },
            { port: 443, open: false, error: null },
          ])
          .mockResolvedValueOnce([
            { port: 80, open: false, error: "connection timed out" },
            { port: 443, open: false, error: null },
          ])
          .mockResolvedValueOnce([
            { port: 80, open: true, error: null },
            { port: 443, open: false, error: null },
          ])
      }

      const { unmount } = renderHook(() => usePortOccupationAlerts())
      await flushPromises()
      await pollAgain()
      await pollAgain()

      expect(sendNotification).not.toHaveBeenCalled()
      unmount()
    },
  )

  it("does not overlap slow polls or apply results from a previous target", async () => {
    let resolveLocal!: (value: ReturnType<typeof occupied>[]) => void
    queryPortProcesses.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLocal = resolve
      }),
    )
    portCheck.mockResolvedValueOnce([{ port: 80, open: true, error: null }])

    const { unmount } = renderHook(() => usePortOccupationAlerts())
    await flushPromises()
    await pollAgain()
    expect(queryPortProcesses).toHaveBeenCalledTimes(1)

    usePortManagerStore.setState({ scanMode: "remote", remoteHost: "example.test" })
    await act(async () => {
      resolveLocal([occupied(80)])
      await Promise.resolve()
      await Promise.resolve()
    })
    await pollAgain()

    expect(portCheck).toHaveBeenCalledWith("example.test", [80])
    expect(sendNotification).not.toHaveBeenCalled()
    unmount()
  })

  it("does not probe a stale remote host changed during permission lookup", async () => {
    usePortManagerStore.setState({ scanMode: "remote", remoteHost: "old.example.test" })
    let resolvePermission!: (granted: boolean) => void
    isPermissionGranted.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolvePermission = resolve
      }),
    )

    const { unmount } = renderHook(() => usePortOccupationAlerts())
    await flushPromises()

    act(() => {
      usePortManagerStore.setState({ remoteHost: "new.example.test" })
    })
    await act(async () => {
      resolvePermission(true)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(portCheck).not.toHaveBeenCalled()
    unmount()
  })
})
