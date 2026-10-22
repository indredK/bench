import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { OverviewPanel } from "@/features/network-probe/components/OverviewPanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ hint, children }: { hint: string; children: ReactNode }) => (
    <span data-command-hint={hint}>{children}</span>
  ),
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ children, toolbar }: { children: ReactNode; toolbar: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

function renderOverview(
  overrides: Partial<NonNullable<ComponentProps<typeof OverviewPanel>["summary"]>> = {},
) {
  render(
    <OverviewPanel
      loading={false}
      summary={{
        primaryIpv4: "192.0.2.10",
        primaryIpv6: undefined,
        gateway: undefined,
        dnsServers: [],
        wifiSsid: undefined,
        wifiSignalDbm: undefined,
        interfaces: [],
        ...overrides,
      }}
      firewall={null}
      errors={{}}
      hostsSuspiciousCount={0}
      onRefresh={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  )
}

describe("OverviewPanel Wi-Fi summary", () => {
  it("shows the signal when macOS withholds the SSID", () => {
    renderOverview({ wifiSignalDbm: -60 })

    const wifiCard = screen.getByText("networkProbe.overview.wifi").parentElement
    expect(wifiCard).not.toBeNull()
    expect(wifiCard).toHaveTextContent("-60 dBm")
  })

  it("shows both the SSID and signal when both are available", () => {
    renderOverview({ wifiSsid: "Office", wifiSignalDbm: -48 })

    expect(screen.getByText("Office (-48 dBm)")).toBeInTheDocument()
  })

  it("previews every overview IPC and the system-settings command on their buttons", () => {
    renderOverview()

    expect(
      screen
        .getByRole("button", { name: "networkProbe.overview.refresh" })
        .closest("[data-command-hint]"),
    ).toHaveAttribute("data-command-hint", "networkProbe.cmd.summary")
    expect(
      screen
        .getByRole("button", { name: "networkProbe.overview.openSettings" })
        .closest("[data-command-hint]"),
    ).toHaveAttribute("data-command-hint", "networkProbe.cmd.openSettings")
  })

  it("stops automatic refresh retries after failure but keeps manual retry available", () => {
    const onRefresh = vi.fn()
    const props: ComponentProps<typeof OverviewPanel> = {
      loading: false,
      summary: null,
      firewall: null,
      errors: {},
      hostsSuspiciousCount: 0,
      onRefresh,
      onOpenSettings: vi.fn(),
    }
    const view = render(<OverviewPanel {...props} />)

    expect(onRefresh).toHaveBeenCalledOnce()

    view.rerender(<OverviewPanel {...props} loading />)
    view.rerender(
      <OverviewPanel {...props} loading={false} errors={{ summary: "Network unavailable" }} />,
    )

    expect(onRefresh).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.overview.refresh" }))
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })
})
