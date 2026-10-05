import { beforeEach, describe, expect, it, vi } from "vitest"

const { addAgent, removeAgent, listProbeNodes, listNetworkServices, openSystemNetworkSettings } =
  vi.hoisted(() => ({
    addAgent: vi.fn(),
    removeAgent: vi.fn(),
    listProbeNodes: vi.fn(),
    listNetworkServices: vi.fn(),
    openSystemNetworkSettings: vi.fn(),
  }))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    addAgent,
    removeAgent,
    listProbeNodes,
    listNetworkServices,
    openSystemNetworkSettings,
  },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  addAgent.mockReset()
  removeAgent.mockReset()
  listProbeNodes.mockReset()
  listNetworkServices.mockReset()
  openSystemNetworkSettings.mockReset()
  useNetworkProbeStore.setState({
    agentAction: null,
    loadingNodes: false,
    probeNodes: [],
    commandLog: [],
    error: null,
    errors: [],
    networkServicesLoadState: "idle",
    openingSystemNetworkSettings: false,
    networkServices: [],
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

describe("network-probe service and settings reentry", () => {
  it("coalesces service refreshes while the first request is pending", async () => {
    const result = deferred<string[]>()
    listNetworkServices.mockReturnValue(result.promise)

    const first = networkProbeUseCases.loadNetworkServices()
    expect(useNetworkProbeStore.getState().networkServicesLoadState).toBe("loading")
    await networkProbeUseCases.loadNetworkServices()
    expect(listNetworkServices).toHaveBeenCalledTimes(1)

    result.resolve(["Wi-Fi"])
    await first
    expect(useNetworkProbeStore.getState().networkServices).toEqual(["Wi-Fi"])
    expect(useNetworkProbeStore.getState().networkServicesLoadState).toBe("loaded")
  })

  it("releases the service loading state and reports failures", async () => {
    listNetworkServices.mockRejectedValue(new Error("enumeration failed"))

    await networkProbeUseCases.loadNetworkServices()

    expect(useNetworkProbeStore.getState().networkServicesLoadState).toBe("failed")
    expect(useNetworkProbeStore.getState().error?.key).toBe("networkProbe.errors.servicesFailed")
  })

  it("coalesces settings launches without clearing unrelated errors", async () => {
    const result = deferred<void>()
    const existingError = { key: "networkProbe.errors.pingFailed", fallback: "Ping failed" }
    openSystemNetworkSettings.mockReturnValue(result.promise)
    useNetworkProbeStore.getState().setError(existingError)

    const first = networkProbeUseCases.openSystemNetworkSettings()
    expect(useNetworkProbeStore.getState().openingSystemNetworkSettings).toBe(true)
    await networkProbeUseCases.openSystemNetworkSettings()
    expect(openSystemNetworkSettings).toHaveBeenCalledTimes(1)
    expect(useNetworkProbeStore.getState().error).toBe(existingError)

    result.resolve()
    await first
    expect(useNetworkProbeStore.getState().openingSystemNetworkSettings).toBe(false)
  })

  it("releases the settings launch lock and reports failures", async () => {
    openSystemNetworkSettings.mockRejectedValue(new Error("settings launch failed"))

    await networkProbeUseCases.openSystemNetworkSettings()

    expect(useNetworkProbeStore.getState().openingSystemNetworkSettings).toBe(false)
    expect(useNetworkProbeStore.getState().error?.key).toBe(
      "networkProbe.errors.openSettingsFailed",
    )
  })
})
