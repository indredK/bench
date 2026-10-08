import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NatPanel } from "@/features/network-probe/components/NatPanel"
import type { NatProbeResult } from "@/lib/tauri/types/network-probe"

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

const baseResult: NatProbeResult = {
  natType: "consistent-across-servers",
  mappedAddress: "[2001:db8::9]:45678",
  stunServer: "stun.example.test",
  detail: "Technical server diagnostic",
  elapsedMs: 12,
  commandHint: "probeNat(local)",
}

function renderPanel(result: NatProbeResult) {
  return render(<NatPanel loading={false} result={result} toolEnabled onRun={() => undefined} />)
}

afterEach(() => cleanup())

describe("NatPanel mapping observations", () => {
  it("localizes a consistent mapping and explains the classification limit", () => {
    renderPanel(baseResult)

    expect(screen.getByText("networkProbe.nat.consistent")).toBeTruthy()
    expect(screen.getByText("networkProbe.nat.scopeNote")).toBeTruthy()
    expect(screen.getByText("[2001:db8::9]:45678")).toBeTruthy()
  })

  it("keeps raw diagnostics collapsed and does not display old NAT guesses", () => {
    renderPanel({
      ...baseResult,
      natType: "varied-across-servers",
      mappedAddress: undefined,
    })

    expect(screen.getByText("networkProbe.nat.varied")).toBeTruthy()
    expect(screen.queryByText("varied-across-servers")).toBeNull()
    const details = screen.getByText("networkProbe.nat.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText("Technical server diagnostic").closest("details")).toBe(details)
    expect(screen.getByText(baseResult.commandHint).closest("details")).toBe(details)
  })

  it("shows the honest no-response state", () => {
    renderPanel({
      ...baseResult,
      natType: "blocked-or-timeout",
      mappedAddress: undefined,
    })

    expect(screen.getByText("networkProbe.nat.blockedOrTimeout")).toBeTruthy()
  })
})
