import { beforeEach, describe, expect, it, vi } from "vitest"

const { addAgent, removeAgent, listProbeNodes, getCapabilities, getDefaults, listCapabilityPacks } =
  vi.hoisted(() => ({
    addAgent: vi.fn(),
    removeAgent: vi.fn(),
    listProbeNodes: vi.fn(),
    getCapabilities: vi.fn(),
    getDefaults: vi.fn(),
    listCapabilityPacks: vi.fn(),
  }))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    addAgent,
    removeAgent,
    listProbeNodes,
    getCapabilities,
    getDefaults,
    listCapabilityPacks,
  },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type { ProbeNode } from "@/lib/tauri/types/network-probe"

function agent(id: string, reachable = true): ProbeNode {
  return {
    id,
    kind: "remote-agent",
    label: id,
    reachable,
    endpoint: `wss://${id}.example/health`,
    capabilities: ["dns", "ping", "http"],
  }
}

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
  getCapabilities.mockReset().mockResolvedValue(null)
  getDefaults.mockReset().mockResolvedValue(null)
  listCapabilityPacks.mockReset().mockResolvedValue([])
  listProbeNodes.mockResolvedValue([])
  useNetworkProbeStore.setState({
    probeNodes: [],
    probeNodesLoadError: null,
    probeNodesRevision: 0,
    agentMutation: null,
    loadingNodes: false,
    commandLog: [],
    error: null,
  })
})

describe("network-probe Agent registry mutations", () => {
  it("keeps successful local bootstrap data when the Agent registry cannot be read", async () => {
    const capabilities = { privilegeLevel: "user", tools: { ping: "supported" } }
    const defaults = { dnsPresets: ["1.1.1.1"] }
    const packs = [{ id: "adv-scanner" }]
    useNetworkProbeStore.setState({
      capabilities: null,
      defaults: null,
      capabilityPacks: [],
      probeNodes: [],
    })
    getCapabilities.mockResolvedValueOnce(capabilities)
    getDefaults.mockResolvedValueOnce(defaults)
    listCapabilityPacks.mockResolvedValueOnce(packs)
    listProbeNodes.mockRejectedValueOnce(new Error("agent registry unreadable"))

    await networkProbeUseCases.bootstrap()

    const state = useNetworkProbeStore.getState()
    expect(state.capabilities).toBe(capabilities)
    expect(state.defaults).toBe(defaults)
    expect(state.capabilityPacks).toBe(packs)
    expect(state.error?.key).toBe("networkProbe.errors.bootstrapFailed")
    expect(state.probeNodesLoadError).toBe("agent registry unreadable")
    expect(state.loadingNodes).toBe(false)
  })

  it("serializes add/remove against refresh and keeps returned health state", async () => {
    const pendingAdd = deferred<ProbeNode>()
    addAgent.mockReturnValueOnce(pendingAdd.promise)

    const firstAdd = networkProbeUseCases.addAgent("primary", "wss://primary.example/health")
    expect(useNetworkProbeStore.getState().agentMutation).toEqual({ kind: "add" })
    await expect(
      networkProbeUseCases.addAgent("second", "https://second.example"),
    ).resolves.toBeNull()
    await networkProbeUseCases.refreshProbeNodes()

    expect(listProbeNodes).not.toHaveBeenCalled()
    pendingAdd.resolve(agent("primary", false))
    await expect(firstAdd).resolves.toMatchObject({ id: "primary", reachable: false })
    expect(useNetworkProbeStore.getState().probeNodes).toEqual([agent("primary", false)])
    expect(useNetworkProbeStore.getState().agentMutation).toBeNull()
  })

  it("does not let an older bootstrap response overwrite a newly added agent", async () => {
    const pendingList = deferred<ProbeNode[]>()
    listProbeNodes.mockReturnValueOnce(pendingList.promise)
    const bootstrap = networkProbeUseCases.bootstrap()

    addAgent.mockResolvedValueOnce(agent("new-agent"))
    await networkProbeUseCases.addAgent("new-agent", "https://new-agent.example")
    pendingList.resolve([agent("stale-agent")])
    await bootstrap

    expect(useNetworkProbeStore.getState().probeNodes.map(({ id }) => id)).toEqual(["new-agent"])
  })

  it("removes locally after success without a second, race-prone list request", async () => {
    removeAgent.mockResolvedValueOnce(undefined)
    useNetworkProbeStore.setState({ probeNodes: [agent("old-agent")] })

    await expect(networkProbeUseCases.removeAgent("old-agent")).resolves.toBe(true)

    expect(listProbeNodes).not.toHaveBeenCalled()
    expect(useNetworkProbeStore.getState().probeNodes).toEqual([])
  })

  it("exposes node refresh failures without replacing the current registry as empty", async () => {
    const existing = agent("existing-agent")
    useNetworkProbeStore.setState({
      probeNodes: [existing],
      probeNodesLoadError: null,
    })
    listProbeNodes.mockRejectedValueOnce(new Error("registry locked"))

    await networkProbeUseCases.refreshProbeNodes()

    const state = useNetworkProbeStore.getState()
    expect(state.probeNodes).toEqual([existing])
    expect(state.probeNodesLoadError).toBe("registry locked")
    expect(state.loadingNodes).toBe(false)
    expect(state.error?.key).toBe("networkProbe.errors.nodesFailed")
  })
})
