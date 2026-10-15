import type { ComponentProps, ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FixPanel } from "@/features/network-probe/components/FixPanel"

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

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
}))

vi.mock("@/components/common/TripleDestructiveConfirm", () => ({
  TripleDestructiveConfirm: () => null,
}))

afterEach(() => cleanup())

function fixPanelProps(overrides: Partial<ComponentProps<typeof FixPanel>> = {}) {
  return {
    loading: false,
    loadingServices: false,
    openingSettings: false,
    services: [] as string[],
    dnsPresets: [],
    lastResult: null,
    onLoadServices: vi.fn(),
    onFlushDns: vi.fn(),
    onSwitchDns: vi.fn(),
    onRenewDhcp: vi.fn(),
    onResetNetworkStack: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  }
}

function renderFixPanel(overrides: Partial<ComponentProps<typeof FixPanel>> = {}) {
  return render(<FixPanel {...fixPanelProps(overrides)} />)
}

describe("network-probe quick-fix service controls", () => {
  it("localizes action status and keeps raw system feedback collapsed by default", () => {
    const systemMessage = "dscacheutil -flushcache: ok; killall -HUP mDNSResponder: ok"
    renderFixPanel({
      lastResult: {
        action: "flushDns",
        ok: true,
        message: systemMessage,
        commandHint: "flushDns()",
      },
    })

    expect(screen.getByText("networkProbe.fix.flush")).toBeTruthy()
    expect(screen.getByText("networkProbe.fix.ok")).toBeTruthy()
    const details = screen.getByText("networkProbe.systemDetail").closest("details")
    expect(details?.open).toBe(false)
    expect(details?.querySelector("p")?.textContent).toBe(systemMessage)
    expect(screen.getByText("flushDns()")).toBeTruthy()

    fireEvent.click(details!.querySelector("summary")!)
    expect(details?.open).toBe(true)
  })

  it("uses a localized fallback for unknown backend action keys", () => {
    renderFixPanel({
      lastResult: {
        action: "futureAction",
        ok: false,
        message: "Raw system error",
        commandHint: "futureAction()",
      },
    })

    expect(screen.getByText(/networkProbe\.fix\.unknownAction/)).toBeTruthy()
    expect(screen.getByText("networkProbe.fix.failed")).toBeTruthy()
    expect(screen.queryByText("futureAction:")).toBeNull()
    expect(screen.getByText("networkProbe.systemDetail").closest("details")?.open).toBe(false)
  })

  it("shows a retry action and an explicit empty state when no service is loaded", () => {
    const onLoadServices = vi.fn()
    renderFixPanel({ onLoadServices })
    onLoadServices.mockClear()

    expect(screen.getByRole("option", { name: "networkProbe.fix.servicesEmpty" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.fix.loadServices" }))
    expect(onLoadServices).toHaveBeenCalledTimes(1)
  })

  it("disables service selection and refresh while loading", () => {
    renderFixPanel({ loadingServices: true })

    expect(screen.getByLabelText("networkProbe.fix.service").hasAttribute("disabled")).toBe(true)
    expect(
      screen
        .getByRole("button", { name: "networkProbe.fix.loadingServices" })
        .hasAttribute("disabled"),
    ).toBe(true)
    expect(screen.getByRole("option", { name: "networkProbe.fix.loadingServices" })).toBeTruthy()
  })

  it("keeps loaded services visible and exposes refresh and settings busy states", () => {
    renderFixPanel({
      services: ["Wi-Fi"],
      openingSettings: true,
    })

    expect(screen.getByRole("option", { name: "Wi-Fi" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "networkProbe.fix.refreshServices" })).toBeTruthy()
    expect(
      screen
        .getByRole("button", { name: "networkProbe.fix.openingSettings" })
        .hasAttribute("disabled"),
    ).toBe(true)
  })

  it("requires a new service selection when refresh removes the selected service", async () => {
    const props = fixPanelProps({ services: ["Wi-Fi"] })
    const view = render(<FixPanel {...props} />)

    await waitFor(() =>
      expect(screen.getByLabelText("networkProbe.fix.service")).toHaveValue("Wi-Fi"),
    )
    expect(screen.getByRole("button", { name: "networkProbe.fix.renewDhcp" })).toBeEnabled()

    props.services = ["Ethernet"]
    view.rerender(<FixPanel {...props} />)

    await waitFor(() => expect(screen.getByLabelText("networkProbe.fix.service")).toHaveValue(""))
    expect(screen.getByRole("option", { name: "networkProbe.fix.selectService" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "networkProbe.fix.switchDns" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.fix.renewDhcp" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.fix.resetStack" })).toBeDisabled()

    fireEvent.change(screen.getByLabelText("networkProbe.fix.service"), {
      target: { value: "Ethernet" },
    })
    expect(screen.getByRole("button", { name: "networkProbe.fix.renewDhcp" })).toBeEnabled()
  })
})
