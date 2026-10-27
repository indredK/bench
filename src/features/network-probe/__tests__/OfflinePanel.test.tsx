import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OfflinePanel } from "@/features/network-probe/components/OfflinePanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

function renderProxy(proxyStatusKnown: boolean) {
  render(
    <OfflinePanel
      loading={false}
      focus="proxy"
      captive={null}
      publicIp={null}
      proxyVpn={{
        proxyEnabled: false,
        proxyStatusKnown,
        proxyDetail: "proxy check detail",
        vpnInterfacesKnown: false,
        vpnIfaces: [],
        defaultRouteKnown: false,
        defaultViaTunnel: false,
        commandHint: "getProxyVpnStatus()",
      }}
      ipv6={null}
      mtu={null}
      mtuToolEnabled
      mtuToolStatus="supported"
      onRunAll={vi.fn()}
      onOpenMtu={vi.fn()}
    />,
  )
}

describe("OfflinePanel proxy status", () => {
  it("shows unknown when the system proxy query failed", () => {
    renderProxy(false)

    expect(
      screen.getByText("networkProbe.offline.proxyTitle").closest("section"),
    ).toHaveTextContent("networkProbe.offline.proxyUnknown")
    expect(screen.getByText("networkProbe.offline.proxyUnknownDetail")).toBeInTheDocument()
    expect(screen.getByText(/networkProbe\.offline\.vpnUnknown/)).toHaveTextContent(
      "networkProbe.offline.vpnUnknown",
    )
    expect(screen.getByText("networkProbe.offline.defaultRouteUnknown")).toBeInTheDocument()
    expect(screen.queryByText("networkProbe.offline.proxyOff")).not.toBeInTheDocument()
  })

  it("shows disabled only after a successful query confirms it", () => {
    renderProxy(true)

    expect(
      screen.getByText("networkProbe.offline.proxyTitle").closest("section"),
    ).toHaveTextContent("networkProbe.offline.proxyOff")
    expect(screen.queryByText("networkProbe.offline.proxyUnknown")).not.toBeInTheDocument()
  })
})

describe("OfflinePanel integrated summary", () => {
  it("leaves IPv6, MTU, and egress results to their actionable detail panels", () => {
    render(
      <OfflinePanel
        loading={false}
        focus="all"
        captive={null}
        publicIp={null}
        proxyVpn={null}
        ipv6={null}
        mtu={null}
        mtuToolEnabled
        compactSummary
        onRunAll={vi.fn()}
        onOpenMtu={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("heading", { name: "networkProbe.offline.captiveTitle", level: 4 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "networkProbe.offline.proxyTitle", level: 4 }),
    ).toBeInTheDocument()
    expect(screen.queryByText("networkProbe.offline.egressTitle")).not.toBeInTheDocument()
    expect(screen.queryByText("networkProbe.offline.ipv6Title")).not.toBeInTheDocument()
    expect(screen.queryByText("networkProbe.offline.mtuTitle")).not.toBeInTheDocument()
  })

  it("disables run-all while a standalone IPv6 or MTU check is active", () => {
    render(
      <OfflinePanel
        loading={false}
        disabled
        focus="all"
        captive={null}
        publicIp={null}
        proxyVpn={null}
        ipv6={null}
        mtu={null}
        mtuToolEnabled
        onRunAll={vi.fn()}
        onOpenMtu={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "networkProbe.offline.run" })).toBeDisabled()
  })
})

describe("OfflinePanel MTU capability", () => {
  it("disables the MTU action when the platform reports it unsupported", () => {
    render(
      <OfflinePanel
        loading={false}
        focus="mtu"
        captive={null}
        publicIp={null}
        proxyVpn={null}
        ipv6={null}
        mtu={null}
        mtuToolEnabled={false}
        mtuToolStatus="unsupported"
        onRunAll={vi.fn()}
        onOpenMtu={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "networkProbe.offline.openMtu" })).toBeDisabled()
    expect(screen.getByText("networkProbe.caps.toolDisabled")).toBeInTheDocument()
  })

  it("localizes unsupported MTU details instead of showing the backend message", () => {
    render(
      <OfflinePanel
        loading={false}
        focus="mtu"
        captive={null}
        publicIp={null}
        proxyVpn={null}
        ipv6={null}
        mtu={{
          target: "1.1.1.1",
          resolvedIp: "",
          status: "unsupported",
          method: "none",
          steps: [],
          message: "MTU quick probe is only implemented on macOS for MVP",
          elapsedMs: 0,
          commandHint: "probePathMtu(local)",
        }}
        mtuToolEnabled={false}
        mtuToolStatus="unsupported"
        onRunAll={vi.fn()}
        onOpenMtu={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.mtu.unsupportedMessage")).toBeInTheDocument()
    expect(
      screen.queryByText("MTU quick probe is only implemented on macOS for MVP"),
    ).not.toBeInTheDocument()
  })
})
