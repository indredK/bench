import { describe, expect, it } from "vitest"
import {
  REPORT_HISTORY_ENABLED_KEY,
  REPORT_HISTORY_KEY,
  useNetworkProbeStore,
} from "@/features/network-probe/store"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"
import {
  compareHealthReports,
  decodeReportHistory,
  encodeReportHistory,
  REPORT_HISTORY_LIMIT,
} from "@/features/network-probe/report-history"

function result(
  sessionId: string,
  items: Array<{ key: string; status: string }>,
  opinionIds: string[] = [],
): HealthScanResult {
  return {
    sessionId,
    elapsedMs: 10,
    cancelled: false,
    commandHint: "health scan",
    items: items.map(({ key, status }) => ({ key, status, layer: "L1" })),
    opinions: opinionIds.map((id) => ({
      id,
      severity: "warn",
      relatedKeys: [],
      titleKey: `networkProbe.opinion.${id}.title`,
      bodyKey: `networkProbe.opinion.${id}.body`,
    })),
  }
}

describe("network probe report history", () => {
  it("migrates valid legacy results without inventing a capture time", () => {
    const old = result("old", [{ key: "dns", status: "pass" }])

    expect(decodeReportHistory(JSON.stringify([old]))).toEqual([
      {
        capturedAt: null,
        result: {
          items: [{ key: "dns", layer: "L1", status: "pass" }],
          opinions: [],
          elapsedMs: 10,
          sessionId: "old",
        },
      },
    ])
  })

  it("projects wrapped snapshots through the safe field whitelist", () => {
    const snapshot = {
      capturedAt: 1_790_000_000_000,
      result: {
        sessionId: "wrapped",
        elapsedMs: 10,
        commandHint: "inspect 192.168.1.23",
        hidden: "private.example",
        items: [
          {
            key: "dns",
            layer: "L1",
            status: "pass",
            detail: "resolved to 192.168.1.23",
            commandHint: "lookup private.example",
          },
        ],
        opinions: [
          {
            id: "private-opinion",
            severity: "warn",
            titleKey: "private.title",
            bodyKey: "private.body",
            relatedKeys: ["private.example"],
          },
        ],
      },
    }

    expect(decodeReportHistory(JSON.stringify([snapshot]))).toEqual([
      {
        capturedAt: 1_790_000_000_000,
        result: {
          sessionId: "wrapped",
          elapsedMs: 10,
          items: [{ key: "dns", layer: "L1", status: "pass" }],
          opinions: [{ id: "private-opinion", severity: "warn" }],
        },
      },
    ])
  })

  it("rejects malformed rows and limits decoded and encoded history", () => {
    const scans = Array.from({ length: REPORT_HISTORY_LIMIT + 2 }, (_, index) =>
      result(`scan-${index}`, [{ key: "dns", status: "pass" }]),
    )
    const decoded = decodeReportHistory(JSON.stringify([null, { sessionId: "broken" }, ...scans]))

    expect(decoded).toHaveLength(REPORT_HISTORY_LIMIT)
    expect(decoded[0]?.result.sessionId).toBe("scan-0")
    expect(JSON.parse(encodeReportHistory(decoded))).toHaveLength(REPORT_HISTORY_LIMIT)
    expect(decodeReportHistory("{")).toEqual([])

    const cancelled = { ...scans[0], cancelled: true }
    expect(decodeReportHistory(JSON.stringify([cancelled]))).toEqual([])
  })

  it("classifies known status direction, unknown states, added/removed checks, and opinion changes", () => {
    const previous = result(
      "previous",
      [
        { key: "dns", status: "fail" },
        { key: "gateway", status: "pass" },
        { key: "route", status: "skip" },
        { key: "tls", status: "warn" },
      ],
      ["old-advice", "stays"],
    )
    const current = result(
      "current",
      [
        { key: "dns", status: "pass" },
        { key: "gateway", status: "fail" },
        { key: "route", status: "pass" },
        { key: "tls", status: "error" },
        { key: "wifi", status: "warn" },
      ],
      ["new-advice", "stays"],
    )

    const comparison = compareHealthReports(previous, current)

    expect(comparison.checks).toEqual([
      { key: "dns", previousStatus: "fail", currentStatus: "pass", kind: "improved" },
      { key: "gateway", previousStatus: "pass", currentStatus: "fail", kind: "worsened" },
      { key: "route", previousStatus: "skip", currentStatus: "pass", kind: "changed" },
      { key: "tls", previousStatus: "warn", currentStatus: "error", kind: "changed" },
      { key: "wifi", previousStatus: undefined, currentStatus: "warn", kind: "added" },
    ])
    expect(comparison.counts).toMatchObject({
      improved: 1,
      worsened: 1,
      changed: 2,
      added: 1,
      removed: 0,
    })
    expect(comparison.addedOpinionCount).toBe(1)
    expect(comparison.resolvedOpinionCount).toBe(1)
  })

  it("reports checks no longer returned without treating them as healthy", () => {
    const comparison = compareHealthReports(
      result("previous", [{ key: "dns", status: "warn" }]),
      result("current", []),
    )

    expect(comparison.checks).toEqual([
      { key: "dns", previousStatus: "warn", currentStatus: undefined, kind: "removed" },
    ])
    expect(comparison.counts.removed).toBe(1)
  })

  it("clears stored snapshots when local history is disabled and stops future writes", () => {
    const store = useNetworkProbeStore.getState()
    store.setReportHistoryEnabled(true)
    store.pushReportHistory(result("saved", [{ key: "dns", status: "pass" }]))
    expect(useNetworkProbeStore.getState().reportHistory).toHaveLength(1)

    useNetworkProbeStore.getState().setReportHistoryEnabled(false)
    expect(useNetworkProbeStore.getState().reportHistory).toEqual([])
    expect(localStorage.getItem("network-probe:report-history")).toBe("[]")

    useNetworkProbeStore
      .getState()
      .pushReportHistory(result("not-saved", [{ key: "dns", status: "warn" }]))
    expect(useNetworkProbeStore.getState().reportHistory).toEqual([])
  })

  it("honors an opt-out written by another app window", () => {
    const store = useNetworkProbeStore.getState()
    store.setReportHistoryEnabled(true)
    store.pushReportHistory(result("existing", [{ key: "dns", status: "pass" }]))
    localStorage.setItem("network-probe:report-history-enabled", "0")

    useNetworkProbeStore
      .getState()
      .pushReportHistory(result("external-opt-out", [{ key: "dns", status: "warn" }]))

    expect(useNetworkProbeStore.getState().reportHistoryEnabled).toBe(false)
    expect(useNetworkProbeStore.getState().reportHistory).toEqual([])
    expect(localStorage.getItem("network-probe:report-history")).toBe("[]")
  })

  it("clears a snapshot if another window opts out during the append", () => {
    const store = useNetworkProbeStore.getState()
    store.setReportHistoryEnabled(true)
    const originalSetItem = Storage.prototype.setItem
    let interleaved = false
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === REPORT_HISTORY_KEY && value !== "[]" && !interleaved) {
        interleaved = true
        originalSetItem.call(this, REPORT_HISTORY_ENABLED_KEY, "0")
      }
      originalSetItem.call(this, key, value)
    }

    try {
      useNetworkProbeStore
        .getState()
        .pushReportHistory(result("raced-opt-out", [{ key: "dns", status: "pass" }]))
    } finally {
      Storage.prototype.setItem = originalSetItem
    }

    expect(interleaved).toBe(true)
    expect(useNetworkProbeStore.getState().reportHistoryEnabled).toBe(false)
    expect(useNetworkProbeStore.getState().reportHistory).toEqual([])
    expect(localStorage.getItem(REPORT_HISTORY_KEY)).toBe("[]")
  })

  it("stores only comparison fields and omits raw network diagnostics", () => {
    const scan = result("private", [{ key: "dns", status: "pass" }], ["private-opinion"])
    scan.commandHint = "inspect 192.168.1.23"
    scan.items[0]!.detail = "resolved to 192.168.1.23"
    scan.items[0]!.commandHint = "lookup private.example"

    useNetworkProbeStore.getState().setReportHistoryEnabled(true)
    useNetworkProbeStore.getState().pushReportHistory(scan)
    const saved = JSON.parse(
      localStorage.getItem("network-probe:report-history") ?? "[]",
    ) as Array<{
      result: {
        commandHint?: string
        items: Array<Record<string, unknown>>
        opinions: Array<Record<string, unknown>>
      }
    }>

    expect(saved[0]?.result.commandHint).toBeUndefined()
    expect(saved[0]?.result.items[0]).toEqual({ key: "dns", layer: "L1", status: "pass" })
    expect(saved[0]?.result.opinions[0]).toEqual({ id: "private-opinion", severity: "warn" })
  })
})
