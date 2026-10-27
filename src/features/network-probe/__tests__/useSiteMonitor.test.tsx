import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { isPermissionGranted, requestPermission, sendNotification, monitorSites } = vi.hoisted(
  () => ({
    isPermissionGranted: vi.fn(),
    requestPermission: vi.fn(),
    sendNotification: vi.fn(),
    monitorSites: vi.fn(),
  }),
)

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted,
  requestPermission,
  sendNotification,
}))
vi.mock("@/platform/capabilities", () => ({ canUseDesktopFeatures: () => true }))
vi.mock("@/features/network-probe/services/network-probe.use-cases", () => ({
  networkProbeUseCases: { monitorSites },
}))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => `${key} ${JSON.stringify(values ?? {})}`,
  }),
}))

import { useSiteMonitor } from "@/features/network-probe/hooks/useSiteMonitor"

const target = "https://user:secret@example.com/private?token=secret"
const sample = {
  id: "monitor-0",
  target: "https://example.com/[redacted-path]?[redacted]",
  channel: "http",
  ok: true,
  httpTtfbMs: 20,
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  isPermissionGranted.mockReset().mockResolvedValue(true)
  requestPermission.mockReset()
  sendNotification.mockReset()
  monitorSites.mockReset().mockResolvedValue([sample])
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useSiteMonitor", () => {
  it("does not probe if the user denies notification permission", async () => {
    isPermissionGranted.mockResolvedValue(false)
    requestPermission.mockResolvedValue("denied")

    const { result, unmount } = renderHook(() => useSiteMonitor([target], true))
    await act(async () => result.current.start([target]))

    expect(result.current.monitoring).toBe(false)
    expect(result.current.error).toBe("networkProbe.siteMonitor.errors.permissionDenied")
    expect(monitorSites).not.toHaveBeenCalled()
    unmount()
  })

  it("rejects a target selection that no longer matches the current selection", async () => {
    const removedTarget = "https://removed.example/"
    const { result, unmount } = renderHook(() => useSiteMonitor([target], true))

    await act(async () => result.current.start([removedTarget]))

    expect(result.current.error).toBe("networkProbe.siteMonitor.errors.targetsChanged")
    expect(isPermissionGranted).not.toHaveBeenCalled()
    expect(monitorSites).not.toHaveBeenCalled()
    unmount()
  })

  it("stops after a probe error instead of retrying silently", async () => {
    monitorSites.mockRejectedValueOnce(new Error("probe failure"))
    const { result, unmount } = renderHook(() => useSiteMonitor([target], true))

    await act(async () => result.current.start([target]))
    await flushPromises()

    expect(result.current.monitoring).toBe(false)
    expect(result.current.error).toBe("networkProbe.siteMonitor.errors.probeFailed")
    await act(async () => vi.advanceTimersByTimeAsync(120_000))
    expect(monitorSites).toHaveBeenCalledOnce()
    unmount()
  })

  it("skips a timer tick while the previous probe cycle is still running", async () => {
    let resolveFirst: (samples: (typeof sample)[]) => void = () => undefined
    monitorSites.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    const { result, unmount } = renderHook(() => useSiteMonitor([target], true))

    await act(async () => result.current.start([target]))
    await flushPromises()
    expect(monitorSites).toHaveBeenCalledOnce()

    await act(async () => vi.advanceTimersByTimeAsync(60_000))
    expect(monitorSites).toHaveBeenCalledOnce()

    await act(async () => resolveFirst([sample]))
    await flushPromises()
    await act(async () => vi.advanceTimersByTimeAsync(60_000))
    await flushPromises()
    expect(monitorSites).toHaveBeenCalledTimes(2)
    unmount()
  })

  it("deduplicates down notifications and includes only the target host", async () => {
    const downSample = { ...sample, ok: false, httpTtfbMs: undefined }
    monitorSites.mockResolvedValue([downSample])
    const { result, unmount } = renderHook(() => useSiteMonitor([target], true))

    await act(async () => result.current.start([target]))
    await flushPromises()
    expect(sendNotification).not.toHaveBeenCalled()

    await act(async () => vi.advanceTimersByTimeAsync(60_000))
    await flushPromises()
    expect(sendNotification).toHaveBeenCalledOnce()
    const notification = sendNotification.mock.calls[0]?.[0]
    expect(notification.body).toContain("example.com")
    expect(notification.body).not.toContain("secret")
    expect(notification.body).not.toContain("private")

    await act(async () => vi.advanceTimersByTimeAsync(60_000))
    await flushPromises()
    expect(sendNotification).toHaveBeenCalledOnce()
    unmount()
  })

  it("pauses while hidden and immediately probes when the window returns", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
    const { result, unmount } = renderHook(() => useSiteMonitor([target], true))
    await act(async () => result.current.start([target]))
    await flushPromises()
    expect(result.current.paused).toBe(true)
    expect(monitorSites).not.toHaveBeenCalled()

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
    await act(async () => document.dispatchEvent(new Event("visibilitychange")))
    await flushPromises()

    expect(monitorSites).toHaveBeenCalledOnce()
    await act(async () => vi.advanceTimersByTimeAsync(59_000))
    expect(monitorSites).toHaveBeenCalledOnce()
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    await flushPromises()
    expect(monitorSites).toHaveBeenCalledTimes(2)
    unmount()
  })

  it("discards a sample whose request crossed a hidden-window transition", async () => {
    let resolveFirst: (samples: (typeof sample)[]) => void = () => undefined
    monitorSites
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce([{ ...sample, target: "https://fresh.example/" }])

    const { result, unmount } = renderHook(() => useSiteMonitor([target], true))
    await act(async () => result.current.start([target]))
    await flushPromises()
    expect(monitorSites).toHaveBeenCalledOnce()

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
    await act(async () => document.dispatchEvent(new Event("visibilitychange")))
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
    await act(async () => document.dispatchEvent(new Event("visibilitychange")))

    await act(async () => resolveFirst([sample]))
    await flushPromises()
    expect(monitorSites).toHaveBeenCalledTimes(2)
    expect(result.current.samples).toEqual([{ ...sample, target: "https://fresh.example/" }])
    unmount()
  })

  it("does not start later targets after hiding and immediately resamples the full set on return", async () => {
    const secondTarget = "https://second.example/"
    const secondSample = { ...sample, target: "https://second.example/" }
    let resolveFirst: (samples: (typeof sample)[]) => void = () => undefined
    monitorSites
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce([sample])
      .mockResolvedValueOnce([secondSample])

    const { result, unmount } = renderHook(() => useSiteMonitor([target, secondTarget], true))
    await act(async () => result.current.start([target, secondTarget]))
    await flushPromises()
    expect(monitorSites).toHaveBeenNthCalledWith(1, [target])

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
    await act(async () => document.dispatchEvent(new Event("visibilitychange")))
    expect(monitorSites).toHaveBeenCalledOnce()

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
    await act(async () => document.dispatchEvent(new Event("visibilitychange")))
    await act(async () => resolveFirst([sample]))
    await flushPromises()

    expect(monitorSites).toHaveBeenCalledTimes(3)
    expect(monitorSites).toHaveBeenNthCalledWith(2, [target])
    expect(monitorSites).toHaveBeenNthCalledWith(3, [secondTarget])
    expect(result.current.samples.map(({ id }) => id)).toEqual(["monitor-0", "monitor-1"])
    unmount()
  })

  it("starts a fresh cycle immediately after a stopped in-flight target returns", async () => {
    let resolveFirst: (samples: (typeof sample)[]) => void = () => undefined
    monitorSites
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce([sample])

    const { result, unmount } = renderHook(() => useSiteMonitor([target], true))
    await act(async () => result.current.start([target]))
    await flushPromises()
    expect(monitorSites).toHaveBeenCalledOnce()

    act(() => result.current.stop())
    await act(async () => result.current.start([target]))
    await flushPromises()
    expect(monitorSites).toHaveBeenCalledOnce()

    await act(async () => resolveFirst([sample]))
    await flushPromises()
    expect(monitorSites).toHaveBeenCalledTimes(2)
    expect(monitorSites).toHaveBeenNthCalledWith(2, [target])
    unmount()
  })

  it("invalidates the current session synchronously when Stop races with a completed target", async () => {
    const secondTarget = "https://second.example/"
    let resolveFirst: (samples: (typeof sample)[]) => void = () => undefined
    monitorSites.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )

    const { result, unmount } = renderHook(() => useSiteMonitor([target, secondTarget], true))
    await act(async () => result.current.start([target, secondTarget]))
    await flushPromises()
    expect(monitorSites).toHaveBeenCalledOnce()

    await act(async () => {
      result.current.stop()
      resolveFirst([sample])
      await Promise.resolve()
    })

    expect(monitorSites).toHaveBeenCalledOnce()
    expect(result.current.monitoring).toBe(false)
    unmount()
  })
})
