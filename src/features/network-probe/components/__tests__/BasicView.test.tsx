import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BasicView } from "@/features/network-probe/components/BasicView"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/ScrollableArea", () => ({
  ScrollableArea: ({ children }: { children: ReactNode }) => (
    <div data-testid="basic-scroll-area">{children}</div>
  ),
}))

vi.mock("@/features/network-probe/components/OverviewPanel", () => ({
  OverviewPanel: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="overview-panel" data-embedded={String(embedded)} />
  ),
}))
vi.mock("@/features/network-probe/components/HealthTreePanel", () => ({
  HealthTreePanel: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="health-panel" data-embedded={String(embedded)} />
  ),
}))
vi.mock("@/features/network-probe/components/ScanOpinionPanel", () => ({
  ScanOpinionPanel: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="opinion-panel" data-embedded={String(embedded)} />
  ),
}))
vi.mock("@/features/network-probe/components/OfflinePanel", () => ({
  OfflinePanel: () => <div data-testid="offline-panel" />,
}))
vi.mock("@/features/network-probe/components/FixPanel", () => ({
  FixPanel: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="fix-panel" data-embedded={String(embedded)} />
  ),
}))
vi.mock("@/features/network-probe/components/ReportPanel", () => ({
  ReportPanel: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="report-panel" data-embedded={String(embedded)} />
  ),
}))
vi.mock("@/features/network-probe/components/Ipv6Panel", () => ({
  Ipv6Panel: ({ dualFrom }: { dualFrom?: string }) => (
    <div data-testid="ipv6-panel" data-embedded={String(dualFrom === "offline")} />
  ),
}))
vi.mock("@/features/network-probe/components/MtuPanel", () => ({
  MtuPanel: ({ dualFrom }: { dualFrom?: string }) => (
    <div data-testid="mtu-panel" data-embedded={String(dualFrom === "offline")} />
  ),
}))
vi.mock("@/features/network-probe/components/EgressPanel", () => ({
  EgressPanel: ({ dualFrom }: { dualFrom?: string }) => (
    <div data-testid="egress-panel" data-embedded={String(dualFrom === "offline")} />
  ),
}))

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
const scrollIntoView = vi.fn()

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  })
})

afterEach(() => {
  scrollIntoView.mockClear()
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView,
    })
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
  }
})

function renderBasicView(
  focus: ComponentProps<typeof BasicView>["offline"]["focus"] = "all",
  onSelectFocus = vi.fn(),
) {
  const props: ComponentProps<typeof BasicView> = {
    overview: {
      loading: true,
      summary: null,
      firewall: null,
      errors: {},
      hostsSuspiciousCount: 0,
      onRefresh: vi.fn(),
      onOpenSettings: vi.fn(),
    },
    health: {
      loading: false,
      result: null,
      streamingItems: [],
      canCancel: false,
      cancelling: false,
      onRun: vi.fn(),
      onCancel: vi.fn(),
    },
    offline: {
      loading: false,
      loadingIpv6: false,
      loadingMtu: false,
      loadingEgress: false,
      focus,
      errors: {},
      captive: null,
      publicIp: null,
      proxyVpn: null,
      ipv6: null,
      mtu: null,
      onRunAll: vi.fn(),
      onSelectFocus,
      onCheckIpv6: vi.fn(),
      onProbeMtu: vi.fn(),
      onRefreshEgress: vi.fn(),
      onOpenMtu: vi.fn(),
      busy: false,
    },
    fix: {
      loading: false,
      services: [],
      servicesStatus: "ready",
      dnsPresets: [],
      lastResult: null,
      onLoadServices: vi.fn(),
      onFlushDns: vi.fn(),
      onSwitchDns: vi.fn(),
      onRenewDhcp: vi.fn(),
      onResetNetworkStack: vi.fn(),
      onOpenSettings: vi.fn(),
    },
    report: {
      health: null,
      history: [],
      commandLog: [],
      onClearLog: vi.fn(),
      onClearHistory: vi.fn(),
    },
  }
  return render(<BasicView {...props} />)
}

describe("BasicView", () => {
  it("renders the six basic sections in one page without nested scrollers", () => {
    renderBasicView()

    for (const section of ["overview", "tree", "opinion", "offline", "fix", "report"]) {
      expect(
        screen.getByRole("heading", { name: `networkProbe.l2.${section}` }),
      ).toBeInTheDocument()
    }
    expect(screen.getAllByTestId("basic-scroll-area")).toHaveLength(1)
    expect(screen.getByTestId("overview-panel")).toHaveAttribute("data-embedded", "true")
    expect(screen.getByTestId("health-panel")).toHaveAttribute("data-embedded", "true")
    expect(screen.getByTestId("opinion-panel")).toHaveAttribute("data-embedded", "true")
    expect(screen.getByTestId("fix-panel")).toHaveAttribute("data-embedded", "true")
    expect(screen.getByTestId("report-panel")).toHaveAttribute("data-embedded", "true")
    expect(screen.getByTestId("ipv6-panel")).toHaveAttribute("data-embedded", "true")
    expect(screen.getByTestId("mtu-panel")).toHaveAttribute("data-embedded", "true")
  })

  it("jumps to a section and keeps the offline focus control stateful", () => {
    const onSelectFocus = vi.fn()
    renderBasicView("all", onSelectFocus)

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.l2.tree" }))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" })

    const ipv6Button = screen.getByRole("button", {
      name: "networkProbe.offline.sub.ipv6",
    })
    fireEvent.click(ipv6Button)
    expect(onSelectFocus).toHaveBeenCalledWith("ipv6")
  })
})
