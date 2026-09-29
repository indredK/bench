import { describe, expect, it } from "vitest"
import { summarizeHealthOverview } from "@/features/network-probe/health-overview"
import type { HealthCheckItem, HealthScanResult } from "@/lib/tauri/types/network-probe"

function item(status: string): HealthCheckItem {
  return { key: `test.${status}`, layer: "L0", status }
}

function result(items: HealthCheckItem[], cancelled = false): HealthScanResult {
  return {
    items,
    opinions: [],
    elapsedMs: 10,
    sessionId: "session-1",
    cancelled,
    commandHint: "runHealthScan()",
  }
}

describe("summarizeHealthOverview", () => {
  it("uses streamed items while a scan is running, instead of stale results", () => {
    const summary = summarizeHealthOverview(result([item("fail")]), true, [
      item("pass"),
      item("warn"),
    ])

    expect(summary).toMatchObject({
      state: "scanning",
      total: 2,
      counts: { pass: 1, warn: 1, fail: 0 },
    })
  })

  it("distinguishes an unstarted scan, cancellation, and a complete healthy scan", () => {
    expect(summarizeHealthOverview(null, false).state).toBe("notRun")
    expect(summarizeHealthOverview(result([item("pass")], true), false).state).toBe("cancelled")
    expect(summarizeHealthOverview(result([item("pass")]), false).state).toBe("healthy")
  })

  it("prioritizes failed checks, labels incomplete results partial, and then surfaces warnings", () => {
    expect(summarizeHealthOverview(result([item("error"), item("fail")]), false).state).toBe(
      "issues",
    )
    expect(summarizeHealthOverview(result([item("warn"), item("skip")]), false).state).toBe(
      "partial",
    )
    expect(summarizeHealthOverview(result([item("warn")]), false).state).toBe("attention")
    expect(
      summarizeHealthOverview(result([item("error"), item("future-status")]), false),
    ).toMatchObject({ state: "partial", counts: { error: 1 }, unknownCount: 1, total: 2 })
    expect(summarizeHealthOverview(result([]), false).state).toBe("partial")
  })
})
