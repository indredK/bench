import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FixPanel } from "../FixPanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
}))

vi.mock("@/components/common/TripleDestructiveConfirm", () => ({
  TripleDestructiveConfirm: () => null,
}))

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({
    toolbar,
    children,
  }: {
    toolbar: React.ReactNode
    children: React.ReactNode
  }) => (
    <section>
      {toolbar}
      {children}
    </section>
  ),
}))

function renderPanel(overrides: Partial<React.ComponentProps<typeof FixPanel>> = {}) {
  const props: React.ComponentProps<typeof FixPanel> = {
    loading: false,
    services: [],
    servicesStatus: "loaded",
    dnsPresets: [],
    lastResult: null,
    onLoadServices: vi.fn(),
    onFlushDns: vi.fn(async () => {}),
    onSwitchDns: vi.fn(async () => {}),
    onRenewDhcp: vi.fn(async () => {}),
    onResetNetworkStack: vi.fn(async () => {}),
    onOpenSettings: vi.fn(),
    openingSettings: false,
    ...overrides,
  }
  return render(<FixPanel {...props} />)
}

describe("FixPanel service loading states", () => {
  it("shows a retry action and blocks service changes after loading fails", () => {
    const onLoadServices = vi.fn()
    renderPanel({
      services: ["Wi-Fi"],
      servicesStatus: "failed",
      onLoadServices,
    })
    onLoadServices.mockClear()

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.fix.servicesFailed")
    expect(screen.getByRole("combobox", { name: "networkProbe.fix.service" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.fix.switchDns" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.fix.refreshServices" }))
    expect(onLoadServices).toHaveBeenCalledTimes(1)
  })

  it("explains the successful empty result instead of showing a blank selector", () => {
    renderPanel({ servicesStatus: "loaded" })

    expect(screen.getByRole("option")).toHaveTextContent("networkProbe.fix.servicesEmpty")
  })

  it("disables repeated system settings opens and shows progress", () => {
    renderPanel({ openingSettings: true })

    expect(screen.getByRole("button", { name: "networkProbe.openingSettings" })).toBeDisabled()
  })
})
