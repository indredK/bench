import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useBrowserInterop } from "@/features/account-manager/hooks/useBrowserInterop"
import type { BrowserOpenOutcome, StationAccount } from "@/lib/tauri/types/account-manager"

const {
  browserSessionBrowsers,
  browserSessionOpen,
  browserSessionStatus,
  browserSessionClose,
  toasts,
} = vi.hoisted(() => ({
  browserSessionBrowsers: vi.fn(),
  browserSessionOpen: vi.fn(),
  browserSessionStatus: vi.fn(),
  browserSessionClose: vi.fn(),
  toasts: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock("@/features/account-manager/services/account-manager.repository", () => ({
  accountManagerRepository: {
    browserSessionBrowsers,
    browserSessionOpen,
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
    storageOrigins: 1,
    ...overrides,
  }
}

describe("useBrowserInterop (inject-only after site-scope split)", () => {
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

  it("does not report success when Bench has no stored session to inject", async () => {
    browserSessionOpen.mockResolvedValueOnce(
      openOutcome({ hasStoredSession: false, sessionInjected: false, injectedCookies: 0 }),
    )

    const { result } = renderHook(() => useBrowserInterop())
    act(() => result.current.openDialog(account()))
    await waitFor(() => expect(result.current.browserId).toBe("chrome"))

    act(() => result.current.handleOpen())
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

    act(() => result.current.handleOpen())
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
      result.current.handleOpen()
      result.current.handleOpen()
    })
    expect(browserSessionOpen).toHaveBeenCalledTimes(1)

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

  it("exposes only the inject-and-manage API surface", () => {
    // 账号档案本就是隔离目录、删账号时整体清理，故「清空浏览器数据」已于
    // 2026-09-10 移除。此处把 API 面钉住：一旦有人把 clear 类动作加回来，
    // 这个用例会失败并提醒重新评估产品语义。
    const { result } = renderHook(() => useBrowserInterop())
    expect(Object.keys(result.current).sort()).toEqual(
      [
        "account",
        "browserId",
        "browsers",
        "busy",
        "closeDialog",
        "handleCloseInstance",
        "handleOpen",
        "lastOpen",
        "open",
        "openDialog",
        "setBrowserId",
        "status",
      ].sort(),
    )
  })
})
