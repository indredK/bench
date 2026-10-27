import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { start, stop } = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values?.time ? `${key} ${String(values.time)}` : key,
    i18n: { resolvedLanguage: "zh-CN", language: "zh-CN" },
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

vi.mock("@/features/network-probe/hooks/useSiteMonitor", () => ({
  useSiteMonitor: () => ({
    monitoring: false,
    starting: false,
    checking: false,
    paused: false,
    error: null,
    samples: [],
    lastCheckedAt: 1,
    start,
    stop,
  }),
}))

import { SitesProbePanel } from "@/features/network-probe/components/SitesProbePanel"

function sitesProbePanelProps(packIds = ["global"]) {
  return {
    loading: false,
    canCancel: false,
    cancelling: false,
    result: null,
    streaming: [],
    sparklines: {},
    packIds,
    toolEnabled: true,
    onRunPack: vi.fn(),
    onRunCustom: vi.fn(),
    onCancel: vi.fn(),
  }
}

function renderSitesProbePanel(packIds = ["global"]) {
  return render(<SitesProbePanel {...sitesProbePanelProps(packIds)} />)
}

beforeEach(() => {
  sessionStorage.clear()
  start.mockReset()
  stop.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("SitesProbePanel site monitoring selection", () => {
  it("starts with only the checked custom sites", () => {
    renderSitesProbePanel()
    const sites = [
      "https://one.example/",
      "https://two.example/",
      "https://three.example/",
      "https://four.example/",
    ]
    const input = screen.getByLabelText("networkProbe.sites.customInput")

    for (const site of sites) {
      fireEvent.change(input, { target: { value: site } })
      fireEvent.click(screen.getByRole("button", { name: "networkProbe.sites.customAdd" }))
    }

    fireEvent.click(screen.getByLabelText(sites[1]!))
    fireEvent.click(screen.getByLabelText(sites[3]!))
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.siteMonitor.start" }))

    expect(start).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledWith([sites[1], sites[3]])
  })

  it("formats the last-check time using the current interface language", () => {
    const formatTime = vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("13:14")

    renderSitesProbePanel()

    expect(formatTime).toHaveBeenCalledWith("zh-CN")
    expect(screen.getByText("networkProbe.siteMonitor.lastChecked 13:14")).toBeTruthy()
  })

  it("selects a remaining site pack when the edited catalog removes the current one", async () => {
    const view = renderSitesProbePanel(["cn-friendly", "global"])
    const select = screen.getByRole("combobox", { name: "networkProbe.sites.pack" })
    expect(select).toHaveValue("cn-friendly")

    view.rerender(<SitesProbePanel {...sitesProbePanelProps(["global"])} />)

    await waitFor(() => expect(select).toHaveValue("global"))
  })

  it("blocks custom targets that exceed the backend UTF-8 byte limit", () => {
    renderSitesProbePanel()
    const input = screen.getByLabelText("networkProbe.sites.customInput")
    fireEvent.change(input, { target: { value: "站".repeat(683) } })

    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByRole("alert").textContent).toBe("networkProbe.sites.customTargetTooLong")
    expect(screen.getByRole("button", { name: "networkProbe.sites.customAdd" })).toBeDisabled()
  })

  it("deduplicates custom targets by normalized HTTP URL", () => {
    renderSitesProbePanel()
    const input = screen.getByLabelText("networkProbe.sites.customInput")
    const addButton = screen.getByRole("button", { name: "networkProbe.sites.customAdd" })

    fireEvent.change(input, { target: { value: "HTTPS://EXAMPLE.com" } })
    fireEvent.click(addButton)
    fireEvent.change(input, { target: { value: "https://example.com/" } })
    fireEvent.click(addButton)

    expect(screen.getAllByRole("button", { name: "networkProbe.sites.customRemove" })).toHaveLength(
      1,
    )
  })

  it("explains the custom-site limit instead of silently dropping the next site", () => {
    renderSitesProbePanel()
    const input = screen.getByLabelText("networkProbe.sites.customInput")
    const addButton = screen.getByRole("button", { name: "networkProbe.sites.customAdd" })

    for (let index = 0; index < 24; index += 1) {
      fireEvent.change(input, { target: { value: `https://site-${index}.example/` } })
      fireEvent.click(addButton)
    }
    fireEvent.change(input, { target: { value: "https://overflow.example/" } })

    expect(addButton).toBeDisabled()
    expect(screen.getByRole("status").textContent).toBe("networkProbe.sites.customSiteLimitReached")
    expect(screen.getAllByRole("button", { name: "networkProbe.sites.customRemove" })).toHaveLength(
      24,
    )
    expect(input).toHaveProperty("value", "https://overflow.example/")
  })
})
