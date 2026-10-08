import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DnsLookupPanel } from "@/features/network-probe/components/DnsLookupPanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
})
