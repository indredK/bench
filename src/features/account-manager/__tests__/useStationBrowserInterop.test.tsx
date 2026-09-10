import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useStationBrowserInterop } from "@/features/account-manager/hooks/useStationBrowserInterop"
import type {
  BrowserSessionPreview,
  BrowserStationCaptureOutcome,
  RelayStation,
  StationAccount,
} from "@/lib/tauri/types/account-manager"
import { DEFAULT_LOGIN_DETECTION } from "@/lib/tauri/types/account-manager"

const {
  browserSessionBrowsers,
  browserSessionOpenStation,
  browserSessionStatusStation,
  browserSessionPreviewStation,
  browserSessionCaptureStation,
  browserSessionCloseStation,
  getBrowserExtensionStatus,
  exportBrowserExtension,
  openBrowserExtensionsPage,
  toasts,
} = vi.hoisted(() => ({
  browserSessionBrowsers: vi.fn(),
  browserSessionOpenStation: vi.fn(),
  browserSessionStatusStation: vi.fn(),
  browserSessionPreviewStation: vi.fn(),
  browserSessionCaptureStation: vi.fn(),
  browserSessionCloseStation: vi.fn(),
  getBrowserExtensionStatus: vi.fn(),
  exportBrowserExtension: vi.fn(),
  openBrowserExtensionsPage: vi.fn(),
  toasts: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock("@/features/account-manager/services/account-manager.repository", () => ({
  accountManagerRepository: {
    browserSessionBrowsers,
    browserSessionOpenStation,
    browserSessionStatusStation,
    browserSessionPreviewStation,
    browserSessionCaptureStation,
    browserSessionCloseStation,
    getBrowserExtensionStatus,
    exportBrowserExtension,
    openBrowserExtensionsPage,
  },
}))

vi.mock("sonner", () => ({ toast: toasts }))

function extensionStatus(overrides: Record<string, unknown> = {}) {
  return {
    exported: true,
    extensionDir: "/tmp/bench-companion",
    extensionId: "dmcfgfpfilhgcoddmciglpjdggkpinje",
    hostBinFound: true,
    hostBinPath: "/tmp/bench-host",
    nmRegistrations: [{ browser: "chrome", manifestPath: "/tmp/nm.json", registered: true }],
    browsers: [],
    bridgeReady: true,
    bridgePort: 51234,
    ...overrides,
  }
}

function station(): RelayStation {
  return {
    id: "station-1",
    remark: "Alpha",
    website: "https://example.com",
    createdAt: "2026-09-10 10:00",
    loginDetection: DEFAULT_LOGIN_DETECTION,
  }
}

function accounts(): StationAccount[] {
  return [
    {
      id: "acct-1",
      stationId: "station-1",
      username: "alice",
      notes: "",
      phone: null,
      tgAccount: null,
      linkedAccount: null,
      inviteLink: null,
      loginMethods: [],
      status: "ready",
      lastLoginAt: null,
      lastRefreshedAt: null,
      createdAt: "2026-09-10 10:00",
      hasPassword: false,
    },
  ]
}

function preview(overrides: Partial<BrowserSessionPreview> = {}): BrowserSessionPreview {
  return {
    running: true,
    cookieCount: 4,
    cookieNames: ["sid", "token", "session"],
    storageOrigins: 1,
    userAgent: "Mozilla/5.0",
    indexedDbStatus: "complete",
    fingerprintHits: 2,
    fingerprintTotal: 3,
    ...overrides,
  }
}

function captureOutcome(
  overrides: Partial<BrowserStationCaptureOutcome> = {},
): BrowserStationCaptureOutcome {
  return {
    outcome: "saved",
    targetAccountId: "acct-1",
    createdAccountId: null,
    cookieCount: 4,
    skippedPartitioned: 0,
    storageOrigins: 1,
    indexedDbStatus: "complete",
    capturedAtTs: 3_000,
    existingCapturedAtTs: null,
    existingOrigin: null,
    verified: true,
    ...overrides,
  }
}

describe("useStationBrowserInterop", () => {
  beforeEach(() => {
    browserSessionBrowsers.mockReset().mockResolvedValue([
      { id: "chrome", name: "Google Chrome" },
      { id: "edge", name: "Microsoft Edge" },
    ])
    browserSessionOpenStation.mockReset().mockResolvedValue(true)
    browserSessionStatusStation
      .mockReset()
      .mockResolvedValue({ running: true, browserId: "chrome", port: 9222 })
    browserSessionPreviewStation.mockReset().mockResolvedValue(preview())
    browserSessionCaptureStation.mockReset()
    browserSessionCloseStation.mockReset().mockResolvedValue(true)
    getBrowserExtensionStatus.mockReset().mockResolvedValue(extensionStatus())
    exportBrowserExtension.mockReset().mockResolvedValue({
      extensionDir: "/tmp/bench-companion",
      wrapperPath: "/tmp/bench-host-nm.sh",
      hostBinPath: "/tmp/bench-host",
      nmRegistrations: [],
      browsers: [],
      extensionId: "dmcfgfpfilhgcoddmcigljdggkpinje",
    })
    openBrowserExtensionsPage.mockReset().mockResolvedValue(undefined)
    toasts.error.mockReset()
    toasts.success.mockReset()
    toasts.info.mockReset()
    toasts.warning.mockReset()
  })

  it("loads the browser list when the confirm dialog opens", async () => {
    const { result } = renderHook(() => useStationBrowserInterop())
    act(() => result.current.confirmOpen(station(), accounts()))
    await waitFor(() => expect(result.current.browsers).toHaveLength(2))
    expect(result.current.confirming).toBe(true)
    expect(result.current.accounts).toHaveLength(1)
  })

  it("proceeds from confirm to open the station instance and enter the main view", async () => {
    const { result } = renderHook(() => useStationBrowserInterop())
    act(() => result.current.confirmOpen(station(), accounts()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.proceed())
    await waitFor(() => expect(result.current.open).toBe(true))
    expect(browserSessionOpenStation).toHaveBeenCalledWith("station-1", {
      browserId: "chrome",
      resetProfile: false,
    })
    await waitFor(() => expect(result.current.preview?.cookieCount).toBe(4))
    act(() => result.current.closeDialog())
  })

  it("captures into a new account when targetMode is new", async () => {
    const onCaptured = vi.fn()
    browserSessionCaptureStation.mockResolvedValueOnce(captureOutcome())
    const { result } = renderHook(() => useStationBrowserInterop({ onCaptured }))

    act(() => result.current.confirmOpen(station(), accounts()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))
    act(() => result.current.proceed())
    await waitFor(() => expect(result.current.open).toBe(true))

    act(() => {
      result.current.setTargetMode("new")
      result.current.setNewUsername("manual-main")
    })
    act(() => result.current.handleCapture(false))
    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1))
    expect(browserSessionCaptureStation).toHaveBeenCalledWith("station-1", {
      targetAccountId: null,
      newUsername: "manual-main",
      newPassword: null,
      force: false,
    })
    expect(toasts.success).toHaveBeenCalledTimes(1)
    act(() => result.current.closeDialog())
  })

  it("treats a conflict as a decision point and only forces after confirmation", async () => {
    browserSessionCaptureStation.mockResolvedValueOnce(
      captureOutcome({
        outcome: "conflict",
        existingCapturedAtTs: 2_000,
        existingOrigin: "webviewLogin",
      }),
    )
    const { result } = renderHook(() => useStationBrowserInterop())

    act(() => result.current.confirmOpen(station(), accounts()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))
    act(() => result.current.proceed())
    await waitFor(() => expect(result.current.open).toBe(true))
    // 组件里切到 existing 会自动预选首个账号；此处直接驱动 hook 状态以等价模拟。
    act(() => {
      result.current.setTargetMode("existing")
      result.current.setTargetAccountId("acct-1")
    })

    act(() => result.current.handleCapture(false))
    await waitFor(() => expect(result.current.conflict?.outcome).toBe("conflict"))
    expect(browserSessionCaptureStation).toHaveBeenLastCalledWith(
      "station-1",
      expect.objectContaining({ targetAccountId: "acct-1", force: false }),
    )
    expect(toasts.success).not.toHaveBeenCalled()

    browserSessionCaptureStation.mockResolvedValueOnce(captureOutcome())
    act(() => result.current.handleCapture(true))
    await waitFor(() => expect(result.current.conflict).toBeNull())
    expect(browserSessionCaptureStation).toHaveBeenLastCalledWith(
      "station-1",
      expect.objectContaining({ force: true }),
    )
    act(() => result.current.closeDialog())
  })

  it("ignores repeat proceed while the open request is in flight", async () => {
    let resolveOpen: (value: unknown) => void = () => undefined
    browserSessionOpenStation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve
        }),
    )
    const { result } = renderHook(() => useStationBrowserInterop())
    act(() => result.current.confirmOpen(station(), accounts()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => {
      result.current.proceed()
      result.current.proceed()
    })
    expect(browserSessionOpenStation).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveOpen(true)
    })
    await waitFor(() => expect(result.current.busy).toBeNull())
    act(() => result.current.closeDialog())
  })

  it("loads the extension channel status when the confirm dialog opens", async () => {
    // 扩展通道是「读日常浏览器」的唯一路径，状态必须在用户做选择前就可见。
    const { result } = renderHook(() => useStationBrowserInterop())
    act(() => result.current.confirmOpen(station(), accounts()))
    await waitFor(() => expect(result.current.extensionStatus?.bridgeReady).toBe(true))
    expect(result.current.extensionStatus?.bridgePort).toBe(51234)
  })

  it("treats an unavailable extension status as not-ready instead of failing the flow", async () => {
    getBrowserExtensionStatus.mockRejectedValueOnce(new Error("bridge offline"))
    const { result } = renderHook(() => useStationBrowserInterop())
    act(() => result.current.confirmOpen(station(), accounts()))
    await waitFor(() => expect(result.current.extensionStatus).toBeNull())
    // 实例通道仍须可用 —— 扩展不可用不能连带挡住「开始」。
    expect(result.current.confirming).toBe(true)
  })

  it("exports the extension and opens the browser extensions page", async () => {
    const { result } = renderHook(() => useStationBrowserInterop())
    act(() => result.current.confirmOpen(station(), accounts()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    await act(async () => {
      await result.current.handleExportExtension()
    })

    expect(exportBrowserExtension).toHaveBeenCalledTimes(1)
    // 必须打开扩展页，否则用户无从执行「加载已解压的扩展程序」。
    expect(openBrowserExtensionsPage).toHaveBeenCalledWith("chrome")
    expect(toasts.success).toHaveBeenCalledTimes(1)
    expect(result.current.extensionBusy).toBe(false)
  })

  it("surfaces an export failure and clears the busy flag", async () => {
    exportBrowserExtension.mockRejectedValueOnce(new Error("no bench-host"))
    const { result } = renderHook(() => useStationBrowserInterop())
    act(() => result.current.confirmOpen(station(), accounts()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    await act(async () => {
      await result.current.handleExportExtension()
    })

    expect(toasts.error).toHaveBeenCalledTimes(1)
    expect(openBrowserExtensionsPage).not.toHaveBeenCalled()
    expect(result.current.extensionBusy).toBe(false)
  })

  it("stops polling once the instance reports it is no longer running", async () => {
    // 修 2026-09-10 实测缺陷：弹窗开着但实例已退出时会无限空转（每 2s 一次 CDP 附加）。
    // 期望：最多再多跑一轮就自行停表，而不是继续无限轮询。
    //
    // 注意：这里刻意不用 `waitFor` —— 它内部走真实 setTimeout，与假定时器互锁会直接超时。
    // 改为手动 flush 微任务链。
    vi.useFakeTimers()
    try {
      browserSessionPreviewStation.mockResolvedValue(preview({ running: false }))
      const { result } = renderHook(() => useStationBrowserInterop())

      act(() => result.current.confirmOpen(station(), accounts()))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(0)
      })
      act(() => result.current.proceed())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(result.current.open).toBe(true)
      expect(result.current.busy).toBeNull()

      browserSessionPreviewStation.mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })

      // 30s ≈ 10 个轮询周期；停表后只允许出现一次（触发停表判定那一轮）。
      expect(browserSessionPreviewStation.mock.calls.length).toBeLessThanOrEqual(1)
      act(() => result.current.closeDialog())
    } finally {
      vi.useRealTimers()
    }
  })
})
