/**
 * Test / 测试: verify updater controller behavior; 验证更新控制器行为.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useUpdaterController } from "@/features/updater/hooks/useUpdaterController"
import { useUpdaterStore } from "@/features/updater/store"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import type { AppUpdateInfo } from "@/lib/tauri/types/updater"

const { mockReadUpdaterPolicy, mockWriteUpdaterPolicy, capturedHandlers } = vi.hoisted(() => ({
  mockReadUpdaterPolicy: vi.fn(),
  mockWriteUpdaterPolicy: vi.fn(),
  capturedHandlers: { download: [] as Array<(event: { payload: unknown }) => void> },
}))

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/platform/capabilities", () => ({
  canUseDesktopFeatures: vi.fn(() => true),
}))

vi.mock("@/platform/shell", () => ({
  openExternal: vi.fn(async () => {}),
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(
    async (event: string, handler: (event: { payload: unknown }) => void) => {
      if (event === "app-updater-download") capturedHandlers.download.push(handler)
      return () => {}
    },
  ),
}))

vi.mock("@/features/updater/services/updater-policy.repository", () => ({
  readUpdaterPolicy: mockReadUpdaterPolicy,
  writeUpdaterPolicy: mockWriteUpdaterPolicy,
}))

const mockCheckForAppUpdate = vi.fn()
const mockDownloadAndInstall = vi.fn()
const mockCancelDownload = vi.fn()
const mockRestartAfterUpdate = vi.fn()
const mockGetCurrentVersion = vi.fn()

vi.mock("@/lib/tauri/commands/updater", () => ({
  checkForAppUpdate: (...args: unknown[]) => mockCheckForAppUpdate(...args),
  downloadAndInstallAppUpdate: (...args: unknown[]) => mockDownloadAndInstall(...args),
  cancelAppUpdateDownload: (...args: unknown[]) => mockCancelDownload(...args),
  restartAfterUpdate: (...args: unknown[]) => mockRestartAfterUpdate(...args),
  getCurrentAppVersion: (...args: unknown[]) => mockGetCurrentVersion(...args),
}))

const AVAILABLE_UPDATE: AppUpdateInfo = {
  available: true,
  currentVersion: "1.0.0",
  version: "1.1.0",
  date: "2026-07-01",
  body: "release notes",
}

const NO_UPDATE: AppUpdateInfo = {
  available: false,
  currentVersion: "1.0.0",
  version: null,
  date: null,
  body: null,
}

function resetUpdaterStore() {
  useUpdaterStore.setState({
    open: false,
    status: "idle",
    currentVersion: "",
    updateInfo: null,
    error: "",
    errorInfo: null,
    downloadedBytes: 0,
    totalBytes: null,
    lastCheckedAt: 0,
    autoCheckEnabled: true,
    autoCheckFailureCount: 0,
    lastAutoCheckFailureAt: 0,
    policyHydrated: false,
  })
}

describe("useUpdaterController", () => {
  beforeEach(() => {
    resetUpdaterStore()
    capturedHandlers.download = []
    vi.mocked(canUseDesktopFeatures).mockReturnValue(true)
    mockCheckForAppUpdate.mockReset()
    mockDownloadAndInstall.mockReset()
    mockCancelDownload.mockReset()
    mockRestartAfterUpdate.mockReset()
    mockGetCurrentVersion.mockReset()
    mockGetCurrentVersion.mockResolvedValue("1.0.0")
    mockReadUpdaterPolicy.mockReset()
    mockReadUpdaterPolicy.mockReturnValue({
      autoCheckEnabled: true,
      lastSuccessfulCheckAt: 0,
      lastFailureAt: 0,
      failureCount: 0,
    })
    mockWriteUpdaterPolicy.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("loads current version on mount", async () => {
    mockGetCurrentVersion.mockResolvedValue("2.3.4")

    renderHook(() => useUpdaterController())

    await act(async () => {
      await vi.waitFor(() => {
        expect(useUpdaterStore.getState().currentVersion).toBe("2.3.4")
      })
    })
  })

  it("sets status to available when an update is found", async () => {
    mockCheckForAppUpdate.mockResolvedValue(AVAILABLE_UPDATE)

    const { result } = renderHook(() => useUpdaterController())
    await act(async () => {
      await vi.waitFor(() => {
        expect(useUpdaterStore.getState().currentVersion).toBe("1.0.0")
      })
    })

    await act(async () => {
      await result.current.checkUpdates()
    })

    const state = useUpdaterStore.getState()
    expect(state.status).toBe("available")
    expect(state.updateInfo).toEqual(AVAILABLE_UPDATE)
    expect(state.open).toBe(true)
    expect(state.lastCheckedAt).toBeGreaterThan(0)
  })

  it("sets status to upToDate when no update is available", async () => {
    mockCheckForAppUpdate.mockResolvedValue(NO_UPDATE)

    const { result } = renderHook(() => useUpdaterController())
    await act(async () => {
      await vi.waitFor(() => {
        expect(useUpdaterStore.getState().currentVersion).toBe("1.0.0")
      })
    })

    await act(async () => {
      await result.current.checkUpdates()
    })

    expect(useUpdaterStore.getState().status).toBe("upToDate")
  })

  it("sets status to error when check fails", async () => {
    mockCheckForAppUpdate.mockRejectedValue(new Error("network down"))

    const { result } = renderHook(() => useUpdaterController())
    await act(async () => {
      await vi.waitFor(() => {
        expect(useUpdaterStore.getState().currentVersion).toBe("1.0.0")
      })
    })

    await act(async () => {
      await result.current.checkUpdates()
    })

    const state = useUpdaterStore.getState()
    expect(state.status).toBe("error")
    expect(state.error).toBeTruthy()
    expect(state.errorInfo).not.toBeNull()
  })

  it("sets desktopOnly error when platform features unavailable", async () => {
    const { canUseDesktopFeatures } = await import("@/platform/capabilities")
    vi.mocked(canUseDesktopFeatures).mockReturnValue(false)

    const { result } = renderHook(() => useUpdaterController())
    await act(async () => {
      await result.current.checkUpdates()
    })

    const state = useUpdaterStore.getState()
    expect(state.status).toBe("error")
    expect(state.error).toBe("updater.desktopOnly")
    expect(mockCheckForAppUpdate).not.toHaveBeenCalled()
  })

  it("transitions to readyToRestart after successful download", async () => {
    useUpdaterStore.setState({ status: "available", updateInfo: AVAILABLE_UPDATE })
    mockDownloadAndInstall.mockResolvedValue(undefined)

    const { result } = renderHook(() => useUpdaterController())

    await act(async () => {
      await result.current.downloadAndInstall()
    })

    expect(useUpdaterStore.getState().status).toBe("readyToRestart")
  })

  it("returns to available state when download is cancelled", async () => {
    useUpdaterStore.setState({ status: "available", updateInfo: AVAILABLE_UPDATE })
    mockDownloadAndInstall.mockRejectedValue({
      code: "UPDATER_CANCELLED",
      message: "Update download was cancelled",
    })

    const { result } = renderHook(() => useUpdaterController())

    await act(async () => {
      await result.current.downloadAndInstall()
    })

    expect(useUpdaterStore.getState().status).toBe("available")
  })

  it("sets error state when download fails for non-cancel reasons", async () => {
    useUpdaterStore.setState({ status: "available", updateInfo: AVAILABLE_UPDATE })
    mockDownloadAndInstall.mockRejectedValue(new Error("signature verification failed"))

    const { result } = renderHook(() => useUpdaterController())

    await act(async () => {
      await result.current.downloadAndInstall()
    })

    const state = useUpdaterStore.getState()
    expect(state.status).toBe("error")
    expect(state.errorInfo).not.toBeNull()
  })

  it("calls restartAfterUpdate when restartNow is invoked", async () => {
    mockRestartAfterUpdate.mockResolvedValue(undefined)

    const { result } = renderHook(() => useUpdaterController())

    await act(async () => {
      await result.current.restartNow()
    })

    expect(mockRestartAfterUpdate).toHaveBeenCalledTimes(1)
  })

  it("calls cancelAppUpdateDownload when cancelDownload is invoked", async () => {
    let resolveCancel: (() => void) | undefined
    mockCancelDownload.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCancel = resolve
        }),
    )
    useUpdaterStore.setState({ status: "downloading" })

    const { result } = renderHook(() => useUpdaterController())

    let cancelPromise: Promise<void> | undefined
    await act(async () => {
      cancelPromise = result.current.cancelDownload()
      await Promise.resolve()
    })

    expect(mockCancelDownload).toHaveBeenCalledTimes(1)
    expect(useUpdaterStore.getState().status).toBe("cancelling")

    await act(async () => {
      resolveCancel?.()
      await cancelPromise
    })
  })

  it("blocks closeDialog while downloading", async () => {
    useUpdaterStore.setState({ open: true, status: "downloading" })

    const { result } = renderHook(() => useUpdaterController())
    act(() => {
      result.current.closeDialog()
    })

    expect(useUpdaterStore.getState().open).toBe(true)
  })

  it("blocks dismissDialog while installing", async () => {
    useUpdaterStore.setState({ open: true, status: "installing" })

    const { result } = renderHook(() => useUpdaterController())
    act(() => {
      result.current.dismissDialog()
    })

    expect(useUpdaterStore.getState().open).toBe(true)
    expect(useUpdaterStore.getState().status).toBe("installing")
  })

  it("allows closeDialog when idle", () => {
    useUpdaterStore.setState({ open: true, status: "upToDate" })

    const { result } = renderHook(() => useUpdaterController())
    act(() => {
      result.current.closeDialog()
    })

    expect(useUpdaterStore.getState().open).toBe(false)
  })

  it("resets transient state on dismissDialog when not busy", () => {
    useUpdaterStore.setState({
      open: true,
      status: "available",
      updateInfo: AVAILABLE_UPDATE,
      error: "some error",
    })

    const { result } = renderHook(() => useUpdaterController())
    act(() => {
      result.current.dismissDialog()
    })

    const state = useUpdaterStore.getState()
    expect(state.open).toBe(false)
    expect(state.status).toBe("idle")
    expect(state.updateInfo).toBeNull()
    expect(state.error).toBe("")
  })

  it("does not store NaN when progress payload carries non-finite/undefined bytes", async () => {
    renderHook(() => useUpdaterController())
    // The download listener registers on mount; flush effects so the handler is captured.
    await act(async () => {
      await Promise.resolve()
    })
    const handleDownload = capturedHandlers.download.at(-1)
    expect(handleDownload).toBeTruthy()

    // Malformed/edge-case event: NaN downloaded + null total.
    act(() => {
      handleDownload?.({
        payload: { event: "progress", downloadedBytes: NaN, contentLength: null },
      })
    })
    expect(Number.isNaN(useUpdaterStore.getState().downloadedBytes)).toBe(false)
    expect(useUpdaterStore.getState().downloadedBytes).toBe(0)
    expect(useUpdaterStore.getState().totalBytes).toBeNull()

    // Valid progress event still flows through.
    act(() => {
      handleDownload?.({
        payload: { event: "progress", downloadedBytes: 123456, contentLength: undefined },
      })
    })
    expect(useUpdaterStore.getState().downloadedBytes).toBe(123456)
    expect(useUpdaterStore.getState().totalBytes).toBeNull()
  })
})
