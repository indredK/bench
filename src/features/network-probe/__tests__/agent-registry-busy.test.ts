import { beforeEach, describe, expect, it, vi } from "vitest"

const { addAgent, listProbeNodes, removeAgent } = vi.hoisted(() => ({
  addAgent: vi.fn(),
  listProbeNodes: vi.fn(),
  removeAgent: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    addAgent,
    listProbeNodes,
    removeAgent,
  },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type { ProbeNode } from "@/lib/tauri/types/network-probe"

const localNode: ProbeNode = {
  id: "local",
  kind: "local",
  label: "This Mac",
  reachable: true,
}

const agentNode: ProbeNode = {
  id: "agent-1",
  kind: "remote-agent",
  label: "Lab",
  endpoint: "wss://agent.example",
  reachable: true,
}

const otherAgentNode: ProbeNode = {
  id: "agent-2",
  kind: "remote-agent",
  label: "Offline",
  endpoint: "https://offline.example",
  reachable: false,
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  addAgent.mockReset()
  listProbeNodes.mockReset()
  removeAgent.mockReset()
  useNetworkProbeStore.setState({
    loadingNodes: false,
    probeNodes: [],
    commandLog: [],
    error: null,
  })
})

describe("network-probe agent registry busy state", () => {
  it("prevents a second add while the first registration is pending", async () => {
    useNetworkProbeStore.setState({ probeNodes: [localNode] })
    const registration = deferred<ProbeNode>()
    addAgent.mockReturnValue(registration.promise)

    const firstAdd = networkProbeUseCases.addAgent("Lab", "https://agent.example")
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(true)

    await networkProbeUseCases.addAgent("Lab", "https://agent.example")

    expect(addAgent).toHaveBeenCalledTimes(1)
    expect(listProbeNodes).not.toHaveBeenCalled()
    expect(useNetworkProbeStore.getState().commandLog).toHaveLength(1)

    registration.resolve(agentNode)
    await firstAdd

    expect(listProbeNodes).not.toHaveBeenCalled()
    expect(useNetworkProbeStore.getState().probeNodes).toEqual([localNode, agentNode])
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
  })

  it("rehydrates the default nodes when registration finishes before bootstrap", async () => {
    addAgent.mockResolvedValue(agentNode)
    listProbeNodes.mockResolvedValue([localNode, agentNode])

    await networkProbeUseCases.addAgent("Lab", "wss://agent.example")

    expect(listProbeNodes).toHaveBeenCalledTimes(1)
    expect(useNetworkProbeStore.getState().probeNodes).toEqual([localNode, agentNode])
  })

  it("updates a duplicate agent's health result without refreshing other agents", async () => {
    useNetworkProbeStore.setState({ probeNodes: [localNode, { ...agentNode, reachable: false }] })
    addAgent.mockResolvedValue(agentNode)

    await networkProbeUseCases.addAgent("Lab", "wss://agent.example")

    expect(listProbeNodes).not.toHaveBeenCalled()
    expect(useNetworkProbeStore.getState().probeNodes).toEqual([localNode, agentNode])
  })

  it("prevents repeated removal and refresh while an agent removal is pending", async () => {
    useNetworkProbeStore.setState({ probeNodes: [localNode, agentNode, otherAgentNode] })
    const removal = deferred<void>()
    removeAgent.mockReturnValue(removal.promise)

    const firstRemoval = networkProbeUseCases.removeAgent("agent-1")
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(true)

    await networkProbeUseCases.removeAgent("agent-1")
    await networkProbeUseCases.refreshProbeNodes()

    expect(removeAgent).toHaveBeenCalledTimes(1)
    expect(listProbeNodes).not.toHaveBeenCalled()
    expect(useNetworkProbeStore.getState().commandLog).toHaveLength(1)

    removal.resolve()
    await firstRemoval

    expect(listProbeNodes).not.toHaveBeenCalled()
    expect(useNetworkProbeStore.getState().probeNodes).toEqual([localNode, otherAgentNode])
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
  })

  it("releases the busy state and exposes an error when registration fails", async () => {
    addAgent.mockRejectedValue(new Error("agent unavailable"))

    await networkProbeUseCases.addAgent("Lab", "https://agent.example")

    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.agentFailed")
  })

  it("shows a specific error when an agent endpoint targets cloud metadata", async () => {
    addAgent.mockRejectedValue({
      code: "SSRF_BLOCKED",
      message: "Agent endpoint resolves to a cloud metadata service",
    })

    await networkProbeUseCases.addAgent("Lab", "https://agent.example")

    expect(useNetworkProbeStore.getState().error?.key).toBe(
      "networkProbe.errors.agentMetadataBlocked",
    )
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
  })

  it("shows a specific error when the saved agent limit is reached", async () => {
    addAgent.mockRejectedValue({
      code: "AGENT_LIMIT_REACHED",
      message: "Agent registry supports at most 256 entries",
    })

    await networkProbeUseCases.addAgent("Lab", "https://agent.example")

    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.agentLimitReached")
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
  })

  it("surfaces a recoverable message when the saved registry exceeds the safe entry limit", async () => {
    listProbeNodes.mockRejectedValue({
      code: "AGENT_REGISTRY_ENTRY_LIMIT_EXCEEDED",
      message: "Agent registry supports at most 256 entries",
    })

    await networkProbeUseCases.refreshProbeNodes()

    expect(useNetworkProbeStore.getState().error?.key).toBe(
      "networkProbe.errors.agentRegistryLimitExceeded",
    )
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
  })
})
