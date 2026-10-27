import { beforeEach, describe, expect, it, vi } from "vitest"

const { getCapabilities, listCapabilityPacks } = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
  listCapabilityPacks: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { getCapabilities, listCapabilityPacks },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe("capability pack refresh", () => {
  beforeEach(() => {
    useNetworkProbeStore.setState(useNetworkProbeStore.getInitialState(), true)
    getCapabilities.mockReset()
    listCapabilityPacks.mockReset()
  })

  it("keeps refresh single-flight until all sources settle after an early failure", async () => {
    const pendingPacks = deferred<never[]>()
    listCapabilityPacks.mockReturnValue(pendingPacks.promise)
    getCapabilities.mockRejectedValue(new Error("capability query failed"))

    const run = networkProbeUseCases.refreshCapabilityPacks()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useNetworkProbeStore.getState().loadingCapabilityPacks).toBe(true)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.packsFailed")
    await networkProbeUseCases.refreshCapabilityPacks()
    expect(listCapabilityPacks).toHaveBeenCalledTimes(1)
    expect(getCapabilities).toHaveBeenCalledTimes(1)

    pendingPacks.resolve([])
    await run

    expect(useNetworkProbeStore.getState().loadingCapabilityPacks).toBe(false)
    expect(useNetworkProbeStore.getState().capabilityPacks).toEqual([])
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.packsFailed")
  })
})
