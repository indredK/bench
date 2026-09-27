import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"
import { useNetworkProbeStore } from "../store"
import {
  compareHealthChecks,
  compareHealthOpinions,
  parseHealthReportHistory,
} from "../report-history"

function scan(overrides: Partial<HealthScanResult> = {}): HealthScanResult {
  return {
    sessionId: "scan-a",
    elapsedMs: 10,
    cancelled: false,
    commandHint: "startHealthScan(local)",
    items: [],
    opinions: [],
    ...overrides,
  }
}

describe("health report history", () => {
  beforeEach(() => {
    window.localStorage.removeItem("network-probe:report-history")
    useNetworkProbeStore.setState({ reportHistory: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
    useNetworkProbeStore.setState({ reportHistory: [] })
    window.localStorage.removeItem("network-probe:report-history")
  })

  it("records and persists the local save time for new snapshots", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-27T12:00:00Z"))
    useNetworkProbeStore.getState().pushReportHistory(scan())

    expect(useNetworkProbeStore.getState().reportHistory[0]?.savedAt).toBe(Date.now())
    expect(
      JSON.parse(window.localStorage.getItem("network-probe:report-history") ?? "[]")[0],
    ).toHaveProperty("savedAt", Date.now())
  })

  it("loads legacy snapshots and timestamped snapshots while ignoring malformed rows", () => {
    const legacy = scan()
    const timestamped = { ...scan({ sessionId: "scan-b" }), savedAt: 1790510000000 }
    const raw = JSON.stringify([
      legacy,
      { sessionId: "broken", items: "bad" },
      { ...legacy, savedAt: 1790510000000 },
      scan({ sessionId: "" }),
      timestamped,
    ])

    expect(parseHealthReportHistory(raw)).toEqual([legacy, timestamped])
    expect(parseHealthReportHistory("not-json")).toEqual([])
    expect(parseHealthReportHistory(JSON.stringify({ items: [] }))).toEqual([])
  })

  it("limits loaded history without changing the stored source", () => {
    const snapshots = Array.from({ length: 12 }, (_, index) => scan({ sessionId: `scan-${index}` }))
    const raw = JSON.stringify(snapshots)

    expect(parseHealthReportHistory(raw)).toHaveLength(10)
    expect(raw).toBe(JSON.stringify(snapshots))
  })

  it("compares checks by stable key, including additions, removals, and detail changes", () => {
    const before = scan({
      items: [
        { key: "dns", layer: "L0", status: "pass", detail: "192.0.2.1" },
        { key: "gateway", layer: "L1", status: "fail", detail: "unreachable" },
        { key: "firewall", layer: "L2", status: "pass" },
      ],
    })
    const after = scan({
      sessionId: "scan-b",
      items: [
        { key: "dns", layer: "L0", status: "pass", detail: "192.0.2.53" },
        { key: "gateway", layer: "L1", status: "pass", detail: "reachable" },
        { key: "route", layer: "L1", status: "pass" },
      ],
    })

    expect(compareHealthChecks(before, after).map(({ key, kind }) => [key, kind])).toEqual([
      ["dns", "changed"],
      ["gateway", "changed"],
      ["firewall", "removed"],
      ["route", "added"],
    ])
  })

  it("compares advice additions, removals, and severity changes", () => {
    const before = scan({
      opinions: [
        {
          id: "dns-issue",
          severity: "warn",
          relatedKeys: ["dns", "gateway"],
          titleKey: "opinion.dns",
          bodyKey: "opinion.dns.body",
        },
        {
          id: "proxy-issue",
          severity: "info",
          relatedKeys: ["proxy"],
          titleKey: "opinion.proxy",
          bodyKey: "opinion.proxy.body",
        },
      ],
    })
    const after = scan({
      sessionId: "scan-b",
      opinions: [
        {
          id: "dns-issue",
          severity: "critical",
          relatedKeys: ["gateway", "dns"],
          titleKey: "opinion.dns",
          bodyKey: "opinion.dns.body",
        },
        {
          id: "route-issue",
          severity: "warn",
          relatedKeys: ["route"],
          titleKey: "opinion.route",
          bodyKey: "opinion.route.body",
        },
      ],
    })

    expect(compareHealthOpinions(before, after).map(({ id, kind }) => [id, kind])).toEqual([
      ["dns-issue", "changed"],
      ["proxy-issue", "removed"],
      ["route-issue", "added"],
    ])
  })
})
