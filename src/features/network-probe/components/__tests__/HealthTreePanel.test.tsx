/**
 * Test / 测试: keep health item labels localized and technical evidence available on demand.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { HealthTreePanel } from "../HealthTreePanel"
import type { HealthCheckItem, HealthScanResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "networkProbe.health.checks.reach.public_ip": "公网 IP 连通性",
        "networkProbe.health.technicalDetails": "技术详情",
      })[key] ?? key,
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({
    toolbar,
    children,
  }: {
    toolbar: React.ReactNode
    children: React.ReactNode
  }) => (
    <section>
      {toolbar}
      {children}
    </section>
  ),
}))

function createItem(overrides: Partial<HealthCheckItem> = {}): HealthCheckItem {
  return {
    key: "reach.public_ip",
    layer: "L3",
    status: "pass",
    detail: "rtt≈0.1ms",
    commandHint: "pingHost(local, '1.1.1.1', {count:1})",
    ...overrides,
  }
}

function createResult(items: HealthCheckItem[]): HealthScanResult {
  return {
    items,
    opinions: [],
    elapsedMs: 120,
    sessionId: "session-1",
    cancelled: false,
    commandHint: "startHealthScan(local)",
  }
}

describe("HealthTreePanel", () => {
  it("shows translated check labels and keeps backend diagnostics collapsed but available", () => {
    const diagnostic = "English backend diagnostic must not be front-and-center"
    render(
      <HealthTreePanel
        loading={false}
        result={createResult([createItem({ detail: diagnostic })])}
        streamingItems={[]}
        canCancel={false}
        onRun={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByText("公网 IP 连通性")).toBeInTheDocument()
    const diagnosticText = screen.getByText(diagnostic)
    const technicalDetails = diagnosticText.closest("details")
    expect(technicalDetails).not.toBeNull()
    expect(technicalDetails).not.toHaveAttribute("open")
    expect(screen.getByText("pingHost(local, '1.1.1.1', {count:1})")).toBeInTheDocument()
  })

  it("keeps the live streaming tree usable before the final result arrives", () => {
    render(
      <HealthTreePanel
        loading
        result={null}
        streamingItems={[createItem()]}
        canCancel
        onRun={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByText("公网 IP 连通性")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "networkProbe.health.cancel" })).toBeInTheDocument()
  })
})
