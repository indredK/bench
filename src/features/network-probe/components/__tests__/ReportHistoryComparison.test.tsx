import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { ReportHistoryComparison } from "@/features/network-probe/components/ReportHistoryComparison"
import type { HealthReportSnapshot } from "@/features/network-probe/report-history"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) =>
      key === "networkProbe.report.historyItem"
        ? `${options?.session}… · ${options?.count} checks · ${options?.ms} ms · ${options?.opinionCount}`
        : key === "networkProbe.report.opinionCount"
          ? `${options?.count} opinion${options?.count === 1 ? "" : "s"}`
          : key,
    i18n: { resolvedLanguage: "en" },
  }),
}))

const pointerCaptureDescriptors = new Map<string, PropertyDescriptor | undefined>()
beforeAll(() => {
  for (const method of [
    "hasPointerCapture",
    "setPointerCapture",
    "releasePointerCapture",
    "scrollIntoView",
  ]) {
    pointerCaptureDescriptors.set(
      method,
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, method),
    )
  }
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => undefined },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
  })
})

afterAll(() => {
  for (const [method, descriptor] of pointerCaptureDescriptors) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, method, descriptor)
    else Reflect.deleteProperty(HTMLElement.prototype, method)
  }
})

const history: HealthReportSnapshot[] = [
  {
    sessionId: "after-new",
    elapsedMs: 90,
    cancelled: false,
    commandHint: "scan",
    savedAt: "2026-10-23T01:00:00.000Z",
    items: [
      { key: "dns.system", layer: "L2", status: "pass", detail: "10.0.0.1" },
      { key: "route.default", layer: "L1", status: "pass" },
      { key: "reach.public_ip", layer: "L3", status: "pass" },
    ],
    opinions: [],
  },
  {
    sessionId: "before-old",
    elapsedMs: 100,
    cancelled: false,
    commandHint: "scan",
    items: [
      { key: "dns.system", layer: "L2", status: "warn", detail: "10.0.0.2" },
      { key: "route.default", layer: "L1", status: "pass" },
    ],
    opinions: [
      { id: "op1", severity: "warn", relatedKeys: ["dns.system"], titleKey: "t", bodyKey: "b" },
    ],
  },
  {
    sessionId: "older-scan",
    elapsedMs: 140,
    cancelled: false,
    commandHint: "scan",
    savedAt: "2026-10-23T00:00:00.000Z",
    items: [{ key: "dns.system", layer: "L2", status: "fail" }],
    opinions: [],
  },
]

describe("ReportHistoryComparison", () => {
  it("shows status deltas, missing checks and opinion count changes without diagnostic details", () => {
    render(<ReportHistoryComparison history={history} />)

    expect(
      screen.getByRole("heading", { name: "networkProbe.report.compareTitle" }),
    ).toBeInTheDocument()
    expect(screen.getByText("networkProbe.report.compareSummary")).toBeInTheDocument()
    expect(screen.getByText("dns.system")).toBeInTheDocument()
    expect(screen.getByText("reach.public_ip")).toBeInTheDocument()
    expect(screen.getAllByText("networkProbe.report.notRecorded")).toHaveLength(1)
    expect(screen.queryByText("10.0.0.1")).not.toBeInTheDocument()
    expect(screen.queryByText("10.0.0.2")).not.toBeInTheDocument()

    const baseline = screen.getByRole("combobox", {
      name: "networkProbe.report.baselineSnapshot",
    })
    expect(baseline).toHaveTextContent("before-o")
    expect(baseline).toHaveTextContent("1 opinion")
    expect(baseline).not.toHaveTextContent("1 opinions")
    expect(baseline.textContent?.match(/before-o/g)).toHaveLength(1)

    const table = screen.getByRole("table")
    expect(
      within(table).getByRole("columnheader", { name: "networkProbe.report.baselineColumn" }),
    ).toBeInTheDocument()
    expect(
      within(table).getByRole("columnheader", { name: "networkProbe.report.comparisonColumn" }),
    ).toBeInTheDocument()
  })

  it("explains that two snapshots are required", () => {
    render(<ReportHistoryComparison history={[history[0]]} />)
    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.report.compareNeedsTwo")
  })

  it("keeps the default baseline when a different comparison snapshot is selected", async () => {
    const user = userEvent.setup()
    render(<ReportHistoryComparison history={history} />)

    const baseline = screen.getByRole("combobox", {
      name: "networkProbe.report.baselineSnapshot",
    })
    const comparison = screen.getByRole("combobox", {
      name: "networkProbe.report.comparisonSnapshot",
    })
    expect(baseline).toHaveTextContent("before-o")

    await user.click(comparison)
    await user.click(await screen.findByRole("option", { name: /older-s/ }))

    expect(baseline).toHaveTextContent("before-o")
    expect(comparison).toHaveTextContent("older-s")
  })
})
