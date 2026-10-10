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
  it("keeps checks from an unfamiliar backend layer visible in a localized fallback section", () => {
    const knownItem: HealthCheckItem = {
      key: "link.iface",
      layer: "L0",
      status: "pass",
    }
    const unfamiliarItem: HealthCheckItem = {
      key: "future.check",
      layer: "L4",
      status: "warn",
      detail: "Synthetic future-layer check",
    }

    render(
      <HealthTreePanel
        loading={false}
        result={{ ...makeResult(knownItem), items: [knownItem, unfamiliarItem] }}
        streamingItems={[]}
        canCancel={false}
        cancelRequested={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.health.layers.L0")).toBeTruthy()
    expect(screen.getByText("networkProbe.health.layers.other")).toBeTruthy()
    expect(screen.getByText("Synthetic future-layer check")).toBeTruthy()
    expect(screen.queryByText("L4")).toBeNull()
  })

  it.each([
    [
      "DNS resolution failed while the public IP probe passed",
      "networkProbe.health.details.diagnosisDns",
    ],
    [
      "DNS server configuration is unavailable while the name probe failed",
      "networkProbe.health.details.diagnosisDns",
    ],
    [
      "Suspicious hosts overrides were found while the name probe failed",
      "networkProbe.health.details.diagnosisHosts",
    ],
    [
      "Name probe failed, but DNS and hosts checks did not establish the cause",
      "networkProbe.health.details.diagnosisNameProbe",
    ],
  ])("localizes connection diagnosis: %s", (diagnosis, expectedSummary) => {
    const item: HealthCheckItem = {
      key: "diff.dns_vs_ip",
      layer: "L3",
      status: diagnosis.startsWith("Name probe failed") ? "warn" : "fail",
      detail: diagnosis,
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

    expect(screen.getByText(expectedSummary)).toBeTruthy()
    expect(screen.getByText(diagnosis).closest("details")?.open).toBe(false)
  })

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

  it("does not repeat the session-specific scan command below the results", () => {
    const item: HealthCheckItem = {
      key: "link.iface",
      layer: "L0",
      status: "pass",
      detail: "2 active interface(s)",
    }
    const result = {
      ...makeResult(item),
      commandHint: "startHealthScan(local) // sessionId=health-1",
    }

    render(
      <HealthTreePanel
        loading={false}
        result={result}
        streamingItems={[]}
        canCancel={false}
        cancelRequested={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByText(result.commandHint)).toBeNull()
    expect(screen.getByText("networkProbe.cmd.healthScan")).toBeTruthy()
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

  it("uses safe localized fallbacks for prototype keys in DTO key and status", () => {
    const item: HealthCheckItem = {
      key: "constructor",
      layer: "L1",
      status: "constructor",
      detail: "Synthetic prototype-key diagnostic",
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
    const badge = screen.getByText("networkProbe.health.status.unknown")
    expect(badge.className).toContain("bg-muted")
    expect(screen.queryByText("constructor")).toBeNull()
    expect(screen.getByText(item.detail!).closest("details")?.open).toBe(false)
  })

  it.each(["future_status", "toString", "constructor"])(
    "uses a neutral localized badge for unfamiliar backend status %s",
    (status) => {
      const item: HealthCheckItem = {
        key: "link.iface",
        layer: "L0",
        status,
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

      const badge = screen.getByText("networkProbe.health.status.unknown")
      expect(badge.className).toContain("bg-muted")
      expect(screen.queryByText(status)).toBeNull()
    },
  )

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
