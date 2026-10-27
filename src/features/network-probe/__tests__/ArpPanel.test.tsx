import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ArpPanel } from "@/features/network-probe/components/ArpPanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { mode?: string }) =>
      key === "networkProbe.arp.meta" ? `${key} ${options?.mode ?? ""}` : key,
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

describe("network-probe ARP empty-state copy", () => {
  it("shows preparation feedback without inventing a scan percentage", () => {
    render(
      <ArpPanel
        loading
        result={null}
        progress={{
          sessionId: "session-preparing",
          phase: "preparing",
          checkedHosts: 0,
          totalHosts: 0,
          discoveredNeighbors: 0,
        }}
        toolEnabled
        cancelling={false}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.arp.preparing")).toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("shows exact completed-host and discovered-neighbor counts accessibly", () => {
    render(
      <ArpPanel
        loading
        result={null}
        progress={{
          sessionId: "session-scanning",
          phase: "scanning",
          checkedHosts: 64,
          totalHosts: 253,
          discoveredNeighbors: 8,
        }}
        toolEnabled
        cancelling={false}
        onRun={vi.fn()}
      />,
    )

    const bar = screen.getByRole("progressbar", { name: "networkProbe.arp.progressLabel" })
    expect(bar).toHaveAttribute("aria-valuemin", "0")
    expect(bar).toHaveAttribute("aria-valuenow", "64")
    expect(bar).toHaveAttribute("aria-valuemax", "253")
    expect(bar).toHaveAttribute("aria-valuetext", "networkProbe.arp.progress")
    expect(screen.getByText("networkProbe.arp.progress")).toHaveAttribute("aria-live", "polite")
  })

  it("renders the localized empty reason without exposing the backend message", () => {
    const backendMessage =
      "No neighbors found. May be a quiet network, Wi-Fi client isolation, or Local Network permission."

    render(
      <ArpPanel
        loading={false}
        result={{
          mode: "arp-cache+tcp-sweep",
          neighbors: [],
          message: backendMessage,
          emptyReason: "quiet",
          cidr: "192.168.0.0/24",
          cancelled: false,
          sessionId: "session-1",
          elapsedMs: 25,
          commandHint: "scanLan(local)",
        }}
        toolEnabled
        cancelling={false}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.arp.emptyQuiet")).toBeInTheDocument()
    expect(screen.queryByText(backendMessage)).not.toBeInTheDocument()
  })

  it("shows TCP-only mode when the platform cannot read the system neighbor cache", () => {
    render(
      <ArpPanel
        loading={false}
        result={{
          mode: "tcp-sweep",
          neighbors: [{ ip: "192.168.0.1", source: "tcp-sweep" }],
          cidr: "192.168.0.0/24",
          cancelled: false,
          sessionId: "session-tcp-only",
          elapsedMs: 1,
          commandHint: "scanLan(local)",
        }}
        toolEnabled
        cancelling={false}
        onRun={vi.fn()}
      />,
    )

    expect(
      screen.getByText("networkProbe.arp.meta networkProbe.arp.mode.tcpOnly"),
    ).toBeInTheDocument()
  })

  it("does not claim a system cache is shown when the platform cannot read it", () => {
    render(
      <ArpPanel
        loading={false}
        result={{
          mode: "not-run",
          neighbors: [],
          emptyReason: "scope",
          cidr: "192.168.0.0/23",
          cancelled: false,
          sessionId: "session-scope-no-cache",
          elapsedMs: 1,
          commandHint: "scanLan(local)",
        }}
        toolEnabled
        cancelling={false}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.arp.scopeSkippedNoCache")).toBeInTheDocument()
    expect(screen.queryByText("networkProbe.arp.scopeSkipped")).not.toBeInTheDocument()
  })

  it("shows the scope limit even when cached neighbors are available", () => {
    render(
      <ArpPanel
        loading={false}
        result={{
          mode: "arp-cache",
          neighbors: [{ ip: "192.168.1.1", mac: "00:11:22:33:44:55", source: "arp-cache" }],
          message: "The local subnet is wider than /24; active TCP probes were skipped.",
          emptyReason: "scope",
          cidr: "192.168.0.0/23",
          cancelled: false,
          sessionId: "session-2",
          elapsedMs: 1,
          commandHint: "scanLan(local)",
        }}
        toolEnabled
        cancelling={false}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.arp.scopeSkipped")).toBeInTheDocument()
    expect(
      screen.getByText("192.168.1.1 · 00:11:22:33:44:55 · networkProbe.arp.source.cache"),
    ).toBeInTheDocument()
  })

  it("explains why active probes are skipped outside RFC 1918 ranges", () => {
    render(
      <ArpPanel
        loading={false}
        result={{
          mode: "arp-cache",
          neighbors: [{ ip: "169.254.1.2", mac: "00:11:22:33:44:66", source: "arp-cache" }],
          message: "Active probes skipped.",
          emptyReason: "non-private-scope",
          cidr: "169.254.1.0/24",
          cancelled: false,
          sessionId: "session-public-scope",
          elapsedMs: 1,
          commandHint: "scanLan(local)",
        }}
        toolEnabled
        cancelling={false}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.arp.nonPrivateScopeSkipped")).toBeInTheDocument()
    expect(screen.queryByText("Active probes skipped.")).not.toBeInTheDocument()
    expect(screen.queryByText("arp-cache")).not.toBeInTheDocument()
    expect(
      screen.getByText("169.254.1.2 · 00:11:22:33:44:66 · networkProbe.arp.source.cache"),
    ).toBeInTheDocument()
    expect(screen.getByText("scanLan(local)").closest("details")).not.toHaveAttribute("open")
  })

  it("explains that a private /32 host route has no peers to probe", () => {
    render(
      <ArpPanel
        loading={false}
        result={{
          mode: "arp-cache",
          neighbors: [],
          message: "The selected /32 host route has no other IPv4 addresses to probe.",
          emptyReason: "no-peers",
          cidr: "192.168.0.4/32",
          cancelled: false,
          sessionId: "session-host-route",
          elapsedMs: 1,
          commandHint: "scanLan(local)",
        }}
        toolEnabled
        cancelling={false}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.arp.noPeers")).toBeInTheDocument()
    expect(
      screen.queryByText("The selected /32 host route has no other IPv4 addresses to probe."),
    ).not.toBeInTheDocument()
  })

  it("offers the Local Network privacy settings when TCP probes are denied", () => {
    const onOpenPrivacySettings = vi.fn()

    render(
      <ArpPanel
        loading={false}
        result={{
          mode: "arp-cache+tcp-sweep",
          neighbors: [],
          message: "Local Network access was denied.",
          emptyReason: "permission",
          cidr: "192.168.0.0/24",
          cancelled: false,
          sessionId: "session-3",
          elapsedMs: 1,
          commandHint: "scanLan(local)",
        }}
        toolEnabled
        cancelling={false}
        onRun={vi.fn()}
        onOpenPrivacySettings={onOpenPrivacySettings}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.ping.openPrivacySettings" }))

    expect(onOpenPrivacySettings).toHaveBeenCalledOnce()
  })

  it("marks partial neighbor results as cancelled", () => {
    render(
      <ArpPanel
        loading={false}
        result={{
          mode: "arp-cache+tcp-sweep",
          neighbors: [{ ip: "192.168.0.1", mac: "00:11:22:33:44:55", source: "arp-cache" }],
          cidr: "192.168.0.0/24",
          cancelled: true,
          sessionId: "session-cancelled-partial",
          elapsedMs: 1,
          commandHint: "scanLan(local)",
        }}
        toolEnabled
        cancelling={false}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.arp.cancelled")).toBeInTheDocument()
    expect(
      screen.getByText("192.168.0.1 · 00:11:22:33:44:55 · networkProbe.arp.source.cache"),
    ).toBeInTheDocument()
  })
})
