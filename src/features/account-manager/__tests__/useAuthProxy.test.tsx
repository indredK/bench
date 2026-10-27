import { act, fireEvent, render, renderHook, waitFor } from "@testing-library/react"
import { useState, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthProxyProvider, useAuthProxy } from "@/features/account-manager/hooks/useAuthProxy"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"

const { canUseTauriCommands, drainAuthProxyRequest, handleBrowserOpen, listeners } = vi.hoisted(
  () => ({
    canUseTauriCommands: vi.fn(() => true),
    drainAuthProxyRequest: vi.fn(),
    handleBrowserOpen: vi.fn(),
    listeners: new Map<string, () => void>(),
  }),
)

vi.mock("@/features/account-manager/services/account-manager.repository", () => ({
  accountManagerRepository: {
    drainAuthProxyRequest,
    handleBrowserOpen,
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

vi.mock("@/platform/capabilities", () => ({
  canUseTauriCommands,
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
      host,
      isAuthorize: true,
      hasReturnUrl: true,
      returnScheme: "demo",
      matches: [],
    },
    pendingCount: 0,
    droppedCount: 0,
    rejectedCount: 0,
  }
}

function emptyDrainResult() {
  return {
    request: null,
    pendingCount: 0,
    droppedCount: 0,
    rejectedCount: 0,
  }
}

function withAuthProxyProvider({ children }: { children: ReactNode }) {
  return <AuthProxyProvider>{children}</AuthProxyProvider>
}

function AuthProxyConsumer() {
  const { authProxyRequest } = useAuthProxy()
  return <span data-testid="auth-proxy-ticket">{authProxyRequest?.ticketId ?? "none"}</span>
}

function AccountManagerRouteHarness() {
  const [mounted, setMounted] = useState(true)
  return (
    <>
      <button onClick={() => setMounted((value) => !value)}>
        {mounted ? "unmount route" : "mount route"}
      </button>
      {mounted ? <AuthProxyConsumer /> : null}
    </>
  )
}

describe("useAuthProxy", () => {
  beforeEach(() => {
    canUseTauriCommands.mockReturnValue(true)
    listeners.clear()
    drainAuthProxyRequest.mockReset()
    handleBrowserOpen.mockReset()
  })

  it("does not subscribe to desktop events in browser mode", () => {
    canUseTauriCommands.mockReturnValue(false)

    renderHook(() => useAuthProxy(), { wrapper: withAuthProxyProvider })

    expect(drainAuthProxyRequest).not.toHaveBeenCalled()
    expect(listeners.has(TAURI_EVENTS.accountManager.authProxyPending)).toBe(false)
  })

  it("drains the Rust inbox on mount without subscribing to raw deep-link URLs", async () => {
    drainAuthProxyRequest.mockResolvedValue(drainResult("ticket-1"))

    const { result } = renderHook(() => useAuthProxy(), { wrapper: withAuthProxyProvider })

    await waitFor(() => expect(result.current.isAuthProxyOpen).toBe(true))
    expect(result.current.authProxyRequest?.ticketId).toBe("ticket-1")
    expect(result.current.authProxyRequest).toEqual({
      ticketId: "ticket-1",
      expiresAtTs: 2_000_000_000,
      hasReturnUrl: true,
      returnScheme: "demo",
    })
    expect(result.current.authProxyHost).toBe("example.com")
    expect(listeners.has(TAURI_EVENTS.accountManager.authProxyPending)).toBe(true)
    expect(drainAuthProxyRequest).toHaveBeenCalledTimes(1)
  })

  it("keeps the active request stable and drains the next request after close", async () => {
    drainAuthProxyRequest
      .mockResolvedValueOnce(drainResult("ticket-1"))
      .mockResolvedValueOnce(drainResult("ticket-2", "second.example.com"))

    const { result } = renderHook(() => useAuthProxy(), { wrapper: withAuthProxyProvider })
    await waitFor(() => expect(result.current.authProxyRequest?.ticketId).toBe("ticket-1"))

    act(() => listeners.get(TAURI_EVENTS.accountManager.authProxyPending)?.())
    expect(drainAuthProxyRequest).toHaveBeenCalledTimes(1)

    act(() => result.current.setAuthProxyOpen(false))
    await waitFor(() => expect(result.current.authProxyRequest?.ticketId).toBe("ticket-2"))
    expect(result.current.authProxyHost).toBe("second.example.com")
    expect(drainAuthProxyRequest).toHaveBeenCalledTimes(2)
  })

  it("queues a manual URL opened while the deep-link inbox is draining", async () => {
    let resolveDrain!: (result: ReturnType<typeof drainResult>) => void
    drainAuthProxyRequest.mockImplementationOnce(
      () => new Promise((resolve) => (resolveDrain = resolve)),
    )
    handleBrowserOpen.mockResolvedValue(drainResult("manual-ticket").request)

    const { result } = renderHook(() => useAuthProxy(), { wrapper: withAuthProxyProvider })
    await waitFor(() => expect(drainAuthProxyRequest).toHaveBeenCalledTimes(1))

    await act(async () => {
      await result.current.openProxyForUrl("https://manual.example/oauth/authorize")
    })
    expect(result.current.isAuthProxyOpen).toBe(false)

    await act(async () => {
      resolveDrain(drainResult("inbox-ticket"))
    })
    await waitFor(() => expect(result.current.authProxyRequest?.ticketId).toBe("inbox-ticket"))

    act(() => result.current.setAuthProxyOpen(false))
    await waitFor(() => expect(result.current.authProxyRequest?.ticketId).toBe("manual-ticket"))
    expect(drainAuthProxyRequest).toHaveBeenCalledTimes(1)
  })

  it("drains again when a notification races with an empty inbox response", async () => {
    let resolveDrain!: (result: ReturnType<typeof emptyDrainResult>) => void
    drainAuthProxyRequest
      .mockImplementationOnce(() => new Promise((resolve) => (resolveDrain = resolve)))
      .mockResolvedValueOnce(drainResult("ticket-after-race"))

    const { result } = renderHook(() => useAuthProxy(), { wrapper: withAuthProxyProvider })
    await waitFor(() => expect(drainAuthProxyRequest).toHaveBeenCalledTimes(1))

    act(() => listeners.get(TAURI_EVENTS.accountManager.authProxyPending)?.())
    await act(async () => {
      resolveDrain(emptyDrainResult())
    })

    await waitFor(() => expect(drainAuthProxyRequest).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.authProxyRequest?.ticketId).toBe("ticket-after-race"))
  })

  it("retries once when a notification races with a failed drain", async () => {
    let rejectDrain!: (error: Error) => void
    drainAuthProxyRequest
      .mockImplementationOnce(() => new Promise((_, reject) => (rejectDrain = reject)))
      .mockResolvedValueOnce(drainResult("ticket-after-retry"))

    const { result } = renderHook(() => useAuthProxy(), { wrapper: withAuthProxyProvider })
    await waitFor(() => expect(drainAuthProxyRequest).toHaveBeenCalledTimes(1))

    act(() => listeners.get(TAURI_EVENTS.accountManager.authProxyPending)?.())
    await act(async () => {
      rejectDrain(new Error("temporary IPC failure"))
    })

    await waitFor(() => expect(drainAuthProxyRequest).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(result.current.authProxyRequest?.ticketId).toBe("ticket-after-retry"),
    )
  })

  it("keeps a second wakeup after the bounded retry also fails", async () => {
    let rejectFirstDrain!: (error: Error) => void
    let rejectRetry!: (error: Error) => void
    drainAuthProxyRequest
      .mockImplementationOnce(() => new Promise((_, reject) => (rejectFirstDrain = reject)))
      .mockImplementationOnce(() => new Promise((_, reject) => (rejectRetry = reject)))
      .mockResolvedValueOnce(drainResult("ticket-after-second-wakeup"))

    const { result } = renderHook(() => useAuthProxy(), { wrapper: withAuthProxyProvider })
    await waitFor(() => expect(drainAuthProxyRequest).toHaveBeenCalledTimes(1))

    act(() => listeners.get(TAURI_EVENTS.accountManager.authProxyPending)?.())
    await act(async () => {
      rejectFirstDrain(new Error("temporary IPC failure"))
    })
    await waitFor(() => expect(drainAuthProxyRequest).toHaveBeenCalledTimes(2))

    act(() => listeners.get(TAURI_EVENTS.accountManager.authProxyPending)?.())
    await act(async () => {
      rejectRetry(new Error("temporary IPC failure"))
    })

    await waitFor(() => expect(drainAuthProxyRequest).toHaveBeenCalledTimes(3))
    await waitFor(() =>
      expect(result.current.authProxyRequest?.ticketId).toBe("ticket-after-second-wakeup"),
    )
  })

  it("keeps a drained ticket when the Account Manager route unmounts", async () => {
    let resolveDrain!: (result: ReturnType<typeof drainResult>) => void
    drainAuthProxyRequest.mockImplementationOnce(
      () => new Promise((resolve) => (resolveDrain = resolve)),
    )

    const view = render(
      <AuthProxyProvider>
        <AccountManagerRouteHarness />
      </AuthProxyProvider>,
    )
    await waitFor(() => expect(drainAuthProxyRequest).toHaveBeenCalledTimes(1))

    fireEvent.click(view.getByRole("button", { name: "unmount route" }))
    await act(async () => {
      resolveDrain(drainResult("ticket-survives-route-change"))
    })
    fireEvent.click(view.getByRole("button", { name: "mount route" }))

    await waitFor(() =>
      expect(view.getByTestId("auth-proxy-ticket").textContent).toBe(
        "ticket-survives-route-change",
      ),
    )
  })
})
