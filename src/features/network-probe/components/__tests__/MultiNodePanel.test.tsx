import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MultiNodePanel } from "@/features/network-probe/components/MultiNodePanel"
import type { MultiNodeDnsResult, ProbeNode } from "@/lib/tauri/types/network-probe"

const { toastSuccess, toastInfo } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, info: toastInfo },
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

function agent(id = "agent-1", reachable = true): ProbeNode {
  return {
    id,
    kind: "remote-agent",
    label: id,
    reachable,
    endpoint: `https://${id}.example`,
    capabilities: ["dns", "ping", "http"],
  }
}

function renderPanel(overrides: Partial<ComponentProps<typeof MultiNodePanel>> = {}) {
  const props: ComponentProps<typeof MultiNodePanel> = {
    loading: false,
    loadingNodes: false,
    nodesLoadError: null,
    result: null,
    nodes: [],
    agentMutation: null,
    toolEnabled: true,
    onCompare: vi.fn(),
    onRefreshNodes: vi.fn(),
    onAddAgent: vi.fn().mockResolvedValue(agent()),
    onRemoveAgent: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
  render(<MultiNodePanel {...props} />)
  return props
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("MultiNodePanel agent registry UX", () => {
  it("explains an empty registry", () => {
    renderPanel()
    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.nodes.empty")
  })

  it("shows an initial health-check state before the empty state", () => {
    renderPanel({ loadingNodes: true })
    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.nodes.checking")
    expect(screen.queryByText("networkProbe.nodes.empty")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "networkProbe.nodes.refreshing" })).toBeDisabled()
  })

  it("shows a retryable load error instead of claiming the registry is empty", () => {
    const props = renderPanel({ nodesLoadError: "agent registry unreadable" })

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.loadFailed")
    expect(screen.queryByText("networkProbe.nodes.empty")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.retryRefresh" }))
    expect(props.onRefreshNodes).toHaveBeenCalledOnce()
  })

  it("localizes node kinds and shows current reachability", () => {
    renderPanel({
      nodes: [agent("online", true), agent("offline", false)],
    })

    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("networkProbe.nodes.kindRemoteAgent")
    expect(rows[1]).toHaveTextContent("networkProbe.nodes.kindRemoteAgent")
    expect(rows[0]).not.toHaveTextContent("remote-agent")
    expect(screen.getByText("networkProbe.nodes.reachable")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.unreachable")).toBeInTheDocument()
    expect(screen.queryByText("remote-agent")).not.toBeInTheDocument()
  })

  it("uses a localized label for the local node regardless of platform", () => {
    renderPanel({
      nodes: [
        {
          id: "local",
          kind: "local",
          label: "This Mac",
          reachable: true,
        },
      ],
    })

    expect(screen.getByText("networkProbe.nodes.kindLocal")).toBeInTheDocument()
    expect(screen.queryByText("This Mac")).not.toBeInTheDocument()
  })

  it("localizes DNS result status and the local node while preserving remote errors", () => {
    const result: MultiNodeDnsResult = {
      domain: "example.com",
      answers: [
        {
          nodeId: "local",
          nodeLabel: "This Mac",
          ok: true,
          answers: ["A 192.0.2.1"],
        },
        {
          nodeId: "globalping-error",
          nodeLabel: "Globalping",
          ok: false,
          answers: [],
          detail: "Globalping polling timed out.",
        },
      ],
      elapsedMs: 100,
      commandHint: "dnsLookup(multi, 'example.com')",
    }

    renderPanel({ result })

    expect(screen.getByText("networkProbe.nodes.kindLocal")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.answerOk")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.answerFail")).toBeInTheDocument()
    expect(screen.getByText("Globalping polling timed out.")).toBeInTheDocument()
    expect(screen.queryByText("This Mac")).not.toBeInTheDocument()
    expect(screen.queryByText("OK")).not.toBeInTheDocument()
    expect(screen.queryByText("FAIL")).not.toBeInTheDocument()
  })

  it("disables conflicting actions and inputs while an agent mutation is active", () => {
    renderPanel({
      agentMutation: { kind: "remove", agentId: "agent-1" },
      nodes: [agent()],
    })

    expect(screen.getByRole("button", { name: "networkProbe.nodes.refresh" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.nodes.removingAgent" })).toBeDisabled()
    expect(screen.getByLabelText("networkProbe.nodes.labelPlaceholder")).toBeDisabled()
    expect(screen.getByLabelText("networkProbe.nodes.endpointPlaceholder")).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })).toBeDisabled()
  })

  it("reports reachable and unreachable agent registration distinctly", async () => {
    const reachable = renderPanel()
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "office" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.endpointPlaceholder"), {
      target: { value: "wss://office.example/health" },
    })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("networkProbe.nodes.agentAdded"))
    expect(reachable.onAddAgent).toHaveBeenCalledWith("office", "wss://office.example/health")
  })

  it("does not claim that an unreachable registered endpoint passed health check", async () => {
    renderPanel({ onAddAgent: vi.fn().mockResolvedValue(agent("offline", false)) })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "offline" },
    })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" }))

    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith("networkProbe.nodes.agentAddedUnreachable"),
    )
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})
