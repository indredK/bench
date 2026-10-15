import { beforeEach, describe, expect, it, vi } from "vitest"

const { listNetworkServices, openSystemNetworkSettings, openPrivacySecuritySettings } = vi.hoisted(
  () => ({
    listNetworkServices: vi.fn(),
    openSystemNetworkSettings: vi.fn(),
    openPrivacySecuritySettings: vi.fn(),
  }),
)

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    listNetworkServices,
    openSystemNetworkSettings,
    openPrivacySecuritySettings,
  },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  listNetworkServices.mockReset()
  openSystemNetworkSettings.mockReset()
  openPrivacySecuritySettings.mockReset()
  useNetworkProbeStore.setState({
    loadingNetworkServices: false,
    openingSystemNetworkSettings: false,
    openingPrivacySettings: false,
    networkServices: [],
    error: null,
  })
})

describe("network-probe quick-fix service actions", () => {
  it("keeps service loading single-flight and exposes its busy state", async () => {
    const loading = deferred<string[]>()
    listNetworkServices.mockReturnValue(loading.promise)

    const firstLoad = networkProbeUseCases.loadNetworkServices()
    expect(useNetworkProbeStore.getState().loadingNetworkServices).toBe(true)

    await networkProbeUseCases.loadNetworkServices()

    expect(listNetworkServices).toHaveBeenCalledTimes(1)

    loading.resolve(["Wi-Fi"])
    await firstLoad

    expect(useNetworkProbeStore.getState().networkServices).toEqual(["Wi-Fi"])
    expect(useNetworkProbeStore.getState().loadingNetworkServices).toBe(false)
  })

  it("keeps existing services on refresh failure and allows a later retry", async () => {
    useNetworkProbeStore.setState({ networkServices: ["Wi-Fi"] })
    listNetworkServices.mockRejectedValueOnce(new Error("networksetup unavailable"))

    await networkProbeUseCases.loadNetworkServices()

    expect(useNetworkProbeStore.getState().networkServices).toEqual(["Wi-Fi"])
    expect(useNetworkProbeStore.getState().loadingNetworkServices).toBe(false)
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.servicesFailed")

    listNetworkServices.mockResolvedValueOnce(["Ethernet"])
    await networkProbeUseCases.loadNetworkServices()

    expect(useNetworkProbeStore.getState().networkServices).toEqual(["Ethernet"])
    expect(useNetworkProbeStore.getState().error).toBeNull()
  })

  it("does not send duplicate system-settings requests while launch is pending", async () => {
    const opening = deferred<void>()
    openSystemNetworkSettings.mockReturnValue(opening.promise)

    const firstOpen = networkProbeUseCases.openSystemNetworkSettings()
    expect(useNetworkProbeStore.getState().openingSystemNetworkSettings).toBe(true)

    await networkProbeUseCases.openSystemNetworkSettings()

    expect(openSystemNetworkSettings).toHaveBeenCalledTimes(1)

    opening.resolve()
    await firstOpen

    expect(useNetworkProbeStore.getState().openingSystemNetworkSettings).toBe(false)
  })

  it("opens Privacy & Security for local-network permission guidance", async () => {
    const opening = deferred<void>()
    openPrivacySecuritySettings.mockReturnValue(opening.promise)
    const firstOpen = networkProbeUseCases.openLocalNetworkPrivacySettings()
    expect(useNetworkProbeStore.getState().openingPrivacySettings).toBe(true)
    await networkProbeUseCases.openLocalNetworkPrivacySettings()
    expect(openPrivacySecuritySettings).toHaveBeenCalledTimes(1)

    opening.resolve()
    await firstOpen
    expect(useNetworkProbeStore.getState().openingPrivacySettings).toBe(false)
  })

  it("reports Privacy & Security launch failure and restores the action", async () => {
    openPrivacySecuritySettings.mockRejectedValueOnce(new Error("settings unavailable"))

    await networkProbeUseCases.openLocalNetworkPrivacySettings()

    expect(useNetworkProbeStore.getState().openingPrivacySettings).toBe(false)
    expect(useNetworkProbeStore.getState().error?.key).toBe(
      "networkProbe.errors.openSettingsFailed",
    )
  })
})
