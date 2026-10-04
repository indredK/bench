import { beforeEach, describe, expect, it, vi } from "vitest"

const { addAgent, removeAgent, listProbeNodes } = vi.hoisted(() => ({
  addAgent: vi.fn(),
  removeAgent: vi.fn(),
  listProbeNodes: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { addAgent, removeAgent, listProbeNodes },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

beforeEach(() => {
  addAgent.mockReset()
  removeAgent.mockReset()
  listProbeNodes.mockReset()
  useNetworkProbeStore.setState({
    agentAction: null,
    loadingNodes: false,
    probeNodes: [],
    commandLog: [],
    error: null,
  })
})

describe("network-probe agent registry reentry", () => {
  it("coalesces repeated add requests while the first request is pending", async () => {
    const addResult = deferred<unknown>()
    addAgent.mockReturnValue(addResult.promise)
    listProbeNodes.mockResolvedValue([])

    const first = networkProbeUseCases.addAgent("Lab", "https://agent.example.test")
    expect(useNetworkProbeStore.getState().agentAction).toEqual({ kind: "add" })

    await networkProbeUseCases.addAgent("Lab", "https://agent.example.test")
    expect(addAgent).toHaveBeenCalledTimes(1)

    addResult.resolve({} as never)
    await first
    expect(useNetworkProbeStore.getState().agentAction).toBeNull()
  })

  it("coalesces repeated remove requests while refreshing the registry", async () => {
    const removeResult = deferred<void>()
    removeAgent.mockReturnValue(removeResult.promise)
    listProbeNodes.mockResolvedValue([])

    const first = networkProbeUseCases.removeAgent("agent-1")
    await networkProbeUseCases.removeAgent("agent-1")
    await networkProbeUseCases.refreshProbeNodes()

    expect(removeAgent).toHaveBeenCalledTimes(1)
    expect(listProbeNodes).not.toHaveBeenCalled()

    removeResult.resolve()
    await first
    expect(listProbeNodes).toHaveBeenCalledTimes(1)
    expect(useNetworkProbeStore.getState().agentAction).toBeNull()
  })

  it("releases the action lock when adding fails", async () => {
    addAgent.mockRejectedValue(new Error("registration failed"))

    await networkProbeUseCases.addAgent("Lab", "https://agent.example.test")

    expect(useNetworkProbeStore.getState().agentAction).toBeNull()
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.agentFailed")
  })
})
