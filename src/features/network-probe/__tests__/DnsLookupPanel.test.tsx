import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DnsLookupPanel } from "@/features/network-probe/components/DnsLookupPanel"
import type { DnsLookupResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
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

const result: DnsLookupResult = {
  domain: "example.com",
  rrType: "A",
  resolver: "system",
  elapsedMs: 1,
  records: [{ name: "example.com", rrType: "A", data: "203.0.113.4", ttl: 300 }],
  commandHint: "dnsLookup(local, 'example.com', {rrType:'A',resolver:'system'})",
}

describe("DnsLookupPanel", () => {
  it("locks all query parameters while a DNS request is in flight", () => {
    render(<DnsLookupPanel loading result={null} onRun={() => undefined} />)

    expect(screen.getByLabelText("networkProbe.dns.domain").hasAttribute("disabled")).toBe(true)
    expect(screen.getByLabelText("networkProbe.dns.rrType").hasAttribute("disabled")).toBe(true)
    expect(screen.getByLabelText("networkProbe.dns.resolver").hasAttribute("disabled")).toBe(true)
    expect(
      screen.getByRole("button", { name: "networkProbe.dns.running" }).hasAttribute("disabled"),
    ).toBe(true)
  })

  it("keeps query parameters editable while idle", () => {
    render(<DnsLookupPanel loading={false} result={null} onRun={() => undefined} />)

    expect(screen.getByLabelText("networkProbe.dns.domain").hasAttribute("disabled")).toBe(false)
    expect(screen.getByLabelText("networkProbe.dns.rrType").hasAttribute("disabled")).toBe(false)
    expect(screen.getByLabelText("networkProbe.dns.resolver").hasAttribute("disabled")).toBe(false)
  })

  it("labels the queried domain and keeps the raw command collapsed", () => {
    render(<DnsLookupPanel loading={false} result={result} onRun={() => undefined} />)

    expect(screen.getByText("networkProbe.dns.resultFor example.com")).toBeTruthy()
    expect(
      screen.getByText("networkProbe.dns.meta A networkProbe.dns.systemResolver 1"),
    ).toBeTruthy()
    const details = screen.getByText("networkProbe.dns.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText(result.commandHint).closest("details")).toBe(details)
  })
})
