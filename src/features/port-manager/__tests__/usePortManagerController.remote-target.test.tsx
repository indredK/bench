import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ChangeEvent } from "react"

const { portCheck, queryPortProcesses, killProcesses, isPermissionGranted, requestPermission } =
  vi.hoisted(() => ({
    portCheck: vi.fn(),
    queryPortProcesses: vi.fn(),
    killProcesses: vi.fn(),
    isPermissionGranted: vi.fn(),
    requestPermission: vi.fn(),
  }))

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({ scrollToIndex: vi.fn() }),
}))
vi.mock("@/platform/capabilities", () => ({ canUseDesktopFeatures: () => true }))
vi.mock("@tauri-apps/plugin-notification", () => ({ isPermissionGranted, requestPermission }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/features/port-manager/services/port-manager.use-cases", () => ({
  portManagerUseCases: {
    MAX_KILL_TARGETS: 100,
    isAvailable: () => true,
    portCheck,
    queryPortProcesses,
    mapPortCheckToDetail: ({
      port,
      open,
      error,
    }: {
      port: number
      open: boolean
      error: string | null
    }) => ({
      port,
      pids: open && !error ? [0] : [],
      process_trees: [],
      fingerprint: null,
      error,
    }),
    buildKillTargets: vi.fn(),
    killProcesses,
    groupKillResultsByPort: vi.fn(),
  },
}))

import { usePortManagerController } from "@/features/port-manager/hooks/usePortManagerController"
import { usePortManagerStore } from "@/features/port-manager/store"

beforeEach(() => {
  portCheck.mockReset()
  queryPortProcesses.mockReset()
  killProcesses.mockReset()
  isPermissionGranted.mockReset()
  requestPermission.mockReset()
  usePortManagerStore.setState({
    scanMode: "remote",
    remoteHost: "old.example",
    scanSession: 0,
    portStates: [{ port: 8080, status: "success" }],
    portDetails: [{ port: 8080, pids: [0], process_trees: [], fingerprint: null, error: null }],
    portKillResults: { 8080: [{ pid: 1, success: true, message: "old result" }] },
    error: null,
    alertsError: null,
    alertsEnabled: false,
  })
})

describe("usePortManagerController remote target changes", () => {
  it("requests notification permission from the enable action and only enables on grant", async () => {
    isPermissionGranted.mockResolvedValue(false)
    requestPermission.mockResolvedValue("granted")
    usePortManagerStore.setState({ error: { key: "portManager.errors.killOneFailed" } })
    const { result, unmount } = renderHook(() => usePortManagerController())

    await act(async () => {
      await result.current.handleToggleAlerts()
    })

    expect(isPermissionGranted).toHaveBeenCalledTimes(1)
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(usePortManagerStore.getState().alertsEnabled).toBe(true)
    expect(usePortManagerStore.getState().error).toEqual({
      key: "portManager.errors.killOneFailed",
    })
    expect(result.current.requestingAlertsPermission).toBe(false)
    unmount()
  })

  it("enables alerts directly when notification permission is already granted", async () => {
    isPermissionGranted.mockResolvedValue(true)
    const { result, unmount } = renderHook(() => usePortManagerController())

    await act(async () => {
      await result.current.handleToggleAlerts()
    })

    expect(requestPermission).not.toHaveBeenCalled()
    expect(usePortManagerStore.getState().alertsEnabled).toBe(true)
    unmount()
  })

  it("leaves alerts disabled and explains when the user denies notification permission", async () => {
    isPermissionGranted.mockResolvedValue(false)
    requestPermission.mockResolvedValue("denied")
    const { result, unmount } = renderHook(() => usePortManagerController())

    await act(async () => {
      await result.current.handleToggleAlerts()
    })

    expect(usePortManagerStore.getState().alertsEnabled).toBe(false)
    expect(usePortManagerStore.getState().alertsError).toEqual({
      key: "portManager.alertsPermissionDenied",
    })
    unmount()
  })

  it("does not ask for permission when alerts are already enabled and toggled off", async () => {
    usePortManagerStore.setState({ alertsEnabled: true })
    usePortManagerStore.setState({ error: { key: "portManager.errors.killOneFailed" } })
    const { result, unmount } = renderHook(() => usePortManagerController())

    await act(async () => {
      await result.current.handleToggleAlerts()
    })

    expect(usePortManagerStore.getState().alertsEnabled).toBe(false)
    expect(usePortManagerStore.getState().error).toEqual({
      key: "portManager.errors.killOneFailed",
    })
    expect(isPermissionGranted).not.toHaveBeenCalled()
    expect(requestPermission).not.toHaveBeenCalled()
    unmount()
  })

  it("requires a fresh alert opt-in after the last port is removed or the mode is switched", () => {
    usePortManagerStore.setState({ alertsEnabled: true })
    const { result, unmount } = renderHook(() => usePortManagerController())

    act(() => result.current.removePort(8080))
    expect(usePortManagerStore.getState().alertsEnabled).toBe(false)

    usePortManagerStore.setState({
      alertsEnabled: true,
      scanMode: "remote",
      portStates: [{ port: 8080, status: "success" }],
    })
    act(() => result.current.setScanMode("local"))
    expect(usePortManagerStore.getState().alertsEnabled).toBe(false)

    usePortManagerStore.setState({
      alertsEnabled: true,
      portStates: [{ port: 8080, status: "success" }],
    })
    act(() => usePortManagerStore.getState().clearAll())
    expect(usePortManagerStore.getState().alertsEnabled).toBe(false)
    unmount()
  })

  it("invalidates an in-flight scan and clears results from the previous host", async () => {
    let resolvePortCheck!: (value: { port: number; open: boolean; error: null }[]) => void
    portCheck.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePortCheck = resolve
      }),
    )

    const { result, unmount } = renderHook(() => usePortManagerController())
    act(() => {
      result.current.handleRescanPort(8080)
    })
    expect(portCheck).toHaveBeenCalledWith("old.example", [8080])

    act(() => {
      result.current.handleRemoteHostChange({
        target: { value: "new.example" },
      } as ChangeEvent<HTMLInputElement>)
    })

    expect(usePortManagerStore.getState()).toMatchObject({
      remoteHost: "new.example",
      scanSession: 1,
      portStates: [{ port: 8080, status: "ended" }],
      portDetails: [],
      portKillResults: {},
    })

    await act(async () => {
      resolvePortCheck([{ port: 8080, open: true, error: null }])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(usePortManagerStore.getState().portDetails).toEqual([])
    expect(usePortManagerStore.getState().portStates).toEqual([{ port: 8080, status: "ended" }])
    unmount()
  })

  it("deduplicates an in-flight scan and drops its result after the port is removed and re-added", async () => {
    let resolveOldScan!: (value: { port: number; open: boolean; error: null }[]) => void
    portCheck
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOldScan = resolve
        }),
      )
      .mockResolvedValueOnce([{ port: 8080, open: false, error: null }])

    const { result, unmount } = renderHook(() => usePortManagerController())
    act(() => {
      result.current.handleRescanPort(8080)
      result.current.handleRescanPort(8080)
    })
    expect(portCheck).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.removePort(8080)
      result.current.addCommonPort(8080)
    })
    expect(portCheck).toHaveBeenCalledTimes(2)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(usePortManagerStore.getState().portStates).toEqual([{ port: 8080, status: "empty" }])
    expect(usePortManagerStore.getState().portDetails).toMatchObject([{ port: 8080, pids: [] }])

    await act(async () => {
      resolveOldScan([{ port: 8080, open: true, error: null }])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(usePortManagerStore.getState().portStates).toEqual([{ port: 8080, status: "empty" }])
    expect(usePortManagerStore.getState().portDetails).toMatchObject([{ port: 8080, pids: [] }])
    unmount()
  })

  it("marks a per-port query failure as an error instead of an empty port", async () => {
    portCheck.mockResolvedValueOnce([{ port: 8080, open: false, error: "connection timed out" }])

    const { result, unmount } = renderHook(() => usePortManagerController())
    act(() => result.current.handleRescanPort(8080))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(usePortManagerStore.getState().portStates).toEqual([{ port: 8080, status: "error" }])
    expect(usePortManagerStore.getState().portDetails).toMatchObject([
      { port: 8080, pids: [], error: "connection timed out" },
    ])
    unmount()
  })

  it("queries multiple local ports as one batch and marks missing rows as errors", async () => {
    usePortManagerStore.setState({
      scanMode: "local",
      portStates: [
        { port: 443, status: "waiting" },
        { port: 8080, status: "waiting" },
      ],
      portDetails: [],
    })
    queryPortProcesses.mockResolvedValueOnce([
      { port: 443, pids: [], process_trees: [], fingerprint: null, error: null },
    ])

    const { result, unmount } = renderHook(() => usePortManagerController())
    act(() => result.current.rescanAll())

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(queryPortProcesses).toHaveBeenCalledTimes(1)
    expect(queryPortProcesses).toHaveBeenCalledWith([443, 8080])
    expect(usePortManagerStore.getState().portStates).toEqual([
      { port: 443, status: "empty" },
      { port: 8080, status: "error" },
    ])
    expect(usePortManagerStore.getState().portDetails).toMatchObject([
      { port: 443, error: null },
      { port: 8080, error: "No result returned" },
    ])
    unmount()
  })

  it("keeps an in-flight port marked as scanning during a refresh-all", async () => {
    let resolveFirstScan!: (value: { port: number; open: boolean; error: null }[]) => void
    portCheck
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstScan = resolve
        }),
      )
      .mockResolvedValueOnce([{ port: 443, open: false, error: null }])
    usePortManagerStore.setState({
      portStates: [
        { port: 8080, status: "success" },
        { port: 443, status: "success" },
      ],
      portDetails: [
        { port: 8080, pids: [0], process_trees: [], fingerprint: null, error: null },
        { port: 443, pids: [0], process_trees: [], fingerprint: null, error: null },
      ],
    })

    const { result, unmount } = renderHook(() => usePortManagerController())
    act(() => result.current.handleRescanPort(8080))
    act(() => result.current.rescanAll())

    expect(usePortManagerStore.getState().portStates).toEqual([
      { port: 8080, status: "scanning" },
      { port: 443, status: "scanning" },
    ])
    expect(portCheck).toHaveBeenNthCalledWith(2, "old.example", [443])

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    resolveFirstScan([{ port: 8080, open: true, error: null }])
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(usePortManagerStore.getState().portStates).toEqual([
      { port: 8080, status: "success" },
      { port: 443, status: "empty" },
    ])
    unmount()
  })

  it("rejects kill attempts while a scan is active", async () => {
    usePortManagerStore.setState({
      scanMode: "local",
      portStates: [{ port: 8080, status: "scanning" }],
    })
    const { result, unmount } = renderHook(() => usePortManagerController())

    await act(async () => {
      await result.current.killPort(8080, [123])
    })

    expect(killProcesses).not.toHaveBeenCalled()
    expect(usePortManagerStore.getState().killing).toBe(false)
    unmount()
  })

  it("never sends local Kill IPC from Remote mode, even if called outside the hidden UI", async () => {
    const { result, unmount } = renderHook(() => usePortManagerController())

    await act(async () => {
      await result.current.killPort(8080, [0])
      await result.current.killAll()
    })

    expect(killProcesses).not.toHaveBeenCalled()
    expect(usePortManagerStore.getState().killing).toBe(false)
    unmount()
  })
})
