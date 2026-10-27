import { describe, expect, it } from "vitest"
import {
  createReportSnapshot,
  parseReportHistory,
  serializeReportHistory,
} from "@/features/network-probe/report-history"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

const scan: HealthScanResult = {
  items: [{ key: "dns", layer: "L1", status: "pass" }],
  opinions: [],
  elapsedMs: 24,
  sessionId: "scan-1",
  cancelled: false,
  commandHint: "startHealthScan(local)",
}

describe("health report history persistence", () => {
  it("migrates legacy result arrays with an unknown timestamp", () => {
    expect(parseReportHistory(JSON.stringify([scan]))).toEqual([{ result: scan, capturedAt: null }])
  })

  it("round-trips timestamped snapshots and drops malformed entries", () => {
    const snapshot = createReportSnapshot(scan, "2026-10-03T10:00:00.000Z")
    const raw = serializeReportHistory([
      snapshot,
      { result: {} as HealthScanResult, capturedAt: null },
    ])

    expect(parseReportHistory(raw)).toEqual([snapshot])
  })

  it("ignores corrupt or oversized local history", () => {
    expect(parseReportHistory("not-json")).toEqual([])
    expect(parseReportHistory("x".repeat(1_000_001))).toEqual([])
    expect(parseReportHistory(JSON.stringify([{ ...scan, items: "broken" }]))).toEqual([])
  })
})
