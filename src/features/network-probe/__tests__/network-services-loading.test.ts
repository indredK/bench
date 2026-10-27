import { beforeEach, describe, expect, it, vi } from "vitest"

const { listNetworkServices } = vi.hoisted(() => ({
  listNetworkServices: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { listNetworkServices },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

beforeEach(() => {
  listNetworkServices.mockReset()
  useNetworkProbeStore.setState({
    loadingServices: false,
    networkServices: [],
    errors: [],
  })
})

describe("network service loading state", () => {
  it("deduplicates overlapping service-list loads and resets loading on success", async () => {
    let resolveServices: (services: string[]) => void = () => {}
    listNetworkServices.mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          resolveServices = resolve
        }),
    )

    const firstLoad = networkProbeUseCases.loadNetworkServices()
    expect(useNetworkProbeStore.getState().loadingServices).toBe(true)

    await networkProbeUseCases.loadNetworkServices()
    expect(listNetworkServices).toHaveBeenCalledTimes(1)

    resolveServices(["Wi-Fi"])
    await firstLoad
    expect(useNetworkProbeStore.getState().networkServices).toEqual(["Wi-Fi"])
    expect(useNetworkProbeStore.getState().loadingServices).toBe(false)
  })

  it("shows a localized failure and resets loading after a rejected read", async () => {
    listNetworkServices.mockRejectedValue(new Error("permission denied"))

    await networkProbeUseCases.loadNetworkServices()

    expect(useNetworkProbeStore.getState().errors.map((error) => error.key)).toEqual([
      "networkProbe.errors.servicesFailed",
    ])
    expect(useNetworkProbeStore.getState().loadingServices).toBe(false)
  })
})
