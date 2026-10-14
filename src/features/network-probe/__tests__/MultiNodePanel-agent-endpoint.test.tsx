import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MultiNodePanel } from "@/features/network-probe/components/MultiNodePanel"
import type { MultiNodeDnsResult, ProbeNode } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "networkProbe.nodes.meta") {
        const count = Number(options?.count ?? 0)
        const answerNoun = count === 1 ? "answer" : "answers"
        return `${options?.domain} · ${count} ${answerNoun} · ${options?.ms} ms`
      }
      return key
    },
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

const localNode: ProbeNode = {
  id: "local",
  kind: "local",
  label: "This Mac",
  reachable: true,
}

function createProps(nodes: ProbeNode[] = [localNode]) {
  return {
    loading: false,
    loadingNodes: false,
    canCancel: false,
    cancelling: false,
    result: null as MultiNodeDnsResult | null,
    nodes,
    toolEnabled: true,
    onCompare: vi.fn(),
    onCancel: vi.fn(),
    onRefreshNodes: vi.fn(),
    onAddAgent: vi.fn(),
    onRemoveAgent: vi.fn(),
  }
}

afterEach(() => cleanup())

describe("MultiNodePanel agent endpoints", () => {
  it("lets the user stop waiting for a Globalping comparison", () => {
    const props = createProps()
    render(<MultiNodePanel {...props} loading canCancel />)

    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.nodes.stopWaitingHint")
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }))

    expect(props.onCancel).toHaveBeenCalledOnce()
    expect(screen.getByPlaceholderText("networkProbe.nodes.domainPlaceholder")).toBeDisabled()
  })

  it("uses singular metadata when exactly one node returns an answer", () => {
    const props = createProps()
    props.result = {
      domain: "example.com",
      answers: [
        {
          nodeId: "local",
          nodeLabel: "This Mac",
          ok: true,
          answers: ["192.0.2.1"],
        },
      ],
      elapsedMs: 12,
      sessionId: "session-1",
      cancelled: false,
      commandHint: "",
    }
    render(<MultiNodePanel {...props} />)

    expect(screen.getByText("example.com · 1 answer · 12 ms")).toBeInTheDocument()
  })

  it("accepts WSS and submits the self-hosted endpoint", () => {
    const props = createProps()
    render(<MultiNodePanel {...props} />)

    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "Lab" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.endpointPlaceholder"), {
      target: { value: "wss://agent.example.test/probe" },
    })

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    const addButton = screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })
    expect(addButton).toBeEnabled()
    fireEvent.click(addButton)
    expect(props.onAddAgent).toHaveBeenCalledWith("Lab", "wss://agent.example.test/probe")
  })

  it("rejects plaintext endpoints before submitting", () => {
    const props = createProps()
    render(<MultiNodePanel {...props} />)

    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "Lab" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.endpointPlaceholder"), {
      target: { value: "http://agent.example.test" },
    })

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.endpointError.scheme")
    expect(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })).toBeDisabled()
    expect(props.onAddAgent).not.toHaveBeenCalled()
  })

  it("rejects URL credentials and query parameters before submitting", () => {
    const props = createProps()
    render(<MultiNodePanel {...props} />)

    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "Lab" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.endpointPlaceholder"), {
      target: { value: "wss://user:secret@agent.example.test?token=secret" },
    })

    expect(screen.getByRole("alert")).toHaveTextContent(
      "networkProbe.nodes.endpointError.credentials",
    )
    expect(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })).toBeDisabled()
    expect(props.onAddAgent).not.toHaveBeenCalled()
  })

  it("shows the most recent health status for registered agents", () => {
    const props = createProps([
      localNode,
      {
        id: "agent-1",
        kind: "remote-agent",
        label: "Lab",
        endpoint: "wss://agent.example.test",
        reachable: true,
      },
      {
        id: "agent-2",
        kind: "remote-agent",
        label: "Offline",
        endpoint: "https://offline.example.test",
        reachable: false,
      },
    ])
    render(<MultiNodePanel {...props} />)

    expect(screen.getByText("networkProbe.nodes.agentReachable")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.agentUnreachable")).toBeInTheDocument()
  })
})
