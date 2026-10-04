import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const messages = vi.hoisted(() => ({
  "networkProbe.nodes.hint": "Remote checks send the domain to Globalping.",
  "networkProbe.nodes.run": "Compare DNS",
  "networkProbe.nodes.running": "Comparing…",
  "networkProbe.nodes.resultsLoading":
    "Comparing DNS answers. Results will appear here when the probes finish.",
  "networkProbe.nodes.resultsEmpty": "Run a DNS comparison to see answers from each node.",
  "networkProbe.nodes.refresh": "Refresh nodes",
  "networkProbe.nodes.listTitle": "Probe nodes",
  "networkProbe.nodes.answersLabel": "DNS answers by probe node",
  "networkProbe.nodes.answerOk": "OK",
  "networkProbe.nodes.answerFailed": "Failed",
  "networkProbe.nodes.answerNotFound": "Domain not found",
  "networkProbe.nodes.answerNoRecords": "No records",
  "networkProbe.nodes.answerTimedOut": "Timed out",
  "networkProbe.nodes.technicalDetails": "Technical details",
  "networkProbe.nodes.addTitle": "Add agent",
  "networkProbe.nodes.addHint": "Use a trusted endpoint.",
  "networkProbe.nodes.labelPlaceholder": "Label",
  "networkProbe.nodes.endpointPlaceholder": "Endpoint",
  "networkProbe.nodes.addAgent": "Add agent",
  "networkProbe.nodes.removeAgent": "Remove",
  "networkProbe.nodes.meta": "{{domain}} · {{count}} answers · {{ms}} ms",
  "networkProbe.caps.toolDisabled": "{{tool}} unavailable",
  "networkProbe.cmd.compareDns": "compareDns()",
  "networkProbe.cmd.addAgent": "addAgent()",
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: keyof typeof messages | string, options?: Record<string, string | number>) => {
      const message = messages[key as keyof typeof messages] ?? key
      return message.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ""))
    },
  }),
}))
vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <section>
      {toolbar}
      {children}
    </section>
  ),
}))
vi.mock("@/components/ui/button", () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))
vi.mock("@/components/ui/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))
vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import { MultiNodePanel } from "@/features/network-probe/components/MultiNodePanel"

afterEach(cleanup)

describe("MultiNodePanel Globalping results", () => {
  it("shows a status before the first comparison and while it is loading", () => {
    const panelProps = {
      agentAction: null,
      nodesLoadFailed: false,
      result: null,
      nodes: [],
      toolEnabled: true,
      onCompare: vi.fn(),
      onRefreshNodes: vi.fn(),
      onAddAgent: vi.fn(),
      onRemoveAgent: vi.fn(),
    }

    const { rerender } = render(
      <MultiNodePanel {...panelProps} loading={false} loadingNodes={false} />,
    )

    expect(screen.getByText("Run a DNS comparison to see answers from each node.")).toHaveAttribute(
      "aria-live",
      "polite",
    )

    rerender(<MultiNodePanel {...panelProps} loading loadingNodes={false} />)
    expect(
      screen.getByText("Comparing DNS answers. Results will appear here when the probes finish."),
    ).toHaveAttribute("aria-live", "polite")
  })
  it("localizes DNS response states, keeps diagnostics collapsed, and announces results", () => {
    const nodeStateProps = { agentAction: null, nodesLoadFailed: false }
    render(
      <MultiNodePanel
        {...nodeStateProps}
        loading={false}
        loadingNodes={false}
        result={{
          domain: "example.com",
          elapsedMs: 12,
          commandHint: "compareDns()",
          answers: [
            { nodeId: "local", nodeLabel: "This device", ok: true, answers: ["93.184.216.34"] },
            {
              nodeId: "nxdomain",
              nodeLabel: "Remote NXDOMAIN",
              ok: false,
              answers: [],
              statusCodeName: "NXDOMAIN",
              detail: "domain does not exist",
            },
            {
              nodeId: "no-records",
              nodeLabel: "Empty NOERROR",
              ok: true,
              answers: [],
              statusCodeName: "NOERROR",
            },
            {
              nodeId: "servfail",
              nodeLabel: "Resolver failure",
              ok: false,
              answers: [],
              statusCodeName: "SERVFAIL",
              detail: "raw resolver diagnostic",
            },
            {
              nodeId: "timeout",
              nodeLabel: "Globalping",
              ok: false,
              answers: [],
              errorCode: "GLOBALPING_TIMEOUT",
              detail: "measurement did not finish in time",
            },
          ],
        }}
        nodes={[]}
        toolEnabled
        onCompare={vi.fn()}
        onRefreshNodes={vi.fn()}
        onAddAgent={vi.fn()}
        onRemoveAgent={vi.fn()}
      />,
    )

    expect(screen.getByText("OK")).toBeInTheDocument()
    expect(screen.getByText("Domain not found")).toBeInTheDocument()
    expect(screen.getByText("No records")).toBeInTheDocument()
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(screen.getByText("Timed out")).toBeInTheDocument()

    const summary = screen.getByText("example.com · 5 answers · 12 ms")
    expect(summary).toHaveAttribute("role", "status")
    expect(summary).toHaveAttribute("aria-live", "polite")
    expect(screen.getByRole("list", { name: "DNS answers by probe node" })).toBeInTheDocument()

    const details = screen.getAllByText("Technical details")
    expect(details).toHaveLength(3)
    expect(details.every((element) => !element.closest("details")?.open)).toBe(true)
  })
})
