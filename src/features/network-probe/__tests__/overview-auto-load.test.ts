import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getCapabilities,
  getDefaults,
  listCapabilityPacks,
  listProbeNodes,
  addAgent,
  removeAgent,
  resetDefaults,
  getLocalNetworkSummary,
  getFirewallStatus,
  checkHostsOverrides,
} = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
  getDefaults: vi.fn(),
  listCapabilityPacks: vi.fn(),
  listProbeNodes: vi.fn(),
  addAgent: vi.fn(),
  removeAgent: vi.fn(),
  resetDefaults: vi.fn(),
  getLocalNetworkSummary: vi.fn(),
  getFirewallStatus: vi.fn(),
  checkHostsOverrides: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    getCapabilities,
    getDefaults,
    listCapabilityPacks,
    listProbeNodes,
    addAgent,
    removeAgent,
    resetDefaults,
    getLocalNetworkSummary,
    getFirewallStatus,
    checkHostsOverrides,
  },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe("network-probe overview auto-load", () => {
  beforeEach(() => {
    useNetworkProbeStore.setState(useNetworkProbeStore.getInitialState(), true)
    getCapabilities.mockReset()
    getDefaults.mockReset().mockResolvedValue(null)
    listCapabilityPacks.mockReset().mockResolvedValue([])
    listProbeNodes.mockReset().mockResolvedValue([])
    addAgent.mockReset()
    removeAgent.mockReset()
    resetDefaults.mockReset().mockResolvedValue(undefined)
    getLocalNetworkSummary.mockReset()
    getFirewallStatus.mockReset().mockResolvedValue({ status: "on" })
    checkHostsOverrides.mockReset().mockResolvedValue([])
  })

  it("attempts automatic loading once across panel remounts and leaves retry to the user", async () => {
    const summary = {
      interfaces: [],
      primaryIpv4: "192.0.2.10",
      primaryIpv6: null,
      gateway: "192.0.2.1",
      dnsServers: ["192.0.2.1"],
    }
    getLocalNetworkSummary
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(summary)

    await networkProbeUseCases.autoLoadOverview()
    expect(getLocalNetworkSummary).toHaveBeenCalledTimes(1)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.overviewFailed")

    // Re-mounting the panel or an effect replay must not trigger another automatic attempt.
    await Promise.all([
      networkProbeUseCases.autoLoadOverview(),
      networkProbeUseCases.autoLoadOverview(),
    ])
    expect(getLocalNetworkSummary).toHaveBeenCalledTimes(1)

    // An explicit user refresh remains available and can recover from the failure.
    await networkProbeUseCases.refreshOverview()
    expect(getLocalNetworkSummary).toHaveBeenCalledTimes(2)
    expect(useNetworkProbeStore.getState().summary).toEqual(summary)
    expect(useNetworkProbeStore.getState().error).toBeNull()
  })

  it("keeps overview refresh single-flight until every request settles after an early failure", async () => {
    const pendingSummary = deferred<{
      interfaces: never[]
      primaryIpv4: string | null
      primaryIpv6: string | null
      gateway: string | null
      dnsServers: string[]
    }>()
    const pendingHosts = deferred<never[]>()
    getLocalNetworkSummary.mockReturnValue(pendingSummary.promise)
    getFirewallStatus.mockRejectedValue(new Error("firewall query failed"))
    checkHostsOverrides.mockReturnValue(pendingHosts.promise)

    const run = networkProbeUseCases.refreshOverview()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useNetworkProbeStore.getState().loadingSummary).toBe(true)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.overviewFailed")
    await networkProbeUseCases.refreshOverview()
    expect(getLocalNetworkSummary).toHaveBeenCalledTimes(1)
    expect(getFirewallStatus).toHaveBeenCalledTimes(1)
    expect(checkHostsOverrides).toHaveBeenCalledTimes(1)

    pendingSummary.resolve({
      interfaces: [],
      primaryIpv4: null,
      primaryIpv6: null,
      gateway: null,
      dnsServers: [],
    })
    pendingHosts.resolve([])
    await run

    expect(useNetworkProbeStore.getState().loadingSummary).toBe(false)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.overviewFailed")
  })

  it("single-flights bootstrap, preserves successful sources, and retries failures", async () => {
    const capabilities = {
      platform: "macos",
      privilegeLevel: "user",
      tools: {},
      packs: {},
      externalTools: {},
    }
    const nodes = [{ id: "local", kind: "local", label: "Local", reachable: true }]
    const pack = {
      id: "pcap-diag",
      version: "1.0.0",
      sizeBytes: 1,
      status: "available",
      descriptionKey: "networkProbe.packs.pcapDiag",
      artifactReady: true,
    }
    getCapabilities.mockResolvedValue(capabilities)
    listProbeNodes.mockResolvedValue(nodes)
    listCapabilityPacks
      .mockRejectedValueOnce(new Error("registry unavailable"))
      .mockResolvedValueOnce([pack])

    const firstAttempt = networkProbeUseCases.bootstrap()
    const duplicateAttempt = networkProbeUseCases.bootstrap()
    expect(getCapabilities).toHaveBeenCalledTimes(1)
    expect(listCapabilityPacks).toHaveBeenCalledTimes(1)
    expect(useNetworkProbeStore.getState().loadingBootstrap).toBe(true)

    await Promise.all([firstAttempt, duplicateAttempt])
    expect(useNetworkProbeStore.getState().loadingBootstrap).toBe(false)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.bootstrapFailed")
    expect(useNetworkProbeStore.getState().capabilities).toEqual(capabilities)
    expect(useNetworkProbeStore.getState().probeNodes).toEqual(nodes)
    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual([])

    await networkProbeUseCases.bootstrap()
    expect(listCapabilityPacks).toHaveBeenCalledTimes(2)
    expect(useNetworkProbeStore.getState().capabilities).toEqual(capabilities)
    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual([pack])
    expect(useNetworkProbeStore.getState().error).toBeNull()
  })

  it("uses the agent registry recovery message when bootstrap cannot safely load saved agents", async () => {
    getCapabilities.mockResolvedValue({
      platform: "macos",
      privilegeLevel: "user",
      tools: {},
      packs: {},
      externalTools: {},
    })
    listProbeNodes.mockRejectedValue({
      code: "AGENT_REGISTRY_TOO_LARGE",
      message: "Agent registry exceeds the 1 MiB storage limit",
    })

    await networkProbeUseCases.bootstrap()

    expect(useNetworkProbeStore.getState().error?.key).toBe(
      "networkProbe.errors.agentRegistryTooLarge",
    )
    expect(useNetworkProbeStore.getState().loadingBootstrap).toBe(false)

    listProbeNodes.mockResolvedValue([])
    await networkProbeUseCases.bootstrap()
    expect(useNetworkProbeStore.getState().error).toBeNull()
  })

  it("does not let a stale bootstrap node snapshot overwrite a completed agent registration", async () => {
    let resolveStaleNodes: (
      nodes: Array<{ id: string; kind: string; label: string; reachable: boolean }>,
    ) => void = () => {}
    const staleNodes = new Promise<
      Array<{ id: string; kind: string; label: string; reachable: boolean }>
    >((resolve) => {
      resolveStaleNodes = resolve
    })
    const localNode = { id: "local", kind: "local", label: "Local", reachable: true }
    const addedNode = {
      id: "agent-1",
      kind: "remote-agent",
      label: "Lab",
      endpoint: "https://agent.example",
      reachable: true,
    }
    const currentNodes = [localNode, addedNode]
    getCapabilities.mockResolvedValue({
      platform: "macos",
      privilegeLevel: "user",
      tools: {},
      packs: {},
      externalTools: {},
    })
    listProbeNodes.mockReturnValueOnce(staleNodes).mockResolvedValueOnce(currentNodes)
    addAgent.mockResolvedValue(addedNode)

    const bootstrap = networkProbeUseCases.bootstrap()
    await networkProbeUseCases.addAgent("Lab", "https://agent.example")
    resolveStaleNodes([localNode])
    await bootstrap

    expect(useNetworkProbeStore.getState().probeNodes).toEqual(currentNodes)
  })

  it("does not let a slow bootstrap overwrite a newer capability pack snapshot", async () => {
    const oldCapabilities = deferred<{
      platform: string
      privilegeLevel: string
      tools: Record<string, string>
      packs: Record<string, string>
      externalTools: Record<string, boolean>
    }>()
    const oldPacks = deferred<never[]>()
    const freshCapabilities = {
      platform: "macos",
      privilegeLevel: "user",
      tools: { pathMtu: "supported" },
      packs: { "pcap-diag": "available" },
      externalTools: {},
    }
    const freshPacks = [
      {
        id: "pcap-diag",
        version: "2.0.0",
        sizeBytes: 2,
        status: "available",
        descriptionKey: "networkProbe.packs.pcapDiag",
        artifactReady: true,
      },
    ]
    getCapabilities
      .mockReturnValueOnce(oldCapabilities.promise)
      .mockResolvedValue(freshCapabilities)
    listCapabilityPacks.mockReturnValueOnce(oldPacks.promise).mockResolvedValue(freshPacks)

    const bootstrap = networkProbeUseCases.bootstrap()
    await networkProbeUseCases.refreshCapabilityPacks()

    oldCapabilities.resolve({
      platform: "macos",
      privilegeLevel: "user",
      tools: {},
      packs: {},
      externalTools: {},
    })
    oldPacks.resolve([])
    await bootstrap

    const state = useNetworkProbeStore.getState()
    expect(state.capabilities?.tools.pathMtu).toBe("supported")
    expect(state.capabilityPacks).toEqual(freshPacks)
  })

  it("does not let a stale bootstrap overwrite snapshots after a failed manual refresh", async () => {
    const previousCapabilities = {
      platform: "macos",
      privilegeLevel: "user",
      tools: { dns: "supported" },
      packs: {},
      externalTools: {},
    }
    const previousPacks = [
      {
        id: "previous",
        version: "1.0.0",
        sizeBytes: 1,
        status: "installed",
        descriptionKey: "networkProbe.packs.pcapDiag",
        artifactReady: true,
      },
    ]
    const staleCapabilities = deferred<{
      platform: string
      privilegeLevel: string
      tools: Record<string, string>
      packs: Record<string, string>
      externalTools: Record<string, boolean>
    }>()
    const stalePacks = deferred<never[]>()
    useNetworkProbeStore.setState({
      capabilities: previousCapabilities,
      capabilityPacks: previousPacks,
    })
    getCapabilities
      .mockReturnValueOnce(staleCapabilities.promise)
      .mockRejectedValueOnce(new Error("manual refresh failed"))
    listCapabilityPacks.mockReturnValueOnce(stalePacks.promise).mockResolvedValueOnce([])

    const bootstrap = networkProbeUseCases.bootstrap()
    await networkProbeUseCases.refreshCapabilityPacks()
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.packsFailed")

    staleCapabilities.resolve({
      platform: "macos",
      privilegeLevel: "user",
      tools: {},
      packs: {},
      externalTools: {},
    })
    stalePacks.resolve([])
    await bootstrap

    const state = useNetworkProbeStore.getState()
    expect(state.capabilities).toEqual(previousCapabilities)
    expect(state.capabilityPacks).toEqual(previousPacks)
    expect(state.error?.key).toBe("networkProbe.errors.packsFailed")
  })

  it("does not let a slow bootstrap overwrite defaults after reset completes", async () => {
    const staleDefaults = deferred<{
      schemaVersion: number
      dnsPresets: never[]
      reachTargets: never[]
      captiveProbes: never[]
      publicIpApis: never[]
      sitePacks: Record<string, never[]>
      mtuTargets: never[]
    }>()
    const defaultsBeforeReset = {
      schemaVersion: 1,
      dnsPresets: [],
      reachTargets: [],
      captiveProbes: [],
      publicIpApis: [],
      sitePacks: { official: [] },
      mtuTargets: [],
    }
    const defaultsAfterReset = {
      ...defaultsBeforeReset,
      sitePacks: { official: [{ id: "restored", target: "https://example.com", channel: "http" }] },
    }
    getDefaults.mockReturnValueOnce(staleDefaults.promise).mockResolvedValueOnce(defaultsAfterReset)

    const bootstrap = networkProbeUseCases.bootstrap()
    await networkProbeUseCases.resetDefaults()
    staleDefaults.resolve(defaultsBeforeReset)
    await bootstrap

    expect(useNetworkProbeStore.getState().defaults).toEqual(defaultsAfterReset)
  })
})
