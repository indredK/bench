import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { DnsLookupPanel } from "@/features/network-probe/components/DnsLookupPanel"
import { ProbeTargetPanel } from "@/features/network-probe/components/ProbeTargetPanel"
import { TcpConnectPanel } from "@/features/network-probe/components/TcpConnectPanel"
import { WhoisPanel } from "@/features/network-probe/components/WhoisPanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { query?: string }) =>
      values?.query ? `${key}: ${values.query}` : key,
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ hint, children }: { hint: string; children: ReactNode }) => (
    <span data-command-hint={hint}>{children}</span>
  ),
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ children, toolbar }: { children: ReactNode; toolbar: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

describe("target probe results", () => {
  it("identifies the TCP host and port and locks inputs while connecting", () => {
    render(
      <TcpConnectPanel
        loading
        result={{
          host: "test.example",
          port: 8443,
          status: "ok",
          rttMs: 4,
          commandHint: "tcpConnect()",
        }}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByLabelText("networkProbe.tcp.host")).toBeDisabled()
    expect(screen.getByLabelText("networkProbe.tcp.port")).toBeDisabled()
    expect(screen.getByText(/test\.example/)).toBeInTheDocument()
    expect(screen.getByText(/8443/)).toBeInTheDocument()
  })

  it("identifies the DNS domain and locks inputs while looking up", () => {
    render(
      <DnsLookupPanel
        loading
        result={{
          domain: "test.example",
          rrType: "AAAA",
          resolver: "9.9.9.9",
          elapsedMs: 4,
          records: [],
          commandHint: "dnsLookup()",
        }}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByLabelText("networkProbe.dns.domain")).toBeDisabled()
    expect(screen.getByLabelText("networkProbe.dns.rrType")).toBeDisabled()
    expect(screen.getByLabelText("networkProbe.dns.resolver")).toBeDisabled()
    expect(screen.getByText("test.example")).toBeInTheDocument()
  })

  it("identifies the input used by a custom host or URL probe", () => {
    render(
      <ProbeTargetPanel
        loading
        result={{ input: "https://test.example/health", kind: "url", commandHint: "probeTarget()" }}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByLabelText("networkProbe.probe.input")).toBeDisabled()
    expect(screen.getByText("https://test.example/health")).toBeInTheDocument()
  })

  it("identifies the RDAP query while the next lookup is loading", () => {
    render(
      <WhoisPanel
        loading
        result={{
          query: "1.1.1.1",
          source: "rdap.org",
          rawText: "{}",
          partial: false,
          commandHint: "whoisLookup()",
        }}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByLabelText("networkProbe.whois.query")).toBeDisabled()
    expect(screen.getByText("networkProbe.whois.resultFor: 1.1.1.1")).toBeInTheDocument()
  })
})
