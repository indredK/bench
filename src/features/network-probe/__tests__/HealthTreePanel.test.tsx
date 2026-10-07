import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HealthTreePanel } from "@/features/network-probe/components/HealthTreePanel"
import type { HealthCheckItem, HealthScanResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

afterEach(() => cleanup())

function makeResult(item: HealthCheckItem): HealthScanResult {
  return {
    items: [item],
    opinions: [],
    elapsedMs: 3,
    sessionId: "health-1",
    cancelled: false,
    commandHint: "startHealthScan(local)",
  }
}

describe("HealthTreePanel localized check presentation", () => {
  it("shows a localized check name and summary while keeping raw diagnostics collapsed", () => {
    const item: HealthCheckItem = {
      key: "link.iface",
      layer: "L0",
      status: "pass",
      detail: "2 active interface(s)",
      commandHint: "getLocalNetworkSummary()",
    }

    render(
      <HealthTreePanel
        loading={false}
        result={makeResult(item)}
        streamingItems={[]}
        canCancel={false}
        cancelRequested={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.health.checks.activeInterfaces")).toBeTruthy()
    expect(screen.getByText("networkProbe.health.details.activeInterfaceCount")).toBeTruthy()
    const technicalDetails = screen
      .getByText("networkProbe.health.technicalDetails")
      .closest("details")
    expect(technicalDetails?.open).toBe(false)
    expect(screen.getByText(item.detail!).closest("details")).toBe(technicalDetails)
    expect(screen.getByText(item.commandHint!).closest("details")).toBe(technicalDetails)
  })

  it("uses a localized warning fallback for an unfamiliar backend diagnostic", () => {
    const item: HealthCheckItem = {
      key: "future.check",
      layer: "L1",
      status: "warn",
      detail: "An upstream check returned a new English warning.",
    }

    render(
      <HealthTreePanel
        loading={false}
        result={makeResult(item)}
        streamingItems={[]}
        canCancel={false}
        cancelRequested={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.health.checks.unknown")).toBeTruthy()
    expect(screen.getByText("networkProbe.health.details.genericWarning")).toBeTruthy()
    expect(screen.getByText(item.detail!).closest("details")?.open).toBe(false)
  })

  it.each(["addr.ipv4", "addr.ipv6"])("localizes a missing network summary for %s", (key) => {
    const item: HealthCheckItem = {
      key,
      layer: "L1",
      status: "error",
      detail: "No summary",
    }

    render(
      <HealthTreePanel
        loading={false}
        result={makeResult(item)}
        streamingItems={[]}
        canCancel={false}
        cancelRequested={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.health.details.summaryUnavailable")).toBeTruthy()
    expect(screen.getByText(item.detail!).closest("details")?.open).toBe(false)
  })
})
