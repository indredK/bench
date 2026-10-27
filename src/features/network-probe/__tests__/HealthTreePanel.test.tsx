import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HealthTreePanel } from "@/features/network-probe/components/HealthTreePanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      key === "networkProbe.health.items.link.iface.title"
        ? "Network interfaces"
        : (options?.defaultValue ?? key),
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => children,
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

describe("network-probe health item labels", () => {
  it("uses a localized title while keeping the stable key available as a secondary label", () => {
    render(
      <HealthTreePanel
        embedded
        loading={false}
        result={{
          items: [
            {
              key: "link.iface",
              layer: "L0",
              status: "pass",
              detail: "2 active interface(s)",
            },
          ],
          opinions: [],
          elapsedMs: 1,
          sessionId: "session-1",
          cancelled: false,
          commandHint: "startHealthScan(local)",
        }}
        streamingItems={[]}
        canCancel={false}
        cancelling={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("Network interfaces")).toBeInTheDocument()
    expect(screen.getByText("link.iface")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "networkProbe.health.layers.L0", level: 4 }),
    ).toBeInTheDocument()
  })

  it("explains why an unreadable system proxy is not reported as disabled", () => {
    render(
      <HealthTreePanel
        loading={false}
        result={{
          items: [
            { key: "proxy.system", layer: "L1", status: "error" },
            { key: "vpn.tunnel", layer: "L1", status: "error" },
          ],
          opinions: [],
          elapsedMs: 1,
          sessionId: "session-2",
          cancelled: false,
          commandHint: "startHealthScan(local)",
        }}
        streamingItems={[]}
        canCancel={false}
        cancelling={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.health.proxyStatusUnavailable")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.health.vpnStatusUnavailable")).toBeInTheDocument()
    expect(screen.getAllByText("error")).toHaveLength(2)
    expect(
      screen.getByRole("heading", { name: "networkProbe.health.layers.L1", level: 3 }),
    ).toBeInTheDocument()
  })
})
