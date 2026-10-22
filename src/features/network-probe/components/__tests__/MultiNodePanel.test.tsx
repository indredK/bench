import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MultiNodePanel } from "@/features/network-probe/components/MultiNodePanel"
import type { ProbeNode } from "@/lib/tauri/types/network-probe"

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
