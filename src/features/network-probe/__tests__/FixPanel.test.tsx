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
  DestructiveConfirmDialog: ({
    open,
    title,
    description,
    onConfirm,
  }: {
    open: boolean
    title: string
    description: string
    onConfirm: () => void | Promise<void>
  }) =>
    open ? (
      <div>
        <p>{description}</p>
        <button
          type="button"
          aria-label={`test confirm: ${title}`}
          onClick={() => void onConfirm()}
        >
          Confirm
        </button>
      </div>
    ) : null,
}))

vi.mock("@/components/common/TripleDestructiveConfirm", () => ({
  TripleDestructiveConfirm: ({
    open,
    step2,
    onConfirm,
  }: {
    open: boolean
    step2: { description: string }
    onConfirm: () => void | Promise<void>
  }) =>
    open ? (
      <div>
        <p data-testid="triple-confirm-step2">{step2.description}</p>
        <button type="button" aria-label="test confirm reset" onClick={() => void onConfirm()}>
          Confirm
        </button>
      </div>
    ) : null,
}))

afterEach(() => cleanup())

function fixPanelProps(overrides: Partial<ComponentProps<typeof FixPanel>> = {}) {
  return {
    loading: false,
    loadingServices: false,
    openingSettings: false,
    toolEnabled: {
      flushDns: true,
      switchDns: true,
      renewDhcp: true,
      resetNetworkStack: true,
    },
    toolStatus: {
      flushDns: "supported",
      switchDns: "supported",
      renewDhcp: "supported",
      resetNetworkStack: "supported",
    },
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
  it("waits to load network services until the integrated fix section is active", () => {
    const onLoadServices = vi.fn()
    renderFixPanel({ active: false, onLoadServices })

    expect(onLoadServices).not.toHaveBeenCalled()
  })

  it("disables macOS-only fix actions and skips service loading when unsupported", () => {
    const onLoadServices = vi.fn()
    renderFixPanel({
      toolEnabled: {
        flushDns: false,
        switchDns: false,
        renewDhcp: false,
        resetNetworkStack: false,
      },
      toolStatus: {
        flushDns: "unsupported",
        switchDns: "unsupported",
        renewDhcp: "unsupported",
        resetNetworkStack: "unsupported",
      },
      onLoadServices,
    })

    expect(screen.getByRole("button", { name: "networkProbe.fix.flush" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.fix.switchDns" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.fix.renewDhcp" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.fix.resetStack" })).toBeDisabled()
    expect(onLoadServices).not.toHaveBeenCalled()
    expect(screen.getAllByText("networkProbe.caps.toolDisabled")).toHaveLength(4)
    expect(screen.queryByText("networkProbe.cmd.flushDns")).not.toBeInTheDocument()
    expect(
      screen.queryByText(/networkProbe\.cmd\.(switchDns|renewDhcp|resetNetworkStack)/),
    ).not.toBeInTheDocument()
  })

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

  it("locks the confirmed service and executes the service snapshot", async () => {
    const onResetNetworkStack = vi.fn().mockResolvedValue(undefined)
    renderFixPanel({ services: ["Wi-Fi", "Ethernet"], onResetNetworkStack })

    await waitFor(() =>
      expect(screen.getByLabelText("networkProbe.fix.service")).toHaveValue("Wi-Fi"),
    )
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.fix.resetStack" }))

    const serviceSelect = screen.getByLabelText("networkProbe.fix.service")
    expect(serviceSelect).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "test confirm reset" }))

    await waitFor(() => expect(onResetNetworkStack).toHaveBeenCalledWith("Wi-Fi"))
  })

  it("executes the captured service and DNS preset for a two-step DNS change", async () => {
    const onSwitchDns = vi.fn().mockResolvedValue(undefined)
    renderFixPanel({
      services: ["Wi-Fi", "Ethernet"],
      dnsPresets: [{ id: "public", address: "8.8.8.8", region: "global" }],
      onSwitchDns,
    })

    await waitFor(() =>
      expect(screen.getByLabelText("networkProbe.fix.service")).toHaveValue("Wi-Fi"),
    )
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.fix.switchDns" }))
    expect(screen.getByLabelText("networkProbe.fix.dnsPreset")).toBeDisabled()
    fireEvent.click(
      screen.getByRole("button", {
        name: "test confirm: networkProbe.fix.confirm.switchStep1Title",
      }),
    )

    const confirmStep2 = await screen.findByRole("button", {
      name: "test confirm: networkProbe.fix.confirm.switchStep2Title",
    })
    fireEvent.click(confirmStep2)
    await waitFor(() => expect(onSwitchDns).toHaveBeenCalledWith("Wi-Fi", ["8.8.8.8"]))
  })

  it("moves DNS selection to a current preset when the catalog changes", async () => {
    const view = renderFixPanel({
      dnsPresets: [{ id: "old", address: "8.8.8.8", region: "global" }],
    })
    const select = screen.getByLabelText("networkProbe.fix.dnsPreset")
    expect(select).toHaveValue("old")

    view.rerender(
      <FixPanel
        {...fixPanelProps({
          dnsPresets: [{ id: "new", address: "9.9.9.9", region: "global" }],
        })}
      />,
    )

    await waitFor(() => expect(select).toHaveValue("new"))
  })

  it("executes the captured service for a two-step DHCP renewal", async () => {
    const onRenewDhcp = vi.fn().mockResolvedValue(undefined)
    renderFixPanel({ services: ["Wi-Fi", "Ethernet"], onRenewDhcp })

    await waitFor(() =>
      expect(screen.getByLabelText("networkProbe.fix.service")).toHaveValue("Wi-Fi"),
    )
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.fix.renewDhcp" }))
    fireEvent.click(
      screen.getByRole("button", {
        name: "test confirm: networkProbe.fix.confirm.renewStep1Title",
      }),
    )

    const confirmStep2 = await screen.findByRole("button", {
      name: "test confirm: networkProbe.fix.confirm.renewStep2Title",
    })
    fireEvent.click(confirmStep2)
    await waitFor(() => expect(onRenewDhcp).toHaveBeenCalledWith("Wi-Fi"))
  })

  it("closes a service-bound confirmation if refresh removes its service", async () => {
    const props = fixPanelProps({ services: ["Wi-Fi"] })
    const view = render(<FixPanel {...props} />)

    await waitFor(() =>
      expect(screen.getByLabelText("networkProbe.fix.service")).toHaveValue("Wi-Fi"),
    )
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.fix.resetStack" }))
    expect(screen.getByRole("button", { name: "test confirm reset" })).toBeInTheDocument()

    props.services = ["Ethernet"]
    view.rerender(<FixPanel {...props} />)

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "test confirm reset" })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole("button", { name: "networkProbe.fix.resetStack" })).toBeDisabled()
  })
})
