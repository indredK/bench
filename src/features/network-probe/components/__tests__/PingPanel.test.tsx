import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { PingPanel } from "@/features/network-probe/components/PingPanel"

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

function renderPing(overrides: Partial<ComponentProps<typeof PingPanel>> = {}) {
  const onOpenLocalNetworkSettings = vi.fn()
  render(
    <PingPanel
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

describe("PingPanel Local Network guidance", () => {
  it("offers localized settings guidance when ICMP initialization fails", () => {
    const { onOpenLocalNetworkSettings } = renderPing({ errorCode: "ICMP_UNAVAILABLE" })

    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.ping.localNetworkHint")
    const settingsButton = screen.getByRole("button", {
      name: "networkProbe.ping.openSettings",
    })
    expect(settingsButton.closest("[data-command-hint]")).toHaveAttribute(
      "data-command-hint",
      "networkProbe.cmd.openPrivacySettings",
    )
    fireEvent.click(settingsButton)
    expect(onOpenLocalNetworkSettings).toHaveBeenCalledOnce()
  })

  it("offers the same guide when all echo requests time out", () => {
    renderPing({
      result: {
        target: "1.1.1.1",
        resolvedIp: "1.1.1.1",
        packetsSent: 4,
        packetsReceived: 0,
        lossPercent: 100,
        samples: [],
        commandHint: "probePingHost()",
      },
    })

    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.ping.localNetworkHint")
    expect(screen.getByRole("button", { name: "networkProbe.ping.openSettings" })).toBeEnabled()
  })

  it("keeps generic Ping failures from suggesting a permissions fix", () => {
    renderPing({ errorCode: "VALIDATION_ERROR" })

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "networkProbe.ping.openSettings" })).toBeNull()
  })
})
