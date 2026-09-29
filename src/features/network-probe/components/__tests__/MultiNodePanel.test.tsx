import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MultiNodePanel } from "../MultiNodePanel"
import type { ProbeNode } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
      nodes={[]}
      toolEnabled
      onCompare={() => {}}
      onRefreshNodes={() => {}}
      onAddAgent={() => Promise.resolve(false)}
      onRemoveAgent={() => {}}
      {...overrides}
    />,
  )
}

describe("MultiNodePanel agent states", () => {
  it("shows an empty node message", () => {
    renderPanel()

    expect(screen.getByText("networkProbe.nodes.empty")).toBeInTheDocument()
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
    expect(onAddAgent).not.toHaveBeenCalled()
  })

  it("clears agent details only after a successful registration", async () => {
    const onAddAgent = vi.fn().mockResolvedValue(true)
    renderPanel({ onAddAgent })
    const label = screen.getByPlaceholderText("networkProbe.nodes.labelPlaceholder")
    const endpoint = screen.getByPlaceholderText("networkProbe.nodes.endpointPlaceholder")
    fireEvent.change(label, { target: { value: "Lab" } })
    fireEvent.change(endpoint, { target: { value: "https://agent.example" } })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" }))

    await waitFor(() => {
      expect(onAddAgent).toHaveBeenCalledWith("Lab", "https://agent.example")
      expect(label).toHaveValue("")
      expect(endpoint).toHaveValue("")
    })
  })
})
