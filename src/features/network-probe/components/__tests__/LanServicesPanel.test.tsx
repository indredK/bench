/**
 * Test / 测试: keep LAN service status localized and count only discovered services.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { LanServicesPanel } from "../LanServicesPanel"
import type { LanServicesResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === "networkProbe.lanSvc.meta" ? `${key} count=${options?.count}` : key,
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/components/content/VirtualList", () => ({
  VirtualList: <T,>({ items, renderItem }: { items: T[]; renderItem: (item: T) => string }) => (
    <ul>
      {items.map((item, index) => (
        <li key={index}>{renderItem(item)}</li>
      ))}
    </ul>
  ),
}))

vi.mock("@/components/ui/button", () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <section>
      {toolbar}
      {children}
    </section>
  ),
}))

const result: LanServicesResult = {
  items: [
    {
      protocol: "mdns",
      name: "(mDNS error)",
      detail: "[MDNS_BROWSE] English backend diagnostic",
    },
    {
      protocol: "ssdp",
      name: "(SSDP error)",
      detail: "[SSDP_SEND] No route to host (os error 65)",
    },
    {
      protocol: "ssdp",
      name: "(SSDP result limit)",
      detail: "[RESULT_LIMIT]",
    },
    {
      protocol: "mdns",
      name: "printer._ipp._tcp.local",
      serviceType: "_ipp._tcp.local.",
      host: "printer.local.",
      port: 631,
      detail: "192.168.1.10",
    },
  ],
  message: "English backend read-only hint",
  elapsedMs: 2250,
  commandHint: "browseLanServices(local)",
}

describe("LanServicesPanel", () => {
  it("localizes protocol errors and excludes them from the service count", () => {
    render(<LanServicesPanel loading={false} result={result} toolEnabled onRun={() => {}} />)

    expect(screen.getByText("networkProbe.lanSvc.meta count=1")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.lanSvc.mdnsError")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.lanSvc.ssdpSendError")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.lanSvc.resultLimit")).toBeInTheDocument()
    expect(
      screen.queryByText(/English backend|No route to host|os error 65|SSDP_SEND/),
    ).not.toBeInTheDocument()
    expect(screen.getByText("networkProbe.lanSvc.readOnlyHint")).toBeInTheDocument()
  })
})
