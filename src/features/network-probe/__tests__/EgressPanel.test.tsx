import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { EgressPanel } from "@/features/network-probe/components/EgressPanel"
import type { PublicIpInfo } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { asn?: string; org?: string }) =>
      key === "networkProbe.egress.asn" ? `${key} ${options?.asn ?? ""}${options?.org ?? ""}` : key,
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

const success: PublicIpInfo = {
  ip: "203.0.113.42",
  source: "ipify",
  asn: "AS64500",
  org: "Example Network",
  detail: '{"ip":"203.0.113.42"}',
  commandHint: "getPublicIpInfo(local)",
}

afterEach(() => cleanup())

describe("EgressPanel result feedback", () => {
  it("keeps the IP and ASN prominent while collapsing raw source, response, and command", () => {
    render(<EgressPanel loading={false} result={success} onRun={() => undefined} />)

    expect(screen.getByText("203.0.113.42")).toBeTruthy()
    expect(screen.getByText("networkProbe.egress.asn AS64500 · Example Network")).toBeTruthy()

    const details = screen.getByText("networkProbe.egress.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText("ipify").closest("details")).toBe(details)
    expect(screen.getByText(success.detail!).closest("details")).toBe(details)
    expect(screen.getByText(success.commandHint).closest("details")).toBe(details)
  })

  it("shows a localized failure when the backend returns no public IP", () => {
    const failed: PublicIpInfo = {
      detail: "All public IP APIs failed",
      commandHint: "getPublicIpInfo(local)",
    }

    render(<EgressPanel loading={false} result={failed} onRun={() => undefined} />)

    expect(screen.getByRole("status").textContent).toBe("networkProbe.egress.failed")
    const details = screen.getByText("networkProbe.egress.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText(failed.detail!).closest("details")).toBe(details)
  })
})
