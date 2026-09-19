import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useBrowserInterop } from "@/features/account-manager/hooks/useBrowserInterop"
import type {
  BrowserDailySyncOutcome,
  BrowserInjectStatus,
  BrowserOpenOutcome,
  StationAccount,
} from "@/lib/tauri/types/account-manager"

const {
  browserSessionBrowsers,
  browserSessionOpen,
  browserSessionStatus,
  browserSessionClose,
  browserSessionSyncDaily,
  browserSessionInjectStatus,
  browserSessionChromeStoreStatus,
  browserSessionImportFromChrome,
  toasts,
} = vi.hoisted(() => ({
  browserSessionBrowsers: vi.fn(),
  browserSessionOpen: vi.fn(),
  browserSessionStatus: vi.fn(),
  browserSessionClose: vi.fn(),
  browserSessionSyncDaily: vi.fn(),
  browserSessionInjectStatus: vi.fn(),
  browserSessionChromeStoreStatus: vi.fn(),
  browserSessionImportFromChrome: vi.fn(),
  toasts: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock("@/features/account-manager/services/account-manager.repository", () => ({
  accountManagerRepository: {
    browserSessionBrowsers,
    browserSessionOpen,
    browserSessionSyncDaily,
    browserSessionInjectStatus,
    browserSessionChromeStoreStatus,
    browserSessionImportFromChrome,
    browserSessionStatus,
    browserSessionClose,
  },
}))

vi.mock("sonner", () => ({ toast: toasts }))

function account(): StationAccount {
  return {
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
  }
}

function openOutcome(overrides: Partial<BrowserOpenOutcome> = {}): BrowserOpenOutcome {
  return {
    browserId: "chrome",
    reusedInstance: false,
    injectedCookies: 5,
    skippedPartitioned: 0,
    rejectedCookies: 0,
    sessionInjected: true,
    hasStoredSession: true,
    sessionRecovered: false,
    recoveryReason: null,
    storageOrigins: 1,
    // 默认 null：本次没有恢复脚本（无存储快照 / 登录模式），不该触发恢复告警。
    storageRestoreStatus: null,
    ...overrides,
  }
}

/** 「同步到日常浏览器」的命令结果：只表示任务已登记，写入还没发生。 */
function dailyOutcome(overrides: Partial<BrowserDailySyncOutcome> = {}): BrowserDailySyncOutcome {
  return {
    outcome: "queued",
    browserId: "chrome",
    cookieCount: 6,
    storageOrigins: 1,
    sessionRecovered: false,
    recoveryReason: null,
    taskId: "task-1",
    extensionConnected: false,
    ...overrides,
  }
}

function injectStatus(overrides: Partial<BrowserInjectStatus> = {}): BrowserInjectStatus {
  return {
    outcome: "injected",
    accountId: "acct-1",
    origin: "https://www.trae.cn",
    createdAtTs: 1_700_000_000,
    updatedAtTs: 1_700_000_005,
    error: null,
    cookiesWritten: 6,
    cookiesFailed: 0,
    storageKeysWritten: 3,
    idbRestored: 1,
    idbFailed: 0,
    extensionConnected: true,
    ...overrides,
  }
}

describe("useBrowserInterop (sync out, per-target)", () => {
  beforeEach(() => {
    browserSessionBrowsers.mockReset().mockResolvedValue([
      { id: "chrome", name: "Google Chrome" },
      { id: "edge", name: "Microsoft Edge" },
    ])
    browserSessionOpen.mockReset()
    browserSessionSyncDaily.mockReset()
    browserSessionInjectStatus.mockReset()
    browserSessionImportFromChrome.mockReset()
    // 默认「本机有可读的 Chrome」；不可用的用例自行改成 rejected/available:false。
    browserSessionChromeStoreStatus.mockReset().mockResolvedValue({
      available: true,
      profileCount: 1,
      chromeVersion: "152.0.0.1",
      reason: null,
    })
    browserSessionStatus
      .mockReset()
      .mockResolvedValue({ running: false, browserId: null, port: null })
    browserSessionClose.mockReset().mockResolvedValue(true)
    toasts.error.mockReset()
    toasts.success.mockReset()
    toasts.info.mockReset()
    toasts.warning.mockReset()
  })

  it("loads the browser list and instance status when the dialog opens", async () => {
    const { result } = renderHook(() => useBrowserInterop())

    act(() => result.current.openDialog(account()))

    await waitFor(() => expect(result.current.browsers).toHaveLength(2))
    expect(result.current.open).toBe(true)
    expect(result.current.browserId).toBe("chrome")
    expect(result.current.target).toBe("isolated")
    await waitFor(() => expect(result.current.status?.running).toBe(false))
    expect(browserSessionStatus).toHaveBeenCalledWith("acct-1")
  })

  it("does not report success when Bench has no stored session to inject", async () => {
    browserSessionOpen.mockResolvedValueOnce(
      openOutcome({
        hasStoredSession: false,
        sessionInjected: false,
        injectedCookies: 0,
        sessionRecovered: false,
        recoveryReason: "notLoggedIn",
      }),
    )

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.handleSync())
    await waitFor(() => expect(toasts.warning).toHaveBeenCalledTimes(1))
    expect(toasts.success).not.toHaveBeenCalled()
    expect(result.current.lastOpen?.hasStoredSession).toBe(false)
  })

  it("reports a recovered session distinctly from a stored one", async () => {
    browserSessionOpen.mockResolvedValueOnce(
      openOutcome({ sessionRecovered: true, injectedCookies: 4 }),
    )

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.handleSync())
    await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1))
    // 补采成功 ≠ 无会话：绝不能落进 warning/error 分支。
    expect(toasts.warning).not.toHaveBeenCalled()
    expect(toasts.error).not.toHaveBeenCalled()
    expect(result.current.lastOpen?.sessionRecovered).toBe(true)
  })

  it("routes the daily-browser target to the extension channel and waits for its receipt", async () => {
    browserSessionSyncDaily.mockResolvedValueOnce(dailyOutcome())
    // 第一拍读到 queued：注入确实还没发生，随后才是扩展回报的终态。
    browserSessionInjectStatus
      .mockResolvedValueOnce(injectStatus({ outcome: "queued" }))
      .mockResolvedValue(injectStatus())

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.setTarget("daily"))
    act(() => result.current.handleSync())
    await waitFor(() => expect(browserSessionSyncDaily).toHaveBeenCalledTimes(1))
    expect(browserSessionOpen).not.toHaveBeenCalled()
    // 命令只回「任务已登记」：这一拍只能是中性提示，不能是成功。
    await waitFor(() => expect(toasts.info).toHaveBeenCalledTimes(1))
    expect(toasts.success).not.toHaveBeenCalled()
    // 终态来自扩展回报的任务表，而不是同步命令本身。
    await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1), { timeout: 6000 })
    expect(browserSessionInjectStatus).toHaveBeenCalledWith("task-1")
    expect(result.current.lastInject?.outcome).toBe("injected")
  })

  it("reports an extension-side failure as an error, never as success", async () => {
    browserSessionSyncDaily.mockResolvedValueOnce(dailyOutcome())
    browserSessionInjectStatus.mockResolvedValue(
      injectStatus({
        outcome: "failed",
        error: "SITE_NOT_AUTHORIZED",
        cookiesWritten: 0,
        storageKeysWritten: 0,
        idbRestored: 0,
      }),
    )

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.setTarget("daily"))
    act(() => result.current.handleSync())
    await waitFor(() => expect(toasts.error).toHaveBeenCalledTimes(1))
    expect(toasts.success).not.toHaveBeenCalled()
    expect(result.current.lastInject?.error).toBe("SITE_NOT_AUTHORIZED")
  })

  it("warns instead of claiming success when the extension never shows up", async () => {
    vi.useFakeTimers()
    try {
      browserSessionSyncDaily.mockResolvedValueOnce(dailyOutcome())
      browserSessionInjectStatus.mockResolvedValue(
        injectStatus({ outcome: "queued", extensionConnected: false }),
      )

      const { result } = renderHook(() => useBrowserInterop())
      act(() => result.current.openDialog(account()))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })
      act(() => result.current.setTarget("daily"))
      act(() => result.current.handleSync())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(46_000)
      })

      // 45 秒轮询窗口走完仍非终态：必须给出「扩展没来」的告警，且绝不报成功。
      expect(toasts.success).not.toHaveBeenCalled()
      expect(toasts.warning).toHaveBeenCalledTimes(1)
      expect(browserSessionInjectStatus.mock.calls.length).toBeGreaterThan(10)
    } finally {
      vi.useRealTimers()
    }
  })

  it("stops polling for a receipt once the dialog closes", async () => {
    browserSessionSyncDaily.mockResolvedValueOnce(dailyOutcome())
    browserSessionInjectStatus.mockResolvedValue(injectStatus({ outcome: "claimed" }))

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))
    act(() => result.current.setTarget("daily"))
    act(() => result.current.handleSync())
    await waitFor(() => expect(browserSessionInjectStatus).toHaveBeenCalled())

    const callsWhileOpen = browserSessionInjectStatus.mock.calls.length
    act(() => result.current.closeDialog())
    await waitFor(() => expect(result.current.lastInject?.outcome).toBe("claimed"))
    expect(browserSessionInjectStatus.mock.calls.length).toBe(callsWhileOpen)
    // 未终态就关窗：不能留一条成功给稍后的用户。
    expect(toasts.success).not.toHaveBeenCalled()
  })

  it("says plainly that nothing can be awaited when no task was registered", async () => {
    browserSessionSyncDaily.mockResolvedValueOnce(dailyOutcome({ taskId: null }))

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))
    act(() => result.current.setTarget("daily"))
    act(() => result.current.handleSync())
    await waitFor(() => expect(toasts.info).toHaveBeenCalledTimes(1))
    expect(browserSessionInjectStatus).not.toHaveBeenCalled()
    expect(toasts.success).not.toHaveBeenCalled()
  })

  it("warns when the isolated session injected but storage did not finish restoring", async () => {
    // cookie 注入成功 ≠ 站点已登录：IndexedDB 没落完时必须单独说一句。
    browserSessionOpen.mockResolvedValueOnce(
      openOutcome({ storageRestoreStatus: "failed:INDEXED_DB_BLOCKED" }),
    )

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.handleSync())
    await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(toasts.warning).toHaveBeenCalledTimes(1))
  })

  it("imports from local Chrome without overwriting a fresher session", async () => {
    browserSessionImportFromChrome.mockResolvedValueOnce({
      outcome: "saved",
      cookieCount: 28,
      skippedPartitioned: 0,
      storageOrigins: 0,
      indexedDbStatus: "unsupported",
      capturedAtTs: 1_790_006_400,
    })

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.chromeStore?.available).toBe(true))

    act(() => result.current.handleImportFromChrome())
    await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1))
    expect(toasts.warning).not.toHaveBeenCalled()
    // force 恒为 false：这条兜底通道没有静默覆盖更新会话的路径。
    expect(browserSessionImportFromChrome).toHaveBeenCalledWith("acct-1", false)
  })

  it("reports a conflict from the Chrome import instead of overwriting", async () => {
    browserSessionImportFromChrome.mockResolvedValueOnce({
      outcome: "conflict",
      cookieCount: 3,
      skippedPartitioned: 0,
      storageOrigins: 0,
      indexedDbStatus: "unsupported",
      capturedAtTs: 1_790_006_400,
    })

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.chromeStore?.available).toBe(true))

    act(() => result.current.handleImportFromChrome())
    await waitFor(() => expect(toasts.warning).toHaveBeenCalledTimes(1))
    expect(toasts.success).not.toHaveBeenCalled()
  })

  it("surfaces skipped and rejected counts when nothing could be injected", async () => {
    browserSessionOpen.mockResolvedValueOnce(
      openOutcome({ injectedCookies: 0, skippedPartitioned: 2, rejectedCookies: 3 }),
    )

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.handleSync())
    await waitFor(() => expect(toasts.error).toHaveBeenCalledTimes(1))
    expect(toasts.success).not.toHaveBeenCalled()
    expect(result.current.lastOpen?.rejectedCookies).toBe(3)
    expect(result.current.lastOpen?.skippedPartitioned).toBe(2)
  })

  it("ignores repeat actions while a request is in flight", async () => {
    let resolveOpen: (value: unknown) => void = () => undefined
    browserSessionOpen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve
        }),
    )

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => {
      result.current.handleSync()
      result.current.handleSync()
    })
    expect(browserSessionOpen).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveOpen(openOutcome({ injectedCookies: 1 }))
    })
    await waitFor(() => expect(result.current.busy).toBeNull())
  })

  it("exposes only the sync-and-manage API surface", () => {
    const { result } = renderHook(() => useBrowserInterop())
    expect(Object.keys(result.current).sort()).toEqual(
      [
        "account",
        "browserId",
        "browsers",
        "busy",
        "chromeStore",
        "closeDialog",
        "handleCloseInstance",
        "handleImportFromChrome",
        "handleSync",
        "lastDaily",
        "lastInject",
        "lastOpen",
        "open",
        "openDialog",
        "setBrowserId",
        "setTarget",
        "status",
        "target",
      ].sort(),
    )
  })
})
