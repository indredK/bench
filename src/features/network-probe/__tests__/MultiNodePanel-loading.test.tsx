import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MultiNodePanel } from "@/features/network-probe/components/MultiNodePanel"
import type { ProbeNode } from "@/lib/tauri/types/network-probe"

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

const nodes: ProbeNode[] = [{ id: "local", kind: "local", label: "This Mac", reachable: true }]

function createProps(loadingNodes: boolean) {
  return {
    loading: false,
    loadingNodes,
    agentAction: null,
    result: null,
    nodes,
    toolEnabled: true,
    onCompare: vi.fn(),
    onRefreshNodes: vi.fn(),
    onAddAgent: vi.fn(),
    onRemoveAgent: vi.fn(),
  }
}

afterEach(() => cleanup())

describe("MultiNodePanel node loading", () => {
  it("localizes the built-in node label in the node list and DNS results", () => {
    const props = {
      ...createProps(false),
      result: {
        domain: "example.com",
        answers: [
          {
            nodeId: "local",
            nodeLabel: "This Mac",
            ok: true,
            answers: ["192.0.2.1"],
          },
        ],
        elapsedMs: 1,
        commandHint: "",
      },
    }

    render(<MultiNodePanel {...props} />)

    expect(screen.getAllByText("networkProbe.nodeSelect.local")).toHaveLength(2)
    expect(document.body).not.toHaveTextContent("This Mac")
  })

  it("reports loading and blocks comparisons until the node list is ready", () => {
    const view = render(<MultiNodePanel {...createProps(true)} />)

    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.nodes.loading")
    expect(screen.getByRole("button", { name: "networkProbe.nodes.refreshing" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.nodes.run" })).toBeDisabled()

    view.rerender(<MultiNodePanel {...createProps(false)} />)

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "networkProbe.nodes.run" })).toBeEnabled()
  })

  it("does not start a comparison from a button disabled during node loading", () => {
    const props = createProps(true)
    render(<MultiNodePanel {...props} />)

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.run" }))

    expect(props.onCompare).not.toHaveBeenCalled()
  })

  it("blocks insecure agent URLs and explains the validation error before submit", () => {
    const props = createProps(false)
    render(<MultiNodePanel {...props} />)

    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "Lab" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.endpointPlaceholder"), {
      target: { value: "http://agent.example.test" },
    })

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.endpointError.scheme")
    expect(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" }))
    expect(props.onAddAgent).not.toHaveBeenCalled()
  })

  it("rejects credentials and query parameters in an agent URL", () => {
    const props = createProps(false)
    render(<MultiNodePanel {...props} />)

    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "Lab" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.endpointPlaceholder"), {
      target: { value: "https://agent.example.test?token=secret" },
    })

    expect(screen.getByRole("alert")).toHaveTextContent(
      "networkProbe.nodes.endpointError.credentials",
    )
    expect(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })).toBeDisabled()
  })

  it("accepts a WSS endpoint and renders the latest health result", () => {
    const props = {
      ...createProps(false),
      nodes: [
        ...nodes,
        {
          id: "agent-1",
          kind: "remote-agent" as const,
          label: "Lab",
          endpoint: "wss://agent.example.test",
          reachable: true,
        },
      ],
    }
    render(<MultiNodePanel {...props} />)

    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "Another lab" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.endpointPlaceholder"), {
      target: { value: "wss://agent.example.test" },
    })

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })).toBeEnabled()
    expect(screen.getByText("networkProbe.nodes.agentReachable")).toBeInTheDocument()
  })
})
