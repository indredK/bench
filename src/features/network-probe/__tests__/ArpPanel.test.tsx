import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ArpPanel } from "@/features/network-probe/components/ArpPanel"

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

describe("network-probe ARP empty-state copy", () => {
  it("renders the localized empty reason without exposing the backend message", () => {
    const backendMessage =
      "No neighbors found. May be a quiet network, Wi-Fi client isolation, or Local Network permission."

    render(
      <ArpPanel
        loading={false}
        result={{
          mode: "arp-cache+tcp-sweep",
          neighbors: [],
          message: backendMessage,
          emptyReason: "quiet",
          cidr: "192.168.0.0/24",
          cancelled: false,
          sessionId: "session-1",
          elapsedMs: 25,
          commandHint: "scanLan(local)",
        }}
        toolEnabled
        cancelling={false}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.arp.emptyQuiet")).toBeInTheDocument()
    expect(screen.queryByText(backendMessage)).not.toBeInTheDocument()
  })
})
