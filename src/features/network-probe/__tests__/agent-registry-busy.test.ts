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
    const registration = deferred<void>()
    addAgent.mockReturnValue(registration.promise)
    listProbeNodes.mockResolvedValue([])

    const firstAdd = networkProbeUseCases.addAgent("Lab", "https://agent.example")
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(true)

    await networkProbeUseCases.addAgent("Lab", "https://agent.example")

    expect(addAgent).toHaveBeenCalledTimes(1)
    expect(listProbeNodes).not.toHaveBeenCalled()
    expect(useNetworkProbeStore.getState().commandLog).toHaveLength(1)

    registration.resolve()
    await firstAdd

    expect(listProbeNodes).toHaveBeenCalledTimes(1)
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
  })

  it("prevents repeated removal and refresh while an agent removal is pending", async () => {
    const removal = deferred<void>()
    removeAgent.mockReturnValue(removal.promise)
    listProbeNodes.mockResolvedValue([])

    const firstRemoval = networkProbeUseCases.removeAgent("agent-1")
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(true)

    await networkProbeUseCases.removeAgent("agent-1")
    await networkProbeUseCases.refreshProbeNodes()

    expect(removeAgent).toHaveBeenCalledTimes(1)
    expect(listProbeNodes).not.toHaveBeenCalled()
    expect(useNetworkProbeStore.getState().commandLog).toHaveLength(1)

    removal.resolve()
    await firstRemoval

    expect(listProbeNodes).toHaveBeenCalledTimes(1)
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
  })

  it("releases the busy state and exposes an error when registration fails", async () => {
    addAgent.mockRejectedValue(new Error("agent unavailable"))

    await networkProbeUseCases.addAgent("Lab", "https://agent.example")

    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.agentFailed")
  })
})
