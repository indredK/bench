import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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

function renderPanel(
  options: {
    servicesLoadState?: "idle" | "loading" | "loaded" | "failed"
    openingSettings?: boolean
    services?: string[]
  } = {},
) {
  const onLoadServices = vi.fn()
  const props = {
    loading: false,
    servicesLoadState: options.servicesLoadState ?? "loaded",
    openingSettings: options.openingSettings ?? false,
    services: options.services ?? [],
    dnsPresets: [],
    lastResult: null,
    onLoadServices,
    onFlushDns: vi.fn(),
    onSwitchDns: vi.fn(),
    onRenewDhcp: vi.fn(),
    onResetNetworkStack: vi.fn(),
    onOpenSettings: vi.fn(),
  }
  const view = render(<FixPanel {...props} />)
  return {
    onLoadServices,
    rerenderServices: (services: string[]) =>
      view.rerender(<FixPanel {...props} services={services} />),
  }
}

afterEach(() => cleanup())

describe("FixPanel service loading and recovery", () => {
  it("shows a loading state and disables service actions while listing services", () => {
    renderPanel({ servicesLoadState: "loading", services: ["Wi-Fi"] })

    expect(
      screen.getByRole("combobox", { name: "networkProbe.fix.service" }).hasAttribute("disabled"),
    ).toBe(true)
    expect(
      screen
        .getByRole("button", { name: "networkProbe.fix.loadingServices" })
        .hasAttribute("disabled"),
    ).toBe(true)
    expect(
      screen.getByRole("button", { name: "networkProbe.fix.resetStack" }).hasAttribute("disabled"),
    ).toBe(true)
    expect(screen.getByRole("status").textContent).toBe("networkProbe.fix.loadingServices")
  })

  it("shows an empty state and allows an explicit retry", () => {
    const { onLoadServices } = renderPanel()
    onLoadServices.mockClear()

    expect(screen.getByRole("status").textContent).toBe("networkProbe.fix.noServices")
    expect(
      screen.getByRole("combobox", { name: "networkProbe.fix.service" }).hasAttribute("disabled"),
    ).toBe(true)
    const retryButton = screen.getByRole("button", { name: "networkProbe.fix.refreshServices" })
    expect(retryButton.hasAttribute("disabled")).toBe(false)

    fireEvent.click(retryButton)
    expect(onLoadServices).toHaveBeenCalledTimes(1)
  })

  it("distinguishes a failed refresh from an empty service list", () => {
    renderPanel({ servicesLoadState: "failed", services: ["Wi-Fi"] })

    expect(screen.getByRole("status").textContent).toBe("networkProbe.fix.servicesLoadFailed")
    expect(
      screen.getByRole("combobox", { name: "networkProbe.fix.service" }).hasAttribute("disabled"),
    ).toBe(true)
    expect(
      screen.getByRole("button", { name: "networkProbe.fix.resetStack" }).hasAttribute("disabled"),
    ).toBe(true)
    expect(
      screen
        .getByRole("button", { name: "networkProbe.fix.refreshServices" })
        .hasAttribute("disabled"),
    ).toBe(false)
  })

  it("selects a remaining network service when a refresh removes the current choice", () => {
    const { rerenderServices } = renderPanel({
      servicesLoadState: "loaded",
      services: ["Wi-Fi", "Ethernet"],
    })
    const serviceSelect = screen.getByRole("combobox", {
      name: "networkProbe.fix.service",
    }) as HTMLSelectElement

    fireEvent.change(serviceSelect, { target: { value: "Ethernet" } })
    expect(serviceSelect.value).toBe("Ethernet")
    rerenderServices(["Wi-Fi"])

    expect(serviceSelect.value).toBe("Wi-Fi")
  })

  it("disables the shared settings action and announces progress", () => {
    renderPanel({ openingSettings: true })

    const button = screen.getByRole("button", { name: "networkProbe.actions.openingSettings" })
    expect(button.hasAttribute("disabled")).toBe(true)
    expect(button.getAttribute("aria-busy")).toBe("true")
  })
})
