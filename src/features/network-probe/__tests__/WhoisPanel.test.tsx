import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { WhoisPanel } from "@/features/network-probe/components/WhoisPanel"
import type { WhoisInfo } from "@/lib/tauri/types/network-probe"

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

const result: WhoisInfo = {
  query: "example.invalid",
  source: "rdap.org (HTTP 404 Not Found)",
  rawText: "RDAP returned HTTP 404 Not Found\nWHOIS fallback failed: no referral",
  partial: true,
  errorCode: "httpError",
  httpStatus: 404,
  message: "RDAP returned HTTP 404: error body\nWHOIS fallback failed: no referral",
  commandHint: "whois('example.invalid')",
}

afterEach(() => cleanup())

describe("WhoisPanel result visibility", () => {
  it("keeps failure diagnostics and command hints inside a collapsed disclosure", () => {
    render(<WhoisPanel loading={false} result={result} toolEnabled onRun={() => undefined} />)

    const details = screen.getByText("networkProbe.whois.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText("networkProbe.whois.errors.httpError")).toBeTruthy()
    expect(screen.getByText("rdap.org")).toBeTruthy()
    expect(screen.queryByText(result.source)).toBeNull()
    expect(screen.queryByText("(networkProbe.whois.partial)")).toBeNull()
    const detailText = Array.from(details?.querySelectorAll("pre") ?? []).map(
      (element) => element.textContent,
    )
    expect(detailText).toContain(result.message)
    expect(detailText).toContain(result.rawText)
    expect(detailText).toContain(result.commandHint)
  })

  it("keeps a truncated response visible while collapsing its diagnostic command", () => {
    render(
      <WhoisPanel
        loading={false}
        result={{
          ...result,
          source: "rdap.org (HTTP 200 OK)",
          rawText: "partial RDAP response",
          errorCode: "responseTruncated",
          message: "RDAP response exceeded the display limit.",
        }}
        toolEnabled
        onRun={() => undefined}
      />,
    )

    expect(screen.getByText("partial RDAP response").closest("details")).toBeNull()
    expect(screen.getByText("(networkProbe.whois.partial)")).toBeTruthy()
    const details = screen.getByText("networkProbe.whois.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain("whois('example.invalid')")
  })

  it("keeps successful response text visible and collapses the command hint", () => {
    render(
      <WhoisPanel
        loading={false}
        result={{
          ...result,
          source: "rdap.org (HTTP 200 OK)",
          rawText: "successful RDAP response",
          errorCode: undefined,
          httpStatus: undefined,
          message: undefined,
          partial: false,
        }}
        toolEnabled
        onRun={() => undefined}
      />,
    )

    expect(screen.getByText("successful RDAP response").closest("details")).toBeNull()
    const details = screen.getByText("networkProbe.whois.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText("whois('example.invalid')").closest("details")).toBe(details)
  })

  it("uses a localized fallback for prototype-key error codes", () => {
    render(
      <WhoisPanel
        loading={false}
        result={{ ...result, errorCode: "constructor" as unknown as WhoisInfo["errorCode"] }}
        toolEnabled
        onRun={() => undefined}
      />,
    )

    expect(screen.getByText("networkProbe.whois.errors.unknown")).toBeTruthy()
    expect(screen.queryByText("constructor")).toBeNull()
  })
})
