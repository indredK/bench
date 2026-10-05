import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OverviewPanel } from "@/features/network-probe/components/OverviewPanel"
import type { LocalNetworkSummary } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

vi.mock("@/features/network-probe/components/OpenSystemNetworkSettingsButton", () => ({
  OpenSystemNetworkSettingsButton: () => null,
}))

function createProps(
  loading: boolean,
  onRefresh = vi.fn(),
  summary: LocalNetworkSummary | null = null,
) {
  return {
    loading,
    summary,
    firewall: null,
    hostsSuspiciousCount: 0,
    openingSettings: false,
    onRefresh,
    onOpenSettings: vi.fn(),
  }
}

afterEach(() => cleanup())

describe("OverviewPanel initial loading", () => {
  it("does not loop automatic refresh after an empty failed load and keeps manual retry", () => {
    const onRefresh = vi.fn()
    const props = createProps(false, onRefresh)
    const view = render(<OverviewPanel {...props} />)

    expect(onRefresh).toHaveBeenCalledTimes(1)

    view.rerender(<OverviewPanel {...props} loading />)
    view.rerender(<OverviewPanel {...props} />)

    expect(onRefresh).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.overview.refresh" }))
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it("waits for an in-flight load, then automatically retries an empty overview once", () => {
    const onRefresh = vi.fn()
    const props = createProps(true, onRefresh)
    const view = render(<OverviewPanel {...props} />)

    expect(onRefresh).not.toHaveBeenCalled()
    view.rerender(<OverviewPanel {...props} loading={false} />)
    view.rerender(<OverviewPanel {...props} />)

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it("shows a layout-matched skeleton on the first load", () => {
    render(<OverviewPanel {...createProps(true)} />)

    expect(
      screen.getByRole("status", { name: "networkProbe.overview.refreshing" }),
    ).toHaveAttribute("aria-busy", "true")
    expect(screen.getAllByTestId("overview-loading-skeleton")).toHaveLength(8)
    expect(screen.queryByText("networkProbe.overview.empty")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "networkProbe.overview.refreshing" })).toBeDisabled()
  })

  it("keeps the last summary visible while refreshing", () => {
    const summary: LocalNetworkSummary = {
      interfaces: [{ name: "en0", addrs: ["192.0.2.4"], isLoopback: false }],
      primaryIpv4: "192.0.2.4",
      dnsServers: ["1.1.1.1"],
    }

    render(<OverviewPanel {...createProps(true, vi.fn(), summary)} />)

    expect(screen.getByText("192.0.2.4")).toBeInTheDocument()
    expect(screen.queryByTestId("overview-loading-skeleton")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "networkProbe.overview.refreshing" })).toBeDisabled()
  })
})
