import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OfflinePanel } from "@/features/network-probe/components/OfflinePanel"
import type {
  CaptivePortalResult,
  Ipv6StackResult,
  PathMtuResult,
  ProxyVpnStatus,
} from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      key.endsWith(".future-status") ? (options?.defaultValue ?? key) : key,
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

const captive: CaptivePortalResult = {
  status: "captive",
  detail: "apple: redirect status=302 final=http://portal.example.test/login",
  commandHint: "detectCaptivePortal(local)",
}

const proxyVpn: ProxyVpnStatus = {
  proxyEnabled: true,
  proxyDetail: "HTTP proxy settings returned an OS-specific diagnostic",
  vpnIfaces: ["utun4"],
  defaultViaTunnel: true,
  commandHint: "getProxyVpnStatus(local)",
}

const ipv6: Ipv6StackResult = {
  status: "partial",
  linkLocal: [],
  uniqueLocal: [],
  global: [],
  aaaaOk: false,
  aaaaAddrs: [],
  dualStack: {
    ipv4Ok: true,
    ipv6Ok: false,
    detail: "IPv4 OK, IPv6 ICMP failed — possible v6 path/filter issue",
  },
  ndpStatus: "skip",
  message: "Partial IPv6: some checks passed; see details",
  elapsedMs: 1,
  commandHint: "checkIpv6Stack(local)",
}

const mtu: PathMtuResult = {
  target: "1.1.1.1",
  resolvedIp: "1.1.1.1",
  status: "fail",
  method: "binary",
  steps: [],
  message: "Path MTU probe failed: permission denied",
  elapsedMs: 2,
  commandHint: "probePathMtu(local, '1.1.1.1')",
}

afterEach(() => cleanup())

function renderPanel(options: {
  focus?: "all" | "captive" | "proxy" | "ipv6" | "mtu" | "egress" | "diff"
  captive?: CaptivePortalResult | null
  proxyVpn?: ProxyVpnStatus | null
  ipv6?: Ipv6StackResult | null
  mtu?: PathMtuResult | null
}) {
  return render(
    <OfflinePanel
      loading={false}
      focus={options.focus ?? "all"}
      captive={options.captive ?? captive}
      publicIp={null}
      proxyVpn={options.proxyVpn ?? proxyVpn}
      ipv6={options.ipv6 ?? ipv6}
      mtu={options.mtu ?? mtu}
      onRunAll={vi.fn()}
      onOpenMtu={vi.fn()}
    />,
  )
}

describe("OfflinePanel technical details", () => {
  it("keeps raw diagnostics and commands folded while showing localized summaries", () => {
    renderPanel({})

    expect(screen.getByText("networkProbe.offline.captiveStatus.captive")).toBeTruthy()
    expect(screen.getByText("networkProbe.offline.proxyOn", { exact: false })).toBeTruthy()
    expect(screen.getByText("networkProbe.ipv6.statusValue.partial")).toBeTruthy()
    expect(screen.getByText("networkProbe.mtu.statusValue.fail")).toBeTruthy()
    expect(screen.getByText("utun4", { exact: false })).toBeTruthy()

    const details = screen.getAllByText("networkProbe.offline.technicalDetails")
    expect(details).toHaveLength(2)
    for (const summary of details) {
      expect(summary.closest("details")?.open).toBe(false)
    }

    const collapsedValues = [
      captive.detail!,
      captive.commandHint,
      proxyVpn.proxyDetail!,
      proxyVpn.commandHint,
    ]
    for (const value of collapsedValues) {
      const element = screen.getByText(value, { exact: false })
      expect(element.closest("details")?.open).toBe(false)
    }

    for (const value of [
      ipv6.message!,
      ipv6.dualStack.detail,
      ipv6.commandHint,
      mtu.message!,
      mtu.commandHint,
    ]) {
      expect(screen.queryByText(value, { exact: false })).toBeNull()
    }
  })

  it("falls back to localized unknown labels for unrecognized statuses", () => {
    renderPanel({
      focus: "all",
      captive: { ...captive, status: "future-status" },
      proxyVpn: null,
      ipv6: { ...ipv6, status: "future-status" },
      mtu: null,
    })

    expect(screen.getByText("networkProbe.offline.captiveStatus.unknown")).toBeTruthy()
    expect(screen.getByText("networkProbe.ipv6.statusValue.unknown")).toBeTruthy()
  })
})
