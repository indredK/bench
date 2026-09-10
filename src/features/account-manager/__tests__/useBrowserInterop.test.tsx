import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useBrowserInterop } from "@/features/account-manager/hooks/useBrowserInterop"
import type {
  BrowserCaptureOutcome,
  BrowserOpenOutcome,
  StationAccount,
} from "@/lib/tauri/types/account-manager"

const {
  browserSessionBrowsers,
  browserSessionOpen,
  browserSessionStatus,
  browserSessionClose,
  browserSessionCapture,
  browserSessionClearProfile,
  browserSessionProbe,
  toasts,
} = vi.hoisted(() => ({
  browserSessionBrowsers: vi.fn(),
  browserSessionOpen: vi.fn(),
  browserSessionStatus: vi.fn(),
  browserSessionClose: vi.fn(),
  browserSessionCapture: vi.fn(),
  browserSessionClearProfile: vi.fn(),
  browserSessionProbe: vi.fn(),
  toasts: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock("@/features/account-manager/services/account-manager.repository", () => ({
  accountManagerRepository: {
    browserSessionBrowsers,
    browserSessionOpen,
    browserSessionStatus,
    browserSessionClose,
    browserSessionCapture,
    browserSessionClearProfile,
    browserSessionProbe,
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
    storageOrigins: 1,
    ...overrides,
  }
}

function captureOutcome(overrides: Partial<BrowserCaptureOutcome> = {}): BrowserCaptureOutcome {
  return {
    outcome: "saved",
    cookieCount: 3,
    skippedPartitioned: 0,
    storageOrigins: 1,
    indexedDbStatus: "none",
    capturedAtTs: 3_000,
    existingCapturedAtTs: null,
    existingOrigin: null,
    verified: true,
    ...overrides,
  }
}

describe("useBrowserInterop", () => {
  beforeEach(() => {
    browserSessionBrowsers.mockReset().mockResolvedValue([
      { id: "chrome", name: "Google Chrome" },
      { id: "edge", name: "Microsoft Edge" },
    ])
    browserSessionOpen.mockReset()
    browserSessionStatus
      .mockReset()
      .mockResolvedValue({ running: false, browserId: null, port: null })
    browserSessionClose.mockReset().mockResolvedValue(true)
    browserSessionCapture.mockReset()
    browserSessionClearProfile.mockReset().mockResolvedValue(true)
    browserSessionProbe.mockReset()
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
    await waitFor(() => expect(result.current.status?.running).toBe(false))
    expect(browserSessionStatus).toHaveBeenCalledWith("acct-1")
  })

  it("treats a conflict as a decision point and only forces after confirmation", async () => {
    browserSessionCapture.mockResolvedValueOnce(
      captureOutcome({
        outcome: "conflict",
        existingCapturedAtTs: 2_000,
        existingOrigin: "webviewLogin",
      }),
    )

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.handleCapture(false))
    await waitFor(() => expect(result.current.conflict?.outcome).toBe("conflict"))

    // 冲突路径不得报告成功：写入尚未发生，决定权在用户。
    expect(browserSessionCapture).toHaveBeenLastCalledWith("acct-1", false)
    expect(toasts.success).not.toHaveBeenCalled()
    expect(result.current.conflict?.existingCapturedAtTs).toBe(2_000)
    expect(result.current.conflict?.existingOrigin).toBe("webviewLogin")

    browserSessionCapture.mockResolvedValueOnce(captureOutcome())
    act(() => result.current.handleCapture(true))
    await waitFor(() => expect(result.current.conflict).toBeNull())
    expect(browserSessionCapture).toHaveBeenLastCalledWith("acct-1", true)
    expect(result.current.busy).toBeNull()
  })

  it("reports the capture result and refreshes the account list on success", async () => {
    const onCaptured = vi.fn()
    browserSessionCapture.mockResolvedValueOnce(
      captureOutcome({ cookieCount: 5, storageOrigins: 2 }),
    )

    const { result } = renderHook(() => useBrowserInterop({ onCaptured }))
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.handleCapture(false))
    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1))
    expect(toasts.success).toHaveBeenCalledTimes(1)
    expect(result.current.conflict).toBeNull()
  })

  it("keeps an empty capture out of the success path", async () => {
    const onCaptured = vi.fn()
    browserSessionCapture.mockResolvedValueOnce(
      captureOutcome({ outcome: "empty", cookieCount: 0, storageOrigins: 0, verified: null }),
    )

    const { result } = renderHook(() => useBrowserInterop({ onCaptured }))
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.handleCapture(false))
    await waitFor(() => expect(toasts.info).toHaveBeenCalledTimes(1))
    expect(toasts.success).not.toHaveBeenCalled()
    expect(onCaptured).not.toHaveBeenCalled()
  })

  it("passes injectSession=false for the manual-login path", async () => {
    browserSessionOpen.mockResolvedValueOnce({
      browserId: "chrome",
      reusedInstance: false,
      injectedCookies: 0,
      skippedPartitioned: 0,
      rejectedCookies: 0,
      sessionInjected: false,
      hasStoredSession: false,
      storageOrigins: 0,
    })

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.handleOpen(false))
    await waitFor(() => expect(browserSessionOpen).toHaveBeenCalledTimes(1))
    expect(browserSessionOpen).toHaveBeenCalledWith("acct-1", {
      browserId: "chrome",
      injectSession: false,
      resetProfile: false,
    })
    await waitFor(() => expect(result.current.busy).toBeNull())
  })

  it("does not report success when Bench has no stored session to inject", async () => {
    browserSessionOpen.mockResolvedValueOnce(
      openOutcome({ hasStoredSession: false, sessionInjected: false, injectedCookies: 0 }),
    )

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.handleOpen(true))
    await waitFor(() => expect(toasts.warning).toHaveBeenCalledTimes(1))
    expect(toasts.success).not.toHaveBeenCalled()
    expect(result.current.lastOpen?.hasStoredSession).toBe(false)
  })

  it("surfaces skipped and rejected counts when nothing could be injected", async () => {
    browserSessionOpen.mockResolvedValueOnce(
      openOutcome({ injectedCookies: 0, skippedPartitioned: 2, rejectedCookies: 3 }),
    )

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.handleOpen(true))
    await waitFor(() => expect(toasts.error).toHaveBeenCalledTimes(1))
    expect(toasts.success).not.toHaveBeenCalled()
    expect(result.current.lastOpen?.rejectedCookies).toBe(3)
    expect(result.current.lastOpen?.skippedPartitioned).toBe(2)
  })

  it("probes the browser session read-only and reports the cookie count", async () => {
    browserSessionProbe.mockResolvedValueOnce({
      running: true,
      cookieCount: 4,
      fingerprintHits: 3,
      fingerprintTotal: 5,
    })

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.handleProbe())
    await waitFor(() => expect(result.current.probe?.cookieCount).toBe(4))
    expect(browserSessionProbe).toHaveBeenCalledWith("acct-1")
    expect(toasts.success).toHaveBeenCalledTimes(1)
    expect(result.current.busy).toBeNull()
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
      result.current.handleOpen(true)
      result.current.handleOpen(true)
      result.current.handleCapture(false)
    })
    expect(browserSessionOpen).toHaveBeenCalledTimes(1)
    expect(browserSessionCapture).not.toHaveBeenCalled()

    await act(async () => {
      resolveOpen({
        browserId: "chrome",
        reusedInstance: false,
        injectedCookies: 1,
        skippedPartitioned: 0,
        rejectedCookies: 0,
        sessionInjected: true,
        hasStoredSession: true,
        storageOrigins: 1,
      })
    })
    await waitFor(() => expect(result.current.busy).toBeNull())
  })

  it("clears the browser profile and refreshes the instance status", async () => {
    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))
    browserSessionStatus.mockClear()

    act(() => result.current.handleClearProfile())
    await waitFor(() => expect(browserSessionClearProfile).toHaveBeenCalledWith("acct-1"))
    await waitFor(() => expect(browserSessionStatus).toHaveBeenCalledWith("acct-1"))
    expect(toasts.success).toHaveBeenCalledTimes(1)
  })
})
