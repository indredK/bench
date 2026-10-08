import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DnsSecPanel } from "@/features/network-probe/components/DnsSecPanel"
import type { DnsSecCheckResult } from "@/lib/tauri/types/network-probe"

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

const result: DnsSecCheckResult = {
  domain: "cloudflare.com",
  dnssecStatus: "secure",
  dnssecDetail: "localValidationSecure",
  dohOk: true,
  dohRttMs: 18,
  dohDetail: "authenticatedData",
  dotOk: true,
  dotRttMs: 24,
  dotDetail: "tlsVerifiedQuerySucceeded",
  commandHint: "checkDnsSec('cloudflare.com')",
}

afterEach(() => cleanup())

describe("DnsSecPanel localization and result semantics", () => {
  it("localizes backend status and diagnostics instead of exposing machine tokens", () => {
    render(<DnsSecPanel loading={false} result={result} toolEnabled onRun={() => undefined} />)

    expect(screen.getByText("networkProbe.dnssec.statusValue.secure")).toBeTruthy()
    expect(screen.getByText("networkProbe.dnssec.resultFor")).toBeTruthy()
    expect(screen.getByText("networkProbe.dnssec.details.localValidationSecure")).toBeTruthy()
    expect(screen.getByText("networkProbe.dnssec.dohDetails.authenticatedData")).toBeTruthy()
    expect(
      screen.getByText("networkProbe.dnssec.dotDetails.tlsVerifiedQuerySucceeded"),
    ).toBeTruthy()
    expect(screen.getByText("networkProbe.dnssec.dohOkMs")).toBeTruthy()
    expect(screen.getByText("networkProbe.dnssec.dotOkMs")).toBeTruthy()
    const command = screen.getByText(result.commandHint)
    expect(command.closest("details")?.open).toBe(false)
    expect(screen.queryByText("localValidationSecure")).toBeNull()
    expect(screen.queryByText("authenticatedData")).toBeNull()
    expect(screen.queryByText("tlsVerifiedQuerySucceeded")).toBeNull()
  })

  it("falls back to unknown copy for unsupported backend status and detail values", () => {
    render(
      <DnsSecPanel
        loading={false}
        result={{
          ...result,
          dnssecStatus: "unexpected-status",
          dnssecDetail: "unexpected-detail",
          dohDetail: "unexpected-doh-detail",
          dotDetail: "unexpected-dot-detail",
        }}
        toolEnabled
        onRun={() => undefined}
      />,
    )

    expect(screen.getByText("networkProbe.dnssec.statusValue.unknown")).toBeTruthy()
    expect(screen.getByText("networkProbe.dnssec.details.unknown")).toBeTruthy()
    expect(screen.getByText("networkProbe.dnssec.dohDetails.unknown")).toBeTruthy()
    expect(screen.getByText("networkProbe.dnssec.dotDetails.unknown")).toBeTruthy()
    expect(screen.queryByText("unexpected-status")).toBeNull()
    expect(screen.queryByText("unexpected-detail")).toBeNull()
    expect(screen.queryByText("unexpected-doh-detail")).toBeNull()
    expect(screen.queryByText("unexpected-dot-detail")).toBeNull()
  })

  it("describes a TLS-verified DNS response without implying the answer was successful", () => {
    render(
      <DnsSecPanel
        loading={false}
        result={{
          ...result,
          dnssecStatus: "unknown",
          dnssecDetail: "resolverServfail",
          dotOk: true,
          dotDetail: "tlsVerifiedDnsResponse",
        }}
        toolEnabled
        onRun={() => undefined}
      />,
    )

    expect(screen.getByText("networkProbe.dnssec.dotOkMs")).toBeTruthy()
    expect(screen.getByText("networkProbe.dnssec.dotDetails.tlsVerifiedDnsResponse")).toBeTruthy()
    expect(screen.getByText("networkProbe.dnssec.details.resolverServfail")).toBeTruthy()
  })
})
