import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DefaultsEditorDialog } from "@/features/network-probe/components/DefaultsEditorDialog"
import type { NetworkProbeDefaultsCatalog } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(() => cleanup())

const defaults: NetworkProbeDefaultsCatalog = {
  schemaVersion: 1,
  dnsPresets: [{ id: "dns-one", address: "1.1.1.1", region: "global" }],
  reachTargets: [{ id: "reach-one", kind: "ipv4", target: "1.1.1.1" }],
  captiveProbes: [{ id: "captive-one", url: "http://example.com/check", expectStatus: 204 }],
  publicIpApis: [{ id: "api-one", url: "https://example.com/ip", format: "json-ip" }],
  sitePacks: {
    global: [{ id: "shared-site-id", target: "https://example.com", channel: "http" }],
    "cn-friendly": [{ id: "shared-site-id", target: "223.5.5.5", channel: "icmp" }],
  },
  mtuTargets: [{ id: "mtu-one", target: "gateway" }],
}

function renderDialog(onSave = vi.fn().mockResolvedValue(true)) {
  const onReset = vi.fn().mockResolvedValue(defaults)
  render(
    <DefaultsEditorDialog
      open
      defaults={defaults}
      busy={false}
      onOpenChange={vi.fn()}
      onSave={onSave}
      onReset={onReset}
    />,
  )
  return { onSave, onReset }
}

describe("Network Probe default resource editor", () => {
  it("saves only the category being edited", async () => {
    const { onSave } = renderDialog()
    fireEvent.change(screen.getAllByRole("textbox")[1]!, { target: { value: "9.9.9.9" } })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.defaults.save" }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        dnsPresets: [{ id: "dns-one", address: "9.9.9.9", region: "global" }],
      })
    })
    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.defaults.saved")
  })

  it("allows IDs to repeat across different site packs", () => {
    renderDialog()
    fireEvent.click(
      screen.getByRole("button", { name: "networkProbe.defaults.categories.sitePacks" }),
    )

    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("requires a non-empty valid list before saving", () => {
    renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.defaults.removeItem" }))

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.defaults.validation.required")
    expect(screen.getByRole("button", { name: "networkProbe.defaults.save" })).toBeDisabled()
  })

  it("resets the saved catalog only after the confirmation action succeeds", async () => {
    const { onReset } = renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.defaults.reset" }))
    const confirmation = await screen.findByRole("alertdialog")
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.defaults.resetConfirm" }))

    await waitFor(() => expect(onReset).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("networkProbe.defaults.saved"),
    )
    await waitFor(() => expect(confirmation).not.toBeInTheDocument())
  })
})
