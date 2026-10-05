import { beforeEach, describe, expect, it, vi } from "vitest"

const { listCapabilityPacks, getCapabilities, getDefaults, listProbeNodes } = vi.hoisted(() => ({
  listCapabilityPacks: vi.fn(),
  getCapabilities: vi.fn(),
  getDefaults: vi.fn(),
  listProbeNodes: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { listCapabilityPacks, getCapabilities, getDefaults, listProbeNodes },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type { CapabilityPackInfo, NetworkProbeCapabilities } from "@/lib/tauri/types/network-probe"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const packs: CapabilityPackInfo[] = [
  {
    id: "adv-scanner",
    version: "1.0.0",
    sizeBytes: 1024,
    status: "available",
    descriptionKey: "networkProbe.packs.desc.advScanner",
    artifactReady: false,
  },
]
const capabilities: NetworkProbeCapabilities = {
  platform: "macos",
  privilegeLevel: "user",
  tools: { portScan: "missing_pack" },
}

beforeEach(() => {
  listCapabilityPacks.mockReset()
  getCapabilities.mockReset()
  getDefaults.mockReset()
  listProbeNodes.mockReset()
  getDefaults.mockResolvedValue(null)
  listProbeNodes.mockResolvedValue([])
  useNetworkProbeStore.setState({
    capabilities: null,
    capabilityPacks: [],
    loadingCapabilityPacks: false,
    error: null,
  })
})

describe("capability pack refresh", () => {
  it("coalesces concurrent refreshes and stores a consistent snapshot", async () => {
    const packsResult = deferred<CapabilityPackInfo[]>()
    const capabilitiesResult = deferred<NetworkProbeCapabilities>()
    listCapabilityPacks.mockReturnValue(packsResult.promise)
    getCapabilities.mockReturnValue(capabilitiesResult.promise)

    const first = networkProbeUseCases.refreshCapabilityPacks()
    expect(useNetworkProbeStore.getState().loadingCapabilityPacks).toBe(true)

    await networkProbeUseCases.refreshCapabilityPacks()
    expect(listCapabilityPacks).toHaveBeenCalledTimes(1)
    expect(getCapabilities).toHaveBeenCalledTimes(1)

    packsResult.resolve(packs)
    await Promise.resolve()
    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual([])
    expect(useNetworkProbeStore.getState().loadingCapabilityPacks).toBe(true)
    capabilitiesResult.resolve(capabilities)
    await first

    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual(packs)
    expect(useNetworkProbeStore.getState().capabilities).toEqual(capabilities)
    expect(useNetworkProbeStore.getState().loadingCapabilityPacks).toBe(false)
  })

  it("preserves the last good snapshot on failure and allows retry", async () => {
    const previousPacks = [{ ...packs[0]!, id: "previous-pack" }]
    const previousCapabilities = { ...capabilities, tools: { portScan: "supported" } }
    useNetworkProbeStore.setState({
      capabilityPacks: previousPacks,
      capabilities: previousCapabilities,
    })
    listCapabilityPacks.mockRejectedValueOnce(new Error("pack list unavailable"))
    getCapabilities.mockResolvedValue(capabilities)

    await networkProbeUseCases.refreshCapabilityPacks()

    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual(previousPacks)
    expect(useNetworkProbeStore.getState().capabilities).toEqual(previousCapabilities)
    expect(useNetworkProbeStore.getState().loadingCapabilityPacks).toBe(false)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.packsFailed")

    listCapabilityPacks.mockResolvedValueOnce(packs)
    await networkProbeUseCases.refreshCapabilityPacks()

    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual(packs)
    expect(useNetworkProbeStore.getState().capabilities).toEqual(capabilities)
    expect(useNetworkProbeStore.getState().error).toBeNull()
  })

  it("commits the bootstrap snapshot before unrelated bootstrap requests can finish", async () => {
    const firstPacks = deferred<CapabilityPackInfo[]>()
    const firstCapabilities = deferred<NetworkProbeCapabilities>()
    const defaultsResult = deferred<null>()
    listCapabilityPacks.mockReturnValueOnce(firstPacks.promise)
    getCapabilities.mockReturnValueOnce(firstCapabilities.promise)
    getDefaults.mockReturnValue(defaultsResult.promise)
    listProbeNodes.mockResolvedValue([])

    const bootstrap = networkProbeUseCases.bootstrap()
    expect(useNetworkProbeStore.getState().loadingCapabilityPacks).toBe(true)

    firstPacks.resolve(packs)
    firstCapabilities.resolve(capabilities)
    await vi.waitFor(() => {
      expect(useNetworkProbeStore.getState().loadingCapabilityPacks).toBe(false)
    })
    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual(packs)
    expect(useNetworkProbeStore.getState().capabilities).toEqual(capabilities)

    const newerPacks = [{ ...packs[0]!, id: "newer-pack" }]
    listCapabilityPacks.mockReset().mockResolvedValueOnce(newerPacks)
    getCapabilities.mockReset().mockResolvedValueOnce({
      ...capabilities,
      tools: { portScan: "degraded" },
    })
    const refresh = networkProbeUseCases.refreshCapabilityPacks()
    await refresh

    defaultsResult.resolve(null)
    await bootstrap

    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual(newerPacks)
    expect(useNetworkProbeStore.getState().capabilities?.tools.portScan).toBe("degraded")
  })
})
