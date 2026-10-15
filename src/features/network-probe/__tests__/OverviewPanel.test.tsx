import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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

afterEach(() => cleanup())

describe("network-probe overview loading", () => {
  it("does not retry a failed automatic load until the user asks", async () => {
    const onRefresh = vi.fn()
    const props = {
      loading: false,
      summary: null,
      firewall: null,
      hostsSuspiciousCount: 0,
      openingSettings: false,
      onRefresh,
      onOpenSettings: vi.fn(),
    }
    const view = render(<OverviewPanel {...props} />)

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))

    view.rerender(<OverviewPanel {...props} loading />)
    view.rerender(<OverviewPanel {...props} />)
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.overview.refresh" }))
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })
})
