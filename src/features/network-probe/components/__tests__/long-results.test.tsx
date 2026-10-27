import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ArpPanel } from "@/features/network-probe/components/ArpPanel"
import { LanServicesPanel } from "@/features/network-probe/components/LanServicesPanel"
import { PortScanPanel } from "@/features/network-probe/components/PortScanPanel"
import { TraceroutePanel } from "@/features/network-probe/components/TraceroutePanel"
import type {
  ArpNeighbor,
  LanServiceItem,
  PortSampleEvent,
  TracerouteHop,
} from "@/lib/tauri/types/network-probe"

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 320,
  })
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 800,
  })
})

afterEach(() => {
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight")
  }
  if (originalOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth")
  }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children, hint }: { children: ReactNode; hint?: string }) => (
    <span data-command-hint={hint}>{children}</span>
  ),
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: ({
    open,
    title,
    description,
    consequence,
    confirmLabel,
    onConfirm,
  }: {
    open: boolean
    title: string
    description: string
    consequence: string
    confirmLabel: string
    onConfirm: () => void
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <p>{description}</p>
        <p>{consequence}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

function portSample(port: number): PortSampleEvent {
  return { port, state: "open", serviceHint: "HTTP", rttMs: 1.2 }
}

function hop(ttl: number): TracerouteHop {
  return {
    ttl,
    addrs: [`192.0.2.${(ttl % 254) + 1}`],
    lossPercent: 0,
    avgRttMs: 1.2,
    bestRttMs: 1,
    worstRttMs: 1.5,
    sent: 3,
    recv: 3,
  }
}

function neighbor(index: number): ArpNeighbor {
  return {
    ip: `192.168.1.${index + 1}`,
    mac: index === 0 ? undefined : `00:00:00:00:00:${index.toString(16).padStart(2, "0")}`,
    iface: "en0",
    source: "arp-cache",
  }
}

function service(index: number): LanServiceItem {
  return {
    protocol: "mDNS",
    name: `device-${index}`,
    serviceType: "_http._tcp",
    host: `192.168.1.${(index % 254) + 1}`,
    port: 80,
    detail: "fixture",
  }
}

describe("network-probe long result lists", () => {
  it("shows a localized cancellation state instead of raw backend text", () => {
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={{
          target: "127.0.0.1",
          mode: "cancelled",
          openPorts: [],
          samples: [],
          cancelled: true,
          sessionId: "ports-cancelled",
          message: "Port scan cancelled.",
          commandHint: "scanPorts()",
        }}
        streaming={[]}
        toolEnabled
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.ports.cancelled")).toBeInTheDocument()
    expect(screen.queryByText("Port scan cancelled.")).toBeNull()
  })

  it("shows the nmap capability and result instead of the degraded TCP hint", () => {
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={{
          target: "127.0.0.1",
          mode: "nmap-syn-or-connect",
          openPorts: [80],
          samples: [portSample(80)],
          cancelled: false,
          sessionId: "ports-nmap",
          message: "nmap present: used -sS when permitted, otherwise -sT.",
          commandHint: "scanPorts()",
        }}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.ports.nmapHint")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.ports.nmapResult")).toBeInTheDocument()
    expect(screen.queryByText("networkProbe.ports.degradedHint")).toBeNull()
    expect(screen.queryByText(/nmap present:/)).toBeNull()
  })

  it("keeps service and OS fingerprinting opt-in and passes the choice to the scan", () => {
    const onRun = vi.fn()
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        fingerprintStatus="supported"
        onRun={onRun}
        onCancel={vi.fn()}
      />,
    )

    const fingerprint = screen.getByLabelText("networkProbe.ports.fingerprint")
    const runButton = screen.getByText("networkProbe.ports.run")
    expect(runButton.parentElement).toHaveAttribute(
      "data-command-hint",
      expect.stringContaining("scanPortsNmap"),
    )
    expect(fingerprint).not.toBeChecked()
    fireEvent.click(fingerprint)
    expect(runButton.parentElement).toHaveAttribute(
      "data-command-hint",
      expect.stringContaining("scanPortsFingerprint"),
    )
    fireEvent.click(runButton)

    expect(onRun).toHaveBeenCalledWith("127.0.0.1", "22,80,443,8080", true, false)
  })

  it("does not use a stale fingerprint selection when nmap becomes unavailable", () => {
    const onRun = vi.fn()
    const props = {
      loading: false,
      canCancel: false,
      result: null,
      streaming: [],
      toolEnabled: true,
      toolStatus: "supported",
      onRun,
      onCancel: vi.fn(),
    }
    const { rerender } = render(<PortScanPanel {...props} fingerprintStatus="supported" />)
    const fingerprint = screen.getByLabelText("networkProbe.ports.fingerprint")
    fireEvent.click(fingerprint)
    expect(fingerprint).toBeChecked()

    rerender(<PortScanPanel {...props} fingerprintStatus="missing_pack" />)

    expect(fingerprint).toBeDisabled()
    expect(fingerprint).not.toBeChecked()
    expect(screen.getByText("networkProbe.ports.run").parentElement).toHaveAttribute(
      "data-command-hint",
      expect.stringContaining("scanPortsNmap"),
    )
    fireEvent.click(screen.getByText("networkProbe.ports.run"))
    expect(onRun).toHaveBeenCalledWith("127.0.0.1", "22,80,443,8080", false, false)
  })

  it("shows the exact range, scan rate and duration before a high-risk scan", () => {
    const onRun = vi.fn()
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        onRun={onRun}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText("networkProbe.ports.target"), {
      target: { value: "example.com" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.ports.range"), {
      target: { value: "22-100" },
    })
    fireEvent.click(screen.getByText("networkProbe.ports.run"))

    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveTextContent(
      'networkProbe.ports.confirmDesc {"target":"example.com","ports":"22-100","count":79}',
    )
    expect(dialog).toHaveTextContent("networkProbe.ports.confirmNmapPacing")
    expect(dialog).toHaveTextContent("networkProbe.ports.confirmNmapDuration")
    expect(onRun).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText("networkProbe.ports.confirmRun"))
    expect(onRun).toHaveBeenCalledWith("example.com", "22-100", false, true)
  })

  it("shows the de-duplicated port count in the high-risk confirmation", () => {
    const onRun = vi.fn()
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        onRun={onRun}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText("networkProbe.ports.target"), {
      target: { value: "example.com" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.ports.range"), {
      target: { value: "22,22,80-81,81" },
    })
    fireEvent.click(screen.getByText("networkProbe.ports.run"))

    expect(screen.getByRole("dialog")).toHaveTextContent(
      'networkProbe.ports.confirmDesc {"target":"example.com","ports":"22,22,80-81,81","count":3}',
    )
    expect(onRun).not.toHaveBeenCalled()
  })

  it("does not require confirmation when duplicate entries collapse below the 64-port limit", () => {
    const onRun = vi.fn()
    const repeatedPortRange = Array.from({ length: 65 }, () => "80").join(",")
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        onRun={onRun}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText("networkProbe.ports.range"), {
      target: { value: repeatedPortRange },
    })
    fireEvent.click(screen.getByText("networkProbe.ports.run"))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(onRun).toHaveBeenCalledWith("127.0.0.1", repeatedPortRange, false, false)
  })

  it("does not show a port count or duration estimate for invalid input", () => {
    const onRun = vi.fn()
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        onRun={onRun}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText("networkProbe.ports.target"), {
      target: { value: "example.com" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.ports.range"), {
      target: { value: "22-100-200" },
    })
    fireEvent.click(screen.getByText("networkProbe.ports.run"))

    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveTextContent("networkProbe.ports.confirmCountUnknown")
    expect(dialog).not.toHaveTextContent("networkProbe.ports.confirmNmapDuration")
    expect(onRun).not.toHaveBeenCalled()
  })

  it("sends CIDR targets directly for localized rejection without a risk confirmation", () => {
    const onRun = vi.fn()
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        onRun={onRun}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText("networkProbe.ports.target"), {
      target: { value: "192.168.0.0/24" },
    })
    fireEvent.click(screen.getByText("networkProbe.ports.run"))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(onRun).toHaveBeenCalledWith("192.168.0.0/24", "22,80,443,8080", false, false)
  })

  it("does not treat malformed IPv4 octets as a private target", () => {
    const onRun = vi.fn()
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        onRun={onRun}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText("networkProbe.ports.target"), {
      target: { value: "10.999.1.1" },
    })
    fireEvent.click(screen.getByText("networkProbe.ports.run"))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(onRun).not.toHaveBeenCalled()
  })

  it("does not treat non-canonical IPv4 with leading zeroes as a private target", () => {
    const onRun = vi.fn()
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        onRun={onRun}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText("networkProbe.ports.target"), {
      target: { value: "010.0.0.1" },
    })
    fireEvent.click(screen.getByText("networkProbe.ports.run"))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(onRun).not.toHaveBeenCalled()
  })

  it("keeps localhost on the direct local scan path", () => {
    const onRun = vi.fn()
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        onRun={onRun}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText("networkProbe.ports.target"), {
      target: { value: "LOCALHOST" },
    })
    fireEvent.click(screen.getByText("networkProbe.ports.run"))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(onRun).toHaveBeenCalledWith("LOCALHOST", "22,80,443,8080", false, false)
  })

  it.each([
    ["fd00::1", false],
    ["fe80::1", false],
    ["2001:4860:4860::8888", true],
    ["::ffff:127.0.0.1", true],
    ["010.0.0.1", true],
  ] as const)("aligns scan confirmation for address %s", (target, requiresConfirmation) => {
    const onRun = vi.fn()
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        onRun={onRun}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText("networkProbe.ports.target"), {
      target: { value: target },
    })
    fireEvent.click(screen.getByText("networkProbe.ports.run"))

    if (requiresConfirmation) {
      expect(screen.getByRole("dialog")).toBeInTheDocument()
      expect(onRun).not.toHaveBeenCalled()
      return
    }

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(onRun).toHaveBeenCalledWith(target, "22,80,443,8080", false, false)
  })

  it("clarifies that fingerprint probes have timing outside the port scan interval", () => {
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        fingerprintStatus="supported"
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText("networkProbe.ports.target"), {
      target: { value: "example.com" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.ports.range"), {
      target: { value: "22-100" },
    })
    fireEvent.click(screen.getByLabelText("networkProbe.ports.fingerprint"))
    fireEvent.click(screen.getByText("networkProbe.ports.run"))

    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveTextContent("networkProbe.ports.confirmNmapPacing")
    expect(dialog).toHaveTextContent("networkProbe.ports.confirmFingerprintConsequence")
    expect(dialog).toHaveTextContent('"intervalMs":50')
  })

  it("renders OS confidence, service metadata and exposure categories", () => {
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={{
          target: "127.0.0.1",
          mode: "nmap-fingerprint-syn-or-connect",
          openPorts: [22],
          samples: [portSample(22)],
          fingerprint: {
            services: [
              {
                port: 22,
                serviceName: "ssh",
                product: "OpenSSH",
                version: "9.9",
                confidence: 98,
                riskTags: ["remote_admin"],
              },
            ],
            osMatches: [{ name: "Linux 6.x", accuracy: 94 }],
          },
          cancelled: false,
          sessionId: "ports-fingerprint",
          commandHint: "scanPorts()",
        }}
        streaming={[]}
        toolEnabled
        fingerprintStatus="supported"
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.ports.fingerprintResult")).toBeInTheDocument()
    expect(screen.getByText(/Linux 6\.x \(94%\)/)).toBeInTheDocument()
    expect(screen.getByText(/OpenSSH 9\.9/)).toBeInTheDocument()
    expect(
      screen.getByTitle("ssh OpenSSH 9.9 · networkProbe.ports.riskTags.remoteAdmin"),
    ).toBeInTheDocument()
    expect(screen.getByText("networkProbe.ports.riskDisclaimer")).toBeInTheDocument()
  })

  it("explains when fingerprinting found neither services nor OS matches", () => {
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={{
          target: "127.0.0.1",
          mode: "nmap-fingerprint-syn-or-connect",
          openPorts: [],
          samples: [],
          fingerprint: { services: [], osMatches: [] },
          cancelled: false,
          sessionId: "ports-fingerprint-empty",
          commandHint: "scanPorts()",
        }}
        streaming={[]}
        toolEnabled
        fingerprintStatus="supported"
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.ports.fingerprintNoMatches")).toBeInTheDocument()
    expect(screen.queryByText("networkProbe.ports.osUnavailable")).toBeNull()
  })

  it("disables fingerprinting when nmap capability is unavailable", () => {
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        fingerprintStatus="missing_pack"
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByLabelText("networkProbe.ports.fingerprint")).toBeDisabled()
    expect(screen.getByText("networkProbe.ports.fingerprintUnavailable")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.ports.run").parentElement).toHaveAttribute(
      "data-command-hint",
      expect.stringContaining("scanPortsTcp"),
    )
  })

  it("renders short result lists in full without a virtual scroll region", () => {
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[
          portSample(80),
          { ...portSample(443), state: "closed" },
          { ...portSample(8080), state: "filtered" },
          { ...portSample(8443), state: "error" },
          { ...portSample(9000), state: "future-state" },
        ]}
        toolEnabled
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const list = document.querySelector('[data-network-probe-list="port-samples"]')
    expect(list).toHaveAttribute("data-virtualized", "false")
    expect(list).toHaveAttribute("data-total-count", "5")
    expect(list?.querySelectorAll("li")).toHaveLength(5)
    expect(screen.getByText("networkProbe.ports.states.open")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.ports.states.closed")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.ports.states.filtered")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.ports.states.error")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.ports.states.unknown")).toBeInTheDocument()
  })

  it("bounds large port scans, localizes states, and caps the open-port summary", async () => {
    const samples = Array.from({ length: 256 }, (_, index) => portSample(index + 1))
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={{
          target: "127.0.0.1",
          mode: "tcp-connect",
          openPorts: samples.map((sample) => sample.port),
          samples,
          cancelled: false,
          sessionId: "ports-large",
          commandHint: "scanPorts()",
        }}
        streaming={[]}
        toolEnabled
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const list = document.querySelector('[data-network-probe-list="port-samples"]')
    expect(list).toHaveAttribute("data-virtualized", "true")
    expect(list).toHaveAttribute("data-total-count", "256")
    expect(list?.querySelector('[role="presentation"]')).toBeInTheDocument()
    await waitFor(() => {
      const renderedItems = list?.querySelectorAll('[role="listitem"]').length ?? 0
      expect(renderedItems).toBeGreaterThan(0)
      expect(renderedItems).toBeLessThan(50)
    })
    expect(screen.getAllByText("networkProbe.ports.states.open").length).toBeGreaterThan(0)
    expect(screen.getByText(/networkProbe\.ports\.openListMore/)).toHaveTextContent('"count":240')
    const openSummary = screen.getByText(/networkProbe\.ports\.openList \{/)
    expect(openSummary).toHaveTextContent(
      '"ports":"1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16"',
    )
    expect(openSummary).not.toHaveTextContent("17")
  })

  it("virtualizes traceroute rows while preserving table semantics and row counts", async () => {
    const hops = Array.from({ length: 255 }, (_, index) => hop(index + 1))
    render(
      <TraceroutePanel
        loading={false}
        canCancel={false}
        result={{
          target: "1.1.1.1",
          resolvedIp: "1.1.1.1",
          privilegeMode: "unprivileged",
          hops,
          rounds: 3,
          elapsedMs: 250,
          sessionId: "trace-large",
          cancelled: false,
          commandHint: "traceroute()",
        }}
        streamingHops={[]}
        toolEnabled
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const scroll = document.querySelector("[data-traceroute-hop-list]")
    expect(scroll).toHaveAttribute("data-virtualized", "true")
    expect(scroll).toHaveAttribute("data-total-count", "255")
    expect(
      screen.getByRole("table", { name: "networkProbe.traceroute.hopsLabel" }),
    ).toHaveAttribute("aria-rowcount", "256")
    await waitFor(() => {
      expect(scroll?.querySelectorAll('[role="row"]').length).toBeLessThan(50)
    })
  })

  it("virtualizes discovered-device and LAN-service results", async () => {
    const neighbors = Array.from({ length: 120 }, (_, index) => neighbor(index))
    const { container, rerender } = render(
      <ArpPanel
        loading={false}
        result={{
          mode: "degraded",
          neighbors,
          cancelled: false,
          sessionId: "arp-large",
          elapsedMs: 12,
          commandHint: "scanLan()",
        }}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    const deviceList = container.querySelector('[data-network-probe-list="arp-neighbors"]')
    expect(deviceList).toHaveAttribute("data-virtualized", "true")
    expect(deviceList).toHaveAttribute("data-total-count", "120")
    expect(deviceList?.querySelectorAll('[role="listitem"]').length).toBeLessThan(50)
    expect(screen.getByText(/networkProbe\.arp\.incomplete/)).toBeInTheDocument()

    const services = Array.from({ length: 96 }, (_, index) => service(index))
    rerender(
      <LanServicesPanel
        loading={false}
        result={{ items: services, elapsedMs: 18, commandHint: "browseLanServices()" }}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    await waitFor(() => {
      const serviceList = container.querySelector('[data-network-probe-list="lan-services"]')
      expect(serviceList).toHaveAttribute("data-virtualized", "true")
      expect(serviceList).toHaveAttribute("data-total-count", "96")
      expect(serviceList?.querySelectorAll('[role="listitem"]').length).toBeLessThan(50)
    })
  })
})
