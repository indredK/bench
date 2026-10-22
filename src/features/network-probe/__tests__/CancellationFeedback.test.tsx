import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NetworkProbeCancelButton } from "@/features/network-probe/components/NetworkProbeCancelButton"
import { SitesProbePanel } from "@/features/network-probe/components/SitesProbePanel"
import type { SitesProbeResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

afterEach(() => cleanup())

describe("network-probe cancellation feedback", () => {
  it("disables the cancel button and announces the cancelling state", () => {
    render(<NetworkProbeCancelButton label="Cancel" cancelling onCancel={vi.fn()} />)

    expect(screen.getByRole("button", { name: "networkProbe.cancelling" })).toBeDisabled()
  })

  it("shows a cancelled status when cancellation leaves no completed site samples", () => {
    const result = {
      packId: "custom",
      results: [],
      cancelled: true,
      sessionId: "session-1",
      commandHint: "startSitesProbe(local, custom[1])",
    } satisfies SitesProbeResult

    render(
      <SitesProbePanel
        loading={false}
        canCancel={false}
        cancelling={false}
        result={result}
        streaming={[]}
        sparklines={{}}
        packIds={["global"]}
        toolEnabled
        onRunPack={vi.fn()}
        onRunCustom={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.sites.cancelled")
  })
})
