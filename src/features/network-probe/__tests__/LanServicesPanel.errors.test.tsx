import { cleanup, render, screen } from "@testing-library/react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { LanServicesResult } from "@/lib/tauri/types/network-probe"

const i18nState = vi.hoisted(() => {
  const messages: Record<string, string> = {
    "networkProbe.lanSvc.hint": "Browse local services.",
    "networkProbe.lanSvc.readOnlyHint": "Read-only discovery.",
    "networkProbe.lanSvc.protocols.mdns": "mDNS",
    "networkProbe.lanSvc.protocols.ssdp": "SSDP/UPnP",
    "networkProbe.lanSvc.protocolFailure": "Could not browse {{protocol}} services.",
    "networkProbe.lanSvc.technicalDetails": "Technical details",
    "networkProbe.lanSvc.truncated": "Showing at most {{limit}} results.",
    "networkProbe.lanSvc.meta": "{{count}} services · {{ms}} ms",
    "networkProbe.lanSvc.empty": "No service responses.",
    "networkProbe.lanSvc.listLabel": "Discovered services",
    "networkProbe.lanSvc.run": "Browse services",
    "networkProbe.lanSvc.running": "Browsing…",
    "networkProbe.caps.toolDisabled": "{{tool}} is {{status}}.",
    "networkProbe.cmd.lanSvc": "browseLanServices()",
  }
  return {
    t(key: string, values?: Record<string, string | number>) {
      return Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
        messages[key] ?? key,
      )
    },
  }
})

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: i18nState.t }) }))
vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <section>
      {toolbar}
      {children}
    </section>
  ),
}))
vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/components/ui/button", () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))
vi.mock("@/features/network-probe/components/VirtualizedResultList", () => ({
  VirtualizedResultList: () => <div>service results</div>,
}))

import { LanServicesPanel } from "@/features/network-probe/components/LanServicesPanel"

afterEach(cleanup)

describe("LanServicesPanel protocol errors", () => {
  it("shows localized partial failures separately from discovered service counts", () => {
    const result: LanServicesResult = {
      items: [],
      errors: [
        { protocol: "mdns", code: "MDNS_BROWSE", message: "No route to host" },
        { protocol: "ssdp", code: "SSDP_SEARCH", message: "No route to host" },
      ],
      truncated: false,
      elapsedMs: 0,
      commandHint: "browseLanServices(local)",
    }

    render(<LanServicesPanel loading={false} result={result} toolEnabled onRun={() => {}} />)

    expect(screen.getByText("0 services · 0 ms")).toBeInTheDocument()
    expect(screen.getByText("Could not browse mDNS services.")).toBeInTheDocument()
    expect(screen.getByText("Could not browse SSDP/UPnP services.")).toBeInTheDocument()
    expect(screen.getAllByRole("alert")).toHaveLength(2)
    expect(screen.queryByText("No service responses.")).not.toBeInTheDocument()
    for (const detail of screen.getAllByText(/No route to host/)) {
      expect(detail).not.toBeVisible()
    }
  })
})
