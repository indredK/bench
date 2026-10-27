import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const { t } = vi.hoisted(() => {
  const messages: Record<string, string> = {
    "networkProbe.fix.hint": "Privilege-free self-heal actions.",
    "networkProbe.fix.service": "Network service",
    "networkProbe.fix.loadingServices": "Loading network services…",
    "networkProbe.fix.noServices": "No network services found",
    "networkProbe.fix.dnsPreset": "DNS preset",
    "networkProbe.fix.flush": "Flush DNS",
    "networkProbe.fix.switchDns": "Switch DNS",
    "networkProbe.fix.renewDhcp": "Renew DHCP",
    "networkProbe.fix.resetStack": "Reset network stack",
    "networkProbe.fix.openSettings": "Open system network settings",
    "networkProbe.cmd.flushDns": "flushDns()",
    "networkProbe.cmd.switchDns": "switchDns({{service}}, {{servers}})",
    "networkProbe.cmd.renewDhcp": "renewDhcp({{service}})",
    "networkProbe.cmd.resetNetworkStack": "resetNetworkStack({{service}})",
  }
  return { t: (key: string) => messages[key] ?? key }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t }),
}))
vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <section>
      {toolbar}
      {children}
    </section>
  ),
}))
vi.mock("@/components/ui/button", () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))
vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
}))
vi.mock("@/components/common/TripleDestructiveConfirm", () => ({
  TripleDestructiveConfirm: () => null,
}))

import { FixPanel } from "@/features/network-probe/components/FixPanel"

afterEach(cleanup)

function createProps(services: string[], loadingServices = false) {
  return {
    loading: false,
    loadingServices,
    services,
    dnsPresets: [],
    lastResult: null,
    onLoadServices: vi.fn(),
    onFlushDns: vi.fn(async () => {}),
    onSwitchDns: vi.fn(async () => {}),
    onRenewDhcp: vi.fn(async () => {}),
    onResetNetworkStack: vi.fn(async () => {}),
    onOpenSettings: vi.fn(),
  }
}

describe("FixPanel network service states", () => {
  it("shows loading and empty list states explicitly", () => {
    const props = createProps([], true)
    const { rerender } = render(<FixPanel {...props} />)
    const select = screen.getByLabelText("Network service")

    expect(select).toBeDisabled()
    expect(screen.getByRole("option", { name: "Loading network services…" })).toBeInTheDocument()

    rerender(<FixPanel {...props} loadingServices={false} />)
    expect(screen.getByRole("option", { name: "No network services found" })).toBeInTheDocument()
  })

  it("moves selection to an available service when the selected one disappears", () => {
    const props = createProps(["Wi-Fi"])
    const { rerender } = render(<FixPanel {...props} />)
    const select = screen.getByLabelText("Network service")
    expect(select).toHaveValue("Wi-Fi")

    rerender(<FixPanel {...props} services={["Ethernet"]} />)
    expect(select).toHaveValue("Ethernet")
  })
})
