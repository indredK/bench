import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FixPanel } from "@/features/network-probe/components/FixPanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

function renderFixPanel(servicesStatus: "idle" | "loading" | "ready" | "error") {
  const onLoadServices = vi.fn()
  render(
    <FixPanel
      loading={false}
      services={[]}
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
})
