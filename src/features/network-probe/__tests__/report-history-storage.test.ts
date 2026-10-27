import { beforeEach, describe, expect, it, vi } from "vitest"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

const STORAGE_KEY = "network-probe:report-history"

const validSnapshot: HealthScanResult = {
  items: [{ key: "dns", layer: "L0", status: "pass" }],
  opinions: [],
  elapsedMs: 12,
  sessionId: "snapshot-1",
  cancelled: false,
  commandHint: "runHealthScan(local)",
}

describe("network probe report history storage", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it("ignores malformed snapshots without dropping valid history", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        null,
        { ...validSnapshot, items: [{ key: "dns" }] },
        {
          ...validSnapshot,
          items: [
            { key: "dns", layer: "L1", status: "pass" },
            { key: "dns", layer: "L2", status: "fail" },
          ],
        },
        { ...validSnapshot, sessionId: "cancelled-old", cancelled: true },
        validSnapshot,
      ]),
    )

    const { useNetworkProbeStore } = await import("@/features/network-probe/store")

    expect(useNetworkProbeStore.getState().reportHistory).toEqual([validSnapshot])
  })

  it("keeps only the newest snapshot for a repeated session ID", async () => {
    const olderDuplicate = {
      ...validSnapshot,
      items: [{ key: "route", layer: "L1", status: "fail" }],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([validSnapshot, olderDuplicate]))

    const { useNetworkProbeStore } = await import("@/features/network-probe/store")

    expect(useNetworkProbeStore.getState().reportHistory).toEqual([validSnapshot])
  })

  it("replaces a duplicate session instead of storing the same run twice", async () => {
    const { useNetworkProbeStore } = await import("@/features/network-probe/store")
    useNetworkProbeStore.getState().pushReportHistory(validSnapshot)
    const replacement = {
      ...validSnapshot,
      items: [{ key: "route", layer: "L1", status: "fail" }],
    }

    useNetworkProbeStore.getState().pushReportHistory(replacement)

    expect(useNetworkProbeStore.getState().reportHistory).toEqual([replacement])
  })

  it("does not store cancelled scans in report history", async () => {
    const { useNetworkProbeStore } = await import("@/features/network-probe/store")

    useNetworkProbeStore.getState().pushReportHistory({ ...validSnapshot, cancelled: true })

    expect(useNetworkProbeStore.getState().reportHistory).toEqual([])
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("falls back to empty history for malformed or oversized storage", async () => {
    localStorage.setItem(STORAGE_KEY, "not-json")
    const malformed = await import("@/features/network-probe/store")
    expect(malformed.useNetworkProbeStore.getState().reportHistory).toEqual([])

    vi.resetModules()
    localStorage.setItem(STORAGE_KEY, JSON.stringify([validSnapshot]).padEnd(1_048_577, " "))
    const oversized = await import("@/features/network-probe/store")
    expect(oversized.useNetworkProbeStore.getState().reportHistory).toEqual([])
  })

  it("trims the oldest snapshots to the same byte limit used during restore", async () => {
    const { useNetworkProbeStore } = await import("@/features/network-probe/store")
    const makeLargeSnapshot = (sessionId: string): HealthScanResult => ({
      ...validSnapshot,
      sessionId,
      items: Array.from({ length: 10 }, (_, index) => ({
        key: `check-${index}`,
        layer: "L0",
        status: "pass",
        detail: "x".repeat(12_000),
      })),
    })

    for (let index = 0; index < 10; index += 1) {
      useNetworkProbeStore.getState().pushReportHistory(makeLargeSnapshot(`snapshot-${index}`))
    }

    const retained = useNetworkProbeStore.getState().reportHistory
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(retained.length).toBeLessThan(10)
    expect(retained[0]?.sessionId).toBe("snapshot-9")
    expect(raw).not.toBeNull()
    expect(new TextEncoder().encode(raw ?? "").byteLength).toBeLessThanOrEqual(1_048_576)

    vi.resetModules()
    const restored = await import("@/features/network-probe/store")
    expect(restored.useNetworkProbeStore.getState().reportHistory).toEqual(retained)
  })

  it("keeps existing history when a single new snapshot exceeds the byte limit", async () => {
    const { useNetworkProbeStore } = await import("@/features/network-probe/store")
    useNetworkProbeStore.getState().pushReportHistory(validSnapshot)
    const rawBefore = localStorage.getItem(STORAGE_KEY)

    useNetworkProbeStore.getState().pushReportHistory({
      ...validSnapshot,
      sessionId: "too-large",
      items: [{ key: "large", layer: "L0", status: "pass", detail: "x".repeat(1_100_000) }],
    })

    expect(useNetworkProbeStore.getState().reportHistory).toEqual([validSnapshot])
    expect(localStorage.getItem(STORAGE_KEY)).toBe(rawBefore)
  })
})
