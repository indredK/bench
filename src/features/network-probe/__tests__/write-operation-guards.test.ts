import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  addAgent,
  listProbeNodes,
  listNetworkServices,
  openSystemNetworkSettings,
  getCapabilities,
  getDefaults,
  listCapabilityPacks,
  removeAgent,
} = vi.hoisted(() => ({
  addAgent: vi.fn(),
  listProbeNodes: vi.fn(),
  listNetworkServices: vi.fn(),
  openSystemNetworkSettings: vi.fn(),
  getCapabilities: vi.fn(),
  getDefaults: vi.fn(),
  listCapabilityPacks: vi.fn(),
  removeAgent: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    addAgent,
    listProbeNodes,
    listNetworkServices,
    openSystemNetworkSettings,
    getCapabilities,
    getDefaults,
    listCapabilityPacks,
    removeAgent,
  },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeEach(() => {
  addAgent.mockReset()
  removeAgent.mockReset()
  listProbeNodes.mockReset().mockResolvedValue([])
  listNetworkServices.mockReset()
  openSystemNetworkSettings.mockReset()
  getCapabilities.mockReset().mockResolvedValue({
    platform: "macos",
    privilegeLevel: "none",
    tools: { multiNode: "supported" },
  })
  getDefaults.mockReset().mockResolvedValue({})
  listCapabilityPacks.mockReset().mockResolvedValue([])
  useNetworkProbeStore.setState({
    networkServices: [],
    networkServicesLoadStatus: "idle",
    loadingSystemSettings: false,
    loadingNodes: false,
    agentMutation: null,
    probeNodes: [],
    probeNodesLoadStatus: "loaded",
    commandLog: [],
    error: null,
  })
})

describe("network-probe write operation guards", () => {
  it("keeps successful bootstrap data when only loading nodes fails", async () => {
    listProbeNodes.mockRejectedValueOnce(new Error("registry unavailable"))

    await networkProbeUseCases.bootstrap()
    const failedState = useNetworkProbeStore.getState()
    expect(failedState.capabilities?.platform).toBe("macos")
    expect(failedState.defaults).toEqual({})
    expect(failedState.probeNodesLoadStatus).toBe("failed")

    listProbeNodes.mockResolvedValueOnce([])
    await networkProbeUseCases.refreshProbeNodes()
    expect(useNetworkProbeStore.getState().probeNodesLoadStatus).toBe("loaded")
  })

  it("treats a successful add as success when the follow-up node refresh fails", async () => {
    const addedNode = {
      id: "agent-1",
      kind: "remote-agent",
      label: "Lab",
      reachable: false,
      endpoint: "https://agent.example/",
    }
    addAgent.mockResolvedValueOnce(addedNode)
    listProbeNodes.mockRejectedValueOnce(new Error("refresh failed"))

    await expect(
      networkProbeUseCases.addAgent("Lab", "https://agent.example/", "test-token"),
    ).resolves.toBe(true)

    const state = useNetworkProbeStore.getState()
    expect(state.probeNodes).toEqual([addedNode])
    expect(state.probeNodesLoadStatus).toBe("failed")
    expect(state.error?.key).toBe("networkProbe.errors.nodesFailed")
  })

  it("keeps a successful remove when the follow-up node refresh fails", async () => {
    removeAgent.mockResolvedValueOnce(undefined)
    listProbeNodes.mockRejectedValueOnce(new Error("refresh failed"))
    useNetworkProbeStore.setState({
      probeNodes: [
        {
          id: "agent-1",
          kind: "remote-agent",
          label: "Lab",
          reachable: true,
          endpoint: "https://agent.example/",
        },
      ],
    })

    await networkProbeUseCases.removeAgent("agent-1")

    const state = useNetworkProbeStore.getState()
    expect(state.probeNodes).toEqual([])
    expect(state.probeNodesLoadStatus).toBe("failed")
    expect(state.error?.key).toBe("networkProbe.errors.nodesFailed")
  })

  it("coalesces repeated network service loads and records failure state", async () => {
    const request = deferred<string[]>()
    listNetworkServices.mockReturnValue(request.promise)

    const first = networkProbeUseCases.loadNetworkServices()
    const second = networkProbeUseCases.loadNetworkServices()
    expect(listNetworkServices).toHaveBeenCalledTimes(1)
    expect(useNetworkProbeStore.getState().networkServicesLoadStatus).toBe("loading")

    request.resolve([])
    await Promise.all([first, second])
    expect(useNetworkProbeStore.getState().networkServicesLoadStatus).toBe("loaded")
    expect(useNetworkProbeStore.getState().networkServices).toEqual([])

    listNetworkServices.mockRejectedValueOnce(new Error("offline"))
    await networkProbeUseCases.loadNetworkServices()
    expect(useNetworkProbeStore.getState().networkServicesLoadStatus).toBe("failed")
  })

  it("opens system settings once until the request settles", async () => {
    const request = deferred<void>()
    openSystemNetworkSettings.mockReturnValue(request.promise)

    const first = networkProbeUseCases.openSystemNetworkSettings()
    const second = networkProbeUseCases.openSystemNetworkSettings()
    expect(openSystemNetworkSettings).toHaveBeenCalledTimes(1)
    expect(useNetworkProbeStore.getState().loadingSystemSettings).toBe(true)

    request.resolve()
    await Promise.all([first, second])
    expect(useNetworkProbeStore.getState().loadingSystemSettings).toBe(false)
  })

  it("prevents duplicate agent adds and never logs the endpoint", async () => {
    const request = deferred<{
      id: string
      kind: string
      label: string
      reachable: boolean
      endpoint: string
    }>()
    addAgent.mockReturnValue(request.promise)

    let first!: Promise<boolean>
    await act(async () => {
      first = networkProbeUseCases.addAgent(
        "lab",
        "https://agent.example/?token=secret",
        "test-token",
      )
      await networkProbeUseCases.addAgent(
        "lab",
        "https://agent.example/?token=secret",
        "test-token",
      )
    })
    expect(addAgent).toHaveBeenCalledTimes(1)
    expect(useNetworkProbeStore.getState().agentMutation).toEqual({ kind: "add" })
    expect(useNetworkProbeStore.getState().commandLog.join("\n")).not.toContain("secret")

    request.resolve({
      id: "agent-1",
      kind: "remote-agent",
      label: "Lab",
      reachable: false,
      endpoint: "https://agent.example/",
    })
    await first
    expect(useNetworkProbeStore.getState().agentMutation).toBeNull()
  })
})
