import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PollutionPanel } from "@/features/network-probe/components/PollutionPanel"

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

describe("PollutionPanel findings", () => {
  it("localizes stable finding codes and keeps raw evidence collapsed", () => {
    const evidence = "Could not verify HTTPS: proxy connection refused"
    const commandHint = "checkSsl('example.com')"

    render(
      <PollutionPanel
        loading={false}
        result={{
          domain: "example.com",
          elapsedMs: 10,
          commandHint: "detectPollution(local, 'example.com')",
          findings: [
            {
              code: "tls_probe_failed",
              kind: "tls",
              severity: "warn",
              evidence,
              commandHint,
            },
          ],
        }}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.pollution.kind.tls")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.pollution.severity.warn")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.pollution.finding.tlsProbeFailed")).toBeInTheDocument()

    const details = screen.getByText(evidence).closest("details")
    expect(details).not.toHaveAttribute("open")
    expect(screen.getByText(evidence)).toBeInTheDocument()

    fireEvent.click(screen.getByText("networkProbe.systemDetail"))

    expect(details).toHaveAttribute("open")
    expect(screen.getByText(commandHint)).toBeInTheDocument()
  })

  it("uses localized fallbacks for unknown finding codes, kinds, and severity", () => {
    render(
      <PollutionPanel
        loading={false}
        result={{
          domain: "example.com",
          elapsedMs: 1,
          commandHint: "detectPollution()",
          findings: [
            {
              code: "__proto__",
              kind: "constructor",
              severity: "toString",
              evidence: "future raw diagnostic",
              commandHint: "futureCommand()",
            },
          ],
        }}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.pollution.kind.unknown")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.pollution.severity.unknown")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.pollution.finding.unknown")).toBeInTheDocument()
    expect(screen.queryByText("__proto__")).not.toBeInTheDocument()
    expect(screen.queryByText("constructor")).not.toBeInTheDocument()
    expect(screen.queryByText("toString")).not.toBeInTheDocument()
  })
})
