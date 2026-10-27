import { beforeEach, describe, expect, it, vi } from "vitest"

const { addAgent, listProbeNodes, removeAgent } = vi.hoisted(() => ({
  addAgent: vi.fn(),
  listProbeNodes: vi.fn(),
  removeAgent: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { addAgent, listProbeNodes, removeAgent },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

beforeEach(() => {
  addAgent.mockReset()
  listProbeNodes.mockReset()
  removeAgent.mockReset()
  useNetworkProbeStore.setState({
    loadingNodes: false,
    agentAction: null,
    errors: [],
  })
})

describe("network-probe agent registry concurrency", () => {
  it("serializes agent writes against refreshes and other writes", async () => {
    let finishAdd: () => void = () => {}
    addAgent.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishAdd = resolve
        }),
    )
    listProbeNodes.mockResolvedValue([])

    const addPromise = networkProbeUseCases.addAgent("Office", "https://agent.example")
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(true)
    expect(useNetworkProbeStore.getState().agentAction).toBe("add")

    await networkProbeUseCases.removeAgent("existing-agent")
    await networkProbeUseCases.refreshProbeNodes()
    expect(removeAgent).not.toHaveBeenCalled()
    expect(listProbeNodes).not.toHaveBeenCalled()

    finishAdd()
    await addPromise

    expect(listProbeNodes).toHaveBeenCalledTimes(1)
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
    expect(useNetworkProbeStore.getState().agentAction).toBeNull()
  })

  it("reports a post-write list refresh failure as stale node data, not a failed write", async () => {
    addAgent.mockResolvedValue(undefined)
    listProbeNodes.mockRejectedValue(new Error("node list unavailable"))

    await networkProbeUseCases.addAgent("Office", "https://agent.example")

    expect(useNetworkProbeStore.getState().errors.map((error) => error.key)).toEqual([
      "networkProbe.errors.nodesFailed",
    ])
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
    expect(useNetworkProbeStore.getState().agentAction).toBeNull()
  })

  it("reports a failed agent write and skips the follow-up list refresh", async () => {
    removeAgent.mockRejectedValue(new Error("agent removal failed"))

    await networkProbeUseCases.removeAgent("existing-agent")

    expect(useNetworkProbeStore.getState().errors.map((error) => error.key)).toEqual([
      "networkProbe.errors.agentFailed",
    ])
    expect(listProbeNodes).not.toHaveBeenCalled()
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
    expect(useNetworkProbeStore.getState().agentAction).toBeNull()
  })
})
