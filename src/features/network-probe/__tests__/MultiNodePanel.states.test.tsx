import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const { t } = vi.hoisted(() => {
  const messages: Record<string, string> = {
    "networkProbe.nodes.hint": "Remote checks send the domain to Globalping.",
    "networkProbe.nodes.run": "Compare DNS",
    "networkProbe.nodes.running": "Comparing…",
    "networkProbe.nodes.refresh": "Refresh nodes",
    "networkProbe.nodes.refreshingAction": "Refreshing…",
    "networkProbe.nodes.loading": "Loading probe nodes…",
    "networkProbe.nodes.refreshing": "Refreshing probe nodes…",
    "networkProbe.nodes.loadFailed": "Could not load probe nodes. Use Refresh nodes to retry.",
    "networkProbe.nodes.empty": "No probe nodes are available yet.",
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
    "networkProbe.nodes.working": "Working…",
    "networkProbe.nodes.removeAgent": "Remove",
    "networkProbe.caps.toolDisabled": "{{tool}} unavailable",
    "networkProbe.cmd.compareDns": "compareDns()",
    "networkProbe.cmd.addAgent": "addAgent()",
  }
  return { t: (key: string) => messages[key] ?? key }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t }),
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

function createProps(overrides: Partial<Parameters<typeof MultiNodePanel>[0]> = {}) {
  return {
    loading: false,
    loadingNodes: false,
    agentAction: null,
    nodesLoadFailed: false,
    result: null,
    nodes: [],
    toolEnabled: true,
    onCompare: vi.fn(),
    onRefreshNodes: vi.fn(),
    onAddAgent: vi.fn(),
    onRemoveAgent: vi.fn(),
    ...overrides,
  }
}

describe("MultiNodePanel node list states", () => {
  it("discloses that the domain is sent to Globalping for remote checks", () => {
    render(<MultiNodePanel {...createProps()} />)
    expect(screen.getByText("Remote checks send the domain to Globalping.")).toBeInTheDocument()
  })

  it("explains initial loading and an empty list", () => {
    const { rerender } = render(<MultiNodePanel {...createProps({ loadingNodes: true })} />)
    expect(screen.getByRole("status")).toHaveTextContent("Loading probe nodes…")
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled()

    rerender(<MultiNodePanel {...createProps()} />)
    expect(screen.getByRole("status")).toHaveTextContent("No probe nodes are available yet.")
  })

  it("keeps the previous node visible and explains refresh failure", () => {
    const node = {
      id: "local",
      label: "This device",
      kind: "local" as const,
      reachable: true,
    }
    render(<MultiNodePanel {...createProps({ nodes: [node], nodesLoadFailed: true })} />)

    expect(screen.getByText("This device · local")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Could not load probe nodes")
  })

  it("announces refreshing while keeping existing nodes", () => {
    const node = {
      id: "local",
      label: "This device",
      kind: "local" as const,
      reachable: true,
    }
    render(<MultiNodePanel {...createProps({ nodes: [node], loadingNodes: true })} />)

    expect(screen.getByRole("status")).toHaveTextContent("Refreshing probe nodes…")
    expect(screen.getByText("This device · local")).toBeInTheDocument()
    expect(screen.getByRole("list")).toHaveAttribute("aria-busy", "true")
  })

  it("renders localized success and failure labels for DNS answers", () => {
    render(
      <MultiNodePanel
        {...createProps({
          result: {
            domain: "example.com",
            elapsedMs: 12,
            commandHint: "compareDns()",
            answers: [
              {
                nodeId: "local",
                nodeLabel: "This device",
                ok: true,
                answers: ["203.0.113.1"],
              },
              {
                nodeId: "remote",
                nodeLabel: "Remote probe",
                ok: false,
                answers: [],
                statusCodeName: "NXDOMAIN",
                detail: "Resolver timed out.",
              },
              {
                nodeId: "empty",
                nodeLabel: "Empty result",
                ok: true,
                answers: [],
                statusCodeName: "NOERROR",
              },
              {
                nodeId: "resolver-error",
                nodeLabel: "Resolver error",
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
                detail: "Measurement did not finish in time.",
              },
            ],
          },
        })}
      />,
    )

    expect(screen.getByText("OK")).toBeInTheDocument()
    expect(screen.getByText("Domain not found")).toBeInTheDocument()
    expect(screen.getByText("No records")).toBeInTheDocument()
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(screen.getByText("Timed out")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.meta")).toHaveAttribute("role", "status")
    expect(screen.getByText("networkProbe.nodes.meta")).toHaveAttribute("aria-live", "polite")
    expect(screen.getAllByText("Technical details")).toHaveLength(3)
    expect(
      screen
        .getAllByText("Technical details")
        .every((element) => !element.closest("details")?.hasAttribute("open")),
    ).toBe(true)
  })
})
