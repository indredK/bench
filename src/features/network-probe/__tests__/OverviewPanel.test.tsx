import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OverviewPanel } from "@/features/network-probe/components/OverviewPanel"
import { useNetworkProbeStore } from "@/features/network-probe/store"

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

afterEach(() => cleanup())

describe("network-probe overview loading", () => {
  it("does not retry a failed automatic load until the user asks", async () => {
    const onRefresh = vi.fn()
    const onAutoLoadOverview = vi.fn(() => {
      if (useNetworkProbeStore.getState().claimOverviewAutoLoad()) onRefresh()
    })
    const props = {
      loading: false,
      summary: null,
      firewall: null,
      hostsSuspiciousCount: 0,
      openingSettings: false,
      onAutoLoadOverview,
      onRefresh,
      onOpenSettings: vi.fn(),
    }
    const view = render(<OverviewPanel {...props} />)

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))

    view.rerender(<OverviewPanel {...props} loading />)
    view.rerender(<OverviewPanel {...props} />)
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))

    view.unmount()
    render(<OverviewPanel {...props} />)
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.overview.refresh" }))
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it("shows a localized partial-data status when optional system queries fail", () => {
    render(
      <OverviewPanel
        loading={false}
        summary={{
          interfaces: [],
          dnsServers: [],
          unavailableFields: ["gateway", "dnsServers"],
        }}
        firewall={null}
        hostsSuspiciousCount={0}
        openingSettings={false}
        onAutoLoadOverview={vi.fn()}
        onRefresh={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.overview.partialData")
    expect(screen.getByText("networkProbe.overview.unavailableFields.gateway")).toBeInTheDocument()
    expect(
      screen.getByText("networkProbe.overview.unavailableFields.dnsServers"),
    ).toBeInTheDocument()
  })

  it("keeps the summary command hint hidden until the refresh control receives focus", async () => {
    render(
      <OverviewPanel
        loading={false}
        summary={null}
        firewall={null}
        hostsSuspiciousCount={0}
        openingSettings={false}
        onAutoLoadOverview={vi.fn()}
        onRefresh={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    const refreshButton = screen.getByRole("button", { name: "networkProbe.overview.refresh" })
    expect(screen.queryByText("networkProbe.cmd.summary")).not.toBeInTheDocument()

    fireEvent.focus(refreshButton)

    await waitFor(() => expect(screen.getByText("networkProbe.cmd.summary")).toBeInTheDocument())
  })
})
