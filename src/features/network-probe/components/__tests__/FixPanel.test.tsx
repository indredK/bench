import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { FixPanel } from "@/features/network-probe/components/FixPanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ hint, children }: { hint: string; children: ReactNode }) => (
    <span data-command-hint={hint}>{children}</span>
  ),
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({
    toolbar,
    children,
  }: {
    toolbar: React.ReactNode
    children: React.ReactNode
  }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
}))
vi.mock("@/components/common/TripleDestructiveConfirm", () => ({
  TripleDestructiveConfirm: () => null,
}))

function renderFixPanel(
  servicesStatus: "idle" | "loading" | "ready" | "error",
  loading = false,
  services: string[] = [],
) {
  const onLoadServices = vi.fn()
  render(
    <FixPanel
      loading={loading}
      services={services}
      servicesStatus={servicesStatus}
      dnsPresets={[]}
      lastResult={null}
      onLoadServices={onLoadServices}
      onFlushDns={vi.fn()}
      onSwitchDns={vi.fn()}
      onRenewDhcp={vi.fn()}
      onResetNetworkStack={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  )
  return { onLoadServices }
}

describe("FixPanel network service state", () => {
  it("shows a retry action and blocks service changes after loading fails", () => {
    const { onLoadServices } = renderFixPanel("error")

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.fix.servicesLoadFailed")
    expect(onLoadServices).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.fix.retryServices" }))
    expect(onLoadServices).toHaveBeenCalledTimes(2)
    expect(screen.getByRole("button", { name: "networkProbe.fix.switchDns" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.fix.renewDhcp" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.fix.resetStack" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.fix.flush" })).toBeEnabled()
  })

  it("explains a successfully loaded empty service list", () => {
    renderFixPanel("ready")

    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.fix.noServices")
    expect(screen.getByRole("button", { name: "networkProbe.fix.switchDns" })).toBeDisabled()
  })

  it("shows a loading affordance and disables service selection", () => {
    renderFixPanel("loading")

    expect(screen.getByRole("button", { name: "networkProbe.fix.loadingServices" })).toBeDisabled()
    expect(screen.getByLabelText("networkProbe.fix.service")).toBeDisabled()
  })

  it("locks both targets and prevents service refresh during a repair", () => {
    renderFixPanel("ready", true, ["Wi-Fi"])

    expect(screen.getByLabelText("networkProbe.fix.service")).toBeDisabled()
    expect(screen.getByLabelText("networkProbe.fix.dnsPreset")).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.fix.refreshServices" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.fix.flush" })).toBeDisabled()
  })

  it("previews the IPC for service refresh and every repair action", () => {
    renderFixPanel("ready", false, ["Wi-Fi"])

    const expectedHints = [
      ["networkProbe.fix.refreshServices", "networkProbe.cmd.listNetworkServices"],
      ["networkProbe.fix.flush", "networkProbe.cmd.flushDns"],
      ["networkProbe.fix.switchDns", "networkProbe.cmd.switchDns"],
      ["networkProbe.fix.renewDhcp", "networkProbe.cmd.renewDhcp"],
      ["networkProbe.fix.resetStack", "networkProbe.cmd.resetNetworkStack"],
      ["networkProbe.fix.openSettings", "networkProbe.cmd.openSettings"],
    ]

    for (const [buttonName, commandName] of expectedHints) {
      expect(
        screen.getByRole("button", { name: buttonName }).closest("[data-command-hint]"),
      ).toHaveAttribute("data-command-hint", commandName)
    }
  })
})
