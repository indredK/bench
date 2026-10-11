import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LanServicesPanel } from "@/features/network-probe/components/LanServicesPanel"
import type { LanServicesResult } from "@/lib/tauri/types/network-probe"

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number
    estimateSize: () => number
    getItemKey: (index: number) => string | number
  }) => ({
    getTotalSize: () => options.count * options.estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: Math.min(options.count, 8) }, (_, index) => ({
        index,
        start: index * options.estimateSize(),
        size: options.estimateSize(),
        key: options.getItemKey(index),
      })),
    measureElement: () => undefined,
  }),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { protocol?: string }) =>
      key === "networkProbe.lanSvc.protocolFailed"
        ? `${options?.protocol} discovery could not complete.`
        : key,
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

afterEach(() => cleanup())

describe("LanServicesPanel", () => {
  it("renders structured mDNS and SSDP results without backend English feedback", () => {
    const result: LanServicesResult = {
      items: [
        {
          protocol: "mdns",
          name: "Office Printer._ipp._tcp.local.",
          serviceType: "_ipp._tcp.local.",
          host: "printer.local.",
          port: 631,
          txtProperties: ["rp=ipp/print"],
        },
        {
          protocol: "ssdp",
          name: "Linux/6.1 UPnP/1.1 NAS/1.0",
          serviceType: "upnp:rootdevice",
          host: "192.168.1.22",
          port: 5000,
          uuid: "uuid:device-123",
          location: "http://192.168.1.22:5000/device.xml …",
        },
      ],
      issues: [{ protocol: "ssdp", code: "SSDP_INVALID_RESPONSE" }],
      elapsedMs: 2_950,
    }

    const { container } = render(
      <LanServicesPanel loading={false} result={result} toolEnabled onRun={() => undefined} />,
    )

    const rows = Array.from(container.querySelectorAll("li"))
    expect(rows[0]?.textContent).toContain("Office Printer._ipp._tcp.local.")
    expect(rows[0]?.textContent).toContain("networkProbe.lanSvc.txtProperties")
    expect(rows[1]?.textContent).toContain("uuid:device-123")
    expect(rows[1]?.textContent).toContain("http://192.168.1.22:5000/device.xml …")
    expect(screen.getByRole("alert").textContent).toContain("networkProbe.lanSvc.protocolSsdp")
    expect(screen.getByRole("alert").textContent).not.toContain("SSDP_INVALID_RESPONSE")
    const details = screen.getByText("networkProbe.lanSvc.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText("SSDP_INVALID_RESPONSE").closest("details")).toBe(details)
    expect(container.textContent).not.toContain("Read-only discovery. No UPnP Write")
    expect(container.textContent).not.toContain("M-SEARCH")
    expect(container.querySelector("[data-lan-services-scroll]")?.className).toContain(
      "overflow-auto",
    )
  })

  it("uses the partial empty state when discovery protocols fail", () => {
    render(
      <LanServicesPanel
        loading={false}
        result={{
          items: [],
          issues: [{ protocol: "mdns", code: "MDNS_DAEMON" }],
          elapsedMs: 20,
        }}
        toolEnabled
        onRun={() => undefined}
      />,
    )

    expect(screen.getByText("networkProbe.lanSvc.emptyPartial")).toBeTruthy()
    expect(screen.queryByText("networkProbe.lanSvc.empty")).toBeNull()
    expect(screen.getByRole("alert").textContent).toContain(
      "networkProbe.lanSvc.protocolMdns discovery could not complete.",
    )
    expect(screen.getByRole("alert").textContent).not.toContain("MDNS_DAEMON")
    const details = screen.getByText("networkProbe.lanSvc.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText("MDNS_DAEMON").closest("details")).toBe(details)
  })

  it("uses the localized protocol-level fallback for unknown issue codes", () => {
    const { container } = render(
      <LanServicesPanel
        loading={false}
        result={{
          items: [],
          issues: [{ protocol: "ssdp", code: "FUTURE_INTERNAL_CODE" }],
          elapsedMs: 20,
        }}
        toolEnabled
        onRun={() => undefined}
      />,
    )

    expect(screen.getByRole("alert").textContent).toContain(
      "networkProbe.lanSvc.protocolSsdp discovery could not complete.",
    )
    expect(screen.getByRole("alert").textContent).not.toContain("FUTURE_INTERNAL_CODE")
    const details = container.querySelector("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText("FUTURE_INTERNAL_CODE").closest("details")).toBe(details)
  })
})
