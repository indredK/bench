import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { ArpPanel } from "@/features/network-probe/components/ArpPanel"

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

function renderArp(overrides: Partial<ComponentProps<typeof ArpPanel>> = {}): {
  onOpenLocalNetworkSettings: ReturnType<typeof vi.fn>
} {
  const onOpenLocalNetworkSettings = vi.fn()
  render(
    <ArpPanel
      loading={false}
      result={null}
      toolEnabled
      onRun={vi.fn()}
      onOpenLocalNetworkSettings={onOpenLocalNetworkSettings}
      {...overrides}
    />,
  )
  return { onOpenLocalNetworkSettings }
}

const permissionResult: NonNullable<ComponentProps<typeof ArpPanel>["result"]> = {
  mode: "arp-cache",
  neighbors: [],
  message: "No primary IPv4",
  emptyReason: "permission",
  cancelled: false,
  sessionId: "lan-1",
  elapsedMs: 1,
  commandHint: "scanLan()",
}

describe("ArpPanel Local Network guidance", () => {
  it("opens Privacy & Security from the permission empty state", () => {
    const { onOpenLocalNetworkSettings } = renderArp({ result: permissionResult })

    const settingsButton = screen.getByRole("button", { name: "networkProbe.arp.openSettings" })
    expect(settingsButton.closest("[data-command-hint]")).toHaveAttribute(
      "data-command-hint",
      "networkProbe.cmd.openPrivacySettings",
    )
    fireEvent.click(settingsButton)
    expect(onOpenLocalNetworkSettings).toHaveBeenCalledOnce()
  })

  it("does not show the permission settings action for a quiet network", () => {
    renderArp({ result: { ...permissionResult, emptyReason: "quiet" } })

    expect(screen.queryByRole("button", { name: "networkProbe.arp.openSettings" })).toBeNull()
  })
})
