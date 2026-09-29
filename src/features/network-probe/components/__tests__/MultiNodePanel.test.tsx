import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MultiNodePanel } from "../MultiNodePanel"
import type {
  AgentMeasurementResult,
  GlobalpingMeasurementResult,
  ProbeNode,
} from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { location?: string }) =>
      key === "networkProbe.nodes.globalpingNode" ? `${key}(${options?.location ?? ""})` : key,
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({
    toolbar,
    children,
  }: {
    toolbar: React.ReactNode
    children: React.ReactNode
  }) => (
    <section>
      {toolbar}
      {children}
    </section>
  ),
}))

function renderPanel(overrides: Partial<React.ComponentProps<typeof MultiNodePanel>> = {}) {
  return render(
    <MultiNodePanel
      loading={false}
      loadingNodes={false}
      nodesStatus="loaded"
      agentMutation={null}
      result={null}
      agentMeasurementResults={{}}
      agentMeasurementLoadingById={{}}
      nodes={[]}
      toolEnabled
      onRunMeasurement={() => {}}
      onGetTokenStatus={() => new Promise(() => {})}
      onSaveToken={() => Promise.resolve(true)}
      onClearToken={() => Promise.resolve(true)}
      onRefreshNodes={() => {}}
      onAddAgent={() => Promise.resolve(false)}
      onSetAgentToken={() => Promise.resolve(false)}
      onRunAgentMeasurement={() => Promise.resolve(null)}
      onRemoveAgent={() => Promise.resolve(false)}
      {...overrides}
    />,
  )
}

describe("MultiNodePanel agent states", () => {
  it("shows an empty node message", () => {
    renderPanel()

    expect(screen.getByText("networkProbe.nodes.empty")).toBeInTheDocument()
  })

  it("shows localized node names without exposing internal routing identifiers", () => {
    const nodes: ProbeNode[] = [
      {
        id: "local",
        kind: "local",
        label: "This Mac",
        reachable: true,
      },
      {
        id: "gp-world",
        kind: "remote-proxy",
        label: "Globalping · world",
        reachable: true,
        endpoint: "globalping:world",
        region: "world",
      },
      {
        id: "agent-test-id",
        kind: "remote-agent",
        label: "Lab node",
        reachable: true,
        endpoint: "https://agent.example",
      },
    ]
    renderPanel({ nodes })

    const nodeList = screen.getByRole("list")
    expect(nodeList).toHaveTextContent("networkProbe.nodes.localNode")
    expect(nodeList).toHaveTextContent(
      "networkProbe.nodes.globalpingNode(networkProbe.nodes.locationWorld)",
    )
    expect(nodeList).toHaveTextContent("Lab node")
    expect(nodeList).not.toHaveTextContent("remote-proxy")
    expect(nodeList).not.toHaveTextContent("globalping:world")
    expect(nodeList).not.toHaveTextContent("agent-test-id")
    expect(nodeList).not.toHaveTextContent("https://agent.example")
  })

  it("limits selected Globalping locations to three and keeps one selected", () => {
    renderPanel()

    const world = screen.getByRole("button", { name: "networkProbe.nodes.locationWorld" })
    fireEvent.click(world)
    expect(world).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.locationUs" }))
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.locationEurope" }))
    const asia = screen.getByRole("button", { name: "networkProbe.nodes.locationAsia" })
    expect(asia).toBeDisabled()
    expect(screen.getByText("networkProbe.nodes.locationCount")).toBeInTheDocument()
  })

  it("passes the selected remote measurement mode, target, and regions", () => {
    const onRunMeasurement = vi.fn()
    renderPanel({ onRunMeasurement })

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.modePing" }))
    fireEvent.change(screen.getByRole("textbox", { name: "networkProbe.nodes.targetLabel" }), {
      target: { value: "1.1.1.1" },
    })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.locationUs" }))
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.run" }))

    expect(onRunMeasurement).toHaveBeenCalledWith("ping", "1.1.1.1", ["world", "US"])
  })

  it("blocks cloud metadata and link-local targets for remote measurements", () => {
    const onRunMeasurement = vi.fn()
    const onRunAgentMeasurement = vi.fn()
    const node: ProbeNode = {
      id: "agent-1",
      kind: "remote-agent",
      label: "Lab",
      reachable: true,
      endpoint: "https://agent.example",
    }
    renderPanel({ nodes: [node], onRunMeasurement, onRunAgentMeasurement })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.modeHttp" }))
    const target = screen.getByRole("textbox", { name: "networkProbe.nodes.targetLabel" })
    fireEvent.change(target, { target: { value: "http://169.254.169.254/latest/meta-data" } })

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.targetRemoteBlocked")
    expect(screen.getByRole("button", { name: "networkProbe.nodes.run" })).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "networkProbe.nodes.measureFromAgent" }),
    ).toBeDisabled()
    expect(onRunMeasurement).not.toHaveBeenCalled()
    expect(onRunAgentMeasurement).not.toHaveBeenCalled()
  })

  it("blocks agent-localhost targets through common IP literal forms", () => {
    const node: ProbeNode = {
      id: "agent-1",
      kind: "remote-agent",
      label: "Lab",
      reachable: true,
      endpoint: "https://agent.example",
    }
    renderPanel({ nodes: [node] })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.modeHttp" }))
    const target = screen.getByRole("textbox", { name: "networkProbe.nodes.targetLabel" })

    for (const value of [
      "http://localhost/admin",
      "http://printer.localhost/",
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://2852039166/",
      "http://0251.0376.0251.0376/",
    ]) {
      fireEvent.change(target, { target: { value } })
      expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.targetRemoteBlocked")
    }
  })

  it("shows an agent measurement by node with retry information", () => {
    const result: AgentMeasurementResult = {
      nodeId: "agent-1",
      measurementType: "http",
      target: "https://example.com/health",
      status: "rate-limited",
      elapsedMs: 42,
      retryAfterSeconds: 17,
      probe: {
        id: "agent-1",
        label: "Lab",
        status: "failed",
        summary: "rate-limited",
        answers: [],
        httpStatusCode: 503,
        failureSource: "agent",
      },
    }
    const node: ProbeNode = {
      id: "agent-1",
      kind: "remote-agent",
      label: "Lab",
      reachable: true,
      endpoint: "https://agent.example",
    }
    renderPanel({ nodes: [node], agentMeasurementResults: { [node.id]: result } })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.modeHttp" }))
    fireEvent.change(screen.getByRole("textbox", { name: "networkProbe.nodes.targetLabel" }), {
      target: { value: "https://example.com/health" },
    })

    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.nodes.agentRateLimited")
    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.nodes.httpStatus")
    expect(screen.getByRole("status")).toHaveTextContent("https://example.com/health")
    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.nodes.elapsedMs")
  })

  it("shows a bounded result summary without relying on English OK/FAIL labels", () => {
    const result: GlobalpingMeasurementResult = {
      measurementType: "http",
      target: "https://example.com/health",
      status: "complete",
      probes: [
        {
          id: "globalping-0",
          label: "Berlin, DE",
          status: "finished",
          answers: [],
          httpStatusCode: 503,
          totalTimeMs: 52,
        },
      ],
      elapsedMs: 1000,
      commandHint: "globalping http example.com locations=world",
    }
    renderPanel({ result })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.modeHttp" }))
    fireEvent.change(screen.getByRole("textbox", { name: "networkProbe.nodes.targetLabel" }), {
      target: { value: "https://example.com/health" },
    })

    expect(screen.getByText("networkProbe.nodes.httpStatus")).toBeInTheDocument()
    expect(screen.queryByText("OK")).not.toBeInTheDocument()
    expect(screen.queryByText("FAIL")).not.toBeInTheDocument()
  })

  it("hides stale agent results when the selected target changes", () => {
    const node: ProbeNode = {
      id: "agent-1",
      kind: "remote-agent",
      label: "Lab",
      reachable: true,
      endpoint: "https://agent.example",
    }
    const result: AgentMeasurementResult = {
      nodeId: node.id,
      measurementType: "dns",
      target: "example.com",
      status: "complete",
      elapsedMs: 18,
      probe: {
        id: node.id,
        label: node.label,
        status: "finished",
        answers: ["203.0.113.7"],
        dnsRcode: "NOERROR",
      },
    }
    renderPanel({ nodes: [node], agentMeasurementResults: { [node.id]: result } })

    fireEvent.change(screen.getByRole("textbox", { name: "networkProbe.nodes.targetLabel" }), {
      target: { value: "other.example" },
    })

    expect(screen.queryByText("203.0.113.7")).not.toBeInTheDocument()
    expect(screen.getAllByText("networkProbe.nodes.comparisonNoResult")).toHaveLength(2)
  })

  it("does not align results with a different HTTP query string", () => {
    const node: ProbeNode = {
      id: "agent-1",
      kind: "remote-agent",
      label: "Lab",
      reachable: true,
      endpoint: "https://agent.example",
    }
    const globalpingResult: GlobalpingMeasurementResult = {
      measurementType: "http",
      target: "https://example.com/health?token=previous",
      status: "complete",
      probes: [
        {
          id: "globalping-0",
          label: "Berlin, DE",
          status: "finished",
          answers: [],
          httpStatusCode: 204,
        },
      ],
      elapsedMs: 120,
      commandHint: "globalping http example.com locations=world",
    }
    const agentResult: AgentMeasurementResult = {
      nodeId: node.id,
      measurementType: "http",
      target: "https://example.com/health?token=previous",
      status: "complete",
      elapsedMs: 90,
      probe: {
        id: node.id,
        label: node.label,
        status: "finished",
        answers: [],
        httpStatusCode: 200,
      },
    }
    const { container } = renderPanel({
      nodes: [node],
      result: globalpingResult,
      agentMeasurementResults: { [node.id]: agentResult },
    })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.modeHttp" }))
    fireEvent.change(screen.getByRole("textbox", { name: "networkProbe.nodes.targetLabel" }), {
      target: { value: "https://EXAMPLE.com/health?token=current" },
    })

    expect(screen.queryByText("networkProbe.nodes.httpStatus")).not.toBeInTheDocument()
    expect(screen.getAllByText("networkProbe.nodes.comparisonNoResult")).toHaveLength(2)
    expect(screen.getByText("networkProbe.nodes.comparisonTarget")).toBeInTheDocument()
    expect(container.textContent).not.toContain("token=")
  })

  it("aligns equal HTTP queries but keeps query strings and provider details out of the UI", () => {
    const node: ProbeNode = {
      id: "agent-1",
      kind: "remote-agent",
      label: "Lab",
      reachable: true,
      endpoint: "https://agent.example",
    }
    const queryTarget = "https://example.com/health?token=private"
    const globalpingResult: GlobalpingMeasurementResult = {
      measurementType: "http",
      target: queryTarget,
      status: "complete",
      probes: [
        {
          id: "globalping-0",
          label: "Berlin, DE",
          status: "finished",
          answers: [],
          httpStatusCode: 204,
          detail: `Request failed for ${queryTarget}`,
        },
      ],
      elapsedMs: 120,
      commandHint: "globalping http example.com locations=world",
    }
    const agentResult: AgentMeasurementResult = {
      nodeId: node.id,
      measurementType: "http",
      target: queryTarget,
      status: "complete",
      elapsedMs: 90,
      probe: {
        id: node.id,
        label: node.label,
        status: "finished",
        answers: [],
        httpStatusCode: 200,
      },
    }
    const { container } = renderPanel({
      nodes: [node],
      result: globalpingResult,
      agentMeasurementResults: { [node.id]: agentResult },
    })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.modeHttp" }))
    fireEvent.change(screen.getByRole("textbox", { name: "networkProbe.nodes.targetLabel" }), {
      target: { value: "https://EXAMPLE.com/health?token=private" },
    })

    expect(screen.getAllByText("networkProbe.nodes.httpStatus")).toHaveLength(2)
    expect(container.textContent).not.toContain("token=private")
    expect(container.textContent).not.toContain("Request failed for")
  })

  it("distinguishes a failed node request from a successful empty result", () => {
    renderPanel({ nodesStatus: "failed" })

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.loadFailed")
    expect(screen.queryByText("networkProbe.nodes.empty")).not.toBeInTheDocument()
  })

  it("blocks repeat agent mutations and shows the current operation", () => {
    renderPanel({ agentMutation: { kind: "add" } })

    expect(screen.getByRole("button", { name: "networkProbe.nodes.addingAgent" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.nodes.refresh" })).toBeDisabled()
  })

  it("identifies the agent currently being removed", () => {
    const node: ProbeNode = {
      id: "agent-1",
      kind: "remote-agent",
      label: "Lab",
      reachable: true,
      endpoint: "https://agent.example",
      capabilities: ["dns"],
    }
    renderPanel({ nodes: [node], agentMutation: { kind: "remove", agentId: node.id } })

    expect(screen.getByRole("button", { name: "networkProbe.nodes.removingAgent" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })).toBeDisabled()
  })

  it("explains and blocks unsupported transports and URL credentials before submission", () => {
    const onAddAgent = vi.fn()
    renderPanel({ onAddAgent })
    fireEvent.change(screen.getByPlaceholderText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "Lab" },
    })
    const endpoint = screen.getByPlaceholderText("networkProbe.nodes.endpointPlaceholder")
    fireEvent.change(endpoint, { target: { value: "wss://agent.example" } })
    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.endpointHttpsOnly")
    expect(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })).toBeDisabled()

    fireEvent.change(endpoint, { target: { value: "https://agent.example/?token=secret" } })
    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.endpointNoCredentials")
    fireEvent.change(endpoint, { target: { value: "https://agent.example/?" } })
    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.endpointNoCredentials")
    fireEvent.change(endpoint, { target: { value: "https://agent.example/#" } })
    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.endpointNoCredentials")
    fireEvent.change(endpoint, { target: { value: "https://@agent.example" } })
    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.endpointNoCredentials")
    expect(onAddAgent).not.toHaveBeenCalled()
  })

  it("rejects even empty URL userinfo in remote HTTP targets", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.modeHttp" }))
    fireEvent.change(screen.getByRole("textbox", { name: "networkProbe.nodes.targetLabel" }), {
      target: { value: "http://@example.com/" },
    })

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.targetHttpCredentials")
  })

  it("clears agent details only after a successful registration", async () => {
    const onAddAgent = vi.fn().mockResolvedValue(true)
    renderPanel({ onAddAgent })
    const label = screen.getByPlaceholderText("networkProbe.nodes.labelPlaceholder")
    const endpoint = screen.getByPlaceholderText("networkProbe.nodes.endpointPlaceholder")
    fireEvent.change(label, { target: { value: "Lab" } })
    fireEvent.change(endpoint, { target: { value: "https://agent.example" } })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.newAgentTokenLabel"), {
      target: { value: "test-agent-token" },
    })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" }))

    await waitFor(() => {
      expect(onAddAgent).toHaveBeenCalledWith("Lab", "https://agent.example", "test-agent-token")
      expect(label).toHaveValue("")
      expect(endpoint).toHaveValue("")
    })
  })

  it("shows connectivity and prevents removal while an agent measurement is running", () => {
    const node: ProbeNode = {
      id: "agent-1",
      kind: "remote-agent",
      label: "Lab",
      reachable: false,
      endpoint: "https://agent.example",
    }
    renderPanel({ nodes: [node], agentMeasurementLoadingById: { [node.id]: true } })

    expect(screen.getByText("networkProbe.nodes.agentOffline")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "networkProbe.nodes.removeAgent" })).toBeDisabled()
  })

  it("confirms removal before deleting an agent and its saved credential", async () => {
    const onRemoveAgent = vi.fn().mockResolvedValue(true)
    const node: ProbeNode = {
      id: "agent-1",
      kind: "remote-agent",
      label: "Lab",
      reachable: true,
      endpoint: "https://agent.example",
    }
    renderPanel({ nodes: [node], onRemoveAgent })

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.removeAgent" }))
    expect(onRemoveAgent).not.toHaveBeenCalled()
    expect(screen.getByText("networkProbe.nodes.agentRemoveTitle")).toBeInTheDocument()
    const confirmButtons = screen.getAllByRole("button", { name: "networkProbe.nodes.removeAgent" })
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!)

    await waitFor(() => expect(onRemoveAgent).toHaveBeenCalledWith(node.id))
  })
})
