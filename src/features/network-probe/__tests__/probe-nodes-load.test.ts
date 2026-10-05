import { beforeEach, describe, expect, it, vi } from "vitest"

const { listProbeNodes, listCapabilityPacks, getCapabilities, getDefaults } = vi.hoisted(() => ({
  listProbeNodes: vi.fn(),
  listCapabilityPacks: vi.fn(),
  getCapabilities: vi.fn(),
  getDefaults: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    listProbeNodes,
    listCapabilityPacks,
    getCapabilities,
    getDefaults,
  },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type {
  NetworkProbeCapabilities,
  NetworkProbeDefaultsCatalog,
  ProbeNode,
} from "@/lib/tauri/types/network-probe"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const nodes: ProbeNode[] = [{ id: "local", kind: "local", label: "This Mac", reachable: true }]
const capabilities: NetworkProbeCapabilities = {
  platform: "macos",
  privilegeLevel: "user",
  tools: { multiNode: "supported" },
}
const defaults: NetworkProbeDefaultsCatalog = {
  schemaVersion: 1,
  dnsPresets: [],
  reachTargets: [],
  captiveProbes: [],
  publicIpApis: [],
  sitePacks: {},
  mtuTargets: [],
}

beforeEach(() => {
  listProbeNodes.mockReset()
  listCapabilityPacks.mockReset()
  getCapabilities.mockReset()
  getDefaults.mockReset()
  listCapabilityPacks.mockResolvedValue([])
  getCapabilities.mockResolvedValue(capabilities)
  getDefaults.mockResolvedValue(defaults)
  useNetworkProbeStore.setState({
    capabilities: null,
    capabilityPacks: [],
    loadingCapabilityPacks: false,
    loadingNodes: false,
    probeNodes: [],
    error: null,
  })
})

describe("probe node snapshot loading", () => {
  it("coalesces concurrent refreshes and exposes loading until the list is stored", async () => {
    const result = deferred<ProbeNode[]>()
    listProbeNodes.mockReturnValue(result.promise)

    const first = networkProbeUseCases.refreshProbeNodes()
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(true)

    await networkProbeUseCases.refreshProbeNodes()
    expect(listProbeNodes).toHaveBeenCalledTimes(1)

    result.resolve(nodes)
    await first

    expect(useNetworkProbeStore.getState().probeNodes).toEqual(nodes)
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
  })

  it("does not let bootstrap overwrite a newer node refresh", async () => {
    const initialNodes = deferred<ProbeNode[]>()
    const delayedDefaults = deferred<NetworkProbeDefaultsCatalog>()
    listProbeNodes.mockReturnValueOnce(initialNodes.promise)
    getDefaults.mockReturnValue(delayedDefaults.promise)

    const bootstrap = networkProbeUseCases.bootstrap()
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(true)
    await vi.waitFor(() => expect(listProbeNodes).toHaveBeenCalledTimes(1))

    await networkProbeUseCases.refreshProbeNodes()
    expect(listProbeNodes).toHaveBeenCalledTimes(1)

    initialNodes.resolve(nodes)
    await vi.waitFor(() => expect(useNetworkProbeStore.getState().loadingNodes).toBe(false))
    expect(useNetworkProbeStore.getState().probeNodes).toEqual(nodes)

    const newerNodes = [{ ...nodes[0]!, id: "newer-local", label: "Latest" }]
    listProbeNodes.mockReset().mockResolvedValueOnce(newerNodes)
    await networkProbeUseCases.refreshProbeNodes()

    delayedDefaults.resolve(defaults)
    await bootstrap

    expect(useNetworkProbeStore.getState().probeNodes).toEqual(newerNodes)
  })

  it("preserves the last good list on failure and allows retry", async () => {
    useNetworkProbeStore.setState({ probeNodes: nodes })
    listProbeNodes.mockRejectedValueOnce(new Error("node list unavailable"))

    await networkProbeUseCases.refreshProbeNodes()

    expect(useNetworkProbeStore.getState().probeNodes).toEqual(nodes)
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.nodesFailed")

    const refreshedNodes = [{ ...nodes[0]!, id: "refreshed-local" }]
    listProbeNodes.mockResolvedValueOnce(refreshedNodes)
    await networkProbeUseCases.refreshProbeNodes()

    expect(useNetworkProbeStore.getState().probeNodes).toEqual(refreshedNodes)
    expect(useNetworkProbeStore.getState().error).toBeNull()
  })
})
