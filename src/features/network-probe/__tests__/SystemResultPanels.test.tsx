import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LanServicesPanel } from "@/features/network-probe/components/LanServicesPanel"
import { MtuPanel } from "@/features/network-probe/components/MtuPanel"
import { NtpPanel } from "@/features/network-probe/components/NtpPanel"
import { PcapDiagPanel } from "@/features/network-probe/components/PcapDiagPanel"
import { TraceroutePanel } from "@/features/network-probe/components/TraceroutePanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "networkProbe.traceroute.meta") {
        return `${key} ${String(options?.mode ?? "")}`
      }
      if (key === "networkProbe.ntp.offset") {
        return `${key} ${String(options?.seconds ?? "")} ${String(options?.severity ?? "")}`
      }
      if (key === "networkProbe.lanSvc.protocolError") {
        return `${key} ${String(options?.protocol ?? "")}`
      }
      if (key === "networkProbe.lanSvc.meta") {
        return `${key} ${String(options?.count ?? "")}`
      }
      if (key === "networkProbe.lanSvc.progressMdns") {
        return `${key} ${String(options?.count ?? "")}`
      }
      return key
    },
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

describe("network-probe system result panels", () => {
  it("disables MTU inputs when the platform capability is unsupported", () => {
    render(
      <MtuPanel
        loading={false}
        result={null}
        toolEnabled={false}
        toolStatus="unsupported"
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByRole("textbox", { name: "networkProbe.mtu.target" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.mtu.run" })).toBeDisabled()
    expect(screen.getByText("networkProbe.caps.toolDisabled")).toBeInTheDocument()
  })

  it("offers configured MTU targets as presets while keeping the target editable", () => {
    render(
      <MtuPanel
        loading={false}
        result={null}
        toolEnabled
        mtuTargets={[
          { id: "mtu-gateway", target: "gateway" },
          { id: "mtu-custom", target: "192.0.2.15" },
        ]}
        onRun={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole("combobox", { name: "networkProbe.mtu.preset" }), {
      target: { value: "mtu-custom" },
    })
    expect(screen.getByRole("textbox", { name: "networkProbe.mtu.target" })).toHaveValue(
      "192.0.2.15",
    )
    fireEvent.change(screen.getByRole("textbox", { name: "networkProbe.mtu.target" }), {
      target: { value: "198.51.100.7" },
    })
    expect(screen.getByRole("combobox", { name: "networkProbe.mtu.preset" })).toHaveValue("")
  })

  it("replaces raw unsupported MTU details with localized copy", () => {
    render(
      <MtuPanel
        loading={false}
        result={{
          target: "1.1.1.1",
          resolvedIp: "",
          status: "unsupported",
          method: "none",
          steps: [],
          message: "MTU quick probe is only implemented on macOS for MVP",
          elapsedMs: 0,
          commandHint: "probePathMtu(local)",
        }}
        toolEnabled={false}
        toolStatus="unsupported"
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.mtu.unsupportedMessage")).toBeInTheDocument()
    expect(
      screen.queryByText("MTU quick probe is only implemented on macOS for MVP"),
    ).not.toBeInTheDocument()
  })

  it("localizes unavailable traceroute state and hides backend detail", () => {
    const systemMessage = "Traceroute unavailable. Permission denied (raw OS detail)."

    render(
      <TraceroutePanel
        loading={false}
        canCancel={false}
        cancelling={false}
        result={{
          target: "1.1.1.1",
          resolvedIp: "1.1.1.1",
          privilegeMode: "unavailable",
          hops: [],
          rounds: 0,
          elapsedMs: 12,
          message: systemMessage,
          sessionId: "traceroute-1",
          cancelled: false,
          commandHint: "startTraceroute()",
        }}
        streamingHops={[]}
        toolEnabled
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.traceroute.unavailableResult")
    expect(screen.queryByText("networkProbe.traceroute.empty")).not.toBeInTheDocument()
    expect(screen.getByText(/networkProbe\.traceroute\.meta/)).toHaveTextContent(
      "networkProbe.traceroute.mode.unavailable",
    )
    expect(screen.queryByText("unavailable")).not.toBeInTheDocument()
    expect(screen.getByText(systemMessage).closest("details")).not.toHaveAttribute("open")
  })

  it("falls back to a localized traceroute mode for unknown values", () => {
    render(
      <TraceroutePanel
        loading={false}
        canCancel={false}
        cancelling={false}
        result={{
          target: "1.1.1.1",
          resolvedIp: "1.1.1.1",
          privilegeMode: "future-mode",
          hops: [],
          rounds: 3,
          elapsedMs: 12,
          sessionId: "traceroute-2",
          cancelled: false,
          commandHint: "startTraceroute()",
        }}
        streamingHops={[]}
        toolEnabled
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText(/networkProbe\.traceroute\.meta/)).toHaveTextContent(
      "networkProbe.traceroute.mode.unknown",
    )
    expect(screen.getByText("networkProbe.traceroute.noHopsResult")).toBeInTheDocument()
    expect(screen.queryByText("future-mode")).not.toBeInTheDocument()
    expect(screen.queryByText("networkProbe.traceroute.empty")).not.toBeInTheDocument()
  })

  it("localizes NTP severity and keeps raw per-server results collapsed", () => {
    const systemMessage = "time.cloudflare.com fail: timed out (os error 60)"

    render(
      <NtpPanel
        loading={false}
        result={{
          server: "time.cloudflare.com:123",
          ok: true,
          offsetSeconds: 0.725,
          rttSeconds: 0.04,
          severity: "warn",
          detail: systemMessage,
          elapsedMs: 38,
          commandHint: "probeNtp(local)",
        }}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText(/networkProbe\.ntp\.offset/)).toHaveTextContent(
      "networkProbe.ntp.severity.warn",
    )
    expect(screen.queryByText("warn")).not.toBeInTheDocument()
    expect(screen.getByText(systemMessage).closest("details")).not.toHaveAttribute("open")
    fireEvent.click(screen.getByText("networkProbe.systemDetail"))
    expect(screen.getByText(systemMessage).closest("details")).toHaveAttribute("open")
  })

  it("does not treat a failed NTP result as an offset even if it contains a value", () => {
    render(
      <NtpPanel
        loading={false}
        result={{
          server: "time.cloudflare.com:123",
          ok: false,
          offsetSeconds: 0.1,
          rttSeconds: undefined,
          severity: "fail",
          detail: "NTP request failed",
          elapsedMs: 38,
          commandHint: "probeNtp(local)",
        }}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.ntp.fail")).toBeInTheDocument()
    expect(screen.queryByText(/networkProbe\.ntp\.offset/)).not.toBeInTheDocument()
  })

  it("uses localized fallback for unknown NTP severity", () => {
    render(
      <NtpPanel
        loading={false}
        result={{
          server: "time.cloudflare.com:123",
          ok: true,
          offsetSeconds: 0.1,
          rttSeconds: 0.02,
          severity: "future-severity",
          detail: undefined,
          elapsedMs: 38,
          commandHint: "probeNtp(local)",
        }}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText(/networkProbe\.ntp\.offset/)).toHaveTextContent(
      "networkProbe.ntp.severity.unknown",
    )
    expect(screen.queryByText("future-severity")).not.toBeInTheDocument()
  })

  it("localizes LAN protocol errors and collapses raw network details", () => {
    const systemMessage = "Permission denied while binding 0.0.0.0:5353"

    render(
      <LanServicesPanel
        loading={false}
        result={{
          items: [
            {
              protocol: "mdns",
              name: "(mDNS error)",
              serviceType: undefined,
              host: undefined,
              port: undefined,
              detail: systemMessage,
            },
          ],
          cancelled: false,
          sessionId: "lan-services-session",
          message: "Read-only discovery. No UPnP Write / AddPortMapping actions are exposed.",
          elapsedMs: 20,
          commandHint: "browseLanServices(local)",
        }}
        progress={null}
        toolEnabled
        canCancel={false}
        cancelling={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(
      "networkProbe.lanSvc.protocolError networkProbe.lanSvc.protocol.mdns",
    )
    expect(
      screen.getByRole("list", { name: "networkProbe.lanSvc.resultsLabel" }),
    ).toBeInTheDocument()
    expect(screen.queryByText("(mDNS error)")).not.toBeInTheDocument()
    expect(screen.getByText("networkProbe.lanSvc.meta 0")).toBeInTheDocument()
    expect(screen.getByText(systemMessage).closest("details")).not.toHaveAttribute("open")
    expect(
      screen.queryByText(
        "Read-only discovery. No UPnP Write / AddPortMapping actions are exposed.",
      ),
    ).not.toBeInTheDocument()
  })

  it("shows cancellable LAN service progress and keeps an empty cancelled result distinct", () => {
    const onCancel = vi.fn()
    const { rerender } = render(
      <LanServicesPanel
        loading
        progress={{
          sessionId: "lan-services-session",
          phase: "mdns",
          discoveredServices: 2,
        }}
        result={null}
        toolEnabled
        canCancel
        cancelling={false}
        onRun={vi.fn()}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.lanSvc.progressMdns 2")
    expect(screen.getByRole("button", { name: "networkProbe.lanSvc.cancel" })).toBeEnabled()

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.lanSvc.cancel" }))
    expect(onCancel).toHaveBeenCalledOnce()

    rerender(
      <LanServicesPanel
        loading={false}
        progress={null}
        result={{
          items: [],
          cancelled: true,
          sessionId: "lan-services-session",
          elapsedMs: 80,
          commandHint: "browseLanServices(local)",
        }}
        toolEnabled
        canCancel={false}
        cancelling={false}
        onRun={vi.fn()}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByText("networkProbe.lanSvc.cancelled")).toBeInTheDocument()
    expect(screen.queryByText("networkProbe.lanSvc.empty")).not.toBeInTheDocument()
  })

  it("localizes packet diagnostic modes and hides raw capture messages", () => {
    const systemMessage = "tcpdump unavailable or not permitted: operation not permitted"

    render(
      <PcapDiagPanel
        loading={false}
        result={{
          mode: "unavailable",
          packets: 0,
          tcpRst: 0,
          retransHint: 0,
          outOfOrderHint: 0,
          cancelled: false,
          sessionId: "pcap-1",
          message: systemMessage,
          elapsedMs: 20,
          commandHint: "startPacketCapture(local)",
        }}
        toolEnabled
        canCancel={false}
        cancelling={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.pcap.modeValue.unavailable")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.pcap.resultStatus.unavailable")).toBeInTheDocument()
    expect(screen.queryByText("unavailable")).not.toBeInTheDocument()
    expect(screen.getByText(systemMessage).closest("details")).not.toHaveAttribute("open")
  })

  it("gives a cancelled packet sample the localized cancelled status", () => {
    render(
      <PcapDiagPanel
        loading={false}
        result={{
          mode: "unavailable",
          packets: 0,
          tcpRst: 0,
          retransHint: 0,
          outOfOrderHint: 0,
          cancelled: true,
          sessionId: "pcap-cancelled",
          message: "Capture cancelled.",
          elapsedMs: 160,
          commandHint: "startPacketCapture(local)",
        }}
        toolEnabled
        canCancel={false}
        cancelling={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.pcap.resultStatus.cancelled")).toBeInTheDocument()
    expect(screen.queryByText("networkProbe.pcap.resultStatus.unavailable")).not.toBeInTheDocument()
  })
})
