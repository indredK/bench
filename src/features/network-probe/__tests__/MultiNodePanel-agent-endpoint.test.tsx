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

  it("localizes node kinds and keeps long endpoints within the node list", () => {
    const endpoint = `wss://agent.example.test/${"long-segment/".repeat(30)}`
    const props = createProps([
      localNode,
      {
        id: "globalping-us",
        kind: "remote-proxy",
        label: "US",
        endpoint: "globalping:US",
        reachable: true,
      },
      {
        id: "agent-1",
        kind: "remote-agent",
        label: "Lab",
        endpoint,
        reachable: true,
      },
      {
        id: "unknown-1",
        kind: "future-node-kind",
        label: "Unknown",
        reachable: false,
      },
    ])
    render(<MultiNodePanel {...props} />)

    expect(screen.getByText("networkProbe.nodes.labels.local")).toBeInTheDocument()
    expect(screen.getByText(/networkProbe\.nodes\.kind\.remoteProxy/)).toBeInTheDocument()
    expect(screen.getByText(/networkProbe\.nodes\.kind\.remoteAgent/)).toBeInTheDocument()
    expect(screen.getByText(/networkProbe\.nodes\.kind\.unknown/)).toBeInTheDocument()
    expect(screen.queryByText("remote-agent")).not.toBeInTheDocument()
    expect(screen.queryByText("globalping:US")).not.toBeInTheDocument()
    expect(screen.getByText(endpoint)).toHaveAttribute("title", endpoint)
    expect(screen.getByText(endpoint)).toHaveClass("truncate")
  })

  it("localizes successful and failed multi-node result states", () => {
    const props = createProps()
    props.result = {
      domain: "example.com",
      answers: [
        { nodeId: "local", nodeLabel: "This Mac", ok: true, answers: ["192.0.2.1"] },
        {
          nodeId: "remote-1",
          nodeLabel: "London",
          ok: false,
          answers: [],
          failureKind: "noAnswers",
        },
      ],
      elapsedMs: 42,
      sessionId: "session-1",
      cancelled: false,
      commandHint: "",
    }
    render(<MultiNodePanel {...props} />)

    expect(screen.getByText("networkProbe.nodes.answerStatus.success")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.answerStatus.failed")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.failures.noAnswers")).toBeInTheDocument()
    expect(screen.getAllByText("networkProbe.nodes.labels.local")).toHaveLength(2)
    expect(screen.queryByText("This Mac")).not.toBeInTheDocument()
    expect(screen.queryByText("OK")).not.toBeInTheDocument()
    expect(screen.queryByText("FAIL")).not.toBeInTheDocument()
  })

  it.each([
    ["request", "networkProbe.nodes.failures.localRequest", "networkProbe.nodes.failures.request"],
    ["timeout", "networkProbe.nodes.failures.localTimeout", "networkProbe.nodes.failures.timeout"],
  ] as const)(
    "uses local DNS copy for local %s failures",
    (failureKind, localKey, globalpingKey) => {
      const props = createProps()
      props.result = {
        domain: "bench-qa-no-such-host.invalid",
        answers: [
          {
            nodeId: "local",
            nodeLabel: "This Mac",
            ok: false,
            answers: [],
            failureKind,
          },
        ],
        elapsedMs: 5,
        sessionId: "session-1",
        cancelled: false,
        commandHint: "",
      }
      render(<MultiNodePanel {...props} />)

      expect(screen.getByText(localKey)).toBeInTheDocument()
      expect(screen.queryByText(globalpingKey)).not.toBeInTheDocument()
    },
  )

  it("keeps Globalping request failures attributed to Globalping", () => {
    const props = createProps()
    props.result = {
      domain: "example.com",
      answers: [
        {
          nodeId: "globalping",
          nodeLabel: "Globalping",
          ok: false,
          answers: [],
          failureKind: "request",
        },
      ],
      elapsedMs: 8,
      sessionId: "session-1",
      cancelled: false,
      commandHint: "",
    }
    render(<MultiNodePanel {...props} />)

    expect(screen.getByText("networkProbe.nodes.failures.request")).toBeInTheDocument()
    expect(screen.queryByText("networkProbe.nodes.failures.localRequest")).not.toBeInTheDocument()
  })
})
