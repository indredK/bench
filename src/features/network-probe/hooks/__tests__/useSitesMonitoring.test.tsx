import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { canUseTauriWindow } from "@/platform/capabilities"
import {
  getSiteMonitorAlerts,
  useSitesMonitoring,
} from "@/features/network-probe/hooks/useSitesMonitoring"
import type { SiteSampleResult, SitesProbeResult } from "@/lib/tauri/types/network-probe"

const focusEvents = vi.hoisted(() => ({
  handler: null as ((event: { payload: boolean }) => void) | null,
  onFocusChanged: vi.fn(),
  isFocused: vi.fn(),
}))

vi.mock("@/platform/capabilities", () => ({
  canUseTauriWindow: vi.fn(() => false),
}))

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: focusEvents.onFocusChanged,
    isFocused: focusEvents.isFocused,
  }),
}))

function sample(overrides: Partial<SiteSampleResult> = {}): SiteSampleResult {
  return {
    id: "site-a",
    target: "https://example.com",
    channel: "http",
    ok: true,
    ...overrides,
  }
}

function probeResult(results: SiteSampleResult[], cancelled = false): SitesProbeResult {
  return {
    packId: "official",
    results,
    sessionId: "session-1",
    cancelled,
    commandHint: "sitesProbe(local)",
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(canUseTauriWindow).mockReturnValue(false)
  focusEvents.handler = null
  focusEvents.onFocusChanged.mockReset()
  focusEvents.isFocused.mockReset().mockResolvedValue(true)
})

describe("site monitoring", () => {
  it("alerts on unreachable sites and uses HTTP latency before ICMP fallback", () => {
    const samples = [
      sample({ id: "http-ok", target: "https://http-ok.example", httpTtfbMs: 120, icmpRttMs: 500 }),
      sample({ id: "http-slow", target: "https://http-slow.example", httpTtfbMs: 200 }),
      sample({
        id: "icmp-slow",
        target: "icmp-slow.example",
        channel: "icmp",
        httpTtfbMs: undefined,
        icmpRttMs: 201,
      }),
      sample({ id: "offline", target: "offline.example", ok: false }),
    ]

    expect(getSiteMonitorAlerts(samples, 200).map(({ id }) => id)).toEqual([
      "http-slow",
      "icmp-slow",
      "offline",
    ])
  })

  it("runs immediately, waits after each completed round, and reports threshold breaches", async () => {
    vi.useFakeTimers()
    const onProbe = vi
      .fn()
      .mockResolvedValue(probeResult([sample({ httpTtfbMs: 250, icmpRttMs: 20 })]))
    const { result } = renderHook(() =>
      useSitesMonitoring({
        loading: false,
        toolEnabled: true,
        canCancel: false,
        onProbe,
        onCancel: vi.fn(),
      }),
    )

    await act(async () => {
      result.current.start()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onProbe).toHaveBeenCalledTimes(1)
    expect(result.current.monitoring).toBe(true)
    expect(result.current.alertTargets).toEqual(["https://example.com"])

    await act(async () => vi.advanceTimersByTimeAsync(59_999))
    expect(onProbe).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(onProbe).toHaveBeenCalledTimes(2)

    act(() => result.current.stop())
    expect(result.current.monitoring).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("stops the current session and never schedules another round", async () => {
    vi.useFakeTimers()
    let resolveProbe!: (value: SitesProbeResult) => void
    const onProbe = vi.fn(
      () =>
        new Promise<SitesProbeResult>((resolve) => {
          resolveProbe = resolve
        }),
    )
    const onCancel = vi.fn()
    const { result } = renderHook(() =>
      useSitesMonitoring({
        loading: false,
        toolEnabled: true,
        canCancel: true,
        onProbe,
        onCancel,
      }),
    )

    act(() => result.current.start())
    expect(onProbe).toHaveBeenCalledTimes(1)
    act(() => result.current.stop())
    expect(onCancel).toHaveBeenCalledTimes(1)
    resolveProbe(probeResult([sample({ httpTtfbMs: 500 })]))
    await act(async () => Promise.resolve())
    await act(async () => vi.advanceTimersByTimeAsync(300_000))
    expect(onProbe).toHaveBeenCalledTimes(1)
    expect(result.current.alertTargets).toEqual([])
  })

  it("waits for a late session id before sending the pending cancel", async () => {
    const onProbe = vi.fn().mockReturnValue(new Promise<SitesProbeResult>(() => {}))
    const onCancel = vi.fn()
    const { result, rerender } = renderHook(
      ({ loading, canCancel }: { loading: boolean; canCancel: boolean }) =>
        useSitesMonitoring({
          loading,
          toolEnabled: true,
          canCancel,
          onProbe,
          onCancel,
        }),
      { initialProps: { loading: false, canCancel: false } },
    )

    act(() => result.current.start())
    rerender({ loading: true, canCancel: false })
    act(() => result.current.stop())
    expect(onCancel).not.toHaveBeenCalled()

    rerender({ loading: true, canCancel: true })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(result.current.monitoring).toBe(false)
  })

  it("cancels an active probe when its panel unmounts", () => {
    const onCancel = vi.fn()
    const { result, unmount } = renderHook(() =>
      useSitesMonitoring({
        loading: false,
        toolEnabled: true,
        canCancel: false,
        onProbe: () => new Promise<SitesProbeResult>(() => {}),
        onCancel,
      }),
    )

    act(() => result.current.start())
    unmount()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("does not cancel an already completed round when the panel unmounts between intervals", async () => {
    vi.useFakeTimers()
    const onCancel = vi.fn()
    const { result, unmount } = renderHook(() =>
      useSitesMonitoring({
        loading: false,
        toolEnabled: true,
        canCancel: false,
        onProbe: vi.fn().mockResolvedValue(probeResult([sample()])),
        onCancel,
      }),
    )

    await act(async () => {
      result.current.start()
      await Promise.resolve()
      await Promise.resolve()
    })
    unmount()
    expect(onCancel).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("stops monitoring and cancels the active round when the app window loses focus", async () => {
    vi.useFakeTimers()
    vi.mocked(canUseTauriWindow).mockReturnValue(true)
    focusEvents.onFocusChanged.mockImplementation((handler) => {
      focusEvents.handler = handler
      return Promise.resolve(vi.fn())
    })
    focusEvents.isFocused.mockResolvedValue(true)
    const onCancel = vi.fn()
    const onProbe = vi.fn().mockReturnValue(new Promise<SitesProbeResult>(() => {}))
    const { result } = renderHook(() =>
      useSitesMonitoring({
        loading: false,
        toolEnabled: true,
        canCancel: true,
        onProbe,
        onCancel,
      }),
    )

    act(() => result.current.start())
    await act(async () => Promise.resolve())
    expect(focusEvents.onFocusChanged).toHaveBeenCalledTimes(1)
    expect(onProbe).toHaveBeenCalledTimes(1)

    act(() => focusEvents.handler?.({ payload: false }))

    expect(result.current.monitoring).toBe(false)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("polls native focus while monitoring and stops when the window is unfocused", async () => {
    vi.useFakeTimers()
    vi.mocked(canUseTauriWindow).mockReturnValue(true)
    focusEvents.isFocused.mockResolvedValue(true)
    focusEvents.onFocusChanged.mockResolvedValue(vi.fn())
    const onCancel = vi.fn()
    const onProbe = vi.fn().mockReturnValue(new Promise<SitesProbeResult>(() => {}))
    const { result } = renderHook(() =>
      useSitesMonitoring({
        loading: false,
        toolEnabled: true,
        canCancel: true,
        onProbe,
        onCancel,
      }),
    )

    act(() => result.current.start())
    await act(async () => Promise.resolve())
    expect(focusEvents.isFocused).toHaveBeenCalledTimes(1)

    focusEvents.isFocused.mockResolvedValue(false)
    await act(async () => vi.advanceTimersByTimeAsync(500))

    expect(result.current.monitoring).toBe(false)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("stops monitoring and cancels the active round when the WebView loses focus", () => {
    vi.useFakeTimers()
    const onCancel = vi.fn()
    const onProbe = vi.fn().mockReturnValue(new Promise<SitesProbeResult>(() => {}))
    const { result } = renderHook(() =>
      useSitesMonitoring({
        loading: false,
        toolEnabled: true,
        canCancel: true,
        onProbe,
        onCancel,
      }),
    )

    act(() => result.current.start())
    expect(onProbe).toHaveBeenCalledTimes(1)

    act(() => window.dispatchEvent(new Event("blur")))

    expect(result.current.monitoring).toBe(false)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
