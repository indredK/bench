import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { NatPanel } from "@/features/network-probe/components/NatPanel"

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

describe("NatPanel mapping observations", () => {
  it("shows each server result and explicitly avoids NAT classification", () => {
    render(
      <NatPanel
        loading={false}
        toolEnabled
        result={{
          observations: [
            {
              server: "stun.example:3478",
              status: "mapped",
              mappedAddress: "198.51.100.8:4567",
            },
            { server: "stun2.example:3478", status: "timeout" },
            { server: "stun3.example:3478", status: "unavailable" },
          ],
          elapsedMs: 3000,
          commandHint: "probeNat()",
        }}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.nat.observationOnly")).toBeInTheDocument()
    expect(screen.getByText("stun.example:3478")).toBeInTheDocument()
    expect(screen.getByText("198.51.100.8:4567")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nat.status.mapped")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nat.status.timeout")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nat.status.unavailable")).toBeInTheDocument()
    expect(screen.queryByText(/NAT type/i)).not.toBeInTheDocument()
  })
})
