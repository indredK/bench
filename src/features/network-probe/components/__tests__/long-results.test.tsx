import { render, screen, waitFor } from "@testing-library/react"
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
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
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
  it("renders short result lists in full without a virtual scroll region", () => {
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[portSample(80), { ...portSample(443), state: "future-state" }]}
        toolEnabled
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const list = document.querySelector('[data-network-probe-list="port-samples"]')
    expect(list).toHaveAttribute("data-virtualized", "false")
    expect(list).toHaveAttribute("data-total-count", "2")
    expect(list?.querySelectorAll("li")).toHaveLength(2)
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
