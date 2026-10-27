import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReportHistoryComparison } from "@/features/network-probe/components/ReportHistoryComparison"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(() => cleanup())

function snapshot(sessionId: string, items: HealthScanResult["items"]): HealthScanResult {
  return {
    items,
    opinions: [],
    elapsedMs: 1,
    sessionId,
    cancelled: false,
    commandHint: "startHealthScan(local)",
  }
}

describe("ReportHistoryComparison", () => {
  it("compares status changes and checks present in only one snapshot", () => {
    render(
      <ReportHistoryComparison
        history={[
          snapshot("newer-1", [
            { key: "dns", layer: "L1", status: "pass" },
            { key: "route", layer: "L1", status: "warn" },
          ]),
          snapshot("older-1", [
            { key: "dns", layer: "L1", status: "fail" },
            { key: "removed", layer: "L1", status: "skip" },
          ]),
        ]}
        onGoTree={vi.fn()}
      />,
    )

    const dnsRow = screen.getByText("networkProbe.health.items.dns.title").closest("tr")
    const routeRow = screen.getByText("networkProbe.health.items.route.title").closest("tr")
    const removedRow = screen.getByText("networkProbe.health.items.removed.title").closest("tr")

    expect(dnsRow).not.toBeNull()
    expect(within(dnsRow!).getByText("networkProbe.health.status.pass")).toBeInTheDocument()
    expect(within(dnsRow!).getByText("networkProbe.health.status.fail")).toBeInTheDocument()
    expect(
      within(dnsRow!).getByText("networkProbe.report.comparison.changeType.changed"),
    ).toBeInTheDocument()

    expect(routeRow).not.toBeNull()
    expect(
      within(routeRow!).getByText("networkProbe.report.comparison.missing"),
    ).toBeInTheDocument()
    expect(
      within(routeRow!).getByText("networkProbe.report.comparison.changeType.only-a"),
    ).toBeInTheDocument()

    expect(removedRow).not.toBeNull()
    expect(
      within(removedRow!).getByText("networkProbe.report.comparison.missing"),
    ).toBeInTheDocument()
    expect(
      within(removedRow!).getByText("networkProbe.report.comparison.changeType.only-b"),
    ).toBeInTheDocument()
  })

  it("lets the user select another snapshot and updates comparison rows", () => {
    render(
      <ReportHistoryComparison
        history={[
          snapshot("newer-1", [{ key: "dns", layer: "L1", status: "pass" }]),
          snapshot("middle-1", [{ key: "dns", layer: "L1", status: "warn" }]),
          snapshot("older-1", [{ key: "dns", layer: "L1", status: "fail" }]),
        ]}
        onGoTree={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText("networkProbe.report.comparison.snapshotA"), {
      target: { value: "older-1" },
    })

    const dnsRow = screen.getByText("networkProbe.health.items.dns.title").closest("tr")
    expect(dnsRow).not.toBeNull()
    expect(within(dnsRow!).getByText("networkProbe.health.status.fail")).toBeInTheDocument()
    expect(within(dnsRow!).getByText("networkProbe.health.status.warn")).toBeInTheDocument()
  })

  it("disables the snapshot already selected by the other selector", () => {
    render(
      <ReportHistoryComparison
        history={[
          snapshot("newer-1", [{ key: "dns", layer: "L1", status: "pass" }]),
          snapshot("older-1", [{ key: "dns", layer: "L1", status: "fail" }]),
        ]}
        onGoTree={vi.fn()}
      />,
    )

    const selectorA = screen.getByLabelText("networkProbe.report.comparison.snapshotA")
    const selectorB = screen.getByLabelText("networkProbe.report.comparison.snapshotB")
    expect(
      Array.from(selectorA.querySelectorAll("option")).find((option) => option.value === "older-1"),
    ).toBeDisabled()
    expect(
      Array.from(selectorB.querySelectorAll("option")).find((option) => option.value === "newer-1"),
    ).toBeDisabled()
  })

  it("offers a path to run another health scan when only one snapshot exists", () => {
    const onGoTree = vi.fn()
    render(
      <ReportHistoryComparison
        history={[snapshot("only-1", [{ key: "dns", layer: "L1", status: "pass" }])]}
        onGoTree={onGoTree}
      />,
    )

    expect(screen.getByText("networkProbe.report.comparison.needsTwoSnapshots")).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.report.goTree" }))
    expect(onGoTree).toHaveBeenCalledOnce()
  })
})
