import { beforeEach, describe, expect, it, vi } from "vitest"

const repository = vi.hoisted(() => ({
  listNetworkServices: vi.fn(),
  openSystemNetworkSettings: vi.fn(),
  listProbeNodes: vi.fn(),
  getGlobalpingTokenStatus: vi.fn(),
  setGlobalpingToken: vi.fn(),
  clearGlobalpingToken: vi.fn(),
  getDefaults: vi.fn(),
  listCapabilityPacks: vi.fn(),
  getCapabilities: vi.fn(),
  addAgent: vi.fn(),
  removeAgent: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: repository,
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  Object.values(repository).forEach((mock) => mock.mockReset())
  repository.getGlobalpingTokenStatus.mockResolvedValue({ available: true, configured: false })
  useNetworkProbeStore.setState({
    capabilityPacks: [],
    capabilities: null,
    networkServices: [],
    probeNodes: [],
    loadingServices: false,
    loadingNodes: false,
    openingSystemSettings: false,
    agentMutation: null,
    error: null,
  })
})

describe("network probe action re-entry guards", () => {
  it("shares a bootstrap capability probe with a dialog refresh", async () => {
    const pendingPacks = deferred<Array<{ id: string }>>()
    const pendingCapabilities = deferred<{ platform: string; tools: Record<string, string> }>()
    repository.listCapabilityPacks.mockReturnValueOnce(pendingPacks.promise)
    repository.getCapabilities.mockReturnValueOnce(pendingCapabilities.promise)
    repository.getDefaults.mockResolvedValueOnce({})
    repository.listProbeNodes.mockResolvedValueOnce([])

    const bootstrap = networkProbeUseCases.bootstrap()
    const refresh = networkProbeUseCases.refreshCapabilityPacks()

    expect(repository.listCapabilityPacks).toHaveBeenCalledOnce()
    expect(repository.getCapabilities).toHaveBeenCalledOnce()

    const packs = [{ id: "pcap-diag" }]
    const capabilities = { platform: "macos", tools: { pcap: "missing_pack" } }
    pendingPacks.resolve(packs)
    pendingCapabilities.resolve(capabilities)
    await Promise.all([bootstrap, refresh])

    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual(packs)
    expect(useNetworkProbeStore.getState().capabilities).toEqual(capabilities)
  })

  it("single-flights capability pack refreshes and allows a later refresh", async () => {
    const pendingPacks = deferred<Array<{ id: string }>>()
    const pendingCapabilities = deferred<{ platform: string; tools: Record<string, string> }>()
    repository.listCapabilityPacks.mockReturnValueOnce(pendingPacks.promise)
    repository.getCapabilities.mockReturnValueOnce(pendingCapabilities.promise)

    const first = networkProbeUseCases.refreshCapabilityPacks()
    const second = networkProbeUseCases.refreshCapabilityPacks()

    expect(repository.listCapabilityPacks).toHaveBeenCalledOnce()
    expect(repository.getCapabilities).toHaveBeenCalledOnce()

    const packs = [{ id: "pcap-diag" }]
    const capabilities = { platform: "macos", tools: { pcap: "missing_pack" } }
    pendingPacks.resolve(packs)
    pendingCapabilities.resolve(capabilities)
    await Promise.all([first, second])

    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual(packs)
    expect(useNetworkProbeStore.getState().capabilities).toEqual(capabilities)

    repository.listCapabilityPacks.mockResolvedValueOnce([{ id: "adv-scanner" }])
    repository.getCapabilities.mockResolvedValueOnce({
      platform: "macos",
      tools: { portScan: "degraded" },
    })
    await networkProbeUseCases.refreshCapabilityPacks()

    expect(repository.listCapabilityPacks).toHaveBeenCalledTimes(2)
    expect(repository.getCapabilities).toHaveBeenCalledTimes(2)
    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual([{ id: "adv-scanner" }])
  })

  it("releases the capability refresh flight after a failed read", async () => {
    repository.listCapabilityPacks.mockRejectedValueOnce(new Error("pack manifest unavailable"))
    repository.getCapabilities.mockResolvedValueOnce({ platform: "macos", tools: {} })

    await networkProbeUseCases.refreshCapabilityPacks()

    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.packsFailed")

    repository.listCapabilityPacks.mockResolvedValueOnce([{ id: "pcap-diag" }])
    repository.getCapabilities.mockResolvedValueOnce({
      platform: "macos",
      tools: { pcap: "degraded" },
    })
    await networkProbeUseCases.refreshCapabilityPacks()

    expect(repository.listCapabilityPacks).toHaveBeenCalledTimes(2)
    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual([{ id: "pcap-diag" }])
    expect(useNetworkProbeStore.getState().error).toBeNull()
  })

  it("deduplicates network-service loads and unlocks after failure", async () => {
    const pending = deferred<string[]>()
    repository.listNetworkServices.mockReturnValueOnce(pending.promise)

    const first = networkProbeUseCases.loadNetworkServices()
    expect(useNetworkProbeStore.getState().loadingServices).toBe(true)
    await networkProbeUseCases.loadNetworkServices()
    expect(repository.listNetworkServices).toHaveBeenCalledOnce()

    pending.reject(new Error("service query failed"))
    await first
    expect(useNetworkProbeStore.getState().loadingServices).toBe(false)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.servicesFailed")

    repository.listNetworkServices.mockResolvedValueOnce(["Wi-Fi"])
    await networkProbeUseCases.loadNetworkServices()
    expect(repository.listNetworkServices).toHaveBeenCalledTimes(2)
    expect(useNetworkProbeStore.getState().networkServices).toEqual(["Wi-Fi"])
  })

  it("deduplicates opening System Settings and unlocks after completion", async () => {
    const pending = deferred<void>()
    repository.openSystemNetworkSettings.mockReturnValueOnce(pending.promise)

    const first = networkProbeUseCases.openSystemNetworkSettings()
    expect(useNetworkProbeStore.getState().openingSystemSettings).toBe(true)
    await networkProbeUseCases.openSystemNetworkSettings()
    expect(repository.openSystemNetworkSettings).toHaveBeenCalledOnce()

    pending.resolve()
    await first
    expect(useNetworkProbeStore.getState().openingSystemSettings).toBe(false)
  })

  it("serializes agent registration with node refresh and removal", async () => {
    const pending = deferred<void>()
    repository.addAgent.mockReturnValueOnce(pending.promise)
    repository.listProbeNodes.mockResolvedValueOnce([
      { id: "agent-1", label: "Home", kind: "remote-agent" },
    ])

    const first = networkProbeUseCases.addAgent("Home", "https://agent.example")
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(true)
    expect(useNetworkProbeStore.getState().agentMutation).toEqual({ action: "add" })

    await Promise.all([
      networkProbeUseCases.addAgent("Home", "https://agent.example"),
      networkProbeUseCases.removeAgent("agent-1"),
      networkProbeUseCases.refreshProbeNodes(),
    ])
    expect(repository.addAgent).toHaveBeenCalledOnce()
    expect(repository.removeAgent).not.toHaveBeenCalled()
    expect(repository.listProbeNodes).not.toHaveBeenCalled()

    pending.resolve()
    await first
    expect(repository.listProbeNodes).toHaveBeenCalledOnce()
    expect(useNetworkProbeStore.getState().probeNodes).toEqual([
      { id: "agent-1", label: "Home", kind: "remote-agent" },
    ])
    expect(useNetworkProbeStore.getState().agentMutation).toBeNull()
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
  })

  it("clears the agent mutation lock when a write fails", async () => {
    repository.removeAgent.mockRejectedValueOnce(new Error("agent store unavailable"))

    await networkProbeUseCases.removeAgent("agent-1")

    expect(useNetworkProbeStore.getState().agentMutation).toBeNull()
    expect(useNetworkProbeStore.getState().loadingNodes).toBe(false)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.agentFailed")
  })
})
