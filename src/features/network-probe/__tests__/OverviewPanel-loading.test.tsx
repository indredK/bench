import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OverviewPanel } from "@/features/network-probe/components/OverviewPanel"

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

function createProps(loading: boolean, onRefresh = vi.fn()) {
  return {
    loading,
    summary: null,
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
})
