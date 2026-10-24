import { describe, expect, it } from "vitest"
import {
  compareHealthCheckStatuses,
  parseReportHistory,
  type HealthReportSnapshot,
} from "@/features/network-probe/report-history"

const snapshot = (
  sessionId: string,
  items: HealthReportSnapshot["items"],
): HealthReportSnapshot => ({
  sessionId,
  elapsedMs: 100,
  cancelled: false,
  commandHint: "runHealthScan()",
  items,
  opinions: [],
})

describe("network-probe report history", () => {
  it("keeps valid legacy snapshots and rejects malformed local storage entries", () => {
    const legacy = snapshot("legacy", [])
    const invalid = { ...snapshot("broken", []), items: [{ key: "dns" }] }

    expect(parseReportHistory(JSON.stringify([legacy, invalid]))).toEqual([legacy])
    expect(parseReportHistory("not-json")).toEqual([])
  })

  it("keeps a valid save time and drops an invalid one without losing the snapshot", () => {
    const valid = { ...snapshot("valid-time", []), savedAt: "2026-10-23T01:00:00.000Z" }
    const invalid = { ...snapshot("invalid-time", []), savedAt: "yesterday" }

    expect(parseReportHistory(JSON.stringify([valid, invalid]))).toEqual([
      valid,
      snapshot("invalid-time", []),
    ])
  })

  it("compares check statuses by key and ignores volatile detail text", () => {
    const before = snapshot("before", [
      { key: "dns.system", layer: "L2", status: "warn", detail: "old resolver" },
      { key: "route.default", layer: "L1", status: "pass" },
    ])
    const after = snapshot("after", [
      { key: "dns.system", layer: "L2", status: "pass", detail: "new resolver" },
      { key: "route.default", layer: "L1", status: "pass" },
      { key: "reach.public_ip", layer: "L3", status: "pass" },
    ])

    expect(compareHealthCheckStatuses(before, after)).toEqual([
      { key: "dns.system", beforeStatus: "warn", afterStatus: "pass" },
      { key: "reach.public_ip", beforeStatus: undefined, afterStatus: "pass" },
    ])
  })
})
