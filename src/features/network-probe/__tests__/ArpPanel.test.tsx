import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ArpPanel } from "@/features/network-probe/components/ArpPanel"
import type { LanDiscoveryResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === "networkProbe.arp.cancelledPartial" ? `${key} ${options?.count ?? 0}` : key,
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

const result: LanDiscoveryResult = {
  mode: "arp-cache+tcp-sweep",
  neighbors: [{ ip: "192.168.31.53", source: "tcp-sweep" }],
  cidr: "192.168.31.0/24",
  cancelled: false,
  sessionId: "session-1",
  elapsedMs: 6_074,
  commandHint: "scanLan(local)",
}

afterEach(() => cleanup())

describe("ArpPanel result feedback", () => {
  it("localizes the discovery source and does not mark a TCP-only neighbor as incomplete ARP", () => {
    render(<ArpPanel loading={false} result={result} toolEnabled onRun={() => undefined} />)

    const neighbor = screen.getByText(
      (_, element) =>
        element?.tagName === "LI" && element.textContent?.includes("192.168.31.53") === true,
    )

    expect(neighbor.textContent).toContain("networkProbe.arp.sourceTcpSweep")
    expect(neighbor.textContent).not.toContain("networkProbe.arp.macUnresolved")
    expect(neighbor.textContent).not.toContain("incomplete")
    expect(screen.getByText("networkProbe.arp.degradedHint")).toBeTruthy()
  })

  it("announces cancellation and retained partial results when neighbors exist", () => {
    render(
      <ArpPanel
        loading={false}
        result={{ ...result, cancelled: true }}
        toolEnabled
        onRun={() => undefined}
      />,
    )

    const status = screen.getByRole("status")
    expect(status.textContent).toContain("networkProbe.arp.cancelled")
    expect(status.textContent).toContain("networkProbe.arp.cancelledPartial 1")
    expect(screen.getByText(/networkProbe\.arp\.sourceTcpSweep/)).toBeTruthy()
    expect(screen.queryByText("networkProbe.arp.empty")).toBeNull()
  })

  it("explains when cancellation happened before finding neighbors", () => {
    render(
      <ArpPanel
        loading={false}
        result={{ ...result, neighbors: [], cancelled: true }}
        toolEnabled
        onRun={() => undefined}
      />,
    )

    expect(screen.getByRole("status").textContent).toContain("networkProbe.arp.cancelledEmpty")
    expect(screen.queryByText("networkProbe.arp.empty")).toBeNull()
  })
})
