import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAuthProxy } from "@/features/account-manager/hooks/useAuthProxy"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"

const { drainAuthProxyRequest, listeners } = vi.hoisted(() => ({
  drainAuthProxyRequest: vi.fn(),
  listeners: new Map<string, () => void>(),
}))

vi.mock("@/features/account-manager/services/account-manager.repository", () => ({
  accountManagerRepository: {
    drainAuthProxyRequest,
    handleBrowserOpen: vi.fn(),
    proxyLogin: vi.fn(),
    proxyLoginNewAccount: vi.fn(),
  },
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(async (event: string, listener: () => void) => {
    listeners.set(event, listener)
    return () => listeners.delete(event)
  }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

function drainResult(ticketId: string, host = "example.com") {
  return {
    request: {
      ticketId,
      expiresAtTs: 2_000_000_000,
      target: `https://${host}/oauth/authorize`,
      returnUrl: "demo:/callback",
      host,
      isAuthorize: true,
      matches: [],
    },
    pendingCount: 0,
    droppedCount: 0,
    rejectedCount: 0,
  }
}

describe("useAuthProxy", () => {
  beforeEach(() => {
    listeners.clear()
    drainAuthProxyRequest.mockReset()
  })

  it("drains the Rust inbox on mount without subscribing to raw deep-link URLs", async () => {
    drainAuthProxyRequest.mockResolvedValue(drainResult("ticket-1"))

    const { result } = renderHook(() => useAuthProxy())

    await waitFor(() => expect(result.current.isAuthProxyOpen).toBe(true))
    expect(result.current.authProxyRequest?.ticketId).toBe("ticket-1")
    expect(result.current.authProxyHost).toBe("example.com")
    expect(listeners.has(TAURI_EVENTS.accountManager.authProxyPending)).toBe(true)
    expect(drainAuthProxyRequest).toHaveBeenCalledTimes(1)
  })

  it("keeps the active request stable and drains the next request after close", async () => {
    drainAuthProxyRequest
      .mockResolvedValueOnce(drainResult("ticket-1"))
      .mockResolvedValueOnce(drainResult("ticket-2", "second.example.com"))

    const { result } = renderHook(() => useAuthProxy())
    await waitFor(() => expect(result.current.authProxyRequest?.ticketId).toBe("ticket-1"))

    act(() => listeners.get(TAURI_EVENTS.accountManager.authProxyPending)?.())
    expect(drainAuthProxyRequest).toHaveBeenCalledTimes(1)

    act(() => result.current.setAuthProxyOpen(false))
    await waitFor(() => expect(result.current.authProxyRequest?.ticketId).toBe("ticket-2"))
    expect(result.current.authProxyHost).toBe("second.example.com")
    expect(drainAuthProxyRequest).toHaveBeenCalledTimes(2)
  })
})
